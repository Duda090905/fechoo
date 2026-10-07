// Mascaras e validacoes dos formularios. As regras de verdade ficam no backend;
// aqui o objetivo e avisar a pessoa antes do envio.

export function soDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

export function formatarCpf(valor) {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Mesma conta dos digitos verificadores que o backend faz (utils/cpf.js).
export function cpfValido(valor) {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (ate) => {
    let soma = 0;
    for (let i = 0; i < ate; i += 1) soma += Number(cpf[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

export function formatarTelefone(valor) {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Obrigatorio: precisa ter DDD + 8 ou 9 digitos.
export function telefoneValido(valor) {
  const d = soDigitos(valor);
  return d.length === 10 || d.length === 11;
}

// Sprint 2 ------------------------------------------------------------------

const ZONA = 'America/Sao_Paulo';

export function formatarDinheiro(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "150,50" ou "150.50" -> 150.5. Vazio: ''. Invalido: NaN.
export function lerDinheiro(texto) {
  const limpo = String(texto ?? '').trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!limpo) return '';
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const numero = Number(normal);
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : NaN;
}

// "quinta-feira, 14 de outubro"
export function formatarDia(data) {
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });
}

// "14:00"
export function formatarHora(data) {
  return new Date(data).toLocaleTimeString('pt-BR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
}

// "qui., 14 de out., às 14:00"
export function formatarDataHora(data) {
  const dia = new Date(data).toLocaleDateString('pt-BR', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short' });
  return `${dia}, às ${formatarHora(data)}`;
}

// Partes para a folha de calendario: { mes: 'out', dia: '14' }
export function folhaDoDia(data) {
  const d = new Date(data);
  return {
    mes: d.toLocaleDateString('pt-BR', { timeZone: ZONA, month: 'short' }).replace('.', ''),
    dia: d.toLocaleDateString('pt-BR', { timeZone: ZONA, day: 'numeric' })
  };
}

// Chave do dia (AAAA-MM-DD) no fuso de Sao Paulo, para agrupar a agenda.
export function chaveDoDia(data) {
  return new Date(data).toLocaleDateString('en-CA', { timeZone: ZONA });
}

export function duracao(horas) {
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

// Valor para <input type="datetime-local"> no horario do aparelho.
export function paraCampoDataHora(data) {
  const d = new Date(data);
  const doisDigitos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`
    + `T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

// Do campo datetime-local (horario do aparelho) para ISO, ou '' se vazio.
export function deCampoDataHora(valor) {
  if (!valor) return '';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '' : data.toISOString();
}

export const NOMES_STATUS = {
  aguardando_orcamento: 'Aguardando orçamento',
  orcamento_enviado: 'Orçamento enviado',
  recusado: 'Recusado',
  aceito: 'Aceito',
  em_execucao: 'Em execução',
  concluido: 'Concluído pelo prestador',
  confirmado: 'Confirmado',
  pago: 'Pago',
  cancelado: 'Cancelado',
  em_disputa: 'Em disputa',
  resolvido: 'Resolvido',
  expirado: 'Expirado'
};
