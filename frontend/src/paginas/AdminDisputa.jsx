import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../servicos/api';
import Aviso from '../componentes/Aviso';
import Botao from '../componentes/Botao';
import Campo from '../componentes/Campo';
import ImagemProtegida from '../componentes/ImagemProtegida';
import { IconeVoltar } from '../componentes/Icones';
import { formatarDataHora, formatarDinheiro } from '../utils/formatos';
import './painel.css';
import './servicos.css';
import './admin.css';

// US25 - uma disputa: as evidências das duas partes, a conversa, o histórico,
// a ficha de cada um e a decisão com justificativa.

const DECISOES = [
  { chave: 'devolver', rotulo: 'Devolver ao cliente', ajuda: 'Estorno integral pelo Pix.' },
  { chave: 'liberar', rotulo: 'Liberar ao profissional', ajuda: 'Repasse como na conclusão, já sem a taxa.' },
  { chave: 'dividir', rotulo: 'Dividir', ajuda: 'Uma parte volta ao cliente e o resto vai ao profissional, sem taxa.' }
];

const ACOES_HISTORICO = {
  pagamento_retido: 'Pix confirmado: pagamento congelado', chegada: 'O profissional chegou', inicio: 'Serviço iniciado',
  conclusao: 'Profissional marcou como concluído', disputa_aberta: 'Disputa aberta', disputa_defesa: 'Defesa enviada',
  disputa_decidida: 'Disputa decidida', complementar_proposto: 'Valor complementar proposto'
};

function Fotos({ disputaId, nomes, rotulo, aoAbrir }) {
  if (!nomes?.length) return <p className="admin-sub">Sem fotos.</p>;
  return (
    <div className="disputa__fotos">
      {nomes.map((n, i) => (
        <ImagemProtegida
          key={n}
          caminho={`/admin/disputas/${disputaId}/arquivos/${n}`}
          nome={n}
          alt={`${rotulo} ${i + 1}`}
          className="disputa__foto"
          aoAbrir={aoAbrir}
        />
      ))}
    </div>
  );
}

