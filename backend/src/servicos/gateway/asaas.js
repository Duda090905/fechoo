/**
 * US17 - Gateway Asaas, SOMENTE no sandbox (sem dinheiro real).
 *
 * Usa o fetch do proprio Node (sem biblioteca nova). A chave da API fica no
 * .env (ASAAS_API_KEY) e nunca aparece em log nem na resposta da API.
 *
 * Documentacao: https://docs.asaas.com
 *   POST   /customers                       cria o cliente (nome + CPF)
 *   POST   /payments                        cria a cobranca Pix
 *   GET    /payments/{id}/pixQrCode         QR code e copia e cola
 *   DELETE /payments/{id}                   cancela a cobranca
 *   POST   /sandbox/payment/{id}/confirm    (so sandbox) simula o pagamento
 */
const URL_PADRAO = 'https://api-sandbox.asaas.com/v3';
const TEMPO_LIMITE_MS = 10000;

class GatewayErro extends Error {
  constructor(mensagem, detalhe) {
    super(mensagem);
    this.name = 'GatewayErro';
    this.detalhe = detalhe;
  }
}

function urlBase() {
  return (process.env.ASAAS_URL || URL_PADRAO).replace(/\/+$/, '');
}

// Trava de seguranca: o projeto nao usa credencial de producao.
function conferirSandbox() {
  if (!/sandbox/i.test(urlBase())) {
    throw new GatewayErro(
      'O Fechô só conversa com o sandbox do Asaas.',
      `ASAAS_URL nao aponta para o sandbox: ${urlBase()}`
    );
  }
  if (!process.env.ASAAS_API_KEY) {
    throw new GatewayErro('O pagamento não está configurado.', 'ASAAS_API_KEY vazia no .env');
  }
}

async function chamar(caminho, { metodo = 'GET', corpo } = {}) {
  conferirSandbox();
  let resposta;
  try {
    resposta = await fetch(`${urlBase()}${caminho}`, {
      method: metodo,
      headers: {
        access_token: process.env.ASAAS_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'fecho/3.0 (PUC-Campinas, sandbox)'
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS)
    });
  } catch (e) {
    throw new GatewayErro('Não consegui falar com o banco agora. Tente de novo em alguns minutos.', `${metodo} ${caminho}: ${e.message}`);
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const descricao = (dados.errors || []).map((e) => e.description).join('; ') || `HTTP ${resposta.status}`;
    throw new GatewayErro('O banco recusou o pedido de pagamento. Tente de novo em alguns minutos.', `${metodo} ${caminho}: ${descricao}`);
  }
  return dados;
}

// Data de hoje no fuso de Campinas, no formato do Asaas (AAAA-MM-DD).
function hojeEmCampinas() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// O Asaas exige um cliente com nome e CPF para emitir a cobranca. O id do
// cliente fica guardado na conta, para nao criar outro a cada pagamento.
async function garantirCliente(contratante) {
  if (contratante.asaas_cliente_id) return contratante.asaas_cliente_id;
  const cliente = await chamar('/customers', {
    metodo: 'POST',
    corpo: {
      name: contratante.nome,
      cpfCnpj: contratante.cpf,
      externalReference: `usuario-${contratante.id}`,
      notificationDisabled: true // quem avisa a pessoa e o Fechô, nao o Asaas
    }
  });
  contratante.asaas_cliente_id = cliente.id;
  await contratante.save();
  return cliente.id;
}

async function criarCobrancaPix({ contratante, valor, identificador, descricao }) {
  const cliente = await garantirCliente(contratante);
  const cobranca = await chamar('/payments', {
    metodo: 'POST',
    corpo: {
      customer: cliente,
      billingType: 'PIX',
      value: valor,
      dueDate: hojeEmCampinas(),
      description: descricao.slice(0, 500),
      externalReference: identificador
    }
  });
  const qr = await chamar(`/payments/${cobranca.id}/pixQrCode`);
  return { cobranca_id: cobranca.id, copia_cola: qr.payload, qr_code: qr.encodedImage || null };
}

async function cancelarCobranca(cobrancaId) {
  await chamar(`/payments/${cobrancaId}`, { metodo: 'DELETE' });
}

// So existe no sandbox: faz o Asaas tratar a cobranca como paga. Ele entao
// manda o webhook PAYMENT_RECEIVED para o endereco cadastrado.
async function confirmarNoSandbox(cobrancaId) {
  return chamar(`/sandbox/payment/${cobrancaId}/confirm`, { metodo: 'POST' });
}

module.exports = { criarCobrancaPix, cancelarCobranca, confirmarNoSandbox, GatewayErro, urlBase };
