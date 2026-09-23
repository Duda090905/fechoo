require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rotas = require('./routes');
const { tratarErros, naoEncontrado } = require('./middlewares/erros');

const app = express();

app.use(cors({ origin: process.env.URL_FRONT || '*' }));
app.use(express.json());
app.use('/api', rotas);
app.use(naoEncontrado);
app.use(tratarErros);

module.exports = app;
