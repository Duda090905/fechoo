/**
 * US17 - Gateway simulado. Faz o papel do Asaas sem internet: gera uma
 * cobranca com id proprio (sim_...) e um Pix copia e cola valido, com o
 * valor certo. Usado pelo npm run teste e como plano B na apresentacao.
 * O pagamento e confirmado pelo script npm run pix:pagar, que manda para a
 * API o mesmo aviso (webhook) que o Asaas mandaria.
 */
const crypto = require('crypto');
const { montarCopiaECola } = require('../../utils/pix');

async function criarCobrancaPix({ valor, identificador }) {
  return {
    cobranca_id: `sim_${crypto.randomBytes(8).toString('hex')}`,
    copia_cola: montarCopiaECola({
      chave: 'pix-simulado@fecho.app', valor, nome: 'Fecho', cidade: 'Campinas', txid: identificador
    }),
    qr_code: null // sem biblioteca de QR code; a tela mostra o copia e cola
  };
}

async function cancelarCobranca() {
  // Nada a fazer: a cobranca simulada so existe no banco do Fechô.
}

// US20 / US15 - repasse ao prestador. Sem banco de verdade: so gera o id e
// mostra no console o que o Asaas faria.
async function transferirPix({ valor, chave, descricao }) {
  const id = `sim_tr_${crypto.randomBytes(6).toString('hex')}`;
  console.log(`[pagamento] (simulado) Pix de R$ ${Number(valor).toFixed(2)} para a chave ***${String(chave).slice(-4)}: ${descricao}`);
  return { transferencia_id: id };
}

// US15 - devolucao ao contratante.
async function estornarCobranca(cobrancaId, { valor }) {
  const id = `sim_est_${crypto.randomBytes(6).toString('hex')}`;
  console.log(`[pagamento] (simulado) estorno de R$ ${Number(valor).toFixed(2)} da cobranca ${cobrancaId}`);
  return { estorno_id: id };
}

module.exports = { criarCobrancaPix, cancelarCobranca, transferirPix, estornarCobranca };
