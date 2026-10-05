const { Prestador, Usuario, Categoria, Bairro } = require('../models');

const LIMITE_CATEGORIAS = 5;

function montarPerfil(prestador) {
  return {
    id: prestador.id,
    nome: prestador.usuario ? prestador.usuario.nome : null,
    sexo: prestador.usuario ? prestador.usuario.sexo : null,
    descricao: prestador.descricao,
    foto_url: prestador.foto_url,
    status: prestador.status,
    verificado: prestador.verificado,
    atende_apenas_mulheres: prestador.atende_apenas_mulheres,
    categorias: (prestador.categorias || []).map((c) => ({ id: c.id, nome: c.nome })),
    bairros: (prestador.bairros || []).map((b) => ({ id: b.id, nome: b.nome }))
  };
}

const INCLUDES = [
  { model: Usuario, as: 'usuario', attributes: ['nome', 'sexo'] },
  { model: Categoria, as: 'categorias', attributes: ['id', 'nome'], through: { attributes: [] } },
  { model: Bairro, as: 'bairros', attributes: ['id', 'nome'], through: { attributes: [] } }
];

// US05 - meu perfil de prestador
async function meuPerfil(req, res, next) {
  try {
    const prestador = await Prestador.findOne({
      where: { usuario_id: req.usuario.id },
      include: INCLUDES
    });
    if (!prestador) return res.json({ prestador: null });
    return res.json({ prestador: montarPerfil(prestador) });
  } catch (e) {
    return next(e);
  }
}

// Aceita so lista de numeros inteiros positivos, sem repeticao.
// Devolve null quando o valor nao e uma lista valida.
function listaDeIds(valor) {
  if (!Array.isArray(valor)) return null;
  const ids = valor.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  return [...new Set(ids)];
}

// US05 / US08 - criar ou atualizar o perfil
async function salvarPerfil(req, res, next) {
  try {
    const { descricao, foto_url, atende_apenas_mulheres } = req.body;

    // Campo ausente = nao mexe. Campo enviado = substitui a lista inteira,
    // e a lista nao pode ficar vazia (sem categoria ou bairro o prestador
    // nao seria encontrado por ninguem).
    let categorias;
    let bairros;

    if (req.body.categorias !== undefined) {
      categorias = listaDeIds(req.body.categorias);
      if (!categorias) return res.status(400).json({ erro: 'Lista de categorias invalida.' });
      if (!categorias.length) return res.status(400).json({ erro: 'Escolha ao menos uma categoria.' });
      if (categorias.length > LIMITE_CATEGORIAS) {
        return res.status(400).json({ erro: `Escolha no maximo ${LIMITE_CATEGORIAS} categorias.` });
      }
      if (await Categoria.count({ where: { id: categorias } }) !== categorias.length) {
        return res.status(400).json({ erro: 'Alguma das categorias escolhidas nao existe.' });
      }
    }

    if (req.body.bairros !== undefined) {
      bairros = listaDeIds(req.body.bairros);
      if (!bairros) return res.status(400).json({ erro: 'Lista de bairros invalida.' });
      if (!bairros.length) return res.status(400).json({ erro: 'Escolha ao menos um bairro.' });
      if (await Bairro.count({ where: { id: bairros } }) !== bairros.length) {
        return res.status(400).json({ erro: 'Algum dos bairros escolhidos nao existe.' });
      }
    }

    // US08 - so quem se identificou como mulher pode marcar a opcao.
    if (atende_apenas_mulheres && req.usuario.sexo !== 'feminino') {
      return res.status(400).json({
        erro: 'Essa opcao esta disponivel apenas para prestadoras mulheres.'
      });
    }

    const [prestador] = await Prestador.findOrCreate({
      where: { usuario_id: req.usuario.id },
      defaults: { usuario_id: req.usuario.id }
    });

    prestador.descricao = descricao ?? prestador.descricao;
    prestador.foto_url = foto_url ?? prestador.foto_url;
    if (atende_apenas_mulheres !== undefined) {
      prestador.atende_apenas_mulheres = Boolean(atende_apenas_mulheres);
    }
    await prestador.save();

    if (categorias) await prestador.setCategorias(categorias);
    if (bairros) await prestador.setBairros(bairros);

    const atualizado = await Prestador.findByPk(prestador.id, { include: INCLUDES });
    return res.json({ prestador: montarPerfil(atualizado) });
  } catch (e) {
    return next(e);
  }
}

// US07 - pausar e retomar
async function alternarPausa(req, res, next) {
  try {
    const prestador = await Prestador.findOne({ where: { usuario_id: req.usuario.id } });
    if (!prestador) {
      return res.status(404).json({ erro: 'Monte seu perfil antes de pausar.' });
    }
    if (prestador.status === 'suspenso') {
      return res.status(403).json({ erro: 'Perfil suspenso pela administracao.' });
    }

    const pausar = prestador.status === 'ativo';
    prestador.status = pausar ? 'pausado' : 'ativo';
    prestador.pausado_em = pausar ? new Date() : null;
    await prestador.save();

    return res.json({
      status: prestador.status,
      mensagem: pausar
        ? 'Perfil pausado. Voce nao aparece nas buscas ate retomar.'
        : 'Perfil ativo de novo. Ja aparece nas buscas.'
    });
  } catch (e) {
    return next(e);
  }
}

// Listagem simples (prova que US07 e US08 funcionam).
// A busca completa com ordenacao por avaliacao e a US09, do proximo sprint.
async function listar(req, res, next) {
  try {
    const { categoria, bairro, somente_mulheres } = req.query;

    const usuarioWhere = { status: 'ativo' };
    if (somente_mulheres === 'true') usuarioWhere.sexo = 'feminino';

    // Passo 1: descobre quem entra. required: true em tudo, entao prestador
    // sem categoria, sem bairro ou fora do filtro nao passa.
    const elegiveis = await Prestador.findAll({
      attributes: ['id'],
      where: { status: 'ativo' },
      include: [
        { model: Usuario, as: 'usuario', attributes: [], where: usuarioWhere, required: true },
        {
          model: Categoria, as: 'categorias', attributes: [], through: { attributes: [] },
          required: true, ...(categoria ? { where: { id: categoria } } : {})
        },
        {
          model: Bairro, as: 'bairros', attributes: [], through: { attributes: [] },
          required: true, ...(bairro ? { where: { id: bairro } } : {})
        }
      ]
    });
    const ids = [...new Set(elegiveis.map((p) => p.id))];

    // Passo 2: carrega o perfil completo. Assim o cartao mostra todas as
    // categorias e bairros, e nao so a que casou com o filtro.
    const prestadores = ids.length
      ? await Prestador.findAll({ where: { id: ids }, include: INCLUDES, order: [['id', 'ASC']] })
      : [];
    return res.json({ prestadores: prestadores.map(montarPerfil) });
  } catch (e) {
    return next(e);
  }
}

module.exports = { meuPerfil, salvarPerfil, alternarPausa, listar };
