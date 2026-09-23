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

// US05 / US08 - criar ou atualizar o perfil
async function salvarPerfil(req, res, next) {
  try {
    const { descricao, foto_url, categorias = [], bairros = [], atende_apenas_mulheres } = req.body;

    if (categorias.length > LIMITE_CATEGORIAS) {
      return res.status(400).json({ erro: `Escolha no maximo ${LIMITE_CATEGORIAS} categorias.` });
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

    if (categorias.length) await prestador.setCategorias(categorias);
    if (bairros.length) await prestador.setBairros(bairros);

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

    const where = { status: 'ativo' };
    const include = [
      { model: Usuario, as: 'usuario', attributes: ['nome', 'sexo'], where: { status: 'ativo' } },
      {
        model: Categoria,
        as: 'categorias',
        attributes: ['id', 'nome'],
        through: { attributes: [] },
        ...(categoria ? { where: { id: categoria } } : {})
      },
      {
        model: Bairro,
        as: 'bairros',
        attributes: ['id', 'nome'],
        through: { attributes: [] },
        ...(bairro ? { where: { id: bairro } } : {})
      }
    ];

    if (somente_mulheres === 'true') {
      include[0].where = { ...include[0].where, sexo: 'feminino' };
    }

    const prestadores = await Prestador.findAll({ where, include });
    return res.json({ prestadores: prestadores.map(montarPerfil) });
  } catch (e) {
    return next(e);
  }
}

module.exports = { meuPerfil, salvarPerfil, alternarPausa, listar };
