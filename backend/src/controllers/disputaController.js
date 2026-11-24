/**
 * US23 - abertura de disputa e defesa (as duas partes do servico).
 * US19 - proposta complementar (prestador propoe; contratante aceita ou recusa).
 *
 * Quem decide a disputa e o administrador (adminController, US25).
 */
const { Disputa, PropostaComplementar } = require('../models');
const servicoCtl = require('./servicoController');
const disputas = require('../servicos/disputas');
const complementar = require('../servicos/complementar');
const { gerarCobranca, emAberto } = require('../servicos/cobrancas');
const { removerArquivoServico } = require('../servicos/armazenamento');
const { GatewayErro } = require('../servicos/gateway');
const { registrar } = require('../servicos/historico');
const { avisar } = require('../servicos/avisos');
const { dinheiro } = require('../servicos/repasse');

const {
  carregarDaParte, prepararImagens, gravarImagens, lerDinheiro
} = servicoCtl;

function lerTexto(valor) {
  return String(valor || '').replace(/[ \t]+/g, ' ').trim();
}

// Le e grava as fotos (ate 3, sem GPS). Devolve { nomes } ou { erro }.
async function receberEvidencias(arquivos) {
  if (!arquivos || !arquivos.length) return { nomes: [] };
  const { imagens, erro } = prepararImagens(arquivos);
  if (erro) return { erro };
  return { nomes: await gravarImagens(imagens) };
}

async function apagarArquivos(nomes) {
  await Promise.all((nomes || []).map((n) => removerArquivoServico(n).catch(() => {})));
}

// US23 - POST /servicos/:id/disputa (multipart: justificativa e "fotos").
async function abrirDisputa(req, res, next) {
  let nomes = [];
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'contratante') {
      return res.status(403).json({ erro: 'Quem abre a disputa é o cliente. O profissional responde com a defesa.' });
    }
    const motivo = disputas.motivoParaNaoAbrir(servico);
    if (motivo) return res.status(409).json({ erro: motivo });

    const justificativa = lerTexto(req.body.justificativa);
    if (justificativa.length < disputas.TEXTO_MINIMO) {
      return res.status(400).json({ erro: 'Conte o que aconteceu (pelo menos 10 caracteres).' });
    }
    if (justificativa.length > disputas.TEXTO_MAXIMO) {
      return res.status(400).json({ erro: `A justificativa pode ter no máximo ${disputas.TEXTO_MAXIMO} caracteres.` });
    }
    const recebidas = await receberEvidencias(req.files);
    if (recebidas.erro) return res.status(400).json({ erro: recebidas.erro });
    nomes = recebidas.nomes;

    const r = await disputas.abrir(servico, { usuarioId: req.usuario.id, justificativa, evidencias: nomes });
    if (r.erro) {
      await apagarArquivos(nomes);
      return res.status(r.status).json({ erro: r.erro });
    }
    return res.status(201).json({
      mensagem: 'Disputa aberta. O pagamento continua congelado até a decisão do Fechô.',
      disputa: { id: r.disputa.id, status: r.disputa.status }
    });
  } catch (e) {
    await apagarArquivos(nomes);
    return next(e);
  }
}

// US23 - POST /servicos/:id/disputa/defesa (multipart: defesa e "fotos").
async function defenderDisputa(req, res, next) {
  let nomes = [];
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'prestador') {
      return res.status(403).json({ erro: 'Quem envia a defesa é o profissional.' });
    }
    const disputa = await Disputa.findOne({ where: { servico_id: servico.id } });
    if (!disputa) return res.status(404).json({ erro: 'Este serviço não tem disputa.' });

    const defesa = lerTexto(req.body.defesa);
    if (defesa.length < disputas.TEXTO_MINIMO) {
      return res.status(400).json({ erro: 'Conte a sua versão (pelo menos 10 caracteres).' });
    }
    if (defesa.length > disputas.TEXTO_MAXIMO) {
      return res.status(400).json({ erro: `A defesa pode ter no máximo ${disputas.TEXTO_MAXIMO} caracteres.` });
    }
    const recebidas = await receberEvidencias(req.files);
    if (recebidas.erro) return res.status(400).json({ erro: recebidas.erro });
    nomes = recebidas.nomes;

    const r = await disputas.defender(disputa, servico, { usuarioId: req.usuario.id, defesa, evidencias: nomes });
    if (r.erro) {
      await apagarArquivos(nomes);
      return res.status(r.status).json({ erro: r.erro });
    }
    return res.json({ mensagem: 'Defesa enviada. Agora o Fechô analisa e decide.' });
  } catch (e) {
    await apagarArquivos(nomes);
    return next(e);
  }
}

