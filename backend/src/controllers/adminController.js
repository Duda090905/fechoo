/**
 * US25 - Painel do administrador.
 *
 *   - fila de disputas, com as evidencias das duas partes, o chat, as fotos
 *     do pedido e o historico do servico;
 *   - decisao (devolver, liberar ou dividir) com justificativa, que gera o
 *     estorno ou a transferencia no gateway;
 *   - suspensao preventiva de prestador (sai da busca e nao recebe pedidos);
 *   - relatorio do periodo;
 *   - registro de cada decisao com autor, data e justificativa.
 *
 * Todas as rotas exigem o perfil administrador (apenasPerfil no routes).
 */
const { Op, fn, col } = require('sequelize');
const {
  Disputa, Servico, Usuario, Prestador, Categoria, Bairro, Mensagem, HistoricoServico, Pagamento,
  AcaoAdministrador, PropostaComplementar
} = require('../models');
const disputas = require('../servicos/disputas');
const { metricaDosPrestadores } = require('../servicos/complementar');
const { GatewayErro } = require('../servicos/gateway');
const { caminhoArquivoServico } = require('../servicos/armazenamento');
const { emReais } = require('../servicos/taxa');
const {
  montarServico, montarMensagem, arquivoDoServico, inteiroPositivo, blocosSprint5
} = require('./servicoController');

const JUSTIFICATIVA_MINIMA = 10;
const JUSTIFICATIVA_MAXIMA = 1000;
const HORA_MS = 60 * 60 * 1000;

const INCLUDE_SERVICO = {
  model: Servico,
  as: 'servico',
  include: [
    { model: Usuario, as: 'contratante', attributes: ['id', 'nome', 'email'] },
    {
      model: Prestador, as: 'prestador', attributes: ['id', 'usuario_id', 'foto_url', 'status', 'nota_media', 'total_avaliacoes', 'verificado'],
      include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nome', 'email'] }]
    },
    { model: Bairro, as: 'bairro', attributes: ['id', 'nome'] },
    { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] }
  ]
};

function lerTexto(valor) {
  return String(valor || '').replace(/\s+/g, ' ').trim();
}

function dinheiro(valor) {
  return emReais(valor || 0);
}

// Periodo opcional ?de=AAAA-MM-DD&ate=AAAA-MM-DD, no horario de Brasilia.
function lerPeriodo(query) {
  const formato = /^\d{4}-\d{2}-\d{2}$/;
  const de = query.de ? String(query.de) : '';
  const ate = query.ate ? String(query.ate) : '';
  if ((de && !formato.test(de)) || (ate && !formato.test(ate))) return { erro: 'Use datas no formato AAAA-MM-DD.' };
  const inicio = de ? new Date(`${de}T00:00:00-03:00`) : null;
  const fim = ate ? new Date(`${ate}T23:59:59.999-03:00`) : null;
  if ((inicio && Number.isNaN(inicio.getTime())) || (fim && Number.isNaN(fim.getTime()))) return { erro: 'Data inválida.' };
  if (inicio && fim && inicio > fim) return { erro: 'A data inicial precisa ser antes da final.' };
  return { inicio, fim, de: de || null, ate: ate || null };
}

function noPeriodo(campo, { inicio, fim }) {
  if (!inicio && !fim) return {};
  const cond = {};
  if (inicio) cond[Op.gte] = inicio;
  if (fim) cond[Op.lte] = fim;
  return { [campo]: cond };
}

async function cartaoDaFila(disputa, agora = new Date()) {
  const s = disputa.servico;
  const congelado = await disputas.valorCongelado(s.id);
  const prazoDecisao = disputas.prazoDecisao(disputa);
  return {
    id: disputa.id,
    status: disputa.status,
    aberta_em: disputa.aberta_em,
    prazo_defesa: disputas.prazoDefesa(disputa),
    prazo_decisao: prazoDecisao,
    atrasada: disputa.status === 'aberta' && agora > prazoDecisao,
    tem_defesa: Boolean(disputa.defesa_em),
    evidencias: disputa.evidencias.length + disputa.defesa_evidencias.length,
    justificativa: disputa.justificativa,
    decisao: disputa.decisao,
    valor_congelado: congelado,
    servico: {
      id: s.id,
      descricao: s.descricao,
      categoria: s.categoria ? s.categoria.nome : null,
      bairro: s.bairro ? s.bairro.nome : null,
      status_anterior: disputa.status_servico_anterior
    },
    contratante: s.contratante ? { id: s.contratante.id, nome: s.contratante.nome } : null,
    prestador: s.prestador ? { id: s.prestador.id, nome: s.prestador.usuario ? s.prestador.usuario.nome : null, status: s.prestador.status } : null
  };
}

