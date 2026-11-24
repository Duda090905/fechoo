/**
 * Criterios de aceite do Sprint 5: US23, US25, US19 e US22.
 * Chamado pelo testes/criterios.js (npm run teste), com a API ja no ar em
 * sqlite e o gateway simulado (sem internet).
 *
 * Onde o criterio depende do relogio (72 horas, 48 horas), o teste ajusta a
 * data no banco ou chama a rotina com um "agora" no futuro - o mesmo que
 * aconteceria com o passar do tempo.
 */
const {
  Bairro, Servico, Pagamento, Usuario, Prestador, Notificacao, Disputa, AcaoAdministrador, PropostaComplementar
} = require('../src/models');
const { processarConclusoes } = require('../src/servicos/repasse');
const { processarRetencaoMidias } = require('../src/servicos/retencaoMidias');
const { gerarHash } = require('../src/utils/senha');

const HORA = 60 * 60 * 1000;
const MINUTO = 60 * 1000;
const DIA = 24 * HORA;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

function cpfDe(base) {
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

const reais = (v) => Math.round(Number(v) * 100) / 100;
// AAAA-MM-DD no horario de Brasilia
const dia = (data) => new Date(data.getTime() - 3 * HORA).toISOString().slice(0, 10);

async function testarSprint5({ chamar, chamarForm, checar, base, bairro, idsCategorias, terceiro }) {
  const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;
  const [eletricista] = idsCategorias;
  const iso = (data) => data.toISOString();

  let proximoHorario = Math.ceil((Date.now() + 60 * DIA) / HORA) * HORA;
  const novoHorario = () => {
    proximoHorario += 3 * HORA;
    return new Date(proximoHorario);
  };

  async function cadastrar(nome, base9, email, tipo, sexo = 'feminino') {
    const r = await chamar('/auth/register', {
      metodo: 'POST',
      corpo: {
        nome, cpf: cpfDe(base9), email, telefone: '19999990000', senha: 'senha1234',
        tipo_perfil: tipo, sexo, aceite_termos: true
      }
    });
    if (!r.dados.token) throw new Error(`cadastro recusado: ${r.status} ${JSON.stringify(r.dados)}`);
    return { token: r.dados.token, cpf: cpfDe(base9), usuario: await Usuario.findOne({ where: { email } }) };
  }

  async function prestadorPronto(nome, base9, email) {
    const p = await cadastrar(nome, base9, email, 'prestador', 'masculino');
    await chamar('/prestadores/meu-perfil', {
      metodo: 'PUT', token: p.token, corpo: { descricao: 'Profissional.', categorias: [eletricista], bairros: [bairro.id] }
    });
    await chamar('/prestadores/chave-pix', { metodo: 'PUT', token: p.token, corpo: { tipo: 'cpf', chave: p.cpf } });
    p.prestador = await Prestador.findOne({ where: { usuario_id: p.usuario.id } });
    return p;
  }

  const webhook = (corpo) => fetch(`${base}/pagamentos/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'asaas-access-token': TOKEN },
    body: JSON.stringify(corpo)
  }).then(async (r) => ({ status: r.status, dados: await r.json().catch(() => ({})) }));

  const pagar = (p) => webhook({
    id: `evt_s5_${p.id}`,
    event: 'PAYMENT_RECEIVED',
    payment: { id: p.cobranca_id, value: Number(p.valor), externalReference: p.identificador }
  });

  async function servicoPago(cliente, prest, { valor = 200 } = {}) {
    const horario = novoHorario();
    const pedido = await chamar('/servicos', {
      metodo: 'POST', token: cliente.token,
      corpo: {
        id_prestador: prest.prestador.id, bairro_id: bairro.id, descricao: 'Revisar a parte elétrica.',
        data_hora: iso(horario), categoria_id: eletricista
      }
    });
    if (!pedido.dados.servico) throw new Error(`pedido recusado: ${pedido.status} ${JSON.stringify(pedido.dados)}`);
    const id = pedido.dados.servico.id;
    await chamar(`/servicos/${id}/orcamento`, { metodo: 'POST', token: prest.token, corpo: { valor, prazo_horas: 2, data_hora: iso(horario) } });
    await chamar(`/servicos/${id}/aceitar`, { metodo: 'POST', token: cliente.token, corpo: { endereco: 'Rua das Palmeiras, 50' } });
    await pagar(await Pagamento.findOne({ where: { servico_id: id }, order: [['id', 'DESC']] }));
    return id;
  }

  const trazerPara = (id, minutos) => Servico.update(
    { data_hora_proposta: new Date(Date.now() + minutos * MINUTO) }, { where: { id } }
  );
  async function emExecucao(cliente, prest, opcoes) {
    const id = await servicoPago(cliente, prest, opcoes);
    await trazerPara(id, 30);
    await chamar(`/servicos/${id}/iniciar`, { metodo: 'POST', token: prest.token });
    return id;
  }
  async function concluido(cliente, prest, opcoes) {
    const id = await emExecucao(cliente, prest, opcoes);
    await chamar(`/servicos/${id}/concluir`, { metodo: 'POST', token: prest.token });
    return id;
  }
  const detalhe = async (id, token) => (await chamar(`/servicos/${id}`, { token })).dados.servico;
  const principal = (id) => Pagamento.findOne({ where: { servico_id: id }, order: [['id', 'DESC']] });
  const todosPagamentos = (id) => Pagamento.unscoped().findAll({ where: { servico_id: id }, order: [['id', 'ASC']] });
  const abrirDisputa = (id, token, { justificativa = 'O serviço ficou pela metade e a tomada não funciona.', fotos = 1 } = {}) => chamarForm(
    `/servicos/${id}/disputa`,
    { token, campos: { justificativa }, arquivos: Array.from({ length: fotos }, () => ({ campo: 'fotos', bytes: PNG })) }
  );
  const defender = (id, token, defesa = 'Fiz tudo o que estava no orçamento; a tomada é de outro circuito.') => chamarForm(
    `/servicos/${id}/disputa/defesa`, { token, campos: { defesa }, arquivos: [{ campo: 'fotos', bytes: PNG }] }
  );

  const lara = await cadastrar('Lara Duarte', 771200101, 'lara.s5@teste.com', 'contratante');
  const nina = await cadastrar('Nina Prates', 771200102, 'nina.s5@teste.com', 'contratante');
  const davi = await prestadorPronto('Davi Lopes', 771200103, 'davi.s5@teste.com');
  const enzo = await prestadorPronto('Enzo Rocha', 771200104, 'enzo.s5@teste.com');

  // Administrador: nao se cadastra pelo site (npm run admin:criar).
  await Usuario.create({
    nome: 'Equipe Fechô', email: 'admin.s5@teste.com', senha_hash: await gerarHash('senha1234'),
    tipo_perfil: 'administrador', status: 'ativo', aceite_termos: true
  });
  const tAdmin = (await chamar('/auth/login', { metodo: 'POST', corpo: { email: 'admin.s5@teste.com', senha: 'senha1234' } })).dados.token;
  const admin = await Usuario.findOne({ where: { email: 'admin.s5@teste.com' } });

  // =====================================================================
  console.log('\nUS23 - Abertura de disputa');

  const idAceito = await servicoPago(lara, davi);
  const antesDeComecar = await abrirDisputa(idAceito, lara.token);
  checar('servico aceito que ainda nao comecou nao abre disputa (o caminho e o cancelamento)', antesDeComecar.status === 409);

  const idD1 = await concluido(lara, davi, { valor: 300 });
  checar('preparacao: o servico esta Concluido pelo prestador', (await Servico.findByPk(idD1)).status === 'concluido');
  const prestadorAbrindo = await abrirDisputa(idD1, davi.token);
  checar('quem abre a disputa e o contratante (o prestador recebe 403)', prestadorAbrindo.status === 403);
  const terceiroAbrindo = await abrirDisputa(idD1, terceiro.token);
  checar('quem nao e parte do servico nao abre disputa (404)', terceiroAbrindo.status === 404);
  const curta = await abrirDisputa(idD1, lara.token, { justificativa: 'ruim' });
  checar('disputa sem justificativa (ou curta demais) e recusada', curta.status === 400);
  const naoImagem = await chamarForm(`/servicos/${idD1}/disputa`, {
    token: lara.token,
    campos: { justificativa: 'O serviço ficou pela metade.' },
    arquivos: [{ campo: 'fotos', bytes: Buffer.from('nao sou imagem') }]
  });
  checar('evidencia que nao e imagem e recusada', naoImagem.status === 400);
  checar('nada foi aberto com os pedidos recusados', (await Disputa.count({ where: { servico_id: idD1 } })) === 0
    && (await Servico.findByPk(idD1)).status === 'concluido');

  const detAntes = await detalhe(idD1, lara.token);
  checar('a tela do servico concluido mostra o prazo para abrir disputa',
    detAntes.pode_abrir_disputa === true && Boolean(detAntes.prazo_disputa));

  const aberta = await abrirDisputa(idD1, lara.token, { fotos: 2 });
  const disputaD1 = await Disputa.findOne({ where: { servico_id: idD1 } });
  checar('o contratante abre a disputa com justificativa e evidencias (2 fotos)',
    aberta.status === 201 && disputaD1 && disputaD1.evidencias.length === 2 && disputaD1.justificativa.includes('metade'));
  checar('a disputa congela o valor: servico Em disputa e pagamento continua Retido',
    (await Servico.findByPk(idD1)).status === 'em_disputa' && (await principal(idD1)).status === 'retido');
  const avisoDavi = await Notificacao.findOne({ where: { servico_id: idD1, usuario_id: davi.usuario.id, tipo: 'disputa_aberta' } });
  checar('o prestador e notificado da disputa', Boolean(avisoDavi));
  const segunda = await abrirDisputa(idD1, lara.token);
  checar('o mesmo servico nao tem segunda disputa', segunda.status === 409 && (await Disputa.count({ where: { servico_id: idD1 } })) === 1);

  await processarConclusoes(new Date(Date.now() + 100 * HORA));
  checar('a disputa impede a liberacao automatica (a rotina das 72 horas nao toca o servico)',
    (await Servico.findByPk(idD1)).status === 'em_disputa' && (await principal(idD1)).status === 'retido');
  const confirmaDurante = await chamar(`/servicos/${idD1}/confirmar`, { metodo: 'POST', token: lara.token });
  const cancelaDurante = await chamar(`/servicos/${idD1}/cancelar`, {
    metodo: 'POST', token: lara.token, corpo: { motivo: 'Quero meu dinheiro de volta' }
  });
  const decideCliente = await chamar(`/admin/disputas/${disputaD1.id}/decisao`, {
    metodo: 'POST', token: lara.token, corpo: { decisao: 'devolver', justificativa: 'Eu mesma decido devolver.' }
  });
  checar('o contratante nao estorna sozinho (confirmar, cancelar e decidir sao recusados)',
    confirmaDurante.status === 409 && cancelaDurante.status === 409 && decideCliente.status === 403
    && (await principal(idD1)).status === 'retido');
  const decidePrestador = await chamar(`/admin/disputas/${disputaD1.id}/decisao`, {
    metodo: 'POST', token: davi.token, corpo: { decisao: 'liberar', justificativa: 'Eu mesmo libero o meu.' }
  });
  checar('o prestador tambem nao libera o valor sozinho', decidePrestador.status === 403);

  const defesaCurta = await defender(idD1, davi.token, 'nao');
  const defesaCliente = await defender(idD1, lara.token);
  checar('a defesa e do prestador e precisa de texto', defesaCurta.status === 400 && defesaCliente.status === 403);
  const defesa = await defender(idD1, davi.token);
  const disputaComDefesa = await Disputa.findByPk(disputaD1.id);
  checar('o prestador responde a disputa com a defesa e evidencias',
    defesa.status === 200 && disputaComDefesa.defesa.includes('outro circuito') && disputaComDefesa.defesa_evidencias.length === 1);
  checar('o contratante e avisado da defesa',
    Boolean(await Notificacao.findOne({ where: { servico_id: idD1, usuario_id: lara.usuario.id, tipo: 'disputa_defesa' } })));
  const defesaDupla = await defender(idD1, davi.token);
  checar('a defesa e enviada uma vez so', defesaDupla.status === 409);

  const detLara = await detalhe(idD1, lara.token);
  const detDavi = await detalhe(idD1, davi.token);
  checar('as duas partes veem a disputa, as evidencias e a defesa na tela do servico',
    detLara.disputa && detLara.disputa.evidencias.length === 2 && detDavi.disputa.defesa.includes('circuito')
    && detLara.pode_abrir_disputa === false);
  const [evid] = disputaComDefesa.evidencias;
  const evidParte = await fetch(`${base}/servicos/${idD1}/arquivos/${evid}`, { headers: { Authorization: `Bearer ${davi.token}` } });
  const evidTerceiro = await fetch(`${base}/servicos/${idD1}/arquivos/${evid}`, { headers: { Authorization: `Bearer ${terceiro.token}` } });
  checar('as evidencias so abrem para as partes (terceiro recebe 404)', evidParte.status === 200 && evidTerceiro.status === 404);

  await Servico.update({ encerrado_em: new Date(Date.now() - 200 * DIA) }, { where: { id: idD1 } });
  await processarRetencaoMidias();
  checar('com a disputa aberta, a rotina de guarda das midias nao apaga as provas',
    (await Disputa.findByPk(disputaD1.id)).evidencias.length === 2 && !(await Servico.findByPk(idD1)).midias_removidas_em);

  const idForaPrazo = await concluido(nina, davi);
  await Servico.update({ concluido_em: new Date(Date.now() - 73 * HORA) }, { where: { id: idForaPrazo } });
  const foraPrazo = await abrirDisputa(idForaPrazo, nina.token);
  checar('fora das 72 horas depois de concluido a disputa nao abre', foraPrazo.status === 409
    && (await Servico.findByPk(idForaPrazo)).status === 'concluido');
  await Servico.update({ concluido_em: new Date(Date.now() - 71 * HORA) }, { where: { id: idForaPrazo } });
  const dentroPrazo = await abrirDisputa(idForaPrazo, nina.token);
  checar('dentro das 72 horas (71 horas depois) a disputa abre', dentroPrazo.status === 201);

  const idExec = await emExecucao(nina, enzo, { valor: 250 });
  const exec = await abrirDisputa(idExec, nina.token);
  checar('com o servico em execucao (sem cancelamento possivel) a disputa tambem abre',
    exec.status === 201 && (await Servico.findByPk(idExec)).status === 'em_disputa');

  // =====================================================================
  console.log('\nUS25 - Painel do administrador');

  const filaCliente = await chamar('/admin/disputas', { token: lara.token });
  const filaPrestador = await chamar('/admin/disputas', { token: davi.token });
  const filaSemLogin = await chamar('/admin/disputas');
  const relatorioCliente = await chamar('/admin/relatorio', { token: nina.token });
  checar('so o administrador acessa o painel (os outros perfis recebem 403, sem login 401)',
    filaCliente.status === 403 && filaPrestador.status === 403 && filaSemLogin.status === 401 && relatorioCliente.status === 403);
  const cadastroAdmin = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: {
      nome: 'Falso Admin', cpf: cpfDe(771200199), email: 'falso.admin@teste.com', telefone: '19999990000',
      senha: 'senha1234', tipo_perfil: 'administrador', aceite_termos: true
    }
  });
  checar('ninguem vira administrador pelo cadastro do site', cadastroAdmin.status === 400);

  const fila = await chamar('/admin/disputas', { token: tAdmin });
  const cartaoD1 = fila.dados.disputas.find((d) => d.id === disputaD1.id);
  checar('a fila mostra as disputas abertas, com valor congelado e evidencias',
    fila.status === 200 && fila.dados.disputas.length === 3 && cartaoD1 && cartaoD1.valor_congelado === 300
    && cartaoD1.evidencias === 3 && cartaoD1.tem_defesa === true);
  checar('a fila vem da mais antiga para a mais nova',
    fila.dados.disputas.every((d, i, l) => i === 0 || new Date(l[i - 1].aberta_em) <= new Date(d.aberta_em)));

  const fichaD1 = await chamar(`/admin/disputas/${disputaD1.id}`, { token: tAdmin });
  checar('o administrador ve as evidencias das duas partes, o chat, o historico e as partes',
    fichaD1.status === 200 && fichaD1.dados.disputa.evidencias.length === 2 && fichaD1.dados.disputa.defesa_evidencias.length === 1
    && fichaD1.dados.historico.some((h) => h.acao === 'disputa_aberta') && fichaD1.dados.partes.prestador.nome === 'Davi Lopes'
    && Array.isArray(fichaD1.dados.mensagens));
  const evidAdmin = await fetch(`${base}/admin/disputas/${disputaD1.id}/arquivos/${evid}`, { headers: { Authorization: `Bearer ${tAdmin}` } });
  const evidAdminCliente = await fetch(`${base}/admin/disputas/${disputaD1.id}/arquivos/${evid}`, { headers: { Authorization: `Bearer ${lara.token}` } });
  checar('o administrador abre as fotos das evidencias (e so ele, por essa rota)', evidAdmin.status === 200 && evidAdminCliente.status === 403);

  const semJust = await chamar(`/admin/disputas/${disputaD1.id}/decisao`, { metodo: 'POST', token: tAdmin, corpo: { decisao: 'devolver' } });
  const decisaoErrada = await chamar(`/admin/disputas/${disputaD1.id}/decisao`, {
    metodo: 'POST', token: tAdmin, corpo: { decisao: 'perdoar', justificativa: 'Uma justificativa qualquer.' }
  });
  const divisaoErrada = await chamar(`/admin/disputas/${disputaD1.id}/decisao`, {
    metodo: 'POST', token: tAdmin, corpo: { decisao: 'dividir', percentual_contratante: 100, justificativa: 'Uma justificativa qualquer.' }
  });
  checar('decisao sem justificativa, desconhecida ou divisao fora de 1-99% e recusada',
    semJust.status === 400 && decisaoErrada.status === 400 && divisaoErrada.status === 400
    && (await Disputa.findByPk(disputaD1.id)).status === 'aberta');

  // Sem defesa, o administrador espera as 48 horas do prestador.
  const idSemDefesa = (await Disputa.findOne({ where: { servico_id: idExec } })).id;
  const cedoDemais = await chamar(`/admin/disputas/${idSemDefesa}/decisao`, {
    metodo: 'POST', token: tAdmin, corpo: { decisao: 'devolver', justificativa: 'O cliente mandou foto do serviço inacabado.' }
  });
  checar('sem defesa, a decisao espera o prazo de 48 horas do prestador', cedoDemais.status === 409);

  const devolver = await chamar(`/admin/disputas/${disputaD1.id}/decisao`, {
    metodo: 'POST', token: tAdmin, corpo: { decisao: 'devolver', justificativa: 'As fotos mostram a tomada sem funcionar.' }
  });
  const pagD1 = await principal(idD1);
  const dispD1 = await Disputa.findByPk(disputaD1.id);
  checar('decidir "devolver" gera o estorno integral ao contratante',
    devolver.status === 200 && pagD1.status === 'estornado' && reais(pagD1.valor_estorno) === 300 && Boolean(pagD1.estorno_id)
    && !pagD1.repasse_id);
  checar('a decisao fica registrada com autor, data e justificativa',
    dispD1.status === 'decidida' && dispD1.decisao === 'devolver' && dispD1.decidido_por_id === admin.id && Boolean(dispD1.decidido_em)
    && dispD1.justificativa_decisao.includes('tomada')
    && Boolean(await AcaoAdministrador.findOne({ where: { acao: 'decisao_disputa', alvo_id: dispD1.id, administrador_id: admin.id } })));
  checar('o servico fica Resolvido e as duas partes sao avisadas',
    (await Servico.findByPk(idD1)).status === 'resolvido'
    && (await Notificacao.count({ where: { servico_id: idD1, tipo: 'disputa_decidida' } })) === 2);
  const deNovo = await chamar(`/admin/disputas/${disputaD1.id}/decisao`, {
    metodo: 'POST', token: tAdmin, corpo: { decisao: 'liberar', justificativa: 'Mudei de ideia sobre a decisão.' }
  });
  checar('uma disputa decidida nao e decidida de novo', deNovo.status === 409 && (await principal(idD1)).status === 'estornado');

  // Liberar: como a conclusao, ja sem a taxa.
  const idLib = (await Disputa.findOne({ where: { servico_id: idForaPrazo } })).id;
  await defender(idForaPrazo, davi.token);
  const liberar = await chamar(`/admin/disputas/${idLib}/decisao`, {
    metodo: 'POST', token: tAdmin, corpo: { decisao: 'liberar', justificativa: 'O serviço foi entregue como combinado.' }
  });
  const pagLib = await principal(idForaPrazo);
  checar('decidir "liberar" gera a transferencia ao prestador, ja sem a taxa',
    liberar.status === 200 && pagLib.status === 'liberado' && Boolean(pagLib.repasse_id) && Number(pagLib.taxa_percentual) > 0
    && reais(pagLib.valor_repasse) === reais(200 - 200 * Number(pagLib.taxa_percentual) / 100));

  // Dividir: depois das 48 horas sem defesa.
  await Disputa.update({ aberta_em: new Date(Date.now() - 49 * HORA) }, { where: { id: idSemDefesa } });
  const dividir = await chamar(`/admin/disputas/${idSemDefesa}/decisao`, {
    metodo: 'POST',
    token: tAdmin,
    corpo: { decisao: 'dividir', percentual_contratante: 60, justificativa: 'Metade do serviço foi feita, falta o acabamento.' }
  });
  const pagDiv = await principal(idExec);
  checar('depois das 48 horas sem defesa o administrador decide; "dividir" estorna 60% e transfere 40%',
    dividir.status === 200 && pagDiv.status === 'estornado' && reais(pagDiv.valor_estorno) === 150
    && reais(pagDiv.valor_repasse) === 100 && Boolean(pagDiv.repasse_id) && Number(pagDiv.taxa_valor) === 0);

  const acoes = await chamar('/admin/acoes', { token: tAdmin });
  checar('o registro de decisoes mostra as tres, com quem decidiu, quando e por que',
    acoes.status === 200 && acoes.dados.acoes.filter((a) => a.acao === 'decisao_disputa').length === 3
    && acoes.dados.acoes.every((a) => a.por === 'Equipe Fechô' && a.em && a.justificativa));

  // Suspensao preventiva
  const buscaAntes = await chamar(`/prestadores?categoria=${eletricista}`);
  checar('preparacao: o prestador aparece na busca', buscaAntes.dados.prestadores.some((p) => p.id === enzo.prestador.id));
  const pedidoPendente = await chamar('/servicos', {
    metodo: 'POST', token: lara.token,
    corpo: { id_prestador: enzo.prestador.id, bairro_id: bairro.id, descricao: 'Instalar chuveiro.', data_hora: iso(novoHorario()) }
  });
  const suspSemJust = await chamar(`/admin/prestadores/${enzo.prestador.id}/suspensao`, { metodo: 'PATCH', token: tAdmin, corpo: { suspender: true } });
  checar('a suspensao exige justificativa', suspSemJust.status === 400);
  const suspCliente = await chamar(`/admin/prestadores/${enzo.prestador.id}/suspensao`, {
    metodo: 'PATCH', token: lara.token, corpo: { suspender: true, justificativa: 'Não gostei do atendimento.' }
  });
  checar('so o administrador suspende', suspCliente.status === 403);
  const susp = await chamar(`/admin/prestadores/${enzo.prestador.id}/suspensao`, {
    metodo: 'PATCH', token: tAdmin, corpo: { suspender: true, justificativa: 'Disputa com indício de serviço abandonado.' }
  });
  checar('suspensao preventiva: o perfil fica suspenso e o registro guarda autor e justificativa',
    susp.status === 200 && (await Prestador.findByPk(enzo.prestador.id)).status === 'suspenso'
    && Boolean(await AcaoAdministrador.findOne({ where: { acao: 'suspensao', alvo_id: enzo.prestador.id, administrador_id: admin.id } })));
  const buscaDepois = await chamar(`/prestadores?categoria=${eletricista}`);
  checar('o suspenso sai da busca', !buscaDepois.dados.prestadores.some((p) => p.id === enzo.prestador.id));
  const pedidoNovo = await chamar('/servicos', {
    metodo: 'POST', token: lara.token,
    corpo: { id_prestador: enzo.prestador.id, bairro_id: bairro.id, descricao: 'Trocar disjuntor.', data_hora: iso(novoHorario()) }
  });
  const orcamentoSuspenso = await chamar(`/servicos/${pedidoPendente.dados.servico.id}/orcamento`, {
    metodo: 'POST', token: enzo.token, corpo: { valor: 100, prazo_horas: 1, data_hora: iso(novoHorario()) }
  });
  checar('o suspenso nao recebe pedidos (nem fecha orcamento de pedido antigo)',
    pedidoNovo.status >= 400 && !pedidoNovo.dados.servico && orcamentoSuspenso.status === 403);
  const despausar = await chamar('/prestadores/pausa', { metodo: 'PATCH', token: enzo.token });
  const perfilEnzo = await chamar('/prestadores/meu-perfil', { token: enzo.token });
  checar('o suspenso nao sai da suspensao sozinho e ve o motivo no proprio perfil',
    despausar.status === 403 && perfilEnzo.dados.prestador.motivo_suspensao.includes('abandonado'));
  const reativar = await chamar(`/admin/prestadores/${enzo.prestador.id}/suspensao`, {
    metodo: 'PATCH', token: tAdmin, corpo: { suspender: false, justificativa: 'Análise concluída sem nova ocorrência.' }
  });
  const buscaVolta = await chamar(`/prestadores?categoria=${eletricista}`);
  checar('o administrador retira a suspensao e o prestador volta a busca',
    reativar.status === 200 && buscaVolta.dados.prestadores.some((p) => p.id === enzo.prestador.id));

  const lista = await chamar('/admin/prestadores?busca=Enzo', { token: tAdmin });
  checar('o painel lista os prestadores com as disputas de cada um',
    lista.status === 200 && lista.dados.prestadores.length === 1 && lista.dados.prestadores[0].disputas === 1);

  const rel = await chamar('/admin/relatorio', { token: tAdmin });
  const r = rel.dados;
  checar('o relatorio mostra as disputas por decisao e o dinheiro devolvido e liberado',
    rel.status === 200 && r.disputas.decididas_no_periodo === 3
    && r.disputas.por_decisao.devolver === 1 && r.disputas.por_decisao.liberar === 1 && r.disputas.por_decisao.dividir === 1
    && r.disputas.valor_devolvido === 450 && r.disputas.aguardando_decisao === 0);
  checar('o relatorio traz os servicos por status, as taxas e os suspensos',
    r.servicos.total > 0 && r.servicos.por_status.resolvido === 3 && r.dinheiro.taxas_arrecadadas > 0
    && r.prestadores_suspensos === await Prestador.count({ where: { status: 'suspenso' } }));
  const relFuturo = await chamar(`/admin/relatorio?de=${dia(new Date(Date.now() + 10 * DIA))}`, { token: tAdmin });
  const relErrado = await chamar('/admin/relatorio?de=01/02/2026', { token: tAdmin });
  checar('o relatorio filtra pelo periodo e recusa data em outro formato',
    relFuturo.dados.disputas.decididas_no_periodo === 0 && relErrado.status === 400);

  // =====================================================================
  console.log('\nUS19 - Proposta complementar');

  const propor = (id, token, { valor = '100', justificativa = 'O cabo do chuveiro está derretido e precisa ser trocado.', foto = true } = {}) => chamarForm(
    `/servicos/${id}/complementar`,
    { token, campos: { valor, justificativa }, arquivos: foto ? [{ campo: 'foto', bytes: PNG }] : [] }
  );

  const idC1 = await servicoPago(lara, davi, { valor: 200 });
  const antesDeChegar = await propor(idC1, davi.token);
  checar('a proposta complementar e feita no local (antes de chegar e recusada)', antesDeChegar.status === 409);
  await trazerPara(idC1, 30);
  await chamar(`/servicos/${idC1}/cheguei`, { metodo: 'POST', token: davi.token });

  const metricaAntes = (await chamar('/prestadores/meu-perfil', { token: davi.token })).dados.prestador.complementares;
  const semFotoC = await propor(idC1, davi.token, { foto: false });
  const semJustC = await propor(idC1, davi.token, { justificativa: 'cabo' });
  checar('justificativa e foto sao obrigatorias', semFotoC.status === 400 && semJustC.status === 400);
  const acima = await propor(idC1, davi.token, { valor: '100,01' });
  const zero = await propor(idC1, davi.token, { valor: '0' });
  checar('acima de 50% do valor original e recusada (100,01 sobre 200)', acima.status === 400 && acima.dados.erro.includes('50%'));
  checar('valor zerado e recusado', zero.status === 400);
  const clientePropondo = await propor(idC1, lara.token);
  checar('so o prestador propoe', clientePropondo.status === 403);
  checar('nada foi gravado com as propostas recusadas', (await PropostaComplementar.count({ where: { servico_id: idC1 } })) === 0);

  const proposta = await propor(idC1, davi.token, { valor: '100' });
  checar('proposta de exatamente 50% com justificativa e foto e aceita',
    proposta.status === 201 && (await PropostaComplementar.findOne({ where: { servico_id: idC1 } })).status === 'pendente');
  checar('o contratante e avisado da proposta',
    Boolean(await Notificacao.findOne({ where: { servico_id: idC1, usuario_id: lara.usuario.id, tipo: 'complementar_proposto' } })));
  const detC1 = await detalhe(idC1, lara.token);
  const fotoC = await fetch(`${base}/servicos/${idC1}/arquivos/${detC1.complementar.foto}`, { headers: { Authorization: `Bearer ${lara.token}` } });
  checar('o contratante ve a proposta com valor, justificativa e a foto',
    detC1.complementar.valor === 100 && detC1.complementar.justificativa.includes('derretido') && fotoC.status === 200);
  const segundaC = await propor(idC1, davi.token, { valor: '50' });
  checar('nao existe segunda proposta complementar no mesmo servico', segundaC.status === 409);

  const metricaDepois = (await chamar('/prestadores/meu-perfil', { token: davi.token })).dados.prestador.complementares;
  const cartaoBusca = (await chamar(`/prestadores?categoria=${eletricista}`)).dados.prestadores.find((p) => p.id === davi.prestador.id);
  checar('a metrica no perfil e atualizada (propostas complementares / servicos aceitos)',
    metricaDepois.propostas === metricaAntes.propostas + 1 && cartaoBusca.complementares.propostas === metricaDepois.propostas
    && metricaDepois.servicos > 0 && metricaDepois.percentual === Math.round((metricaDepois.propostas / metricaDepois.servicos) * 100));

  const recusa = await chamar(`/servicos/${idC1}/complementar/recusar`, { metodo: 'POST', token: lara.token });
  const pagC1 = await principal(idC1);
  const servC1 = await Servico.findByPk(idC1);
  checar('a recusa mantem o orcamento original e o valor retido',
    recusa.status === 200 && (await PropostaComplementar.findOne({ where: { servico_id: idC1 } })).status === 'recusada'
    && servC1.status === 'aceito' && reais(servC1.valor) === 200 && pagC1.status === 'retido' && reais(pagC1.valor) === 200);
  const depoisDaRecusa = await propor(idC1, davi.token, { valor: '40' });
  checar('depois de recusada, tambem nao existe segunda complementar', depoisDaRecusa.status === 409);

  // Aceita e paga: o Pix adicional fica retido junto e sai na confirmacao.
  const idC2 = await emExecucao(nina, davi, { valor: 300 });
  await propor(idC2, davi.token, { valor: '120' });
  const aceite = await chamar(`/servicos/${idC2}/complementar/aceitar`, { metodo: 'POST', token: nina.token });
  const pixC = (await todosPagamentos(idC2)).find((p) => p.tipo === 'complementar');
  checar('aceita a proposta, o Pix adicional sai com exatamente o valor complementar',
    aceite.status === 201 && pixC && reais(pixC.valor) === 120 && pixC.status === 'aguardando'
    && Boolean(aceite.dados.complementar.pagamento.pix.copia_cola));
  const aceiteDuplo = await chamar(`/servicos/${idC2}/complementar/aceitar`, { metodo: 'POST', token: nina.token });
  checar('clicar de novo devolve o mesmo Pix (nao gera outra cobranca)',
    aceiteDuplo.status === 201 && (await todosPagamentos(idC2)).filter((p) => p.tipo === 'complementar').length === 1);
  checar('o pagamento original continua o mesmo na tela do servico', (await detalhe(idC2, nina.token)).pagamento.valor === 300);
  await pagar(pixC);
  checar('com o Pix pago, o valor complementar fica retido junto com o original',
    (await Pagamento.unscoped().findByPk(pixC.id)).status === 'retido' && (await principal(idC2)).status === 'retido'
    && (await PropostaComplementar.findOne({ where: { servico_id: idC2 } })).status === 'paga');
  checar('o prestador e avisado de que o complementar caiu',
    Boolean(await Notificacao.findOne({ where: { servico_id: idC2, usuario_id: davi.usuario.id, tipo: 'complementar_pago' } })));
  await chamar(`/servicos/${idC2}/concluir`, { metodo: 'POST', token: davi.token });
  await chamar(`/servicos/${idC2}/confirmar`, { metodo: 'POST', token: nina.token });
  const [pOrig, pComp] = await todosPagamentos(idC2);
  const perc = Number(pOrig.taxa_percentual);
  checar('na confirmacao, o original e o complementar sao liberados com a mesma taxa',
    (await Servico.findByPk(idC2)).status === 'pago' && pOrig.status === 'liberado' && pComp.status === 'liberado'
    && Number(pComp.taxa_percentual) === perc
    && reais(Number(pOrig.valor_repasse) + Number(pComp.valor_repasse)) === reais(420 - 420 * perc / 100));

  // Cancelamento com o complementar retido: volta inteiro ao contratante.
  const idC3 = await servicoPago(lara, enzo, { valor: 200 });
  await trazerPara(idC3, 30);
  await chamar(`/servicos/${idC3}/cheguei`, { metodo: 'POST', token: enzo.token });
  await propor(idC3, enzo.token, { valor: '60' });
  await chamar(`/servicos/${idC3}/complementar/aceitar`, { metodo: 'POST', token: lara.token });
  await pagar((await todosPagamentos(idC3)).find((p) => p.tipo === 'complementar'));
  await chamar(`/servicos/${idC3}/cancelar`, { metodo: 'POST', token: lara.token, corpo: { motivo: 'Desisti do serviço todo.' } });
  const [cOrig, cComp] = await todosPagamentos(idC3);
  checar('cancelado o servico, o complementar volta inteiro ao contratante (o original segue a regra da US15)',
    cComp.status === 'estornado' && reais(cComp.valor_estorno) === 60 && cOrig.status === 'estornado' && reais(cOrig.valor_estorno) === 100);

  // Concluido sem pagar o complementar: a proposta perde o efeito.
  const idC4 = await emExecucao(nina, enzo, { valor: 100 });
  await propor(idC4, enzo.token, { valor: '30' });
  await chamar(`/servicos/${idC4}/concluir`, { metodo: 'POST', token: enzo.token });
  const aceitarTarde = await chamar(`/servicos/${idC4}/complementar/aceitar`, { metodo: 'POST', token: nina.token });
  checar('concluido o servico sem resposta, a proposta deixa de valer',
    (await PropostaComplementar.findOne({ where: { servico_id: idC4 } })).status === 'encerrada' && aceitarTarde.status === 409);

  // =====================================================================
  console.log('\nUS22 - Extrato do prestador');

  // Davi: idD1 devolvido (nada), idForaPrazo liberado na disputa, idC2 pago
  // com complementar, idC1 retido. Mais um servico pago ha 40 dias.
  const idAntigo = await concluido(lara, davi, { valor: 150 });
  await chamar(`/servicos/${idAntigo}/confirmar`, { metodo: 'POST', token: lara.token });
  await Pagamento.update({ liberado_em: new Date(Date.now() - 40 * DIA) }, { where: { servico_id: idAntigo } });

  const ext = await chamar('/prestadores/extrato', { token: davi.token });
  const e = ext.dados.extrato;
  const linha = (id) => e.linhas.find((l) => l.servico_id === id);
  checar('o extrato traz bruto, taxa e liquido por servico (o complementar soma na linha do servico)',
    ext.status === 200 && linha(idC2) && linha(idC2).bruto === 420 && linha(idC2).com_complementar === true
    && Boolean(linha(idForaPrazo)) && Boolean(linha(idAntigo)));
  checar('em cada linha, bruto - taxa = liquido', e.linhas.every((l) => reais(l.bruto - l.taxa) === l.liquido));
  const soma = (campo) => reais(e.linhas.reduce((t, l) => t + l[campo], 0));
  checar('a soma confere: os totais sao a soma das linhas',
    e.totais.bruto === soma('bruto') && e.totais.taxa === soma('taxa') && e.totais.liquido === soma('liquido')
    && e.totais.servicos === e.linhas.length);
  checar('servico com o valor devolvido na disputa nao aparece como recebido', !linha(idD1));
  checar('os valores retidos aparecem separados e fora dos totais',
    e.retidos.itens.some((x) => x.servico_id === idC1 && x.valor === 200) && !linha(idC1)
    && e.retidos.total === reais(e.retidos.itens.reduce((t, x) => t + x.valor, 0)));

  const ultimaSemana = await chamar(`/prestadores/extrato?de=${dia(new Date(Date.now() - 7 * DIA))}&ate=${dia(new Date())}`, { token: davi.token });
  const so40 = await chamar(`/prestadores/extrato?de=${dia(new Date(Date.now() - 41 * DIA))}&ate=${dia(new Date(Date.now() - 39 * DIA))}`, { token: davi.token });
  checar('o filtro por periodo traz so os repasses daquele periodo',
    ultimaSemana.dados.extrato.linhas.every((l) => l.servico_id !== idAntigo)
    && ultimaSemana.dados.extrato.linhas.some((l) => l.servico_id === idC2)
    && so40.dados.extrato.linhas.length === 1 && so40.dados.extrato.linhas[0].servico_id === idAntigo
    && so40.dados.extrato.totais.liquido === so40.dados.extrato.linhas[0].liquido);
  const invertido = await chamar(`/prestadores/extrato?de=${dia(new Date())}&ate=${dia(new Date(Date.now() - 7 * DIA))}`, { token: davi.token });
  const formato = await chamar('/prestadores/extrato?de=ontem', { token: davi.token });
  checar('periodo invertido ou data em outro formato sao recusados', invertido.status === 400 && formato.status === 400);

  const extEnzo = (await chamar('/prestadores/extrato', { token: enzo.token })).dados.extrato;
  checar('cada prestador ve so o proprio extrato (disputa dividida e multa de cancelamento entram sem taxa)',
    !extEnzo.linhas.some((l) => l.servico_id === idC2)
    && extEnzo.linhas.some((l) => l.servico_id === idExec && l.liquido === 100 && l.taxa === 0)
    && extEnzo.linhas.some((l) => l.servico_id === idC3 && l.liquido === 100 && l.taxa === 0));
  const extCliente = await chamar('/prestadores/extrato', { token: lara.token });
  checar('o extrato e so do prestador', extCliente.status === 403);

  const csv = await fetch(`${base}/prestadores/extrato.csv`, { headers: { Authorization: `Bearer ${davi.token}` } });
  const texto = await csv.text();
  const totalCsv = e.totais.liquido.toFixed(2).replace('.', ',');
  checar('exporta o extrato em CSV, com as linhas, o total e os retidos',
    csv.status === 200 && csv.headers.get('content-type').includes('text/csv') && texto.includes('Líquido (R$)')
    && texto.includes(`"${totalCsv}"`) && texto.includes('TOTAL RETIDO') && texto.split('\r\n').length >= e.linhas.length + 4);
}

module.exports = { testarSprint5 };
