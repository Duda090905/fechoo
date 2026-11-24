/**
 * Sprint 4 - o servico depois do aceite.
 *
 *   US20 - Cheguei, iniciar, marcar como concluido e confirmar (com repasse)
 *   US15 - cancelamento com estorno (previa do valor e execucao)
 *   US14 - reagendamento com aceite da outra parte
 *
 * Quem pode o que (maquina de estados do projeto):
 *   - so o prestador inicia, avisa que chegou e marca como concluido;
 *   - so o contratante confirma;
 *   - as duas partes cancelam e propoem nova data; so a outra parte aceita.
 */
const { Reagendamento, Pagamento } = require('../models');
const {
  carregarDaParte, montarServico, horarioOcupado, lerDataHora
} = require('./servicoController');
const { confirmar: confirmarServico, horasParaConfirmar, prazoConfirmacao } = require('../servicos/repasse');
const cancelamento = require('../servicos/cancelamento');
const { registrar } = require('../servicos/historico');
const { avisar } = require('../servicos/avisos');
const { GatewayErro } = require('../servicos/gateway');
const { formatarDataHora } = require('../utils/datas');

const HORA_MS = 60 * 60 * 1000;
// US20 / US15 - o prestador so inicia ou avisa que chegou a partir de 1 hora
// antes do horario combinado. Assim ninguem "chega" dias antes para mudar a
// regra do cancelamento nem inicia cedo para impedir o cliente de cancelar.
const JANELA_INICIO_HORAS = 1;
// US14 - reagendamentos aceitos por servico (decisao do grupo).
const LIMITE_REAGENDAMENTOS = 3;
const MOTIVO_MINIMO = 3;
const MOTIVO_MAXIMO = 300;

function idDoUsuarioPrestador(servico) {
  return servico.prestador ? servico.prestador.usuario_id : null;
}

function outraParteId(servico, papel) {
  return papel === 'contratante' ? idDoUsuarioPrestador(servico) : servico.id_contratante;
}

async function responderComServico(res, servico, mensagem, status = 200) {
  const pagamento = await Pagamento.findOne({ where: { servico_id: servico.id }, order: [['id', 'DESC']] });
  return res.status(status).json({ mensagem, servico: montarServico(servico, servico.papel, { pagamento }) });
}

function liberadoParaComecar(servico, agora = new Date()) {
  const desde = new Date(new Date(servico.horarioCombinado()).getTime() - JANELA_INICIO_HORAS * HORA_MS);
  return { pode: agora >= desde, desde };
}

// US15 - "Cheguei": o prestador avisa que esta no local.
async function cheguei(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'prestador') {
      return res.status(403).json({ erro: 'Só o profissional avisa que chegou.' });
    }
    if (servico.status !== 'aceito') {
      return res.status(409).json({ erro: 'Este serviço não está esperando a sua chegada.' });
    }
    if (servico.chegou_em) return responderComServico(res, servico, 'Você já avisou que chegou.');
    const janela = liberadoParaComecar(servico);
    if (!janela.pode) {
      return res.status(409).json({
        erro: `Você pode avisar que chegou a partir de ${formatarDataHora(janela.desde)} (1 hora antes do horário combinado).`
      });
    }

    servico.chegou_em = new Date();
    await servico.save();
    await registrar(servico.id, { usuarioId: req.usuario.id, acao: 'chegada', detalhe: 'O profissional avisou que chegou ao local' });
    await avisar({
      usuarioId: servico.id_contratante,
      servicoId: servico.id,
      tipo: 'prestador_chegou',
      titulo: 'O profissional chegou',
      texto: `${servico.prestador.usuario ? servico.prestador.usuario.nome : 'O profissional'} avisou que chegou ao local do serviço.`
    });
    return responderComServico(res, servico, 'Pronto! O cliente foi avisado de que você chegou.');
  } catch (e) {
    return next(e);
  }
}

