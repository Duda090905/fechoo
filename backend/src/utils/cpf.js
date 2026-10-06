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

module.exports = { cpfValido, limpar };
