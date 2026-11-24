/**
 * US23 - Abertura de disputa. US25 - decisao do administrador.
 *
 * Abertura (so o contratante):
 *   - com o servico Em execucao, ou Concluido pelo prestador em ate 72 horas
 *     (o mesmo prazo da confirmacao, CONFIRMACAO_HORAS; depois dele o
 *     servico ja foi confirmado e o dinheiro liberado);
 *   - com justificativa e evidencias (fotos; o chat do servico tambem vale
 *     como evidencia e fica disponivel para o administrador);
 *   - o servico vai para Em disputa e o valor fica congelado: a rotina de
 *     confirmacao automatica so olha servicos Concluidos, o cancelamento e
 *     bloqueado e nenhuma das partes tem como liberar ou devolver sozinha.
 *
 * Defesa: o prestador e avisado na hora e responde com texto e fotos.
 *
 * Decisao (so o administrador, com justificativa), sobre todo o dinheiro
 * congelado do servico (o original e, se houver, o complementar da US19):
 *   devolver - estorno integral ao contratante
 *   liberar  - repasse ao prestador, ja sem a taxa (como na conclusao)
 *   dividir  - X% de volta ao contratante e o resto ao prestador, sem taxa
 *              (como na multa de cancelamento)
 * O administrador decide depois da defesa ou, sem defesa, depois de 48 horas.
 */
const { Op } = require('sequelize');
const { Disputa, Pagamento, Servico, AcaoAdministrador, Prestador, Usuario } = require('../models');
const { enviarAvisoServico } = require('../utils/email');
const gateway = require('./gateway');
const { horasParaConfirmar, carregarPrestador, transferir, repassarPagamento, percentualDoServico, dinheiro } = require('./repasse');
const { encerrarProposta } = require('./complementar');
const { encerrarSeVencida, emAberto } = require('./cobrancas');
const { registrar } = require('./historico');
const { avisar } = require('./avisos');
const { emReais } = require('./taxa');

const HORA_MS = 60 * 60 * 1000;
const DEFESA_HORAS = 48;
const DECISAO_DIAS = 7;
const TEXTO_MINIMO = 10;
const TEXTO_MAXIMO = 1000;

const STATUS_ABRE = ['em_execucao', 'concluido'];

function prazoParaAbrir(servico) {
  if (servico.status !== 'concluido' || !servico.concluido_em) return null;
  return new Date(new Date(servico.concluido_em).getTime() + horasParaConfirmar() * HORA_MS);
}

/** Pode abrir agora? Devolve null ou o motivo (texto para a pessoa). */
function motivoParaNaoAbrir(servico, agora = new Date()) {
  if (servico.status === 'em_disputa' || servico.status === 'resolvido') return 'Este serviço já tem uma disputa.';
  if (!STATUS_ABRE.includes(servico.status)) {
    return 'A disputa pode ser aberta com o serviço em andamento ou em até 72 horas depois de concluído.';
  }
  const prazo = prazoParaAbrir(servico);
  if (prazo && agora > prazo) {
    return 'O prazo para abrir disputa acabou: ele vai até 72 horas depois de o profissional marcar o serviço como concluído.';
  }
  return null;
}

function prazoDefesa(disputa) {
  return new Date(new Date(disputa.aberta_em).getTime() + DEFESA_HORAS * HORA_MS);
}

function prazoDecisao(disputa) {
  return new Date(new Date(disputa.aberta_em).getTime() + DECISAO_DIAS * 24 * HORA_MS);
}

function podeDecidir(disputa, agora = new Date()) {
  if (disputa.status !== 'aberta') return { pode: false, motivo: 'Esta disputa já foi decidida.' };
  if (!disputa.defesa_em && agora < prazoDefesa(disputa)) {
    return { pode: false, motivo: 'O profissional ainda está no prazo para se defender (48 horas desde a abertura).' };
  }
  return { pode: true };
}