// US20 - Aceito -> Em execucao (so o prestador).
async function iniciar(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'prestador') {
      return res.status(403).json({ erro: 'Só o profissional inicia o serviço.' });
    }
    if (servico.status !== 'aceito') {
      return res.status(409).json({ erro: 'Só dá para iniciar um serviço aceito, com o pagamento congelado.' });
    }
    const janela = liberadoParaComecar(servico);
    if (!janela.pode) {
      return res.status(409).json({
        erro: `Você pode iniciar a partir de ${formatarDataHora(janela.desde)} (1 hora antes do horário combinado).`
      });
    }

    const agora = new Date();
    servico.status = 'em_execucao';
    servico.iniciado_em = agora;
    if (!servico.chegou_em) servico.chegou_em = agora;
    await servico.save();
    // US14 - nova data esperando resposta deixa de valer quando o servico comeca.
    await Reagendamento.update(
      { status: 'cancelado', respondido_em: agora },
      { where: { servico_id: servico.id, status: 'pendente' } }
    );
    await registrar(servico.id, { usuarioId: req.usuario.id, acao: 'inicio', de: 'aceito', para: 'em_execucao' });
    return responderComServico(res, servico, 'Serviço iniciado. Quando terminar, marque como concluído.');
  } catch (e) {
    return next(e);
  }
}

// US20 - Em execucao -> Concluido pelo prestador. Abre o prazo de 72 horas.
async function concluir(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.papel !== 'prestador') {
      return res.status(403).json({ erro: 'Só o profissional marca o serviço como concluído.' });
    }
    if (servico.status !== 'em_execucao') {
      return res.status(409).json({ erro: 'Inicie o serviço antes de marcar como concluído.' });
    }

    servico.status = 'concluido';
    servico.concluido_em = new Date();
    await servico.save(); // o hook do modelo fecha o chat (US12)
    await registrar(servico.id, { usuarioId: req.usuario.id, acao: 'conclusao', de: 'em_execucao', para: 'concluido' });
    const horas = horasParaConfirmar();
    await avisar({
      usuarioId: servico.id_contratante,
      servicoId: servico.id,
      tipo: 'servico_concluido',
      titulo: 'Confirme o serviço',
      texto: `O profissional marcou o serviço como concluído. Confira e confirme em até ${horas} horas `
        + `(até ${formatarDataHora(prazoConfirmacao(servico))}). Sem resposta, o serviço é confirmado sozinho e o pagamento é liberado.`
    });
    return responderComServico(res, servico, `Serviço concluído. O cliente tem ${horas} horas para confirmar.`);
  } catch (e) {
    return next(e);
  }
}

// US20 - o contratante confirma; o pagamento e liberado ja sem a taxa.
async function confirmar(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    // O prestador nunca libera o proprio pagamento.
    if (servico.papel !== 'contratante') {
      return res.status(403).json({ erro: 'Só o cliente confirma o serviço e libera o pagamento.' });
    }
    if (servico.status !== 'concluido') {
      return res.status(409).json({ erro: 'Este serviço não está esperando a sua confirmação.' });
    }

    const resultado = await confirmarServico(servico, { usuarioId: req.usuario.id });
    if (resultado === null) {
      return res.status(409).json({ erro: 'Este serviço já foi confirmado.' });
    }
    await servico.reload();
    const mensagem = resultado === 'pago'
      ? 'Serviço confirmado. O pagamento foi liberado ao profissional.'
      : 'Serviço confirmado. O pagamento vai para o profissional assim que ele cadastrar a chave Pix.';
    return responderComServico(res, servico, mensagem);
  } catch (e) {
    return next(e);
  }
}

// US15 - mostra quanto cada um recebe se cancelar agora (antes de confirmar).
async function previaCancelamento(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    const pagamento = await cancelamento.pagamentoAtual(servico.id);
    const conta = cancelamento.calcular(servico, servico.papel, pagamento);
    if (conta.bloqueio) return res.json({ pode_cancelar: false, motivo: conta.bloqueio });
    return res.json({ pode_cancelar: true, ...conta });
  } catch (e) {
    return next(e);
  }
}

