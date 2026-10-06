const { sequelize, Prestador } = require('../models');

/**
 * US04 - Reabre a conta de quem apagou os dados e voltou com o mesmo CPF.
 *
 * Regra do grupo: um CPF, uma conta. Quem apaga os dados nao ganha uma conta
 * nova e limpa; ao se cadastrar de novo, volta para o MESMO registro (mesmo id).
 * Assim tudo o que estiver ligado a esse id nos proximos sprints (servicos,
 * avaliacoes, cancelamentos, disputas, contagem de servicos da taxa) continua
 * valendo, sem precisar de nenhuma consulta especial.
 *
 * Os dados pessoais foram apagados a pedido da pessoa, entao ela preenche tudo
 * de novo; o perfil de prestador tambem recomeca vazio.
 *
 * Quem chama ja conferiu que o CPF e valido, que nao existe conta ativa ou
 * inativa com ele e que o CPF nao foi banido.
 */
async function reabrirConta(usuario, dados) {
  const agora = new Date();

  return sequelize.transaction(async (transaction) => {
    usuario.set({
      nome: dados.nome,
      cpf: dados.cpf,
      email: dados.email,
      telefone: dados.telefone,
      senha_hash: dados.senha_hash,
      tipo_perfil: dados.tipo_perfil,
      sexo: dados.sexo,
      status: 'ativo',
      aceite_termos: true,
      aceite_termos_em: agora,
      reativado_em: agora,
      desativado_em: null,
      excluido_em: null,
      ultimo_acesso_em: null,
      aviso_retencao_em: null,
      // Garante que nenhum token emitido antes da exclusao volte a valer.
      token_versao: (usuario.token_versao || 0) + 1
    });
    await usuario.save({ transaction });

    // A anonimizacao deixa o perfil de prestador fora do ar. Se a pessoa volta
    // como prestador, o perfil (vazio) volta a poder ser montado e pausado.
    // Quando a US25 criar a suspensao pela administracao, ela precisa ficar
    // marcada no usuario, para nao ser desfeita aqui.
    if (dados.tipo_perfil === 'prestador') {
      const prestador = await Prestador.findOne({ where: { usuario_id: usuario.id }, transaction });
      if (prestador) {
        prestador.status = 'ativo';
        prestador.pausado_em = null;
        await prestador.save({ transaction });
      }
    }

    return usuario;
  });
}

module.exports = { reabrirConta };
