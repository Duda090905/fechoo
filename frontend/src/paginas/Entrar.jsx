import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../servicos/api';
import { useAuth } from '../contexto/AuthContexto';
import Campo from '../componentes/Campo';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import MolduraAuth from '../componentes/MolduraAuth';

export default function Entrar() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const { autenticar, sessaoExpirada } = useAuth();
  const navegar = useNavigate();

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const dados = await api.entrar({ email, senha });
      autenticar(dados.token, dados.usuario);
      if (dados.conta_inativa) {
        navegar('/minha-conta');
        return;
      }
      navegar(dados.usuario.tipo_perfil === 'prestador' ? '/meu-perfil' : '/prestadores');
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MolduraAuth
      titulo="Entrar"
      subtitulo="Bom te ver de novo."
      rodape={(
        <>
          <p className="rodape-form"><Link to="/esqueci-senha">Esqueci minha senha</Link></p>
          <p className="rodape-form">Ainda não tem conta? <Link to="/criar-conta">Criar conta</Link></p>
        </>
      )}
    >
      <form onSubmit={enviar}>
        <Aviso tipo="neutro">{sessaoExpirada ? 'Sua sessão terminou. Entre de novo para continuar.' : ''}</Aviso>
        <Aviso>{erro}</Aviso>
        <Campo etiqueta="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <Campo etiqueta="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" />
        <Botao type="submit" carregando={enviando}>Entrar</Botao>
      </form>
    </MolduraAuth>
  );
}
