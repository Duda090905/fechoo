const { DataTypes, Model } = require('sequelize');

// US18 - cada aviso recebido do gateway, uma vez so. O id do evento e unico:
// se o mesmo aviso chegar de novo (o Asaas reenvia), o banco recusa a copia
// e nada e aplicado duas vezes (idempotencia).
class EventoWebhook extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      evento_id: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      tipo: { type: DataTypes.STRING(60), allowNull: false },
      cobranca_id: { type: DataTypes.STRING(60), allowNull: true },
      // O que o sistema fez com o aviso (pagamento_retido, ignorado, ...).
      resultado: { type: DataTypes.STRING(40), allowNull: false }
    }, { sequelize, tableName: 'eventos_webhook', updatedAt: false, createdAt: 'recebido_em' });
  }
}

module.exports = EventoWebhook;
