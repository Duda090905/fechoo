const crypto = require('crypto');

// Validacao de CPF pelos digitos verificadores (US01).
function limpar(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function cpfValido(valor) {
  const cpf = limpar(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (ate) => {
    let soma = 0;
    for (let i = 0; i < ate; i += 1) soma += Number(cpf[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

/**
 * Impressao digital do CPF, usada para reconhecer alguem que apagou a conta
 * e voltou (US04).
 *
 * Usa HMAC com chave secreta, nao hash simples: so existem 10^11 CPFs
 * possiveis, entao um SHA-256 puro seria quebrado por forca bruta em
 * minutos. Com a chave no .env, quem roubar o banco nao consegue
 * reconstruir os documentos.
 */
function impressaoCpf(valor) {
  const chave = process.env.CPF_PEPPER || 'chave-de-desenvolvimento-troque-no-env';
  return crypto.createHmac('sha256', chave).update(limpar(valor)).digest('hex');
}

module.exports = { cpfValido, limpar, impressaoCpf };
