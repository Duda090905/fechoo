import { useEffect, useMemo, useState } from 'react';
import { api } from '../servicos/api';
import Campo from '../componentes/Campo';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import Avatar from '../componentes/Avatar';
import { IconeEscudo, IconeBusca } from '../componentes/Icones';
import './prestadores.css';

// Listagem simples: existe para provar as US07 e US08.
// A busca completa, com ordenação por avaliação, é a US09.
export default function Prestadores() {
  const [areas, setAreas] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [categoria, setCategoria] = useState('');
  const [bairro, setBairro] = useState('');
  const [somenteMulheres, setSomenteMulheres] = useState(false);
  const [prestadores, setPrestadores] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([api.areas(), api.bairros()])
      .then(([a, b]) => { setAreas(a.areas || []); setBairros(b.bairros || []); })
      .catch((e) => setErro(e.message));
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

  // As categorias mais buscadas viram atalho; o resto fica no select.
  const atalhos = useMemo(() => areas.flatMap((a) => a.categorias).slice(0, 8), [areas]);

  function limpar() {
    setCategoria('');
    setBairro('');
    setSomenteMulheres(false);
  }

  const temFiltro = categoria || bairro || somenteMulheres;

  return (
    <>
      <div className="lista-topo">
        <div className="lista-topo__interno">
          <h1>Profissionais</h1>
          <p className="lista-topo__resumo">
            {carregando
              ? 'Procurando quem atende por aí...'
              : (
                <>
                  <strong>{prestadores.length}</strong>
                  {prestadores.length === 1 ? ' profissional disponível' : ' profissionais disponíveis'}
                  {bairro && bairros.length > 0 && ` em ${bairros.find((b) => String(b.id) === String(bairro))?.nome}`}
                </>
              )}
          </p>

          {atalhos.length > 0 && (
            <div className="trilho" role="group" aria-label="Filtrar por serviço">
              <button
                type="button"
                className={`trilho__item ${!categoria ? 'trilho__item--ativo' : ''}`}
                onClick={() => setCategoria('')}
              >
                Todos
              </button>
              {atalhos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`trilho__item ${String(categoria) === String(c.id) ? 'trilho__item--ativo' : ''}`}
                  onClick={() => setCategoria(String(c.id))}
                >
                  {c.nome}
                </button>
              ))}
            </div>
          )}

          <div className="filtros">
            <Campo etiqueta="">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Serviço">
                <option value="">Todos os serviços</option>
                {areas.map((area) => (
                  <optgroup key={area.id} label={area.nome}>
                    {area.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </optgroup>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="">
              <select value={bairro} onChange={(e) => setBairro(e.target.value)} aria-label="Bairro">
                <option value="">Todos os bairros</option>
                {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </Campo>

            <label className={`alternador ${somenteMulheres ? 'alternador--ativo' : ''}`}>
              <input
                type="checkbox"
                checked={somenteMulheres}
                onChange={(e) => setSomenteMulheres(e.target.checked)}
              />
              Apenas mulheres
            </label>

            <span className="filtros__separador" />

            {temFiltro && (
              <Botao tipo="texto" type="button" onClick={limpar}>Limpar filtros</Botao>
            )}
          </div>
        </div>
      </div>

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
            <h3>Ninguém encontrado com esses filtros</h3>
            <p>Tente outro bairro, ou tire o filtro de serviço para ver todo mundo.</p>
            {temFiltro && (
              <Botao tipo="secundario" type="button" onClick={limpar} className="botao--curto">
                Ver todos os profissionais
              </Botao>
            )}
          </div>
        )}

        {!carregando && prestadores.map((p) => (
          <article className="ficha" key={p.id}>
            <div className="ficha__topo">
              <Avatar nome={p.nome} foto={p.foto_url} />
              <div style={{ minWidth: 0 }}>
                <h2 className="ficha__nome">{p.nome}</h2>
                <div className="ficha__selos">
                  {p.verificado && (
                    <span className="etiqueta etiqueta--ativo">
                      <IconeEscudo width="14" height="14" /> Verificado
                    </span>
                  )}
                  {p.atende_apenas_mulheres && (
                    <span className="etiqueta">Atende apenas mulheres</span>
                  )}
                </div>
              </div>
            </div>

            {p.descricao && <p className="ficha__descricao">{p.descricao}</p>}

            <div className="ficha__categorias">
              {p.categorias.map((c) => <span className="etiqueta" key={c.id}>{c.nome}</span>)}
            </div>

            <div className="ficha__rodape">
              <IconeBusca width="17" height="17" />
              <span>{p.bairros.map((b) => b.nome).join(' · ') || 'Bairro não informado'}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
