import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexto/AuthContexto';
import { IconeMenu, IconeFechar } from './Icones';
import './cabecalho.css';

export default function Cabecalho() {
  const { usuario, sair } = useAuth();
  const [aberto, setAberto] = useState(false);
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const naHome = pathname === '/';

  function sairEIr() {
    setAberto(false);
    sair();
    navegar('/entrar');
  }

  const links = (
    <>
      {naHome && !usuario && (
        <>
          <a href="#como-funciona" onClick={() => setAberto(false)}>Como funciona</a>
          <a href="#servicos" onClick={() => setAberto(false)}>Serviços</a>
        </>
      )}
      <Link to="/prestadores" onClick={() => setAberto(false)}>Profissionais</Link>
      {usuario ? (
        <>
          {usuario.tipo_perfil === 'prestador' && (
            <Link to="/meu-perfil" onClick={() => setAberto(false)}>Meu perfil</Link>
          )}
          <Link to="/minha-conta" onClick={() => setAberto(false)}>Minha conta</Link>
          <button type="button" onClick={sairEIr}>Sair</button>
        </>
      ) : (
        <>
          <Link to="/entrar" onClick={() => setAberto(false)}>Entrar</Link>
          <Link to="/criar-conta" className="cabecalho__cta" onClick={() => setAberto(false)}>
            Criar conta
          </Link>
        </>
      )}
    </>
  );

  return (
    <header className={`cabecalho ${naHome ? 'cabecalho--home' : ''}`}>
      <div className="cabecalho__interno">
        <Link to="/" className="marca" onClick={() => setAberto(false)}>Fechô</Link>

        <nav className="cabecalho__menu">{links}</nav>

        <button
          type="button"
          className="cabecalho__hamburguer"
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? <IconeFechar /> : <IconeMenu />}
        </button>
      </div>

      {aberto && <nav className="cabecalho__gaveta">{links}</nav>}
    </header>
  );
}
