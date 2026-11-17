/**
 * US17 - escolhe o gateway de pagamento.
 *
 *   PAGAMENTO_GATEWAY=asaas     sandbox do Asaas (precisa de ASAAS_API_KEY)
 *   PAGAMENTO_GATEWAY=simulado  gateway local, sem internet
 *
 * Sem a variavel: Asaas se houver ASAAS_API_KEY, senao simulado.
 */
const asaas = require('./asaas');
const simulado = require('./simulado');

function nomeGateway() {
  const escolhido = (process.env.PAGAMENTO_GATEWAY || '').trim().toLowerCase();
  if (escolhido === 'asaas' || escolhido === 'simulado') return escolhido;
  return process.env.ASAAS_API_KEY ? 'asaas' : 'simulado';
}

function atual() {
  return nomeGateway() === 'asaas' ? asaas : simulado;
}

function avisosDeConfiguracao() {
  const avisos = [];
  if (!process.env.ASAAS_WEBHOOK_TOKEN) {
    avisos.push('ASAAS_WEBHOOK_TOKEN vazio: todo aviso de pagamento (webhook) sera recusado.');
  }
  if (nomeGateway() === 'asaas' && !/sandbox/i.test(asaas.urlBase())) {
    avisos.push('ASAAS_URL nao aponta para o sandbox: nenhuma cobranca sera criada.');
  }
  return avisos;
}

module.exports = {
  nomeGateway,
  avisosDeConfiguracao,
  criarCobrancaPix: (dados) => atual().criarCobrancaPix(dados),
  cancelarCobranca: (cobrancaId, gateway) => (gateway === 'asaas' ? asaas : simulado).cancelarCobranca(cobrancaId),
  confirmarNoSandbox: asaas.confirmarNoSandbox,
  GatewayErro: asaas.GatewayErro
};
