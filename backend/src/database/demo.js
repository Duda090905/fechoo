/**
 * Dados de demonstracao dos Sprints 2 e 3 (npm run db:demo).
 *
 * Sprint 3: o aceite (US11), o Pix (US17), o webhook (US18) e o selo (US06)
 * agora existem de verdade. Para a apresentacao ja comecar com exemplos
 * prontos, alguns servicos sao gravados direto no banco no estado em que o
 * fluxo real os deixaria (Aceito, com pagamento Retido e endereco). Os
 * fluxos ao vivo continuam disponiveis (orcamento para aceitar, chave Pix
 * do Eli para cadastrar).
 *
 * Continuam simulados, porque as historias ainda nao existem:
 *   - NOTA MEDIA no cartao da busca (US24);
 *   - CONCLUSAO do servico, que fecha o chat (US20).
 *
 * Rodar depois do npm run db:seed. Para apagar e criar de novo (as datas
 * sao sempre a partir de hoje): npm run db:demo -- --recriar
 */
require('dotenv').config();
const { Op } = require('sequelize');
const {
  sequelize, Usuario, Prestador, Categoria, Bairro, Servico, Mensagem,
  PrestadorCategoria, PrestadorBairro, Pausa, TokenSenha, SolicitacaoExclusao,
  Pagamento, EventoWebhook, AcessoEndereco, Notificacao
} = require('../models');
const { garantirColunas } = require('./colunas');
const { montarCopiaECola } = require('../utils/pix');
const { gerarHash } = require('../utils/senha');
const { cpfValido } = require('../utils/cpf');

const SENHA = 'demo1234';
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

const PESSOAS = {
  ana: { nome: 'Ana Demo', email: 'ana.demo@fecho.app', tipo_perfil: 'contratante', sexo: 'feminino' },
  bruno: { nome: 'Bruno Demo', email: 'bruno.demo@fecho.app', tipo_perfil: 'contratante', sexo: 'masculino' },
  rita: { nome: 'Rita Demo', email: 'rita.demo@fecho.app', tipo_perfil: 'prestador', sexo: 'feminino' },
  eli: { nome: 'Eli Demo', email: 'eli.demo@fecho.app', tipo_perfil: 'prestador', sexo: 'masculino' },
  joao: { nome: 'Joao Demo', email: 'joao.demo@fecho.app', tipo_perfil: 'prestador', sexo: 'masculino' }
};

