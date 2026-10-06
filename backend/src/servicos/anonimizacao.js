const { Prestador, TokenSenha } = require('../models');
const { removerFotoPerfil } = require('./armazenamento');
const { encerrarPausa } = require('./pausas');
const { impressaoCpf } = require('../utils/cpf');

/**
 * US04 - Anonimiza uma conta: apaga nome, e-mail, CPF, telefone, senha e a
 * foto (inclusive o arquivo no disco), tira o prestador das buscas e marca a
 * conta como "excluido".
 *
 * O registro em si fica, com a impressao do CPF (HMAC, nao o numero). E o que
 * permite manter o historico da conta sem identificar a pessoa e, se ela se
 * cadastrar de novo com o mesmo CPF, reabrir esta mesma conta em vez de criar
 * uma nova (ver servicos/reabertura.js).
 *
 * Usada tanto pelo botao "Apagar meus dados" quanto pela rotina de retencao.
 * Quem chama confere antes se ha pendencias.
 */
async function anonimizarConta(usuario) {
  const prestador = await Prestador.findOne({ where: { usuario_id: usuario.id } });
  if (prestador) {
    // A foto e dado pessoal: some do disco, nao so do banco.
    await removerFotoPerfil(prestador.foto_url);
    prestador.status = 'suspenso';
    prestador.descricao = null;
    prestador.foto_url = null;
    await prestador.save();
    await prestador.setCategorias([]);
    await prestador.setBairros([]);
    await encerrarPausa(prestador);
  }

  // Contas criadas antes da impressao existir ganham a impressao agora,
  // antes de o CPF ser apagado.
  if (!usuario.cpf_hash && usuario.cpf) {
    usuario.cpf_hash = impressaoCpf(usuario.cpf);
  }

  // Link de troca de senha pedido antes da exclusao nao serve mais.
  await TokenSenha.update({ usado_em: new Date() }, { where: { usuario_id: usuario.id, usado_em: null } });

  usuario.nome = 'Usuario removido';
  usuario.email = null;
  usuario.cpf = null;
  usuario.telefone = null;
  usuario.senha_hash = null;
  usuario.sexo = 'nao_informado';
  usuario.status = 'excluido';
  usuario.excluido_em = new Date();
  // Nenhum token emitido antes da exclusao volta a valer se a conta reabrir.
  usuario.token_versao = (usuario.token_versao || 0) + 1;
  await usuario.save();
}

module.exports = { anonimizarConta };
