/**
 * US15 - Cancelamento e estorno.
 *
 * Tabela decidida pelo grupo (contratante recebe / prestador recebe):
 *   contratante cancela com mais de 24 horas ...... 100% / 0
 *   contratante cancela com menos de 24 horas ..... 70% / 30%
 *   contratante cancela com o prestador no local .. 50% / 50%  (botao "Cheguei")
 *   prestador cancela ............................. 100% / 0
 *
 * Cancelamento nao paga taxa: a parte do prestador vai inteira para ele.
 * Com o servico em execucao nao existe cancelamento, so disputa (US23).
 * Servico concluido nao pode ser cancelado.
 *
 * Antes do aceite (pedido ou orcamento sem Pix pago) nao ha dinheiro: o
 * pedido so e encerrado e um Pix em aberto deixa de valer.
 */
const { Pagamento, Reagendamento, Servico } = require('../models');
const gateway = require('./gateway');
const { encerrarSeVencida, emAberto } = require('./cobrancas');
const { carregarPrestador, transferir, dinheiro } = require('./repasse');
const { registrar } = require('./historico');
const { avisar } = require('./avisos');
const { emReais } = require('./taxa');

const HORA_MS = 60 * 60 * 1000;
const ANTECEDENCIA_HORAS = 24;

const REGRAS = {
  sem_pagamento: 'Ainda não houve pagamento: o pedido só é encerrado.',
  mais_de_24h: 'Cancelamento com mais de 24 horas de antecedência: você recebe tudo de volta.',
  menos_de_24h: 'Cancelamento com menos de 24 horas: você recebe 70% e o profissional fica com 30%.',
  prestador_no_local: 'O profissional já chegou ao local: você recebe 50% e ele fica com 50%.',
  prestador_cancela: 'Cancelamento pelo profissional: o cliente recebe tudo de volta.'
};

// Status em que nao da para cancelar, com o motivo em linguagem simples.
const BLOQUEIOS = {
  em_execucao: 'Com o serviço em andamento não dá para cancelar. Se houver algum problema, a saída é abrir uma disputa.',
  concluido: 'Serviço já concluído não pode ser cancelado.',
  confirmado: 'Serviço já concluído não pode ser cancelado.',
  pago: 'Serviço já concluído não pode ser cancelado.',
  em_disputa: 'Este serviço está em disputa: quem decide é o administrador.',
  resolvido: 'Este serviço já foi encerrado.',
  cancelado: 'Este serviço já foi cancelado.',
  recusado: 'Este pedido já foi encerrado.',
  expirado: 'Este pedido já foi encerrado.'
};

/**
 * Calcula o que acontece se `papel` cancelar agora, sem mexer em nada.
 * Devolve { bloqueio } ou a divisao do dinheiro.
 */
function calcular(servico, papel, pagamento, agora = new Date()) {
  if (BLOQUEIOS[servico.status]) return { bloqueio: BLOQUEIOS[servico.status] };

  const retido = servico.status === 'aceito' && pagamento && pagamento.status === 'retido';
  if (!retido) {
    return {
      regra: 'sem_pagamento', descricao: REGRAS.sem_pagamento, total: 0,
      percentual_contratante: 0, percentual_prestador: 0, valor_contratante: 0, valor_prestador: 0
    };
  }

  let regra;
  let paraPrestador;
  if (papel === 'prestador') {
    regra = 'prestador_cancela';
    paraPrestador = 0;
  } else if (servico.chegou_em) {
    regra = 'prestador_no_local';
    paraPrestador = 50;
  } else {
    const faltam = new Date(servico.horarioCombinado()).getTime() - agora.getTime();
    if (faltam > ANTECEDENCIA_HORAS * HORA_MS) {
      regra = 'mais_de_24h';
      paraPrestador = 0;
    } else {
      regra = 'menos_de_24h';
      paraPrestador = 30;
    }
  }

  const total = Number(pagamento.valor);
  const valorPrestador = emReais(total * paraPrestador / 100);
  return {
    regra,
    descricao: REGRAS[regra],
    total,
    percentual_contratante: 100 - paraPrestador,
    percentual_prestador: paraPrestador,
    valor_contratante: emReais(total - valorPrestador),
    valor_prestador: valorPrestador
  };
}

