require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rotas = require('./routes');
const { tratarErros, naoEncontrado } = require('./middlewares/erros');
const { raizUploads } = require('./servicos/armazenamento');

const app = express();

app.use(cors({ origin: process.env.URL_FRONT || '*' }));
app.use(express.json());

// Fotos de perfil. nosniff impede o navegador de tratar o arquivo como outro
// tipo; a politica cross-origin deixa o front (outra porta) exibir a imagem.
app.use('/uploads', express.static(raizUploads(), {
  index: false,
  dotfiles: 'deny',
  maxAge: '1h',
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

app.use('/api', rotas);
app.use(naoEncontrado);
app.use(tratarErros);

module.exports = app;
