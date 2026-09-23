import { useEffect, useState } from 'react';
import { api } from '../servicos/api';
import { useAuth } from '../contexto/AuthContexto';
import Campo from '../componentes/Campo';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import Selecao from '../componentes/Selecao';
import { IconeEscudo, IconeBusca } from '../componentes/Icones';
import './painel.css';

const LIMITE = 5;
const VAZIO = { descricao: '', categorias: [], bairros: [], atende_apenas_mulheres: false };

export default function MeuPerfil() {
  const { usuario } = useAuth();
  const [areas, setAreas] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [perfil, setPerfil] = useState(VAZIO);      // o que está salvo
  const [rascunho, setRascunho] = useState(VAZIO);  // o que está sendo editado
  const [editando, setEditando] = useState(false);
  const [status, setStatus] = useState('ativo');
  const [temPerfil, setTemPerfil] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const [dadosAreas, dadosBairros, dadosPerfil] = await Promise.all([
          api.areas(), api.bairros(), api.meuPerfil()
        ]);
        setAreas(dadosAreas.areas || []);
        setBairros(dadosBairros.bairros || []);

        const p = dadosPerfil.prestador;
        if (p && p.categorias.length) {
          const salvo = {
            descricao: p.descricao || '',
            categorias: p.categorias.map((c) => c.id),
            bairros: p.bairros.map((b) => b.id),
            atende_apenas_mulheres: p.atende_apenas_mulheres
          };
          setPerfil(salvo);
          setRascunho(salvo);
          setStatus(p.status);
          setTemPerfil(true);
        } else {
          // Perfil ainda não montado: já abre em modo de edição.
          setEditando(true);
        }
      } catch (e) {
        setErro(e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  function alternar(campo, id) {
    setRascunho((atual) => {
      const lista = atual[campo];
      return {
        ...atual,
        [campo]: lista.includes(id) ? lista.filter((item) => item !== id) : [...lista, id]
      };
    });
  }

  function comecarEdicao() {
    setRascunho(perfil);
    setMensagem('');
    setErro('');
    setEditando(true);
  }

  function cancelar() {
    setRascunho(perfil);
    setErro('');
    setEditando(false);
  }

  async function salvar(evento) {
    evento.preventDefault();
    setErro(''); setMensagem('');

    if (!rascunho.categorias.length) { setErro('Escolha ao menos uma categoria de serviço.'); return; }
    if (!rascunho.bairros.length) { setErro('Escolha ao menos um bairro que você atende.'); return; }

    setSalvando(true);
    try {
      await api.salvarPerfil(rascunho);
      setPerfil(rascunho);
      setTemPerfil(true);
      setEditando(false);
      setMensagem('Perfil atualizado.');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function pausar() {
    setErro(''); setMensagem('');
    try {
      const dados = await api.alternarPausa();
      setStatus(dados.status);
      setMensagem(dados.mensagem);
    } catch (e) {
      setErro(e.message);
    }
  }

  function nomesDe(ids, fonte) {
    return fonte.filter((item) => ids.includes(item.id)).map((item) => item.nome);
  }

  const todasCategorias = areas.flatMap((a) => a.categorias);

  if (carregando) return <div className="pagina"><p className="subtitulo">Carregando seu perfil...</p></div>;

  return (
    <div className="pagina pagina--larga">
      <div className="painel-topo">
        <div>
          <h1>Meu perfil</h1>
          <p className="subtitulo" style={{ marginBottom: 0 }}>
            {editando ? 'Alterando. Nada muda até você salvar.' : 'É isso que as pessoas veem sobre você.'}
          </p>
        </div>
        {temPerfil && (
          <span className={`etiqueta etiqueta--${status === 'ativo' ? 'ativo' : 'pausado'}`}>
            <span className={`ponto ponto--${status === 'ativo' ? 'verde' : 'amarelo'}`} />
            {status === 'ativo' ? 'Aparecendo nas buscas' : 'Perfil pausado'}
          </span>
        )}
      </div>

      <Aviso>{erro}</Aviso>
      <Aviso tipo="sucesso">{mensagem}</Aviso>

      {!editando ? (
        <>
          <div className="cartao cartao--perfil">
            <div className="perfil-capa">
              <span className="ficha__avatar">{(usuario?.nome || '?').trim().charAt(0).toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: '0 0 4px' }}>{usuario?.nome}</h2>
                <p style={{ margin: 0, color: 'var(--texto-claro)', fontSize: 14.5 }}>
                  Prestador de serviço
                </p>
              </div>
              <Botao tipo="secundario" className="botao--curto" type="button" onClick={comecarEdicao}>
                Editar perfil
              </Botao>
            </div>

            <p className="perfil-descricao">
              {perfil.descricao || 'Você ainda não escreveu nada sobre o seu trabalho.'}
            </p>

            <div className="bloco">
              <h3>O que você faz</h3>
              <div className="linha">
                {nomesDe(perfil.categorias, todasCategorias).map((nome) => (
                  <span className="etiqueta" key={nome}>{nome}</span>
                ))}
              </div>
            </div>

            <div className="bloco">
              <h3>Onde você atende</h3>
              <div className="bloco__texto">
                <IconeBusca width="17" height="17" />
                <span>{nomesDe(perfil.bairros, bairros).join(' · ') || 'Nenhum bairro selecionado.'}</span>
              </div>
            </div>

            {perfil.atende_apenas_mulheres && (
              <div className="bloco">
                <span className="etiqueta etiqueta--ativo">
                  <IconeEscudo width="14" height="14" /> Atende apenas mulheres
                </span>
              </div>
            )}
          </div>

          <div className="cartao">
            <h2>{status === 'ativo' ? 'Precisa dar uma pausa?' : 'Pronto para voltar?'}</h2>
            <p style={{ color: 'var(--texto-suave)', fontSize: 15 }}>
              {status === 'ativo'
                ? 'Enquanto pausado você não aparece nas buscas, mas seu perfil e seu histórico continuam guardados.'
                : 'Seu perfil volta a aparecer para quem procura profissionais.'}
            </p>
            <Botao tipo="secundario" type="button" onClick={pausar}>
              {status === 'ativo' ? 'Pausar meu perfil' : 'Voltar a aparecer'}
            </Botao>
          </div>
        </>
      ) : (
        <form onSubmit={salvar}>
          <div className="cartao">
            <h2>Sobre o seu trabalho</h2>
            <Campo etiqueta="Descrição">
              <textarea
                value={rascunho.descricao}
                onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
                placeholder="Conte em poucas linhas o que você faz e há quanto tempo."
                maxLength={600}
              />
            </Campo>
          </div>

          <div className="cartao">
            <h2>O que você faz</h2>
            <div className="contador">
              <p>Escolha até {LIMITE} categorias</p>
              <span className="contador__marca">{rascunho.categorias.length} de {LIMITE}</span>
            </div>
            <div className="contador__trilha">
              <span style={{ width: `${(rascunho.categorias.length / LIMITE) * 100}%` }} />
            </div>
            {areas.map((area) => (
              <div key={area.id} style={{ marginBottom: 14 }}>
                <span className="etiqueta" style={{ marginBottom: 8 }}>{area.nome}</span>
                <Selecao
                  opcoes={area.categorias}
                  selecionados={rascunho.categorias}
                  limite={LIMITE}
                  aoAlternar={(id) => alternar('categorias', id)}
                />
              </div>
            ))}
          </div>

          <div className="cartao">
            <h2>Onde você atende</h2>
            <p style={{ color: 'var(--texto-suave)', fontSize: 15 }}>Selecione os bairros de Campinas.</p>
            <Selecao
              opcoes={bairros}
              selecionados={rascunho.bairros}
              aoAlternar={(id) => alternar('bairros', id)}
            />
          </div>

          {usuario?.sexo === 'feminino' && (
            <div className="cartao">
              <h2>Atendimento entre mulheres</h2>
              <label className={`marcar ${rascunho.atende_apenas_mulheres ? 'marcar--marcado' : ''}`}>
                <input
                  type="checkbox"
                  checked={rascunho.atende_apenas_mulheres}
                  onChange={(e) => setRascunho({ ...rascunho, atende_apenas_mulheres: e.target.checked })}
                />
                <span>Quero atender apenas mulheres. Você pode mudar isso quando quiser.</span>
              </label>
            </div>
          )}

          <div className="empilha">
            <Botao type="submit" carregando={salvando}>Salvar alterações</Botao>
            {temPerfil && (
              <Botao tipo="secundario" type="button" onClick={cancelar}>Cancelar</Botao>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
