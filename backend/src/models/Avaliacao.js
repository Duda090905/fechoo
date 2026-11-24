const { DataTypes, Model } = require('sequelize');

/*
 * US24 - avaliacao mutua. Cada parte de um servico confirmado avalia a outra
 * uma vez: nota de 1 a 5 e comentario opcional.
 *
 * As duas ficam escondidas ate as duas serem enviadas ou ate vencer o prazo
 * (7 dias depois da confirmacao). liberada_em marca quando passou a aparecer.
 * Quem avaliou pode editar por 24 horas. O prestador pode responder, uma vez,
 * a avaliacao que recebeu.
 */
class Avaliacao extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      servico_id: { type: DataTypes.INTEGER, allowNull: false },
      autor_id: { type: DataTypes.INTEGER, allowNull: false },
      avaliado_id: { type: DataTypes.INTEGER, allowNull: false },
      // Quem escreveu: o contratante avalia o prestador e vice-versa.
      papel_autor: { type: DataTypes.ENUM('contratante', 'prestador'), allowNull: false },
      nota: { type: DataTypes.INTEGER, allowNull: false },
      comentario: { type: DataTypes.STRING(500), allowNull: true },
      editavel_ate: { type: DataTypes.DATE, allowNull: false },
      // Fim do prazo para avaliar: depois disso, a avaliacao que existir aparece.
      prazo_ate: { type: DataTypes.DATE, allowNull: false },
      liberada_em: { type: DataTypes.DATE, allowNull: true },
      resposta: { type: DataTypes.STRING(500), allowNull: true },
      respondida_em: { type: DataTypes.DATE, allowNull: true }
    }, {
      sequelize,
      tableName: 'avaliacoes',
      indexes: [
        // Uma avaliacao por pessoa e por servico.
        { name: 'uq_avaliacoes_servico_autor', unique: true, fields: ['servico_id', 'autor_id'] },
        { name: 'idx_avaliacoes_avaliado', fields: ['avaliado_id'] }
      ]
    });
  }

  static associate(models) {
    this.belongsTo(models.Servico, { foreignKey: 'servico_id', as: 'servico' });
    this.belongsTo(models.Usuario, { foreignKey: 'autor_id', as: 'autor' });
    this.belongsTo(models.Usuario, { foreignKey: 'avaliado_id', as: 'avaliado' });
  }
}

module.exports = Avaliacao;
