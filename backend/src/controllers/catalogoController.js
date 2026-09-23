const { Area, Categoria, Bairro } = require('../models');

// US05 - listas fixas usadas no cadastro do perfil e nos filtros.
async function areasComCategorias(req, res, next) {
  try {
    const areas = await Area.findAll({
      include: [{ model: Categoria, as: 'categorias', attributes: ['id', 'nome'] }],
      order: [['ordem', 'ASC'], [{ model: Categoria, as: 'categorias' }, 'nome', 'ASC']]
    });
    return res.json({ areas });
  } catch (e) {
    return next(e);
  }
}

async function bairros(req, res, next) {
  try {
    const lista = await Bairro.findAll({ order: [['nome', 'ASC']] });
    return res.json({ bairros: lista });
  } catch (e) {
    return next(e);
  }
}

module.exports = { areasComCategorias, bairros };
