import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../servicos/api';
import { useAuth } from '../contexto/AuthContexto';
import Aviso from '../componentes/Aviso';
import Botao from '../componentes/Botao';
import { IconeCadeado, IconeCalendario, IconeConversa, IconeLocal } from '../componentes/Icones';
import {
  NOMES_STATUS, chaveDoDia, folhaDoDia, formatarDia, formatarHora
} from '../utils/formatos';
import './painel.css';
import './servicos.css';

const HORA_MS = 60 * 60 * 1000;
const ENCERRADOS = ['concluido', 'confirmado', 'pago', 'em_disputa', 'resolvido', 'recusado', 'cancelado', 'expirado'];

// Grupos da lista de pedidos, na ordem em que aparecem.
const GRUPOS = {
  prestador: [
    // US10 - a lista de pendências do prestador
    { titulo: 'Esperando seu orçamento', filtro: (s) => s.status === 'aguardando_orcamento' },
    { titulo: 'Orçamento enviado', filtro: (s) => s.status === 'orcamento_enviado' },
    { titulo: 'Compromissos', filtro: (s) => ['aceito', 'em_execucao'].includes(s.status) },
    { titulo: 'Encerrados', filtro: (s) => ENCERRADOS.includes(s.status) }
  ],
  contratante: [
    { titulo: 'Aguardando orçamento', filtro: (s) => s.status === 'aguardando_orcamento' },
    { titulo: 'Orçamento enviado', filtro: (s) => s.status === 'orcamento_enviado' },
    { titulo: 'Compromissos', filtro: (s) => ['aceito', 'em_execucao'].includes(s.status) },
    { titulo: 'Encerrados', filtro: (s) => ENCERRADOS.includes(s.status) }
  ]
};

export function EtiquetaStatus({ status }) {
  return <span className={`status status--${status}`}>{NOMES_STATUS[status] || status}</span>;
}

function FolhaDoDia({ data }) {
  const { mes, dia } = folhaDoDia(data);
  return (
    <span className="folha" aria-hidden="true">
      <span className="folha__mes">{mes}</span>
      <span className="folha__dia">{dia}</span>
    </span>
  );
}

function outraParte(servico, papel) {
  return papel === 'prestador' ? servico.contratante?.nome : servico.prestador?.nome;
}

function LinhaPedido({ servico, papel }) {
  return (
    <Link to={`/servicos/${servico.id}`} className="pedido">
      <FolhaDoDia data={servico.horario} />
      <span className="pedido__texto">
        <span className="pedido__quem">{outraParte(servico, papel)}</span>
        <span className="pedido__descricao">{servico.descricao}</span>
        <span className="pedido__meta">
          {formatarDia(servico.horario)}, às {formatarHora(servico.horario)}
          <span className="pedido__bairro"><IconeLocal width="14" height="14" aria-hidden="true" /> {servico.bairro?.nome}</span>
          {/* US17 - Pix gerado, esperando o banco confirmar */}
          {servico.pagamento?.em_aberto && (
            <span className="pedido__pix"><IconeCadeado width="14" height="14" aria-hidden="true" /> Pix esperando pagamento</span>
          )}
        </span>
      </span>
      <EtiquetaStatus status={servico.status} />
    </Link>
  );
}