function Ficha({ titulo, dados, linhas }) {
  if (!dados) return null;
  return (
    <div className="admin-ficha">
      <span className="disputa__quem">{titulo}</span>
      <b>{dados.nome}</b>
      <small className="admin-sub">{dados.email}</small>
      <ul>{linhas.filter(Boolean).map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

export default function AdminDisputa() {
  const { id } = useParams();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [decisao, setDecisao] = useState('');
  const [percentual, setPercentual] = useState(50);
  const [justificativa, setJustificativa] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [foto, setFoto] = useState(null);

  const carregar = useCallback(() => api.adminDisputa(id).then((d) => { setDados(d); setErro(''); }).catch((e) => setErro(e.message)), [id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function decidir(evento) {
    evento.preventDefault();
    if (!decisao) { setErro('Escolha a decisão.'); return; }
    if (justificativa.trim().length < 10) { setErro('Escreva a justificativa (pelo menos 10 caracteres).'); return; }
    setEnviando(true);
    setErro('');
    try {
      const corpo = { decisao, justificativa: justificativa.trim() };
      if (decisao === 'dividir') corpo.percentual_contratante = Number(percentual);
      const r = await api.adminDecidir(id, corpo);
      setSucesso(r.mensagem);
      await carregar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!dados) {
    return (
      <div className="pagina pagina--admin">
        <Link to="/admin" className="voltar"><IconeVoltar width="18" height="18" /> Painel</Link>
        {erro ? <Aviso>{erro}</Aviso> : <p className="subtitulo">Carregando...</p>}
      </div>
    );
  }

  const { disputa: d, servico: s, partes, mensagens, historico, pagamentos } = dados;
  const congelado = d.valor_congelado;
  const previa = decisao === 'devolver' ? [congelado, 0]
    : decisao === 'liberar' ? [0, congelado]
      : decisao === 'dividir' ? [Math.round(congelado * percentual) / 100, Math.round(congelado * (100 - percentual)) / 100] : null;
  const abrir = (url, alt) => setFoto({ url, alt });

  return (
    <div className="pagina pagina--admin">
      <div className="servico-topo">
        <Link to="/admin" className="voltar"><IconeVoltar width="18" height="18" /> Painel</Link>
        <div className="servico-topo__titulo">
          <h1>Disputa #{d.id}</h1>
          <span className={`status ${d.status === 'aberta' ? 'status--em_disputa' : 'status--confirmado'}`}>{d.status === 'aberta' ? 'Esperando decisão' : 'Decidida'}</span>
        </div>
        <p className="subtitulo">
          {s.categoria?.nome || 'Serviço'} em {s.bairro?.nome} · combinado para {formatarDataHora(s.horario)} ·
          {' '}aberta em {formatarDataHora(d.aberta_em)}, com o serviço {d.servico.status_anterior === 'concluido' ? 'já concluído pelo profissional' : 'em execução'}
        </p>
      </div>

      <Aviso>{erro}</Aviso>
      <Aviso tipo="sucesso">{sucesso}</Aviso>

      <div className="admin-grade">
        <div>
          <section className="cartao">
            <h2>O pedido</h2>
            <p className="pedido-texto">{s.descricao}</p>
            <p className="admin-sub">
              Orçamento: {formatarDinheiro(s.orcamento?.valor)}{s.orcamento?.taxa_deslocamento ? ` + ${formatarDinheiro(s.orcamento.taxa_deslocamento)} de deslocamento` : ''}
              {s.complementar && ` · complementar de ${formatarDinheiro(s.complementar.valor)} (${s.complementar.status})`}
            </p>
            {s.fotos?.length > 0 && <Fotos disputaId={d.id} nomes={s.fotos} rotulo="Foto do pedido" aoAbrir={abrir} />}
          </section>

          <section className="cartao">
            <h2>As duas versões</h2>
            <div className="disputa__lado">
              <span className="disputa__quem">Cliente · {partes.contratante?.nome}</span>
              <p>{d.justificativa}</p>
              <Fotos disputaId={d.id} nomes={d.evidencias} rotulo="Evidência do cliente" aoAbrir={abrir} />
            </div>
            <div className="disputa__lado">
              <span className="disputa__quem">Profissional · {partes.prestador?.nome}</span>
              {d.defesa ? (
                <>
                  <p>{d.defesa}</p>
                  <small className="admin-sub">Enviada em {formatarDataHora(d.defesa_em)}</small>
                  <Fotos disputaId={d.id} nomes={d.defesa_evidencias} rotulo="Evidência do profissional" aoAbrir={abrir} />
                </>
              ) : <p className="admin-sub">Ainda sem defesa (prazo até {formatarDataHora(d.prazo_defesa)}).</p>}
            </div>
          </section>

          <section className="cartao">
            <h2>Conversa do serviço</h2>
            {mensagens.length === 0 ? <p className="admin-sub">As partes não trocaram mensagens.</p> : (
              <ol className="admin-chat">
                {mensagens.map((m) => (
                  <li key={m.id} className={`admin-chat__msg admin-chat__msg--${m.de}`}>
                    <small>{m.autor?.nome} · {formatarDataHora(m.enviada_em)}</small>
                    {m.texto && <p>{m.texto}</p>}
                    {m.imagem && <Fotos disputaId={d.id} nomes={[m.imagem]} rotulo="Imagem do chat" aoAbrir={abrir} />}
                    {m.imagem_removida && <p className="admin-sub">Imagem removida pelo prazo de guarda.</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="cartao">
            <h2>Histórico</h2>
            <ol className="admin-historico">
              {historico.map((h, i) => (
                <li key={`${h.acao}-${i}`}><small>{formatarDataHora(h.em)} · {h.quem}</small><span>{h.detalhe || ACOES_HISTORICO[h.acao] || h.acao.replace(/_/g, ' ')}</span></li>
              ))}
            </ol>
          </section>
        </div>

        <aside>
          <section className="cartao admin-decidir">
            <h2>{d.decisao ? 'Decisão' : 'Decidir'}</h2>
            <p className="admin-congelado"><span>Congelado</span><strong>{formatarDinheiro(congelado)}</strong></p>
            {d.decisao ? (
              <div className="disputa__decisao">
                <strong>{DECISOES.find((x) => x.chave === d.decisao.tipo)?.rotulo}</strong>
                <dl>
                  <div><dt>Cliente</dt><dd>{formatarDinheiro(d.decisao.valor_contratante)}</dd></div>
                  <div><dt>Profissional</dt><dd>{formatarDinheiro(d.decisao.valor_prestador)}</dd></div>
                </dl>
                <p><b>Justificativa:</b> {d.decisao.justificativa}</p>
                <p className="admin-sub">Por {d.decisao.por} em {formatarDataHora(d.decisao.em)}</p>
              </div>
            ) : (
              <form className="empilha" onSubmit={decidir}>
                {!d.pode_decidir && <Aviso tipo="neutro">{d.motivo_para_esperar}</Aviso>}
                <div className="admin-opcoes" role="radiogroup" aria-label="Decisão">
                  {DECISOES.map((o) => (
                    <label key={o.chave} className={`admin-opcao ${decisao === o.chave ? 'admin-opcao--ativa' : ''}`}>
                      <input type="radio" name="decisao" value={o.chave} checked={decisao === o.chave} onChange={() => setDecisao(o.chave)} />
                      <span><b>{o.rotulo}</b><small>{o.ajuda}</small></span>
                    </label>
                  ))}
                </div>
                {decisao === 'dividir' && (
                  <label className="campo">
                    <span className="campo__etiqueta">Volta ao cliente: {percentual}%</span>
                    <input type="range" min={1} max={99} value={percentual} onChange={(e) => setPercentual(Number(e.target.value))} />
                  </label>
                )}
                {previa && (
                  <dl className="admin-previa">
                    <div><dt>Cliente recebe</dt><dd>{formatarDinheiro(previa[0])}</dd></div>
                    <div><dt>Profissional recebe</dt><dd>{formatarDinheiro(previa[1])}{decisao === 'liberar' ? ' (menos a taxa)' : ''}</dd></div>
                  </dl>
                )}
                <Campo etiqueta="Justificativa (as duas partes vão ler)">
                  <textarea className="campo__entrada" rows={4} maxLength={1000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
                </Campo>
                <Botao type="submit" carregando={enviando} disabled={!d.pode_decidir}>Registrar decisão</Botao>
              </form>
            )}
          </section>

          <section className="cartao">
            <Ficha
              titulo="Cliente"
              dados={partes.contratante}
              linhas={[`${partes.contratante?.disputas_abertas} disputa(s) aberta(s) no total`, `${partes.contratante?.cancelamentos} cancelamento(s)`]}
            />
            <Ficha
              titulo="Profissional"
              dados={partes.prestador}
              linhas={[
                partes.prestador?.nota_media !== null && partes.prestador ? `Nota ${String(partes.prestador.nota_media).replace('.', ',')} (${partes.prestador.total_avaliacoes} avaliações)` : 'Sem nota ainda',
                `${partes.prestador?.disputas} disputa(s), ${partes.prestador?.disputas_com_devolucao} com devolução`,
                `${partes.prestador?.cancelamentos} cancelamento(s)`,
                `Pediu complementar em ${partes.prestador?.complementares?.percentual || 0}% dos serviços`,
                partes.prestador?.verificado ? 'Identidade verificada' : 'Sem selo de identidade',
                partes.prestador?.status === 'suspenso' ? 'SUSPENSO' : null
              ]}
            />
            <Link to="/admin?aba=profissionais" className="admin-link">Suspensão preventiva em Profissionais</Link>
          </section>

          <section className="cartao">
            <h2>Pagamentos</h2>
            <ul className="admin-pagamentos">
              {pagamentos.map((p) => (
                <li key={p.id}>
                  <span>{p.tipo === 'complementar' ? 'Complementar' : 'Original'} · {p.status}</span>
                  <b>{formatarDinheiro(p.valor)}</b>
                  {p.valor_estorno !== null && <small>Devolvido: {formatarDinheiro(p.valor_estorno)}</small>}
                  {p.valor_repasse !== null && <small>Ao profissional: {formatarDinheiro(p.valor_repasse)}</small>}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {foto && (
        <div className="ampliada" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={() => setFoto(null)}>
          <img src={foto.url} alt={foto.alt} />
        </div>
      )}
    </div>
  );
}