// Dinheiro congelado do servico: o original e o complementar.
async function pagamentosRetidos(servicoId) {
  return Pagamento.unscoped().findAll({ where: { servico_id: servicoId, status: 'retido' }, order: [['id', 'ASC']] });
}

async function valorCongelado(servicoId) {
  const retidos = await pagamentosRetidos(servicoId);
  return emReais(retidos.reduce((t, p) => t + Number(p.valor), 0));
}

/** US23 - abre a disputa. Devolve { erro, status } ou { disputa }. */
async function abrir(servico, { usuarioId, justificativa, evidencias, agora = new Date() }) {
  const motivo = motivoParaNaoAbrir(servico, agora);
  if (motivo) return { erro: motivo, status: 409 };
  const statusAnterior = servico.status;

  // A troca de status e atomica: clique repetido ou a confirmacao automatica
  // chegando no mesmo instante nao abrem duas disputas.
  const [alterados] = await Servico.update(
    { status: 'em_disputa' },
    { where: { id: servico.id, status: statusAnterior } }
  );
  if (!alterados) return { erro: 'Este serviço mudou de situação agora há pouco. Atualize a página.', status: 409 };

  const disputa = await Disputa.create({
    servico_id: servico.id,
    aberta_por_id: usuarioId,
    status_servico_anterior: statusAnterior,
    justificativa,
    evidencias
  });
  if (!servico.encerrado_em) await Servico.update({ encerrado_em: agora }, { where: { id: servico.id } });
  // US19 - proposta complementar sem pagamento deixa de valer.
  await encerrarProposta(servico.id, agora);

  await registrar(servico.id, {
    usuarioId, acao: 'disputa_aberta', de: statusAnterior, para: 'em_disputa',
    detalhe: `Motivo: ${justificativa}`
  });
  const prestador = await carregarPrestador(servico.id_prestador);
  const congelado = await valorCongelado(servico.id);
  await avisar({
    usuarioId: prestador.usuario_id,
    servicoId: servico.id,
    tipo: 'disputa_aberta',
    titulo: 'O cliente abriu uma disputa',
    texto: `O cliente abriu uma disputa sobre este serviço. Os ${dinheiro(congelado)} continuam congelados até a decisão. `
      + `Envie a sua versão, com fotos se tiver, em até ${DEFESA_HORAS} horas.`
  });
  await avisar({
    usuarioId,
    servicoId: servico.id,
    tipo: 'disputa_aberta',
    titulo: 'Disputa aberta',
    texto: `Recebemos a sua disputa. O pagamento segue congelado. O profissional tem ${DEFESA_HORAS} horas para responder `
      + `e a decisão sai em até ${DECISAO_DIAS} dias.`,
    email: false
  });
  return { disputa };
}

/** US23 - defesa do prestador (uma vez). */
async function defender(disputa, servico, { usuarioId, defesa, evidencias, agora = new Date() }) {
  if (disputa.status !== 'aberta') return { erro: 'Esta disputa já foi decidida.', status: 409 };
  if (disputa.defesa_em) return { erro: 'Você já enviou a sua defesa.', status: 409 };
  disputa.defesa = defesa;
  disputa.defesa_evidencias = evidencias;
  disputa.defesa_em = agora;
  await disputa.save();
  await registrar(servico.id, { usuarioId, acao: 'disputa_defesa', detalhe: `Defesa: ${defesa}` });
  await avisar({
    usuarioId: servico.id_contratante,
    servicoId: servico.id,
    tipo: 'disputa_defesa',
    titulo: 'O profissional respondeu à disputa',
    texto: 'A defesa do profissional foi registrada. Agora o Fechô analisa as evidências das duas partes e decide.'
  });
  return { disputa };
}

/**
 * Divide o valor de um pagamento entre as partes (dividir), ou devolve tudo.
 * O estorno sai primeiro; a parte do prestador vai inteira (sem taxa).
 */
