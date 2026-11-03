/**
 * US20 - Conclusao do servico e repasse. US21 - taxa no momento do repasse.
 *
 * Maquina de estados (decidida pelo grupo):
 *   Aceito -> Em execucao -> Concluido pelo prestador -> Confirmado -> Pago
 *
 *   - so o prestador inicia e marca como concluido;
 *   - so o contratante confirma. Sem resposta em 72 horas, o sistema confirma
 *     sozinho (rotina abaixo);
 *   - na confirmacao, o sistema calcula a taxa e manda o gateway transferir o
 *     liquido para a chave Pix do prestador. Deu certo: pagamento Liberado e
 *     servico Pago. A taxa so e cobrada nessa passagem para Pago.
 *
 * O prestador nunca libera o proprio pagamento: nao existe rota para isso, e
 * a confirmacao exige ser o contratante do servico.
 *
 * Antes de transferir, o sistema confere de novo se a chave Pix e do CPF do
 * cadastro (decisao do grupo: a comparacao no repasse e tarefa da US20). Sem
 * chave conferida, o servico fica Confirmado com o repasse pendente, e o
 * prestador e avisado; a rotina tenta de novo quando a chave for cadastrada.
 */
const { Op } = require('sequelize');
const { Servico, Pagamento, Prestador, Usuario } = require('../models');
const gateway = require('./gateway');
const taxa = require('./taxa');
const { registrar } = require('./historico');
const { avisar } = require('./avisos');
const { liberarAvaliacoesVencidas } = require('./avaliacoes');

const HORA_MS = 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;

// US20 - horas que o contratante tem para confirmar. Aceita fracao, para a
// demonstracao (ex.: 0.05 = 3 minutos).
function horasParaConfirmar() {
  const horas = Number(process.env.CONFIRMACAO_HORAS);
  return Number.isFinite(horas) && horas > 0 ? horas : 72;
}

function prazoConfirmacao(servico) {
  if (!servico.concluido_em) return null;
  return new Date(new Date(servico.concluido_em).getTime() + horasParaConfirmar() * HORA_MS);
}

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// US06 + US20 - a chave Pix precisa ser do CPF do cadastro.
function chaveConferida(prestador) {
  const usuario = prestador && prestador.usuario;
  return Boolean(
    prestador && prestador.verificado && prestador.chave_pix_tipo === 'cpf' && prestador.chave_pix
    && usuario && usuario.cpf && prestador.chave_pix === usuario.cpf
  );
}

async function carregarPrestador(id) {
  return Prestador.findByPk(id, {
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nome', 'cpf', 'status'] }]
  });
}

// Manda o gateway transferir `valor` para o prestador. Devolve o id da
// transferencia, ou { pendente: motivo } quando nao deu para transferir.
async function transferir(pagamento, prestador, valor, descricao) {
  if (!chaveConferida(prestador)) return { pendente: 'sem_chave_pix' };
  try {
    const { transferencia_id: id } = await gateway.transferirPix(
      { valor, chave: prestador.chave_pix, descricao }, pagamento.gateway
    );
    return { id };
  } catch (e) {
    console.error(`[repasse] falha na transferencia do pagamento ${pagamento.id}:`, e.detalhe || e.message);
    return { pendente: 'falha_no_banco' };
  }
}

async function avisarPendencia(servico, prestador, motivo) {
  await avisar({
    usuarioId: prestador.usuario_id,
    servicoId: servico.id,
    tipo: 'repasse_pendente',
    titulo: 'Seu pagamento está esperando a chave Pix',
    texto: motivo === 'sem_chave_pix'
      ? 'O cliente confirmou o serviço, mas você ainda não tem uma chave Pix conferida. Cadastre a chave (o seu CPF) em Meu perfil para receber.'
      : 'O cliente confirmou o serviço. O banco não respondeu agora; vamos tentar o repasse de novo em alguns minutos.'
  });
}

/**
 * US20 / US21 - repasse de um servico Confirmado com pagamento Retido.
 * Devolve 'pago', 'pendente' ou 'nada' (nada a repassar).
 */
