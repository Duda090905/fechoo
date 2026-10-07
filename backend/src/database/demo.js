/**
 * Dados de demonstracao do Sprint 2 (npm run db:demo).
 *
 * Algumas partes do Sprint 2 dependem de historias que ainda nao existem:
 *   - a agenda (US13) so mostra o compromisso depois do ACEITE, que e a US11;
 *   - o cartao da busca (US09) mostra NOTA MEDIA e SELO, que vem da US24 e da US06;
 *   - o chat (US12) fecha depois da CONCLUSAO, que e a US20.
 *
 * Este script NAO implementa essas historias. Ele grava direto no banco o
 * resultado que elas produziriam (um servico "aceito", uma nota, um selo),
 * para que a apresentacao mostre o Sprint 2 funcionando de ponta a ponta.
 * E o mesmo que os testes automaticos fazem. Cada dado simulado esta marcado
 * abaixo com a historia que o produziria.
 *
 * Rodar depois do npm run db:seed. Para apagar e criar de novo (as datas
 * sao sempre a partir de hoje): npm run db:demo -- --recriar
 */
require('dotenv').config();
const { Op } = require('sequelize');
const {
  sequelize, Usuario, Prestador, Categoria, Bairro, Servico, Mensagem,
  PrestadorCategoria, PrestadorBairro, Pausa, TokenSenha, SolicitacaoExclusao
} = require('../models');
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
    { verificado: true, nota_media: 4.8 }); // SIMULA US06 (selo) e US24 (nota media)
  const eli = await perfil(u.eli, 'Instalacoes eletricas residenciais, iluminacao e quadro de luz.',
    [eletricista], [cambui],
    { nota_media: 4.5 }); // SIMULA US24 (nota media)
  await perfil(u.joao, 'Pintura de apartamentos e pequenos reparos.', [pintor], [barao, cambui]);

  // Servicos --------------------------------------------------------------
  const servico = (dados) => Servico.create({ fotos: [], ...dados });
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

  // 3. SIMULA US11 (aceite): compromisso nas proximas 24 horas. Aparece na
  //    agenda dos dois lados e dispara o lembrete da vespera ao subir a API.
  const amanha = new Date(Math.ceil((Date.now() + 20 * HORA) / HORA) * HORA);
  const s3 = await servico({
    id_contratante: u.ana.id, id_prestador: rita.id, bairro_id: centro.id,
    descricao: 'Vazamento embaixo da pia da cozinha.',
    data_hora_solicitada: amanha, data_hora_proposta: amanha,
    valor: 140, prazo_horas: 1, taxa_deslocamento: 0,
    status: 'aceito', orcamento_enviado_em: new Date(Date.now() - DIA)
  });
  await conversa(s3, [[u.rita, 'Combinado, Ana. Levo a peca nova.'], [u.ana, 'Perfeito, obrigada!']]);

  // 4. SIMULA US11 (aceite): compromisso do Bruno com o Eli, fora da area dele.
  await servico({
    id_contratante: u.bruno.id, id_prestador: eli.id, bairro_id: centro.id,
    descricao: 'Instalar um ventilador de teto na sala.',
    data_hora_solicitada: emDias(5, 9), data_hora_proposta: emDias(5, 9),
    valor: 150, prazo_horas: 2, taxa_deslocamento: 25,
    status: 'aceito', orcamento_enviado_em: new Date(Date.now() - DIA)
  });

  // 5. SIMULA US20 (conclusao): chat fechado, mensagens guardadas.
  const s5 = await servico({
    id_contratante: u.ana.id, id_prestador: eli.id, bairro_id: cambui.id,
    descricao: 'Trocar o disjuntor do quadro de luz.',
    data_hora_solicitada: new Date(Date.now() - 3 * DIA), data_hora_proposta: new Date(Date.now() - 3 * DIA),
    valor: 120, prazo_horas: 1, taxa_deslocamento: 0,
    status: 'concluido', orcamento_enviado_em: new Date(Date.now() - 5 * DIA)
  });
  await conversa(s5, [[u.eli, 'Servico feito, Ana. Qualquer coisa me chama.'], [u.ana, 'Ficou otimo!']]);

  // 6. SIMULA US18/US20 (pagos e confirmados): historico que conta como
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

  console.log(`
Dados de demonstracao criados. Senha de todas as contas: ${SENHA}

  ana.demo@fecho.app    contratante  pedido esperando orcamento, orcamento para recusar,
                                     compromisso amanha (agenda), servico concluido (chat fechado)
  bruno.demo@fecho.app  contratante  compromisso com taxa de deslocamento (agenda)
  rita.demo@fecho.app   prestadora   selo e nota 4,8; agenda com o compromisso de amanha
  eli.demo@fecho.app    prestador    pedido esperando o orcamento dele (responder ao vivo)
  joao.demo@fecho.app   prestador    sem nota e sem selo, para comparar na busca

Simulado direto no banco (historias de outros sprints): aceite (US11), nota media (US24),
selo (US06), conclusao e pagamento (US18/US20). Ao subir a API, o lembrete da vespera do
compromisso de amanha aparece no console (US13).
`);
  await sequelize.close();
}

rodar().catch(async (e) => {
  console.error('Falha ao criar os dados de demonstracao:', e.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
