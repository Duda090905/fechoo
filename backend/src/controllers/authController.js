const { Op } = require('sequelize');
const { Usuario, TokenSenha } = require('../models');
const { cpfValido, limpar, impressaoCpf } = require('../utils/cpf');
const { senhaForte, gerarHash, conferir, REGRA } = require('../utils/senha');
const { gerarJWT, gerarTokenRecuperacao, hashDeToken } = require('../utils/token');
const { enviarLinkRecuperacao } = require('../utils/email');
const { normalizarEmail, emailValido, normalizarTelefone } = require('../utils/contato');
const { reabrirConta } = require('../servicos/reabertura');

const MINUTOS_TOKEN = 30;

// US01 - Cadastro
async function cadastrar(req, res, next) {
  try {
    const { cpf, senha, tipo_perfil, sexo, aceite_termos } = req.body;
    const nome = String(req.body.nome || '').trim();
    const email = normalizarEmail(req.body.email);

    if (!nome || !email || !senha || !tipo_perfil) {
      return res.status(400).json({ erro: 'Preencha nome, e-mail, senha e tipo de perfil.' });
    }
    if (nome.length > 120) {
      return res.status(400).json({ erro: 'O nome pode ter no maximo 120 caracteres.' });
    }
    if (!emailValido(email)) {
      return res.status(400).json({ erro: 'Esse e-mail nao parece valido.' });
    }
    const telefone = normalizarTelefone(req.body.telefone);
    // Obrigatorio: a US01 pede nome, CPF, e-mail, telefone e senha.
    if (!telefone) {
      return res.status(400).json({ erro: 'Informe o telefone com DDD, por exemplo (19) 99999-9999.' });
    }
    if (!['contratante', 'prestador'].includes(tipo_perfil)) {
      return res.status(400).json({ erro: 'Escolha entre contratante e prestador.' });
    }
    if (!cpfValido(cpf)) {
      return res.status(400).json({ erro: 'Esse CPF nao e valido.' });
    }
    if (!senhaForte(senha)) {
      return res.status(400).json({ erro: REGRA });
    }
    if (!aceite_termos) {
      return res.status(400).json({ erro: 'E preciso aceitar os termos para criar a conta.' });
    }

    const cpfLimpo = limpar(cpf);
    const impressao = impressaoCpf(cpfLimpo);

    // Conta ativa ou inativa com esse e-mail ou CPF: nao cria outra.
    const jaExiste = await Usuario.findOne({
      where: {
        status: { [Op.ne]: 'excluido' },
        [Op.or]: [{ email }, { cpf: cpfLimpo }, { cpf_hash: impressao }]
      }
    });
    if (jaExiste) {
      // Mensagem unica de proposito: nao revela se a conta esta ativa ou
      // inativa. Quem e dono do CPF descobre entrando.
      return res.status(409).json({
        erro: 'Ja existe uma conta com esse e-mail ou CPF. Entre com sua senha ou recupere o acesso.',
        conta_existente: true
      });
    }

    // US04 - a pessoa apagou os dados antes. O CPF nao esta mais no banco,
    // mas a impressao dele sim: um CPF, uma conta.
    const anterior = await Usuario.findOne({ where: { cpf_hash: impressao, status: 'excluido' } });
    if (anterior && anterior.bloqueado_novo_cadastro) {
      return res.status(403).json({ erro: 'Não é possível criar conta com esse CPF. Fale com o suporte.' });
    }

    const dados = {
      nome,
      cpf: cpfLimpo,
      email,
      telefone,
      senha_hash: await gerarHash(senha),
      tipo_perfil,
      sexo: sexo || 'nao_informado'
    };

    const usuario = anterior
      ? await reabrirConta(anterior, dados)
      : await Usuario.create({ ...dados, cpf_hash: impressao, aceite_termos: true, aceite_termos_em: new Date() });

    return res.status(201).json({
      usuario: usuario.publico(),
      token: gerarJWT(usuario),
      historico_recuperado: Boolean(anterior),
      aviso: anterior
        ? 'Você já teve uma conta com esse CPF e ela foi reaberta. Seus dados são os que você acabou de preencher, e o histórico da conta continua o mesmo.'
        : undefined
    });
  } catch (e) {
    return next(e);
  }
}

// US02 - Login
async function entrar(req, res, next) {
  try {
    const { senha } = req.body;
    const email = normalizarEmail(req.body.email);
    const generico = { erro: 'E-mail ou senha incorretos.' };

    const usuario = await Usuario.findOne({ where: { email } });
    if (!usuario || usuario.status === 'excluido') {
      return res.status(401).json(generico);
    }

    const ok = await conferir(senha, usuario.senha_hash);
    if (!ok) {
      return res.status(401).json(generico);
    }

    // US04 - entrar na conta zera o relogio da retencao e cancela o aviso.
    usuario.ultimo_acesso_em = new Date();
    usuario.aviso_retencao_em = null;
    await usuario.save();

    // Conta inativa entra para poder se reativar, e o front sabe disso
    // pelo sinalizador abaixo.
    return res.json({
      usuario: usuario.publico(),
      token: gerarJWT(usuario),
      conta_inativa: usuario.status === 'inativo'
    });
  } catch (e) {
    return next(e);
  }
}

// US03 - Pedir o link
async function esqueciSenha(req, res, next) {
  try {
    const email = normalizarEmail(req.body.email);
    // Resposta sempre igual: nao revela se a conta existe.
    const resposta = { mensagem: 'Se existir uma conta com esse e-mail, o link chega em instantes.' };

    const usuario = await Usuario.findOne({ where: { email, status: 'ativo' } });
    if (!usuario) return res.json(resposta);

    const { bruto, hash } = gerarTokenRecuperacao();
    await TokenSenha.create({
      usuario_id: usuario.id,
      token_hash: hash,
      expira_em: new Date(Date.now() + MINUTOS_TOKEN * 60000)
    });

    const base = process.env.URL_FRONT || 'http://localhost:5173';
    await enviarLinkRecuperacao(usuario.email, `${base}/redefinir-senha?token=${bruto}`);

    return res.json(resposta);
  } catch (e) {
    return next(e);
  }
}

// US03 - Trocar a senha
async function redefinirSenha(req, res, next) {
  try {
    const { token, senha } = req.body;

    if (!senhaForte(senha)) {
      return res.status(400).json({ erro: REGRA });
    }

    const registro = await TokenSenha.findOne({
      where: { token_hash: hashDeToken(token), usado_em: null, expira_em: { [Op.gt]: new Date() } }
    });
    if (!registro) {
      return res.status(400).json({ erro: 'Esse link expirou ou ja foi usado. Peca outro.' });
    }

    const usuario = await Usuario.findByPk(registro.usuario_id);
    usuario.senha_hash = await gerarHash(senha);
    // Encerra todas as sessoes abertas com a senha antiga.
    usuario.token_versao = (usuario.token_versao || 0) + 1;
    await usuario.save();

    registro.usado_em = new Date();
    await registro.save();

    // Qualquer outro link pendente perde a validade.
    await TokenSenha.update(
      { usado_em: new Date() },
      { where: { usuario_id: usuario.id, usado_em: null } }
    );

    return res.json({ mensagem: 'Senha alterada. Pode entrar com a nova.' });
  } catch (e) {
    return next(e);
  }
}

module.exports = { cadastrar, entrar, esqueciSenha, redefinirSenha };
