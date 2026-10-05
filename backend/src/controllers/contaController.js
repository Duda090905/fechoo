const { Prestador, SolicitacaoExclusao } = require('../models');
const { removerFotoPerfil } = require('../servicos/armazenamento');
const { listarPendencias } = require('../servicos/pendencias');
const { iniciarPausa, encerrarPausa } = require('../servicos/pausas');

// US04 - registra data (created_at), origem e resultado de cada pedido.
function registrarSolicitacao(usuarioId, tipo, resultado) {
  return SolicitacaoExclusao.create({ usuario_id: usuarioId, tipo, origem: 'painel_usuario', resultado });
}

// US02 - dados da propria conta
async function meusDados(req, res) {
  return res.json({ usuario: req.usuario.publico() });
}

// US04 - o que impede sair
async function pendencias(req, res, next) {
  try {
    const lista = await listarPendencias(req.usuario.id);
    return res.json({ pendencias: lista, pode_desativar: lista.length === 0 });
  } catch (e) {
    return next(e);
  }
}

/**
 * US04 - Desativar a conta.
 *
 * Nao apaga nada. A conta vira "inativa": some das buscas, perde o acesso,
 * mas o cadastro e o historico continuam guardados.
 */
async function desativar(req, res, next) {
  try {
    const { confirmacao } = req.body;
    if (confirmacao !== 'DESATIVAR') {
      return res.status(400).json({ erro: 'Digite DESATIVAR para confirmar.' });
    }

    const lista = await listarPendencias(req.usuario.id);
    if (lista.length) {
      await registrarSolicitacao(req.usuario.id, 'desativacao', 'recusada_pendencia');
      return res.status(409).json({
        erro: 'Voce tem pendencias em aberto. Resolva antes de desativar a conta.',
        pendencias: lista
      });
    }

    const usuario = req.usuario;
    usuario.status = 'inativo';
    usuario.desativado_em = new Date();
    await usuario.save();

    const prestador = await Prestador.findOne({ where: { usuario_id: usuario.id } });
    if (prestador && prestador.status === 'ativo') {
      await iniciarPausa(prestador);
    }
    await registrarSolicitacao(usuario.id, 'desativacao', 'concluida');

    return res.json({
      mensagem: 'Conta desativada. Seus dados ficam guardados e voce pode voltar quando quiser.'
    });
  } catch (e) {
    return next(e);
  }
}

// US04 - Voltar. O login de uma conta inativa funciona, mas so da acesso a isto.
async function reativar(req, res, next) {
  try {
    const usuario = req.usuario;

    if (usuario.status === 'ativo') {
      return res.status(400).json({ erro: 'Sua conta ja esta ativa.' });
    }
    if (usuario.status !== 'inativo') {
      return res.status(403).json({ erro: 'Esta conta nao pode ser reativada. Fale com o suporte.' });
    }

    usuario.status = 'ativo';
    usuario.reativado_em = new Date();
    usuario.desativado_em = null;
    await usuario.save();

    return res.json({
      usuario: usuario.publico(),
      mensagem: 'Bem-vinda de volta. Seu perfil e seu historico continuam aqui.'
    });
  } catch (e) {
    return next(e);
  }
}

/**
 * US04 - Exclusao definitiva (LGPD).
 *
 * So depois de a conta estar inativa. Apaga nome, e-mail, CPF e telefone.
 */
async function excluirDefinitivo(req, res, next) {
  try {
    const { confirmacao } = req.body;
    if (confirmacao !== 'APAGAR MEUS DADOS') {
      return res.status(400).json({ erro: 'Digite APAGAR MEUS DADOS para confirmar.' });
    }

    const usuario = req.usuario;
    if (usuario.status !== 'inativo') {
      return res.status(409).json({ erro: 'Desative a conta antes de pedir a exclusao dos dados.' });
    }

    const lista = await listarPendencias(usuario.id);
    if (lista.length) {
      await registrarSolicitacao(usuario.id, 'exclusao_dados', 'recusada_pendencia');
      return res.status(409).json({
        erro: 'Voce tem pendencias em aberto. Resolva antes de apagar seus dados.',
        pendencias: lista
      });
    }

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
    await registrarSolicitacao(usuario.id, 'exclusao_dados', 'concluida');

    return res.json({ mensagem: 'Seus dados pessoais foram apagados. Essa conta nao volta.' });
  } catch (e) {
    return next(e);
  }
}

module.exports = { meusDados, pendencias, desativar, reativar, excluirDefinitivo };