async function devolverParte(pagamento, servico, prestador, percentualContratante, agora) {
  const total = Number(pagamento.valor);
  const paraContratante = emReais(total * percentualContratante / 100);
  const paraPrestador = emReais(total - paraContratante);
  if (paraContratante > 0) {
    const { estorno_id: estornoId } = await gateway.estornarCobranca(
      pagamento.cobranca_id,
      { valor: paraContratante, descricao: `Fechô - decisão da disputa do serviço ${servico.id}` },
      pagamento.gateway
    );
    pagamento.estorno_id = estornoId;
  }
  pagamento.status = 'estornado';
  pagamento.valor_estorno = paraContratante;
  pagamento.estornado_em = agora;
  pagamento.taxa_percentual = 0;
  pagamento.taxa_valor = 0;
  pagamento.valor_repasse = paraPrestador;
  await pagamento.save();
  if (paraPrestador > 0) {
    const r = await transferir(pagamento, prestador, paraPrestador, `Fechô - serviço ${servico.id} (disputa)`);
    if (r.pendente) pagamento.repasse_pendente = r.pendente;
    else {
      pagamento.repasse_id = r.id;
      pagamento.liberado_em = agora;
    }
    await pagamento.save();
  }
  return { paraContratante, paraPrestador };
}

/**
 * US25 - decide a disputa. Gera o estorno ou a transferencia no gateway.
 * Se o banco recusar o estorno, a excecao sobe e a disputa continua aberta.
 */
async function decidir(disputa, { administradorId, decisao, percentualContratante, justificativa, agora = new Date() }) {
  const servico = await Servico.findByPk(disputa.servico_id);
  const prestador = await carregarPrestador(servico.id_prestador);
  const retidos = await pagamentosRetidos(servico.id);
  // Pix complementar gerado e nao pago deixa de valer.
  const abertos = await Pagamento.unscoped().findAll({ where: { servico_id: servico.id, status: 'aguardando' } });
  for (const p of abertos) {
    if (emAberto(p, agora)) {
      p.expira_em = agora;
      await encerrarSeVencida(p, agora);
    }
  }

  const percentual = decisao === 'devolver' ? 100 : decisao === 'liberar' ? 0 : percentualContratante;
  let valorContratante = 0;
  let valorPrestador = 0;
  let pendente = false;

  if (decisao === 'liberar') {
    const taxaServico = await percentualDoServico(servico, retidos);
    for (const pagamento of retidos) {
      const r = await repassarPagamento(pagamento, servico, prestador, taxaServico, agora);
      if (r !== 'pago') pendente = true;
      valorPrestador += Number(pagamento.valor_repasse);
    }
  } else {
    for (const pagamento of retidos) {
      const r = await devolverParte(pagamento, servico, prestador, percentual, agora);
      valorContratante += r.paraContratante;
      valorPrestador += r.paraPrestador;
      if (pagamento.repasse_pendente) pendente = true;
    }
  }
  valorContratante = emReais(valorContratante);
  valorPrestador = emReais(valorPrestador);

  disputa.status = 'decidida';
  disputa.decisao = decisao;
  disputa.percentual_contratante = percentual;
  disputa.valor_contratante = valorContratante;
  disputa.valor_prestador = valorPrestador;
  disputa.justificativa_decisao = justificativa;
  disputa.decidido_por_id = administradorId;
  disputa.decidido_em = agora;
  await disputa.save();

  servico.status = 'resolvido';
  await servico.save();

  const textos = {
    devolver: `Valor devolvido ao cliente (${dinheiro(valorContratante)})`,
    liberar: `Valor liberado ao profissional (${dinheiro(valorPrestador)}, já sem a taxa)`,
    dividir: `Dividido: ${percentual}% ao cliente (${dinheiro(valorContratante)}) e ${100 - percentual}% ao profissional (${dinheiro(valorPrestador)})`
  };
  await registrar(servico.id, {
    usuarioId: administradorId, acao: 'disputa_decidida', de: 'em_disputa', para: 'resolvido',
    detalhe: `${textos[decisao]}. Justificativa: ${justificativa}`
  });
  await AcaoAdministrador.create({
    administrador_id: administradorId,
    acao: 'decisao_disputa',
    alvo_tipo: 'disputa',
    alvo_id: disputa.id,
    justificativa,
    detalhe: `Serviço ${servico.id}: ${textos[decisao]}`
  });

  const recado = `Decisão: ${textos[decisao]}. Justificativa: ${justificativa}`;
  await avisar({
    usuarioId: servico.id_contratante, servicoId: servico.id, tipo: 'disputa_decidida', titulo: 'A disputa foi decidida', texto: recado
  });
  await avisar({
    usuarioId: prestador.usuario_id, servicoId: servico.id, tipo: 'disputa_decidida', titulo: 'A disputa foi decidida',
    texto: recado + (pendente && valorPrestador > 0 ? ' A sua parte sai assim que a chave Pix estiver conferida.' : '')
  });
  return { disputa, valor_contratante: valorContratante, valor_prestador: valorPrestador, repasse_pendente: pendente };
}