// GET /admin/disputas?status=aberta|decidida|todas  (padrao: aberta)
async function fila(req, res, next) {
  try {
    const status = ['aberta', 'decidida', 'todas'].includes(req.query.status) ? req.query.status : 'aberta';
    const where = status === 'todas' ? {} : { status };
    const lista = await Disputa.findAll({
      where,
      include: [INCLUDE_SERVICO],
      // Fila: a mais antiga primeiro (e a que vence antes).
      order: status === 'decidida' ? [['decidido_em', 'DESC']] : [['aberta_em', 'ASC']]
    });
    const agora = new Date();
    const cartoes = [];
    for (const d of lista) cartoes.push(await cartaoDaFila(d, agora));
    return res.json({ disputas: cartoes });
  } catch (e) {
    return next(e);
  }
}

async function carregarDisputa(req, res) {
  const id = inteiroPositivo(req.params.id);
  const disputa = id && await Disputa.findByPk(id, {
    include: [INCLUDE_SERVICO, { model: Usuario, as: 'decidido_por', attributes: ['id', 'nome'] }]
  });
  if (!disputa) {
    res.status(404).json({ erro: 'Disputa não encontrada.' });
    return null;
  }
  return disputa;
}

// Ficha de cada parte: o que ajuda a decidir (reputacao e historico).
async function fichaDoPrestador(prestador) {
  const [disputasPerdidas, totalDisputas, metrica, cancelamentos] = await Promise.all([
    Disputa.count({
      where: { status: 'decidida', decisao: { [Op.in]: ['devolver', 'dividir'] } },
      include: [{ model: Servico, as: 'servico', attributes: [], where: { id_prestador: prestador.id }, required: true }]
    }),
    Disputa.count({ include: [{ model: Servico, as: 'servico', attributes: [], where: { id_prestador: prestador.id }, required: true }] }),
    metricaDosPrestadores([prestador.id]),
    Servico.count({ where: { cancelado_por_id: prestador.usuario_id } })
  ]);
  return {
    id: prestador.id,
    nome: prestador.usuario ? prestador.usuario.nome : null,
    email: prestador.usuario ? prestador.usuario.email : null,
    status: prestador.status,
    verificado: Boolean(prestador.verificado),
    nota_media: prestador.nota_media === null ? null : Number(prestador.nota_media),
    total_avaliacoes: prestador.total_avaliacoes || 0,
    disputas: totalDisputas,
    disputas_com_devolucao: disputasPerdidas,
    cancelamentos,
    complementares: metrica.get(prestador.id)
  };
}

