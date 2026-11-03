import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../servicos/api';
import { useAuth } from '../contexto/AuthContexto';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import Avatar from '../componentes/Avatar';
import PedirOrcamento from '../componentes/PedirOrcamento';
import { Estrelas } from '../componentes/AndamentoServico';
import { IconeBusca, IconeEstrela, IconeLocal, IconeSelo } from '../componentes/Icones';
import './prestadores.css';

// US09 - Busca por categoria e bairro.
// A busca é uma frase: "Preciso de [serviço] no bairro [bairro]". Os filtros
// ficam na URL, então dá para voltar, recarregar e compartilhar a busca.
// US24 - o contratante vê o que outros clientes disseram antes de contratar.
function AvaliacoesDoPrestador({ prestadorId }) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');

  function alternar() {
    const abrir = !aberto;
    setAberto(abrir);
    if (abrir && !lista) {
      api.avaliacoesDoPrestador(prestadorId)
        .then((d) => setLista(d.avaliacoes || []))
        .catch((e) => setErro(e.message));
    }
  }

  return (
    <div className="ficha__avaliacoes">
      <button type="button" className="ficha__ver" onClick={alternar} aria-expanded={aberto}>
        {aberto ? 'Esconder avaliações' : 'Ver avaliações'}
      </button>
      {aberto && (
        <div className="ficha__lista">
          {erro && <p className="ficha__vazio">{erro}</p>}
          {!erro && !lista && <p className="ficha__vazio">Carregando...</p>}
          {lista && lista.map((a, i) => (
            <div className="ficha__avaliacao" key={i}>
              <div className="ficha__avaliacao-topo">
                <Estrelas nota={a.nota} tamanho={14} />
                <span>{a.autor} · {new Date(a.em).toLocaleDateString('pt-BR')}</span>
              </div>
              {a.comentario && <p>{a.comentario}</p>}
              {a.resposta && <p className="ficha__resposta"><strong>Resposta:</strong> {a.resposta}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Prestadores() {
  const { usuario } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const categoria = parametros.get('categoria') || '';
  const bairro = parametros.get('bairro') || '';
  const somenteMulheres = parametros.get('mulheres') === '1';

  const [areas, setAreas] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [prestadores, setPrestadores] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [escolhido, setEscolhido] = useState(null); // prestador do pedido de orçamento (US10)

  useEffect(() => {
    api.areas().then((d) => setAreas(d.areas || [])).catch(() => setAreas([]));
    api.bairros().then((d) => setBairros(d.bairros || [])).catch(() => setBairros([]));
  }, []);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api.listarPrestadores({ categoria, bairro, somente_mulheres: somenteMulheres })
      .then((dados) => { if (ativo) { setPrestadores(dados.prestadores || []); setErro(''); } })
      .catch((e) => { if (ativo) setErro(e.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [categoria, bairro, somenteMulheres]);

  function mudarFiltro(chave, valor) {
    const novos = new URLSearchParams(parametros);
    if (valor) novos.set(chave, valor); else novos.delete(chave);
    setParametros(novos, { replace: true });
  }

  const nomeCategoria = useMemo(() => {
    const todas = areas.flatMap((a) => a.categorias);
    return todas.find((c) => String(c.id) === categoria)?.nome || '';
  }, [areas, categoria]);
  const nomeBairro = bairros.find((b) => String(b.id) === bairro)?.nome || '';

  // Mensagem que orienta quando a busca não encontra ninguém.
  function orientacao() {
    if (nomeCategoria && nomeBairro) {
      return {
        titulo: `Ninguém atende ${nomeCategoria.toLowerCase()} no bairro ${nomeBairro} ainda`,
        texto: 'Tente procurar em todos os bairros: quem atende longe pode cobrar uma taxa de deslocamento.'
      };
    }
    if (nomeCategoria) {
      return { titulo: `Ainda não há profissionais de ${nomeCategoria.toLowerCase()}`, texto: 'Escolha outro serviço na frase acima.' };
    }
    if (nomeBairro) {
      return { titulo: `Ainda não há profissionais no bairro ${nomeBairro}`, texto: 'Tente procurar em todos os bairros.' };
    }
    return {
      titulo: 'Ninguém encontrado',
      texto: somenteMulheres
        ? 'Ainda não há prestadoras disponíveis. Desligue o filtro para ver todo mundo.'
        : 'Ainda não há profissionais com o perfil completo.'
    };
  }

  const podePedir = !usuario || usuario.tipo_perfil === 'contratante';

  return (
    <>
      <section className="busca" aria-label="Buscar profissionais">
        <div className="busca__interno">
          <p className="busca__frase">
            <span>Preciso de</span>{' '}
            {/* A lacuna mostra o texto escolhido; o select nativo fica por cima,
                invisível, e abre a lista do próprio aparelho. */}
            <label className="lacuna">
              <span className="sr-only">Serviço</span>
              <span className="lacuna__texto" aria-hidden="true">{nomeCategoria || 'qualquer serviço'}</span>
              <select value={categoria} onChange={(e) => mudarFiltro('categoria', e.target.value)}>
                <option value="">qualquer serviço</option>
                {areas.map((area) => (
                  <optgroup key={area.id} label={area.nome}>
                    {area.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <br />
            <span>no bairro</span>{' '}
            <label className="lacuna">
              <span className="sr-only">Bairro</span>
              <span className="lacuna__texto" aria-hidden="true">{nomeBairro || 'qualquer um'}</span>
              <select value={bairro} onChange={(e) => mudarFiltro('bairro', e.target.value)}>
                <option value="">qualquer um</option>
                {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </label>
          </p>

          <div className="busca__rodape">
            <label className={`alternador alternador--escuro ${somenteMulheres ? 'alternador--ativo' : ''}`}>
              <input
                type="checkbox"
                checked={somenteMulheres}
                onChange={(e) => mudarFiltro('mulheres', e.target.checked ? '1' : '')}
              />
              Apenas mulheres
            </label>
            <p className="busca__total" aria-live="polite">
              {carregando
                ? 'Procurando...'
                : prestadores.length === 0 ? 'Nenhum profissional encontrado'
                  : prestadores.length === 1 ? '1 profissional encontrado' : `${prestadores.length} profissionais encontrados`}
            </p>
          </div>
        </div>
      </section>

      <div className={`resultados ${!carregando && prestadores.length === 1 ? 'resultados--unico' : ''}`}>
        {erro && <div style={{ gridColumn: '1 / -1' }}><Aviso>{erro}</Aviso></div>}

        {carregando && [0, 1, 2, 3].map((i) => (
          <article className="ficha esqueleto" key={i} aria-hidden="true">
            <div className="ficha__topo">
              <div className="esqueleto__barra" style={{ width: 52, height: 52, borderRadius: 16, flex: '0 0 52px' }} />
              <div style={{ flex: 1 }}>
                <div className="esqueleto__barra" style={{ height: 17, width: '58%', marginBottom: 9 }} />
                <div className="esqueleto__barra" style={{ height: 13, width: '36%' }} />
              </div>
            </div>
            <div className="esqueleto__barra" style={{ height: 12, marginBottom: 8 }} />
            <div className="esqueleto__barra" style={{ height: 12, width: '82%', marginBottom: 20 }} />
            <div className="esqueleto__barra" style={{ height: 28, width: '62%', borderRadius: 999 }} />
          </article>
        ))}

        {!carregando && !erro && prestadores.length === 0 && (
          <div className="nada">
            <span className="nada__icone"><IconeBusca width="26" height="26" /></span>
            <h3>{orientacao().titulo}</h3>
            <p>{orientacao().texto}</p>
            <div className="linha" style={{ justifyContent: 'center' }}>
              {bairro && (
                <Botao tipo="secundario" type="button" className="botao--curto" onClick={() => mudarFiltro('bairro', '')}>
                  Procurar em todos os bairros
                </Botao>
              )}
              {categoria && !bairro && (
                <Botao tipo="secundario" type="button" className="botao--curto" onClick={() => mudarFiltro('categoria', '')}>
                  Ver todos os serviços
                </Botao>
              )}
              {somenteMulheres && !categoria && !bairro && (
                <Botao tipo="secundario" type="button" className="botao--curto" onClick={() => mudarFiltro('mulheres', '')}>
                  Ver todos os profissionais
                </Botao>
              )}
            </div>
          </div>
        )}

        {!carregando && prestadores.map((p) => {
          const soMulheres = p.atende_apenas_mulheres && usuario && usuario.sexo !== 'feminino';
          return (
            <article className="ficha" key={p.id}>
              <div className="ficha__topo">
                <Avatar nome={p.nome} foto={p.foto_url} />
                <div style={{ minWidth: 0 }}>
                  <h2 className="ficha__nome">
                    {p.nome}
                    {p.verificado && (
                      <span className="selo" title="Identidade verificada">
                        <IconeSelo width="15" height="15" aria-hidden="true" />
                        Verificado
                      </span>
                    )}
                  </h2>
                  <div className="ficha__numeros">
                    {p.nota_media !== null ? (
                      <span className="ficha__nota">
                        <IconeEstrela width="15" height="15" aria-hidden="true" />
                        {p.nota_media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        <span className="sr-only"> de nota média</span>
                        {/* US24 - de quantas avaliações vem a nota */}
                        {p.total_avaliacoes > 0 && (
                          <span className="ficha__total">({p.total_avaliacoes} {p.total_avaliacoes === 1 ? 'avaliação' : 'avaliações'})</span>
                        )}
                      </span>
                    ) : (
                      <span>Sem avaliações ainda</span>
                    )}
                    <span className="ficha__separador" aria-hidden="true" />
                    <span>
                      {p.servicos_concluidos === 0
                        ? 'Nenhum serviço concluído'
                        : `${p.servicos_concluidos} ${p.servicos_concluidos === 1 ? 'serviço concluído' : 'serviços concluídos'}`}
                    </span>
                  </div>
                </div>
              </div>

              {p.descricao && <p className="ficha__descricao">{p.descricao}</p>}

              {p.total_avaliacoes > 0 && <AvaliacoesDoPrestador prestadorId={p.id} />}

              <div className="ficha__categorias">
                {p.atende_apenas_mulheres && <span className="etiqueta etiqueta--forte">Atende apenas mulheres</span>}
                {p.categorias.map((c) => <span className="etiqueta" key={c.id}>{c.nome}</span>)}
              </div>

              <div className="ficha__rodape">
                <span className="ficha__bairros">
                  <IconeLocal width="17" height="17" aria-hidden="true" />
                  <span>{p.bairros.map((b) => b.nome).join(', ') || 'Bairro não informado'}</span>
                </span>
                {podePedir && (
                  <Botao
                    tipo="escuro"
                    type="button"
                    className="botao--curto"
                    disabled={soMulheres}
                    title={soMulheres ? 'Esta profissional atende apenas mulheres' : undefined}
                    onClick={() => setEscolhido(p)}
                  >
                    Pedir orçamento
                  </Botao>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {escolhido && (
        <PedirOrcamento
          prestador={escolhido}
          bairros={bairros}
          bairroInicial={bairro}
          categoriaId={categoria}
          aoFechar={() => setEscolhido(null)}
        />
      )}
    </>
  );
}
