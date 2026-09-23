const { DataTypes, Model } = require('sequelize');

// US05 / US07 / US08 - perfil profissional.
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
      // US06 (sprint seguinte) - o campo ja nasce aqui
      verificado: { type: DataTypes.BOOLEAN, defaultValue: false }
    }, { sequelize, tableName: 'prestadores' });
  }

  static associate(models) {
    this.belongsTo(models.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
    this.belongsToMany(models.Categoria, {
      through: 'prestador_categorias', foreignKey: 'prestador_id',
      otherKey: 'categoria_id', as: 'categorias', timestamps: false
    });
    this.belongsToMany(models.Bairro, {
      through: 'prestador_bairros', foreignKey: 'prestador_id',
      otherKey: 'bairro_id', as: 'bairros', timestamps: false
    });
  }
}

module.exports = Prestador;
