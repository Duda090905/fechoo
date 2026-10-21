/**
 * Criterios de aceite do Sprint 3: US06, US17, US18 e US11.
 * Chamado pelo testes/criterios.js (npm run teste), com a API ja no ar em
 * sqlite e o gateway simulado (sem internet).
 */
const fs = require('fs');
const path = require('path');
const {
  Bairro, Servico, Pagamento, EventoWebhook, AcessoEndereco, Notificacao
} = require('../src/models');
const { expirarCobrancas } = require('../src/servicos/cobrancas');
const { valorDoPix, crcConfere } = require('../src/utils/pix');

const HORA = 60 * 60 * 1000;
const MINUTO = 60 * 1000;

// CPF valido a partir de 9 digitos (digitos verificadores calculados).
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

function contarArquivos(pasta) {
  if (!fs.existsSync(pasta)) return 0;
  let total = 0;
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    total += item.isDirectory() ? contarArquivos(path.join(pasta, item.name)) : 1;
  }
  return total;
}

async function testarSprint3({ chamar, chamarForm, checar, capturarConsole, base, bairro, idsCategorias, terceiro }) {
  process.env.ASAAS_WEBHOOK_TOKEN = 'token-de-teste-do-webhook-0123456789abcdef';
  process.env.PAGAMENTO_GATEWAY = 'simulado';
  const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;

  const guanabara = await Bairro.create({ nome: 'Guanabara', cidade: 'Campinas' });
  const [eletricista] = idsCategorias;
  const T = new Date(Math.ceil((Date.now() + 3 * 24 * HORA) / HORA) * HORA);
  const iso = (data) => data.toISOString();

  const CPF_LIA = cpfDe(301402503);
  const CPF_CAIO = cpfDe(604705806);
  const CPF_DORA = cpfDe(907108209);

  const lia = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: {
      nome: 'Lia Campos', cpf: CPF_LIA, email: 'lia@teste.com', telefone: '19999990000',
      senha: 'senha1234', tipo_perfil: 'contratante', sexo: 'feminino', aceite_termos: true
    }
  });
  const caio = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: {
      nome: 'Caio Mendes', cpf: CPF_CAIO, email: 'caio@teste.com', telefone: '19999990000',
      senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'masculino', aceite_termos: true
    }
  });
  const dora = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: {
      nome: 'Dora Neves', cpf: CPF_DORA, email: 'dora@teste.com', telefone: '19999990000',
      senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'feminino', aceite_termos: true
    }
  });
  const tLia = lia.dados.token;
  const tCaio = caio.dados.token;
  const tDora = dora.dados.token;

  // ---------------------------------------------------------------------
  console.log('\nUS06 - Verificacao de identidade e selo (titularidade da chave Pix)');

  const semPerfil = await chamar('/prestadores/chave-pix', { metodo: 'PUT', token: tDora, corpo: { tipo: 'cpf', chave: CPF_DORA } });
  checar('prestador sem perfil montado e orientado a montar o perfil antes', semPerfil.status === 409);

  await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tCaio, corpo: { descricao: 'Eletricista.', categorias: [eletricista], bairros: [bairro.id] }
  });
  const busca = async () => (await chamar(`/prestadores?categoria=${eletricista}&bairro=${bairro.id}`)).dados.prestadores
    .find((p) => p.nome === 'Caio Mendes');

  checar('antes da conferencia, o prestador aparece na busca sem o selo', (await busca()).verificado === false);

  const outroTitular = await chamar('/prestadores/chave-pix', { metodo: 'PUT', token: tCaio, corpo: { tipo: 'cpf', chave: CPF_LIA } });
  checar('chave Pix cujo titular nao e o CPF do cadastro e recusada',
    outroTitular.status === 422 && outroTitular.dados.motivo === 'titular_diferente');
  checar('o prestador recusado recebe o motivo em linguagem simples',
    typeof outroTitular.dados.erro === 'string' && outroTitular.dados.erro.includes('CPF'));
  checar('recusado, o selo continua sem aparecer', (await busca()).verificado === false);

  const outroTipo = await chamar('/prestadores/chave-pix', { metodo: 'PUT', token: tCaio, corpo: { tipo: 'email', chave: 'caio@teste.com' } });
  checar('chave de outro tipo (e-mail, telefone, aleatoria) e recusada com o motivo', outroTipo.status === 422 && outroTipo.dados.motivo === 'tipo_nao_aceito');

  const chaveInvalida = await chamar('/prestadores/chave-pix', { metodo: 'PUT', token: tCaio, corpo: { tipo: 'cpf', chave: '11111111111' } });
  checar('CPF invalido como chave e recusado', chaveInvalida.status === 400);

  const pastaUploads = process.env.UPLOADS_DIR;
  const arquivosAntes = contarArquivos(pastaUploads);
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const comDocumento = await chamarForm('/prestadores/chave-pix', {
    metodo: 'PUT', token: tCaio, campos: { tipo: 'cpf' }, arquivos: [{ campo: 'documento', bytes: PNG, nome: 'rg.png' }]
  });
  checar('imagem de documento nao e recebida nem armazenada (nada novo no disco)',
    comDocumento.status === 400 && contarArquivos(pastaUploads) === arquivosAntes);

  const contratanteTentando = await chamar('/prestadores/chave-pix', { metodo: 'PUT', token: tLia, corpo: { tipo: 'cpf', chave: CPF_LIA } });
  checar('so prestador cadastra chave Pix', contratanteTentando.status === 403);

  const formatado = `${CPF_CAIO.slice(0, 3)}.${CPF_CAIO.slice(3, 6)}.${CPF_CAIO.slice(6, 9)}-${CPF_CAIO.slice(9)}`;
  const aprovada = await chamar('/prestadores/chave-pix', { metodo: 'PUT', token: tCaio, corpo: { tipo: 'cpf', chave: formatado } });
  checar('depois de recusado, o prestador cadastra de novo e a chave no proprio CPF e aceita',
    aprovada.status === 200 && aprovada.dados.prestador.verificado === true);
  checar('o selo so aparece depois da conferencia aprovada', (await busca()).verificado === true);

  const perfilCaio = await chamar('/prestadores/meu-perfil', { token: tCaio });
  checar('no proprio perfil a chave aparece mascarada, nunca o CPF inteiro',
    perfilCaio.dados.prestador.chave_pix && perfilCaio.dados.prestador.chave_pix.mascarada.includes('*')
    && !JSON.stringify(perfilCaio.dados).includes(CPF_CAIO));
  checar('a busca publica nao mostra a chave Pix de ninguem', !JSON.stringify(await busca()).includes('chave_pix'));

  const trocaRuim = await chamar('/prestadores/chave-pix', { metodo: 'PUT', token: tCaio, corpo: { tipo: 'cpf', chave: CPF_LIA } });
  checar('tentar trocar por uma chave de outra pessoa nao tira o selo ja conquistado',
    trocaRuim.status === 422 && (await busca()).verificado === true);

  // ---------------------------------------------------------------------
  // Pedido e orcamento (Sprint 2) para o fluxo do pagamento.
  async function pedidoComOrcamento(horario, { bairroId = guanabara.id, valor = 150.5, taxa = 30 } = {}) {
    const pedido = await chamar('/servicos', {
      metodo: 'POST', token: tLia,
      corpo: { id_prestador: (await busca()).id, bairro_id: bairroId, descricao: 'Trocar o quadro de luz.', data_hora: iso(horario) }
    });
    const id = pedido.dados.servico.id;
    const corpo = { valor, prazo_horas: 2, data_hora: iso(horario) };
    if (bairroId !== bairro.id) corpo.taxa_deslocamento = taxa;
    await chamar(`/servicos/${id}/orcamento`, { metodo: 'POST', token: tCaio, corpo });
    return id;
  }

  const webhook = (corpo, token = TOKEN) => fetch(`${base}/pagamentos/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'asaas-access-token': token } : {}) },
    body: JSON.stringify(corpo)
  }).then(async (r) => ({ status: r.status, dados: await r.json().catch(() => ({})) }));

  const avisoPago = (pagamento, eventoId, extra = {}) => ({
    id: eventoId,
    event: 'PAYMENT_RECEIVED',
    dateCreated: '2026-10-21 10:00:00',
    payment: {
      object: 'payment', id: pagamento.cobranca_id, value: Number(pagamento.valor),
      externalReference: pagamento.identificador, billingType: 'PIX', status: 'RECEIVED', ...extra
    }
  });

  const idServico = await pedidoComOrcamento(T);

  // ---------------------------------------------------------------------
  console.log('\nUS11 - Aceite do orcamento e liberacao do endereco (antes do aceite)');

  const antesPrestador = await chamar(`/servicos/${idServico}`, { token: tCaio });
  const listaAntes = await chamar('/servicos', { token: tCaio });
  checar('antes do aceite, a consulta ao servico nao traz o endereco do contratante',
    antesPrestador.status === 200 && !('endereco' in antesPrestador.dados.servico)
    && !JSON.stringify(listaAntes.dados).includes('endereco"'));

  const prestadorAceitando = await chamar(`/servicos/${idServico}/aceitar`, { metodo: 'POST', token: tCaio, corpo: { endereco: 'Rua A, 10' } });
  checar('so o contratante aceita o orcamento', prestadorAceitando.status === 403);
  const terceiroAceitando = await chamar(`/servicos/${idServico}/aceitar`, { metodo: 'POST', token: terceiro.token, corpo: { endereco: 'Rua A, 10' } });
  checar('um terceiro nem enxerga o servico para aceitar', terceiroAceitando.status === 404);

  const semEndereco = await chamar(`/servicos/${idServico}/aceitar`, { metodo: 'POST', token: tLia, corpo: { endereco: '  ' } });
  checar('aceitar exige o endereco do atendimento', semEndereco.status === 400);

  // ---------------------------------------------------------------------
  console.log('\nUS17 - Pagamento retido via Pix');

  const ENDERECO = 'Rua Barata Ribeiro, 152, apto 31';
  const aceite = await chamar(`/servicos/${idServico}/aceitar`, { metodo: 'POST', token: tLia, corpo: { endereco: ENDERECO } });
  const pix = aceite.dados.servico && aceite.dados.servico.pagamento;
  checar('o aceite gera a cobranca Pix com copia e cola (e QR code quando o gateway e o Asaas)',
    aceite.status === 201 && pix && pix.pix && typeof pix.pix.copia_cola === 'string' && crcConfere(pix.pix.copia_cola));
  checar('o Pix e gerado com exatamente o valor do orcamento aceito (servico + deslocamento)',
    pix.valor === 180.5 && valorDoPix(pix.pix.copia_cola) === 180.5);
  checar('enquanto o pagamento nao e confirmado, o status permanece Aguardando (e o servico ainda nao e Aceito)',
    pix.status === 'aguardando' && aceite.dados.servico.status === 'orcamento_enviado');

  const pagamentoBanco = await Pagamento.findOne({ where: { servico_id: idServico } });
  checar('o identificador da cobranca corresponde ao servico correto',
    pagamentoBanco.servico_id === idServico && pix.identificador === pagamentoBanco.identificador
    && pagamentoBanco.identificador.startsWith(`fecho-s${idServico}-`)
    && valorDoPix(pagamentoBanco.pix_copia_cola) === 180.5);

  const cliqueDuplo = await chamar(`/servicos/${idServico}/aceitar`, { metodo: 'POST', token: tLia, corpo: { endereco: ENDERECO } });
  checar('clicar em aceitar de novo devolve o mesmo Pix, sem cobrar duas vezes',
    cliqueDuplo.status === 200 && cliqueDuplo.dados.servico.pagamento.identificador === pix.identificador
    && (await Pagamento.count({ where: { servico_id: idServico } })) === 1);

  const vistoPeloPrestador = await chamar(`/servicos/${idServico}`, { token: tCaio });
  checar('o prestador ve que o pagamento esta Aguardando, mas nao recebe o Pix nem o endereco',
    vistoPeloPrestador.dados.servico.pagamento.status === 'aguardando'
    && !vistoPeloPrestador.dados.servico.pagamento.pix && !('endereco' in vistoPeloPrestador.dados.servico));

  // ---------------------------------------------------------------------
  console.log('\nUS18 - Confirmacao automatica do pagamento (webhook)');

  const eventosAntes = await EventoWebhook.count();
  const semToken = await webhook(avisoPago(pagamentoBanco, 'evt_teste_sem_token'), null);
  const tokenErrado = await webhook(avisoPago(pagamentoBanco, 'evt_teste_token_errado'), 'token-falso');
  await pagamentoBanco.reload();
  checar('requisicao sem token ou com token invalido e rejeitada com erro de autorizacao (401)',
    semToken.status === 401 && tokenErrado.status === 401);
  checar('aviso rejeitado nao muda nada nem fica registrado',
    pagamentoBanco.status === 'aguardando' && (await EventoWebhook.count()) === eventosAntes);

  const incompleto = await webhook({ event: 'PAYMENT_RECEIVED' });
  checar('aviso sem id do evento e recusado', incompleto.status === 400);

  const valorErrado = await webhook(avisoPago(pagamentoBanco, 'evt_teste_valor_errado', { value: 10 }));
  await pagamentoBanco.reload();
  checar('aviso com valor diferente do cobrado nao congela o pagamento',
    valorErrado.status === 200 && valorErrado.dados.resultado === 'valor_nao_confere' && pagamentoBanco.status === 'aguardando');

  const desconhecida = await webhook({ id: 'evt_teste_desconhecida', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_nao_existe', value: 1 } });
  checar('aviso de cobranca que nao e do Fechô e recebido (200) e ignorado',
    desconhecida.status === 200 && desconhecida.dados.resultado === 'cobranca_desconhecida');

  const { resultado: valido, linhas: emails } = await capturarConsole(() => webhook(avisoPago(pagamentoBanco, 'evt_teste_pago_1')));
  await pagamentoBanco.reload();
  const servicoBanco = await Servico.findByPk(idServico);
  checar('webhook valido altera o status do pagamento para Retido',
    valido.status === 200 && valido.dados.resultado === 'pagamento_retido' && pagamentoBanco.status === 'retido');
  checar('o servico passa para Aceito (e nao para Pago: Pago so depois da confirmacao e do repasse, US20)',
    servicoBanco.status === 'aceito' && Boolean(servicoBanco.aceito_em));

  const avisoCaio = await Notificacao.findOne({ where: { servico_id: idServico, tipo: 'pagamento_garantido' } });
  checar('o prestador recebe o aviso de pagamento garantido (no app e por e-mail)',
    avisoCaio && avisoCaio.usuario_id === caio.dados.usuario.id
    && emails.some((l) => l.includes('caio@teste.com')) && emails.some((l) => l.includes('Pagamento garantido')));
  checar('o contratante tambem e avisado (notificacao para as duas partes)',
    (await Notificacao.count({ where: { servico_id: idServico, usuario_id: lia.dados.usuario.id } })) === 1
    && emails.some((l) => l.includes('lia@teste.com')));
  checar('o e-mail do aviso nao leva o endereco', !emails.some((l) => l.includes('Barata Ribeiro')));

  const eventosDepois = await EventoWebhook.count();
  const notificacoesDepois = await Notificacao.count();
  const { resultado: repetido, linhas: emailsRepetidos } = await capturarConsole(() => webhook(avisoPago(pagamentoBanco, 'evt_teste_pago_1')));
  checar('webhook enviado duas vezes nao duplica registro nem notificacao',
    repetido.status === 200 && repetido.dados.resultado === 'duplicado'
    && (await EventoWebhook.count()) === eventosDepois && (await Notificacao.count()) === notificacoesDepois
    && !emailsRepetidos.some((l) => l.includes('[aviso]')));

  const outroEvento = await webhook({ ...avisoPago(pagamentoBanco, 'evt_teste_confirmado'), event: 'PAYMENT_CONFIRMED' });
  checar('outro aviso do mesmo pagamento (evento diferente) tambem nao repete nada',
    outroEvento.dados.resultado === 'ja_processado' && (await Notificacao.count()) === notificacoesDepois);

  const avisosCaio = await chamar('/notificacoes', { token: tCaio });
  const avisosTerceiro = await chamar('/notificacoes', { token: terceiro.token });
  checar('cada um ve so os proprios avisos',
    avisosCaio.dados.notificacoes.some((n) => n.servico_id === idServico && n.tipo === 'pagamento_garantido')
    && !avisosTerceiro.dados.notificacoes.some((n) => n.servico_id === idServico));
  await chamar('/notificacoes/lidas', { metodo: 'POST', token: tCaio });
  checar('os avisos podem ser marcados como lidos',
    (await chamar('/notificacoes', { token: tCaio })).dados.notificacoes.every((n) => n.lida));

  // ---------------------------------------------------------------------
  console.log('\nUS11 - Aceite do orcamento e liberacao do endereco (depois do aceite)');

  const logsAntes = await AcessoEndereco.count({ where: { servico_id: idServico } });
  const depoisPrestador = await chamar(`/servicos/${idServico}`, { token: tCaio });
  checar('apos o aceite, o prestador visualiza o endereco completo',
    depoisPrestador.dados.servico.endereco && depoisPrestador.dados.servico.endereco.logradouro === ENDERECO
    && depoisPrestador.dados.servico.endereco.bairro === 'Guanabara');
  const log = await AcessoEndereco.findAll({ where: { servico_id: idServico }, order: [['id', 'DESC']] });
  checar('o acesso ao endereco fica registrado em log (quem, de que lado e quando)',
    log.length === logsAntes + 1 && log[0].usuario_id === caio.dados.usuario.id && log[0].papel === 'prestador'
    && Boolean(log[0].acessado_em));
  const listaDepois = await chamar('/servicos', { token: tCaio });
  checar('o endereco so sai no detalhe do servico (a lista e a agenda nao entregam)',
    !JSON.stringify(listaDepois.dados).includes('Barata Ribeiro')
    && !JSON.stringify((await chamar('/servicos/agenda', { token: tCaio })).dados).includes('Barata Ribeiro'));
  const terceiroDepois = await chamar(`/servicos/${idServico}`, { token: terceiro.token });
  checar('um terceiro continua sem acesso ao servico e ao endereco', terceiroDepois.status === 404);
  const agendaCaio = await chamar('/servicos/agenda', { token: tCaio });
  checar('com o aceite, o compromisso entra na agenda (US13)', agendaCaio.dados.compromissos.some((c) => c.id === idServico));

  // ---------------------------------------------------------------------
  console.log('\nUS17 - Cobranca expirada');

  const idExpira = await pedidoComOrcamento(new Date(T.getTime() + 5 * HORA));
  const aceiteExpira = await chamar(`/servicos/${idExpira}/aceitar`, { metodo: 'POST', token: tLia, corpo: { endereco: ENDERECO } });
  const primeiro = await Pagamento.findOne({ where: { servico_id: idExpira } });
  const minutos = Number(process.env.PIX_EXPIRA_MINUTOS || 30);
  await expirarCobrancas(new Date(Date.now() + (minutos + 1) * MINUTO));
  const depoisExpirar = await chamar(`/servicos/${idExpira}`, { token: tLia });
  checar('cobranca expirada devolve o servico ao status anterior (Orçamento enviado), sem o Pix',
    aceiteExpira.status === 201 && depoisExpirar.dados.servico.status === 'orcamento_enviado'
    && depoisExpirar.dados.servico.pagamento.expirado === true && !depoisExpirar.dados.servico.pagamento.pix);
  const novoAceite = await chamar(`/servicos/${idExpira}/aceitar`, { metodo: 'POST', token: tLia, corpo: { endereco: ENDERECO } });
  checar('depois de expirar, o contratante pode aceitar de novo e recebe um Pix novo',
    novoAceite.status === 201 && novoAceite.dados.servico.pagamento.identificador !== primeiro.identificador
    && (await Pagamento.count({ where: { servico_id: idExpira } })) === 2);

  const { resultado: atrasado } = await capturarConsole(() => webhook(avisoPago(primeiro, 'evt_teste_pago_atrasado')));
  const segundo = await Pagamento.findOne({ where: { servico_id: idExpira }, order: [['id', 'DESC']] });
  checar('Pix pago no ultimo instante (ja vencido) vale e o Pix novo deixa de valer, para nao cobrar duas vezes',
    atrasado.dados.resultado === 'pagamento_retido_fora_do_prazo'
    && (await Servico.findByPk(idExpira)).status === 'aceito' && Boolean(segundo.expirado_em));

  // ---------------------------------------------------------------------
  console.log('\nUS17 - Recusar com Pix em aberto');

  const idRecusa = await pedidoComOrcamento(new Date(T.getTime() + 10 * HORA));
  await chamar(`/servicos/${idRecusa}/aceitar`, { metodo: 'POST', token: tLia, corpo: { endereco: ENDERECO } });
  const pagamentoRecusa = await Pagamento.findOne({ where: { servico_id: idRecusa } });
  const recusa = await chamar(`/servicos/${idRecusa}/recusar`, { metodo: 'POST', token: tLia });
  await pagamentoRecusa.reload();
  checar('recusar o orcamento cancela o Pix que estava esperando pagamento',
    recusa.status === 200 && Boolean(pagamentoRecusa.expirado_em));
  const pagoDepoisDeRecusar = await webhook(avisoPago(pagamentoRecusa, 'evt_teste_pago_recusado'));
  checar('Pix pago depois da recusa nao reabre o servico (fica registrado para devolucao)',
    pagoDepoisDeRecusar.dados.resultado === 'servico_fora_do_fluxo' && (await Servico.findByPk(idRecusa)).status === 'recusado');

  return { tLia, tCaio, idServico };
}

module.exports = { testarSprint3 };
