const { DataTypes, Model } = require('sequelize');

/*
 * US23 - disputa de um servico. US25 - decisao do administrador.
 *
 * Quem abre e o contratante, com justificativa e evidencias (fotos), com o
 * servico em execucao ou em ate 72 horas depois de o prestador marcar como
 * concluido. Enquanto a disputa esta aberta o servico fica Em disputa e o
 * dinheiro congelado: a confirmacao automatica (US20) nao alcanca o servico,
 * ninguem cancela e nenhuma das partes libera ou devolve o valor sozinha.
 *
 *   aberta   - esperando a defesa do prestador e a decisao
 *   decidida - o administrador decidiu (devolver, liberar ou dividir)
 *
 * Uma disputa por servico (indice unico).
 */
const STATUS = ['aberta', 'decidida'];
const DECISOES = ['devolver', 'liberar', 'dividir'];

function lista(campo) {
  return {
    type: DataTypes.JSON,
    allowNull: true,
    get() {
      const valor = this.getDataValue(campo);
      if (Array.isArray(valor)) return valor;
      if (typeof valor === 'string') {
        try { return JSON.parse(valor); } catch { return []; }
      }
      return [];
    }
  };
}

class Disputa extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      servico_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      aberta_por_id: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.ENUM(...STATUS), allowNull: false, defaultValue: 'aberta' },
      // Em que status o servico estava quando a disputa foi aberta.
      status_servico_anterior: { type: DataTypes.STRING(30), allowNull: false },
      justificativa: { type: DataTypes.TEXT, allowNull: false },
      // Nomes dos arquivos (pasta privada de servicos), sem GPS.
      evidencias: lista('evidencias'),
      // Defesa do prestador
      defesa: { type: DataTypes.TEXT, allowNull: true },
      defesa_evidencias: lista('defesa_evidencias'),
      defesa_em: { type: DataTypes.DATE, allowNull: true },
      // US25 - decisao, com autor, data e justificativa
      decisao: { type: DataTypes.ENUM(...DECISOES), allowNull: true },
      percentual_contratante: { type: DataTypes.INTEGER, allowNull: true },
      valor_contratante: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      valor_prestador: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      justificativa_decisao: { type: DataTypes.TEXT, allowNull: true },
      decidido_por_id: { type: DataTypes.INTEGER, allowNull: true },
      decidido_em: { type: DataTypes.DATE, allowNull: true }
    }, {
      sequelize,
      tableName: 'disputas',
      createdAt: 'aberta_em',
      indexes: [{ name: 'idx_disputas_status', fields: ['status'] }]
    });
  }

  static associate(models) {
    this.belongsTo(models.Servico, { foreignKey: 'servico_id', as: 'servico' });
    this.belongsTo(models.Usuario, { foreignKey: 'aberta_por_id', as: 'aberta_por' });
    this.belongsTo(models.Usuario, { foreignKey: 'decidido_por_id', as: 'decidido_por' });
  }
}

Disputa.STATUS = STATUS;
Disputa.DECISOES = DECISOES;

module.exports = Disputa;
