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

module.exports = { criarCobrancaPix, cancelarCobranca };
