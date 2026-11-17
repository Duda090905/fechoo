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

/*
 * Sprint 3 - verificador fixo: servico aceito (ou depois) ainda nao encerrado
 * e dinheiro congelado (pagamento Retido) prendem as duas partes. E o que a
 * US04 pede ("bloquear a exclusao enquanto houver servico em andamento ou
 * valor retido") e so passou a existir de verdade com o aceite e o Pix.
 * Fica fora da lista acima para o limparVerificadores dos testes nao apaga-lo.
 */
async function servicosEmAndamento(usuarioId) {
  const { Op } = require('sequelize');
  const { Servico, Prestador, Pagamento } = require('../models');
  const prestador = await Prestador.findOne({ where: { usuario_id: usuarioId }, attributes: ['id'] });
  const dono = [{ id_contratante: usuarioId }];
  if (prestador) dono.push({ id_prestador: prestador.id });
  const servicos = await Servico.findAll({ where: { [Op.or]: dono }, attributes: ['id', 'status'] });
  if (!servicos.length) return [];

  const andamento = servicos.filter((s) => ['aceito', 'em_execucao', 'concluido', 'confirmado', 'em_disputa'].includes(s.status));
  const retidos = await Pagamento.count({ where: { servico_id: servicos.map((s) => s.id), status: 'retido' } });
  const encontradas = [];
  if (andamento.length) {
    encontradas.push({ tipo: 'servico', descricao: 'Serviço em andamento', quantidade: andamento.length });
  }
  if (retidos) {
    encontradas.push({ tipo: 'valor_retido', descricao: 'Pagamento congelado aguardando a conclusão', quantidade: retidos });
  }
  return encontradas;
}

async function listarPendencias(usuarioId) {
  const encontradas = [...await servicosEmAndamento(usuarioId)];
  for (const verificar of verificadores) {
    const resultado = await verificar(usuarioId);
    if (resultado) encontradas.push(...[].concat(resultado));
  }
  return encontradas;
}

module.exports = { registrarVerificador, limparVerificadores, listarPendencias };
