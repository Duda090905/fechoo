/**
 * US24 - Avaliacao mutua: prazos, publicacao e media do prestador.
 *
 * Decisoes do grupo (Sprint 4):
 *   - prazo para avaliar: 7 dias depois da confirmacao do servico. Vencido o
 *     prazo, a avaliacao que existir e publicada mesmo sem a da outra parte;
 *   - edicao: ate 24 horas depois de enviar (texto do card);
 *   - media (texto do card): as avaliacoes dos 10 servicos mais recentes
 *     valem 2; as mais antigas valem 1. Com 10 avaliacoes ou menos, todas
 *     sao "recentes" e a conta da o mesmo que a media simples;
 *   - consequencias so a partir de 5 avaliacoes: com menos, a nota aparece
 *     no cartao, mas nao muda a posicao do prestador na busca (US09).
 */
const { Op } = require('sequelize');
const { Avaliacao, Prestador, Servico } = require('../models');

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const EDICAO_HORAS = 24;
const MINIMO_PARA_BUSCA = 5;
// US24 - "peso maior para os ultimos 10 servicos".
const RECENTES = 10;
const PESO_RECENTES = 2;
const PESO_ANTIGAS = 1;

function prazoDias() {
  const dias = Number(process.env.AVALIACAO_PRAZO_DIAS);
  return Number.isFinite(dias) && dias > 0 ? dias : 7;
}

function prazoParaAvaliar(servico) {
  return servico.confirmado_em ? new Date(new Date(servico.confirmado_em).getTime() + prazoDias() * DIA_MS) : null;
}

// Quando o servico avaliado foi confirmado (a avaliacao, se faltar a data).
function dataDoServico(a) {
  const confirmado = a.servico && a.servico.confirmado_em;
  return new Date(confirmado || a.createdAt || 0).getTime();
}

/**
 * US24 - media com peso maior para os ultimos 10 servicos.
 * Ordena do servico mais recente para o mais antigo; os 10 primeiros valem
 * PESO_RECENTES e o resto vale PESO_ANTIGAS.
 *   Ex.: 10 notas 5 recentes e 2 notas 1 antigas:
 *        (10 x 5 x 2 + 2 x 1 x 1) / (10 x 2 + 2 x 1) = 102 / 22 = 4,64
 *        (a media simples daria 52 / 12 = 4,33)
 */
function mediaComPeso(avaliacoes) {
  if (!avaliacoes.length) return null;
  const ordem = [...avaliacoes].sort((a, b) => dataDoServico(b) - dataDoServico(a));
  let soma = 0;
  let pesos = 0;
  ordem.forEach((a, i) => {
    const peso = i < RECENTES ? PESO_RECENTES : PESO_ANTIGAS;
    soma += a.nota * peso;
    pesos += peso;
  });
  return Math.round((soma / pesos) * 100) / 100;
}

// Avaliacoes publicadas que alguem recebeu, com a data do servico.
function publicadasDe(usuarioId, papelAutor) {
  return Avaliacao.findAll({
    where: { avaliado_id: usuarioId, papel_autor: papelAutor, liberada_em: { [Op.ne]: null } },
    attributes: ['nota', 'createdAt'],
    include: [{ model: Servico, as: 'servico', attributes: ['confirmado_em'] }]
  });
}

// Nota do prestador: o que os clientes disseram dele.
async function recalcularMedia(usuarioPrestadorId) {
  const prestador = await Prestador.findOne({ where: { usuario_id: usuarioPrestadorId } });
  if (!prestador) return null;
  const avaliacoes = await publicadasDe(usuarioPrestadorId, 'contratante');
  const media = mediaComPeso(avaliacoes);
  prestador.nota_media = media;
  prestador.total_avaliacoes = avaliacoes.length;
  await prestador.save();
  return { media, total: avaliacoes.length };
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

// Nota do contratante (o que os prestadores disseram dele), calculada na
// hora, com a mesma regra de peso.
async function mediaDoContratante(usuarioId) {
  const avaliacoes = await publicadasDe(usuarioId, 'prestador');
  return { nota_media: mediaComPeso(avaliacoes), total_avaliacoes: avaliacoes.length };
}

module.exports = {
  EDICAO_HORAS, MINIMO_PARA_BUSCA, HORA_MS, RECENTES, PESO_RECENTES, PESO_ANTIGAS, prazoDias, prazoParaAvaliar,
  mediaComPeso, recalcularMedia, liberarSeCompleto, liberarAvaliacoesVencidas, mediaDoContratante
};