// GET /admin/disputas/:id - tudo o que o administrador precisa para decidir.
async function detalhe(req, res, next) {
  try {
    const disputa = await carregarDisputa(req, res);
    if (!disputa) return undefined;
    const s = disputa.servico;
    const [mensagens, historico, pagamentos, contratanteDisputas] = await Promise.all([
      Mensagem.findAll({
        where: { servico_id: s.id }, include: [{ model: Usuario, as: 'autor', attributes: ['id', 'nome'] }], order: [['id', 'ASC']]
      }),
      HistoricoServico.findAll({
        where: { servico_id: s.id }, include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nome'] }], order: [['id', 'ASC']]
      }),
      Pagamento.unscoped().findAll({ where: { servico_id: s.id }, order: [['id', 'ASC']] }),
      Disputa.count({ where: { aberta_por_id: s.id_contratante } })
    ]);
    const principal = pagamentos.filter((p) => p.tipo !== 'complementar').pop() || null;
    const servico = montarServico(s, 'administrador', { pagamento: principal });
    Object.assign(servico, await blocosSprint5(s, 'administrador'));
    const decisao = disputas.podeDecidir(disputa);
    return res.json({
      disputa: {
        ...(await cartaoDaFila(disputa)),
        evidencias: disputa.evidencias,
        defesa: disputa.defesa,
        defesa_evidencias: disputa.defesa_evidencias,
        defesa_em: disputa.defesa_em,
        decisao: disputa.decisao
          ? {
            tipo: disputa.decisao,
            percentual_contratante: disputa.percentual_contratante,
            valor_contratante: dinheiro(disputa.valor_contratante),
            valor_prestador: dinheiro(disputa.valor_prestador),
            justificativa: disputa.justificativa_decisao,
            por: disputa.decidido_por ? disputa.decidido_por.nome : null,
            em: disputa.decidido_em
          }
          : null,
        pode_decidir: decisao.pode,
        motivo_para_esperar: decisao.pode ? null : decisao.motivo
      },
      servico,
      pagamentos: pagamentos.map((p) => ({
        id: p.id,
        tipo: p.tipo,
        status: p.status,
        valor: dinheiro(p.valor),
        retido_em: p.retido_em,
        valor_estorno: p.valor_estorno === null ? null : dinheiro(p.valor_estorno),
        valor_repasse: p.valor_repasse === null ? null : dinheiro(p.valor_repasse),
        taxa: p.taxa_valor === null ? null : dinheiro(p.taxa_valor),
        repasse_pendente: p.repasse_pendente
      })),
      mensagens: mensagens.map((m) => {
        const montada = montarMensagem(m, null);
        montada.de = m.autor_id === s.id_contratante ? 'contratante' : 'prestador';
        return montada;
      }),
      historico: historico.map((h) => ({
        acao: h.acao, detalhe: h.detalhe, status_novo: h.status_novo, quem: h.usuario ? h.usuario.nome : 'Fechô', em: h.registrado_em
      })),
      partes: {
        contratante: s.contratante
          ? {
            id: s.contratante.id,
            nome: s.contratante.nome,
            email: s.contratante.email,
            disputas_abertas: contratanteDisputas,
            cancelamentos: await Servico.count({ where: { cancelado_por_id: s.contratante.id } })
          }
          : null,
        prestador: s.prestador ? await fichaDoPrestador(s.prestador) : null
      }
    });
  } catch (e) {
    return next(e);
  }
}

// GET /admin/disputas/:id/arquivos/:nome - fotos e imagens do servico.
async function arquivo(req, res, next) {
  try {
    const disputa = await carregarDisputa(req, res);
    if (!disputa) return undefined;
    const { nome } = req.params;
    const caminho = caminhoArquivoServico(nome);
    if (!caminho || !(await arquivoDoServico(disputa.servico, nome))) {
      return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    }
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, max-age=3600');
    return res.sendFile(caminho, (erro) => {
      if (erro && !res.headersSent) res.status(404).json({ erro: 'Arquivo não encontrado.' });
    });
  } catch (e) {
    return next(e);
  }
}

// POST /admin/disputas/:id/decisao { decisao, justificativa, percentual_contratante }
async function decidir(req, res, next) {
  try {
    const disputa = await carregarDisputa(req, res);
    if (!disputa) return undefined;
    const decisao = String(req.body.decisao || '');
    if (!Disputa.DECISOES.includes(decisao)) {
      return res.status(400).json({ erro: 'Escolha a decisão: devolver, liberar ou dividir.' });
    }
    const justificativa = lerTexto(req.body.justificativa);
    if (justificativa.length < JUSTIFICATIVA_MINIMA) {
      return res.status(400).json({ erro: 'Escreva a justificativa da decisão (pelo menos 10 caracteres).' });
    }
    if (justificativa.length > JUSTIFICATIVA_MAXIMA) {
      return res.status(400).json({ erro: `A justificativa pode ter no máximo ${JUSTIFICATIVA_MAXIMA} caracteres.` });
    }
    let percentual = null;
    if (decisao === 'dividir') {
      percentual = Number(req.body.percentual_contratante);
      if (!Number.isInteger(percentual) || percentual < 1 || percentual > 99) {
        return res.status(400).json({ erro: 'Na divisão, informe quanto volta ao cliente: um número inteiro de 1 a 99 (%).' });
      }
    }
    const pode = disputas.podeDecidir(disputa);
    if (!pode.pode) return res.status(409).json({ erro: pode.motivo });

    // Troca atomica: dois administradores decidindo ao mesmo tempo nao geram
    // dois estornos.
    const [travou] = await Disputa.update({ status: 'decidida' }, { where: { id: disputa.id, status: 'aberta' } });
    if (!travou) return res.status(409).json({ erro: 'Esta disputa acabou de ser decidida por outra pessoa.' });

    let resultado;
    try {
      resultado = await disputas.decidir(disputa, {
        administradorId: req.usuario.id, decisao, percentualContratante: percentual, justificativa
      });
    } catch (e) {
      await Disputa.update({ status: 'aberta' }, { where: { id: disputa.id } });
      if (e instanceof GatewayErro) {
        console.error('[admin] o banco recusou o movimento da decisao:', e.detalhe || e.message);
        return res.status(502).json({ erro: 'O banco não conseguiu fazer o movimento agora. A disputa continua aberta. Tente de novo em alguns minutos.' });
      }
      throw e;
    }
    return res.json({
      mensagem: 'Decisão registrada. As duas partes foram avisadas.',
      decisao: {
        tipo: decisao,
        percentual_contratante: resultado.disputa.percentual_contratante,
        valor_contratante: resultado.valor_contratante,
        valor_prestador: resultado.valor_prestador,
        repasse_pendente: resultado.repasse_pendente
      }
    });
  } catch (e) {
    return next(e);
  }
}