// US15 - cancela com o motivo; o estorno sai pelo gateway.
async function cancelar(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    const motivo = String(req.body.motivo || '').replace(/\s+/g, ' ').trim();
    if (motivo.length < MOTIVO_MINIMO) {
      return res.status(400).json({ erro: 'Conte o motivo do cancelamento.' });
    }
    if (motivo.length > MOTIVO_MAXIMO) {
      return res.status(400).json({ erro: `O motivo pode ter no máximo ${MOTIVO_MAXIMO} caracteres.` });
    }

    let conta;
    try {
      conta = await cancelamento.cancelar(servico, { papel: servico.papel, usuarioId: req.usuario.id, motivo });
    } catch (e) {
      if (e instanceof GatewayErro) {
        console.error('[cancelamento] o banco recusou o estorno:', e.detalhe || e.message);
        return res.status(502).json({ erro: 'O banco não conseguiu fazer a devolução agora. Nada foi cancelado. Tente de novo em alguns minutos.' });
      }
      throw e;
    }
    if (conta.bloqueio) return res.status(409).json({ erro: conta.bloqueio });

    await servico.reload();
    const mensagem = conta.regra === 'sem_pagamento'
      ? 'Pedido cancelado.'
      : `Serviço cancelado. ${conta.descricao}`;
    const pagamento = await Pagamento.findOne({ where: { servico_id: servico.id }, order: [['id', 'DESC']] });
    return res.json({ mensagem, cancelamento: conta, servico: montarServico(servico, servico.papel, { pagamento }) });
  } catch (e) {
    return next(e);
  }
}

// US14 - propoe nova data. Vale so depois do aceite da outra parte.
async function proporReagendamento(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    if (servico.status !== 'aceito') {
      return res.status(409).json({ erro: 'Só dá para mudar a data de um serviço aceito que ainda não começou.' });
    }
    if (servico.chegou_em) {
      return res.status(409).json({ erro: 'O profissional já chegou ao local. Não dá mais para mudar a data.' });
    }
    const pendente = await Reagendamento.findOne({ where: { servico_id: servico.id, status: 'pendente' } });
    if (pendente) {
      return res.status(409).json({ erro: 'Já existe uma nova data esperando resposta.' });
    }
    const aceitos = await Reagendamento.count({ where: { servico_id: servico.id, status: 'aceito' } });
    if (aceitos >= LIMITE_REAGENDAMENTOS) {
      return res.status(409).json({
        erro: `Este serviço já foi reagendado ${LIMITE_REAGENDAMENTOS} vezes, o máximo permitido. Se a data não der mesmo, a saída é cancelar.`
      });
    }

    const nova = lerDataHora(req.body.data_hora);
    if (!nova) return res.status(400).json({ erro: 'Escolha a nova data e hora.' });
    if (nova <= new Date()) {
      return res.status(400).json({ erro: 'Essa data já passou. Escolha uma data e hora que ainda estão por vir.' });
    }
    const atual = new Date(servico.horarioCombinado());
    if (Math.abs(nova.getTime() - atual.getTime()) < 60 * 1000) {
      return res.status(400).json({ erro: 'Essa já é a data combinada. Escolha outra.' });
    }
    const fim = new Date(nova.getTime() + (servico.prazo_horas || 1) * HORA_MS);
    if (await horarioOcupado(servico.id_prestador, nova, fim, servico.id)) {
      return res.status(409).json({ erro: 'O profissional já tem outro compromisso nesse horário. Escolha outro.' });
    }
    const motivo = String(req.body.motivo || '').replace(/\s+/g, ' ').trim().slice(0, MOTIVO_MAXIMO) || null;

    const proposta = await Reagendamento.create({
      servico_id: servico.id,
      proposto_por_id: req.usuario.id,
      papel: servico.papel,
      data_hora_anterior: atual,
      data_hora_nova: nova,
      motivo
    });
    await registrar(servico.id, {
      usuarioId: req.usuario.id,
      acao: 'reagendamento_proposto',
      detalhe: `De ${formatarDataHora(atual)} para ${formatarDataHora(nova)}${motivo ? `. Motivo: ${motivo}` : ''}`
    });
    const quem = servico.papel === 'prestador' ? 'O profissional' : 'O cliente';
    await avisar({
      usuarioId: outraParteId(servico, servico.papel),
      servicoId: servico.id,
      tipo: 'reagendamento_proposto',
      titulo: 'Pedido de nova data',
      texto: `${quem} pediu para mudar o atendimento de ${formatarDataHora(atual)} para ${formatarDataHora(nova)}. `
        + 'Abra o pedido para aceitar ou recusar. Enquanto isso, o pagamento continua congelado.'
    });
    return res.status(201).json({
      mensagem: 'Nova data enviada. Ela só vale depois que a outra parte aceitar.',
      reagendamento: { id: proposta.id, status: proposta.status, data_hora_nova: proposta.data_hora_nova }
    });
  } catch (e) {
    return next(e);
  }
}

