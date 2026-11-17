const { DataTypes, Model } = require('sequelize');

/*
 * US17 - pagamento de um servico, com status proprio (separado do status do
 * servico, como manda a maquina de estados).
 *
 *   aguardando - cobranca Pix gerada, o dinheiro ainda nao chegou
 *   retido     - o gateway avisou (US18) que o dinheiro chegou; fica congelado
 *   liberado   - repassado ao prestador (US20)
 *   estornado  - devolvido ao contratante (US15 / US25)
 *
 * O gateway e o cofre: o dinheiro fica na conta do Asaas. Quem decide quando
 * liberar e o sistema (retencao logica).
 */
const STATUS = ['aguardando', 'retido', 'liberado', 'estornado'];

class Pagamento extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      servico_id: { type: DataTypes.INTEGER, allowNull: false },
      // Exatamente o total do orcamento aceito (servico + deslocamento).
      valor: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      status: { type: DataTypes.ENUM(...STATUS), allowNull: false, defaultValue: 'aguardando' },
      // Identificador unico da cobranca, vinculado ao servico. Vai para o
      // gateway (externalReference) e volta no webhook.
      identificador: { type: DataTypes.STRING(60), allowNull: false, unique: true },
      // asaas    - sandbox do Asaas (sem dinheiro real)
      // simulado - gateway local, usado nos testes e sem internet
      gateway: { type: DataTypes.ENUM('asaas', 'simulado'), allowNull: false },
      // Id da cobranca no gateway (pay_... no Asaas).
      cobranca_id: { type: DataTypes.STRING(60), allowNull: true, unique: true },
      pix_copia_cola: { type: DataTypes.TEXT, allowNull: true },
      // Imagem do QR code em base64 (PNG), como o Asaas devolve.
      // MEDIUMTEXT no MySQL (a imagem passa de 64 KB em alguns casos).
      pix_qr_code: {
        type: sequelize.getDialect() === 'mysql' ? DataTypes.TEXT('medium') : DataTypes.TEXT, allowNull: true
      },
      // Prazo para pagar. Passou sem pagamento: a cobranca e cancelada no
      // gateway e o contratante pode aceitar de novo (nova cobranca).
      expira_em: { type: DataTypes.DATE, allowNull: false },
      expirado_em: { type: DataTypes.DATE, allowNull: true },
      retido_em: { type: DataTypes.DATE, allowNull: true }
    }, {
      sequelize,
      tableName: 'pagamentos',
      indexes: [{ name: 'idx_pagamentos_servico', fields: ['servico_id'] }]
    });
  }

  static associate(models) {
    this.belongsTo(models.Servico, { foreignKey: 'servico_id', as: 'servico', onDelete: 'RESTRICT' });
  }

  // Cobranca que ainda pode ser paga.
  emAberto() {
    return this.status === 'aguardando' && !this.expirado_em;
  }
}

Pagamento.STATUS = STATUS;

module.exports = Pagamento;
