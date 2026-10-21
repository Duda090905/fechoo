/**
 * US17 / US18 / US11 - cobranca Pix, confirmacao pelo gateway e aceite.
 *
 * Fluxo (maquina de estados do projeto):
 *   1. O contratante aceita o orcamento: o sistema gera a cobranca Pix.
 *      Pagamento = aguardando. O servico continua em orcamento_enviado.
 *   2. O gateway avisa por webhook que o Pix caiu: pagamento = retido e
 *      servico = aceito, na mesma transacao. So agora o endereco e liberado
 *      (US11) e as duas partes sao avisadas.
 *   3. Se o prazo para pagar acabar, a cobranca e cancelada no gateway e o
 *      servico segue em orcamento_enviado, com o aceite liberado de novo.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize, Servico, Pagamento, EventoWebhook, Notificacao, Usuario, Prestador
} = require('../models');
const gateway = require('./gateway');
const { enviarAvisoServico } = require('../utils/email');

const MINUTO_MS = 60 * 1000;

// Minutos para pagar o Pix depois de aceitar o orcamento.
function minutosParaPagar() {
  const minutos = Number(process.env.PIX_EXPIRA_MINUTOS);
  return Number.isInteger(minutos) && minutos > 0 ? minutos : 30;
}

// Eventos do Asaas que significam "o dinheiro chegou". Para Pix o Asaas
// manda PAYMENT_RECEIVED; PAYMENT_CONFIRMED fica por garantia.
const EVENTOS_PAGO = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];

function emReais(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

// Situacao do pagamento num instante, sem mexer no banco (serve para listas).
function emAberto(pagamento, agora = new Date()) {
  return Boolean(pagamento) && pagamento.status === 'aguardando' && !pagamento.expirado_em
    && new Date(pagamento.expira_em).getTime() > agora.getTime();
}

// Encerra a cobranca vencida: marca no banco e cancela no gateway, para que
// ninguem consiga pagar depois do prazo. Falha no gateway nao trava o resto.
async function encerrarSeVencida(pagamento, agora = new Date()) {
  if (!pagamento || pagamento.status !== 'aguardando' || pagamento.expirado_em) return false;
  if (new Date(pagamento.expira_em).getTime() > agora.getTime()) return false;
  pagamento.expirado_em = agora;
  await pagamento.save();
  if (pagamento.cobranca_id) {
    try {
      await gateway.cancelarCobranca(pagamento.cobranca_id, pagamento.gateway);
    } catch (e) {
      console.error(`[pagamento] nao consegui cancelar a cobranca ${pagamento.cobranca_id}:`, e.detalhe || e.message);
    }
  }
  return true;
}

// Pagamento mais recente do servico (ja com a cobranca vencida encerrada).
async function pagamentoDoServico(servicoId, agora = new Date()) {
  const pagamento = await Pagamento.findOne({ where: { servico_id: servicoId }, order: [['id', 'DESC']] });
  await encerrarSeVencida(pagamento, agora);
  return pagamento;
}

// Rotina: encerra as cobrancas vencidas de todos os servicos.
async function expirarCobrancas(agora = new Date()) {
  const vencidas = await Pagamento.findAll({
    where: { status: 'aguardando', expirado_em: null, expira_em: { [Op.lte]: agora } }
  });
  for (const pagamento of vencidas) await encerrarSeVencida(pagamento, agora);
  return { expiradas: vencidas.length };
}

function iniciarRotinaCobrancas() {
  const rodar = () => expirarCobrancas()
    .then((r) => { if (r.expiradas) console.log('[pagamento] cobrancas vencidas encerradas:', r.expiradas); })
    .catch((e) => console.error('[pagamento] rotina falhou:', e.message));
  rodar();
  const temporizador = setInterval(rodar, MINUTO_MS);
  temporizador.unref();
}

/**
 * US17 - gera a cobranca Pix de um servico com orcamento.
 * Valor = exatamente o total do orcamento aceito (servico + deslocamento).
 */
async function gerarCobranca(servico, contratante, agora = new Date()) {
  const valor = emReais(Number(servico.valor) + Number(servico.taxa_deslocamento || 0));
  // Identificador unico, vinculado ao servico: vai e volta pelo gateway.
  const identificador = `fecho-s${servico.id}-${crypto.randomBytes(4).toString('hex')}`;
  const cobranca = await gateway.criarCobrancaPix({
    contratante,
    valor,
    identificador,
    descricao: `Fechô - serviço ${servico.id}: ${servico.descricao}`
  });
  return Pagamento.create({
    servico_id: servico.id,
    valor,
    status: 'aguardando',
    identificador,
    gateway: gateway.nomeGateway(),
    cobranca_id: cobranca.cobranca_id,
    pix_copia_cola: cobranca.copia_cola,
    pix_qr_code: cobranca.qr_code,
    expira_em: new Date(agora.getTime() + minutosParaPagar() * MINUTO_MS)
  });
}

