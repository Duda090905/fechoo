/**
 * US24 - Avaliacao mutua.
 *
 *   POST /servicos/:id/avaliacao           envia (nota 1 a 5 e comentario)
 *   PUT  /servicos/:id/avaliacao           edita, ate 24 horas depois de enviar
 *   POST /servicos/:id/avaliacao/resposta  o prestador responde a que recebeu
 *   GET  /prestadores/:id/avaliacoes       avaliacoes publicadas (publico)
 *
 * Regras e prazos ficam em servicos/avaliacoes.js.
 */
const { Op } = require('sequelize');
const { Avaliacao, Prestador, Usuario } = require('../models');
const { carregarDaParte } = require('./servicoController');
const {
  EDICAO_HORAS, HORA_MS, prazoParaAvaliar, liberarSeCompleto, recalcularMedia
} = require('../servicos/avaliacoes');
const { registrar } = require('../servicos/historico');
const { avisar } = require('../servicos/avisos');

const COMENTARIO_MAXIMO = 500;
const PODEM_AVALIAR = ['confirmado', 'pago', 'resolvido'];

function lerNota(valor) {
  const nota = Number(valor);
  return Number.isInteger(nota) && nota >= 1 && nota <= 5 ? nota : null;
}

function lerComentario(valor) {
  if (valor === undefined || valor === null) return { comentario: null };
  const texto = String(valor).replace(/\s+/g, ' ').trim();
  if (texto.length > COMENTARIO_MAXIMO) return { erro: `O comentário pode ter no máximo ${COMENTARIO_MAXIMO} caracteres.` };
  return { comentario: texto || null };
}

function avaliadoDe(servico) {
  return servico.papel === 'contratante' ? servico.prestador.usuario_id : servico.id_contratante;
}

async function avaliar(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    // So quem participou e teve o servico confirmado avalia.
    if (!PODEM_AVALIAR.includes(servico.status)) {
      return res.status(409).json({ erro: 'A avaliação abre depois que o serviço é confirmado.' });
    }
    const agora = new Date();
    const prazo = prazoParaAvaliar(servico);
    if (!prazo || agora >= prazo) {
      return res.status(409).json({ erro: 'O prazo para avaliar este serviço já terminou.' });
    }
    const nota = lerNota(req.body.nota);
    if (!nota) return res.status(400).json({ erro: 'Escolha uma nota de 1 a 5.' });
    const { comentario, erro } = lerComentario(req.body.comentario);
    if (erro) return res.status(400).json({ erro });

    const ja = await Avaliacao.findOne({ where: { servico_id: servico.id, autor_id: req.usuario.id } });
    if (ja) return res.status(409).json({ erro: 'Você já avaliou este serviço. Para mudar, edite a sua avaliação.' });

    await Avaliacao.create({
      servico_id: servico.id,
      autor_id: req.usuario.id,
      avaliado_id: avaliadoDe(servico),
      papel_autor: servico.papel,
      nota,
      comentario,
      editavel_ate: new Date(agora.getTime() + EDICAO_HORAS * HORA_MS),
      prazo_ate: prazo
    });
    await registrar(servico.id, { usuarioId: req.usuario.id, acao: 'avaliacao', detalhe: `Avaliação enviada (${nota} de 5)` });
    const publicada = await liberarSeCompleto(servico.id, agora);
    if (!publicada) {
      await avisar({
        usuarioId: avaliadoDe(servico),
        servicoId: servico.id,
        tipo: 'avaliacao_recebida',
        titulo: 'Você recebeu uma avaliação',
        texto: 'A outra parte já avaliou o serviço. Avalie também para as duas avaliações aparecerem.',
        email: false
      });
    }
    return res.status(201).json({
      mensagem: publicada
        ? 'Avaliação enviada. As duas avaliações já estão publicadas.'
        : `Avaliação enviada. Ela aparece quando a outra parte também avaliar, ou no fim do prazo. Você pode editar por ${EDICAO_HORAS} horas.`,
      publicada
    });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ erro: 'Você já avaliou este serviço.' });
    }
    return next(e);
  }
}

