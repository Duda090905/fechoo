import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../servicos/api';
import { useAuth } from '../contexto/AuthContexto';
import Campo from '../componentes/Campo';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import { formatarTelefone } from '../utils/formatos';
import './painel.css';

export default function MinhaConta() {
  const { usuario, atualizarUsuario, sair } = useAuth();
  const inativa = usuario?.status === 'inativo';

  const [pendencias, setPendencias] = useState([]);
  const [etapa, setEtapa] = useState('nenhuma'); // nenhuma | desativar | apagar
  const [confirmacao, setConfirmacao] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const navegar = useNavigate();

  useEffect(() => {
    api.pendencias().then((d) => setPendencias(d.pendencias || [])).catch(() => setPendencias([]));
  }, []);

  async function reativar() {
    setErro(''); setMensagem('');
    try {
      const dados = await api.reativarConta();
      atualizarUsuario(dados.usuario);
      setMensagem(dados.mensagem);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function desativar() {
    setErro('');
    try {
      await api.desativarConta({ confirmacao });
      const dados = await api.minhaConta();
      atualizarUsuario(dados.usuario);
      setEtapa('nenhuma');
      setConfirmacao('');
      setMensagem('Conta desativada. Você pode reativar a qualquer momento.');
    } catch (e) {
      setErro(e.message);
    }
  }

  async function apagar() {
    setErro('');
    try {
      await api.excluirDefinitivo({ confirmacao });
      sair();
      navegar('/criar-conta');
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <div className="pagina">
      <div className="painel-topo">
        <div>
          <h1>Minha conta</h1>
          <p className="subtitulo" style={{ marginBottom: 0 }}>{usuario?.email}</p>
        </div>
        {!inativa && (
          <span className="etiqueta etiqueta--ativo"><span className="ponto ponto--verde" /> Conta ativa</span>
        )}
      </div>

      <Aviso>{erro}</Aviso>
      <Aviso tipo="sucesso">{mensagem}</Aviso>

      {inativa && (
        <div className="cartao">
          <h2>Sua conta está desativada</h2>
          <p style={{ color: 'var(--texto-suave)', fontSize: 15 }}>
            Ninguém te encontra nas buscas e você não consegue contratar nem ser contratada.
            Seu cadastro, seu histórico e suas avaliações continuam guardados.
          </p>
          <Botao type="button" onClick={reativar}>Reativar minha conta</Botao>
        </div>
      )}

      <div className="cartao">
        <h2>Meus dados</h2>
        <div>
          <div className="dado">
            <span className="dado__rotulo">Nome</span>
            <span className="dado__valor">{usuario?.nome}</span>
          </div>
          <div className="dado">
            <span className="dado__rotulo">Telefone</span>
            <span className="dado__valor">{formatarTelefone(usuario?.telefone) || 'não informado'}</span>
          </div>
          <div className="dado">
            <span className="dado__rotulo">Tipo de perfil</span>
            <span className="dado__valor">
              {usuario?.tipo_perfil === 'prestador' ? 'Prestador de serviço' : 'Contratante'}
            </span>
          </div>
        </div>
      </div>
      {!inativa && (
        <div className="cartao cartao--perigo">
          <h2>Desativar minha conta</h2>
          <p style={{ color: 'var(--texto-suave)', fontSize: 15 }}>
            Você sai das buscas e perde o acesso, mas nada é apagado. Dá para voltar quando quiser,
            com o mesmo histórico e as mesmas avaliações.
          </p>

          {pendencias.length > 0 && (
            <Aviso tipo="neutro">
              <strong>Não dá para desativar agora.</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {pendencias.map((p, i) => <li key={i}>{p.descricao}</li>)}
              </ul>
            </Aviso>
          )}

          {etapa !== 'desativar' ? (
            <Botao tipo="perigo" type="button" disabled={pendencias.length > 0} onClick={() => { setEtapa('desativar'); setConfirmacao(''); }}>
              Desativar minha conta
            </Botao>
          ) : (
            <>
              <Campo
                etiqueta="Digite DESATIVAR para confirmar"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value.toUpperCase())}
                placeholder="DESATIVAR"
              />
              <div className="empilha">
                <Botao tipo="perigo" type="button" onClick={desativar}>Confirmar desativação</Botao>
                <Botao tipo="secundario" type="button" onClick={() => { setEtapa('nenhuma'); setConfirmacao(''); }}>Cancelar</Botao>
              </div>
            </>
          )}
        </div>
      )}

      {inativa && (
        <div className="cartao cartao--perigo">
          <h2>Apagar meus dados</h2>
          <p style={{ color: 'var(--texto-suave)', fontSize: 15 }}>
            Apaga nome, e-mail, CPF e telefone em definitivo, conforme a LGPD. A conta não volta
            e você não recupera suas avaliações.
          </p>

          {etapa !== 'apagar' ? (
            <Botao tipo="perigo" type="button" onClick={() => { setEtapa('apagar'); setConfirmacao(''); }}>
              Apagar meus dados
            </Botao>
          ) : (
            <>
              <Campo
                etiqueta="Digite APAGAR MEUS DADOS para confirmar"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value.toUpperCase())}
                placeholder="APAGAR MEUS DADOS"
              />
              <div className="empilha">
                <Botao tipo="perigo" type="button" onClick={apagar}>Apagar em definitivo</Botao>
                <Botao tipo="secundario" type="button" onClick={() => { setEtapa('nenhuma'); setConfirmacao(''); }}>Cancelar</Botao>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
