const { Op } = require('sequelize');
const {
  Servico, Mensagem, Prestador, Usuario, Bairro, Categoria, Pagamento, AcessoEndereco
} = require('../models');
const {
  detectarTipo, salvarArquivoServico, removerArquivoServico, caminhoArquivoServico, urlPublica
} = require('../servicos/armazenamento');
const { semMetadados } = require('../servicos/metadados');
const {
  emAberto, encerrarSeVencida, pagamentoDoServico, gerarCobranca
} = require('../servicos/cobrancas');
const { GatewayErro } = require('../servicos/gateway');

const LIMITE_DESCRICAO = 1000;
const LIMITE_MENSAGEM = 1000;
// US10 - o prazo do orcamento e a duracao estimada do servico, em horas.
// E ele que diz quanto tempo o horario do prestador fica ocupado (US13).
const PRAZO_MAXIMO_HORAS = 24;
const VALOR_MAXIMO = 99999999.99; // cabe em DECIMAL(10,2)
// US11 - rua, numero e complemento do atendimento.
const ENDERECO_MINIMO = 5;
const ENDERECO_MAXIMO = 200;
const HORA_MS = 60 * 60 * 1000;

// Leitura dos campos ------------------------------------------------------

function inteiroPositivo(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function lerDataHora(valor) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

// Dinheiro em reais. Ausente: undefined. Invalido: NaN. Aceita "150,50".
function lerDinheiro(valor) {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const numero = typeof valor === 'number' ? valor : Number(String(valor).trim().replace(',', '.'));
  if (!Number.isFinite(numero)) return NaN;
  return Math.round(numero * 100) / 100;
}

function emReais(valor) {
  return valor === null || valor === undefined ? null : Number(valor);
}

// Imagens (fotos do pedido e do chat) --------------------------------------

// Confere o conteudo de cada arquivo e tira os metadados (GPS). Devolve
// { imagens } ou { erro }. Nada e gravado aqui.
function prepararImagens(arquivos) {
  const imagens = [];
  for (const arquivo of arquivos) {
    const tipo = detectarTipo(arquivo.buffer);
    if (!tipo) return { erro: 'Use imagens JPG, PNG ou WebP.' };
    const limpo = semMetadados(arquivo.buffer, tipo.ext);
    if (!limpo) return { erro: 'Não consegui ler uma das imagens. Tente outra foto.' };
    imagens.push({ buffer: limpo, ext: tipo.ext });
  }
  return { imagens };
}

async function gravarImagens(imagens) {
  const nomes = [];
  try {
    for (const imagem of imagens) nomes.push(await salvarArquivoServico(imagem.buffer, imagem.ext));
    return nomes;
  } catch (e) {
    await Promise.all(nomes.map((n) => removerArquivoServico(n).catch(() => {})));
    throw e;
  }
}

// Acesso: so as duas partes do servico -------------------------------------

const INCLUDE_CONTRATANTE = { model: Usuario, as: 'contratante', attributes: ['id', 'nome'] };
const INCLUDE_BAIRRO = { model: Bairro, as: 'bairro', attributes: ['id', 'nome'] };

function includePrestador({ comBairros = false } = {}) {
  const include = [{ model: Usuario, as: 'usuario', attributes: ['id', 'nome'] }];
  if (comBairros) include.push({ model: Bairro, as: 'bairros', attributes: ['id'], through: { attributes: [] } });
  return { model: Prestador, as: 'prestador', attributes: ['id', 'usuario_id', 'foto_url'], include };
}

function papelNoServico(servico, usuario) {
  if (servico.id_contratante === usuario.id) return 'contratante';
  if (servico.prestador && servico.prestador.usuario_id === usuario.id) return 'prestador';
  return null;
}

// Carrega o servico se quem pede e uma das partes. Para qualquer outra pessoa
// responde 404, sem revelar se o servico existe (US02 e US12).
async function carregarDaParte(req, res) {
  const id = inteiroPositivo(req.params.id);
  const servico = id && await Servico.findByPk(id, {
    include: [INCLUDE_CONTRATANTE, includePrestador({ comBairros: true }), INCLUDE_BAIRRO]
  });
  const papel = servico ? papelNoServico(servico, req.usuario) : null;
  if (!papel) {
    res.status(404).json({ erro: 'Serviço não encontrado.' });
    return null;
  }
  servico.papel = papel;
  return servico;
}

// US10 - fora da area: o bairro do pedido nao esta entre os do prestador.
function foraDaArea(servico) {
  const bairros = (servico.prestador && servico.prestador.bairros) || [];
  return !bairros.some((b) => b.id === servico.bairro_id);
}

// Resposta -----------------------------------------------------------------

// US17 - o pagamento do servico. O Pix (QR code e copia e cola) so vai para
// o contratante, e so enquanto a cobranca pode ser paga.
function montarPagamento(pagamento, papel, { comPix = false } = {}) {
  if (!pagamento) return null;
  const aberto = emAberto(pagamento);
  return {
    status: pagamento.status,
    valor: emReais(pagamento.valor),
    identificador: pagamento.identificador,
    em_aberto: aberto,
    expira_em: pagamento.expira_em,
    expirado: !aberto && pagamento.status === 'aguardando',
    retido_em: pagamento.retido_em,
    pix: comPix && aberto && papel === 'contratante'
      ? {
        copia_cola: pagamento.pix_copia_cola,
        qr_code: pagamento.pix_qr_code,
        simulado: pagamento.gateway === 'simulado'
      }
      : undefined
  };
}

// Opcoes: pagamento (o mais recente), comPix e comEndereco (so no detalhe,
// que e onde o acesso ao endereco fica registrado).
function montarServico(servico, papel, { pagamento, comPix = false, comEndereco = false } = {}) {
  const temOrcamento = servico.valor !== null && servico.valor !== undefined;
  const valor = emReais(servico.valor);
  const taxa = emReais(servico.taxa_deslocamento) || 0;
  const prestador = servico.prestador;

  return {
    id: servico.id,
    status: servico.status,
    papel,
    descricao: servico.descricao,
    fotos: servico.fotos,
    fotos_removidas: Boolean(servico.midias_removidas_em),
    bairro: servico.bairro ? { id: servico.bairro.id, nome: servico.bairro.nome } : null,
    fora_da_area: prestador && prestador.bairros ? foraDaArea(servico) : undefined,
    data_hora_solicitada: servico.data_hora_solicitada,
    data_hora_proposta: servico.data_hora_proposta,
    horario: servico.horarioCombinado(),
    // US10 - valor, prazo e deslocamento separados
    orcamento: temOrcamento
      ? {
        valor,
        prazo_horas: servico.prazo_horas,
        taxa_deslocamento: taxa,
        total: Math.round((valor + taxa) * 100) / 100,
        enviado_em: servico.orcamento_enviado_em
      }
      : null,
    contratante: servico.contratante ? { id: servico.contratante.id, nome: servico.contratante.nome } : null,
    prestador: prestador
      ? {
        id: prestador.id,
        nome: prestador.usuario ? prestador.usuario.nome : null,
        foto_url: urlPublica(prestador.foto_url)
      }
      : null,
    chat_aberto: servico.chatAberto(),
    encerrado_em: servico.encerrado_em,
    criado_em: servico.createdAt,
    aceito_em: servico.aceito_em,
    // US17 - status do pagamento (tabela propria)
    pagamento: pagamento === undefined ? undefined : montarPagamento(pagamento, papel, { comPix }),
    // US11 - o endereco so sai do aceite em diante. Antes disso, nem a chave
    // aparece na resposta.
    ...(comEndereco && servico.enderecoLiberado() && servico.endereco
      ? { endereco: { logradouro: servico.endereco, bairro: servico.bairro ? servico.bairro.nome : null } }
      : {})
  };
}

// Pagamento mais recente de cada servico da lista, numa consulta so.
async function ultimosPagamentos(servicos) {
  const ids = servicos.map((s) => s.id);
  if (!ids.length) return new Map();
  const pagamentos = await Pagamento.findAll({ where: { servico_id: ids }, order: [['id', 'ASC']] });
  const mapa = new Map();
  pagamentos.forEach((p) => mapa.set(p.servico_id, p));
  return mapa;
}

function montarMensagem(mensagem, usuarioId, autor = mensagem.autor) {
  return {
    id: mensagem.id,
    autor: autor ? { id: autor.id, nome: autor.nome } : null,
    minha: mensagem.autor_id === usuarioId,
    texto: mensagem.texto,
    imagem: mensagem.imagem,
    imagem_removida: Boolean(mensagem.imagem_removida_em),
    enviada_em: mensagem.createdAt
  };
}

// US13 - agenda ------------------------------------------------------------

// Devolve o servico do mesmo prestador que ja ocupa algum instante entre
// inicio e fim, ou null. Ocupam: orcamento enviado e compromisso aceito, do
// horario combinado ate o fim do prazo informado no orcamento.
async function horarioOcupado(idPrestador, inicio, fim, ignorarId = null) {
  const where = { id_prestador: idPrestador, status: Servico.STATUS_OCUPAM_HORARIO };
  if (ignorarId) where.id = { [Op.ne]: ignorarId };
  const ocupados = await Servico.findAll({ where });
  return ocupados.find((s) => {
    const comeco = new Date(s.horarioCombinado()).getTime();
    const termino = comeco + (s.prazo_horas || 1) * HORA_MS;
    return inicio.getTime() < termino && fim.getTime() > comeco;
  }) || null;
}

// Filtro dos servicos de quem esta logado, conforme o perfil.
async function filtroDoUsuario(usuario) {
  if (usuario.tipo_perfil === 'contratante') {
    return { papel: 'contratante', where: { id_contratante: usuario.id } };
  }
  const prestador = await Prestador.findOne({ where: { usuario_id: usuario.id }, attributes: ['id'] });
  return prestador ? { papel: 'prestador', where: { id_prestador: prestador.id } } : null;
}

// Endpoints ----------------------------------------------------------------

/**
 * US10 - Abrir a solicitacao (com fotos). US13 - com data e hora.
 * Multipart: descricao, bairro_id, data_hora, id_prestador e ate 3 "fotos".
 */
async function criar(req, res, next) {
  try {
    const descricao = String(req.body.descricao || '').trim();
    const bairroId = inteiroPositivo(req.body.bairro_id);
    const dataHora = lerDataHora(req.body.data_hora);
    const idPrestador = inteiroPositivo(req.body.id_prestador);

    if (!descricao) {
      return res.status(400).json({ erro: 'Descreva o serviço de que você precisa.' });
    }
    if (descricao.length > LIMITE_DESCRICAO) {
      return res.status(400).json({ erro: `A descrição pode ter no máximo ${LIMITE_DESCRICAO} caracteres.` });
    }
    if (!bairroId || !(await Bairro.findByPk(bairroId))) {
      return res.status(400).json({ erro: 'Escolha o bairro onde o serviço vai ser feito.' });
    }
    if (!dataHora) {
      return res.status(400).json({ erro: 'Escolha a data e a hora do atendimento.' });
    }
    // US13 - data no passado e recusada
    if (dataHora <= new Date()) {
      return res.status(400).json({ erro: 'Essa data já passou. Escolha uma data e hora que ainda estão por vir.' });
    }

    // So prestador ativo, com conta ativa e perfil completo recebe pedido:
    // o mesmo criterio da busca.
    const prestador = idPrestador && await Prestador.findOne({
      where: { id: idPrestador, status: 'ativo' },
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id'], where: { status: 'ativo' }, required: true },
        { model: Categoria, as: 'categorias', attributes: ['id'], through: { attributes: [] }, required: true },
        { model: Bairro, as: 'bairros', attributes: ['id'], through: { attributes: [] }, required: true }
      ]
    });
    if (!prestador) {
      return res.status(404).json({ erro: 'Esse profissional não está disponível para novos pedidos.' });
    }
    // US08 - a escolha da prestadora vale tambem para o pedido.
    if (prestador.atende_apenas_mulheres && req.usuario.sexo !== 'feminino') {
      return res.status(403).json({ erro: 'Esta profissional atende apenas mulheres.' });
    }

    const { imagens, erro } = prepararImagens(req.files || []);
    if (erro) return res.status(400).json({ erro });

    // US13 - horario ja ocupado pelo mesmo prestador
    const conflito = await horarioOcupado(prestador.id, dataHora, new Date(dataHora.getTime() + 1));
    if (conflito) {
      return res.status(409).json({ erro: 'Esse horário já está ocupado na agenda deste profissional. Escolha outro.' });
    }

    const fotos = await gravarImagens(imagens);
    let servico;
    try {
      servico = await Servico.create({
        id_contratante: req.usuario.id,
        id_prestador: prestador.id,
        bairro_id: bairroId,
        descricao,
        fotos,
        data_hora_solicitada: dataHora,
        status: 'aguardando_orcamento'
      });
    } catch (e) {
      await Promise.all(fotos.map((n) => removerArquivoServico(n).catch(() => {})));
      throw e;
    }

    const completo = await Servico.findByPk(servico.id, {
      include: [INCLUDE_CONTRATANTE, includePrestador({ comBairros: true }), INCLUDE_BAIRRO]
    });
    return res.status(201).json({ servico: montarServico(completo, 'contratante') });
  } catch (e) {
    return next(e);
  }
}