async function editar(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    const avaliacao = await Avaliacao.findOne({ where: { servico_id: servico.id, autor_id: req.usuario.id } });
    if (!avaliacao) return res.status(404).json({ erro: 'Você ainda não avaliou este serviço.' });
    if (new Date() >= new Date(avaliacao.editavel_ate)) {
      return res.status(409).json({ erro: `A avaliação só pode ser editada nas primeiras ${EDICAO_HORAS} horas.` });
    }
    const nota = req.body.nota === undefined ? avaliacao.nota : lerNota(req.body.nota);
    if (!nota) return res.status(400).json({ erro: 'Escolha uma nota de 1 a 5.' });
    const { comentario, erro } = req.body.comentario === undefined
      ? { comentario: avaliacao.comentario }
      : lerComentario(req.body.comentario);
    if (erro) return res.status(400).json({ erro });

    avaliacao.nota = nota;
    avaliacao.comentario = comentario;
    await avaliacao.save();
    if (avaliacao.liberada_em && avaliacao.papel_autor === 'contratante') await recalcularMedia(avaliacao.avaliado_id);
    await registrar(servico.id, { usuarioId: req.usuario.id, acao: 'avaliacao_editada', detalhe: `Nova nota: ${nota} de 5` });
    return res.json({ mensagem: 'Avaliação atualizada.' });
  } catch (e) {
    return next(e);
  }
}

// O prestador responde, uma vez, a avaliacao publicada que recebeu.
async function responder(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'prestador') {
      return res.status(403).json({ erro: 'Só o profissional responde a avaliação que recebeu.' });
    }
    const avaliacao = await Avaliacao.findOne({ where: { servico_id: servico.id, papel_autor: 'contratante' } });
    if (!avaliacao || !avaliacao.liberada_em) {
      return res.status(409).json({ erro: 'A avaliação do cliente ainda não foi publicada.' });
    }
    if (avaliacao.resposta) return res.status(409).json({ erro: 'Você já respondeu esta avaliação.' });
    const { comentario: texto, erro } = lerComentario(req.body.texto);
    if (erro) return res.status(400).json({ erro });
    if (!texto) return res.status(400).json({ erro: 'Escreva a sua resposta.' });

    avaliacao.resposta = texto;
    avaliacao.respondida_em = new Date();
    await avaliacao.save();
    return res.json({ mensagem: 'Resposta publicada junto com a avaliação.' });
  } catch (e) {
    return next(e);
  }
}

// Publico: o que os clientes disseram de um prestador (so as publicadas).
async function doPrestador(req, res, next) {
  try {
    const id = Number(req.params.id);
    const prestador = Number.isInteger(id) && id > 0
      ? await Prestador.findByPk(id, { attributes: ['id', 'usuario_id', 'nota_media', 'total_avaliacoes'] })
      : null;
    if (!prestador) return res.status(404).json({ erro: 'Profissional não encontrado.' });

    const avaliacoes = await Avaliacao.findAll({
      where: { avaliado_id: prestador.usuario_id, papel_autor: 'contratante', liberada_em: { [Op.ne]: null } },
      include: [{ model: Usuario, as: 'autor', attributes: ['nome', 'status'] }],
      order: [['liberada_em', 'DESC']],
      limit: 50
    });
    return res.json({
      nota_media: prestador.nota_media === null ? null : Number(prestador.nota_media),
      total_avaliacoes: prestador.total_avaliacoes || 0,
      avaliacoes: avaliacoes.map((a) => ({
        nota: a.nota,
        comentario: a.comentario,
        // So o primeiro nome. Quem apagou os dados (US04) nao e identificado.
        autor: a.autor && a.autor.status !== 'excluido' ? a.autor.nome.split(' ')[0] : 'Cliente',
        em: a.liberada_em,
        resposta: a.resposta
      }))
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { avaliar, editar, responder, doPrestador };