// US14 - a outra parte aceita ou recusa a nova data.
async function responderReagendamento(req, res, next) {
  try {
    const servico = await carregarDaParte(req, res);
    if (!servico) return undefined;
    const proposta = await Reagendamento.findOne({ where: { id: Number(req.params.rid) || 0, servico_id: servico.id } });
    if (!proposta) return res.status(404).json({ erro: 'Pedido de nova data não encontrado.' });
    if (proposta.status !== 'pendente') {
      return res.status(409).json({ erro: 'Este pedido de nova data já foi respondido.' });
    }
    if (proposta.proposto_por_id === req.usuario.id) {
      return res.status(403).json({ erro: 'Quem responde a nova data é a outra parte.' });
    }
    if (servico.status !== 'aceito') {
      return res.status(409).json({ erro: 'Este serviço não pode mais mudar de data.' });
    }

    const aceitar = req.body.aceitar === true;
    const agora = new Date();
    if (aceitar) {
      const nova = new Date(proposta.data_hora_nova);
      if (nova <= agora) {
        return res.status(409).json({ erro: 'A data proposta já passou. Peça uma nova data.' });
      }
      const fim = new Date(nova.getTime() + (servico.prazo_horas || 1) * HORA_MS);
      if (await horarioOcupado(servico.id_prestador, nova, fim, servico.id)) {
        return res.status(409).json({ erro: 'O profissional já tem outro compromisso nesse horário.' });
      }
      servico.data_hora_proposta = nova;
      servico.lembrete_enviado_em = null; // US13 - lembra de novo na vespera da nova data
      await servico.save();
    }
    proposta.status = aceitar ? 'aceito' : 'recusado';
    proposta.respondido_por_id = req.usuario.id;
    proposta.respondido_em = agora;
    await proposta.save();

    await registrar(servico.id, {
      usuarioId: req.usuario.id,
      acao: aceitar ? 'reagendamento_aceito' : 'reagendamento_recusado',
      detalhe: aceitar
        ? `Nova data: ${formatarDataHora(proposta.data_hora_nova)}`
        : `Continua em ${formatarDataHora(proposta.data_hora_anterior)}`
    });
    await avisar({
      usuarioId: proposta.proposto_por_id,
      servicoId: servico.id,
      tipo: 'reagendamento_respondido',
      titulo: aceitar ? 'Nova data aceita' : 'Nova data recusada',
      texto: aceitar
        ? `O atendimento passou para ${formatarDataHora(proposta.data_hora_nova)}.`
        : `A data original continua valendo: ${formatarDataHora(proposta.data_hora_anterior)}. Se não puder ir, você pode cancelar.`
    });
    return responderComServico(res, servico, aceitar
      ? `Combinado! O atendimento passou para ${formatarDataHora(proposta.data_hora_nova)}.`
      : 'Nova data recusada. A data original continua valendo.');
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  cheguei, iniciar, concluir, confirmar, previaCancelamento, cancelar, proporReagendamento, responderReagendamento,
  JANELA_INICIO_HORAS, LIMITE_REAGENDAMENTOS
};