// US10 - os servicos de quem esta logado. Para o prestador, os que estao em
// "aguardando_orcamento" sao a lista de pendencias.
async function listar(req, res, next) {
  try {
    const filtro = await filtroDoUsuario(req.usuario);
    if (!filtro) return res.json({ servicos: [] });

    const servicos = await Servico.findAll({
      where: filtro.where,
      include: [INCLUDE_CONTRATANTE, includePrestador(), INCLUDE_BAIRRO],
      order: [['id', 'DESC']]
    });
    const pagamentos = await ultimosPagamentos(servicos);
    return res.json({
      servicos: servicos.map((s) => montarServico(s, filtro.papel, { pagamento: pagamentos.get(s.id) || null }))
    });
  } catch (e) {
    return next(e);
  }
}

// US13 - agenda: os compromissos aparecem para os dois lados depois do aceite.
async function agenda(req, res, next) {
  try {
    const filtro = await filtroDoUsuario(req.usuario);
    if (!filtro) return res.json({ compromissos: [] });

    const servicos = await Servico.findAll({
      where: { ...filtro.where, status: Servico.STATUS_COMPROMISSO },
      include: [INCLUDE_CONTRATANTE, includePrestador(), INCLUDE_BAIRRO]
    });
    const pagamentos = await ultimosPagamentos(servicos);
    const compromissos = servicos
      .sort((a, b) => new Date(a.horarioCombinado()) - new Date(b.horarioCombinado()))
      .map((s) => montarServico(s, filtro.papel, { pagamento: pagamentos.get(s.id) || null }));
    return res.json({ compromissos });
  } catch (e) {
    return next(e);
  }
}

