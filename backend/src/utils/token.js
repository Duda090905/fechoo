const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function gerarJWT(usuario) {
  return jwt.sign(
    { id: usuario.id, tipo_perfil: usuario.tipo_perfil },
    process.env.JWT_SECRET || 'segredo-de-desenvolvimento',
    { expiresIn: process.env.JWT_EXPIRA || '8h' }
  );
}

function lerJWT(token) {
  return jwt.verify(token, process.env.JWT_SECRET || 'segredo-de-desenvolvimento');
}

// US03 - o token vai por e-mail em texto puro, mas no banco fica so o hash.
function gerarTokenRecuperacao() {
  const bruto = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(bruto).digest('hex');
  return { bruto, hash };
}

function hashDeToken(bruto) {
  return crypto.createHash('sha256').update(String(bruto)).digest('hex');
}

module.exports = { gerarJWT, lerJWT, gerarTokenRecuperacao, hashDeToken };
