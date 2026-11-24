const crypto = require('crypto');
const { aplicarEvento } = require('../servicos/cobrancas');

// Compara os dois textos em tempo constante, para o tempo de resposta nao
// entregar quantos caracteres do token estao certos.
function mesmoToken(recebido, esperado) {
  const a = Buffer.from(String(recebido || ''));
  const b = Buffer.from(String(esperado || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

/**
 * US18 - POST /api/pagamentos/webhook
 *
 * Quem chama e o Asaas, nao uma pessoa: nao ha login. A autenticidade vem do
 * token secreto que o Asaas manda no cabecalho asaas-access-token (o mesmo
 * cadastrado no painel do Asaas e guardado no .env como ASAAS_WEBHOOK_TOKEN).
 *
 * Respostas:
 *   401 token ausente ou errado (nada e gravado)
 *   400 aviso sem id ou sem tipo
 *   200 aviso registrado (inclusive repetido ou de um tipo que nao usamos:
 *       o Asaas so precisa saber que chegou; responder erro faz ele reenviar
 *       e, depois de 15 falhas seguidas, pausar a fila de avisos)
 *   500 falha nossa: nada fica gravado e o Asaas reenvia depois
 */
async function webhook(req, res, next) {
  try {
    if (!mesmoToken(req.get('asaas-access-token'), process.env.ASAAS_WEBHOOK_TOKEN)) {
      return res.status(401).json({ erro: 'Aviso de pagamento não autorizado.' });
    }

    const corpo = req.body || {};
    const pagamento = corpo.payment || {};
    if (typeof corpo.id !== 'string' || !corpo.id || typeof corpo.event !== 'string' || !corpo.event) {
      return res.status(400).json({ erro: 'Aviso de pagamento incompleto.' });
    }

    const resultado = await aplicarEvento({
      eventoId: corpo.id,
      tipo: corpo.event,
      cobrancaId: typeof pagamento.id === 'string' ? pagamento.id : null,
      referencia: typeof pagamento.externalReference === 'string' ? pagamento.externalReference : null,
      valor: pagamento.value === undefined ? undefined : Number(pagamento.value)
    });
    return res.json({ recebido: true, resultado });
  } catch (e) {
    return next(e);
  }
}

module.exports = { webhook };
