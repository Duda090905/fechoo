// US01 - normalizacao e validacao de e-mail, telefone e foto.

function normalizarEmail(valor) {
  return String(valor || '').trim().toLowerCase();
}

function emailValido(email) {
  return email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Guarda so os digitos (DDD + numero, 10 ou 11 digitos). O front formata.
// Devolve null para vazio e undefined quando o valor nao serve.
function normalizarTelefone(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.length === 10 || digitos.length === 11 ? digitos : undefined;
}

module.exports = { normalizarEmail, emailValido, normalizarTelefone };
