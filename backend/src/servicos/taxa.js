/**
 * US21 - Taxa decrescente por volume.
 *
 * A taxa e so do prestador e so sobre servico concluido:
 *   8% ate o 20o servico concluido
 *   6% do 21o ao 50o
 *   5% do 51o em diante
 *
 * Conta como concluido o servico Confirmado ou Pago. Cancelado, recusado e
 * em disputa nao contam. A conta e feita na hora do repasse, olhando quantos
 * servicos o prestador ja tinha concluido antes deste.
 *
 * Decisao do grupo (Sprint 4): a taxa vale so sobre o valor do servico. A
 * taxa de deslocamento e gasto do prestador e vai inteira para ele.
 */
const { Op } = require('sequelize');
const { Servico } = require('../models');

// "a partir_de": quantos servicos ja concluidos antes deste para a faixa valer.
const FAIXAS = [
  { percentual: 8, a_partir_de: 0 },
  { percentual: 6, a_partir_de: 20 },
  { percentual: 5, a_partir_de: 50 }
];

function emReais(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

// Percentual para o proximo servico de quem ja concluiu `concluidos`.
function percentualPara(concluidos) {
  let faixa = FAIXAS[0];
  for (const f of FAIXAS) if (concluidos >= f.a_partir_de) faixa = f;
  return faixa.percentual;
}

async function contarConcluidos(prestadorId, { excetoServicoId = null, transaction } = {}) {
  const where = { id_prestador: prestadorId, status: Servico.STATUS_CONCLUIDOS };
  if (excetoServicoId) where.id = { [Op.ne]: excetoServicoId };
  return Servico.count({ where, transaction });
}

// Taxa de um servico: percentual, valor da taxa e liquido do prestador.
function calcular({ valorServico, valorTotal, percentual }) {
  const taxa = emReais(Number(valorServico) * percentual / 100);
  return { percentual, taxa, liquido: emReais(Number(valorTotal) - taxa) };
}

// US21 - faixa atual e a proxima, para o painel do prestador.
async function faixaDoPrestador(prestadorId) {
  const concluidos = await contarConcluidos(prestadorId);
  const percentual = percentualPara(concluidos);
  const proxima = FAIXAS.find((f) => f.a_partir_de > concluidos) || null;
  return {
    percentual,
    servicos_concluidos: concluidos,
    proxima: proxima
      ? { percentual: proxima.percentual, a_partir_do_servico: proxima.a_partir_de + 1, faltam: proxima.a_partir_de - concluidos }
      : null,
    faixas: FAIXAS.map((f) => ({ percentual: f.percentual, a_partir_do_servico: f.a_partir_de + 1 }))
  };
}

module.exports = { FAIXAS, percentualPara, contarConcluidos, calcular, faixaDoPrestador, emReais };
