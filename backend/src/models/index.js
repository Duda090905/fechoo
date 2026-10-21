const sequelize = require('../config/database');

const Usuario = require('./Usuario');
const Prestador = require('./Prestador');
const Area = require('./Area');
const Categoria = require('./Categoria');
const Bairro = require('./Bairro');
const TokenSenha = require('./TokenSenha');
const Pausa = require('./Pausa');
const SolicitacaoExclusao = require('./SolicitacaoExclusao');
const PrestadorCategoria = require('./PrestadorCategoria');
const PrestadorBairro = require('./PrestadorBairro');
const Servico = require('./Servico');
const Mensagem = require('./Mensagem');
const Pagamento = require('./Pagamento');
const EventoWebhook = require('./EventoWebhook');
const AcessoEndereco = require('./AcessoEndereco');
const Notificacao = require('./Notificacao');

const models = {
  Usuario, Prestador, Area, Categoria, Bairro, TokenSenha, Pausa, SolicitacaoExclusao,
  PrestadorCategoria, PrestadorBairro, Servico, Mensagem,
  Pagamento, EventoWebhook, AcessoEndereco, Notificacao
};

Object.values(models).forEach((model) => model.init(sequelize));
Object.values(models).forEach((model) => {
  if (model.associate) model.associate(models);
});

module.exports = { sequelize, ...models };
