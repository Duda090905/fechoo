const { DataTypes, Model } = require('sequelize');

/*
 * Status do servico.
 *
 * Os tres primeiros sao os que a US10 controla, com os nomes do cartao.
 * Os demais vem da maquina de estados do projeto e so passam a ser usados
 * pelas proximas historias (aceite, pagamento, conclusao, disputa); ficam
 * aqui para a coluna nao precisar mudar a cada sprint.
 */
const STATUS = [
  'aguardando_orcamento', 'orcamento_enviado', 'recusado',
  'aceito', 'em_execucao', 'concluido', 'confirmado', 'pago',
  'cancelado', 'em_disputa', 'resolvido', 'expirado'
];

// US12 - a partir destes status o chat para de receber mensagens. Concluido
// em diante (inclusive disputa) e os que encerram sem acontecer.
const STATUS_ENCERRADOS = [
  'concluido', 'confirmado', 'pago', 'em_disputa', 'resolvido',
  'recusado', 'cancelado', 'expirado'
];

// US13 - compromisso na agenda dos dois lados: so depois do aceite.
const STATUS_COMPROMISSO = ['aceito', 'em_execucao'];

// US13 - ocupam o horario do prestador: o orcamento que ele mandou (se for
// aceito, ele precisa estar livre) e os compromissos ja aceitos.
const STATUS_OCUPAM_HORARIO = ['orcamento_enviado', 'aceito', 'em_execucao'];

// US09 - contam como servico concluido: confirmado pelo contratante ou pago.
const STATUS_CONCLUIDOS = ['confirmado', 'pago'];

// US11 - o endereco so sai na API do aceite em diante (o aceite acontece
// quando o pagamento fica retido, US18). Antes disso, ninguem recebe.
const STATUS_ENDERECO_LIBERADO = [
  'aceito', 'em_execucao', 'concluido', 'confirmado', 'pago', 'em_disputa', 'resolvido'
];

// US10 - pedido de servico e orcamento. US13 - data e hora. US12 - o chat
// fica preso ao servico.
class Servico extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      id_contratante: { type: DataTypes.INTEGER, allowNull: false },
      id_prestador: { type: DataTypes.INTEGER, allowNull: false },
      // Bairro onde o servico sera feito: define se cabe taxa de deslocamento.
      bairro_id: { type: DataTypes.INTEGER, allowNull: false },
      descricao: { type: DataTypes.TEXT, allowNull: false },
      // Nomes dos arquivos das fotos do pedido (pasta privada de servicos).
      fotos: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          const valor = this.getDataValue('fotos');
          if (Array.isArray(valor)) return valor;
          if (typeof valor === 'string') {
            try { return JSON.parse(valor); } catch { return []; }
          }
          return [];
        }
      },
      // US13 - data e hora pedidas pelo contratante e as da proposta.
      data_hora_solicitada: { type: DataTypes.DATE, allowNull: false },
      data_hora_proposta: { type: DataTypes.DATE, allowNull: true },
      // US10 - orcamento: valor, prazo e deslocamento separados.
      valor: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      prazo_horas: { type: DataTypes.INTEGER, allowNull: true },
      taxa_deslocamento: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      status: { type: DataTypes.ENUM(...STATUS), allowNull: false, defaultValue: 'aguardando_orcamento' },
      orcamento_enviado_em: { type: DataTypes.DATE, allowNull: true },
      // US12 - quando o servico encerrou; o chat fecha e conta o prazo de
      // guarda das midias.
      encerrado_em: { type: DataTypes.DATE, allowNull: true },
      midias_removidas_em: { type: DataTypes.DATE, allowNull: true },
      // US13 - lembrete da vespera, enviado uma vez so.
      lembrete_enviado_em: { type: DataTypes.DATE, allowNull: true },
      // US11 - rua, numero e complemento (o bairro ja esta em bairro_id).
      // Informado pelo contratante ao aceitar o orcamento; so e liberado ao
      // prestador quando o servico chega em Aceito.
      endereco: { type: DataTypes.STRING(200), allowNull: true },
      // US11 / US18 - quando virou Aceito (o pagamento ficou retido).
      aceito_em: { type: DataTypes.DATE, allowNull: true }
    }, {
      sequelize,
      tableName: 'servicos',
      hooks: {
        // Qualquer historia que leve o servico a um status de encerramento
        // marca a data sozinha, sem precisar lembrar disso.
        beforeSave(servico) {
          if (servico.changed('status') && STATUS_ENCERRADOS.includes(servico.status) && !servico.encerrado_em) {
            servico.encerrado_em = new Date();
          }
        }
      }
    });
  }

  static associate(models) {
    this.belongsTo(models.Usuario, { foreignKey: 'id_contratante', as: 'contratante' });
    this.belongsTo(models.Prestador, { foreignKey: 'id_prestador', as: 'prestador' });
    this.belongsTo(models.Bairro, { foreignKey: 'bairro_id', as: 'bairro' });
    this.hasMany(models.Mensagem, { foreignKey: 'servico_id', as: 'mensagens', onDelete: 'RESTRICT' });
    this.hasMany(models.Pagamento, { foreignKey: 'servico_id', as: 'pagamentos', onDelete: 'RESTRICT' });
  }

  // US13 - horario que vale: o da proposta, quando ja existe.
  horarioCombinado() {
    return this.data_hora_proposta || this.data_hora_solicitada;
  }

  chatAberto() {
    return !STATUS_ENCERRADOS.includes(this.status);
  }

  enderecoLiberado() {
    return STATUS_ENDERECO_LIBERADO.includes(this.status);
  }
}

Servico.STATUS = STATUS;
Servico.STATUS_ENCERRADOS = STATUS_ENCERRADOS;
Servico.STATUS_COMPROMISSO = STATUS_COMPROMISSO;
Servico.STATUS_OCUPAM_HORARIO = STATUS_OCUPAM_HORARIO;
Servico.STATUS_CONCLUIDOS = STATUS_CONCLUIDOS;
Servico.STATUS_ENDERECO_LIBERADO = STATUS_ENDERECO_LIBERADO;

module.exports = Servico;
