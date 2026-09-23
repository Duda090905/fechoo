import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../servicos/api';
import Campo from '../componentes/Campo';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import MolduraAuth from '../componentes/MolduraAuth';

export default function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setErro(''); setMensagem(''); setEnviando(true);
    try {
      const dados = await api.esqueciSenha({ email });
      setMensagem(dados.mensagem);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MolduraAuth
      titulo="Esqueci minha senha"
      subtitulo="Mandamos um link para você criar uma nova."
      rodape={<p className="rodape-form"><Link to="/entrar">Voltar para entrar</Link></p>}
    >
      <form onSubmit={enviar}>
        <Aviso>{erro}</Aviso>
        <Aviso tipo="sucesso">{mensagem}</Aviso>
        <Campo etiqueta="E-mail da conta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Botao type="submit" carregando={enviando}>Enviar link</Botao>
      </form>
    </MolduraAuth>
  );
}
