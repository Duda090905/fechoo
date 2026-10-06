const { Prestador } = require('../models');
const { removerFotoPerfil } = require('./armazenamento');
const { encerrarPausa } = require('./pausas');

/**
 * US04 - Anonimiza uma conta: apaga nome, e-mail, CPF, telefone, senha e a
 * foto (inclusive o arquivo no disco), tira o prestador das buscas e marca a
 * conta como "excluido". O registro em si fica, para manter o que a lei exige
 * guardar (por exemplo registros financeiros) sem identificar a pessoa.
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

  usuario.nome = 'Usuario removido';
  usuario.email = null;
  usuario.cpf = null;
  usuario.telefone = null;
  usuario.senha_hash = null;
  usuario.sexo = 'nao_informado';
  usuario.status = 'excluido';
  usuario.excluido_em = new Date();
  await usuario.save();
}

module.exports = { anonimizarConta };