// GET /admin/prestadores?busca=&status=  - para a suspensao preventiva.
async function prestadores(req, res, next) {
  try {
    const busca = lerTexto(req.query.busca);
    const where = {};
    if (['ativo', 'pausado', 'suspenso'].includes(req.query.status)) where.status = req.query.status;
    const lista = await Prestador.findAll({
      where,
      include: [{
        model: Usuario,
        as: 'usuario',
        attributes: ['id', 'nome', 'email', 'status'],
        where: { status: { [Op.ne]: 'excluido' }, ...(busca ? { [Op.or]: [{ nome: { [Op.like]: `%${busca}%` } }, { email: { [Op.like]: `%${busca}%` } }] } : {}) },
        required: true
      }],
      order: [['id', 'ASC']],
      limit: 100
    });
    const ids = lista.map((p) => p.id);
    const [metricas, disputasPorPrestador] = await Promise.all([
      metricaDosPrestadores(ids),
      Disputa.findAll({
        attributes: [[col('servico.id_prestador'), 'id_prestador'], [fn('COUNT', col('Disputa.id')), 'total']],
        include: [{ model: Servico, as: 'servico', attributes: [], where: { id_prestador: ids.length ? ids : [0] }, required: true }],
        group: [col('servico.id_prestador')],
        raw: true
      })
    ]);
    const disputasMapa = new Map(disputasPorPrestador.map((l) => [Number(l.id_prestador), Number(l.total)]));
    return res.json({
      prestadores: lista.map((p) => ({
        id: p.id,
        nome: p.usuario.nome,
        email: p.usuario.email,
        status: p.status,
        suspenso_em: p.suspenso_em,
        motivo_suspensao: p.motivo_suspensao,
        nota_media: p.nota_media === null ? null : Number(p.nota_media),
        total_avaliacoes: p.total_avaliacoes || 0,
        verificado: Boolean(p.verificado),
        disputas: disputasMapa.get(p.id) || 0,
        complementares: metricas.get(p.id)
      }))
    });
  } catch (e) {
    return next(e);
  }
}

// PATCH /admin/prestadores/:id/suspensao { suspender: true|false, justificativa }
async function suspensao(req, res, next) {
  try {
    const id = inteiroPositivo(req.params.id);
    if (!id) return res.status(404).json({ erro: 'Profissional não encontrado.' });
    if (typeof req.body.suspender !== 'boolean') {
      return res.status(400).json({ erro: 'Informe se é para suspender ou reativar.' });
    }
    const justificativa = lerTexto(req.body.justificativa);
    if (justificativa.length < JUSTIFICATIVA_MINIMA) {
      return res.status(400).json({ erro: 'Escreva a justificativa (pelo menos 10 caracteres).' });
    }
    if (justificativa.length > 300) {
      return res.status(400).json({ erro: 'A justificativa pode ter no máximo 300 caracteres.' });
    }
    const r = await disputas.suspender(id, { administradorId: req.usuario.id, suspender: req.body.suspender, justificativa });
    if (r.erro) return res.status(r.status).json({ erro: r.erro });
    return res.json({
      mensagem: req.body.suspender
        ? 'Profissional suspenso. Ele saiu das buscas e não recebe pedidos novos.'
        : 'Suspensão retirada. O profissional voltou às buscas.',
      prestador: { id: r.prestador.id, status: r.prestador.status, suspenso_em: r.prestador.suspenso_em }
    });
  } catch (e) {
    return next(e);
  }
}

