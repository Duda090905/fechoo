const { DataTypes, Model } = require('sequelize');

// US01 / US02 / US04 - conta de qualquer pessoa na plataforma.
class Usuario extends Model {
  static init(sequelize) {
    return super.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING(120), allowNull: false },
      cpf: { type: DataTypes.STRING(11), allowNull: true, unique: true },
      email: { type: DataTypes.STRING(160), allowNull: true, unique: true },
      telefone: { type: DataTypes.STRING(20), allowNull: true },
      senha_hash: { type: DataTypes.STRING(120), allowNull: true },
      // US08 - preenchimento opcional, usado apenas pelo filtro de seguranca.
      sexo: { type: DataTypes.ENUM('feminino', 'masculino', 'nao_informado'), defaultValue: 'nao_informado' },
      tipo_perfil: { type: DataTypes.ENUM('contratante', 'prestador'), allowNull: false },
      // ativo    - usa a plataforma normalmente
      // inativo  - conta desativada pela propria pessoa; dados preservados,
      //            perfil fora do ar
      // excluido - dados pessoais apagados a pedido (LGPD)
      status: { type: DataTypes.ENUM('ativo', 'inativo', 'excluido'), defaultValue: 'ativo' },
      // US01 - LGPD
      aceite_termos: { type: DataTypes.BOOLEAN, defaultValue: false },
      aceite_termos_em: { type: DataTypes.DATE, allowNull: true },
      // US03 - sobe a cada troca de senha. O JWT carrega a versao com que foi
      // emitido; se nao bater com a atual, a sessao esta encerrada.
      token_versao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      desativado_em: { type: DataTypes.DATE, allowNull: true },
      reativado_em: { type: DataTypes.DATE, allowNull: true },
      excluido_em: { type: DataTypes.DATE, allowNull: true }
    }, { sequelize, tableName: 'usuarios' });
  }

  static associate(models) {
    this.hasOne(models.Prestador, { foreignKey: 'usuario_id', as: 'prestador' });
    this.hasMany(models.TokenSenha, { foreignKey: 'usuario_id', as: 'tokens' });
  }

  // Nunca devolver hash de senha nem CPF completo para o front.
  publico() {
    return {
      id: this.id,
      nome: this.nome,
      email: this.email,
      telefone: this.telefone,
      sexo: this.sexo,
      tipo_perfil: this.tipo_perfil,
      status: this.status,
      desativado_em: this.desativado_em
    };
  }
}

module.exports = Usuario;
