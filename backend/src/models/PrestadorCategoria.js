const { DataTypes, Model } = require('sequelize');

// US05 - ligacao entre prestador e as categorias que ele atende.
// US09 - o indice por categoria atende o filtro da busca. A chave primaria
// comeca por prestador_id, entao sozinha nao serve para buscar por categoria.
class PrestadorCategoria extends Model {
  static init(sequelize) {
    return super.init({
      prestador_id: { type: DataTypes.INTEGER, primaryKey: true },
      categoria_id: { type: DataTypes.INTEGER, primaryKey: true }
    }, {
      sequelize,
      tableName: 'prestador_categorias',
      timestamps: false,
      indexes: [{ name: 'idx_prestador_categorias_categoria', fields: ['categoria_id', 'prestador_id'] }]
    });
  }
}

module.exports = PrestadorCategoria;
