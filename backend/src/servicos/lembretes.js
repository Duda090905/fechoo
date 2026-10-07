/**
 * US13 - Lembrete na vespera do atendimento, para as duas partes.
 *
 * Vale para compromisso aceito (antes do aceite nao ha compromisso). A rotina
 * roda ao iniciar a API e de hora em hora: quem tem atendimento nas proximas
 * 24 horas e ainda nao foi lembrado recebe o e-mail. Cada servico e lembrado
 * uma vez so (lembrete_enviado_em). Sem SMTP, o lembrete aparece no console.
 */
const { Op } = require('sequelize');
const { Servico, Usuario, Prestador } = require('../models');
const { enviarLembreteServico } = require('../utils/email');

const HORA_MS = 60 * 60 * 1000;

// `agora` e parametro para os testes poderem simular o passar do tempo.
async function processarLembretes(agora = new Date()) {
  const ate = new Date(agora.getTime() + 24 * HORA_MS);
  const servicos = await Servico.findAll({
    where: {
      status: 'aceito',
      lembrete_enviado_em: null,
      data_hora_proposta: { [Op.gt]: agora, [Op.lte]: ate }
    },
    include: [
      { model: Usuario, as: 'contratante', attributes: ['nome', 'email'] },
      {
        model: Prestador, as: 'prestador', attributes: ['id'],
        include: [{ model: Usuario, as: 'usuario', attributes: ['nome', 'email'] }]
      }
    ]
  });

  let enviados = 0;
  for (const servico of servicos) {
    try {
      const contratante = servico.contratante;
      const prestador = servico.prestador && servico.prestador.usuario;
      const horario = servico.data_hora_proposta;
      if (contratante && contratante.email && prestador) {
        await enviarLembreteServico(contratante.email, { horario, outraParte: prestador.nome, descricao: servico.descricao });
      }
      if (prestador && prestador.email && contratante) {
        await enviarLembreteServico(prestador.email, { horario, outraParte: contratante.nome, descricao: servico.descricao });
      }
      servico.lembrete_enviado_em = agora;
      await servico.save();
      enviados += 1;
    } catch (e) {
      // Um servico com problema nao pode travar os outros.
      console.error(`[lembrete] falha no servico ${servico.id}:`, e.message);
    }
  }
  return { enviados };
}

function iniciarRotinaLembretes() {
  const rodar = () => processarLembretes()
    .then((r) => { if (r.enviados) console.log('[lembrete]', r); })
    .catch((e) => console.error('[lembrete] falhou:', e.message));

  rodar();
  const temporizador = setInterval(rodar, HORA_MS);
  temporizador.unref();
}

module.exports = { processarLembretes, iniciarRotinaLembretes };
