import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../servicos/api';
import Aviso from '../componentes/Aviso';
import Botao from '../componentes/Botao';
import { IconeCadeado, IconeCarteira } from '../componentes/Icones';
import { formatarDinheiro } from '../utils/formatos';
import './painel.css';
import './extrato.css';

// US22 - Extrato do prestador: por período, bruto, taxa e líquido de cada
// serviço, os totais, os valores ainda congelados e a exportação em CSV.

function hojeMenos(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

function inicioDoMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const ATALHOS = [
  { rotulo: 'Este mês', de: () => inicioDoMes(), ate: () => hojeMenos(0) },
  { rotulo: 'Últimos 30 dias', de: () => hojeMenos(30), ate: () => hojeMenos(0) },
  { rotulo: 'Tudo', de: () => '', ate: () => '' }
];

export default function Extrato() {
  const [de, setDe] = useState(inicioDoMes());
  const [ate, setAte] = useState(hojeMenos(0));
  const [extrato, setExtrato] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async (filtro) => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await api.extrato(filtro);
      setExtrato(dados.extrato);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar({ de: inicioDoMes(), ate: hojeMenos(0) }); }, [carregar]);

  function filtrar(evento) {
    evento.preventDefault();
    carregar({ de, ate });
  }

  function atalho(a) {
    const novo = { de: a.de(), ate: a.ate() };
    setDe(novo.de);
    setAte(novo.ate);
    carregar(novo);
  }

  async function exportar() {
    setExportando(true);
    setErro('');
    try {
      await api.baixarExtratoCsv({ de, ate });
    } catch (e) {
      setErro(e.message);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="pagina pagina--extrato">
      <div className="painel-topo">
        <h1>Extrato</h1>
        <p className="subtitulo">O que você recebeu pelo Fechô, já sem a taxa, e o que ainda está congelado.</p>
      </div>

      <form className="cartao extrato-filtro" onSubmit={filtrar}>
        <div className="extrato-filtro__campos">
          <label className="campo">
            <span className="campo__etiqueta">De</span>
            <input className="campo__entrada" type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="campo">
            <span className="campo__etiqueta">Até</span>
            <input className="campo__entrada" type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} />
          </label>
          <Botao type="submit" tipo="escuro" className="botao--curto" carregando={carregando}>Filtrar</Botao>
        </div>
        <div className="extrato-filtro__atalhos">
          {ATALHOS.map((a) => (
            <button key={a.rotulo} type="button" className="extrato-filtro__atalho" onClick={() => atalho(a)}>{a.rotulo}</button>
          ))}
        </div>
      </form>

      <Aviso>{erro}</Aviso>

      {extrato === null && !carregando && !erro && (
        <div className="cartao"><p>Monte o seu <Link to="/meu-perfil">perfil de profissional</Link> para começar a receber.</p></div>
      )}

      {extrato && (
        <>
          <div className="extrato-totais">
            <div className="extrato-total">
              <span>Bruto</span>
              <strong>{formatarDinheiro(extrato.totais.bruto)}</strong>
            </div>
            <div className="extrato-total">
              <span>Taxa do Fechô</span>
              <strong>− {formatarDinheiro(extrato.totais.taxa)}</strong>
            </div>
            <div className="extrato-total extrato-total--liquido">
              <span>Líquido recebido</span>
              <strong>{formatarDinheiro(extrato.totais.liquido)}</strong>
              <small>{extrato.totais.servicos === 1 ? '1 serviço' : `${extrato.totais.servicos} serviços`} no período</small>
            </div>
          </div>

          <section className="cartao">
            <div className="entre extrato-cabeca">
              <h2>Recebidos</h2>
              <Botao tipo="secundario" className="botao--curto" type="button" carregando={exportando} onClick={exportar}>
                Exportar CSV
              </Botao>
            </div>
            {extrato.linhas.length === 0 ? (
              <p className="subtitulo">Nenhum repasse neste período.</p>
            ) : (
              <div className="extrato-tabela">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Serviço</th>
                      <th className="num">Bruto</th>
                      <th className="num">Taxa</th>
                      <th className="num">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extrato.linhas.map((l) => (
                      <tr key={l.servico_id}>
                        <td>{new Date(l.data).toLocaleDateString('pt-BR')}</td>
                        <td>
                          <Link to={`/servicos/${l.servico_id}`} className="extrato-servico">{l.cliente}</Link>
                          <span className="extrato-origem">
                            {l.origem}{l.com_complementar ? ' · com valor complementar' : ''}
                          </span>
                        </td>
                        <td className="num">{formatarDinheiro(l.bruto)}</td>
                        <td className="num">
                          {l.taxa > 0 ? <>− {formatarDinheiro(l.taxa)} <small>({String(l.taxa_percentual).replace('.', ',')}%)</small></> : '—'}
                        </td>
                        <td className="num"><strong>{formatarDinheiro(l.liquido)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Total</td>
                      <td className="num">{formatarDinheiro(extrato.totais.bruto)}</td>
                      <td className="num">− {formatarDinheiro(extrato.totais.taxa)}</td>
                      <td className="num"><strong>{formatarDinheiro(extrato.totais.liquido)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <section className="cartao extrato-retidos">
            <div className="entre extrato-cabeca">
              <h2><IconeCadeado width="18" height="18" aria-hidden="true" /> Ainda congelados</h2>
              <strong className="extrato-retidos__total">{formatarDinheiro(extrato.retidos.total)}</strong>
            </div>
            <p className="subtitulo">Valores já pagos pelos clientes que ainda não saíram para você. Não entram nos totais acima.</p>
            {extrato.retidos.itens.length === 0 ? (
              <p className="extrato-vazio"><IconeCarteira width="18" height="18" aria-hidden="true" /> Nada congelado agora.</p>
            ) : (
              <ul className="extrato-retidos__lista">
                {extrato.retidos.itens.map((r) => (
                  <li key={`${r.servico_id}-${r.tipo}`}>
                    <Link to={`/servicos/${r.servico_id}`}>
                      <span>
                        <b>{r.cliente}</b>
                        <small>{r.situacao}{r.tipo === 'complementar' ? ' · valor complementar' : ''}</small>
                      </span>
                      <strong>{formatarDinheiro(r.valor)}</strong>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
