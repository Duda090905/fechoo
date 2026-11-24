/**
 * Dados de demonstracao do Sprint 5 (chamado pelo demo.js).
 *
 *   US25 - conta de administrador (admin.demo@fecho.app)
 *   US23 - disputa ABERTA com defesa (Bruno x Joao) para o administrador
 *          decidir ao vivo; servico concluido ha 2 horas (Bruno x Rita) para
 *          o Bruno ABRIR uma disputa ao vivo; disputa ja decidida (dividida)
 *          para o relatorio e o registro
 *   US19 - servico em execucao (Bruno x Rita) com proposta complementar
 *          esperando o Bruno aceitar e pagar o Pix adicional ao vivo; um
 *          servico pago com valor complementar no historico da Rita
 *   US22 - o extrato da Rita ganha esses repasses (com complementar e com a
 *          parte da disputa dividida) e mostra o que esta congelado
 *
 * As fotos das evidencias e da proposta sao imagens geradas aqui (PNG), para
 * a tela mostrar fotos de verdade sem depender de arquivos do repositorio.
 */
const zlib = require('zlib');
const {
  Usuario, Servico, Pagamento, Mensagem, Disputa, PropostaComplementar, AcaoAdministrador, HistoricoServico, Notificacao
} = require('../models');
const { salvarArquivoServico, removerArquivoServico } = require('../servicos/armazenamento');
const { montarCopiaECola } = require('../utils/pix');

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const ADMIN = { nome: 'Equipe Fechô (demo)', email: 'admin.demo@fecho.app' };

// PNG simples (listras em duas cores), sem biblioteca.
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pedaco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}
function gerarPng(cor1, cor2, largura = 320, altura = 220) {
  const linhas = [];
  for (let y = 0; y < altura; y += 1) {
    const linha = Buffer.alloc(1 + largura * 3);
    for (let x = 0; x < largura; x += 1) {
      const cor = Math.floor((x + y) / 24) % 2 ? cor1 : cor2;
      linha[1 + x * 3] = cor[0];
      linha[2 + x * 3] = cor[1];
      linha[3 + x * 3] = cor[2];
    }
    linhas.push(linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pedaco('IHDR', ihdr),
    pedaco('IDAT', zlib.deflateSync(Buffer.concat(linhas))),
    pedaco('IEND', Buffer.alloc(0))
  ]);
}
const foto = (cor1, cor2) => salvarArquivoServico(gerarPng(cor1, cor2), 'png');

async function apagarDemoSprint5(idsServicos) {
  const admin = await Usuario.findOne({ where: { email: ADMIN.email } });
  if (admin) await AcaoAdministrador.destroy({ where: { administrador_id: admin.id } });
  if (idsServicos.length) {
    // As fotos geradas pelo demo saem do disco junto.
    const [disputas, propostas] = await Promise.all([
      Disputa.findAll({ where: { servico_id: idsServicos } }),
      PropostaComplementar.findAll({ where: { servico_id: idsServicos } })
    ]);
    const arquivos = [
      ...disputas.flatMap((d) => [...d.evidencias, ...d.defesa_evidencias]),
      ...propostas.map((p) => p.foto)
    ];
    await Promise.all(arquivos.map((n) => removerArquivoServico(n).catch(() => {})));
    await Disputa.destroy({ where: { servico_id: idsServicos } });
    await PropostaComplementar.destroy({ where: { servico_id: idsServicos } });
  }
  if (admin) await admin.destroy();
}

