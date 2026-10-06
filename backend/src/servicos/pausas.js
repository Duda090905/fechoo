const { Pausa } = require('../models');

// US07 - abre e fecha os periodos de pausa. Quem muda o status do prestador
// para "pausado" ou volta para "ativo" passa por aqui, para o historico
// nunca divergir do status.

async function iniciarPausa(prestador) {
  const agora = new Date();
  prestador.status = 'pausado';
  prestador.pausado_em = agora;
  await prestador.save();
  await Pausa.create({ prestador_id: prestador.id, inicio: agora });
}

// Fecha qualquer periodo ainda aberto deste prestador.
async function encerrarPausa(prestador) {
  await Pausa.update({ fim: new Date() }, { where: { prestador_id: prestador.id, fim: null } });
}

async function retomar(prestador) {
  prestador.status = 'ativo';
  prestador.pausado_em = null;
  await prestador.save();
  await encerrarPausa(prestador);
}

module.exports = { iniciarPausa, encerrarPausa, retomar };
