const { DataTypes, Model } = require('sequelize');

// US05 - ligacao entre prestador e os bairros que ele atende.
// US09 - o indice por bairro atende o filtro da busca. A chave primaria
// comeca por prestador_id, entao sozinha nao serve para buscar por bairro.
class PrestadorBairro extends Model {
  static init(sequelize) {
    return super.init({
      prestador_id: { type: DataTypes.INTEGER, primaryKey: true },
      bairro_id: { type: DataTypes.INTEGER, primaryKey: true }
    }, {
      sequelize,
      tableName: 'prestador_bairros',
      timestamps: false,
      indexes: [{ name: 'idx_prestador_bairros_bairro', fields: ['bairro_id', 'prestador_id'] }]
    });
  }
}

module.exports = PrestadorBairro;
