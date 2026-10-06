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
 * US04 - Impressao do CPF.
 *
 * E o que continua guardado quando a pessoa apaga os dados: permite reconhecer
 * o mesmo CPF num cadastro futuro e reabrir a MESMA conta, sem guardar o numero.
 *
 * HMAC com chave secreta, e nao hash simples: so existem 10^11 CPFs, entao um
 * SHA-256 puro seria revertido por forca bruta em minutos. Sem a CPF_PEPPER,
 * quem copiar o banco nao reconstroi nenhum CPF.
 *
 * A CPF_PEPPER e definida uma vez e nunca mais trocada: se mudar, o sistema
 * deixa de reconhecer quem apagou a conta e voltou.
 */
const CHAVE_DESENVOLVIMENTO = 'chave-de-desenvolvimento-troque-no-env';

function impressaoCpf(valor) {
  const chave = process.env.CPF_PEPPER;
  if (!chave && process.env.NODE_ENV === 'production') {
    throw new Error('CPF_PEPPER nao definida no .env');
  }
  return crypto.createHmac('sha256', chave || CHAVE_DESENVOLVIMENTO).update(limpar(valor)).digest('hex');
}

module.exports = { cpfValido, limpar, impressaoCpf };