// US19 - POST /servicos/:id/complementar (multipart: valor, justificativa, foto).
async function proporComplementar(req, res, next) {
  let nomes = [];
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'prestador') {
      return res.status(403).json({ erro: 'Só o profissional propõe valor complementar.' });
    }
    if (!complementar.noLocal(servico)) {
      return res.status(409).json({
        erro: 'A proposta complementar é feita no local: com o serviço em andamento, ou depois de avisar que chegou.'
      });
    }
    if (await complementar.daServico(servico.id)) {
      return res.status(409).json({ erro: 'Este serviço já teve uma proposta complementar. Só é permitida uma por serviço.' });
    }

    const valor = lerDinheiro(req.body.valor);
    if (valor === undefined || Number.isNaN(valor) || valor <= 0) {
      return res.status(400).json({ erro: 'Informe um valor complementar maior que zero.' });
    }
    const maximo = complementar.valorMaximo(servico);
    if (valor > maximo) {
      return res.status(400).json({
        erro: `O valor complementar pode ser no máximo ${complementar.LIMITE_PERCENTUAL}% do valor original do serviço (${dinheiro(maximo)}).`
      });
    }
    const justificativa = lerTexto(req.body.justificativa);
    if (justificativa.length < complementar.JUSTIFICATIVA_MINIMA) {
      return res.status(400).json({ erro: 'Explique o trabalho a mais (pelo menos 10 caracteres).' });
    }
    if (justificativa.length > complementar.JUSTIFICATIVA_MAXIMA) {
      return res.status(400).json({ erro: `A justificativa pode ter no máximo ${complementar.JUSTIFICATIVA_MAXIMA} caracteres.` });
    }
    if (!req.file) {
      return res.status(400).json({ erro: 'A foto é obrigatória: mostre ao cliente o que precisa ser feito a mais.' });
    }
    const recebidas = await receberEvidencias([req.file]);
    if (recebidas.erro) return res.status(400).json({ erro: recebidas.erro });
    nomes = recebidas.nomes;

    let proposta;
    try {
      proposta = await PropostaComplementar.create({ servico_id: servico.id, valor, justificativa, foto: nomes[0] });
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError') {
        await apagarArquivos(nomes);
        return res.status(409).json({ erro: 'Este serviço já teve uma proposta complementar. Só é permitida uma por serviço.' });
      }
      throw e;
    }
    await registrar(servico.id, {
      usuarioId: req.usuario.id, acao: 'complementar_proposto', detalhe: `${dinheiro(valor)}: ${justificativa}`
    });
    await avisar({
      usuarioId: servico.id_contratante,
      servicoId: servico.id,
      tipo: 'complementar_proposto',
      titulo: 'Proposta de valor complementar',
      texto: `O profissional pediu ${dinheiro(valor)} a mais para: ${justificativa}. Veja a foto e aceite ou recuse no pedido.`
    });
    return res.status(201).json({
      mensagem: 'Proposta enviada. O cliente decide se aceita; enquanto isso vale o orçamento original.',
      complementar: { id: proposta.id, status: proposta.status, valor }
    });
  } catch (e) {
    await apagarArquivos(nomes);
    return next(e);
  }
}

// US19 - POST /servicos/:id/complementar/aceitar: gera o Pix adicional.
async function aceitarComplementar(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'contratante') {
      return res.status(403).json({ erro: 'Quem aceita a proposta complementar é o cliente.' });
    }
    const proposta = await complementar.daServico(servico.id);
    if (!proposta) return res.status(404).json({ erro: 'Este serviço não tem proposta complementar.' });
    if (!complementar.STATUS_PERMITIDOS.includes(servico.status)) {
      return res.status(409).json({ erro: 'O serviço já seguiu adiante. Esta proposta não vale mais.' });
    }
    if (!['pendente', 'aceita'].includes(proposta.status)) {
      return res.status(409).json({ erro: 'Esta proposta já foi respondida.' });
    }

    // Clique repetido: devolve o mesmo Pix.
    const atual = await complementar.pagamentoComplementar(servico.id);
    let pagamento = atual;
    if (!emAberto(atual)) {
      try {
        pagamento = await gerarCobranca(servico, req.usuario, new Date(), { complementar: proposta });
      } catch (e) {
        if (e instanceof GatewayErro) {
          console.error('[pagamento] falha ao gerar o Pix complementar:', e.detalhe || e.message);
          return res.status(502).json({ erro: e.message });
        }
        throw e;
      }
    }
    if (proposta.status === 'pendente') {
      proposta.status = 'aceita';
      proposta.respondida_em = new Date();
      await proposta.save();
      await registrar(servico.id, { usuarioId: req.usuario.id, acao: 'complementar_aceito', detalhe: `Pix adicional de ${dinheiro(proposta.valor)} gerado` });
    }
    return res.status(201).json({
      mensagem: 'Pague o Pix adicional. O valor fica congelado junto com o original até você confirmar o serviço.',
      complementar: complementar.montarProposta(proposta, pagamento, 'contratante', servicoCtl.montarPagamento)
    });
  } catch (e) {
    return next(e);
  }
}

// US19 - POST /servicos/:id/complementar/recusar: vale o orcamento original.
async function recusarComplementar(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'contratante') {
      return res.status(403).json({ erro: 'Quem recusa a proposta complementar é o cliente.' });
    }
    const proposta = await complementar.daServico(servico.id);
    if (!proposta) return res.status(404).json({ erro: 'Este serviço não tem proposta complementar.' });
    if (!['pendente', 'aceita'].includes(proposta.status)) {
      return res.status(409).json({ erro: 'Esta proposta já foi respondida.' });
    }
    // Pix adicional gerado e ainda nao pago deixa de valer.
    const agora = new Date();
    const pagamento = await complementar.pagamentoComplementar(servico.id, agora);
    if (emAberto(pagamento, agora)) {
      const { encerrarSeVencida } = require('../servicos/cobrancas');
      pagamento.expira_em = agora;
      await encerrarSeVencida(pagamento, agora);
    }
    proposta.status = 'recusada';
    proposta.respondida_em = agora;
    await proposta.save();
    await registrar(servico.id, { usuarioId: req.usuario.id, acao: 'complementar_recusado', detalhe: 'Vale o orçamento original' });
    await avisar({
      usuarioId: servico.prestador.usuario_id,
      servicoId: servico.id,
      tipo: 'complementar_recusado',
      titulo: 'Proposta complementar recusada',
      texto: 'O cliente recusou o valor complementar. Vale o orçamento original, e o pagamento dele continua congelado.'
    });
    return res.json({ mensagem: 'Proposta recusada. Vale o orçamento original, e o pagamento continua congelado.' });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  abrirDisputa, defenderDisputa, proporComplementar, aceitarComplementar, recusarComplementar
};