async function pagamentoAtual(servicoId) {
  return Pagamento.findOne({ where: { servico_id: servicoId }, order: [['id', 'DESC']] });
}

/**
 * Executa o cancelamento. O estorno no gateway vem primeiro: se o banco
 * recusar, nada muda (quem chama devolve o erro). Devolve a conta aplicada.
 */
async function cancelar(servico, { papel, usuarioId, motivo, agora = new Date() }) {
  const pagamento = await pagamentoAtual(servico.id);
  const conta = calcular(servico, papel, pagamento, agora);
  if (conta.bloqueio) return conta;
  const statusAnterior = servico.status;

  if (conta.regra === 'sem_pagamento') {
    // Pix gerado e ainda nao pago: deixa de valer junto com o pedido.
    if (emAberto(pagamento, agora)) {
      pagamento.expira_em = agora;
      await encerrarSeVencida(pagamento, agora);
    }
  } else {
    // 1. Devolve ao contratante a parte dele.
    const { estorno_id: estornoId } = await gateway.estornarCobranca(
      pagamento.cobranca_id,
      { valor: conta.valor_contratante, descricao: `Fechô - cancelamento do serviço ${servico.id}` },
      pagamento.gateway
    );
    pagamento.status = 'estornado';
    pagamento.valor_estorno = conta.valor_contratante;
    pagamento.estorno_id = estornoId;
    pagamento.estornado_em = agora;
    // Cancelamento nao paga taxa.
    pagamento.taxa_percentual = 0;
    pagamento.taxa_valor = 0;
    pagamento.valor_repasse = conta.valor_prestador;
    await pagamento.save();

    // 2. A multa vai inteira para o prestador (quando houver).
    if (conta.valor_prestador > 0) {
      const prestador = await carregarPrestador(servico.id_prestador);
      const r = await transferir(pagamento, prestador, conta.valor_prestador, `Fechô - serviço ${servico.id} (cancelamento)`);
      if (r.pendente) {
        pagamento.repasse_pendente = r.pendente;
      } else {
        pagamento.repasse_id = r.id;
        pagamento.liberado_em = agora;
      }
      await pagamento.save();
    }
  }

  // US14 - reagendamento esperando resposta deixa de valer.
  await Reagendamento.update(
    { status: 'cancelado', respondido_em: agora },
    { where: { servico_id: servico.id, status: 'pendente' } }
  );

  servico.status = 'cancelado';
  servico.cancelado_em = agora;
  servico.cancelado_por_id = usuarioId;
  servico.cancelado_papel = papel;
  servico.motivo_cancelamento = motivo;
  servico.regra_cancelamento = conta.regra;
  await servico.save(); // o hook do modelo marca encerrado_em

  const detalhe = conta.regra === 'sem_pagamento'
    ? `Motivo: ${motivo}`
    : `${conta.percentual_contratante}% (${dinheiro(conta.valor_contratante)}) devolvido ao cliente e `
      + `${conta.percentual_prestador}% (${dinheiro(conta.valor_prestador)}) ao profissional. Motivo: ${motivo}`;
  await registrar(servico.id, { usuarioId, acao: 'cancelamento', de: statusAnterior, para: 'cancelado', detalhe });

  const outroId = papel === 'contratante'
    ? (await carregarPrestador(servico.id_prestador)).usuario_id
    : servico.id_contratante;
  const quem = papel === 'contratante' ? 'O cliente' : 'O profissional';
  let texto = `${quem} cancelou o serviço. Motivo: ${motivo}.`;
  if (conta.regra !== 'sem_pagamento') {
    texto += papel === 'contratante'
      ? ` Pela regra de cancelamento, você recebe ${dinheiro(conta.valor_prestador)}.`
      : ` Os ${dinheiro(conta.valor_contratante)} que você pagou voltam para você pelo Pix.`;
  }
  await avisar({ usuarioId: outroId, servicoId: servico.id, tipo: 'servico_cancelado', titulo: 'Serviço cancelado', texto });

  return conta;
}

// US15 - quantos cancelamentos a pessoa ja fez (historico do usuario).
async function contarCancelamentos(usuarioId) {
  return Servico.count({ where: { cancelado_por_id: usuarioId } });
}

module.exports = { calcular, cancelar, contarCancelamentos, pagamentoAtual, REGRAS, ANTECEDENCIA_HORAS };