/** US25 - suspensao preventiva e reativacao do prestador. */
async function suspender(prestadorId, { administradorId, suspender: suspenderAgora, justificativa, agora = new Date() }) {
  const prestador = await Prestador.findByPk(prestadorId);
  if (!prestador) return { erro: 'Profissional não encontrado.', status: 404 };
  if (suspenderAgora && prestador.status === 'suspenso') return { erro: 'Este profissional já está suspenso.', status: 409 };
  if (!suspenderAgora && prestador.status !== 'suspenso') return { erro: 'Este profissional não está suspenso.', status: 409 };

  if (suspenderAgora) {
    if (prestador.status === 'pausado') {
      const { encerrarPausa } = require('./pausas');
      await encerrarPausa(prestador);
      prestador.pausado_em = null;
    }
    prestador.status = 'suspenso';
    prestador.suspenso_em = agora;
    prestador.motivo_suspensao = String(justificativa).slice(0, 300);
  } else {
    prestador.status = 'ativo';
    prestador.suspenso_em = null;
    prestador.motivo_suspensao = null;
  }
  await prestador.save();
  await AcaoAdministrador.create({
    administrador_id: administradorId,
    acao: suspenderAgora ? 'suspensao' : 'reativacao',
    alvo_tipo: 'prestador',
    alvo_id: prestador.id,
    justificativa
  });
  // O aviso de suspensao nao e de um servico: vai por e-mail, e o motivo
  // aparece para o proprio prestador em Meu perfil.
  try {
    const usuario = await Usuario.findByPk(prestador.usuario_id, { attributes: ['email'] });
    if (usuario && usuario.email) {
      await enviarAvisoServico(usuario.email, suspenderAgora
        ? {
          titulo: 'Seu perfil foi suspenso',
          texto: `A administração do Fechô suspendeu o seu perfil de forma preventiva. Motivo: ${justificativa}. `
            + 'Enquanto isso, você não aparece nas buscas e não recebe pedidos novos.'
        }
        : { titulo: 'Seu perfil voltou ao ar', texto: 'A suspensão foi retirada. Você volta a aparecer nas buscas e a receber pedidos.' });
    }
  } catch (e) {
    console.error('[admin] falha ao enviar o aviso de suspensao:', e.message);
  }
  return { prestador };
}

// Rotina: nenhuma - a disputa nao vence sozinha. O prazo de 7 dias e o
// compromisso do Fechô e aparece no painel como atraso.
async function disputasAtrasadas(agora = new Date()) {
  const limite = new Date(agora.getTime() - DECISAO_DIAS * 24 * HORA_MS);
  return Disputa.count({ where: { status: 'aberta', aberta_em: { [Op.lte]: limite } } });
}

module.exports = {
  DEFESA_HORAS, DECISAO_DIAS, TEXTO_MINIMO, TEXTO_MAXIMO, STATUS_ABRE,
  motivoParaNaoAbrir, prazoParaAbrir, prazoDefesa, prazoDecisao, podeDecidir,
  pagamentosRetidos, valorCongelado, abrir, defender, decidir, suspender, disputasAtrasadas
};
