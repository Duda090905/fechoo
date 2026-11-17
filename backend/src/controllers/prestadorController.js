const { Op, fn, col } = require('sequelize');
const { Prestador, Usuario, Categoria, Bairro, Servico } = require('../models');
const { iniciarPausa, retomar } = require('../servicos/pausas');
const { detectarTipo, salvarFotoPerfil, removerFotoPerfil, urlPublica } = require('../servicos/armazenamento');
const { cpfValido, limpar } = require('../utils/cpf');

const LIMITE_CATEGORIAS = 5;

// US06 - a chave Pix aparece so para a propria pessoa, mascarada.
function chaveMascarada(chave) {
  const digitos = String(chave || '');
  return digitos.length === 11 ? `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**` : null;
}

// US09 - o cartao do prestador leva nome, nota media, servicos concluidos e selo.
// `proprio`: o perfil e de quem esta logado (traz a chave Pix mascarada).
function montarPerfil(prestador, servicosConcluidos = 0, { proprio = false } = {}) {
  return {
    id: prestador.id,
    nome: prestador.usuario ? prestador.usuario.nome : null,
    sexo: prestador.usuario ? prestador.usuario.sexo : null,
    descricao: prestador.descricao,
    foto_url: urlPublica(prestador.foto_url),
    status: prestador.status,
    atende_apenas_mulheres: prestador.atende_apenas_mulheres,
    nota_media: prestador.nota_media === null || prestador.nota_media === undefined ? null : Number(prestador.nota_media),
    servicos_concluidos: servicosConcluidos,
    verificado: Boolean(prestador.verificado),
    categorias: (prestador.categorias || []).map((c) => ({ id: c.id, nome: c.nome })),
    bairros: (prestador.bairros || []).map((b) => ({ id: b.id, nome: b.nome })),
    ...(proprio
      ? {
        chave_pix: prestador.chave_pix ? { tipo: prestador.chave_pix_tipo, mascarada: chaveMascarada(prestador.chave_pix) } : null,
        verificado_em: prestador.verificado_em
      }
      : {})
  };
}

const INCLUDES = [
  { model: Usuario, as: 'usuario', attributes: ['nome', 'sexo'] },
  { model: Categoria, as: 'categorias', attributes: ['id', 'nome'], through: { attributes: [] } },
  { model: Bairro, as: 'bairros', attributes: ['id', 'nome'], through: { attributes: [] } }
];

// US05 - meu perfil de prestador
async function meuPerfil(req, res, next) {
  try {
    const prestador = await Prestador.findOne({
      where: { usuario_id: req.usuario.id },
      include: INCLUDES
    });
    if (!prestador) return res.json({ prestador: null });
    const concluidos = await contarConcluidos([prestador.id]);
    return res.json({ prestador: montarPerfil(prestador, concluidos.get(prestador.id) || 0, { proprio: true }) });
  } catch (e) {
    return next(e);
  }
}

// Aceita so lista de numeros inteiros positivos, sem repeticao.
// Devolve null quando o valor nao e uma lista valida.
function listaDeIds(valor) {
  if (!Array.isArray(valor)) return null;
  const ids = valor.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  return [...new Set(ids)];
}

// US05 / US08 - criar ou atualizar o perfil
async function salvarPerfil(req, res, next) {
  try {
    // A foto nao passa por aqui: tem endpoint proprio (PUT/DELETE /prestadores/foto).
    const { descricao, atende_apenas_mulheres } = req.body;

    // Campo ausente = nao mexe. Campo enviado = substitui a lista inteira,
    // e a lista nao pode ficar vazia (sem categoria ou bairro o prestador
    // nao seria encontrado por ninguem).
    let categorias;
    let bairros;

    if (req.body.categorias !== undefined) {
      categorias = listaDeIds(req.body.categorias);
      if (!categorias) return res.status(400).json({ erro: 'Lista de categorias invalida.' });
      if (!categorias.length) return res.status(400).json({ erro: 'Escolha ao menos uma categoria.' });
      if (categorias.length > LIMITE_CATEGORIAS) {
        return res.status(400).json({ erro: `Escolha no maximo ${LIMITE_CATEGORIAS} categorias.` });
      }
      if (await Categoria.count({ where: { id: categorias } }) !== categorias.length) {
        return res.status(400).json({ erro: 'Alguma das categorias escolhidas nao existe.' });
      }
    }

    if (req.body.bairros !== undefined) {
      bairros = listaDeIds(req.body.bairros);
      if (!bairros) return res.status(400).json({ erro: 'Lista de bairros invalida.' });
      if (!bairros.length) return res.status(400).json({ erro: 'Escolha ao menos um bairro.' });
      if (await Bairro.count({ where: { id: bairros } }) !== bairros.length) {
        return res.status(400).json({ erro: 'Algum dos bairros escolhidos nao existe.' });
      }
    }

    // US08 - so quem se identificou como mulher pode marcar a opcao.
    if (atende_apenas_mulheres && req.usuario.sexo !== 'feminino') {
      return res.status(400).json({
        erro: 'Essa opcao esta disponivel apenas para prestadoras mulheres.'
      });
    }

    const [prestador] = await Prestador.findOrCreate({
      where: { usuario_id: req.usuario.id },
      defaults: { usuario_id: req.usuario.id }
    });

    prestador.descricao = descricao ?? prestador.descricao;
    if (atende_apenas_mulheres !== undefined) {
      prestador.atende_apenas_mulheres = Boolean(atende_apenas_mulheres);
    }
    await prestador.save();

    if (categorias) await prestador.setCategorias(categorias);
    if (bairros) await prestador.setBairros(bairros);

    const atualizado = await Prestador.findByPk(prestador.id, { include: INCLUDES });
    const concluidos = await contarConcluidos([prestador.id]);
    return res.json({ prestador: montarPerfil(atualizado, concluidos.get(prestador.id) || 0, { proprio: true }) });
  } catch (e) {
    return next(e);
  }
}

