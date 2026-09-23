// Handler unico. Mensagem de erro em linguagem de gente, nunca stack no front.
function tratarErros(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ erro: 'Esse dado ja esta cadastrado.' });
  }

  return res.status(500).json({ erro: 'Algo deu errado do nosso lado. Tente de novo.' });
}

function naoEncontrado(req, res) {
  return res.status(404).json({ erro: 'Endereco nao encontrado.' });
}

module.exports = { tratarErros, naoEncontrado };
