/**
 * US12 - Prazo de guarda das midias do servico.
 *
 * Imagens do chat e fotos do pedido ficam guardadas por MIDIAS_RETENCAO_DIAS
 * (padrao 90) depois que o servico encerra. O prazo cobre a disputa (aberta
 * em ate 72 horas depois da conclusao e decidida em ate 7 dias) e o pedido de
 * devolucao de um Pix (MED), que pode ser feito em ate 80 dias.
 *
 * Vencido o prazo, os arquivos saem do disco. O texto das mensagens continua
 * guardado; no lugar da imagem o chat avisa que ela foi removida.
 * A rotina roda ao iniciar a API e uma vez por dia.
 */
const { Op } = require('sequelize');
const { Servico, Mensagem } = require('../models');
const { removerArquivoServico } = require('./armazenamento');

const DIA_MS = 24 * 60 * 60 * 1000;

function diasDeGuarda() {
  return Number(process.env.MIDIAS_RETENCAO_DIAS || 90);
}

// `agora` e parametro para os testes poderem simular o passar do tempo.
async function processarRetencaoMidias(agora = new Date()) {
  const limite = new Date(agora.getTime() - diasDeGuarda() * DIA_MS);
  const vencidos = await Servico.findAll({
    where: { encerrado_em: { [Op.lte]: limite }, midias_removidas_em: null }
  });

  let servicos = 0;
  for (const servico of vencidos) {
    try {
      const comImagem = await Mensagem.findAll({
        where: { servico_id: servico.id, imagem: { [Op.ne]: null } }
      });
      for (const mensagem of comImagem) {
        await removerArquivoServico(mensagem.imagem);
        mensagem.imagem = null;
        mensagem.imagem_removida_em = agora;
        await mensagem.save();
      }
      for (const foto of servico.fotos) await removerArquivoServico(foto);
      servico.fotos = [];
      servico.midias_removidas_em = agora;
      await servico.save();
      servicos += 1;
    } catch (e) {
      console.error(`[midias] falha no servico ${servico.id}:`, e.message);
    }
  }
  return { servicos };
}

function iniciarRotinaRetencaoMidias() {
  const rodar = () => processarRetencaoMidias()
    .then((r) => { if (r.servicos) console.log('[midias]', r); })
    .catch((e) => console.error('[midias] falhou:', e.message));

  rodar();
  const temporizador = setInterval(rodar, DIA_MS);
  temporizador.unref();
}

module.exports = { processarRetencaoMidias, iniciarRotinaRetencaoMidias, diasDeGuarda };
