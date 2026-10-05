/**
 * US04 - Retencao de conta inativa.
 *
 * Quem desativa a conta tem os dados guardados por RETENCAO_MESES (padrao 12).
 * Depois disso os dados pessoais sao anonimizados, do mesmo jeito que no botao
 * "Apagar meus dados". Regras:
 *
 *  - o relogio conta a partir do mais recente entre a desativacao e o ultimo
 *    acesso: entrar na conta zera a contagem e cancela o aviso;
 *  - a pessoa recebe um e-mail RETENCAO_AVISO_DIAS (padrao 30) antes. Se a
 *    rotina atrasar e o aviso sair tarde, a exclusao espera completar esses dias;
 *  - conta com pendencia (servico em andamento, valor retido) nunca e anonimizada;
 *  - cada exclusao fica registrada em solicitacoes_exclusao, com origem
 *    "rotina_automatica".
 */
const { Op } = require('sequelize');
const { Usuario, SolicitacaoExclusao } = require('../models');
const { listarPendencias } = require('./pendencias');
const { anonimizarConta } = require('./anonimizacao');
const { enviarAvisoRetencao } = require('../utils/email');

const DIA_MS = 24 * 60 * 60 * 1000;

function configuracao() {
  return {
    meses: Number(process.env.RETENCAO_MESES || 12),
    avisoDias: Number(process.env.RETENCAO_AVISO_DIAS || 30)
  };
}

function somarMeses(data, meses) {
  const resultado = new Date(data);
  resultado.setMonth(resultado.getMonth() + meses);
  return resultado;
}

function inicioDaContagem(usuario) {
  const datas = [usuario.desativado_em, usuario.ultimo_acesso_em]
    .filter(Boolean)
    .map((d) => new Date(d).getTime());
  return new Date(Math.max(...datas));
}

// `agora` e parametro para os testes poderem simular o passar do tempo.
async function processarRetencao(agora = new Date()) {
  const { meses, avisoDias } = configuracao();
  const resumo = { avisadas: 0, anonimizadas: 0, puladas_por_pendencia: 0 };

  const inativas = await Usuario.findAll({
    where: { status: 'inativo', desativado_em: { [Op.ne]: null } }
  });

  for (const usuario of inativas) {
    try {
      const vencimento = somarMeses(inicioDaContagem(usuario), meses);
      const inicioDoAviso = new Date(vencimento.getTime() - avisoDias * DIA_MS);
      if (agora < inicioDoAviso) continue;

      // 1. Ainda sem aviso: avisa agora. A exclusao nunca acontece na mesma
      //    rodada, porque falta cumprir os dias de aviso.
      if (!usuario.aviso_retencao_em) {
        const dataLimite = new Date(Math.max(vencimento.getTime(), agora.getTime() + avisoDias * DIA_MS));
        if (usuario.email) await enviarAvisoRetencao(usuario.email, dataLimite);
        usuario.aviso_retencao_em = agora;
        await usuario.save();
        resumo.avisadas += 1;
        continue;
      }

      // 2. Ja avisada: so apaga depois do prazo E dos dias de aviso.
      const limite = Math.max(
        vencimento.getTime(),
        new Date(usuario.aviso_retencao_em).getTime() + avisoDias * DIA_MS
      );
      if (agora.getTime() < limite) continue;

      if ((await listarPendencias(usuario.id)).length) {
        resumo.puladas_por_pendencia += 1;
        continue;
      }

      await anonimizarConta(usuario);
      await SolicitacaoExclusao.create({
        usuario_id: usuario.id, tipo: 'exclusao_dados', origem: 'rotina_automatica', resultado: 'concluida'
      });
      resumo.anonimizadas += 1;
    } catch (e) {
      // Uma conta com problema nao pode travar as outras.
      console.error(`[retencao] falha na conta ${usuario.id}:`, e.message);
    }
  }

  return resumo;
}

// Roda ao iniciar a API e depois uma vez por dia.
function iniciarRotinaRetencao() {
  const rodar = () => processarRetencao()
    .then((r) => {
      if (r.avisadas || r.anonimizadas || r.puladas_por_pendencia) console.log('[retencao]', r);
    })
    .catch((e) => console.error('[retencao] falhou:', e.message));

  rodar();
  const temporizador = setInterval(rodar, DIA_MS);
  temporizador.unref();
}

module.exports = { processarRetencao, iniciarRotinaRetencao, somarMeses };
