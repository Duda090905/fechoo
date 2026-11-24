/**
 * US22 - Extrato do prestador.
 *
 *   - filtro por periodo (?de=AAAA-MM-DD&ate=AAAA-MM-DD, horario de Brasilia;
 *     a data que vale e a do repasse);
 *   - por servico: valor bruto, taxa e liquido (bruto - taxa = liquido);
 *   - totais do periodo (a soma das linhas);
 *   - valores retidos separados: o que ainda esta congelado (servico em
 *     andamento, esperando confirmacao, em disputa ou esperando a chave Pix).
 *     Eles nao entram nos totais, porque ainda nao sao do prestador; mostram
 *     a situacao de agora, sem o filtro de periodo;
 *   - exportar em CSV (abre no Excel e no Google Sheets).
 *
 * O que entra como recebido: todo pagamento com transferencia ao prestador.
 *   conclusao (US20) ............ bruto = total pago; taxa = a da US21
 *   multa de cancelamento (US15)  bruto = a parte do prestador; taxa 0
 *   disputa dividida (US25) ..... bruto = a parte do prestador; taxa 0
 *   disputa liberada (US25) ..... como a conclusao
 * O valor complementar (US19) soma na linha do mesmo servico.
 */
const { Op } = require('sequelize');
const {
  Pagamento, Servico, Prestador, Usuario, Categoria, Disputa
} = require('../models');
const { lerPeriodo } = require('./adminController');
const { emReais } = require('../servicos/taxa');

const ORIGENS = {
  pago: 'Serviço concluído',
  cancelado: 'Multa de cancelamento',
  resolvido: 'Decisão de disputa'
};

function situacaoRetida(servico, pagamento) {
  if (pagamento.repasse_pendente === 'sem_chave_pix') return 'Esperando a sua chave Pix';
  if (pagamento.repasse_pendente) return 'Repasse em nova tentativa';
  if (servico.status === 'em_disputa') return 'Em disputa';
  if (servico.status === 'concluido') return 'Esperando a confirmação do cliente';
  if (servico.status === 'em_execucao') return 'Serviço em andamento';
  return 'Serviço agendado';
}

async function montarExtrato(usuarioId, periodo) {
  const prestador = await Prestador.findOne({ where: { usuario_id: usuarioId }, attributes: ['id'] });
  if (!prestador) return null;

  const includeServico = {
    model: Servico,
    as: 'servico',
    attributes: ['id', 'descricao', 'status', 'id_contratante', 'data_hora_solicitada', 'data_hora_proposta'],
    where: { id_prestador: prestador.id },
    required: true,
    include: [
      { model: Usuario, as: 'contratante', attributes: ['id', 'nome'] },
      { model: Categoria, as: 'categoria', attributes: ['id', 'nome'] }
    ]
  };
  const filtroData = {};
  if (periodo.inicio) filtroData[Op.gte] = periodo.inicio;
  if (periodo.fim) filtroData[Op.lte] = periodo.fim;

  const [recebidos, retidos] = await Promise.all([
    Pagamento.unscoped().findAll({
      where: {
        repasse_id: { [Op.ne]: null },
        liberado_em: Object.getOwnPropertySymbols(filtroData).length ? filtroData : { [Op.ne]: null }
      },
      include: [includeServico],
      order: [['liberado_em', 'ASC'], ['id', 'ASC']]
    }),
    // Retido, ou parte do prestador (multa ou disputa dividida) que ainda
    // espera a chave Pix: dinheiro que ainda nao saiu para ele.
    Pagamento.unscoped().findAll({
      where: {
        [Op.or]: [
          { status: 'retido' },
          { status: 'estornado', repasse_pendente: { [Op.ne]: null }, valor_repasse: { [Op.gt]: 0 } }
        ]
      },
      include: [includeServico],
      order: [['retido_em', 'ASC'], ['id', 'ASC']]
    })
  ]);

  // Uma linha por servico (o complementar soma no mesmo servico).
  const porServico = new Map();
  for (const p of recebidos) {
    const s = p.servico;
    const liquido = Number(p.valor_repasse || 0);
    const taxa = Number(p.taxa_valor || 0);
    const bruto = p.status === 'liberado' ? Number(p.valor) : liquido; // estornado: so a parte do prestador
    const linha = porServico.get(s.id) || {
      servico_id: s.id,
      data: p.liberado_em,
      cliente: s.contratante ? s.contratante.nome : 'Conta removida',
      descricao: s.descricao,
      categoria: s.categoria ? s.categoria.nome : null,
      origem: ORIGENS[s.status] || 'Repasse',
      taxa_percentual: null,
      com_complementar: false,
      bruto: 0,
      taxa: 0,
      liquido: 0
    };
    linha.bruto = emReais(linha.bruto + bruto);
    linha.taxa = emReais(linha.taxa + taxa);
    linha.liquido = emReais(linha.liquido + liquido);
    if (taxa > 0) linha.taxa_percentual = Number(p.taxa_percentual);
    if (p.tipo === 'complementar') linha.com_complementar = true;
    if (new Date(p.liberado_em) > new Date(linha.data)) linha.data = p.liberado_em;
    porServico.set(s.id, linha);
  }
  const linhas = [...porServico.values()].sort((a, b) => new Date(a.data) - new Date(b.data));

  // Disputa: a decisao explica a origem da linha.
  const comDisputa = linhas.filter((l) => l.origem === ORIGENS.resolvido).map((l) => l.servico_id);
  if (comDisputa.length) {
    const ds = await Disputa.findAll({ where: { servico_id: comDisputa }, attributes: ['servico_id', 'decisao'] });
    const nomes = { liberar: 'Disputa: valor liberado', dividir: 'Disputa: valor dividido' };
    ds.forEach((d) => {
      const linha = linhas.find((l) => l.servico_id === d.servico_id);
      if (linha && nomes[d.decisao]) linha.origem = nomes[d.decisao];
    });
  }

  const retidosLinhas = retidos.map((p) => ({
    servico_id: p.servico.id,
    desde: p.retido_em,
    cliente: p.servico.contratante ? p.servico.contratante.nome : 'Conta removida',
    descricao: p.servico.descricao,
    tipo: p.tipo,
    valor: emReais(p.status === 'estornado' ? p.valor_repasse : p.valor),
    situacao: situacaoRetida(p.servico, p)
  }));

  const somar = (lista, campo) => emReais(lista.reduce((t, l) => t + l[campo], 0));
  return {
    periodo: { de: periodo.de, ate: periodo.ate },
    linhas,
    totais: {
      servicos: linhas.length,
      bruto: somar(linhas, 'bruto'),
      taxa: somar(linhas, 'taxa'),
      liquido: somar(linhas, 'liquido')
    },
    retidos: {
      itens: retidosLinhas,
      total: somar(retidosLinhas, 'valor')
    }
  };
}

