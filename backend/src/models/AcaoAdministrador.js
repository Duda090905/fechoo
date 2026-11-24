const { DataTypes, Model } = require('sequelize');

/*
 * US25 - registro de tudo o que o administrador decide: decisao de disputa,
 * suspensao preventiva e reativacao de prestador. Sempre com autor, data e
 * justificativa. Nada aqui e apagado.
 */
const ACOES = ['decisao_disputa', 'suspensao', 'reativacao'];

class AcaoAdministrador extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      administrador_id: { type: DataTypes.INTEGER, allowNull: false },
      acao: { type: DataTypes.STRING(30), allowNull: false },
      // 'disputa' ou 'prestador', e o id dele
      alvo_tipo: { type: DataTypes.STRING(20), allowNull: false },
      alvo_id: { type: DataTypes.INTEGER, allowNull: false },
      justificativa: { type: DataTypes.TEXT, allowNull: false },
      detalhe: { type: DataTypes.STRING(300), allowNull: true }
    }, {
      sequelize,
      tableName: 'acoes_administrador',
      updatedAt: false,
      createdAt: 'registrado_em'
    });
  }

  static associate(models) {
    this.belongsTo(models.Usuario, { foreignKey: 'administrador_id', as: 'administrador' });
  }
}

AcaoAdministrador.ACOES = ACOES;

module.exports = AcaoAdministrador;