// US13 - agenda: compromissos depois do aceite, agrupados por dia.
function Agenda({ compromissos, papel }) {
  if (!compromissos.length) {
    return (
      <div className="nada-servicos">
        <span className="nada-servicos__icone"><IconeCalendario width="26" height="26" /></span>
        <h3>Nenhum compromisso marcado</h3>
        <p>
          Quando um orçamento é aceito, o atendimento entra aqui, na sua agenda e na
          {papel === 'prestador' ? ' do cliente' : ' do profissional'}.
          Na véspera, os dois recebem um lembrete por e-mail.
        </p>
      </div>
    );
  }

  const dias = [];
  compromissos.forEach((c) => {
    const chave = chaveDoDia(c.horario);
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.itens.push(c);
    else dias.push({ chave, data: c.horario, itens: [c] });
  });

  return (
    <div className="agenda">
      {dias.map((dia) => (
        <section key={dia.chave} className="agenda__dia">
          <h3 className="agenda__titulo">{formatarDia(dia.data)}</h3>
          <ol className="agenda__lista">
            {dia.itens.map((c) => {
              const fim = new Date(new Date(c.horario).getTime() + (c.orcamento?.prazo_horas || 1) * HORA_MS);
              return (
                <li key={c.id}>
                  <Link to={`/servicos/${c.id}`} className="compromisso">
                    <span className="compromisso__hora">
                      {formatarHora(c.horario)}<span> até {formatarHora(fim)}</span>
                    </span>
                    <span className="compromisso__texto">
                      <span className="pedido__quem">{outraParte(c, papel)}</span>
                      <span className="pedido__descricao">{c.descricao}</span>
                      <span className="pedido__bairro"><IconeLocal width="14" height="14" aria-hidden="true" /> {c.bairro?.nome}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

export default function Servicos() {
  const { usuario } = useAuth();
  const papel = usuario?.tipo_perfil === 'prestador' ? 'prestador' : 'contratante';
  const [parametros, setParametros] = useSearchParams();
  const aba = parametros.get('aba') === 'agenda' ? 'agenda' : 'pedidos';

  const [servicos, setServicos] = useState([]);
  const [compromissos, setCompromissos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [avisos, setAvisos] = useState([]);

  // US11 / US18 - avisos ainda não lidos (pagamento garantido / confirmado)
  useEffect(() => {
    api.notificacoes()
      .then((d) => setAvisos((d.notificacoes || []).filter((n) => !n.lida)))
      .catch(() => {});
  }, []);

  async function marcarLidos() {
    try {
      await api.marcarNotificacoesLidas();
      setAvisos([]);
    } catch (e) {
      setErro(e.message);
    }
  }

  useEffect(() => {
    Promise.all([api.listarServicos(), api.agenda()])
      .then(([lista, agenda]) => {
        setServicos(lista.servicos || []);
        setCompromissos(agenda.compromissos || []);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const pendentes = servicos.filter((s) => s.status === 'aguardando_orcamento').length;
  const grupos = GRUPOS[papel]
    .map((g) => ({ ...g, itens: servicos.filter(g.filtro) }))
    .filter((g) => g.itens.length);

  return (
    <div className="pagina pagina--larga">
      <div className="painel-topo">
        <div>
          <h1>Meus serviços</h1>
          <p className="subtitulo" style={{ marginBottom: 0 }}>
            {papel === 'prestador'
              ? 'Pedidos de orçamento que chegaram para você e a sua agenda.'
              : 'Os orçamentos que você pediu e a sua agenda.'}
          </p>
        </div>
      </div>

      {avisos.length > 0 && (
        <section className="avisos" aria-label="Avisos">
          {avisos.map((a) => (
            <Link key={a.id} to={`/servicos/${a.servico_id}`} className="avisos__item">
              <IconeCadeado width="18" height="18" aria-hidden="true" />
              <span><strong>{a.titulo}</strong>{a.texto}</span>
            </Link>
          ))}
          <div className="avisos__acoes">
            <Botao tipo="texto" type="button" onClick={marcarLidos}>Marcar como lidos</Botao>
          </div>
        </section>
      )}

      <div className="abas" role="tablist" aria-label="Pedidos ou agenda">
        <button
          type="button" role="tab" aria-selected={aba === 'pedidos'}
          className={`abas__item ${aba === 'pedidos' ? 'abas__item--ativa' : ''}`}
          onClick={() => setParametros({}, { replace: true })}
        >
          Pedidos
          {papel === 'prestador' && pendentes > 0 && (
            <span className="abas__contagem" aria-label={`${pendentes} esperando orçamento`}>{pendentes}</span>
          )}
        </button>
        <button
          type="button" role="tab" aria-selected={aba === 'agenda'}
          className={`abas__item ${aba === 'agenda' ? 'abas__item--ativa' : ''}`}
          onClick={() => setParametros({ aba: 'agenda' }, { replace: true })}
        >
          Agenda
        </button>
      </div>

      <Aviso>{erro}</Aviso>
      {carregando && <p className="subtitulo">Carregando...</p>}

      {!carregando && aba === 'pedidos' && (
        grupos.length ? (
          grupos.map((g) => (
            <section key={g.titulo} className="grupo">
              <h2 className="grupo__titulo">{g.titulo} <span>{g.itens.length}</span></h2>
              <div className="grupo__lista">
                {g.itens.map((s) => <LinhaPedido key={s.id} servico={s} papel={papel} />)}
              </div>
            </section>
          ))
        ) : (
          <div className="nada-servicos">
            <span className="nada-servicos__icone"><IconeConversa width="26" height="26" /></span>
            {papel === 'prestador' ? (
              <>
                <h3>Nenhum pedido ainda</h3>
                <p>Quando alguém pedir um orçamento para você, o pedido aparece aqui. Perfil completo e ativo aparece nas buscas.</p>
                <Link className="botao botao--secundario botao--curto" to="/meu-perfil">Ver meu perfil</Link>
              </>
            ) : (
              <>
                <h3>Você ainda não pediu nenhum orçamento</h3>
                <p>Procure um profissional pelo serviço e pelo bairro e peça um orçamento sem compromisso.</p>
                <Link className="botao botao--principal botao--curto" to="/prestadores">Encontrar um profissional</Link>
              </>
            )}
          </div>
        )
      )}

      {!carregando && aba === 'agenda' && <Agenda compromissos={compromissos} papel={papel} />}
    </div>
  );
}
