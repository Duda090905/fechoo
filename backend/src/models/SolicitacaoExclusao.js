const { DataTypes, Model } = require('sequelize');

// US04 - registro de cada pedido para sair da plataforma: quando, por qual
// canal e o que aconteceu. Guarda so o id do usuario, sem dado pessoal,
// entao continua existindo depois que a conta e anonimizada.
class SolicitacaoExclusao extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false },
      // desativacao   - conta passa a inativa, dados guardados
      // exclusao_dados - dados pessoais apagados (LGPD)
      tipo: { type: DataTypes.ENUM('desativacao', 'exclusao_dados'), allowNull: false },
      // Canal do pedido. Hoje so existe o painel do proprio usuario.
      origem: { type: DataTypes.ENUM('painel_usuario'), allowNull: false, defaultValue: 'painel_usuario' },
      resultado: { type: DataTypes.ENUM('concluida', 'recusada_pendencia'), allowNull: false }
    }, { sequelize, tableName: 'solicitacoes_exclusao', updatedAt: false });
  }

  static associate(models) {
    this.belongsTo(models.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
  }
}

module.exports = SolicitacaoExclusao;
