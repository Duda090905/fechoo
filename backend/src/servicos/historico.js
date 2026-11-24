/**
 * Historico do servico: cada passo registrado com quem fez e quando.
 * usuarioId vazio = o proprio sistema (gateway, confirmacao automatica).
 */
const { HistoricoServico } = require('../models');

async function registrar(servicoId, { usuarioId = null, acao, de = null, para = null, detalhe = null }, transaction) {
  return HistoricoServico.create({
    servico_id: servicoId,
    usuario_id: usuarioId,
    acao,
    status_anterior: de,
    status_novo: para,
    detalhe: detalhe ? String(detalhe).slice(0, 300) : null
  }, { transaction });
}

module.exports = { registrar };