async function executarRepasse(servicoId, agora = new Date()) {
  const servico = await Servico.findByPk(servicoId);
  if (!servico || servico.status !== 'confirmado') return 'nada';
  const pagamento = await Pagamento.findOne({ where: { servico_id: servico.id, status: 'retido' }, order: [['id', 'DESC']] });
  if (!pagamento) return 'nada';
  const prestador = await carregarPrestador(servico.id_prestador);

  // US21 - a taxa e calculada uma vez, na primeira tentativa de repasse, com
  // base nos servicos que o prestador ja tinha concluido antes deste.
  if (pagamento.taxa_percentual === null || pagamento.taxa_percentual === undefined) {
    const anteriores = await taxa.contarConcluidos(servico.id_prestador, { excetoServicoId: servico.id });
    const conta = taxa.calcular({
      valorServico: servico.valor, valorTotal: pagamento.valor, percentual: taxa.percentualPara(anteriores)
    });
    pagamento.taxa_percentual = conta.percentual;
    pagamento.taxa_valor = conta.taxa;
    pagamento.valor_repasse = conta.liquido;
    await pagamento.save();
  }

  const resultado = await transferir(
    pagamento, prestador, Number(pagamento.valor_repasse), `Fechô - serviço ${servico.id} (repasse)`
  );
  if (resultado.pendente) {
    const jaEstavaPendente = pagamento.repasse_pendente === resultado.pendente;
    pagamento.repasse_pendente = resultado.pendente;
    await pagamento.save();
    if (!jaEstavaPendente) await avisarPendencia(servico, prestador, resultado.pendente);
    return 'pendente';
  }

  pagamento.status = 'liberado';
  pagamento.repasse_id = resultado.id;
  pagamento.repasse_pendente = null;
  pagamento.liberado_em = agora;
  await pagamento.save();
  servico.status = 'pago';
  servico.pago_em = agora;
  await servico.save();

  const percentual = Number(pagamento.taxa_percentual);
  await registrar(servico.id, {
    acao: 'repasse', de: 'confirmado', para: 'pago',
    detalhe: `Repasse de ${dinheiro(pagamento.valor_repasse)} (taxa de ${percentual}% = ${dinheiro(pagamento.taxa_valor)})`
  });
  await avisar({
    usuarioId: prestador.usuario_id,
    servicoId: servico.id,
    tipo: 'repasse_feito',
    titulo: 'Pagamento liberado',
    texto: `Enviamos ${dinheiro(pagamento.valor_repasse)} para a sua chave Pix. `
      + `Do total de ${dinheiro(pagamento.valor)}, a taxa do Fechô foi ${percentual}% do serviço (${dinheiro(pagamento.taxa_valor)}).`
  });
  return 'pago';
}

/**
 * US20 - confirma um servico Concluido pelo prestador e dispara o repasse.
 * `usuarioId` vazio = confirmacao automatica (prazo vencido).
 * Devolve null se o servico nao estava mais em Concluido (clique repetido ou
 * a rotina chegou antes): a troca de status e atomica.
 */
async function confirmar(servico, { usuarioId = null, agora = new Date() } = {}) {
  const automatico = !usuarioId;
  const [alterados] = await Servico.update(
    { status: 'confirmado', confirmado_em: agora, confirmacao_automatica: automatico },
    { where: { id: servico.id, status: 'concluido' } }
  );
  if (!alterados) return null;
  await registrar(servico.id, {
    usuarioId,
    acao: automatico ? 'confirmacao_automatica' : 'confirmacao',
    de: 'concluido',
    para: 'confirmado',
    detalhe: automatico ? `Sem resposta em ${horasParaConfirmar()} horas: confirmado pelo sistema` : null
  });
  if (automatico) {
    await avisar({
      usuarioId: servico.id_contratante,
      servicoId: servico.id,
      tipo: 'confirmacao_automatica',
      titulo: 'Serviço confirmado automaticamente',
      texto: `Passaram ${horasParaConfirmar()} horas sem resposta, então o serviço foi confirmado e o pagamento foi liberado ao profissional.`
    });
  }
  return executarRepasse(servico.id, agora);
}

