import { useEffect, useState } from 'react';
import { api } from '../servicos/api';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import Avatar from '../componentes/Avatar';
import { IconeBusca } from '../componentes/Icones';
import './prestadores.css';

// Listagem simples: existe para provar as US05, US07 e US08.
// A busca por categoria e bairro, com ordenação por avaliação, é a US09.
export default function Prestadores() {
  const [somenteMulheres, setSomenteMulheres] = useState(false);
  const [prestadores, setPrestadores] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api.listarPrestadores({ somente_mulheres: somenteMulheres })
      .then((dados) => { if (ativo) { setPrestadores(dados.prestadores || []); setErro(''); } })
      .catch((e) => { if (ativo) setErro(e.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [somenteMulheres]);

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
                </>
              )}
          </p>

          <div className="filtros">
            <label className={`alternador ${somenteMulheres ? 'alternador--ativo' : ''}`}>
              <input
                type="checkbox"
                checked={somenteMulheres}
                onChange={(e) => setSomenteMulheres(e.target.checked)}
              />
              Apenas mulheres
            </label>

            {somenteMulheres && (
              <Botao tipo="texto" type="button" onClick={() => setSomenteMulheres(false)}>Limpar filtro</Botao>
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
            <h3>Ninguém encontrado</h3>
            <p>
              {somenteMulheres
                ? 'Ainda não há prestadoras disponíveis. Tire o filtro para ver todo mundo.'
                : 'Ainda não há profissionais com o perfil completo.'}
            </p>
            {somenteMulheres && (
              <Botao tipo="secundario" type="button" onClick={() => setSomenteMulheres(false)} className="botao--curto">
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