// GET /prestadores/extrato
async function extrato(req, res, next) {
  try {
    const periodo = lerPeriodo(req.query);
    if (periodo.erro) return res.status(400).json({ erro: periodo.erro });
    const dados = await montarExtrato(req.usuario.id, periodo);
    if (!dados) return res.json({ extrato: null });
    return res.json({ extrato: dados });
  } catch (e) {
    return next(e);
  }
}

function numeroBR(valor) {
  return Number(valor).toFixed(2).replace('.', ',');
}

function dataBR(data) {
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function celula(texto) {
  const valor = String(texto === null || texto === undefined ? '' : texto);
  // Evita formula ao abrir no Excel (=, +, -, @) e escapa as aspas.
  const seguro = /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
  return `"${seguro.replace(/"/g, '""')}"`;
}

// GET /prestadores/extrato.csv - mesmo filtro; separador ";" (Excel em portugues).
async function extratoCsv(req, res, next) {
  try {
    const periodo = lerPeriodo(req.query);
    if (periodo.erro) return res.status(400).json({ erro: periodo.erro });
    const dados = await montarExtrato(req.usuario.id, periodo);
    if (!dados) return res.status(404).json({ erro: 'Monte seu perfil de profissional primeiro.' });

    const linhas = [
      ['Data do repasse', 'Serviço', 'Cliente', 'Descrição', 'Origem', 'Bruto (R$)', 'Taxa (%)', 'Taxa (R$)', 'Líquido (R$)'].map(celula).join(';')
    ];
    for (const l of dados.linhas) {
      linhas.push([
        dataBR(l.data), l.servico_id, l.cliente, l.descricao, l.origem + (l.com_complementar ? ' (com complementar)' : ''),
        numeroBR(l.bruto), l.taxa_percentual === null ? '' : String(l.taxa_percentual).replace('.', ','),
        numeroBR(l.taxa), numeroBR(l.liquido)
      ].map(celula).join(';'));
    }
    linhas.push(['TOTAL', dados.totais.servicos, '', '', '', numeroBR(dados.totais.bruto), '', numeroBR(dados.totais.taxa), numeroBR(dados.totais.liquido)].map(celula).join(';'));
    linhas.push('');
    linhas.push(['Valores retidos (ainda congelados)', '', '', '', 'Situação', 'Valor (R$)'].map(celula).join(';'));
    for (const r of dados.retidos.itens) {
      linhas.push([dataBR(r.desde), r.servico_id, r.cliente, r.descricao, r.situacao, numeroBR(r.valor)].map(celula).join(';'));
    }
    linhas.push(['TOTAL RETIDO', '', '', '', '', numeroBR(dados.retidos.total)].map(celula).join(';'));

    const nome = `extrato-fecho${periodo.de ? `-${periodo.de}` : ''}${periodo.ate ? `-a-${periodo.ate}` : ''}.csv`;
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${nome}"`);
    // BOM: o Excel reconhece os acentos.
    return res.send(`﻿${linhas.join('\r\n')}\r\n`);
  } catch (e) {
    return next(e);
  }
}

module.exports = { extrato, extratoCsv, montarExtrato };