// CPFs validos de demonstracao, gerados pelos digitos verificadores.
function gerarCpf(base) {
  const digito = (numeros) => {
    let soma = 0;
    for (let i = 0; i < numeros.length; i += 1) soma += Number(numeros[i]) * (numeros.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const nove = String(base).padStart(9, '0');
  const dez = nove + digito(nove);
  return dez + digito(dez);
}

// Hora cheia, `dias` a partir de hoje.
function emDias(dias, hora) {
  const data = new Date(Date.now() + dias * DIA);
  data.setHours(hora, 0, 0, 0);
  return data;
}

async function porNome(Modelo, nome) {
  const registro = await Modelo.findOne({ where: { nome } });
  if (!registro) throw new Error(`"${nome}" nao encontrado. Rode antes: npm run db:seed`);
  return registro;
}

async function apagarDemo() {
  const usuarios = await Usuario.findAll({ where: { email: Object.values(PESSOAS).map((p) => p.email) } });
  const idsUsuarios = usuarios.map((u) => u.id);
  if (!idsUsuarios.length) return;
  const prestadores = await Prestador.findAll({ where: { usuario_id: idsUsuarios } });
  const idsPrestadores = prestadores.map((p) => p.id);
  const servicos = await Servico.findAll({
    where: { [Op.or]: [{ id_contratante: idsUsuarios }, { id_prestador: idsPrestadores }] }
  });
  const idsServicos = servicos.map((s) => s.id);

  const pagamentos = await Pagamento.findAll({ where: { servico_id: idsServicos } });
  await EventoWebhook.destroy({ where: { cobranca_id: pagamentos.map((p) => p.cobranca_id).filter(Boolean) } });
  await Pagamento.destroy({ where: { servico_id: idsServicos } });
  await Notificacao.destroy({ where: { servico_id: idsServicos } });
  await AcessoEndereco.destroy({ where: { servico_id: idsServicos } });
  await Mensagem.destroy({ where: { servico_id: idsServicos } });
  await Servico.destroy({ where: { id: idsServicos } });
  await PrestadorCategoria.destroy({ where: { prestador_id: idsPrestadores } });
  await PrestadorBairro.destroy({ where: { prestador_id: idsPrestadores } });
  await Pausa.destroy({ where: { prestador_id: idsPrestadores } });
  await Prestador.destroy({ where: { id: idsPrestadores } });
  await TokenSenha.destroy({ where: { usuario_id: idsUsuarios } });
  await SolicitacaoExclusao.destroy({ where: { usuario_id: idsUsuarios } });
  await Usuario.destroy({ where: { id: idsUsuarios } });
}

async function rodar() {
  await sequelize.sync();
  await garantirColunas(sequelize);

  const recriar = process.argv.includes('--recriar');
  const jaExiste = await Usuario.findOne({ where: { email: PESSOAS.ana.email } });
  if (jaExiste && !recriar) {
    console.log('Os dados de demonstracao ja existem. Para criar de novo: npm run db:demo -- --recriar');
    await sequelize.close();
    return;
  }
  if (recriar) await apagarDemo();

  const eletricista = await porNome(Categoria, 'Eletricista');
  const encanador = await porNome(Categoria, 'Encanador');
  const pintor = await porNome(Categoria, 'Pintor');
  const cambui = await porNome(Bairro, 'Cambui');
  const centro = await porNome(Bairro, 'Centro');
  const taquaral = await porNome(Bairro, 'Taquaral');
  const barao = await porNome(Bairro, 'Barao Geraldo');

  // Contas ----------------------------------------------------------------
  const senhaHash = await gerarHash(SENHA);
  const u = {};
  let base = 900000101;
  for (const [chave, dados] of Object.entries(PESSOAS)) {
    let cpf = gerarCpf(base);
    while (!cpfValido(cpf) || await Usuario.findOne({ where: { cpf } })) { base += 1; cpf = gerarCpf(base); }
    base += 1;
    u[chave] = await Usuario.create({
      ...dados, cpf, telefone: '19990000000', senha_hash: senhaHash,
      aceite_termos: true, aceite_termos_em: new Date()
    });
  }

  // Perfis ----------------------------------------------------------------
  async function perfil(usuario, descricao, categorias, bairros, extra = {}) {
    const prestador = await Prestador.create({ usuario_id: usuario.id, descricao, ...extra });
    await prestador.setCategorias(categorias);
    await prestador.setBairros(bairros);
    return prestador;
  }
  const rita = await perfil(u.rita, 'Eletricista e encanadora ha 12 anos. Chuveiro, tomadas, disjuntores e vazamentos.',
    [eletricista, encanador], [cambui, centro, taquaral],
    {
      // US06 pronta: chave Pix no proprio CPF, conferida (o mesmo que o fluxo faz).
      chave_pix_tipo: 'cpf', chave_pix: u.rita.cpf, verificado: true, verificado_em: new Date(Date.now() - 7 * DIA),
      nota_media: 4.8 // SIMULA US24 (nota media)
    });
  const eli = await perfil(u.eli, 'Instalacoes eletricas residenciais, iluminacao e quadro de luz.',
    [eletricista], [cambui],
    { nota_media: 4.5 }); // SIMULA US24 (nota media)
  await perfil(u.joao, 'Pintura de apartamentos e pequenos reparos.', [pintor], [barao, cambui]);

  // Servicos --------------------------------------------------------------
  const servico = (dados) => Servico.create({ fotos: [], ...dados });
  // Estado em que o fluxo real (US17 + US18) deixa um servico aceito:
  // pagamento Retido com o valor exato do orcamento.
  const pagamentoRetido = (s) => {
    const valor = Number(s.valor) + Number(s.taxa_deslocamento || 0);
    const identificador = `fecho-s${s.id}-demo`;
    return Pagamento.create({
      servico_id: s.id, valor, status: 'retido', identificador, gateway: 'simulado',
      cobranca_id: `sim_demo_${s.id}`,
      pix_copia_cola: montarCopiaECola({ chave: 'pix-simulado@fecho.app', valor, nome: 'Fecho', cidade: 'Campinas', txid: identificador }),
      expira_em: new Date(Date.now() - 23 * HORA), retido_em: new Date(Date.now() - DIA + 10 * 60 * 1000)
    });
  };
  const conversa = (s, linhas) => Mensagem.bulkCreate(linhas.map(([autor, texto]) => ({
    servico_id: s.id, autor_id: autor.id, texto
  })));

  // 1. Fluxo real da US10: esperando o orcamento do Eli.
  const s1 = await servico({
    id_contratante: u.ana.id, id_prestador: eli.id, bairro_id: cambui.id,
    descricao: 'Trocar o chuveiro do banheiro de cima e ver uma tomada da cozinha que parou.',
    data_hora_solicitada: emDias(3, 14), status: 'aguardando_orcamento'
  });
  await conversa(s1, [[u.ana, 'Oi, Eli! O chuveiro e de 220 V.'], [u.eli, 'Oi, Ana. Ja te mando o orcamento.']]);

  // 2. Fluxo real da US10: orcamento da Rita esperando a Ana (pode recusar ao vivo).
  await servico({
    id_contratante: u.ana.id, id_prestador: rita.id, bairro_id: taquaral.id,
    descricao: 'Instalar tres luminarias no quarto.',
    data_hora_solicitada: emDias(4, 10), data_hora_proposta: emDias(4, 10),
    valor: 210, prazo_horas: 3, taxa_deslocamento: 0,
    status: 'orcamento_enviado', orcamento_enviado_em: new Date()
  });

  // 2b. Fluxo real do Sprint 3: orcamento do Eli para a Ana ACEITAR ao vivo.
  //     Fora da area dele (Centro): total = 180 + 20 de deslocamento = 200.
  await servico({
    id_contratante: u.ana.id, id_prestador: eli.id, bairro_id: centro.id,
    descricao: 'Instalar duas tomadas novas no escritorio.',
    data_hora_solicitada: emDias(6, 15), data_hora_proposta: emDias(6, 15),
    valor: 180, prazo_horas: 2, taxa_deslocamento: 20,
    status: 'orcamento_enviado', orcamento_enviado_em: new Date()
  });

  // 3. Aceito (estado que US11 + US17 + US18 deixam): compromisso nas proximas
  //    24 horas, pagamento Retido e endereco liberado. Aparece na agenda dos
  //    dois lados e dispara o lembrete da vespera ao subir a API.
  const amanha = new Date(Math.ceil((Date.now() + 20 * HORA) / HORA) * HORA);
  const s3 = await servico({
    id_contratante: u.ana.id, id_prestador: rita.id, bairro_id: centro.id,
    descricao: 'Vazamento embaixo da pia da cozinha.',
    data_hora_solicitada: amanha, data_hora_proposta: amanha,
    valor: 140, prazo_horas: 1, taxa_deslocamento: 0,
    status: 'aceito', orcamento_enviado_em: new Date(Date.now() - DIA),
    endereco: 'Rua Barao de Jaguara, 1200, apto 54', aceito_em: new Date(Date.now() - DIA + 10 * 60 * 1000)
  });
  await pagamentoRetido(s3);
  await conversa(s3, [[u.rita, 'Combinado, Ana. Levo a peca nova.'], [u.ana, 'Perfeito, obrigada!']]);

  // 4. Aceito: compromisso do Bruno com o Eli, fora da area dele.
  const s4 = await servico({
    id_contratante: u.bruno.id, id_prestador: eli.id, bairro_id: centro.id,
    descricao: 'Instalar um ventilador de teto na sala.',
    data_hora_solicitada: emDias(5, 9), data_hora_proposta: emDias(5, 9),
    valor: 150, prazo_horas: 2, taxa_deslocamento: 25,
    status: 'aceito', orcamento_enviado_em: new Date(Date.now() - DIA),
    endereco: 'Rua Conceicao, 233, sala 4', aceito_em: new Date(Date.now() - DIA + 10 * 60 * 1000)
  });
  await pagamentoRetido(s4);

  // 5. SIMULA US20 (conclusao): chat fechado, mensagens guardadas.
  const s5 = await servico({
    id_contratante: u.ana.id, id_prestador: eli.id, bairro_id: cambui.id,
    descricao: 'Trocar o disjuntor do quadro de luz.',
    data_hora_solicitada: new Date(Date.now() - 3 * DIA), data_hora_proposta: new Date(Date.now() - 3 * DIA),
    valor: 120, prazo_horas: 1, taxa_deslocamento: 0,
    status: 'concluido', orcamento_enviado_em: new Date(Date.now() - 5 * DIA)
  });
  await conversa(s5, [[u.eli, 'Servico feito, Ana. Qualquer coisa me chama.'], [u.ana, 'Ficou otimo!']]);

  // 6. SIMULA US20 (pagos e confirmados): historico que conta como
  //    "servicos concluidos" no cartao da busca (US09).
  const antigos = [
    [rita, 'pago', 30], [rita, 'pago', 20], [rita, 'confirmado', 10], [eli, 'pago', 15]
  ];
  for (const [prestador, status, diasAtras] of antigos) {
    await servico({
      id_contratante: u.bruno.id, id_prestador: prestador.id, bairro_id: cambui.id,
      descricao: 'Servico antigo (demonstracao).',
      data_hora_solicitada: new Date(Date.now() - diasAtras * DIA),
      data_hora_proposta: new Date(Date.now() - diasAtras * DIA),
      valor: 100, prazo_horas: 1, taxa_deslocamento: 0, status
    });
  }

  const cpfFormatado = (c) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  console.log(`
Dados de demonstracao criados. Senha de todas as contas: ${SENHA}

  ana.demo@fecho.app    contratante  orcamento do Eli para ACEITAR e pagar (Pix, US11/US17/US18),
                                     orcamento da Rita para recusar, pedido esperando orcamento,
                                     compromisso amanha ja pago (endereco liberado), servico concluido
  bruno.demo@fecho.app  contratante  compromisso pago, com taxa de deslocamento (agenda)
  rita.demo@fecho.app   prestadora   selo (chave Pix conferida) e nota 4,8; endereco liberado no compromisso
  eli.demo@fecho.app    prestador    SEM selo: cadastrar a chave Pix ao vivo (US06)
                                       CPF do Eli (chave certa): ${cpfFormatado(u.eli.cpf)}
                                       CPF da Ana (chave errada, para ver a recusa): ${cpfFormatado(u.ana.cpf)}
  joao.demo@fecho.app   prestador    sem nota e sem selo, para comparar na busca

Para pagar o Pix depois de aceitar: npm run pix:pagar -- <id do servico>
Ainda simulado direto no banco: nota media (US24) e conclusao (US20).
Ao subir a API, o lembrete da vespera do compromisso de amanha aparece no console (US13).
`);
  await sequelize.close();
}

rodar().catch(async (e) => {
  console.error('Falha ao criar os dados de demonstracao:', e.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