async function detalhar(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    const pagamento = await pagamentoDoServico(servico.id);

    // US11 - o endereco so vem do aceite em diante, e cada entrega fica no log.
    const liberado = servico.enderecoLiberado() && Boolean(servico.endereco);
    if (liberado) {
      await AcessoEndereco.create({
        servico_id: servico.id, usuario_id: req.usuario.id, papel: servico.papel, ip: req.ip || null
      });
    }
    return res.json({
      servico: montarServico(servico, servico.papel, { pagamento, comPix: true, comEndereco: liberado })
    });
  } catch (e) {
    return next(e);
  }
}

/**
 * US11 - o contratante aceita o orcamento informando o endereco do
 * atendimento. US17 - o aceite gera a cobranca Pix com o valor exato do
 * orcamento. O servico so vira Aceito quando o gateway confirmar o
 * pagamento (US18); ate la o endereco nao sai para ninguem.
 */
async function aceitar(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'contratante') {
      return res.status(403).json({ erro: 'Só quem fez o pedido pode aceitar o orçamento.' });
    }
    if (servico.status !== 'orcamento_enviado') {
      return res.status(409).json({ erro: 'Este pedido não tem orçamento esperando o seu aceite.' });
    }

    // Clique repetido: devolve o mesmo Pix, sem gerar outra cobranca.
    const atual = await pagamentoDoServico(servico.id);
    if (emAberto(atual)) {
      return res.json({ servico: montarServico(servico, 'contratante', { pagamento: atual, comPix: true }) });
    }

    const endereco = String(req.body.endereco || '').replace(/\s+/g, ' ').trim();
    if (endereco.length < ENDERECO_MINIMO) {
      return res.status(400).json({ erro: 'Informe a rua e o número onde o serviço vai ser feito.' });
    }
    if (endereco.length > ENDERECO_MAXIMO) {
      return res.status(400).json({ erro: `O endereço pode ter no máximo ${ENDERECO_MAXIMO} caracteres.` });
    }
    if (new Date(servico.horarioCombinado()) <= new Date()) {
      return res.status(409).json({
        erro: 'O horário deste orçamento já passou. Faça um novo pedido com outra data.'
      });
    }

    let pagamento;
    try {
      pagamento = await gerarCobranca(servico, req.usuario);
    } catch (e) {
      if (e instanceof GatewayErro) {
        console.error('[pagamento] falha ao gerar a cobranca:', e.detalhe || e.message);
        return res.status(502).json({ erro: e.message });
      }
      throw e;
    }

    // Guardado agora, entregue so quando o servico chegar em Aceito.
    servico.endereco = endereco;
    await servico.save();

    return res.status(201).json({
      servico: montarServico(servico, 'contratante', { pagamento, comPix: true })
    });
  } catch (e) {
    return next(e);
  }
}

