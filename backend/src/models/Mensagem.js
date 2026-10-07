const { DataTypes, Model } = require('sequelize');

// US12 - mensagens do chat, presas ao servico. Nao ha edicao nem exclusao
// pelo usuario: ficam guardadas para consulta em caso de disputa. So o
// arquivo da imagem sai, depois do prazo de guarda das midias.
class Mensagem extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      servico_id: { type: DataTypes.INTEGER, allowNull: false },
      autor_id: { type: DataTypes.INTEGER, allowNull: false },
      texto: { type: DataTypes.TEXT, allowNull: true },
      // Nome do arquivo na pasta privada de servicos.
      imagem: { type: DataTypes.STRING(64), allowNull: true },
      imagem_removida_em: { type: DataTypes.DATE, allowNull: true }
    }, { sequelize, tableName: 'mensagens', updatedAt: false });
  }

  static associate(models) {
    this.belongsTo(models.Servico, { foreignKey: 'servico_id', as: 'servico', onDelete: 'RESTRICT' });
    this.belongsTo(models.Usuario, { foreignKey: 'autor_id', as: 'autor' });
  }
}

module.exports = Mensagem;