// GET /admin/acoes - registro das decisoes (autor, data, justificativa).
async function acoes(req, res, next) {
  try {
    const lista = await AcaoAdministrador.findAll({
      include: [{ model: Usuario, as: 'administrador', attributes: ['id', 'nome'] }],
      order: [['id', 'DESC']],
      limit: 200
    });
    return res.json({
      acoes: lista.map((a) => ({
        id: a.id,
        acao: a.acao,
        alvo_tipo: a.alvo_tipo,
        alvo_id: a.alvo_id,
        justificativa: a.justificativa,
        detalhe: a.detalhe,
        por: a.administrador ? a.administrador.nome : null,
        em: a.registrado_em
      }))
    });
  } catch (e) {
    return next(e);
  }
}

// GET /admin/relatorio?de=&ate= - numeros do periodo (padrao: tudo).
async function relatorio(req, res, next) {
  try {
    const periodo = lerPeriodo(req.query);
    if (periodo.erro) return res.status(400).json({ erro: periodo.erro });

    const [abertasPeriodo, decididasPeriodo, abertasAgora, atrasadas, liberados, suspensos, servicosPorStatus, complementares] = await Promise.all([
      Disputa.count({ where: noPeriodo('aberta_em', periodo) }),
      Disputa.findAll({ where: { status: 'decidida', ...noPeriodo('decidido_em', periodo) } }),
      Disputa.findAll({ where: { status: 'aberta' }, attributes: ['servico_id'] }),
      disputas.disputasAtrasadas(),
      Pagamento.unscoped().findAll({ where: { status: 'liberado', ...noPeriodo('liberado_em', periodo) } }),
      Prestador.count({ where: { status: 'suspenso' } }),
      Servico.findAll({
        attributes: ['status', [fn('COUNT', col('id')), 'total']], where: noPeriodo('createdAt', periodo), group: ['status'], raw: true
      }),
      PropostaComplementar.findAll({ where: noPeriodo('enviada_em', periodo), attributes: ['status'] })
    ]);

    const porDecisao = { devolver: 0, liberar: 0, dividir: 0 };
    let devolvido = 0;
    let liberadoDisputa = 0;
    let horas = 0;
    for (const d of decididasPeriodo) {
      porDecisao[d.decisao] += 1;
      devolvido += Number(d.valor_contratante || 0);
      liberadoDisputa += Number(d.valor_prestador || 0);
      horas += (new Date(d.decidido_em) - new Date(d.aberta_em)) / HORA_MS;
    }
    let congelado = 0;
    for (const d of abertasAgora) congelado += await disputas.valorCongelado(d.servico_id);

    const somar = (lista, campo) => emReais(lista.reduce((t, p) => t + Number(p[campo] || 0), 0));
    const statusMapa = Object.fromEntries(servicosPorStatus.map((l) => [l.status, Number(l.total)]));
    const totalServicos = Object.values(statusMapa).reduce((t, n) => t + n, 0);
    const complementarPorStatus = complementares.reduce((m, p) => ({ ...m, [p.status]: (m[p.status] || 0) + 1 }), {});

    return res.json({
      periodo: { de: periodo.de, ate: periodo.ate },
      disputas: {
        abertas_no_periodo: abertasPeriodo,
        decididas_no_periodo: decididasPeriodo.length,
        por_decisao: porDecisao,
        tempo_medio_decisao_horas: decididasPeriodo.length ? Math.round(horas / decididasPeriodo.length) : null,
        valor_devolvido: emReais(devolvido),
        valor_liberado: emReais(liberadoDisputa),
        aguardando_decisao: abertasAgora.length,
        valor_congelado_agora: emReais(congelado),
        atrasadas
      },
      servicos: {
        total: totalServicos,
        por_status: statusMapa,
        taxa_de_disputa: totalServicos ? Math.round((abertasPeriodo / totalServicos) * 1000) / 10 : 0
      },
      dinheiro: {
        repasses: liberados.length,
        volume_liberado: somar(liberados, 'valor'),
        taxas_arrecadadas: somar(liberados, 'taxa_valor'),
        liquido_aos_profissionais: somar(liberados, 'valor_repasse')
      },
      complementares: { total: complementares.length, por_status: complementarPorStatus },
      prestadores_suspensos: suspensos
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  fila, detalhe, arquivo, decidir, prestadores, suspensao, acoes, relatorio, lerPeriodo, noPeriodo
};
