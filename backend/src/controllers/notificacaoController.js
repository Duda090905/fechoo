const { Notificacao } = require('../models');

// US11 / US18 - avisos de quem esta logado (so os proprios).
async function listar(req, res, next) {
  try {
    const avisos = await Notificacao.findAll({
      where: { usuario_id: req.usuario.id },
      order: [['id', 'DESC']],
      limit: 30
    });
    return res.json({
      notificacoes: avisos.map((a) => ({
        id: a.id,
        servico_id: a.servico_id,
        tipo: a.tipo,
        titulo: a.titulo,
        texto: a.texto,
        lida: Boolean(a.lida_em),
        criada_em: a.createdAt
      }))
    });
  } catch (e) {
    return next(e);
  }
}

// Marca como lidos todos os avisos da pessoa.
async function marcarLidas(req, res, next) {
  try {
    await Notificacao.update({ lida_em: new Date() }, { where: { usuario_id: req.usuario.id, lida_em: null } });
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
}

module.exports = { listar, marcarLidas };
