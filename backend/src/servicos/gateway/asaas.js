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

/**
 * US20 / US15 - transfere por Pix da conta do Fechô no Asaas para a chave do
 * prestador (repasse do servico ou multa de cancelamento).
 *   POST /transfers  { value, operationType, pixAddressKey, pixAddressKeyType, description }
 * No MVP a chave e sempre o CPF do prestador (US06).
 *
 * Sandbox: um CPF inventado nao existe como chave Pix no ambiente de testes,
 * e a transferencia seria recusada. O Asaas oferece chaves de homologacao do
 * Banco Central (ex.: cliente-a00001@pix.bcb.gov.br): a transferencia sai e
 * debita o saldo, mas nao credita ninguem. ASAAS_CHAVE_PIX_TESTE escolhe
 * essa chave; o padrao e a primeira da lista. Com ASAAS_CHAVE_PIX_TESTE=cpf,
 * vai para o CPF do prestador (so funciona se ele for chave de outra conta
 * sandbox). A conferencia do CPF (US06 / US20) acontece antes, no Fechô.
 */
const CHAVE_TESTE_PADRAO = 'cliente-a00001@pix.bcb.gov.br';

function tipoDaChave(chave) {
  if (chave.includes('@')) return 'EMAIL';
  if (/^\d{11}$/.test(chave)) return 'CPF';
  if (/^\d{14}$/.test(chave)) return 'CNPJ';
  if (/^\+?\d{10,13}$/.test(chave)) return 'PHONE';
  return 'EVP';
}

function chaveDeDestino(chaveDoPrestador) {
  const teste = (process.env.ASAAS_CHAVE_PIX_TESTE ?? CHAVE_TESTE_PADRAO).trim();
  if (!teste || teste.toLowerCase() === 'cpf') return chaveDoPrestador;
  return teste;
}

async function transferirPix({ valor, chave, descricao }) {
  const destino = chaveDeDestino(chave);
  const transferencia = await chamar('/transfers', {
    metodo: 'POST',
    corpo: {
      value: valor,
      operationType: 'PIX',
      pixAddressKey: destino,
      pixAddressKeyType: tipoDaChave(destino),
      description: descricao.slice(0, 140)
    }
  });
  if (transferencia.status && transferencia.status !== 'DONE') {
    // Ex.: PENDING esperando a confirmacao de seguranca (no sandbox, token 000000).
    console.log(`[pagamento] (asaas) transferencia ${transferencia.id} criada com status ${transferencia.status}`);
  }
  return { transferencia_id: transferencia.id };
}

/**
 * Sandbox: coloca saldo de teste na conta (o estorno e a transferencia
 * precisam de saldo). Cria um cliente ficticio, uma cobranca Pix e pede ao
 * Asaas que a considere paga. Usado pelo npm run asaas:saldo.
 */
async function adicionarSaldoNoSandbox(valor) {
  const cliente = await chamar('/customers', {
    metodo: 'POST',
    corpo: {
      name: 'Saldo de teste Fecho', cpfCnpj: '24971563792', externalReference: 'fecho-saldo-teste', notificationDisabled: true
    }
  });
  const cobranca = await chamar('/payments', {
    metodo: 'POST',
    corpo: {
      customer: cliente.id, billingType: 'PIX', value: valor, dueDate: hojeEmCampinas(),
      description: 'Fechô - saldo para testes no sandbox', externalReference: 'fecho-saldo-teste'
    }
  });
  await confirmarNoSandbox(cobranca.id);
  return cobranca.id;
}

async function consultarSaldo() {
  const dados = await chamar('/finance/balance');
  return dados.balance;
}

/**
 * US15 - devolve ao contratante o valor (inteiro ou parte) de uma cobranca paga.
 *   POST /payments/{id}/refund  { value, description }
 */
async function estornarCobranca(cobrancaId, { valor, descricao }) {
  const resposta = await chamar(`/payments/${cobrancaId}/refund`, {
    metodo: 'POST',
    corpo: { value: valor, description: descricao.slice(0, 140) }
  });
  return { estorno_id: (resposta.refunds && resposta.refunds[0] && resposta.refunds[0].id) || resposta.id || cobrancaId };
}

module.exports = {
  criarCobrancaPix, cancelarCobranca, confirmarNoSandbox, transferirPix, estornarCobranca, GatewayErro, urlBase,
  adicionarSaldoNoSandbox, consultarSaldo, chaveDeDestino, tipoDaChave
};
