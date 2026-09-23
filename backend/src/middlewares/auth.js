const { lerJWT } = require('../utils/token');
const { Usuario } = require('../models');

// US02 - toda rota protegida passa por aqui.
async function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const [, token] = cabecalho.split(' ');

  if (!token) {
    return res.status(401).json({ erro: 'Voce precisa entrar para acessar isso.' });
  }

  try {
    const dados = lerJWT(token);
    const usuario = await Usuario.findByPk(dados.id);

    // Conta inativa entra, porque precisa poder se reativar. Quem barra o
    // resto e o exigirAtivo, aplicado nas demais rotas protegidas.
    if (!usuario || !['ativo', 'inativo'].includes(usuario.status)) {
      return res.status(401).json({ erro: 'Sessao invalida. Entre novamente.' });
    }

    req.usuario = usuario;
    return next();
  } catch (e) {
    return res.status(401).json({ erro: 'Sessao expirada. Entre novamente.' });
  }
}

function apenasPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.usuario || !perfis.includes(req.usuario.tipo_perfil)) {
      return res.status(403).json({ erro: 'Seu perfil nao tem acesso a esta area.' });
    }
    return next();
  };
}

function exigirAtivo(req, res, next) {
  if (req.usuario.status === 'inativo') {
    return res.status(403).json({
      erro: 'Sua conta esta desativada. Reative para continuar usando o Fecho.',
      conta_inativa: true
    });
  }
  return next();
}

module.exports = { autenticar, apenasPerfil, exigirAtivo };