// US05 - enviar ou trocar a foto de perfil (multipart, campo "foto")
async function enviarFoto(req, res, next) {
  let novaUrl = null;
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Escolha uma imagem para enviar.' });
    }
    const tipo = detectarTipo(req.file.buffer);
    if (!tipo) {
      return res.status(400).json({ erro: 'Use uma imagem JPG, PNG ou WebP.' });
    }

    const [prestador] = await Prestador.findOrCreate({
      where: { usuario_id: req.usuario.id },
      defaults: { usuario_id: req.usuario.id }
    });

    const antiga = prestador.foto_url;
    novaUrl = await salvarFotoPerfil(req.file.buffer, tipo.ext);
    prestador.foto_url = novaUrl;
    await prestador.save();
    novaUrl = null; // gravada no banco: nao precisa desfazer

    await removerFotoPerfil(antiga);
    return res.json({ foto_url: prestador.foto_url });
  } catch (e) {
    // Se o banco falhou depois de gravar o arquivo, nao deixa arquivo orfao.
    if (novaUrl) await removerFotoPerfil(novaUrl).catch(() => {});
    return next(e);
  }
}

// US05 - remover a foto de perfil
async function removerFoto(req, res, next) {
  try {
    const prestador = await Prestador.findOne({ where: { usuario_id: req.usuario.id } });
    if (prestador && prestador.foto_url) {
      const antiga = prestador.foto_url;
      prestador.foto_url = null;
      await prestador.save();
      await removerFotoPerfil(antiga);
    }
    return res.json({ foto_url: null });
  } catch (e) {
    return next(e);
  }
}

// US07 - pausar e retomar
async function alternarPausa(req, res, next) {
  try {
    const prestador = await Prestador.findOne({ where: { usuario_id: req.usuario.id } });
    if (!prestador) {
      return res.status(404).json({ erro: 'Monte seu perfil antes de pausar.' });
    }
    if (prestador.status === 'suspenso') {
      return res.status(403).json({ erro: 'Perfil suspenso pela administracao.' });
    }

    const pausar = prestador.status === 'ativo';
    if (pausar) await iniciarPausa(prestador);
    else await retomar(prestador);

    return res.json({
      status: prestador.status,
      mensagem: pausar
        ? 'Perfil pausado. Voce nao aparece nas buscas ate retomar.'
        : 'Perfil ativo de novo. Ja aparece nas buscas.'
    });
  } catch (e) {
    return next(e);
  }
}

/**
 * US06 - Verificacao de identidade pela titularidade da chave Pix.
 *
 * O prestador cadastra a chave em que vai receber. O sistema confere se o
 * titular da chave e o mesmo CPF do cadastro; se for, o perfil ganha o selo.
 * Nenhum documento e enviado nem guardado.
 *
 * No MVP so a chave do tipo CPF e aceita: pela regra do Pix, uma chave CPF
 * so pode estar numa conta do proprio dono do CPF. Entao, se a chave e o CPF
 * do cadastro, o titular e a mesma pessoa, sem consulta paga a terceiros.
 * (Outros tipos de chave exigem consultar o titular no Banco Central; isso
 * fica para a producao, com servico pago.)
 */
