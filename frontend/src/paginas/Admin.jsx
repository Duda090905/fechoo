import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../servicos/api';
import Aviso from '../componentes/Aviso';
import Botao from '../componentes/Botao';
import Campo from '../componentes/Campo';
import { IconeEscudo, IconeRelogio } from '../componentes/Icones';
import { NOMES_STATUS, formatarDataHora, formatarDinheiro } from '../utils/formatos';
import './painel.css';
import './servicos.css';
import './admin.css';

// US25 - Painel do administrador: fila de disputas, suspensão preventiva,
// relatório e o registro de cada decisão.

const ABAS = [
  { chave: 'disputas', rotulo: 'Disputas' },
  { chave: 'profissionais', rotulo: 'Profissionais' },
  { chave: 'relatorio', rotulo: 'Relatório' },
  { chave: 'registro', rotulo: 'Registro' }
];

const DECISOES = { devolver: 'Devolvido ao cliente', liberar: 'Liberado ao profissional', dividir: 'Dividido' };
const ACOES = { decisao_disputa: 'Decisão de disputa', suspensao: 'Suspensão preventiva', reativacao: 'Suspensão retirada' };

function Fila() {
  const [status, setStatus] = useState('aberta');
  const [disputas, setDisputas] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setDisputas(null);
    api.adminDisputas(status).then((d) => setDisputas(d.disputas)).catch((e) => setErro(e.message));
  }, [status]);

  return (
    <>
      <div className="admin-filtro">
        {[['aberta', 'Esperando decisão'], ['decidida', 'Decididas'], ['todas', 'Todas']].map(([v, r]) => (
          <button key={v} type="button" className={`extrato-filtro__atalho ${status === v ? 'admin-filtro--ativo' : ''}`} onClick={() => setStatus(v)}>{r}</button>
        ))}
      </div>
      <Aviso>{erro}</Aviso>
      {!disputas ? <p className="subtitulo">Carregando...</p> : disputas.length === 0 ? (
        <div className="cartao admin-vazio">
          <IconeEscudo width="22" height="22" aria-hidden="true" />
          <p>{status === 'aberta' ? 'Nenhuma disputa esperando decisão.' : 'Nenhuma disputa por aqui.'}</p>
        </div>
      ) : (
        <ul className="admin-fila">
          {disputas.map((d) => (
            <li key={d.id}>
              <Link to={`/admin/disputas/${d.id}`} className={`admin-fila__item ${d.atrasada ? 'admin-fila__item--atrasada' : ''}`}>
                <span className="admin-fila__topo">
                  <b>#{d.id} · {d.servico.categoria || 'Serviço'} em {d.servico.bairro}</b>
                  {d.status === 'aberta'
                    ? <span className={`status ${d.tem_defesa ? 'status--concluido' : 'status--em_disputa'}`}>{d.tem_defesa ? 'Com defesa' : 'Sem defesa'}</span>
                    : <span className="status status--confirmado">{DECISOES[d.decisao]}</span>}
                </span>
                <span className="admin-fila__partes">{d.contratante?.nome} × {d.prestador?.nome}</span>
                <span className="admin-fila__texto">“{d.justificativa}”</span>
                <span className="admin-fila__meta">
                  <strong>{formatarDinheiro(d.valor_congelado)}</strong> congelados
                  <span>{d.evidencias} {d.evidencias === 1 ? 'evidência' : 'evidências'}</span>
                  <span><IconeRelogio width="14" height="14" aria-hidden="true" /> aberta em {formatarDataHora(d.aberta_em)}</span>
                  {d.atrasada && <span className="admin-atraso">passou dos 7 dias</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Profissionais() {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [aberto, setAberto] = useState(null);
  const [justificativa, setJustificativa] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback((termo = '') => api.adminPrestadores(termo)
    .then((d) => setLista(d.prestadores)).catch((e) => setErro(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  async function alternar(p) {
    if (justificativa.trim().length < 10) { setErro('Escreva a justificativa (pelo menos 10 caracteres).'); return; }
    setEnviando(true);
    setErro('');
    try {
      const dados = await api.adminSuspensao(p.id, { suspender: p.status !== 'suspenso', justificativa: justificativa.trim() });
      setSucesso(dados.mensagem);
      setAberto(null);
      setJustificativa('');
      await carregar(busca);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <form className="admin-busca" onSubmit={(e) => { e.preventDefault(); carregar(busca); }}>
        <input className="campo__entrada" placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Botao type="submit" tipo="escuro" className="botao--curto">Buscar</Botao>
      </form>
      <Aviso>{erro}</Aviso>
      <Aviso tipo="sucesso">{sucesso}</Aviso>
      {!lista ? <p className="subtitulo">Carregando...</p> : (
        <ul className="admin-prestadores">
          {lista.map((p) => (
            <li key={p.id} className="cartao">
              <div className="entre">
                <div>
                  <b>{p.nome}</b>
                  <small className="admin-sub">{p.email}</small>
                </div>
                <span className={`etiqueta ${p.status === 'ativo' ? 'etiqueta--ativo' : p.status === 'suspenso' ? 'admin-suspenso' : 'etiqueta--pausado'}`}>{p.status}</span>
              </div>
              <div className="admin-numeros">
                <span>Nota {p.nota_media === null ? '—' : String(p.nota_media.toFixed(1)).replace('.', ',')} ({p.total_avaliacoes})</span>
                <span>{p.disputas} {p.disputas === 1 ? 'disputa' : 'disputas'}</span>
                <span>Complementar em {p.complementares?.percentual || 0}% dos serviços</span>
                {p.verificado && <span>Identidade verificada</span>}
              </div>
              {p.status === 'suspenso' && p.motivo_suspensao && (
                <p className="admin-motivo">Suspenso em {formatarDataHora(p.suspenso_em)}: {p.motivo_suspensao}</p>
              )}
              {aberto === p.id ? (
                <div className="empilha admin-acao">
                  <Campo etiqueta={p.status === 'suspenso' ? 'Por que retirar a suspensão?' : 'Motivo da suspensão preventiva'}>
                    <textarea className="campo__entrada" rows={2} maxLength={300} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
                  </Campo>
                  <div className="linha">
                    <Botao tipo={p.status === 'suspenso' ? 'escuro' : 'perigo'} className="botao--curto" type="button" carregando={enviando} onClick={() => alternar(p)}>
                      {p.status === 'suspenso' ? 'Retirar suspensão' : 'Suspender agora'}
                    </Botao>
                    <Botao tipo="secundario" className="botao--curto" type="button" onClick={() => setAberto(null)}>Voltar</Botao>
                  </div>
                </div>
              ) : (
                <Botao
                  tipo={p.status === 'suspenso' ? 'secundario' : 'perigo'}
                  className="botao--curto"
                  type="button"
                  onClick={() => { setAberto(p.id); setJustificativa(''); setSucesso(''); setErro(''); }}
                >
                  {p.status === 'suspenso' ? 'Retirar suspensão' : 'Suspender'}
                </Botao>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Relatorio() {
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [rel, setRel] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback((filtro) => api.adminRelatorio(filtro).then((d) => { setRel(d); setErro(''); }).catch((e) => setErro(e.message)), []);
  useEffect(() => { carregar({}); }, [carregar]);

  return (
    <>
      <form className="cartao extrato-filtro" onSubmit={(e) => { e.preventDefault(); carregar({ de, ate }); }}>
        <div className="extrato-filtro__campos">
          <label className="campo"><span className="campo__etiqueta">De</span><input className="campo__entrada" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
          <label className="campo"><span className="campo__etiqueta">Até</span><input className="campo__entrada" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
          <Botao type="submit" tipo="escuro" className="botao--curto">Ver período</Botao>
        </div>
      </form>
      <Aviso>{erro}</Aviso>
      {rel && (
        <div className="admin-relatorio">
          <section className="cartao">
            <h2>Disputas</h2>
            <div className="admin-kpis">
              <div><span>Abertas no período</span><strong>{rel.disputas.abertas_no_periodo}</strong></div>
              <div><span>Decididas</span><strong>{rel.disputas.decididas_no_periodo}</strong></div>
              <div><span>Esperando decisão</span><strong>{rel.disputas.aguardando_decisao}</strong></div>
              <div><span>Tempo médio para decidir</span><strong>{rel.disputas.tempo_medio_decisao_horas === null ? '—' : `${rel.disputas.tempo_medio_decisao_horas} h`}</strong></div>
            </div>
            <ul className="admin-barras">
              {Object.entries(rel.disputas.por_decisao).map(([k, v]) => {
                const total = rel.disputas.decididas_no_periodo || 1;
                return (
                  <li key={k}>
                    <span>{DECISOES[k]}</span>
                    <span className="admin-barras__trilho"><i style={{ width: `${(v / total) * 100}%` }} /></span>
                    <b>{v}</b>
                  </li>
                );
              })}
            </ul>
            <p className="admin-sub">
              Devolvido aos clientes: <b>{formatarDinheiro(rel.disputas.valor_devolvido)}</b> ·
              Liberado aos profissionais: <b>{formatarDinheiro(rel.disputas.valor_liberado)}</b> ·
              Congelado agora em disputa: <b>{formatarDinheiro(rel.disputas.valor_congelado_agora)}</b>
              {rel.disputas.atrasadas > 0 && <> · <span className="admin-atraso">{rel.disputas.atrasadas} passaram dos 7 dias</span></>}
            </p>
          </section>
          <section className="cartao">
            <h2>Dinheiro</h2>
            <div className="admin-kpis">
              <div><span>Volume liberado</span><strong>{formatarDinheiro(rel.dinheiro.volume_liberado)}</strong></div>
              <div><span>Taxas do Fechô</span><strong>{formatarDinheiro(rel.dinheiro.taxas_arrecadadas)}</strong></div>
              <div><span>Líquido aos profissionais</span><strong>{formatarDinheiro(rel.dinheiro.liquido_aos_profissionais)}</strong></div>
              <div><span>Repasses</span><strong>{rel.dinheiro.repasses}</strong></div>
            </div>
          </section>
          <section className="cartao">
            <h2>Serviços</h2>
            <p className="admin-sub">{rel.servicos.total} pedidos no período · {String(rel.servicos.taxa_de_disputa).replace('.', ',')}% viraram disputa · {rel.prestadores_suspensos} profissionais suspensos agora · {rel.complementares.total} propostas complementares</p>
            <div className="admin-status">
              {Object.entries(rel.servicos.por_status).map(([k, v]) => (
                <span key={k} className={`status status--${k}`}>{NOMES_STATUS[k] || k}: {v}</span>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Registro() {
  const [acoes, setAcoes] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => { api.adminAcoes().then((d) => setAcoes(d.acoes)).catch((e) => setErro(e.message)); }, []);
  return (
    <>
      <Aviso>{erro}</Aviso>
      {!acoes ? <p className="subtitulo">Carregando...</p> : acoes.length === 0 ? (
        <p className="subtitulo">Nenhuma decisão registrada ainda.</p>
      ) : (
        <ol className="admin-registro">
          {acoes.map((a) => (
            <li key={a.id} className="cartao">
              <div className="entre">
                <b>{ACOES[a.acao] || a.acao}</b>
                <small className="admin-sub">{formatarDataHora(a.em)} · {a.por}</small>
              </div>
              {a.detalhe && <p className="admin-sub">{a.detalhe}</p>}
              <p><b>Justificativa:</b> {a.justificativa}</p>
              {a.alvo_tipo === 'disputa' && <Link to={`/admin/disputas/${a.alvo_id}`}>Ver a disputa #{a.alvo_id}</Link>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export default function Admin() {
  const [busca, setBusca] = useSearchParams();
  const aba = ABAS.some((a) => a.chave === busca.get('aba')) ? busca.get('aba') : 'disputas';
  return (
    <div className="pagina pagina--admin">
      <div className="painel-topo">
        <h1>Painel do Fechô</h1>
        <p className="subtitulo">Disputas, suspensões e os números da plataforma. Toda decisão fica registrada com quem decidiu, quando e por quê.</p>
      </div>
      <div className="abas" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            role="tab"
            aria-selected={aba === a.chave}
            className={`abas__item ${aba === a.chave ? 'abas__item--ativa' : ''}`}
            onClick={() => setBusca({ aba: a.chave })}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {aba === 'disputas' && <Fila />}
      {aba === 'profissionais' && <Profissionais />}
      {aba === 'relatorio' && <Relatorio />}
      {aba === 'registro' && <Registro />}
    </div>
  );
}
