const { Prestador, SolicitacaoExclusao } = require('../models');
const { listarPendencias } = require('../servicos/pendencias');
const { iniciarPausa } = require('../servicos/pausas');
const { anonimizarConta } = require('../servicos/anonimizacao');
const { senhaForte, gerarHash, conferir, REGRA } = require('../utils/senha');
const { gerarJWT } = require('../utils/token');

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

    await anonimizarConta(usuario);
    await registrarSolicitacao(usuario.id, 'exclusao_dados', 'concluida');

    return res.json({ mensagem: 'Seus dados pessoais foram apagados. Essa conta nao volta.' });
  } catch (e) {
    return next(e);
  }
}

/**
 * US26 (curinga CC06) - Alterar a senha estando logado.
 *
 * Exige a senha atual, aplica a mesma regra de forca do cadastro e sobe o
 * token_versao (mecanismo da US03): todas as sessoes abertas deixam de valer.
 * A sessao que fez a troca recebe um token novo e continua ativa.
 *
 * Senha atual errada responde 400, e nao 401: no front, 401 significa sessao
 * encerrada e mandaria a pessoa de volta para o login.
 */
async function trocarSenha(req, res, next) {
  try {
    const { senha_atual: senhaAtual, nova_senha: novaSenha } = req.body;
    const usuario = req.usuario;

    if (typeof senhaAtual !== 'string' || typeof novaSenha !== 'string' || !senhaAtual || !novaSenha) {
      return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
    }
    if (!(await conferir(senhaAtual, usuario.senha_hash))) {
      return res.status(400).json({ erro: 'A senha atual não confere.' });
    }
    if (!senhaForte(novaSenha)) {
      return res.status(400).json({ erro: REGRA });
    }
    if (novaSenha === senhaAtual) {
      return res.status(400).json({ erro: 'A nova senha precisa ser diferente da atual.' });
    }

    usuario.senha_hash = await gerarHash(novaSenha);
    usuario.token_versao = (usuario.token_versao || 0) + 1;
    await usuario.save();

    return res.json({
      mensagem: 'Senha alterada. Os outros aparelhos em que sua conta estava aberta foram desconectados.',
      token: gerarJWT(usuario),
      usuario: usuario.publico()
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { meusDados, pendencias, desativar, reativar, excluirDefinitivo, trocarSenha };
