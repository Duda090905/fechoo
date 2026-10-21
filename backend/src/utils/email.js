const nodemailer = require('nodemailer');

// Sem SMTP configurado o link cai no console. Serve para desenvolver e
// para demonstrar em banca sem depender de internet.
let transporte = null;
if (process.env.SMTP_HOST) {
  transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 2525),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function enviarLinkRecuperacao(email, link) {
  if (!transporte) {
    console.log('\n[recuperacao de senha] destinatario:', email);
    console.log('[recuperacao de senha] link:', link, '\n');
    return { simulado: true };
  }

  await transporte.sendMail({
    from: 'Fecho <nao-responda@fecho.app>',
    to: email,
    subject: 'Redefinir sua senha no Fecho',
    text: `Voce pediu para trocar sua senha. Abra o link abaixo em ate 30 minutos:\n\n${link}\n\nSe nao foi voce, ignore esta mensagem.`
  });
  return { simulado: false };
}

// US04 - aviso de que os dados de uma conta desativada serao apagados.
async function enviarAvisoRetencao(email, dataLimite) {
  const data = dataLimite.toLocaleDateString('pt-BR');
  const texto = `Sua conta no Fecho esta desativada. Se voce nao voltar a entrar ate ${data}, `
    + 'seus dados pessoais serao apagados. Para manter sua conta, basta entrar e reativa-la.';

  if (!transporte) {
    console.log('\n[retencao] destinatario:', email);
    console.log('[retencao] aviso:', texto, '\n');
    return { simulado: true };
  }

  await transporte.sendMail({
    from: 'Fecho <nao-responda@fecho.app>',
    to: email,
    subject: 'Seus dados no Fecho serao apagados',
    text: texto
  });
  return { simulado: false };
}

// US13 - lembrete da vespera do atendimento, para as duas partes.
// Vai sem endereco: o e-mail so diz quando e com quem.
async function enviarLembreteServico(email, { horario, outraParte, descricao }) {
  const quando = new Date(horario).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
  });
  const texto = `Lembrete do Fechô: seu atendimento com ${outraParte} está marcado para ${quando}.\n\n`
    + `Pedido: ${descricao}\n\nQualquer combinado, use o chat do serviço.`;

  if (!transporte) {
    console.log('\n[lembrete] destinatario:', email);
    console.log('[lembrete]', texto.replace(/\n+/g, ' '), '\n');
    return { simulado: true };
  }

  await transporte.sendMail({
    from: 'Fecho <nao-responda@fecho.app>',
    to: email,
    subject: 'Lembrete do seu atendimento no Fechô',
    text: texto
  });
  return { simulado: false };
}

// US11 / US18 - aviso de pagamento garantido (prestador) e de pagamento
// confirmado (contratante). Vai sem endereco: ele so aparece no app, com log.
async function enviarAvisoServico(email, { titulo, texto }) {
  if (!transporte) {
    console.log('\n[aviso] destinatario:', email);
    console.log(`[aviso] ${titulo}: ${texto}\n`);
    return { simulado: true };
  }

  await transporte.sendMail({
    from: 'Fecho <nao-responda@fecho.app>',
    to: email,
    subject: `${titulo} - Fechô`,
    text: `${texto}\n\nAbra o Fechô para ver os detalhes do pedido.`
  });
  return { simulado: false };
}

module.exports = { enviarLinkRecuperacao, enviarAvisoRetencao, enviarLembreteServico, enviarAvisoServico };
