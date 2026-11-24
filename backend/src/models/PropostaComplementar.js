const { DataTypes, Model } = require('sequelize');

/*
 * US19 - proposta complementar: o prestador descobre no local um trabalho a
 * mais e pede um valor adicional, com justificativa e foto obrigatorias.
 *
 *   pendente  - esperando o contratante aceitar ou recusar
 *   aceita    - aceita; Pix adicional gerado, esperando o pagamento
 *   paga      - o Pix adicional caiu e esta congelado junto com o original
 *   recusada  - o contratante recusou: vale o orcamento original
 *   encerrada - o servico seguiu (concluido, cancelado, em disputa) antes
 *               da resposta ou do pagamento
 *
 * No maximo 50% do valor original do servico e uma por servico, mesmo que
 * a primeira tenha sido recusada (indice unico em servico_id).
 */
const STATUS = ['pendente', 'aceita', 'paga', 'recusada', 'encerrada'];

class PropostaComplementar extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      servico_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      valor: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      justificativa: { type: DataTypes.TEXT, allowNull: false },
      // Nome do arquivo na pasta privada de servicos (sem GPS).
      foto: { type: DataTypes.STRING(80), allowNull: false },
      status: { type: DataTypes.ENUM(...STATUS), allowNull: false, defaultValue: 'pendente' },
      respondida_em: { type: DataTypes.DATE, allowNull: true },
      paga_em: { type: DataTypes.DATE, allowNull: true }
    }, {
      sequelize,
      tableName: 'propostas_complementares',
      createdAt: 'enviada_em'
    });
  }

  static associate(models) {
    this.belongsTo(models.Servico, { foreignKey: 'servico_id', as: 'servico' });
  }
}

PropostaComplementar.STATUS = STATUS;

module.exports = PropostaComplementar;
