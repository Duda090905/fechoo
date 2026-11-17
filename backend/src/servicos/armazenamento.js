/**
 * Guarda e apaga os arquivos enviados.
 *
 * - Fotos de perfil (US05): pasta uploads/perfis, publica, servida em
 *   /uploads/perfis/<nome>.
 * - Fotos do pedido (US10) e imagens do chat (US12): pasta uploads/servicos,
 *   que NAO e publica. So as duas partes do servico abrem esses arquivos, pela
 *   rota com login GET /api/servicos/:id/arquivos/:nome.
 *
 * Hoje grava em disco, na pasta uploads/ (ou UPLOADS_DIR). Todo o resto do
 * sistema so conhece estas funcoes, entao trocar por um armazenamento
 * externo (S3 ou similar) mexe apenas neste arquivo.
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

function pastaServicos() {
  return path.join(raizUploads(), 'servicos');
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

// Grava com nome aleatorio e devolve o nome.
async function gravar(pasta, buffer, ext) {
  await fs.mkdir(pasta, { recursive: true });
  const nome = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(pasta, nome), buffer);
  return nome;
}

// Apaga sem reclamar se o arquivo ja nao existe.
async function apagar(pasta, nome) {
  try {
    await fs.unlink(path.join(pasta, nome));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

// Devolve a URL relativa da foto salva.
async function salvarFotoPerfil(buffer, ext) {
  return `${PREFIXO}${await gravar(pastaPerfis(), buffer, ext)}`;
}

// Apaga o arquivo se a URL for de uma foto nossa. Qualquer outro valor
// (vazio, endereco externo antigo) e ignorado, e nunca sai da pasta.
async function removerFotoPerfil(url) {
  if (typeof url !== 'string' || !url.startsWith(PREFIXO)) return;
  const nome = url.slice(PREFIXO.length);
  if (!NOME_VALIDO.test(nome)) return;
  await apagar(pastaPerfis(), nome);
}

// So expoe para o front fotos que estao no nosso armazenamento.
function urlPublica(url) {
  return typeof url === 'string' && url.startsWith(PREFIXO) && NOME_VALIDO.test(url.slice(PREFIXO.length))
    ? url
    : null;
}

// US10 / US12 - devolve so o nome; o arquivo nunca tem URL publica.
async function salvarArquivoServico(buffer, ext) {
  return gravar(pastaServicos(), buffer, ext);
}

async function removerArquivoServico(nome) {
  if (typeof nome !== 'string' || !NOME_VALIDO.test(nome)) return;
  await apagar(pastaServicos(), nome);
}

// Caminho no disco de um arquivo de servico, ou null se o nome nao e nosso.
function caminhoArquivoServico(nome) {
  return typeof nome === 'string' && NOME_VALIDO.test(nome) ? path.join(pastaServicos(), nome) : null;
}

module.exports = {
  raizUploads,
  pastaPerfis,
  detectarTipo,
  salvarFotoPerfil,
  removerFotoPerfil,
  urlPublica,
  salvarArquivoServico,
  removerArquivoServico,
  caminhoArquivoServico
};
