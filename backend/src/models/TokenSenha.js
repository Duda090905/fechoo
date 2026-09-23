const { DataTypes, Model } = require('sequelize');

// US03 - token de uso unico para redefinir senha.
class TokenSenha extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false },
      token_hash: { type: DataTypes.STRING(120), allowNull: false },
      expira_em: { type: DataTypes.DATE, allowNull: false },
      usado_em: { type: DataTypes.DATE, allowNull: true }
    }, { sequelize, tableName: 'tokens_senha' });
  }

  static associate(models) {
    this.belongsTo(models.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
  }
}

module.exports = TokenSenha;
