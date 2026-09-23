const bcrypt = require('bcryptjs');

const REGRA = 'A senha precisa ter ao menos 8 caracteres, com letra e numero.';

function senhaForte(senha) {
  const valor = String(senha || '');
  return valor.length >= 8 && /[A-Za-z]/.test(valor) && /\d/.test(valor);
}

async function gerarHash(senha) {
  return bcrypt.hash(senha, 10);
}

async function conferir(senha, hash) {
  if (!hash) return false;
  return bcrypt.compare(senha, hash);
}

module.exports = { senhaForte, gerarHash, conferir, REGRA };
