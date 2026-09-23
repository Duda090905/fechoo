const { DataTypes, Model } = require('sequelize');

// US05 - as 6 areas que agrupam as categorias.
class Area extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING(60), allowNull: false, unique: true },
      ordem: { type: DataTypes.INTEGER, defaultValue: 0 }
    }, { sequelize, tableName: 'areas' });
  }

  static associate(models) {
    this.hasMany(models.Categoria, { foreignKey: 'area_id', as: 'categorias' });
  }
}

module.exports = Area;
