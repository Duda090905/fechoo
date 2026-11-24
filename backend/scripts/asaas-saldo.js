/**
 * Coloca saldo de teste na conta do Asaas SANDBOX (sem dinheiro real).
 *
 *   npm run asaas:saldo            (R$ 1.000,00)
 *   npm run asaas:saldo -- 500     (outro valor)
 *
 * Por que: no sandbox, a transferencia ao prestador (US20) e o estorno ao
 * cliente (US15) saem do saldo da conta. Um Pix que acabou de cair ainda nao
 * vira saldo para devolver, entao o estorno precisa de saldo extra.
 *
 * Usa a ASAAS_API_KEY e a ASAAS_URL do .env (a URL precisa ser a do sandbox).
 */
require('dotenv').config();
const asaas = require('../src/servicos/gateway/asaas');

async function rodar() {
  const valor = Number(process.argv.slice(2).find((a) => /^\d+([.,]\d+)?$/.test(a))?.replace(',', '.') || 1000);
  console.log(`Criando uma cobranca de teste de R$ ${valor.toFixed(2)} e marcando como paga no sandbox...`);
  const cobranca = await asaas.adicionarSaldoNoSandbox(valor);
  console.log(`  Cobranca ${cobranca} paga.`);
  // O saldo pode levar alguns segundos para aparecer.
  await new Promise((r) => setTimeout(r, 3000));
  const saldo = await asaas.consultarSaldo().catch(() => null);
  console.log(saldo === null
    ? '  Pronto. Confira o saldo no painel do Asaas (Extrato).'
    : `  Saldo atual da conta de teste: R$ ${Number(saldo).toFixed(2)}`);
}

rodar().catch((e) => {
  console.error('Nao deu certo:', e.message);
  if (e.detalhe) console.error('Detalhe:', e.detalhe);
  process.exit(1);
});
