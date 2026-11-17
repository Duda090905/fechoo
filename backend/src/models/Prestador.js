const { DataTypes, Model } = require('sequelize');

// US05 / US07 / US08 / US09 - perfil profissional.
class Prestador extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuario_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      descricao: { type: DataTypes.TEXT, allowNull: true },
      foto_url: { type: DataTypes.STRING(255), allowNull: true },
      // US07 - pausar perfil
      status: { type: DataTypes.ENUM('ativo', 'pausado', 'suspenso'), defaultValue: 'ativo' },
      pausado_em: { type: DataTypes.DATE, allowNull: true },
      // US08 - opcao da propria prestadora, nunca marcada por padrao
      atende_apenas_mulheres: { type: DataTypes.BOOLEAN, defaultValue: false },
      // US09 - a busca ordena por esta nota e o cartao a exibe. Vazia ate
      // existirem avaliacoes: quem calcula e grava a media e a US24.
      nota_media: { type: DataTypes.DECIMAL(3, 2), allowNull: true },
      // US09 / US06 - selo de identidade verificada. So a US06 marca o campo:
      // quando a chave Pix cadastrada esta no CPF da propria conta.
      verificado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // US06 - chave Pix para receber (o repasse e a US20). No MVP so a chave
      // do tipo CPF, a unica cujo titular da para conferir sem consulta externa.
      chave_pix_tipo: { type: DataTypes.STRING(10), allowNull: true },
      chave_pix: { type: DataTypes.STRING(77), allowNull: true },
      verificado_em: { type: DataTypes.DATE, allowNull: true }
    }, {
      sequelize,
      tableName: 'prestadores',
      // US09 - indice para o filtro de status da busca (pausado e suspenso saem)
      indexes: [{ name: 'idx_prestadores_status', fields: ['status'] }]
    });
  }

  static associate(models) {
    this.belongsTo(models.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
    this.belongsToMany(models.Categoria, {
      through: { model: models.PrestadorCategoria, unique: false }, foreignKey: 'prestador_id',
      otherKey: 'categoria_id', as: 'categorias'
    });
    this.belongsToMany(models.Bairro, {
      through: { model: models.PrestadorBairro, unique: false }, foreignKey: 'prestador_id',
      otherKey: 'bairro_id', as: 'bairros'
    });
  }
}

module.exports = Prestador;
