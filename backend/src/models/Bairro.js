const { DataTypes, Model } = require('sequelize');

// US05 - bairros atendidos (lista fixa, Campinas).
class Bairro extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING(80), allowNull: false },
      cidade: { type: DataTypes.STRING(80), defaultValue: 'Campinas' }
    }, { sequelize, tableName: 'bairros' });
  }

  static associate(models) {
    this.belongsToMany(models.Prestador, {
      through: { model: models.PrestadorBairro, unique: false }, foreignKey: 'bairro_id',
      otherKey: 'prestador_id', as: 'prestadores'
    });
  }
}

module.exports = Bairro;
