const multer = require('multer');

const LIMITE_BYTES = 2 * 1024 * 1024;
// US10 - quantas fotos cabem no pedido de servico.
const LIMITE_FOTOS_PEDIDO = 3;

// Fica em memoria: so grava em disco depois de conferir que e imagem de verdade.
function receptor(montar, mensagens) {
  return (req, res, next) => {
    montar(req, res, (erro) => {
      if (!erro) return next();
      if (erro.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ erro: mensagens.tamanho });
      }
      if (erro.code === 'LIMIT_FILE_COUNT' || erro.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ erro: mensagens.quantidade });
      }
      return res.status(400).json({ erro: 'Nao consegui ler o arquivo enviado.' });
    });
  };
}

// US05 - recebe o campo "foto" de um formulario multipart.
const receberFoto = receptor(
  multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITE_BYTES, files: 1 } }).single('foto'),
  { tamanho: 'A foto pode ter no maximo 2 MB.', quantidade: 'Nao consegui ler o arquivo enviado.' }
);

// US10 - campo "fotos" do pedido de servico, ate LIMITE_FOTOS_PEDIDO.
const receberFotosPedido = receptor(
  multer({
    storage: multer.memoryStorage(), limits: { fileSize: LIMITE_BYTES, files: LIMITE_FOTOS_PEDIDO }
  }).array('fotos', LIMITE_FOTOS_PEDIDO),
  {
    tamanho: 'Cada foto pode ter no máximo 2 MB.',
    quantidade: `Envie no máximo ${LIMITE_FOTOS_PEDIDO} fotos.`
  }
);

// US12 - campo "imagem" de uma mensagem do chat.
const receberImagemChat = receptor(
  multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITE_BYTES, files: 1 } }).single('imagem'),
  { tamanho: 'A imagem pode ter no máximo 2 MB.', quantidade: 'Envie uma imagem por mensagem.' }
);

module.exports = { receberFoto, receberFotosPedido, receberImagemChat, LIMITE_FOTOS_PEDIDO };
