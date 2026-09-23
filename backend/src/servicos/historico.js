const { Usuario } = require('../models');

/**
 * Corrente de contas da mesma pessoa (US04).
 *
 * Quando alguem apaga os dados e volta, a conta nova nasce com
 * conta_anterior_id apontando para a antiga. Esta funcao percorre a
 * corrente inteira e devolve os ids, do mais recente para o mais antigo.
 *
 * A partir do Sprint 3, a media de avaliacoes e a contagem de disputas
 * consultam esses ids em vez de apenas o id atual. E o que impede alguem
 * de limpar a reputacao apagando a conta.
 *
 *   const ids = await idsDaPessoa(usuario.id);
 *   const nota = await Avaliacao.findAll({ where: { avaliado_id: ids } });
 */
async function idsDaPessoa(usuarioId) {
  const ids = [usuarioId];
  let atual = await Usuario.findByPk(usuarioId, { attributes: ['id', 'conta_anterior_id'] });

  // O limite evita laco infinito caso algum dado fique inconsistente.
  let voltas = 0;
  while (atual && atual.conta_anterior_id && voltas < 20) {
    ids.push(atual.conta_anterior_id);
    atual = await Usuario.findByPk(atual.conta_anterior_id, { attributes: ['id', 'conta_anterior_id'] });
    voltas += 1;
  }

  return ids;
}

async function jaTeveContaAntes(usuarioId) {
  const ids = await idsDaPessoa(usuarioId);
  return ids.length > 1;
}

module.exports = { idsDaPessoa, jaTeveContaAntes };
