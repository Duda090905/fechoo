/**
 * Pendencias que impedem desativar ou excluir uma conta (US04).
 *
 * Cada modulo que cria compromisso entre duas pessoas registra aqui o seu
 * verificador. Assim a regra de bloqueio fica em um lugar so, e o Sprint 2
 * nao precisa mexer no controller de conta.
 *
 * Um verificador recebe o id do usuario e devolve:
 *   null                              quando nao ha pendencia
 *   { tipo, descricao, quantidade }   quando ha
 */
const verificadores = [];

function registrarVerificador(fn) {
  verificadores.push(fn);
}

function limparVerificadores() {
  verificadores.length = 0;
}

async function listarPendencias(usuarioId) {
  const encontradas = [];
  for (const verificar of verificadores) {
    const resultado = await verificar(usuarioId);
    if (resultado) encontradas.push(...[].concat(resultado));
  }
  return encontradas;
}

/*
 * A partir do Sprint 2, o modulo de servicos vai registrar algo assim:
 *
 * registrarVerificador(async (usuarioId) => {
 *   const abertos = await Servico.count({
 *     where: {
 *       [Op.or]: [{ id_contratante: usuarioId }, { id_prestador: usuarioId }],
 *       status: ['aceito', 'pago', 'em_andamento', 'concluido']
 *     }
 *   });
 *   return abertos ? { tipo: 'servico', descricao: 'Servico em andamento', quantidade: abertos } : null;
 * });
 *
 * E o de disputas registra outro, para disputa aberta e valor retido.
 */

module.exports = { registrarVerificador, limparVerificadores, listarPendencias };
