/**
 * Paga o Pix de um servico, para testar e demonstrar a US18.
 *
 *   npm run pix:pagar -- <id do servico>
 *
 * Gateway "asaas" (sandbox): pede ao Asaas que considere a cobranca paga.
 *   O proprio Asaas manda entao o aviso (webhook) para o endereco cadastrado
 *   no painel dele. Para o aviso chegar ao seu computador, a API precisa
 *   estar exposta por um tunel (cloudflared ou ngrok); veja o README.
 *
 * Gateway "simulado", ou com --local: o script manda para a API local o
 *   mesmo aviso que o Asaas mandaria, com o token do .env.
 *
 * Opcoes para demonstrar os criterios de aceite da US18:
 *   --repetir        manda o mesmo aviso duas vezes (idempotencia)
 *   --token-errado   manda o aviso com um token falso (deve dar 401)
 *   --local          ignora o Asaas e manda o aviso direto para a API local
 */
require('dotenv').config();
const crypto = require('crypto');
const { sequelize, Pagamento } = require('../src/models');
const { confirmarNoSandbox } = require('../src/servicos/gateway');

const argumentos = process.argv.slice(2);
const servicoId = Number(argumentos.find((a) => /^\d+$/.test(a)));
const opcao = (nome) => argumentos.includes(`--${nome}`);
const API = `http://localhost:${process.env.PORT || 3333}/api`;

async function mandarAviso(pagamento, { eventoId, token }) {
  const corpo = {
    id: eventoId,
    event: 'PAYMENT_RECEIVED',
    dateCreated: new Date().toISOString().slice(0, 19).replace('T', ' '),
    payment: {
      object: 'payment',
      id: pagamento.cobranca_id,
      value: Number(pagamento.valor),
      externalReference: pagamento.identificador,
      billingType: 'PIX',
      status: 'RECEIVED'
    }
  };
  const resposta = await fetch(`${API}/pagamentos/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'asaas-access-token': token },
    body: JSON.stringify(corpo)
  });
  const dados = await resposta.json().catch(() => ({}));
  console.log(`  HTTP ${resposta.status}`, JSON.stringify(dados));
}

async function rodar() {
  if (!servicoId) {
    console.log('Uso: npm run pix:pagar -- <id do servico> [--repetir] [--token-errado] [--local]');
    return;
  }
  const pagamento = await Pagamento.findOne({
    where: { servico_id: servicoId, status: 'aguardando', expirado_em: null },
    order: [['id', 'DESC']]
  });
  if (!pagamento) {
    console.log(`O servico ${servicoId} nao tem Pix esperando pagamento. Aceite o orcamento antes.`);
    return;
  }
  console.log(`Pix do servico ${servicoId}: R$ ${Number(pagamento.valor).toFixed(2)} (${pagamento.gateway}, ${pagamento.cobranca_id})`);

  if (pagamento.gateway === 'asaas' && !opcao('local')) {
    await confirmarNoSandbox(pagamento.cobranca_id);
    console.log('  O sandbox do Asaas marcou a cobranca como paga. O aviso chega pelo webhook em alguns segundos.');
    return;
  }

  const token = opcao('token-errado') ? 'token-falso-de-demonstracao' : (process.env.ASAAS_WEBHOOK_TOKEN || '');
  const eventoId = `evt_local_${crypto.randomBytes(6).toString('hex')}`;
  console.log(`Mandando o aviso ${eventoId} para ${API}/pagamentos/webhook`);
  await mandarAviso(pagamento, { eventoId, token });
  if (opcao('repetir')) {
    console.log('Mandando o MESMO aviso de novo:');
    await mandarAviso(pagamento, { eventoId, token });
  }
}

rodar()
  .catch((e) => {
    console.error('Falhou:', e.detalhe || e.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close().catch(() => {}));
