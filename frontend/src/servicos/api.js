const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3333/api';

export const SESSAO_EXPIRADA = 'fecho:sessao-expirada';

function pegarToken() {
  try { return localStorage.getItem('fecho_token'); } catch { return null; }
}

// Fotos ficam em /uploads, na raiz da API (fora de /api).
const ORIGEM_API = BASE.replace(/\/api\/?$/, '');

// Endereco completo de uma foto guardada pela API. Prévias locais (blob:)
// passam direto.
export function urlDaFoto(caminho) {
  if (!caminho) return '';
  if (/^(blob:|https?:)/i.test(caminho)) return caminho;
  return `${ORIGEM_API}${caminho}`;
}

async function requisitar(caminho, { metodo = 'GET', corpo, autenticado = false } = {}) {
  // FormData (envio de arquivo) leva o Content-Type do proprio navegador,
  // com o limite do multipart; JSON leva o cabecalho padrao.
  const arquivo = corpo instanceof FormData;
  const cabecalhos = arquivo ? {} : { 'Content-Type': 'application/json' };
  if (autenticado) {
    const token = pegarToken();
    if (token) cabecalhos.Authorization = `Bearer ${token}`;
  }

  let resposta;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? (arquivo ? corpo : JSON.stringify(corpo)) : undefined
    });
  } catch {
    throw new Error('Nao consegui falar com o servidor. Confira se a API esta rodando.');
  }

  const dados = await resposta.json().catch(() => ({}));

  // US02 - token expirado ou encerrado: avisa o app para voltar ao login.
  // So vale para chamadas autenticadas; no login, 401 e senha errada.
  if (resposta.status === 401 && autenticado) {
    window.dispatchEvent(new Event(SESSAO_EXPIRADA));
  }

  if (!resposta.ok) throw new Error(dados.erro || 'Algo deu errado. Tente de novo.');
  return dados;
}

// US10 / US12 - fotos do pedido e imagens do chat nao sao publicas: a API so
// entrega com login. Baixa o arquivo e devolve um endereco local (blob:).
export async function baixarArquivoProtegido(caminho) {
  const token = pegarToken();
  let resposta;
  try {
    resposta = await fetch(`${BASE}${caminho}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error('Não consegui baixar a imagem.');
  }
  if (resposta.status === 401) window.dispatchEvent(new Event(SESSAO_EXPIRADA));
  if (!resposta.ok) throw new Error('Imagem indisponível.');
  return URL.createObjectURL(await resposta.blob());
}

export const api = {
  cadastrar: (corpo) => requisitar('/auth/register', { metodo: 'POST', corpo }),
  entrar: (corpo) => requisitar('/auth/login', { metodo: 'POST', corpo }),
  esqueciSenha: (corpo) => requisitar('/auth/esqueci-senha', { metodo: 'POST', corpo }),
  redefinirSenha: (corpo) => requisitar('/auth/redefinir-senha', { metodo: 'POST', corpo }),

  minhaConta: () => requisitar('/conta', { autenticado: true }),
  pendencias: () => requisitar('/conta/pendencias', { autenticado: true }),
  desativarConta: (corpo) => requisitar('/conta', { metodo: 'DELETE', corpo, autenticado: true }),
  reativarConta: () => requisitar('/conta/reativar', { metodo: 'POST', autenticado: true }),
  excluirDefinitivo: (corpo) => requisitar('/conta/definitiva', { metodo: 'DELETE', corpo, autenticado: true }),
  // US26 (curinga CC06)
  trocarSenha: (corpo) => requisitar('/conta/senha', { metodo: 'PUT', corpo, autenticado: true }),

  areas: () => requisitar('/catalogo/areas'),
  bairros: () => requisitar('/catalogo/bairros'),

  meuPerfil: () => requisitar('/prestadores/meu-perfil', { autenticado: true }),
  salvarPerfil: (corpo) => requisitar('/prestadores/meu-perfil', { metodo: 'PUT', corpo, autenticado: true }),
  enviarFoto: (arquivo) => {
    const form = new FormData();
    form.append('foto', arquivo);
    return requisitar('/prestadores/foto', { metodo: 'PUT', corpo: form, autenticado: true });
  },
  removerFoto: () => requisitar('/prestadores/foto', { metodo: 'DELETE', autenticado: true }),
  alternarPausa: () => requisitar('/prestadores/pausa', { metodo: 'PATCH', autenticado: true }),

  listarPrestadores: (filtros = {}) => {
    const busca = new URLSearchParams();
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor !== '' && valor !== undefined && valor !== null && valor !== false) {
        busca.append(chave, valor);
      }
    });
    const query = busca.toString();
    return requisitar(`/prestadores${query ? `?${query}` : ''}`);
  },

  // US10 / US13 - pedido com fotos (FormData), lista e agenda
  criarServico: (form) => requisitar('/servicos', { metodo: 'POST', corpo: form, autenticado: true }),
  listarServicos: () => requisitar('/servicos', { autenticado: true }),
  agenda: () => requisitar('/servicos/agenda', { autenticado: true }),
  servico: (id) => requisitar(`/servicos/${id}`, { autenticado: true }),
  enviarOrcamento: (id, corpo) => requisitar(`/servicos/${id}/orcamento`, { metodo: 'POST', corpo, autenticado: true }),
  recusarOrcamento: (id) => requisitar(`/servicos/${id}/recusar`, { metodo: 'POST', autenticado: true }),

  // US12 - chat
  mensagens: (id, depois = 0) => requisitar(`/servicos/${id}/mensagens${depois ? `?depois=${depois}` : ''}`, { autenticado: true }),
  enviarMensagem: (id, form) => requisitar(`/servicos/${id}/mensagens`, { metodo: 'POST', corpo: form, autenticado: true })
};
