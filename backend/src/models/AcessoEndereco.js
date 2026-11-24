const { DataTypes, Model } = require('sequelize');

// US11 - log de acesso ao endereco: cada vez que a API entrega o endereco do
// servico, fica registrado quem viu, de que lado e quando.
class AcessoEndereco extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      servico_id: { type: DataTypes.INTEGER, allowNull: false },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false },
      papel: { type: DataTypes.ENUM('contratante', 'prestador'), allowNull: false },
      ip: { type: DataTypes.STRING(45), allowNull: true }
    }, {
      sequelize,
      tableName: 'acessos_endereco',
      updatedAt: false,
      createdAt: 'acessado_em',
      indexes: [{ name: 'idx_acessos_endereco_servico', fields: ['servico_id'] }]
    });
  }

  static associate(models) {
    this.belongsTo(models.Servico, { foreignKey: 'servico_id', as: 'servico' });
    this.belongsTo(models.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
  }
}

module.exports = AcessoEndereco;
