/**
 * Dados de demonstracao dos Sprints 2, 3 e 4 (npm run db:demo).
 *
 * Alguns servicos sao gravados direto no banco no estado em que o fluxo real
 * os deixaria (Aceito com pagamento Retido, Pago com repasse e taxa,
 * avaliacoes publicadas), para a apresentacao ja comecar com exemplos. Os
 * fluxos ao vivo continuam disponiveis:
 *   - Sprint 3: aceitar e pagar o orcamento do Eli; cadastrar a chave do Eli;
 *   - Sprint 4: a Rita chega, inicia e conclui o servico de "agora" e a Ana
 *     confirma (repasse a 6%: a Rita ja tem 20 servicos); a Ana confirma o
 *     servico do disjuntor e o repasse do Eli espera a chave Pix; cancelar,
 *     pedir nova data, avaliar e chamar de novo pelo historico.
 *
 * Nada mais e simulado: a nota media vem de avaliacoes de verdade (US24) e a
 * conclusao e o repasse existem (US20).
 *
 * Rodar depois do npm run db:seed. Para apagar e criar de novo (as datas
 * sao sempre a partir de hoje): npm run db:demo -- --recriar
 */
require('dotenv').config();
const { Op } = require('sequelize');
const {
  sequelize, Usuario, Prestador, Categoria, Bairro, Servico, Mensagem,
  PrestadorCategoria, PrestadorBairro, Pausa, TokenSenha, SolicitacaoExclusao,
  Pagamento, EventoWebhook, AcessoEndereco, Notificacao, Avaliacao, Reagendamento, HistoricoServico
} = require('../models');
const { recalcularMedia } = require('../servicos/avaliacoes');
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
  joao: { nome: 'Joao Demo', email: 'joao.demo@fecho.app', tipo_perfil: 'prestador', sexo: 'masculino' },
  // US16 - prestadora que saiu da plataforma (conta desativada)
  lia: { nome: 'Lia Demo', email: 'lia.demo@fecho.app', tipo_perfil: 'prestador', sexo: 'feminino' }
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
  await Avaliacao.destroy({ where: { servico_id: idsServicos } });
  await Reagendamento.destroy({ where: { servico_id: idsServicos } });
  await HistoricoServico.destroy({ where: { servico_id: idsServicos } });
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
      chave_pix_tipo: 'cpf', chave_pix: u.rita.cpf, verificado: true, verificado_em: new Date(Date.now() - 7 * DIA)
    });
  const eli = await perfil(u.eli, 'Instalacoes eletricas residenciais, iluminacao e quadro de luz.',
    [eletricista], [cambui]);
  const joao = await perfil(u.joao, 'Pintura de apartamentos e pequenos reparos.', [pintor], [barao, cambui]);
  const lia = await perfil(u.lia, 'Pequenos reparos hidraulicos.', [encanador], [cambui]);
  u.lia.status = 'inativo';
  u.lia.desativado_em = new Date(Date.now() - 2 * DIA);
  await u.lia.save();

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
    id_contratante: u.ana.id, id_prestador: eli.id, bairro_id: cambui.id, categoria_id: eletricista.id,
    descricao: 'Trocar o chuveiro do banheiro de cima e ver uma tomada da cozinha que parou.',
    data_hora_solicitada: emDias(3, 14), status: 'aguardando_orcamento'
  });
  await conversa(s1, [[u.ana, 'Oi, Eli! O chuveiro e de 220 V.'], [u.eli, 'Oi, Ana. Ja te mando o orcamento.']]);

  // 2. Fluxo real da US10: orcamento da Rita esperando a Ana (pode recusar ao vivo).
  await servico({
    id_contratante: u.ana.id, id_prestador: rita.id, bairro_id: taquaral.id, categoria_id: eletricista.id,
    descricao: 'Instalar tres luminarias no quarto.',
    data_hora_solicitada: emDias(4, 10), data_hora_proposta: emDias(4, 10),
    valor: 210, prazo_horas: 3, taxa_deslocamento: 0,
    status: 'orcamento_enviado', orcamento_enviado_em: new Date()
  });

  // 2b. Fluxo real do Sprint 3: orcamento do Eli para a Ana ACEITAR ao vivo.
  //     Fora da area dele (Centro): total = 180 + 20 de deslocamento = 200.
  await servico({
    id_contratante: u.ana.id, id_prestador: eli.id, bairro_id: centro.id, categoria_id: eletricista.id,
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
    id_contratante: u.ana.id, id_prestador: rita.id, bairro_id: centro.id, categoria_id: encanador.id,
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
    id_contratante: u.bruno.id, id_prestador: eli.id, bairro_id: centro.id, categoria_id: eletricista.id,
    descricao: 'Instalar um ventilador de teto na sala.',
    data_hora_solicitada: emDias(5, 9), data_hora_proposta: emDias(5, 9),
    valor: 150, prazo_horas: 2, taxa_deslocamento: 25,
    status: 'aceito', orcamento_enviado_em: new Date(Date.now() - DIA),
    endereco: 'Rua Conceicao, 233, sala 4', aceito_em: new Date(Date.now() - DIA + 10 * 60 * 1000)
  });
  await pagamentoRetido(s4);

  // 5. US20 ao vivo: o Eli concluiu ha 1 hora; a Ana confirma. O Eli ainda
  //    nao tem chave Pix: o repasse espera ate ele cadastrar (US06 + US20).
  const s5 = await servico({
    id_contratante: u.ana.id, id_prestador: eli.id, bairro_id: cambui.id, categoria_id: eletricista.id,
    descricao: 'Trocar o disjuntor do quadro de luz.',
    data_hora_solicitada: new Date(Date.now() - 3 * HORA), data_hora_proposta: new Date(Date.now() - 3 * HORA),
    valor: 120, prazo_horas: 1, taxa_deslocamento: 0,
    status: 'concluido', orcamento_enviado_em: new Date(Date.now() - 2 * DIA),
    endereco: 'Rua Coronel Quirino, 500', aceito_em: new Date(Date.now() - DIA),
    iniciado_em: new Date(Date.now() - 2 * HORA), chegou_em: new Date(Date.now() - 2 * HORA), concluido_em: new Date(Date.now() - HORA)
  });
  await pagamentoRetido(s5);
  await conversa(s5, [[u.eli, 'Servico feito, Ana. Qualquer coisa me chama.'], [u.ana, 'Ficou otimo!']]);

  // 7. US20 / US15 ao vivo: compromisso da Rita com a Ana daqui a 30 minutos.
  //    A Rita pode apertar Cheguei, iniciar e concluir; a Ana pode cancelar
  //    (com a Rita no local: 50/50).
  const daquiAPouco = new Date(Date.now() + 30 * 60 * 1000);
  const s7 = await servico({
    id_contratante: u.ana.id, id_prestador: rita.id, bairro_id: cambui.id, categoria_id: encanador.id,
    descricao: 'Trocar a torneira da area de servico.',
    data_hora_solicitada: daquiAPouco, data_hora_proposta: daquiAPouco,
    valor: 90, prazo_horas: 1, taxa_deslocamento: 0,
    status: 'aceito', orcamento_enviado_em: new Date(Date.now() - DIA),
    endereco: 'Rua Maria Monteiro, 800, casa 2', aceito_em: new Date(Date.now() - DIA + 10 * 60 * 1000)
  });
  await pagamentoRetido(s7);

  // 6. Historico de servicos ja pagos (estado que US20 + US21 + US24 deixam):
  //    repasse feito, taxa gravada e avaliacoes publicadas. A Rita chega a
  //    20 servicos concluidos, entao o proximo dela ja paga 6% (US21).
  const pago = async (dados, { contratante, prestador, diasAtras, notaCliente, comentario, notaPrestador, anteriores }) => {
    const quando = new Date(Date.now() - diasAtras * DIA);
    const s = await servico({
      ...dados, id_contratante: contratante.id, id_prestador: prestador.id,
      data_hora_solicitada: quando, data_hora_proposta: quando, prazo_horas: 1, taxa_deslocamento: dados.taxa_deslocamento || 0,
      status: 'pago', aceito_em: quando, iniciado_em: quando, concluido_em: quando,
      confirmado_em: new Date(quando.getTime() + HORA), pago_em: new Date(quando.getTime() + HORA), confirmacao_automatica: false
    });
    const total = Number(s.valor) + Number(s.taxa_deslocamento);
    const percentual = anteriores >= 50 ? 5 : (anteriores >= 20 ? 6 : 8);
    const taxa = Math.round(Number(s.valor) * percentual) / 100;
    await Pagamento.create({
      servico_id: s.id, valor: total, status: 'liberado', identificador: `fecho-s${s.id}-demo`, gateway: 'simulado',
      cobranca_id: `sim_demo_${s.id}`, expira_em: quando, retido_em: quando,
      taxa_percentual: percentual, taxa_valor: taxa, valor_repasse: Math.round((total - taxa) * 100) / 100,
      repasse_id: `sim_tr_demo_${s.id}`, liberado_em: new Date(quando.getTime() + HORA)
    });
    const publicada = new Date(quando.getTime() + 2 * HORA);
    const prestadorUsuarioId = prestador.usuario_id;
    if (notaCliente) {
      await Avaliacao.create({
        servico_id: s.id, autor_id: contratante.id, avaliado_id: prestadorUsuarioId, papel_autor: 'contratante',
        nota: notaCliente, comentario: comentario || null, editavel_ate: publicada, prazo_ate: new Date(quando.getTime() + 7 * DIA),
        liberada_em: notaPrestador ? publicada : new Date(quando.getTime() + 7 * DIA)
      });
    }
    if (notaPrestador) {
      await Avaliacao.create({
        servico_id: s.id, autor_id: prestadorUsuarioId, avaliado_id: contratante.id, papel_autor: 'prestador',
        nota: notaPrestador, editavel_ate: publicada, prazo_ate: new Date(quando.getTime() + 7 * DIA), liberada_em: publicada
      });
    }
    return s;
  };

  const comentarios = [
    'Muito caprichosa, deixou tudo limpo.', 'Chegou no horario e resolveu rapido.', 'Otimo atendimento.',
    'Explicou tudo direitinho.', 'Recomendo!', null
  ];
  for (let i = 0; i < 18; i += 1) {
    await pago({ bairro_id: cambui.id, categoria_id: eletricista.id, descricao: 'Servico antigo (demonstracao).', valor: 100 }, {
      contratante: u.bruno, prestador: rita, diasAtras: 120 - i * 5, anteriores: i,
      notaCliente: i < 6 ? [5, 5, 4, 5, 5, 4][i] : null, comentario: i < 6 ? comentarios[i] : null, notaPrestador: i < 6 ? 5 : null
    });
  }
  // US16 - o historico da Ana: Rita (encanadora, avaliada), Joao (pintor) e
  // a Lia, que saiu da plataforma (aparece sem o botao "Chamar de novo").
  await pago({ bairro_id: cambui.id, categoria_id: encanador.id, descricao: 'Consertar a descarga do banheiro.', valor: 110 }, {
    contratante: u.ana, prestador: rita, diasAtras: 25, anteriores: 18, notaCliente: 5, comentario: 'Resolveu na hora, super atenciosa.', notaPrestador: 5
  });
  await pago({ bairro_id: cambui.id, categoria_id: eletricista.id, descricao: 'Instalar um chuveiro novo.', valor: 130 }, {
    contratante: u.ana, prestador: rita, diasAtras: 12, anteriores: 19, notaCliente: 4, notaPrestador: 5
  });
  await pago({ bairro_id: cambui.id, categoria_id: pintor.id, descricao: 'Pintar a parede da sala.', valor: 350 }, {
    contratante: u.ana, prestador: joao, diasAtras: 40, anteriores: 0
  });
  await pago({ bairro_id: cambui.id, categoria_id: encanador.id, descricao: 'Desentupir a pia da cozinha.', valor: 80 }, {
    contratante: u.ana, prestador: lia, diasAtras: 60, anteriores: 0, notaCliente: 4
  });
  await pago({ bairro_id: cambui.id, categoria_id: eletricista.id, descricao: 'Trocar a fiacao da garagem.', valor: 200 }, {
    contratante: u.bruno, prestador: eli, diasAtras: 15, anteriores: 0, notaCliente: 4, comentario: 'Bom servico.', notaPrestador: 5
  });
  // US24 ao vivo: servico confirmado ontem, ainda sem avaliacao (Ana e Joao avaliam).
  await pago({ bairro_id: barao.id, categoria_id: pintor.id, descricao: 'Retocar a pintura do portao.', valor: 120 }, {
    contratante: u.ana, prestador: joao, diasAtras: 1, anteriores: 1
  });

  for (const p of [rita, eli, joao, lia]) await recalcularMedia(p.usuario_id);

  const cpfFormatado = (c) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  console.log(`
Dados de demonstracao criados. Senha de todas as contas: ${SENHA}

  ana.demo@fecho.app    contratante  Sprint 4: CONFIRMAR o servico do disjuntor (Eli); servico da Rita
                                     daqui a 30 min (cancelar 50/50 depois do Cheguei); compromisso amanha
                                     (pedir nova data / cancelar 70/30); AVALIAR o Joao (pintura do portao);
                                     HISTORICO "Quem ja me atendeu" (Rita, Joao e a Lia, que saiu)
                                     Sprint 3: orcamento do Eli para aceitar e pagar o Pix
  bruno.demo@fecho.app  contratante  compromisso daqui a 5 dias com o Eli (cancelar com mais de 24 h: 100%)
  rita.demo@fecho.app   prestadora   CHEGUEI / INICIAR / CONCLUIR o servico de daqui a 30 min (repasse a 6%:
                                     ja tem 20 servicos); nota 4,6 de 8 avaliacoes; Meu perfil mostra a taxa
  eli.demo@fecho.app    prestador    SEM chave Pix: depois que a Ana confirmar, o repasse espera a chave (US06)
                                       CPF do Eli (chave certa): ${cpfFormatado(u.eli.cpf)}
                                       CPF da Ana (chave errada, para ver a recusa): ${cpfFormatado(u.ana.cpf)}
  joao.demo@fecho.app   prestador    avaliar a Ana (pintura do portao, confirmada ontem)

Para pagar o Pix depois de aceitar: npm run pix:pagar -- <id do servico>
Para ver a confirmacao automatica ao vivo: CONFIRMACAO_HORAS=0.05 no .env (3 minutos).
`);
  await sequelize.close();
}

rodar().catch(async (e) => {
  console.error('Falha ao criar os dados de demonstracao:', e.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
