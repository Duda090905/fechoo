const { DataTypes, Model } = require('sequelize');

// US11 / US18 - avisos dentro do app (alem do e-mail). Um aviso de cada tipo
// por pessoa e por servico: o indice unico impede aviso duplicado mesmo que
// o gateway mande o mesmo webhook duas vezes.
class Notificacao extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false },
      servico_id: { type: DataTypes.INTEGER, allowNull: false },
      // pagamento_garantido   - para o prestador: aceitou e o dinheiro congelou
      // pagamento_confirmado  - para o contratante: o Pix chegou
      tipo: { type: DataTypes.STRING(40), allowNull: false },
      titulo: { type: DataTypes.STRING(120), allowNull: false },
      texto: { type: DataTypes.STRING(500), allowNull: false },
      lida_em: { type: DataTypes.DATE, allowNull: true }
    }, {
      sequelize,
      tableName: 'notificacoes',
      updatedAt: false,
      indexes: [{ name: 'uq_notificacoes_usuario_servico_tipo', unique: true, fields: ['usuario_id', 'servico_id', 'tipo'] }]
    });
  }

  static associate(models) {
    this.belongsTo(models.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
    this.belongsTo(models.Servico, { foreignKey: 'servico_id', as: 'servico' });
  }
}

module.exports = Notificacao;
