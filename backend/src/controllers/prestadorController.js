const { Prestador, Usuario, Categoria, Bairro } = require('../models');
const { detectarTipo, salvarFotoPerfil, removerFotoPerfil, urlPublica } = require('../servicos/armazenamento');

const LIMITE_CATEGORIAS = 5;

function montarPerfil(prestador) {
  return {
    id: prestador.id,
    nome: prestador.usuario ? prestador.usuario.nome : null,
    sexo: prestador.usuario ? prestador.usuario.sexo : null,
    descricao: prestador.descricao,
    foto_url: urlPublica(prestador.foto_url),
    status: prestador.status,
    atende_apenas_mulheres: prestador.atende_apenas_mulheres,
    categorias: (prestador.categorias || []).map((c) => ({ id: c.id, nome: c.nome })),
    bairros: (prestador.bairros || []).map((b) => ({ id: b.id, nome: b.nome }))
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
    return res.json({ prestador: montarPerfil(prestador) });
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
    return res.json({ prestador: montarPerfil(atualizado) });
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
    prestador.status = pausar ? 'pausado' : 'ativo';
    prestador.pausado_em = pausar ? new Date() : null;
    await prestador.save();

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

// Listagem simples (prova que US05, US07 e US08 funcionam).
// Os filtros de categoria e bairro e a ordenacao por avaliacao sao a US09.
async function listar(req, res, next) {
  try {
    const usuarioWhere = { status: 'ativo' };
    if (req.query.somente_mulheres === 'true') usuarioWhere.sexo = 'feminino';

    // required: true em tudo, entao prestador pausado, sem categoria ou sem
    // bairro nao aparece.
    const prestadores = await Prestador.findAll({
      where: { status: 'ativo' },
      include: [
        { model: Usuario, as: 'usuario', attributes: ['nome', 'sexo'], where: usuarioWhere, required: true },
        { model: Categoria, as: 'categorias', attributes: ['id', 'nome'], through: { attributes: [] }, required: true },
        { model: Bairro, as: 'bairros', attributes: ['id', 'nome'], through: { attributes: [] }, required: true }
      ],
      order: [['id', 'ASC']]
    });
    return res.json({ prestadores: prestadores.map(montarPerfil) });
  } catch (e) {
    return next(e);
  }
}
module.exports = { meuPerfil, salvarPerfil, enviarFoto, removerFoto, alternarPausa, listar };
