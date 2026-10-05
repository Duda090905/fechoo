const { DataTypes, Model } = require('sequelize');

// US07 - cada vez que o prestador pausa o perfil abre-se um periodo; ao
// retomar, o periodo e fechado. O historico permite descontar o tempo pausado
// do tempo de resposta quando existirem as solicitacoes de servico.
class Pausa extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      prestador_id: { type: DataTypes.INTEGER, allowNull: false },
      inicio: { type: DataTypes.DATE, allowNull: false },
      // Vazio enquanto a pausa esta em andamento.
      fim: { type: DataTypes.DATE, allowNull: true }
    }, { sequelize, tableName: 'pausas', updatedAt: false, createdAt: false });
  }

  static associate(models) {
    this.belongsTo(models.Prestador, { foreignKey: 'prestador_id', as: 'prestador' });
  }
}

module.exports = Pausa;
