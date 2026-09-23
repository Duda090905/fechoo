import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../servicos/api';
import Campo from '../componentes/Campo';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import MolduraAuth from '../componentes/MolduraAuth';

export default function RedefinirSenha() {
  const [parametros] = useSearchParams();
  const token = parametros.get('token') || '';
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const navegar = useNavigate();

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    if (senha !== confirmacao) { setErro('As duas senhas precisam ser iguais.'); return; }

    setEnviando(true);
    try {
      await api.redefinirSenha({ token, senha });
      setPronto(true);
      setTimeout(() => navegar('/entrar'), 1800);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <MolduraAuth titulo="Link inválido" subtitulo="Esse endereço não tem o código de redefinição.">
        <Link to="/esqueci-senha">Pedir um link novo</Link>
      </MolduraAuth>
    );
  }

  return (
    <MolduraAuth titulo="Nova senha" subtitulo="Escolha uma senha que você lembre.">
      <form onSubmit={enviar}>
        <Aviso>{erro}</Aviso>
        <Aviso tipo="sucesso">{pronto ? 'Senha alterada. Levando você para o login...' : ''}</Aviso>
        <Campo etiqueta="Nova senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} ajuda="Mínimo de 8 caracteres, com letra e número." required />
        <Campo etiqueta="Repita a nova senha" type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required />
        <Botao type="submit" carregando={enviando}>Salvar senha</Botao>
      </form>
    </MolduraAuth>
  );
}