/**
 * US10 - O prestador responde valor, prazo e, quando o bairro esta fora da
 * area dele, a taxa de deslocamento. US13 - com data e hora na proposta.
 */
async function enviarOrcamento(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'prestador') {
      return res.status(403).json({ erro: 'Só o profissional do pedido responde o orçamento.' });
    }
    if (servico.status !== 'aguardando_orcamento') {
      return res.status(409).json({ erro: 'Este pedido não está mais aguardando orçamento.' });
    }

    const valor = lerDinheiro(req.body.valor);
    if (!(valor > 0)) {
      return res.status(400).json({ erro: 'Informe um valor maior que zero.' });
    }
    if (valor > VALOR_MAXIMO) {
      return res.status(400).json({ erro: 'Esse valor é alto demais. Confira o número.' });
    }

    const prazo = Number(req.body.prazo_horas);
    if (!Number.isInteger(prazo) || prazo < 1 || prazo > PRAZO_MAXIMO_HORAS) {
      return res.status(400).json({ erro: `Informe o prazo em horas, de 1 a ${PRAZO_MAXIMO_HORAS}.` });
    }

    // Sem data na proposta, vale a que o contratante pediu.
    const dataHora = req.body.data_hora === undefined ? servico.data_hora_solicitada : lerDataHora(req.body.data_hora);
    if (!dataHora) {
      return res.status(400).json({ erro: 'Informe a data e a hora do atendimento.' });
    }
    if (new Date(dataHora) <= new Date()) {
      return res.status(400).json({ erro: 'Essa data já passou. Proponha uma data e hora que ainda estão por vir.' });
    }

    let taxa = lerDinheiro(req.body.taxa_deslocamento);
    if (foraDaArea(servico)) {
      if (taxa === undefined) {
        return res.status(400).json({
          erro: 'Este bairro está fora dos que você atende: informe a taxa de deslocamento (pode ser zero).'
        });
      }
      if (!(taxa >= 0)) {
        return res.status(400).json({ erro: 'A taxa de deslocamento não pode ser negativa.' });
      }
      if (taxa > VALOR_MAXIMO) {
        return res.status(400).json({ erro: 'Essa taxa é alta demais. Confira o número.' });
      }
    } else {
      if (taxa !== undefined && taxa !== 0) {
        return res.status(400).json({ erro: 'Este bairro está entre os que você atende: não cabe taxa de deslocamento.' });
      }
      taxa = 0;
    }

    // US13 - o prestador nao pode se comprometer com dois servicos ao mesmo tempo.
    const inicio = new Date(dataHora);
    const fim = new Date(inicio.getTime() + prazo * HORA_MS);
    if (await horarioOcupado(servico.id_prestador, inicio, fim, servico.id)) {
      return res.status(409).json({
        erro: 'Você já tem outro orçamento ou compromisso nesse horário. Proponha outro horário.'
      });
    }

    servico.valor = valor;
    servico.prazo_horas = prazo;
    servico.taxa_deslocamento = taxa;
    servico.data_hora_proposta = inicio;
    servico.status = 'orcamento_enviado';
    servico.orcamento_enviado_em = new Date();
    await servico.save();

    return res.json({ servico: montarServico(servico, 'prestador') });
  } catch (e) {
    return next(e);
  }
}

