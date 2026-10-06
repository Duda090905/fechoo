import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, SESSAO_EXPIRADA } from '../servicos/api';

const AuthContexto = createContext(null);

function guardar(token, usuario) {
  try {
    if (token) localStorage.setItem('fecho_token', token);
    if (usuario) localStorage.setItem('fecho_usuario', JSON.stringify(usuario));
  } catch { /* navegador sem storage: segue so em memoria */ }
}

function limpar() {
  try {
    localStorage.removeItem('fecho_token');
    localStorage.removeItem('fecho_usuario');
  } catch { /* ignora */ }
}

function usuarioSalvo() {
  try {
    const bruto = localStorage.getItem('fecho_usuario');
    return bruto ? JSON.parse(bruto) : null;
  } catch { return null; }
}

export function ProvedorAuth({ children }) {
  const [usuario, setUsuario] = useState(usuarioSalvo);
  const [carregando, setCarregando] = useState(true);
  const [sessaoExpirada, setSessaoExpirada] = useState(false);

  // Qualquer chamada autenticada que volte 401 derruba a sessao; as rotas
  // privadas mandam a pessoa para o login.
  useEffect(() => {
    function aoExpirar() {
      limpar();
      setUsuario(null);
      setSessaoExpirada(true);
    }
    window.addEventListener(SESSAO_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(SESSAO_EXPIRADA, aoExpirar);
  }, []);

  useEffect(() => {
    let ativo = true;
    async function conferirSessao() {
      let token = null;
      try { token = localStorage.getItem('fecho_token'); } catch { token = null; }
      if (!token) { if (ativo) setCarregando(false); return; }
      try {
        const dados = await api.minhaConta();
        if (ativo) { setUsuario(dados.usuario); guardar(null, dados.usuario); }
      } catch {
        limpar();
        if (ativo) setUsuario(null);
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    conferirSessao();
    return () => { ativo = false; };
  }, []);

  const valor = useMemo(() => ({
    usuario,
    carregando,
    sessaoExpirada,
    autenticar(token, dadosUsuario) {
      guardar(token, dadosUsuario);
      setSessaoExpirada(false);
      setUsuario(dadosUsuario);
    },
    atualizarUsuario(dadosUsuario) {
      guardar(null, dadosUsuario);
      setUsuario(dadosUsuario);
    },
    sair() {
      limpar();
      setSessaoExpirada(false);
      setUsuario(null);
    }
  }), [usuario, carregando, sessaoExpirada]);

  return <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContexto);
  if (!contexto) throw new Error('useAuth precisa estar dentro de ProvedorAuth');
  return contexto;
}
