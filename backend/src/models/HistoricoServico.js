const { DataTypes, Model } = require('sequelize');

/*
 * Historico do servico: cada passo fica registrado com quem fez e quando.
 * A maquina de estados do projeto pede que toda transicao va para o
 * historico; a US14 pede que o reagendamento registre quem propos e quando.
 * usuario_id vazio = o proprio sistema (confirmacao automatica, gateway).
 */
class HistoricoServico extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      servico_id: { type: DataTypes.INTEGER, allowNull: false },
      usuario_id: { type: DataTypes.INTEGER, allowNull: true },
      acao: { type: DataTypes.STRING(40), allowNull: false },
      status_anterior: { type: DataTypes.STRING(30), allowNull: true },
      status_novo: { type: DataTypes.STRING(30), allowNull: true },
      detalhe: { type: DataTypes.STRING(300), allowNull: true }
    }, {
      sequelize,
      tableName: 'historico_servicos',
      updatedAt: false,
      createdAt: 'registrado_em',
      indexes: [{ name: 'idx_historico_servicos_servico', fields: ['servico_id'] }]
    });
  }

  static associate(models) {
    this.belongsTo(models.Servico, { foreignKey: 'servico_id', as: 'servico' });
    this.belongsTo(models.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
  }
}

module.exports = HistoricoServico;