// US15 - multa de cancelamento que nao saiu (sem chave Pix ou falha no banco).
async function repassarMultaPendente(pagamento, agora = new Date()) {
  const servico = await Servico.findByPk(pagamento.servico_id);
  const prestador = await carregarPrestador(servico.id_prestador);
  const resultado = await transferir(
    pagamento, prestador, Number(pagamento.valor_repasse), `Fechô - serviço ${servico.id} (cancelamento)`
  );
  if (resultado.pendente) {
    if (pagamento.repasse_pendente !== resultado.pendente) {
      pagamento.repasse_pendente = resultado.pendente;
      await pagamento.save();
    }
    return 'pendente';
  }
  pagamento.repasse_id = resultado.id;
  pagamento.repasse_pendente = null;
  pagamento.liberado_em = agora;
  await pagamento.save();
  await registrar(servico.id, {
    acao: 'repasse_cancelamento', detalhe: `Multa de cancelamento de ${dinheiro(pagamento.valor_repasse)} enviada ao profissional`
  });
  return 'pago';
}

/**
 * Rotina (a cada 5 minutos e ao subir a API):
 *   1. US20 - confirma sozinho o que ficou mais de 72 horas em Concluido;
 *   2. tenta de novo os repasses pendentes;
 *   3. US24 - publica as avaliacoes cujo prazo venceu.
 * `agora` e parametro para os testes simularem o passar do tempo.
 */
async function processarConclusoes(agora = new Date()) {
  const limite = new Date(agora.getTime() - horasParaConfirmar() * HORA_MS);
  const vencidos = await Servico.findAll({ where: { status: 'concluido', concluido_em: { [Op.lte]: limite } } });
  let confirmados = 0;
  for (const servico of vencidos) {
    try {
      if (await confirmar(servico, { agora })) confirmados += 1;
    } catch (e) {
      console.error(`[repasse] falha ao confirmar o servico ${servico.id}:`, e.message);
    }
  }

  let repassados = 0;
  const pendentes = await Pagamento.findAll({ where: { repasse_pendente: { [Op.ne]: null } } });
  for (const pagamento of pendentes) {
    try {
      const r = pagamento.status === 'estornado'
        ? await repassarMultaPendente(pagamento, agora)
        : await executarRepasse(pagamento.servico_id, agora);
      if (r === 'pago') repassados += 1;
    } catch (e) {
      console.error(`[repasse] falha ao repassar o pagamento ${pagamento.id}:`, e.message);
    }
  }

  const avaliacoes = await liberarAvaliacoesVencidas(agora);
  return { confirmados, repassados, avaliacoes_liberadas: avaliacoes };
}

// US20 - assim que o prestador cadastra a chave Pix, os repasses que
// esperavam por ela saem na hora.
async function repassarPendentesDoPrestador(prestadorId, agora = new Date()) {
  const pendentes = await Pagamento.findAll({
    where: { repasse_pendente: { [Op.ne]: null } },
    include: [{ model: Servico, as: 'servico', attributes: ['id'], where: { id_prestador: prestadorId }, required: true }]
  });
  let repassados = 0;
  for (const pagamento of pendentes) {
    const r = pagamento.status === 'estornado'
      ? await repassarMultaPendente(pagamento, agora)
      : await executarRepasse(pagamento.servico_id, agora);
    if (r === 'pago') repassados += 1;
  }
  return repassados;
}

function iniciarRotinaConclusao() {
  const rodar = () => processarConclusoes()
    .then((r) => { if (r.confirmados || r.repassados || r.avaliacoes_liberadas) console.log('[conclusao]', r); })
    .catch((e) => console.error('[conclusao] rotina falhou:', e.message));
  rodar();
  const temporizador = setInterval(rodar, 5 * MINUTO_MS);
  temporizador.unref();
}

module.exports = {
  horasParaConfirmar, prazoConfirmacao, chaveConferida, carregarPrestador, transferir,
  executarRepasse, confirmar, processarConclusoes, iniciarRotinaConclusao, repassarPendentesDoPrestador, dinheiro
};
