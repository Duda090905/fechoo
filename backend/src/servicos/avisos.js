/**
 * Sprint 4 - avisos dentro do app (e por e-mail) sobre o andamento do
 * servico: concluido, confirmado, repasse, cancelamento, reagendamento.
 *
 * Um aviso por pessoa, servico e tipo (indice unico da tabela). Se o mesmo
 * tipo acontecer de novo no mesmo servico, o aviso e atualizado e volta a
 * aparecer como nao lido, em vez de duplicar.
 */
const { Notificacao, Usuario } = require('../models');
const { enviarAvisoServico } = require('../utils/email');

async function avisar({ usuarioId, servicoId, tipo, titulo, texto, email = true }) {
  if (!usuarioId) return;
  const [aviso, criado] = await Notificacao.findOrCreate({
    where: { usuario_id: usuarioId, servico_id: servicoId, tipo },
    defaults: { titulo, texto }
  });
  if (!criado) {
    aviso.titulo = titulo;
    aviso.texto = texto;
    aviso.lida_em = null;
    await aviso.save();
  }
  if (!email) return;
  try {
    const usuario = await Usuario.findByPk(usuarioId, { attributes: ['email'] });
    if (usuario && usuario.email) await enviarAvisoServico(usuario.email, { titulo, texto });
  } catch (e) {
    // Falha no e-mail nao desfaz nada: o aviso no app ja esta gravado.
    console.error('[aviso] falha ao enviar e-mail:', e.message);
  }
}

module.exports = { avisar };
