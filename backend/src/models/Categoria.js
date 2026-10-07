const { DataTypes, Model } = require('sequelize');

// US05 - as 17 categorias de servico.
class Categoria extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING(60), allowNull: false, unique: true },
      area_id: { type: DataTypes.INTEGER, allowNull: false }
    }, { sequelize, tableName: 'categorias' });
  }

  static associate(models) {
    this.belongsTo(models.Area, { foreignKey: 'area_id', as: 'area' });
    this.belongsToMany(models.Prestador, {
      through: { model: models.PrestadorCategoria, unique: false }, foreignKey: 'categoria_id',
      otherKey: 'prestador_id', as: 'prestadores'
    });
  }
}

module.exports = Categoria;
