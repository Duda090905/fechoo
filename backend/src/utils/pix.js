/**
 * US17 - "Pix copia e cola" (BR Code, padrao EMV do Banco Central).
 *
 * O codigo e uma sequencia de campos no formato ID (2 digitos) + tamanho
 * (2 digitos) + valor. O campo 54 e o valor da cobranca e o 63 e um codigo
 * de conferencia (CRC16). O Asaas devolve o codigo pronto; o gateway
 * simulado monta um igual aqui. A leitura do campo 54 serve para conferir
 * que o Pix foi gerado com exatamente o valor do orcamento aceito.
 */

function campo(id, valor) {
  const texto = String(valor);
  return `${id}${String(texto.length).padStart(2, '0')}${texto}`;
}

// CRC16-CCITT (polinomio 0x1021, inicio 0xFFFF), exigido pelo BR Code.
function crc16(texto) {
  let crc = 0xffff;
  for (const caractere of Buffer.from(texto, 'utf8')) {
    crc ^= caractere << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function semAcento(texto, limite) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, limite);
}

/**
 * Monta um BR Code de cobranca.
 * chave: identificacao do recebedor; valor: em reais; txid: ate 25 letras/numeros.
 */
function montarCopiaECola({ chave, valor, nome, cidade, txid }) {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
  const corpo = campo('00', '01')
    + campo('01', '12') // codigo de uso unico
    + campo('26', conta)
    + campo('52', '0000')
    + campo('53', '986') // real
    + campo('54', Number(valor).toFixed(2))
    + campo('58', 'BR')
    + campo('59', semAcento(nome, 25))
    + campo('60', semAcento(cidade, 15))
    + campo('62', campo('05', String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25)))
    + '6304';
  return corpo + crc16(corpo);
}

// Le os campos do primeiro nivel. Devolve null se o codigo estiver quebrado.
function lerCampos(codigo) {
  const campos = {};
  let i = 0;
  const texto = String(codigo || '');
  while (i < texto.length) {
    const id = texto.slice(i, i + 2);
    const tamanho = Number(texto.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(tamanho)) return null;
    campos[id] = texto.slice(i + 4, i + 4 + tamanho);
    i += 4 + tamanho;
  }
  return campos;
}

// Valor (em reais) gravado no Pix copia e cola, ou null se nao houver.
function valorDoPix(codigo) {
  const campos = lerCampos(codigo);
  if (!campos || !campos['54']) return null;
  const valor = Number(campos['54']);
  return Number.isFinite(valor) ? valor : null;
}

// O codigo de conferencia bate com o conteudo?
function crcConfere(codigo) {
  const texto = String(codigo || '');
  if (texto.length < 8) return false;
  return crc16(texto.slice(0, -4)) === texto.slice(-4).toUpperCase();
}

module.exports = { montarCopiaECola, valorDoPix, crcConfere };
