/**
 * Criterios de aceite do Sprint 4: US20, US21, US15, US14, US24 e US16.
 * Chamado pelo testes/criterios.js (npm run teste), com a API ja no ar em
 * sqlite e o gateway simulado (sem internet).
 *
 * Onde o criterio depende do relogio (72 horas, 24 horas, 7 dias), o teste
 * chama a rotina com um "agora" no futuro ou ajusta a data no banco - o mesmo
 * que aconteceria com o passar do tempo.
 */
const {
  Bairro, Categoria, Servico, Pagamento, Usuario, Avaliacao, Prestador, Reagendamento
} = require('../src/models');
const { processarConclusoes } = require('../src/servicos/repasse');
const { percentualPara } = require('../src/servicos/taxa');

const HORA = 60 * 60 * 1000;
const MINUTO = 60 * 1000;
const DIA = 24 * HORA;

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

async function testarSprint4({ chamar, checar, base, bairro, idsCategorias, terceiro, sprint3 }) {
  const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;
  const [eletricista, encanador] = idsCategorias;
  const iso = (data) => data.toISOString();
  const taquaral = await Bairro.create({ nome: 'Taquaral', cidade: 'Campinas' });

  // Horarios distantes de tudo o que os sprints anteriores agendaram.
  let proximoHorario = Math.ceil((Date.now() + 20 * DIA) / HORA) * HORA;
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

  async function prestadorPronto(nome, base9, email, { comChave = true, categorias = [eletricista] } = {}) {
    const p = await cadastrar(nome, base9, email, 'prestador', 'masculino');
    await chamar('/prestadores/meu-perfil', {
      metodo: 'PUT', token: p.token, corpo: { descricao: 'Profissional.', categorias, bairros: [bairro.id] }
    });
    if (comChave) await chamar('/prestadores/chave-pix', { metodo: 'PUT', token: p.token, corpo: { tipo: 'cpf', chave: p.cpf } });
    p.prestador = await Prestador.findOne({ where: { usuario_id: p.usuario.id } });
    return p;
  }

  const webhook = (corpo) => fetch(`${base}/pagamentos/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'asaas-access-token': TOKEN },
    body: JSON.stringify(corpo)
  }).then(async (r) => ({ status: r.status, dados: await r.json().catch(() => ({})) }));

  // Pedido -> orcamento -> aceite -> Pix pago (webhook). Devolve o id.
  async function servicoPago(cliente, prest, {
    horario = novoHorario(), valor = 200, taxa = 0, bairroId = bairro.id, categoriaId = eletricista
  } = {}) {
    const pedido = await chamar('/servicos', {
      metodo: 'POST', token: cliente.token,
      corpo: { id_prestador: prest.prestador.id, bairro_id: bairroId, descricao: 'Trocar tomadas.', data_hora: iso(horario), categoria_id: categoriaId }
    });
    if (!pedido.dados.servico) throw new Error(`pedido recusado: ${pedido.status} ${JSON.stringify(pedido.dados)}`);
    const id = pedido.dados.servico.id;
    const orcamento = { valor, prazo_horas: 2, data_hora: iso(horario) };
    if (bairroId !== bairro.id) orcamento.taxa_deslocamento = taxa;
    await chamar(`/servicos/${id}/orcamento`, { metodo: 'POST', token: prest.token, corpo: orcamento });
    await chamar(`/servicos/${id}/aceitar`, { metodo: 'POST', token: cliente.token, corpo: { endereco: 'Rua das Flores, 100' } });
    const pagamento = await Pagamento.findOne({ where: { servico_id: id }, order: [['id', 'DESC']] });
    await webhook({
      id: `evt_s4_${id}_${pagamento.id}`,
      event: 'PAYMENT_RECEIVED',
      payment: { id: pagamento.cobranca_id, value: Number(pagamento.valor), externalReference: pagamento.identificador }
    });
    return id;
  }

  // Traz o horario combinado para perto de agora (o prestador so inicia a
  // partir de 1 hora antes).
  const trazerPara = (id, minutos) => Servico.update(
    { data_hora_proposta: new Date(Date.now() + minutos * MINUTO) }, { where: { id } }
  );
  const detalhe = async (id, token) => (await chamar(`/servicos/${id}`, { token })).dados.servico;
  const pagamentoDe = (id) => Pagamento.findOne({ where: { servico_id: id }, order: [['id', 'DESC']] });

  const bia = await cadastrar('Bia Torres', 112233445, 'bia.s4@teste.com', 'contratante');
  const caio = { token: sprint3.tCaio, prestador: await Prestador.findOne({ include: [{ model: Usuario, as: 'usuario', where: { email: 'caio@teste.com' } }] }) };

  // =====================================================================
  console.log('\nUS20 - Conclusao do servico e repasse');

  const idUm = await servicoPago(bia, caio, { valor: 200, taxa: 20, bairroId: taquaral.id });
  checar('preparacao: o servico pago com deslocamento esta Aceito', (await Servico.findByPk(idUm)).status === 'aceito');

  const cedo = await chamar(`/servicos/${idUm}/iniciar`, { metodo: 'POST', token: caio.token });
  checar('o prestador so inicia a partir de 1 hora antes do horario combinado', cedo.status === 409);
  await trazerPara(idUm, 30);
  const clienteIniciando = await chamar(`/servicos/${idUm}/iniciar`, { metodo: 'POST', token: bia.token });
  checar('so o prestador move o servico para Em execucao', clienteIniciando.status === 403);
  const concluirAntes = await chamar(`/servicos/${idUm}/concluir`, { metodo: 'POST', token: caio.token });
  checar('nao da para concluir sem iniciar', concluirAntes.status === 409);
  const iniciado = await chamar(`/servicos/${idUm}/iniciar`, { metodo: 'POST', token: caio.token });
  checar('o prestador inicia: o servico vai para Em execucao', iniciado.status === 200 && iniciado.dados.servico.status === 'em_execucao');

  const clienteConcluindo = await chamar(`/servicos/${idUm}/concluir`, { metodo: 'POST', token: bia.token });
  checar('so o prestador marca como Concluido', clienteConcluindo.status === 403);
  const concluido = await chamar(`/servicos/${idUm}/concluir`, { metodo: 'POST', token: caio.token });
  const prazo = new Date(concluido.dados.servico.prazo_confirmacao).getTime() - new Date(concluido.dados.servico.concluido_em).getTime();
  checar('o prestador marca Concluido e o contratante ganha 72 horas para confirmar',
    concluido.status === 200 && concluido.dados.servico.status === 'concluido' && prazo === 72 * HORA);

  const prestadorLiberando = await chamar(`/servicos/${idUm}/confirmar`, { metodo: 'POST', token: caio.token });
  checar('o prestador nao consegue liberar o proprio pagamento sozinho',
    prestadorLiberando.status === 403 && (await pagamentoDe(idUm)).status === 'retido');
  const terceiroLiberando = await chamar(`/servicos/${idUm}/confirmar`, { metodo: 'POST', token: terceiro.token });
  checar('um terceiro nem enxerga o servico para confirmar', terceiroLiberando.status === 404);

  const confirmado = await chamar(`/servicos/${idUm}/confirmar`, { metodo: 'POST', token: bia.token });
  const pagUm = await pagamentoDe(idUm);
  // Total 220 (200 + 20 de deslocamento). Taxa: 8% de 200 = 16. Liquido: 220 - 16 = 204.
  checar('a confirmacao libera o valor descontada a taxa vigente (8% de R$ 200 = R$ 16; recebe R$ 204 de R$ 220)',
    confirmado.status === 200 && confirmado.dados.servico.status === 'pago'
    && pagUm.status === 'liberado' && Number(pagUm.taxa_valor) === 16 && Number(pagUm.valor_repasse) === 204
    && Boolean(pagUm.repasse_id));
  checar('a taxa vale so sobre o servico: o deslocamento vai inteiro para o prestador',
    Number(pagUm.valor) === 220 && Number(pagUm.valor_repasse) === 220 - 200 * 0.08);
  const vistoPrestador = await detalhe(idUm, caio.token);
  checar('o valor da taxa fica registrado e consultavel por servico',
    vistoPrestador.pagamento.repasse.taxa_percentual === 8 && vistoPrestador.pagamento.repasse.taxa === 16
    && vistoPrestador.pagamento.repasse.valor === 204);
  const vistoCliente = await detalhe(idUm, bia.token);
  checar('a taxa do prestador nao aparece para o cliente', vistoCliente.pagamento.repasse === undefined);
  const deNovo = await chamar(`/servicos/${idUm}/confirmar`, { metodo: 'POST', token: bia.token });
  checar('confirmar de novo nao repete o repasse', deNovo.status === 409);
  checar('cada passo fica no historico do servico (quem e quando)',
    ['inicio', 'conclusao', 'confirmacao', 'repasse'].every((a) => vistoCliente.historico.some((h) => h.acao === a)));
  const chatFechado = await chamar(`/servicos/${idUm}/mensagens`, { metodo: 'POST', token: bia.token, corpo: { texto: 'oi' } });
  checar('depois da conclusao o chat para de receber mensagens (US12)', chatFechado.status === 409);

  // Confirmacao automatica: ninguem responde em 72 horas.
  const idAuto = await servicoPago(bia, caio, { valor: 100 });
  await trazerPara(idAuto, 10);
  await chamar(`/servicos/${idAuto}/iniciar`, { metodo: 'POST', token: caio.token });
  await chamar(`/servicos/${idAuto}/concluir`, { metodo: 'POST', token: caio.token });
  const agora = Date.now();
  await processarConclusoes(new Date(agora + 71 * HORA));
  checar('antes das 72 horas, o servico continua esperando a confirmacao', (await Servico.findByPk(idAuto)).status === 'concluido');
  await processarConclusoes(new Date(agora + 73 * HORA));
  const auto = await Servico.findByPk(idAuto);
  checar('sem confirmacao dentro do prazo, o valor e liberado automaticamente',
    auto.status === 'pago' && auto.confirmacao_automatica === true && (await pagamentoDe(idAuto)).status === 'liberado');

  // Prestador sem chave Pix: o repasse espera a chave.
  const edu = await prestadorPronto('Edu Prado', 223344556, 'edu.s4@teste.com', { comChave: false });
  const idEdu = await servicoPago(bia, edu, { valor: 150 });
  await trazerPara(idEdu, 10);
  await chamar(`/servicos/${idEdu}/iniciar`, { metodo: 'POST', token: edu.token });
  await chamar(`/servicos/${idEdu}/concluir`, { metodo: 'POST', token: edu.token });
  const semChave = await chamar(`/servicos/${idEdu}/confirmar`, { metodo: 'POST', token: bia.token });
  const pagEdu = await pagamentoDe(idEdu);
  checar('sem chave Pix conferida (CPF do cadastro), o repasse fica pendente e o dinheiro continua congelado',
    semChave.status === 200 && semChave.dados.servico.status === 'confirmado'
    && pagEdu.status === 'retido' && pagEdu.repasse_pendente === 'sem_chave_pix');
  await chamar('/prestadores/chave-pix', { metodo: 'PUT', token: edu.token, corpo: { tipo: 'cpf', chave: edu.cpf } });
  checar('ao cadastrar a chave no proprio CPF, o repasse pendente sai na hora',
    (await Servico.findByPk(idEdu)).status === 'pago' && (await pagamentoDe(idEdu)).status === 'liberado');

  // =====================================================================
  console.log('\nUS21 - Taxa decrescente por volume');

  checar('faixas: 8% ate o 20o servico, 6% do 21o ao 50o, 5% do 51o em diante',
    percentualPara(0) === 8 && percentualPara(19) === 8 && percentualPara(20) === 6
    && percentualPara(49) === 6 && percentualPara(50) === 5);

  const fabio = await prestadorPronto('Fabio Rocha', 334455667, 'fabio.s4@teste.com');
  const perfilNovo = (await chamar('/prestadores/meu-perfil', { token: fabio.token })).dados.prestador.taxa;
  checar('o painel mostra a faixa atual e a proxima (novo: 8%, 6% a partir do 21o, faltam 20)',
    perfilNovo.percentual === 8 && perfilNovo.proxima.percentual === 6
    && perfilNovo.proxima.a_partir_do_servico === 21 && perfilNovo.proxima.faltam === 20);

  const antigos = (quantos, status) => Array.from({ length: quantos }, (_, i) => ({
    id_contratante: bia.usuario.id, id_prestador: fabio.prestador.id, bairro_id: bairro.id, descricao: `Antigo ${i}`,
    fotos: [], data_hora_solicitada: new Date(Date.now() - (30 + i) * DIA), valor: 50, prazo_horas: 1, status
  }));
  await Servico.bulkCreate([...antigos(19, 'pago'), ...antigos(2, 'cancelado'), ...antigos(1, 'em_disputa')]);
  const perfil19 = (await chamar('/prestadores/meu-perfil', { token: fabio.token })).dados.prestador.taxa;
  checar('servicos cancelados ou em disputa nao contam para o total',
    perfil19.servicos_concluidos === 19 && perfil19.percentual === 8);

  const idVinte = await servicoPago(bia, fabio, { valor: 100 });
  await trazerPara(idVinte, 10);
  await chamar(`/servicos/${idVinte}/iniciar`, { metodo: 'POST', token: fabio.token });
  await chamar(`/servicos/${idVinte}/concluir`, { metodo: 'POST', token: fabio.token });
  await chamar(`/servicos/${idVinte}/confirmar`, { metodo: 'POST', token: bia.token });
  checar('o 20o servico concluido ainda paga 8%', Number((await pagamentoDe(idVinte)).taxa_percentual) === 8);

  const idVinteUm = await servicoPago(bia, fabio, { valor: 100 });
  await trazerPara(idVinteUm, 10);
  await chamar(`/servicos/${idVinteUm}/iniciar`, { metodo: 'POST', token: fabio.token });
  await chamar(`/servicos/${idVinteUm}/concluir`, { metodo: 'POST', token: fabio.token });
  await chamar(`/servicos/${idVinteUm}/confirmar`, { metodo: 'POST', token: bia.token });
  const pag21 = await pagamentoDe(idVinteUm);
  checar('o 21o servico concluido ja e cobrado a 6% (R$ 6 de R$ 100; recebe R$ 94)',
    Number(pag21.taxa_percentual) === 6 && Number(pag21.taxa_valor) === 6 && Number(pag21.valor_repasse) === 94);
  const perfil21 = (await chamar('/prestadores/meu-perfil', { token: fabio.token })).dados.prestador.taxa;
  checar('o painel mostra corretamente a faixa atual e a proxima (6%; 5% a partir do 51o, faltam 29)',
    perfil21.percentual === 6 && perfil21.servicos_concluidos === 21
    && perfil21.proxima.percentual === 5 && perfil21.proxima.faltam === 29);
  checar('a taxa aplicada fica registrada em cada transacao',
    Number((await pagamentoDe(idVinte)).taxa_valor) === 8 && Number(pag21.taxa_valor) === 6);

  // =====================================================================
  console.log('\nUS15 - Cancelamento e estorno');

  const idMais24 = await servicoPago(bia, caio, { valor: 300 });
  const previa = await chamar(`/servicos/${idMais24}/cancelamento`, { token: bia.token });
  checar('antes de cancelar, o sistema informa quanto cada um recebe',
    previa.dados.pode_cancelar === true && previa.dados.regra === 'mais_de_24h'
    && previa.dados.valor_contratante === 300 && previa.dados.valor_prestador === 0);
  const semMotivo = await chamar(`/servicos/${idMais24}/cancelar`, { metodo: 'POST', token: bia.token, corpo: {} });
  checar('o cancelamento exige o motivo', semMotivo.status === 400);
  const terceiroCancelando = await chamar(`/servicos/${idMais24}/cancelar`, { metodo: 'POST', token: terceiro.token, corpo: { motivo: 'teste' } });
  checar('um terceiro nao cancela o servico de outra pessoa', terceiroCancelando.status === 404);
  const canceladoMais24 = await chamar(`/servicos/${idMais24}/cancelar`, { metodo: 'POST', token: bia.token, corpo: { motivo: 'Mudei de planos' } });
  const pagMais24 = await pagamentoDe(idMais24);
  checar('cancelamento dentro do prazo (mais de 24 horas) gera estorno integral',
    canceladoMais24.status === 200 && pagMais24.status === 'estornado'
    && Number(pagMais24.valor_estorno) === 300 && Number(pagMais24.valor_repasse) === 0 && Boolean(pagMais24.estorno_id));
  checar('o cancelamento registra o motivo e quem cancelou',
    canceladoMais24.dados.servico.status === 'cancelado' && canceladoMais24.dados.servico.cancelamento.por === 'contratante'
    && canceladoMais24.dados.servico.cancelamento.motivo === 'Mudei de planos');

  const idMenos24 = await servicoPago(bia, caio, { valor: 200 });
  await trazerPara(idMenos24, 5 * 60);
  const previaMenos = await chamar(`/servicos/${idMenos24}/cancelamento`, { token: bia.token });
  checar('fora do prazo (menos de 24 horas), o sistema aplica a regra e informa o valor (70% = R$ 140 / 30% = R$ 60)',
    previaMenos.dados.regra === 'menos_de_24h' && previaMenos.dados.valor_contratante === 140 && previaMenos.dados.valor_prestador === 60);
  await chamar(`/servicos/${idMenos24}/cancelar`, { metodo: 'POST', token: bia.token, corpo: { motivo: 'Imprevisto' } });
  const pagMenos = await pagamentoDe(idMenos24);
  checar('com menos de 24 horas, 70% volta ao cliente e 30% vai ao prestador, sem taxa',
    Number(pagMenos.valor_estorno) === 140 && Number(pagMenos.valor_repasse) === 60
    && Number(pagMenos.taxa_valor) === 0 && Boolean(pagMenos.repasse_id));

  const idLocal = await servicoPago(bia, caio, { valor: 200 });
  const chegouCedo = await chamar(`/servicos/${idLocal}/cheguei`, { metodo: 'POST', token: caio.token });
  checar('o "Cheguei" so vale a partir de 1 hora antes do horario', chegouCedo.status === 409);
  await trazerPara(idLocal, 20);
  const clienteChegou = await chamar(`/servicos/${idLocal}/cheguei`, { metodo: 'POST', token: bia.token });
  checar('so o prestador avisa que chegou', clienteChegou.status === 403);
  await chamar(`/servicos/${idLocal}/cheguei`, { metodo: 'POST', token: caio.token });
  const previaLocal = await chamar(`/servicos/${idLocal}/cancelamento`, { token: bia.token });
  await chamar(`/servicos/${idLocal}/cancelar`, { metodo: 'POST', token: bia.token, corpo: { motivo: 'Desisti' } });
  const pagLocal = await pagamentoDe(idLocal);
  checar('com o prestador no local, o valor e dividido 50% / 50%',
    previaLocal.dados.regra === 'prestador_no_local' && Number(pagLocal.valor_estorno) === 100 && Number(pagLocal.valor_repasse) === 100);

  const idPrest = await servicoPago(bia, caio, { valor: 120 });
  await trazerPara(idPrest, 2 * 60);
  await chamar(`/servicos/${idPrest}/cancelar`, { metodo: 'POST', token: caio.token, corpo: { motivo: 'Fiquei doente' } });
  const pagPrest = await pagamentoDe(idPrest);
  checar('quando o prestador cancela, o cliente recebe 100% de volta',
    Number(pagPrest.valor_estorno) === 120 && Number(pagPrest.valor_repasse) === 0);

  const idExec = await servicoPago(bia, caio, { valor: 80 });
  await trazerPara(idExec, 10);
  await chamar(`/servicos/${idExec}/iniciar`, { metodo: 'POST', token: caio.token });
  const cancelaExec = await chamar(`/servicos/${idExec}/cancelar`, { metodo: 'POST', token: bia.token, corpo: { motivo: 'Nao gostei' } });
  checar('com o servico em execucao nao existe cancelamento (so disputa)',
    cancelaExec.status === 409 && cancelaExec.dados.erro.includes('disputa'));
  const cancelaPago = await chamar(`/servicos/${idUm}/cancelar`, { metodo: 'POST', token: bia.token, corpo: { motivo: 'Tarde demais' } });
  checar('servico ja concluido nao pode ser cancelado', cancelaPago.status === 409 && (await Servico.findByPk(idUm)).status === 'pago');

  const pedidoSemPix = await chamar('/servicos', {
    metodo: 'POST', token: bia.token,
    corpo: { id_prestador: caio.prestador.id, bairro_id: bairro.id, descricao: 'So um pedido.', data_hora: iso(novoHorario()) }
  });
  const cancelaPedido = await chamar(`/servicos/${pedidoSemPix.dados.servico.id}/cancelar`, { metodo: 'POST', token: bia.token, corpo: { motivo: 'Resolvi sozinha' } });
  checar('pedido ainda sem pagamento e so encerrado, sem estorno',
    cancelaPedido.status === 200 && cancelaPedido.dados.cancelamento.regra === 'sem_pagamento');

  const contaBia = await chamar('/conta', { token: bia.token });
  const contaCaio = await chamar('/conta', { token: caio.token });
  checar('os cancelamentos ficam contados no historico de quem cancelou',
    contaBia.dados.usuario.cancelamentos === 4 && contaCaio.dados.usuario.cancelamentos === 1);

  // =====================================================================
  console.log('\nUS14 - Reagendamento');

  const idReag = await servicoPago(bia, caio, { valor: 150 });
  const dataOriginal = new Date((await Servico.findByPk(idReag)).data_hora_proposta).getTime();
  const nova = novoHorario();
  const passado = await chamar(`/servicos/${idReag}/reagendamentos`, { metodo: 'POST', token: caio.token, corpo: { data_hora: iso(new Date(Date.now() - HORA)) } });
  checar('nova data no passado e recusada', passado.status === 400);
  const proposta = await chamar(`/servicos/${idReag}/reagendamentos`, { metodo: 'POST', token: caio.token, corpo: { data_hora: iso(nova), motivo: 'Chuva forte' } });
  checar('o prestador propoe uma nova data', proposta.status === 201);
  checar('o reagendamento so vale depois do aceite da outra parte (a data nao muda antes)',
    new Date((await Servico.findByPk(idReag)).data_hora_proposta).getTime() === dataOriginal);
  checar('o valor permanece retido enquanto o reagendamento esta em analise', (await pagamentoDe(idReag)).status === 'retido');
  const outraProposta = await chamar(`/servicos/${idReag}/reagendamentos`, { metodo: 'POST', token: bia.token, corpo: { data_hora: iso(novoHorario()) } });
  checar('so uma nova data esperando resposta por vez', outraProposta.status === 409);
  const rid = proposta.dados.reagendamento.id;
  const proprio = await chamar(`/servicos/${idReag}/reagendamentos/${rid}/responder`, { metodo: 'POST', token: caio.token, corpo: { aceitar: true } });
  checar('quem propos nao aceita a propria proposta', proprio.status === 403);
  const terceiroResponde = await chamar(`/servicos/${idReag}/reagendamentos/${rid}/responder`, { metodo: 'POST', token: terceiro.token, corpo: { aceitar: true } });
  checar('um terceiro nao responde', terceiroResponde.status === 404);
  const aceita = await chamar(`/servicos/${idReag}/reagendamentos/${rid}/responder`, { metodo: 'POST', token: bia.token, corpo: { aceitar: true } });
  checar('depois do aceite da outra parte, a data muda',
    aceita.status === 200 && new Date((await Servico.findByPk(idReag)).data_hora_proposta).getTime() === nova.getTime());
  checar('o valor continua retido depois do reagendamento', (await pagamentoDe(idReag)).status === 'retido');
  const vistoReag = await detalhe(idReag, bia.token);
  const registro = vistoReag.reagendamentos.find((r) => r.id === rid);
  checar('o historico do servico registra quem propos e quando',
    registro && registro.papel === 'prestador' && Boolean(registro.proposto_em) && registro.status === 'aceito'
    && vistoReag.historico.some((h) => h.acao === 'reagendamento_proposto' && h.quem === 'Caio Mendes'));

  const dataAtual = new Date((await Servico.findByPk(idReag)).data_hora_proposta).getTime();
  const recusavel = await chamar(`/servicos/${idReag}/reagendamentos`, { metodo: 'POST', token: bia.token, corpo: { data_hora: iso(novoHorario()) } });
  checar('o contratante tambem pode propor nova data', recusavel.status === 201);
  await chamar(`/servicos/${idReag}/reagendamentos/${recusavel.dados.reagendamento.id}/responder`, { metodo: 'POST', token: caio.token, corpo: { aceitar: false } });
  const depoisRecusa = await chamar(`/servicos/${idReag}/cancelamento`, { token: bia.token });
  checar('a recusa mantem a data original e a opcao de cancelar',
    new Date((await Servico.findByPk(idReag)).data_hora_proposta).getTime() === dataAtual && depoisRecusa.dados.pode_cancelar === true);

  for (let i = 0; i < 2; i += 1) {
    const p = await chamar(`/servicos/${idReag}/reagendamentos`, { metodo: 'POST', token: caio.token, corpo: { data_hora: iso(novoHorario()) } });
    await chamar(`/servicos/${idReag}/reagendamentos/${p.dados.reagendamento.id}/responder`, { metodo: 'POST', token: bia.token, corpo: { aceitar: true } });
  }
  const quarto = await chamar(`/servicos/${idReag}/reagendamentos`, { metodo: 'POST', token: caio.token, corpo: { data_hora: iso(novoHorario()) } });
  checar('o servico pode ser reagendado no maximo 3 vezes', quarto.status === 409
    && (await Reagendamento.count({ where: { servico_id: idReag, status: 'aceito' } })) === 3);

  // =====================================================================
  console.log('\nUS24 - Avaliacao mutua');

  const antesDeConfirmar = await chamar(`/servicos/${idReag}/avaliacao`, { metodo: 'POST', token: bia.token, corpo: { nota: 5 } });
  checar('so quem teve o servico confirmado consegue avaliar', antesDeConfirmar.status === 409);
  const terceiroAvaliando = await chamar(`/servicos/${idUm}/avaliacao`, { metodo: 'POST', token: terceiro.token, corpo: { nota: 1 } });
  checar('quem nao contratou nao avalia', terceiroAvaliando.status === 404);
  const notaInvalida = await chamar(`/servicos/${idUm}/avaliacao`, { metodo: 'POST', token: bia.token, corpo: { nota: 6 } });
  checar('a nota vai de 1 a 5', notaInvalida.status === 400);

  const daBia = await chamar(`/servicos/${idUm}/avaliacao`, { metodo: 'POST', token: bia.token, corpo: { nota: 4, comentario: 'Bom trabalho, chegou no horario.' } });
  const vistoCaio = await detalhe(idUm, caio.token);
  const publicas = async () => (await chamar(`/prestadores/${caio.prestador.id}/avaliacoes`)).dados;
  checar('a avaliacao de um lado nao aparece antes de a outra ser enviada',
    daBia.status === 201 && vistoCaio.avaliacoes.outra_enviou === true && vistoCaio.avaliacoes.da_outra_parte === null
    && (await publicas()).avaliacoes.length === 0);
  const repetida = await chamar(`/servicos/${idUm}/avaliacao`, { metodo: 'POST', token: bia.token, corpo: { nota: 5 } });
  checar('cada um avalia uma vez so', repetida.status === 409);

  const doCaio = await chamar(`/servicos/${idUm}/avaliacao`, { metodo: 'POST', token: caio.token, corpo: { nota: 5, comentario: 'Cliente atenciosa.' } });
  const vistoBia = await detalhe(idUm, bia.token);
  const listaPublica = await publicas();
  checar('o prestador avalia o cliente (avaliacao mutua) e as duas aparecem juntas',
    doCaio.dados.publicada === true && vistoBia.avaliacoes.da_outra_parte.nota === 5
    && listaPublica.avaliacoes.length === 1 && listaPublica.avaliacoes[0].nota === 4);
  checar('o contratante ve as avaliacoes dos outros no perfil publico do prestador',
    listaPublica.avaliacoes[0].comentario === 'Bom trabalho, chegou no horario.' && listaPublica.avaliacoes[0].autor === 'Bia');

  const editada = await chamar(`/servicos/${idUm}/avaliacao`, { metodo: 'PUT', token: bia.token, corpo: { nota: 5 } });
  checar('nas primeiras 24 horas a avaliacao pode ser editada', editada.status === 200 && (await publicas()).avaliacoes[0].nota === 5);
  await Avaliacao.update({ editavel_ate: new Date(Date.now() - MINUTO) }, { where: { servico_id: idUm, autor_id: bia.usuario.id } });
  const tarde = await chamar(`/servicos/${idUm}/avaliacao`, { metodo: 'PUT', token: bia.token, corpo: { nota: 1 } });
  checar('apos 24 horas, a avaliacao nao pode mais ser editada', tarde.status === 409 && (await publicas()).avaliacoes[0].nota === 5);

  const clienteResponde = await chamar(`/servicos/${idUm}/avaliacao/resposta`, { metodo: 'POST', token: bia.token, corpo: { texto: 'oi' } });
  const resposta = await chamar(`/servicos/${idUm}/avaliacao/resposta`, { metodo: 'POST', token: caio.token, corpo: { texto: 'Obrigado, Bia!' } });
  const respostaDupla = await chamar(`/servicos/${idUm}/avaliacao/resposta`, { metodo: 'POST', token: caio.token, corpo: { texto: 'De novo' } });
  checar('o prestador responde (uma vez) a avaliacao que recebeu',
    clienteResponde.status === 403 && resposta.status === 200 && respostaDupla.status === 409
    && (await publicas()).avaliacoes[0].resposta === 'Obrigado, Bia!');

  // Prazo vencido: so o cliente avaliou; depois de 7 dias, a avaliacao aparece sozinha.
  await chamar(`/servicos/${idAuto}/avaliacao`, { metodo: 'POST', token: bia.token, corpo: { nota: 3 } });
  checar('sozinha, dentro do prazo, a avaliacao fica escondida', (await publicas()).avaliacoes.length === 1);
  // (este servico foi confirmado pela rotina no "agora + 73 horas"; 7 dias depois disso = 11 dias)
  await processarConclusoes(new Date(Date.now() + 11 * DIA));
  const depoisPrazo = await publicas();
  checar('vencido o prazo de 7 dias, a avaliacao enviada aparece mesmo sem a outra',
    depoisPrazo.avaliacoes.length === 2);
  checar('a nota do prestador e a media simples das avaliacoes publicadas ((5 + 3) / 2 = 4)',
    depoisPrazo.nota_media === 4 && depoisPrazo.total_avaliacoes === 2);
  await Servico.update({ confirmado_em: new Date(Date.now() - 8 * DIA) }, { where: { id: idEdu } });
  const foraDoPrazo = await chamar(`/servicos/${idEdu}/avaliacao`, { metodo: 'POST', token: bia.token, corpo: { nota: 5 } });
  checar('depois do prazo de 7 dias, nao da mais para avaliar', foraDoPrazo.status === 409);

  // Menos de 5 avaliacoes: a nota nao derruba ninguem na busca.
  const vidraceiro = await Categoria.create({ nome: 'Vidraceiro', area_id: (await Categoria.findByPk(eletricista)).area_id });
  const vidroA = await prestadorPronto('Vera Lopes', 445566778, 'vera.s4@teste.com', { categorias: [vidraceiro.id] });
  await prestadorPronto('Wagner Dias', 556677889, 'wagner.s4@teste.com', { categorias: [vidraceiro.id] });
  const ordem = async () => (await chamar(`/prestadores?categoria=${vidraceiro.id}`)).dados.prestadores.map((p) => p.nome);
  const ordemSemNota = await ordem();
  await Prestador.update({ nota_media: 1, total_avaliacoes: 4 }, { where: { id: vidroA.prestador.id } });
  const ordemQuatro = await ordem();
  checar('prestador com menos de 5 avaliacoes nao sofre queda de posicao na busca',
    ordemSemNota[0] === 'Vera Lopes' && ordemQuatro[0] === 'Vera Lopes');
  await Prestador.update({ nota_media: 4.5, total_avaliacoes: 5 }, { where: { id: vidroA.prestador.id } });
  await Prestador.update({ nota_media: 4.9, total_avaliacoes: 6 }, { where: { usuario_id: (await Usuario.findOne({ where: { email: 'wagner.s4@teste.com' } })).id } });
  checar('a partir de 5 avaliacoes, a nota passa a ordenar a busca', (await ordem())[0] === 'Wagner Dias');

  // =====================================================================
  console.log('\nUS16 - Historico e recontratacao');

  const hist = await chamar('/servicos/historico', { token: bia.token });
  const itemUm = hist.dados.servicos.find((s) => s.id === idUm);
  checar('o historico lista os servicos feitos com data, valor e avaliacao',
    hist.status === 200 && itemUm && Boolean(itemUm.horario) && itemUm.valor === 220 && itemUm.minha_nota === 5
    && hist.dados.servicos.every((s) => ['confirmado', 'pago'].includes(s.status)));
  checar('servicos cancelados nao entram como "ja me atendeu"', !hist.dados.servicos.some((s) => s.id === idMais24));

  const recontratar = await chamar('/servicos', {
    metodo: 'POST', token: bia.token,
    corpo: {
      id_prestador: itemUm.prestador.perfil.id, categoria_id: itemUm.categoria.id, bairro_id: bairro.id,
      descricao: itemUm.descricao, data_hora: iso(novoHorario())
    }
  });
  checar('"chamar de novo" abre uma nova solicitacao com o prestador ja selecionado',
    itemUm.prestador.disponivel === true && itemUm.prestador.perfil.id === caio.prestador.id
    && recontratar.status === 201 && recontratar.dados.servico.prestador.id === caio.prestador.id
    && recontratar.dados.servico.categoria.id === eletricista);

  await Usuario.update({ status: 'inativo' }, { where: { id: edu.usuario.id } });
  const histSaiu = await chamar('/servicos/historico', { token: bia.token });
  const itemEdu = histSaiu.dados.servicos.find((s) => s.id === idEdu);
  checar('prestador que saiu da plataforma aparece no historico, mas sem o botao',
    itemEdu && itemEdu.prestador.nome === 'Edu Prado' && itemEdu.prestador.disponivel === false && itemEdu.prestador.perfil === null);
  await Usuario.update({ status: 'ativo' }, { where: { id: edu.usuario.id } });

  const histOutro = await chamar('/servicos/historico', { token: terceiro.token });
  const histPrestador = await chamar('/servicos/historico', { token: caio.token });
  checar('o historico mostra apenas os servicos do proprio usuario',
    histOutro.status === 200 && !histOutro.dados.servicos.some((s) => s.id === idUm) && histPrestador.status === 403);

  const idEncanador = await servicoPago(bia, fabio, { valor: 60 });
  await Servico.update({ status: 'pago', categoria_id: encanador }, { where: { id: idEncanador } });
  const filtrado = await chamar(`/servicos/historico?categoria=${encanador}`, { token: bia.token });
  checar('o historico pode ser filtrado por categoria',
    filtrado.dados.servicos.length === 1 && filtrado.dados.servicos[0].id === idEncanador
    && hist.dados.categorias.some((c) => c.id === eletricista));
  const categoriaErrada = await chamar('/servicos', {
    metodo: 'POST', token: bia.token,
    corpo: { id_prestador: caio.prestador.id, categoria_id: encanador, bairro_id: bairro.id, descricao: 'x', data_hora: iso(novoHorario()) }
  });
  checar('o pedido nao aceita categoria que o prestador nao atende', categoriaErrada.status === 400);
}

module.exports = { testarSprint4 };
