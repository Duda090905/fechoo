const sequelize = require('../config/database');

const Usuario = require('./Usuario');
const Prestador = require('./Prestador');
const Area = require('./Area');
const Categoria = require('./Categoria');
const Bairro = require('./Bairro');
const TokenSenha = require('./TokenSenha');

const models = { Usuario, Prestador, Area, Categoria, Bairro, TokenSenha };

Object.values(models).forEach((model) => model.init(sequelize));
Object.values(models).forEach((model) => {
  if (model.associate) model.associate(models);
});

module.exports = { sequelize, ...models };
