/**
 * Guarda e apaga as fotos de perfil (US05).
 *
 * Hoje grava em disco, na pasta uploads/ (ou UPLOADS_DIR). Todo o resto do
 * sistema so conhece estas funcoes e a URL relativa que elas devolvem
 * (/uploads/perfis/<nome>), entao trocar por um armazenamento externo
 * (S3 ou similar) mexe apenas neste arquivo.
 *
 * Documentos de identidade da US06 NAO devem passar por aqui: o requisito
 * e nunca guardar a imagem do documento.
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PREFIXO = '/uploads/perfis/';
const NOME_VALIDO = /^[0-9a-f]{32}\.(jpg|png|webp)$/;

function raizUploads() {
  return path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads'));
}

function pastaPerfis() {
  return path.join(raizUploads(), 'perfis');
}

// Descobre o formato pelos primeiros bytes, sem confiar no nome nem no tipo
// que o navegador informou. SVG nao entra: pode carregar script.
function detectarTipo(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

// Devolve a URL relativa da foto salva.
async function salvarFotoPerfil(buffer, ext) {
  await fs.mkdir(pastaPerfis(), { recursive: true });
  const nome = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(pastaPerfis(), nome), buffer);
  return `${PREFIXO}${nome}`;
}

// Apaga o arquivo se a URL for de uma foto nossa. Qualquer outro valor
// (vazio, endereco externo antigo) e ignorado, e nunca sai da pasta.
async function removerFotoPerfil(url) {
  if (typeof url !== 'string' || !url.startsWith(PREFIXO)) return;
  const nome = url.slice(PREFIXO.length);
  if (!NOME_VALIDO.test(nome)) return;
  try {
    await fs.unlink(path.join(pastaPerfis(), nome));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

// So expoe para o front fotos que estao no nosso armazenamento.
function urlPublica(url) {
  return typeof url === 'string' && url.startsWith(PREFIXO) && NOME_VALIDO.test(url.slice(PREFIXO.length))
    ? url
    : null;
}

module.exports = { raizUploads, detectarTipo, salvarFotoPerfil, removerFotoPerfil, urlPublica };
