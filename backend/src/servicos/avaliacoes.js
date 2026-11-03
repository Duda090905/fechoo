/**
 * US24 - Avaliacao mutua: prazos, publicacao e media do prestador.
 *
 * Decisoes do grupo (Sprint 4):
 *   - prazo para avaliar: 7 dias depois da confirmacao do servico. Vencido o
 *     prazo, a avaliacao que existir e publicada mesmo sem a da outra parte;
 *   - edicao: ate 24 horas depois de enviar (texto do card);
 *   - media do prestador: media simples de todas as avaliacoes publicadas
 *     que ele recebeu (sem peso maior para as ultimas 10 - o grupo preferiu
 *     a media simples; o card precisa ser atualizado);
 *   - consequencias so a partir de 5 avaliacoes: com menos, a nota aparece
 *     no cartao, mas nao muda a posicao do prestador na busca (US09).
 */
const { Op } = require('sequelize');
const { Avaliacao, Prestador } = require('../models');

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const EDICAO_HORAS = 24;
const MINIMO_PARA_BUSCA = 5;

function prazoDias() {
  const dias = Number(process.env.AVALIACAO_PRAZO_DIAS);
  return Number.isFinite(dias) && dias > 0 ? dias : 7;
}

function prazoParaAvaliar(servico) {
  return servico.confirmado_em ? new Date(new Date(servico.confirmado_em).getTime() + prazoDias() * DIA_MS) : null;
}

// Media simples das avaliacoes publicadas que o prestador recebeu de clientes.
async function recalcularMedia(usuarioPrestadorId) {
  const prestador = await Prestador.findOne({ where: { usuario_id: usuarioPrestadorId } });
  if (!prestador) return null;
  const notas = await Avaliacao.findAll({
    where: { avaliado_id: usuarioPrestadorId, papel_autor: 'contratante', liberada_em: { [Op.ne]: null } },
    attributes: ['nota']
  });
  const total = notas.length;
  const media = total ? Math.round((notas.reduce((s, a) => s + a.nota, 0) / total) * 100) / 100 : null;
  prestador.nota_media = media;
  prestador.total_avaliacoes = total;
  await prestador.save();
  return { media, total };
}

// Publica as duas avaliacoes de um servico quando as duas ja foram enviadas.
async function liberarSeCompleto(servicoId, agora = new Date()) {
  const avaliacoes = await Avaliacao.findAll({ where: { servico_id: servicoId } });
  if (avaliacoes.length < 2) return false;
  for (const a of avaliacoes) {
    if (!a.liberada_em) {
      a.liberada_em = agora;
      await a.save();
    }
  }
  const doPrestador = avaliacoes.find((a) => a.papel_autor === 'contratante');
  if (doPrestador) await recalcularMedia(doPrestador.avaliado_id);
  return true;
}

// Rotina: publica as avaliacoes cujo prazo venceu sem a da outra parte.
async function liberarAvaliacoesVencidas(agora = new Date()) {
  const vencidas = await Avaliacao.findAll({ where: { liberada_em: null, prazo_ate: { [Op.lte]: agora } } });
  const prestadores = new Set();
  for (const a of vencidas) {
    a.liberada_em = agora;
    await a.save();
    if (a.papel_autor === 'contratante') prestadores.add(a.avaliado_id);
  }
  for (const id of prestadores) await recalcularMedia(id);
  return vencidas.length;
}

// Media do contratante (o que os prestadores disseram dele), calculada na hora.
async function mediaDoContratante(usuarioId) {
  const notas = await Avaliacao.findAll({
    where: { avaliado_id: usuarioId, papel_autor: 'prestador', liberada_em: { [Op.ne]: null } },
    attributes: ['nota']
  });
  if (!notas.length) return { nota_media: null, total_avaliacoes: 0 };
  const media = Math.round((notas.reduce((s, a) => s + a.nota, 0) / notas.length) * 100) / 100;
  return { nota_media: media, total_avaliacoes: notas.length };
}

module.exports = {
  EDICAO_HORAS, MINIMO_PARA_BUSCA, HORA_MS, prazoDias, prazoParaAvaliar,
  recalcularMedia, liberarSeCompleto, liberarAvaliacoesVencidas, mediaDoContratante
};