// US10 - o contratante recusa o orcamento e o servico e encerrado.
async function recusar(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'contratante') {
      return res.status(403).json({ erro: 'Só quem fez o pedido pode recusar o orçamento.' });
    }
    if (servico.status !== 'orcamento_enviado') {
      return res.status(409).json({ erro: 'Não há orçamento para recusar neste pedido.' });
    }

    // US17 - se havia um Pix esperando pagamento, ele e cancelado junto.
    const pagamento = await pagamentoDoServico(servico.id);
    if (emAberto(pagamento)) {
      pagamento.expira_em = new Date();
      await encerrarSeVencida(pagamento);
    }

    servico.status = 'recusado';
    await servico.save(); // o hook do modelo marca encerrado_em

    return res.json({ servico: montarServico(servico, 'contratante') });
  } catch (e) {
    return next(e);
  }
}

// US10 / US12 - abre uma foto do pedido ou uma imagem do chat. So as partes.
async function arquivo(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;

    const { nome } = req.params;
    const caminho = caminhoArquivoServico(nome);
    const doServico = servico.fotos.includes(nome)
      || (await Mensagem.count({ where: { servico_id: servico.id, imagem: nome } })) > 0;
    if (!caminho || !doServico) {
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

// US12 - mensagens do chat. ?depois=<id> traz so as novas.
async function mensagens(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;

    const depois = inteiroPositivo(req.query.depois) || 0;
    const lista = await Mensagem.findAll({
      where: { servico_id: servico.id, id: { [Op.gt]: depois } },
      include: [{ model: Usuario, as: 'autor', attributes: ['id', 'nome'] }],
      order: [['id', 'ASC']]
    });

    return res.json({
      mensagens: lista.map((m) => montarMensagem(m, req.usuario.id)),
      status: servico.status,
      chat_aberto: servico.chatAberto()
    });
  } catch (e) {
    return next(e);
  }
}

// US12 - envia texto, imagem ou os dois. Depois da conclusao, nao aceita mais.
async function enviarMensagem(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (!servico.chatAberto()) {
      return res.status(409).json({
        erro: 'Este serviço foi encerrado. A conversa continua guardada, mas não recebe novas mensagens.'
      });
    }

    const texto = typeof req.body.texto === 'string' ? req.body.texto.trim() : '';
    if (texto.length > LIMITE_MENSAGEM) {
      return res.status(400).json({ erro: `A mensagem pode ter no máximo ${LIMITE_MENSAGEM} caracteres.` });
    }
    if (!texto && !req.file) {
      return res.status(400).json({ erro: 'Escreva uma mensagem ou escolha uma imagem.' });
    }

    let nomeImagem = null;
    if (req.file) {
      const { imagens, erro } = prepararImagens([req.file]);
      if (erro) return res.status(400).json({ erro });
      [nomeImagem] = await gravarImagens(imagens);
    }

    let mensagem;
    try {
      mensagem = await Mensagem.create({
        servico_id: servico.id, autor_id: req.usuario.id, texto: texto || null, imagem: nomeImagem
      });
    } catch (e) {
      if (nomeImagem) await removerArquivoServico(nomeImagem).catch(() => {});
      throw e;
    }
    return res.status(201).json({ mensagem: montarMensagem(mensagem, req.usuario.id, req.usuario) });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  criar, listar, agenda, detalhar, aceitar, enviarOrcamento, recusar, arquivo, mensagens, enviarMensagem,
  PRAZO_MAXIMO_HORAS
};
