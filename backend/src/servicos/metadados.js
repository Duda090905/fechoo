/**
 * US10 / US12 - tira os metadados das fotos do pedido e das imagens do chat.
 *
 * Foto tirada no celular costuma levar a localizacao do aparelho (GPS) dentro
 * do arquivo (EXIF/XMP). Como o contratante tira a foto em casa, entregar o
 * arquivo como veio revelaria o endereco ao prestador antes do aceite, o que
 * a plataforma promete nao fazer. Aqui saem os blocos de metadados; a imagem
 * em si nao e tocada (nada e recomprimido).
 *
 * Recebe o buffer ja conferido por detectarTipo e devolve outro buffer.
 */

// JPEG: APP1 (EXIF e XMP, onde fica o GPS), APP13 (IPTC) e comentarios.
// Ficam APP0 (JFIF), APP2 (perfil de cor) e APP14 (Adobe), que afetam as cores.
const JPEG_REMOVER = new Set([0xe1, 0xed, 0xfe]);

function limparJpeg(buffer) {
  const partes = [buffer.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= buffer.length) {
    if (buffer[i] !== 0xff) return null; // estrutura inesperada
    const marcador = buffer[i + 1];
    if (marcador === 0xff) { i += 1; continue; } // bytes de preenchimento
    // SOS: daqui em diante sao os dados da imagem, copiados como estao.
    if (marcador === 0xda) {
      partes.push(buffer.subarray(i));
      return Buffer.concat(partes);
    }
    const tamanho = buffer.readUInt16BE(i + 2);
    const fim = i + 2 + tamanho;
    if (tamanho < 2 || fim > buffer.length) return null;
    if (!JPEG_REMOVER.has(marcador)) partes.push(buffer.subarray(i, fim));
    i = fim;
  }
  return null;
}

// PNG: blocos de texto (tEXt, zTXt, iTXt, onde fica o XMP) e eXIf.
const PNG_REMOVER = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf']);

function limparPng(buffer) {
  const partes = [buffer.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buffer.length) {
    const tamanho = buffer.readUInt32BE(i);
    const tipo = buffer.subarray(i + 4, i + 8).toString('latin1');
    const fim = i + 12 + tamanho;
    if (fim > buffer.length) return null;
    if (!PNG_REMOVER.has(tipo)) partes.push(buffer.subarray(i, fim));
    i = fim;
    if (tipo === 'IEND') return Buffer.concat(partes);
  }
  return null;
}

// WebP: blocos EXIF e XMP, e as marcacoes correspondentes no cabecalho VP8X.
function limparWebp(buffer) {
  const partes = [];
  let i = 12;
  while (i + 8 <= buffer.length) {
    const tipo = buffer.subarray(i, i + 4).toString('latin1');
    const tamanho = buffer.readUInt32LE(i + 4);
    const fim = i + 8 + tamanho + (tamanho % 2);
    if (i + 8 + tamanho > buffer.length) return null;
    if (tipo !== 'EXIF' && tipo !== 'XMP ') {
      const bloco = Buffer.from(buffer.subarray(i, Math.min(fim, buffer.length)));
      // bits 3 (EXIF) e 2 (XMP) do primeiro byte de dados do VP8X
      if (tipo === 'VP8X' && bloco.length > 8) bloco[8] &= ~0x0c;
      partes.push(bloco);
    }
    i = fim;
  }
  const corpo = Buffer.concat(partes);
  const cabecalho = Buffer.from(buffer.subarray(0, 12));
  cabecalho.writeUInt32LE(corpo.length + 4, 4);
  return Buffer.concat([cabecalho, corpo]);
}

// Devolve a imagem sem metadados, ou null se o arquivo estiver corrompido.
function semMetadados(buffer, ext) {
  try {
    if (ext === 'jpg') return limparJpeg(buffer);
    if (ext === 'png') return limparPng(buffer);
    if (ext === 'webp') return limparWebp(buffer);
  } catch {
    return null;
  }
  return null;
}

module.exports = { semMetadados };
