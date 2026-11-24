const { DataTypes, Model } = require('sequelize');

/*
 * US14 - pedido de nova data para um servico ja aceito.
 *
 * Qualquer uma das partes propoe; so a outra aceita ou recusa. A data so
 * muda depois do aceite. Esta tabela e o historico: quem propos, quando, de
 * que data para qual, e o que a outra parte respondeu.
 *
 *   pendente   - esperando a resposta da outra parte
 *   aceito     - a data do servico mudou
 *   recusado   - a data original continua valendo
 *   cancelado  - o servico comecou ou foi cancelado antes da resposta
 */
const STATUS = ['pendente', 'aceito', 'recusado', 'cancelado'];

class Reagendamento extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      servico_id: { type: DataTypes.INTEGER, allowNull: false },
      proposto_por_id: { type: DataTypes.INTEGER, allowNull: false },
      papel: { type: DataTypes.ENUM('contratante', 'prestador'), allowNull: false },
      data_hora_anterior: { type: DataTypes.DATE, allowNull: false },
      data_hora_nova: { type: DataTypes.DATE, allowNull: false },
      motivo: { type: DataTypes.STRING(300), allowNull: true },
      status: { type: DataTypes.ENUM(...STATUS), allowNull: false, defaultValue: 'pendente' },
      respondido_por_id: { type: DataTypes.INTEGER, allowNull: true },
      respondido_em: { type: DataTypes.DATE, allowNull: true }
    }, {
      sequelize,
      tableName: 'reagendamentos',
      indexes: [{ name: 'idx_reagendamentos_servico', fields: ['servico_id'] }]
    });
  }

  static associate(models) {
    this.belongsTo(models.Servico, { foreignKey: 'servico_id', as: 'servico' });
    this.belongsTo(models.Usuario, { foreignKey: 'proposto_por_id', as: 'proposto_por' });
  }
}

Reagendamento.STATUS = STATUS;

module.exports = Reagendamento;
