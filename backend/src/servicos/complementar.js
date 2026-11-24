/**
 * US19 - Proposta complementar.
 *
 * No local, o prestador encontra um trabalho a mais e pede um valor
 * adicional. Regras do cartao:
 *   - justificativa e foto obrigatorias;
 *   - no maximo 50% do valor original do servico (sem o deslocamento);
 *   - uma por servico (mesmo que a primeira seja recusada);
 *   - aceita, gera um Pix adicional que fica congelado junto com o original
 *     e so sai na confirmacao (US20) ou na decisao de uma disputa (US25);
 *   - recusada, vale o orcamento original e o valor ja congelado nao muda;
 *   - o perfil do prestador mostra quantas vezes ele pediu complementar.
 *
 * Quando: com o servico Em execucao, ou Aceito depois do "Cheguei" (o
 * prestador ja esta no local e viu o problema).
 */
const { Op, fn, col } = require('sequelize');
const { Pagamento, PropostaComplementar, Servico } = require('../models');
const gateway = require('./gateway');
const { encerrarSeVencida, emAberto } = require('./cobrancas');
const { registrar } = require('./historico');
const { avisar } = require('./avisos');
const { emReais } = require('./taxa');

const LIMITE_PERCENTUAL = 50;
const JUSTIFICATIVA_MINIMA = 10;
const JUSTIFICATIVA_MAXIMA = 600;
// Status do servico em que a proposta pode ser feita, aceita e paga.
const STATUS_PERMITIDOS = ['aceito', 'em_execucao'];

function noLocal(servico) {
  return servico.status === 'em_execucao' || (servico.status === 'aceito' && Boolean(servico.chegou_em));
}

function valorMaximo(servico) {
  return emReais(Number(servico.valor) * LIMITE_PERCENTUAL / 100);
}

async function daServico(servicoId) {
  return PropostaComplementar.findOne({ where: { servico_id: servicoId } });
}

// Pix adicional mais recente da proposta (ja com a cobranca vencida encerrada).
async function pagamentoComplementar(servicoId, agora = new Date()) {
  const pagamento = await Pagamento.unscoped().findOne({
    where: { servico_id: servicoId, tipo: 'complementar' }, order: [['id', 'DESC']]
  });
  await encerrarSeVencida(pagamento, agora);
  return pagamento;
}

/**
 * Encerra uma proposta que ficou sem resposta ou sem pagamento quando o
 * servico segue adiante (concluido, cancelado, em disputa). O Pix adicional
 * em aberto deixa de valer.
 */
async function encerrarProposta(servicoId, agora = new Date()) {
  const proposta = await daServico(servicoId);
  if (!proposta || !['pendente', 'aceita'].includes(proposta.status)) return false;
  const pagamento = await pagamentoComplementar(servicoId, agora);
  if (emAberto(pagamento, agora)) {
    pagamento.expira_em = agora;
    await encerrarSeVencida(pagamento, agora);
  }
  proposta.status = 'encerrada';
  proposta.respondida_em = proposta.respondida_em || agora;
  await proposta.save();
  await registrar(servicoId, { acao: 'complementar_encerrado', detalhe: 'A proposta complementar ficou sem efeito (o serviço seguiu sem o pagamento)' });
  return true;
}

/**
 * US15 - cancelamento: o Pix adicional congelado volta inteiro ao
 * contratante (o trabalho a mais nao foi feito). Devolve o valor devolvido.
 */
async function devolverNoCancelamento(servico, agora = new Date()) {
  await encerrarProposta(servico.id, agora);
  const retidos = await Pagamento.unscoped().findAll({
    where: { servico_id: servico.id, tipo: 'complementar', status: 'retido' }
  });
  let devolvido = 0;
  for (const pagamento of retidos) {
    const { estorno_id: estornoId } = await gateway.estornarCobranca(
      pagamento.cobranca_id,
      { valor: Number(pagamento.valor), descricao: `Fechô - cancelamento do serviço ${servico.id} (complementar)` },
      pagamento.gateway
    );
    pagamento.status = 'estornado';
    pagamento.valor_estorno = pagamento.valor;
    pagamento.estorno_id = estornoId;
    pagamento.estornado_em = agora;
    pagamento.taxa_percentual = 0;
    pagamento.taxa_valor = 0;
    pagamento.valor_repasse = 0;
    await pagamento.save();
    devolvido += Number(pagamento.valor);
  }
  return emReais(devolvido);
}

/**
 * US19 - metrica no perfil: quantos servicos aceitos o prestador teve e em
 * quantos pediu valor complementar. Uma consulta para varios prestadores.
 */
async function metricaDosPrestadores(ids) {
  const mapa = new Map();
  if (!ids.length) return mapa;
  const [servicos, propostas] = await Promise.all([
    Servico.findAll({
      attributes: ['id_prestador', [fn('COUNT', col('id')), 'total']],
      where: { id_prestador: ids, aceito_em: { [Op.ne]: null } },
      group: ['id_prestador'],
      raw: true
    }),
    PropostaComplementar.findAll({
      attributes: [[col('servico.id_prestador'), 'id_prestador'], [fn('COUNT', col('PropostaComplementar.id')), 'total']],
      include: [{ model: Servico, as: 'servico', attributes: [], where: { id_prestador: ids }, required: true }],
      group: [col('servico.id_prestador')],
      raw: true
    })
  ]);
  const totalServicos = new Map(servicos.map((l) => [Number(l.id_prestador), Number(l.total)]));
  const totalPropostas = new Map(propostas.map((l) => [Number(l.id_prestador), Number(l.total)]));
  for (const id of ids) {
    const base = totalServicos.get(id) || 0;
    const pedidos = totalPropostas.get(id) || 0;
    mapa.set(id, {
      servicos: base,
      propostas: pedidos,
      percentual: base ? Math.round((pedidos / base) * 100) : 0
    });
  }
  return mapa;
}

function montarProposta(proposta, pagamento, papel, montarPagamento) {
  if (!proposta) return null;
  return {
    id: proposta.id,
    valor: Number(proposta.valor),
    justificativa: proposta.justificativa,
    foto: proposta.foto,
    status: proposta.status,
    enviada_em: proposta.enviada_em,
    respondida_em: proposta.respondida_em,
    paga_em: proposta.paga_em,
    pagamento: montarPagamento(pagamento, papel, { comPix: proposta.status === 'aceita' })
  };
}

module.exports = {
  LIMITE_PERCENTUAL, JUSTIFICATIVA_MINIMA, JUSTIFICATIVA_MAXIMA, STATUS_PERMITIDOS,
  noLocal, valorMaximo, daServico, pagamentoComplementar, encerrarProposta, devolverNoCancelamento,
  metricaDosPrestadores, montarProposta, avisar
};