async function criarDemoSprint5({ u, rita, joao, cambui, taquaral, barao, eletricista, encanador, pintor, senhaHash }) {
  const admin = await Usuario.create({
    ...ADMIN, tipo_perfil: 'administrador', senha_hash: senhaHash, aceite_termos: true, aceite_termos_em: new Date()
  });

  const servico = (dados) => Servico.create({ fotos: [], ...dados });
  const pix = (s, valor, sufixo = '') => {
    const identificador = `fecho-s${s.id}${sufixo}-demo`;
    return {
      identificador,
      gateway: 'simulado',
      cobranca_id: `sim_demo_${s.id}${sufixo}`,
      pix_copia_cola: montarCopiaECola({ chave: 'pix-simulado@fecho.app', valor, nome: 'Fecho', cidade: 'Campinas', txid: identificador })
    };
  };
  const historico = (s, linhas) => HistoricoServico.bulkCreate(linhas.map(([acao, detalhe, quem, em]) => ({
    servico_id: s.id, usuario_id: quem ? quem.id : null, acao, detalhe, registrado_em: em
  })));

  // US23 / US25 ao vivo: disputa aberta ha 1 dia, com defesa. O admin decide.
  const quandoD1 = new Date(Date.now() - 2 * DIA);
  const d1 = await servico({
    id_contratante: u.bruno.id, id_prestador: joao.id, bairro_id: barao.id, categoria_id: pintor.id,
    descricao: 'Pintar o quarto do bebê (paredes e teto), cor azul-claro.',
    data_hora_solicitada: quandoD1, data_hora_proposta: quandoD1, valor: 400, prazo_horas: 6, taxa_deslocamento: 0,
    status: 'em_disputa', orcamento_enviado_em: new Date(quandoD1.getTime() - 2 * DIA), endereco: 'Av. Albino J. B. de Oliveira, 900',
    aceito_em: new Date(quandoD1.getTime() - DIA), chegou_em: quandoD1, iniciado_em: quandoD1,
    concluido_em: new Date(quandoD1.getTime() + 6 * HORA), encerrado_em: new Date(Date.now() - DIA)
  });
  await Pagamento.create({
    servico_id: d1.id, valor: 400, status: 'retido', ...pix(d1, 400),
    expira_em: new Date(quandoD1.getTime() - DIA), retido_em: new Date(quandoD1.getTime() - DIA)
  });
  await Mensagem.bulkCreate([
    { servico_id: d1.id, autor_id: u.bruno.id, texto: 'Joao, o teto ficou manchado e a parede da janela está com marcas de rolo.' },
    { servico_id: d1.id, autor_id: joao.usuario_id, texto: 'Bruno, a mancha é infiltração antiga, que aparece com a tinta clara. Avisei no dia.' },
    { servico_id: d1.id, autor_id: u.bruno.id, texto: 'Você não avisou. Vou abrir uma disputa.' }
  ]);
  await Disputa.create({
    servico_id: d1.id, aberta_por_id: u.bruno.id, status: 'aberta', status_servico_anterior: 'concluido',
    justificativa: 'O teto ficou manchado e a parede da janela tem marcas de rolo visíveis. Paguei por um acabamento que não foi entregue.',
    evidencias: [await foto([214, 224, 240], [180, 196, 222]), await foto([226, 230, 236], [196, 160, 120])],
    defesa: 'A mancha no teto é infiltração antiga, que aparece com tinta clara; avisei o cliente e sugeri tratar antes. As marcas na parede são da textura original. Fiz as duas demãos combinadas.',
    defesa_evidencias: [await foto([200, 210, 225], [150, 150, 150])],
    defesa_em: new Date(Date.now() - 20 * HORA),
    aberta_em: new Date(Date.now() - DIA)
  });
  const contaJoao = { id: joao.usuario_id };
  await historico(d1, [
    ['conclusao', null, contaJoao, new Date(quandoD1.getTime() + 6 * HORA)],
    ['disputa_aberta', 'Motivo: o teto ficou manchado e a parede tem marcas de rolo', u.bruno, new Date(Date.now() - DIA)],
    ['disputa_defesa', 'Defesa: a mancha é infiltração antiga; avisei o cliente', contaJoao, new Date(Date.now() - 20 * HORA)]
  ]);

  // US23 ao vivo: servico concluido ha 2 horas; o Bruno abre a disputa.
  const quandoD2 = new Date(Date.now() - 4 * HORA);
  const d2 = await servico({
    id_contratante: u.bruno.id, id_prestador: rita.id, bairro_id: taquaral.id, categoria_id: eletricista.id,
    descricao: 'Trocar a resistência do chuveiro e ver por que o disjuntor desarma.',
    data_hora_solicitada: quandoD2, data_hora_proposta: quandoD2, valor: 160, prazo_horas: 1, taxa_deslocamento: 0,
    status: 'concluido', orcamento_enviado_em: new Date(quandoD2.getTime() - 2 * DIA), endereco: 'Rua Hermantino Coelho, 77',
    aceito_em: new Date(quandoD2.getTime() - DIA), chegou_em: quandoD2, iniciado_em: quandoD2,
    concluido_em: new Date(Date.now() - 2 * HORA), encerrado_em: new Date(Date.now() - 2 * HORA)
  });
  await Pagamento.create({
    servico_id: d2.id, valor: 160, status: 'retido', ...pix(d2, 160),
    expira_em: new Date(quandoD2.getTime() - DIA), retido_em: new Date(quandoD2.getTime() - DIA)
  });
  await Mensagem.create({ servico_id: d2.id, autor_id: u.bruno.id, texto: 'Rita, o disjuntor desarmou de novo depois que você saiu.' });

  // US19 ao vivo: servico em execucao com proposta complementar pendente.
  const quandoC = new Date(Date.now() - 40 * 60 * 1000);
  const c1 = await servico({
    id_contratante: u.bruno.id, id_prestador: rita.id, bairro_id: cambui.id, categoria_id: encanador.id,
    descricao: 'Trocar o registro do chuveiro que está pingando.',
    data_hora_solicitada: quandoC, data_hora_proposta: quandoC, valor: 180, prazo_horas: 3, taxa_deslocamento: 0,
    status: 'em_execucao', orcamento_enviado_em: new Date(Date.now() - 2 * DIA), endereco: 'Rua Coronel Quirino, 1500, apto 21',
    aceito_em: new Date(Date.now() - DIA), chegou_em: quandoC, iniciado_em: quandoC
  });
  await Pagamento.create({
    servico_id: c1.id, valor: 180, status: 'retido', ...pix(c1, 180),
    expira_em: new Date(Date.now() - DIA), retido_em: new Date(Date.now() - DIA)
  });
  await PropostaComplementar.create({
    servico_id: c1.id, valor: 90, status: 'pendente',
    justificativa: 'Ao abrir a parede, o cano que chega ao registro está corroído. Precisa trocar uns 40 cm de cano antes de instalar o registro novo.',
    foto: await foto([150, 110, 80], [90, 70, 60]), enviada_em: new Date(Date.now() - 10 * 60 * 1000)
  });
  await Notificacao.create({
    usuario_id: u.bruno.id, servico_id: c1.id, tipo: 'complementar_proposto', titulo: 'Proposta de valor complementar',
    texto: 'A Rita pediu R$ 90,00 a mais para trocar o cano corroído. Veja a foto e aceite ou recuse no pedido.'
  });

  // Historico: servico pago com valor complementar (aparece no extrato da Rita).
  const quandoP = new Date(Date.now() - 5 * DIA);
  const p1 = await servico({
    id_contratante: u.ana.id, id_prestador: rita.id, bairro_id: cambui.id, categoria_id: eletricista.id,
    descricao: 'Instalar tomada para o ar-condicionado.',
    data_hora_solicitada: quandoP, data_hora_proposta: quandoP, valor: 200, prazo_horas: 2, taxa_deslocamento: 0,
    status: 'pago', aceito_em: quandoP, chegou_em: quandoP, iniciado_em: quandoP, concluido_em: quandoP,
    confirmado_em: new Date(quandoP.getTime() + HORA), pago_em: new Date(quandoP.getTime() + HORA), confirmacao_automatica: false,
    encerrado_em: quandoP
  });
  const liberadoP = new Date(quandoP.getTime() + HORA);
  await Pagamento.create({
    servico_id: p1.id, valor: 200, status: 'liberado', ...pix(p1, 200), expira_em: quandoP, retido_em: quandoP,
    taxa_percentual: 6, taxa_valor: 12, valor_repasse: 188, repasse_id: `sim_tr_demo_${p1.id}`, liberado_em: liberadoP
  });
  await Pagamento.create({
    servico_id: p1.id, tipo: 'complementar', valor: 60, status: 'liberado', ...pix(p1, 60, 'c'), expira_em: quandoP, retido_em: quandoP,
    taxa_percentual: 6, taxa_valor: 3.6, valor_repasse: 56.4, repasse_id: `sim_tr_demo_${p1.id}c`, liberado_em: liberadoP
  });
  await PropostaComplementar.create({
    servico_id: p1.id, valor: 60, status: 'paga', respondida_em: quandoP, paga_em: quandoP,
    justificativa: 'O circuito precisava de um disjuntor próprio de 20 A para o ar-condicionado.',
    foto: await foto([230, 210, 150], [120, 120, 130]), enviada_em: quandoP
  });

  // US25 - disputa ja decidida (dividida 50/50) ha 10 dias, com o registro.
  const quandoR = new Date(Date.now() - 12 * DIA);
  const r1 = await servico({
    id_contratante: u.ana.id, id_prestador: rita.id, bairro_id: cambui.id, categoria_id: encanador.id,
    descricao: 'Desentupir o ralo do box e trocar o sifão.',
    data_hora_solicitada: quandoR, data_hora_proposta: quandoR, valor: 120, prazo_horas: 1, taxa_deslocamento: 0,
    status: 'resolvido', aceito_em: quandoR, chegou_em: quandoR, iniciado_em: quandoR, concluido_em: quandoR, encerrado_em: quandoR
  });
  const decididoEm = new Date(Date.now() - 10 * DIA);
  await Pagamento.create({
    servico_id: r1.id, valor: 120, status: 'estornado', ...pix(r1, 120), expira_em: quandoR, retido_em: quandoR,
    taxa_percentual: 0, taxa_valor: 0, valor_estorno: 60, estorno_id: `sim_est_demo_${r1.id}`, estornado_em: decididoEm,
    valor_repasse: 60, repasse_id: `sim_tr_demo_${r1.id}`, liberado_em: decididoEm
  });
  const dr = await Disputa.create({
    servico_id: r1.id, aberta_por_id: u.ana.id, status: 'decidida', status_servico_anterior: 'concluido',
    justificativa: 'O ralo voltou a entupir no dia seguinte.',
    defesa: 'Desentupi e troquei o sifão; o entupimento voltou por causa da tubulação do prédio, fora do combinado.',
    defesa_em: new Date(quandoR.getTime() + DIA),
    decisao: 'dividir', percentual_contratante: 50, valor_contratante: 60, valor_prestador: 60,
    justificativa_decisao: 'O sifão foi trocado (parte do serviço entregue), mas o ralo voltou a entupir em menos de 24 horas.',
    decidido_por_id: admin.id, decidido_em: decididoEm, aberta_em: new Date(quandoR.getTime() + 3 * HORA)
  });
  await AcaoAdministrador.create({
    administrador_id: admin.id, acao: 'decisao_disputa', alvo_tipo: 'disputa', alvo_id: dr.id,
    justificativa: dr.justificativa_decisao,
    detalhe: `Serviço ${r1.id}: Dividido: 50% ao cliente (R$ 60,00) e 50% ao profissional (R$ 60,00)`,
    registrado_em: decididoEm
  });

  return { admin, d1, d2, c1 };
}

module.exports = { criarDemoSprint5, apagarDemoSprint5, ADMIN };