async function cadastrarChavePix(req, res, next) {
  try {
    const tipo = String(req.body.tipo || 'cpf').trim().toLowerCase();
    if (tipo !== 'cpf') {
      return res.status(422).json({
        motivo: 'tipo_nao_aceito',
        erro: 'Por enquanto o Fechô só aceita chave Pix do tipo CPF. Cadastre uma chave CPF no seu banco e informe aqui.'
      });
    }

    const chave = limpar(req.body.chave);
    if (!chave) {
      return res.status(400).json({ motivo: 'chave_vazia', erro: 'Informe a sua chave Pix (o número do CPF).' });
    }
    if (!cpfValido(chave)) {
      return res.status(400).json({ motivo: 'cpf_invalido', erro: 'Essa chave não é um CPF válido. Confira os números.' });
    }

    const prestador = await Prestador.findOne({ where: { usuario_id: req.usuario.id }, include: INCLUDES });
    if (!prestador) {
      return res.status(409).json({ motivo: 'sem_perfil', erro: 'Monte seu perfil antes de cadastrar a chave Pix.' });
    }

    // O CPF do cadastro nunca sai da API: a comparacao e feita aqui dentro.
    if (chave !== req.usuario.cpf) {
      return res.status(422).json({
        motivo: 'titular_diferente',
        erro: 'Essa chave Pix não está no CPF desta conta. Para receber pelo Fechô, a chave precisa ser o CPF que você usou no cadastro.'
      });
    }

    prestador.chave_pix_tipo = 'cpf';
    prestador.chave_pix = chave;
    prestador.verificado = true;
    if (!prestador.verificado_em) prestador.verificado_em = new Date();
    await prestador.save();

    const concluidos = await contarConcluidos([prestador.id]);
    return res.json({
      mensagem: 'Chave Pix confirmada. Seu perfil agora mostra o selo de identidade verificada.',
      prestador: montarPerfil(prestador, concluidos.get(prestador.id) || 0, { proprio: true })
    });
  } catch (e) {
    return next(e);
  }
}

// Id opcional vindo da URL: vazio vira null; qualquer coisa que nao seja
// inteiro positivo vira undefined (invalido).
function idOpcional(valor) {
  if (valor === undefined || valor === '') return null;
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

// US09 - quantos servicos concluidos cada prestador tem.
async function contarConcluidos(ids) {
  if (!ids.length) return new Map();
  const linhas = await Servico.findAll({
    attributes: ['id_prestador', [fn('COUNT', col('id')), 'total']],
    where: { id_prestador: ids, status: Servico.STATUS_CONCLUIDOS },
    group: ['id_prestador'],
    raw: true
  });
  return new Map(linhas.map((l) => [l.id_prestador, Number(l.total)]));
}

// US09 - avaliacao media (sem nota vai para o fim), depois servicos
// concluidos. Empate: quem se cadastrou primeiro.
function ordenarParaBusca(a, b) {
  const notaA = a.nota_media === null ? -1 : a.nota_media;
  const notaB = b.nota_media === null ? -1 : b.nota_media;
  if (notaA !== notaB) return notaB - notaA;
  if (a.servicos_concluidos !== b.servicos_concluidos) return b.servicos_concluidos - a.servicos_concluidos;
  return a.id - b.id;
}

/**
 * US09 - Busca por categoria e bairro.
 *
 * Filtros opcionais na URL: categoria, bairro (ids) e somente_mulheres (US08).
 * So aparece prestador ativo (pausado e suspenso saem), com conta ativa e com
 * ao menos uma categoria e um bairro.
 *
 * Dois passos: o primeiro descobre quem passa nos filtros; o segundo carrega o
 * perfil completo. Assim, filtrar por uma categoria nao esconde as outras
 * categorias do cartao.
 */
async function listar(req, res, next) {
  try {
    const categoria = idOpcional(req.query.categoria);
    const bairro = idOpcional(req.query.bairro);
    if (categoria === undefined) return res.status(400).json({ erro: 'Categoria inválida.' });
    if (bairro === undefined) return res.status(400).json({ erro: 'Bairro inválido.' });

    const usuarioWhere = { status: 'ativo' };
    if (req.query.somente_mulheres === 'true') usuarioWhere.sexo = 'feminino';

    const elegiveis = await Prestador.findAll({
      attributes: ['id'],
      where: { status: 'ativo' },
      include: [
        { model: Usuario, as: 'usuario', attributes: [], where: usuarioWhere, required: true },
        {
          model: Categoria, as: 'categorias', attributes: [], through: { attributes: [] }, required: true,
          ...(categoria ? { where: { id: categoria } } : {})
        },
        {
          model: Bairro, as: 'bairros', attributes: [], through: { attributes: [] }, required: true,
          ...(bairro ? { where: { id: bairro } } : {})
        }
      ]
    });
    const ids = [...new Set(elegiveis.map((p) => p.id))];
    if (!ids.length) return res.json({ prestadores: [] });

    const [prestadores, concluidos] = await Promise.all([
      Prestador.findAll({ where: { id: { [Op.in]: ids } }, include: INCLUDES }),
      contarConcluidos(ids)
    ]);

    const resultado = prestadores
      .map((p) => montarPerfil(p, concluidos.get(p.id) || 0))
      .sort(ordenarParaBusca);
    return res.json({ prestadores: resultado });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  meuPerfil, salvarPerfil, enviarFoto, removerFoto, alternarPausa, listar, cadastrarChavePix
};