// US11 / US18 - avisos para as duas partes (no app; o e-mail vai depois).
async function criarAvisos(servico, transaction) {
  const completo = await Servico.findByPk(servico.id, {
    transaction,
    include: [
      { model: Usuario, as: 'contratante', attributes: ['id', 'nome', 'email'] },
      { model: Prestador, as: 'prestador', attributes: ['id'], include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nome', 'email'] }] }
    ]
  });
  const contratante = completo.contratante;
  const prestador = completo.prestador && completo.prestador.usuario;
  const avisos = [];
  if (prestador) {
    avisos.push({
      usuario: prestador,
      tipo: 'pagamento_garantido',
      titulo: 'Pagamento garantido',
      texto: `${contratante ? contratante.nome : 'O cliente'} aceitou seu orçamento e o pagamento já está congelado no Fechô. `
        + 'O endereço do atendimento foi liberado no pedido.'
    });
  }
  if (contratante) {
    avisos.push({
      usuario: contratante,
      tipo: 'pagamento_confirmado',
      titulo: 'Pagamento confirmado',
      texto: 'Recebemos seu Pix. O dinheiro fica guardado até você confirmar que o serviço foi feito.'
    });
  }
  for (const aviso of avisos) {
    // findOrCreate + indice unico: o mesmo aviso nunca sai duas vezes.
    await Notificacao.findOrCreate({
      where: { usuario_id: aviso.usuario.id, servico_id: servico.id, tipo: aviso.tipo },
      defaults: { titulo: aviso.titulo, texto: aviso.texto },
      transaction
    });
  }
  return avisos;
}

/**
 * US18 - aplica um aviso do gateway. Devolve o resultado (texto curto).
 *
 * Tudo numa transacao: o registro do evento (id unico) e a mudanca de
 * status entram juntos. Se o mesmo evento chegar de novo, o id repetido e
 * recusado pelo banco e nada e refeito. Se algo falhar no meio, nada fica
 * gravado e o gateway reenvia depois.
 */
async function aplicarEvento({ eventoId, tipo, cobrancaId, referencia, valor }, agora = new Date()) {
  const transaction = await sequelize.transaction();
  let avisos = [];
  let outrasCobrancas = [];
  let resultado;
  try {
    let evento;
    try {
      evento = await EventoWebhook.create(
        { evento_id: eventoId, tipo, cobranca_id: cobrancaId || null, resultado: 'processando' },
        { transaction }
      );
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError') {
        await transaction.rollback();
        return 'duplicado';
      }
      throw e;
    }

    const pagamento = cobrancaId
      ? await Pagamento.findOne({ where: { cobranca_id: cobrancaId }, transaction })
      : null;

    if (!EVENTOS_PAGO.includes(tipo)) {
      resultado = 'ignorado';
    } else if (!pagamento) {
      resultado = 'cobranca_desconhecida';
    } else if (referencia && referencia !== pagamento.identificador) {
      // O identificador que volta precisa ser o do servico certo.
      resultado = 'referencia_nao_confere';
    } else if (valor !== undefined && valor !== null && emReais(valor) !== emReais(pagamento.valor)) {
      resultado = 'valor_nao_confere';
    } else if (pagamento.status !== 'aguardando') {
      resultado = 'ja_processado';
    } else {
      const servico = await Servico.findByPk(pagamento.servico_id, { transaction });
      if (!servico || servico.status !== 'orcamento_enviado') {
        // Pix pago para um servico que ja seguiu outro caminho (recusado,
        // por exemplo). Nao muda nada: a devolucao e a US15 / US25.
        resultado = 'servico_fora_do_fluxo';
      } else {
        pagamento.status = 'retido';
        pagamento.retido_em = agora;
        await pagamento.save({ transaction });
        servico.status = 'aceito';
        servico.aceito_em = agora;
        await servico.save({ transaction });
        avisos = await criarAvisos(servico, transaction);
        // Se o contratante tinha gerado outro Pix para o mesmo servico, ele
        // deixa de valer: o servico ja esta pago (evita pagar duas vezes).
        outrasCobrancas = await Pagamento.findAll({
          where: { servico_id: servico.id, status: 'aguardando', expirado_em: null, id: { [Op.ne]: pagamento.id } },
          transaction
        });
        for (const outra of outrasCobrancas) {
          outra.expira_em = agora;
          outra.expirado_em = agora;
          await outra.save({ transaction });
        }
        // Pago no ultimo instante, depois do prazo: o dinheiro chegou, entao vale.
        resultado = pagamento.expirado_em ? 'pagamento_retido_fora_do_prazo' : 'pagamento_retido';
      }
    }

    evento.resultado = resultado;
    await evento.save({ transaction });
    await transaction.commit();
  } catch (e) {
    if (!transaction.finished) await transaction.rollback();
    throw e;
  }

  if (['servico_fora_do_fluxo', 'valor_nao_confere', 'referencia_nao_confere'].includes(resultado)) {
    console.warn(`[pagamento] evento ${eventoId} (${cobrancaId}) precisa de atencao: ${resultado}`);
  }

  for (const outra of outrasCobrancas) {
    try {
      await gateway.cancelarCobranca(outra.cobranca_id, outra.gateway);
    } catch (e) {
      console.error(`[pagamento] nao consegui cancelar a cobranca ${outra.cobranca_id}:`, e.detalhe || e.message);
    }
  }

  // E-mail depois do commit: falha no envio nao desfaz o pagamento.
  for (const aviso of avisos) {
    if (!aviso.usuario.email) continue;
    try {
      await enviarAvisoServico(aviso.usuario.email, { titulo: aviso.titulo, texto: aviso.texto });
    } catch (e) {
      console.error('[pagamento] falha ao enviar e-mail de aviso:', e.message);
    }
  }
  return resultado;
}

module.exports = {
  minutosParaPagar,
  emAberto,
  encerrarSeVencida,
  pagamentoDoServico,
  expirarCobrancas,
  iniciarRotinaCobrancas,
  gerarCobranca,
  aplicarEvento,
  EVENTOS_PAGO
};
