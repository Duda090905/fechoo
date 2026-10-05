const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3333/api';

export const SESSAO_EXPIRADA = 'fecho:sessao-expirada';

function pegarToken() {
  try { return localStorage.getItem('fecho_token'); } catch { return null; }
}

async function requisitar(caminho, { metodo = 'GET', corpo, autenticado = false } = {}) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  if (autenticado) {
    const token = pegarToken();
    if (token) cabecalhos.Authorization = `Bearer ${token}`;
  }

  let resposta;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? JSON.stringify(corpo) : undefined
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

export const api = {
  cadastrar: (corpo) => requisitar('/auth/register', { metodo: 'POST', corpo }),
  entrar: (corpo) => requisitar('/auth/login', { metodo: 'POST', corpo }),
  esqueciSenha: (corpo) => requisitar('/auth/esqueci-senha', { metodo: 'POST', corpo }),
  redefinirSenha: (corpo) => requisitar('/auth/redefinir-senha', { metodo: 'POST', corpo }),

  minhaConta: () => requisitar('/conta', { autenticado: true }),
  atualizarConta: (corpo) => requisitar('/conta', { metodo: 'PUT', corpo, autenticado: true }),
  pendencias: () => requisitar('/conta/pendencias', { autenticado: true }),
  desativarConta: (corpo) => requisitar('/conta', { metodo: 'DELETE', corpo, autenticado: true }),
  reativarConta: () => requisitar('/conta/reativar', { metodo: 'POST', autenticado: true }),
  excluirDefinitivo: (corpo) => requisitar('/conta/definitiva', { metodo: 'DELETE', corpo, autenticado: true }),

  areas: () => requisitar('/catalogo/areas'),
  bairros: () => requisitar('/catalogo/bairros'),

  meuPerfil: () => requisitar('/prestadores/meu-perfil', { autenticado: true }),
  salvarPerfil: (corpo) => requisitar('/prestadores/meu-perfil', { metodo: 'PUT', corpo, autenticado: true }),
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
  }
};
