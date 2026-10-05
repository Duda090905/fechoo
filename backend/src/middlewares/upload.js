const multer = require('multer');

const LIMITE_BYTES = 2 * 1024 * 1024;

// Fica em memoria: so grava em disco depois de conferir que e imagem de verdade.
const receber = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_BYTES, files: 1 }
}).single('foto');

// US05 - recebe o campo "foto" de um formulario multipart.
function receberFoto(req, res, next) {
  receber(req, res, (erro) => {
    if (!erro) return next();
    if (erro.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ erro: 'A foto pode ter no maximo 2 MB.' });
    }
    return res.status(400).json({ erro: 'Nao consegui ler o arquivo enviado.' });
  });
}

module.exports = { receberFoto };
