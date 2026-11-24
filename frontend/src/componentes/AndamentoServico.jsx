import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../servicos/api';
import Aviso from './Aviso';
import Botao from './Botao';
import Campo from './Campo';
import { IconeCadeado, IconeEstrela, IconeRelogio } from './Icones';
import {
  deCampoDataHora, formatarDataHora, formatarDinheiro, formatarHora, paraCampoDataHora
} from '../utils/formatos';
import './andamento.css';

// Sprint 4 - o serviço depois do aceite.
//   US20 - Cheguei, iniciar, concluir, confirmar e o repasse
//   US15 - cancelamento com a prévia do valor
//   US14 - pedir nova data e responder
//   US24 - avaliação mútua
// Cada componente recebe o serviço e avisa a página quando algo muda.

const LIMITE_NOVAS_DATAS = 3;

function primeiroNome(nome) {
  return (nome || '').split(' ')[0];
}

function nomeDaOutraParte(servico) {
  return primeiroNome(servico.papel === 'prestador' ? servico.contratante?.nome : servico.prestador?.nome);
}

// Executa uma ação da API e devolve a mensagem para a página.
function useAcao(aoAtualizar) {
  const [carregando, setCarregando] = useState('');
  const [erro, setErro] = useState('');
  async function executar(chave, funcao) {
    setErro('');
    setCarregando(chave);
    try {
      const dados = await funcao();
      await aoAtualizar(dados?.mensagem);
      return true;
    } catch (e) {
      setErro(e.message);
      return false;
    } finally {
      setCarregando('');
    }
  }
  return { carregando, erro, executar, setErro };
}

// Qual "banco" fez o movimento. Nos dois casos não há dinheiro de verdade.
const BANCOS = {
  simulado: 'Simulação do Fechô (sem dinheiro de verdade)',
  asaas: 'Asaas, ambiente de teste (sem dinheiro de verdade)'
};

function Linha({ rotulo, children, destaque = false }) {
  return (
    <div className={destaque ? 'recibo__linha recibo__linha--destaque' : 'recibo__linha'}>
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function porcento(parte, total) {
  return total ? Math.round((parte / total) * 100) : 0;
}

// US20 / US21 / US15 - comprovante do dinheiro: para onde foi, quanto, quando
// e com qual código o banco registrou. O prestador vê a taxa e a chave Pix
// dele; o cliente vê o que pagou e o que voltou.
export function Comprovante({ servico }) {
  const { pagamento, papel } = servico;
  if (!pagamento || !['retido', 'liberado', 'estornado'].includes(pagamento.status)) return null;
  const ehPrestador = papel === 'prestador';
  const nome = nomeDaOutraParte(servico);
  const { repasse, transferencia, estorno } = pagamento;
  const estornado = pagamento.status === 'estornado';
  const pendente = repasse?.pendente;

  // Só depois da confirmação (repasse) ou do cancelamento (estorno).
  if (!estornado && !['confirmado', 'pago'].includes(servico.status)) return null;

  let selo;
  if (estornado) selo = { texto: 'Estornado', classe: 'estornado' };
  else if (pagamento.status === 'liberado') selo = { texto: 'Liberado', classe: 'liberado' };
  else selo = { texto: pendente === 'sem_chave_pix' ? 'Esperando a chave Pix' : 'Esperando o banco', classe: 'pendente' };

  const multa = estornado ? Math.round((pagamento.valor - (estorno?.valor || 0)) * 100) / 100 : 0;

  return (
    <div className="recibo" aria-label="Comprovante do pagamento">
      <div className="recibo__topo">
        <strong>Comprovante do pagamento</strong>
        <span className={`recibo__selo recibo__selo--${selo.classe}`}>{selo.texto}</span>
      </div>

      <dl className="recibo__valores">
        <Linha rotulo={ehPrestador ? 'Pix pago pelo cliente' : 'Pix que você pagou'}>{formatarDinheiro(pagamento.valor)}</Linha>

        {!estornado && ehPrestador && repasse && (
          <>
            <Linha rotulo={`Taxa do Fechô (${repasse.taxa_percentual.toLocaleString('pt-BR')}% do serviço)`}>
              − {formatarDinheiro(repasse.taxa)}
            </Linha>
            <Linha rotulo={repasse.liberado_em ? 'Você recebeu' : 'Você vai receber'} destaque>
              {formatarDinheiro(repasse.valor)}
            </Linha>
          </>
        )}
        {!estornado && !ehPrestador && (
          <Linha rotulo="Situação" destaque>
            {pagamento.status === 'liberado' ? `Liberado para ${nome}` : `Vai para ${nome} assim que o banco concluir`}
          </Linha>
        )}

        {estornado && (
          <>
            <Linha rotulo={`${ehPrestador ? 'Devolvido ao cliente' : 'Devolvido para você'} (${porcento(estorno.valor, pagamento.valor)}%)`} destaque={!ehPrestador}>
              {formatarDinheiro(estorno.valor)}
            </Linha>
            {multa > 0 && (
              <Linha rotulo={`${ehPrestador ? 'Ficou com você' : `Ficou com ${nome}`} (${porcento(multa, pagamento.valor)}%)`} destaque={ehPrestador}>
                {formatarDinheiro(multa)}
              </Linha>
            )}
          </>
        )}
      </dl>

      <dl className="recibo__detalhes">
        {ehPrestador && repasse?.chave && (transferencia || pendente) && (
          <Linha rotulo="Para a sua chave Pix">CPF {repasse.chave}</Linha>
        )}
        {transferencia && (
          <>
            <Linha rotulo={estornado ? 'Parte do profissional enviada em' : 'Enviado em'}>{formatarDataHora(transferencia.em)}</Linha>
            <Linha rotulo="Código da transferência"><code>{transferencia.id}</code></Linha>
          </>
        )}
        {estorno && (
          <>
            <Linha rotulo="Devolvido em">{formatarDataHora(estorno.estornado_em)}</Linha>
            {estorno.id && <Linha rotulo="Código da devolução"><code>{estorno.id}</code></Linha>}
          </>
        )}
        {pagamento.gateway && <Linha rotulo="Banco">{BANCOS[pagamento.gateway] || pagamento.gateway}</Linha>}
      </dl>
    </div>
  );
}

// US20 - o caminho Aceito → Em execução → Concluído → Confirmado → Pago.
export function Andamento({ servico, aoAtualizar, children }) {
  const { carregando, erro, executar } = useAcao(aoAtualizar);
  const { papel, status, pagamento } = servico;
  const nome = nomeDaOutraParte(servico);
  const ehPrestador = papel === 'prestador';

  if (!['aceito', 'em_execucao', 'concluido', 'confirmado', 'pago', 'cancelado'].includes(status)) return null;

  let conteudo = null;

  if (status === 'aceito') {
    conteudo = ehPrestador ? (
      <>
        <p className="andamento__texto">
          O atendimento está marcado para <strong>{formatarDataHora(servico.horario)}</strong>.
          A partir de 1 hora antes, avise que chegou e inicie o serviço.
        </p>
        {servico.chegou_em && <p className="andamento__feito">Você avisou que chegou às {formatarHora(servico.chegou_em)}.</p>}
        <div className="andamento__botoes">
          <Botao type="button" carregando={carregando === 'iniciar'} onClick={() => executar('iniciar', () => api.iniciarServico(servico.id))}>
            Iniciar serviço
          </Botao>
          {!servico.chegou_em && (
            <Botao tipo="secundario" type="button" carregando={carregando === 'cheguei'} onClick={() => executar('cheguei', () => api.cheguei(servico.id))}>
              Cheguei
            </Botao>
          )}
        </div>
      </>
    ) : (
      <p className="andamento__texto">
        {servico.chegou_em
          ? <>{nome} avisou que chegou às <strong>{formatarHora(servico.chegou_em)}</strong>.</>
          : <>O atendimento está marcado para <strong>{formatarDataHora(servico.horario)}</strong>. Quando {nome} chegar, você recebe um aviso.</>}
        {' '}Quando o serviço terminar, você confirma e só então o pagamento é liberado.
      </p>
    );
  }

  if (status === 'em_execucao') {
    conteudo = ehPrestador ? (
      <>
        <p className="andamento__texto">Serviço em andamento desde {formatarHora(servico.iniciado_em)}. Quando terminar, marque como concluído.</p>
        <Botao type="button" carregando={carregando === 'concluir'} onClick={() => executar('concluir', () => api.concluirServico(servico.id))}>
          Marcar como concluído
        </Botao>
      </>
    ) : (
      <p className="andamento__texto">{nome} começou o serviço às {formatarHora(servico.iniciado_em)}. O pagamento continua congelado.</p>
    );
  }

  if (status === 'concluido') {
    conteudo = ehPrestador ? (
      <div className="andamento__espera">
        <IconeRelogio width="20" height="20" aria-hidden="true" />
        <span>
          Esperando {nome} confirmar até <strong>{formatarDataHora(servico.prazo_confirmacao)}</strong>.
          Sem resposta até lá, o serviço é confirmado sozinho e o pagamento é liberado para você.
        </span>
      </div>
    ) : (
      <>
        <div className="andamento__destaque">
          <strong>{nome} terminou o serviço</strong>
          <span>
            Confira se ficou tudo certo e confirme até {formatarDataHora(servico.prazo_confirmacao)}.
            Ao confirmar, o pagamento de {formatarDinheiro(pagamento?.valor)} vai para {nome}.
            Sem resposta até lá, o serviço é confirmado sozinho.
          </span>
        </div>
        <Botao type="button" carregando={carregando === 'confirmar'} onClick={() => executar('confirmar', () => api.confirmarServico(servico.id))}>
          Confirmar que o serviço foi feito
        </Botao>
      </>
    );
  }

  if (status === 'confirmado') {
    const pendente = pagamento?.repasse?.pendente;
    conteudo = ehPrestador ? (
      <>
        {pendente === 'sem_chave_pix' ? (
          <div className="andamento__alerta">
            <strong>Falta a sua chave Pix</strong>
            <span>{nome} confirmou o serviço. Cadastre a sua chave Pix (o seu CPF) para receber.</span>
            <Link to="/meu-perfil" className="botao botao--escuro botao--curto">Cadastrar chave Pix</Link>
          </div>
        ) : (
          <p className="andamento__texto">{nome} confirmou o serviço. O banco ainda não respondeu; vamos tentar o repasse de novo em alguns minutos.</p>
        )}
        <Comprovante servico={servico} />
      </>
    ) : (
      <>
        <p className="andamento__texto">Serviço confirmado. O pagamento vai para {nome} assim que o repasse for concluído.</p>
        <Comprovante servico={servico} />
      </>
    );
  }

  if (status === 'pago') {
    conteudo = (
      <>
        <div className="congelado congelado--liberado" role="status">
          <IconeCadeado className="congelado__icone" width="20" height="20" aria-hidden="true" />
          <div>
            <strong>Pagamento liberado</strong>
            <span>
              {servico.confirmacao_automatica
                ? `Ninguém confirmou no prazo, então o serviço foi confirmado automaticamente em ${formatarDataHora(servico.confirmado_em)}.`
                : `Serviço confirmado em ${formatarDataHora(servico.confirmado_em)}.`}
              {!ehPrestador && ` O pagamento foi para ${nome}.`}
            </span>
          </div>
        </div>
        <Comprovante servico={servico} />
      </>
    );
  }

  if (status === 'cancelado' && servico.cancelamento) {
    const { cancelamento } = servico;
    const quem = cancelamento.por === papel ? 'Você cancelou' : `${nome} cancelou`;
    conteudo = (
      <div className="andamento__cancelado">
        <p><strong>{quem}</strong> em {formatarDataHora(cancelamento.em)}. Motivo: {cancelamento.motivo}</p>
        <Comprovante servico={servico} />
      </div>
    );
  }

  if (!conteudo) return null;

  return (
    <section className="cartao andamento">
      <h2>Andamento</h2>
      <Aviso>{erro}</Aviso>
      {conteudo}
      {children}
    </section>
  );
}

// US15 - cancelar, sempre mostrando antes quanto cada um recebe.
export function Cancelamento({ servico, aoAtualizar }) {
  const [previa, setPrevia] = useState(null);
  const [motivo, setMotivo] = useState('');
  const { carregando, erro, executar, setErro } = useAcao(async (mensagem) => {
    setPrevia(null);
    await aoAtualizar(mensagem);
  });
  const { papel, status } = servico;

  // O contratante recusa o orçamento pelo botão da US10; o resto cancela aqui.
  const podeMostrar = status === 'aceito' || status === 'aguardando_orcamento'
    || (status === 'orcamento_enviado' && papel === 'prestador');
  if (!podeMostrar) return null;

  async function abrir() {
    setErro('');
    try {
      const dados = await api.previaCancelamento(servico.id);
      if (!dados.pode_cancelar) { setErro(dados.motivo); return; }
      setPrevia(dados);
    } catch (e) {
      setErro(e.message);
    }
  }

  if (!previa) {
    return (
      <div className="cancelar-servico">
        <Aviso>{erro}</Aviso>
        <Botao tipo="perigo" type="button" onClick={abrir}>
          {status === 'aceito' ? 'Cancelar serviço' : 'Cancelar pedido'}
        </Botao>
      </div>
    );
  }

  const comDinheiro = previa.regra !== 'sem_pagamento';
  return (
    <div className="confirmar cancelar-servico">
      <Aviso>{erro}</Aviso>
      <p><strong>{previa.descricao}</strong></p>
      {comDinheiro && (
        <dl className="cancelar-servico__valores">
          <div>
            <dt>{papel === 'contratante' ? 'Volta para você' : 'Volta para o cliente'}</dt>
            <dd>{formatarDinheiro(previa.valor_contratante)} ({previa.percentual_contratante}%)</dd>
          </div>
          <div>
            <dt>{papel === 'prestador' ? 'Fica com você' : 'Fica com o profissional'}</dt>
            <dd>{formatarDinheiro(previa.valor_prestador)} ({previa.percentual_prestador}%)</dd>
          </div>
        </dl>
      )}
      <Campo etiqueta="Motivo do cancelamento">
        <textarea
          className="campo__entrada"
          rows={2}
          maxLength={300}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Conte rapidinho por que precisa cancelar"
        />
      </Campo>
      <div className="empilha">
        <Botao
          tipo="perigo"
          type="button"
          carregando={carregando === 'cancelar'}
          onClick={() => {
            if (motivo.trim().length < 3) { setErro('Conte o motivo do cancelamento.'); return; }
            executar('cancelar', () => api.cancelarServico(servico.id, { motivo: motivo.trim() }));
          }}
        >
          Confirmar cancelamento
        </Botao>
        <Botao tipo="secundario" type="button" onClick={() => setPrevia(null)}>Voltar</Botao>
      </div>
    </div>
  );
}

// US14 - nova data, que só vale depois do aceite da outra parte.
export function NovaData({ servico, aoAtualizar }) {
  const [abrindo, setAbrindo] = useState(false);
  const [dataHora, setDataHora] = useState('');
  const [motivo, setMotivo] = useState('');
  const { carregando, erro, executar, setErro } = useAcao(async (mensagem) => {
    setAbrindo(false);
    setDataHora('');
    setMotivo('');
    await aoAtualizar(mensagem);
  });

  if (servico.status !== 'aceito' || servico.chegou_em) return null;
  const reagendamentos = servico.reagendamentos || [];
  const pendente = reagendamentos.find((r) => r.status === 'pendente');
  const aceitos = reagendamentos.filter((r) => r.status === 'aceito').length;
  const nome = nomeDaOutraParte(servico);

  if (pendente) {
    return (
      <div className="nova-data">
        <Aviso>{erro}</Aviso>
        {pendente.meu ? (
          <p>
            Você pediu para mudar para <strong>{formatarDataHora(pendente.data_hora_nova)}</strong>.
            Esperando {nome} responder. Até lá, vale a data de agora.
          </p>
        ) : (
          <>
            <p>
              <strong>{nome} pediu uma nova data:</strong> de {formatarDataHora(pendente.data_hora_anterior)} para{' '}
              <strong>{formatarDataHora(pendente.data_hora_nova)}</strong>.
              {pendente.motivo && <> Motivo: {pendente.motivo}</>}
            </p>
            <p className="nova-data__nota">O pagamento continua congelado. Se recusar, a data de agora continua valendo.</p>
            <div className="empilha">
              <Botao tipo="escuro" type="button" carregando={carregando === 'aceitar'}
                onClick={() => executar('aceitar', () => api.responderNovaData(servico.id, pendente.id, true))}>
                Aceitar nova data
              </Botao>
              <Botao tipo="secundario" type="button" carregando={carregando === 'recusar'}
                onClick={() => executar('recusar', () => api.responderNovaData(servico.id, pendente.id, false))}>
                Recusar
              </Botao>
            </div>
          </>
        )}
      </div>
    );
  }

  if (aceitos >= LIMITE_NOVAS_DATAS) {
    return <p className="nova-data__nota">Este serviço já mudou de data {LIMITE_NOVAS_DATAS} vezes, o máximo permitido.</p>;
  }

  if (!abrindo) {
    return (
      <Botao tipo="texto" type="button" onClick={() => setAbrindo(true)}>
        Precisa mudar a data? Pedir nova data
      </Botao>
    );
  }

  return (
    <div className="nova-data">
      <Aviso>{erro}</Aviso>
      <Campo
        etiqueta="Nova data e hora"
        type="datetime-local"
        value={dataHora}
        min={paraCampoDataHora(new Date(Date.now() + 5 * 60000))}
        onChange={(e) => setDataHora(e.target.value)}
        ajuda={`A nova data só vale se ${nome} aceitar. Pode mudar até ${LIMITE_NOVAS_DATAS} vezes.`}
      />
      <Campo etiqueta="Motivo (opcional)" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: imprevisto no trabalho" />
      <div className="empilha">
        <Botao tipo="escuro" type="button" carregando={carregando === 'propor'}
          onClick={() => {
            const iso = deCampoDataHora(dataHora);
            if (!iso) { setErro('Escolha a nova data e hora.'); return; }
            executar('propor', () => api.proporNovaData(servico.id, { data_hora: iso, motivo: motivo.trim() }));
          }}>
          Enviar nova data
        </Botao>
        <Botao tipo="secundario" type="button" onClick={() => setAbrindo(false)}>Voltar</Botao>
      </div>
    </div>
  );
}

function Estrelas({ nota, tamanho = 18 }) {
  return (
    <span className="estrelas" aria-label={`${nota} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <IconeEstrela key={n} width={tamanho} height={tamanho} className={n <= nota ? 'estrelas__cheia' : 'estrelas__vazia'} aria-hidden="true" />
      ))}
    </span>
  );
}

function EscolherNota({ nota, aoEscolher }) {
  return (
    <div className="escolher-nota" role="radiogroup" aria-label="Nota de 1 a 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={nota === n}
          aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
          className={`escolher-nota__estrela ${n <= nota ? 'escolher-nota__estrela--cheia' : ''}`}
          onClick={() => aoEscolher(n)}
        >
          <IconeEstrela width="30" height="30" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

// US24 - avaliação mútua.
export function Avaliacao({ servico, aoAtualizar }) {
  const bloco = servico.avaliacoes;
  const [nota, setNota] = useState(bloco?.minha?.nota || 0);
  const [comentario, setComentario] = useState(bloco?.minha?.comentario || '');
  const [editando, setEditando] = useState(false);
  const [resposta, setResposta] = useState('');
  const { carregando, erro, executar, setErro } = useAcao(async (mensagem) => {
    setEditando(false);
    await aoAtualizar(mensagem);
  });
  if (!bloco) return null;
  const nome = nomeDaOutraParte(servico);
  const sobre = servico.papel === 'contratante' ? `o trabalho de ${nome}` : `${nome} como cliente`;

  function enviar(evento) {
    evento.preventDefault();
    if (!nota) { setErro('Escolha de 1 a 5 estrelas.'); return; }
    const corpo = { nota, comentario: comentario.trim() };
    executar('enviar', () => (bloco.minha ? api.editarAvaliacao(servico.id, corpo) : api.avaliar(servico.id, corpo)));
  }

  const formulario = (
    <form onSubmit={enviar} className="avaliar">
      <EscolherNota nota={nota} aoEscolher={setNota} />
      <Campo etiqueta="Comentário (opcional)">
        <textarea className="campo__entrada" rows={3} maxLength={500} value={comentario}
          onChange={(e) => setComentario(e.target.value)} placeholder="Como foi?" />
      </Campo>
      <div className="empilha">
        <Botao type="submit" carregando={carregando === 'enviar'}>{bloco.minha ? 'Salvar alteração' : 'Enviar avaliação'}</Botao>
        {editando && <Botao tipo="secundario" type="button" onClick={() => setEditando(false)}>Voltar</Botao>}
      </div>
    </form>
  );

  return (
    <section className="cartao avaliacao">
      <h2>Avaliação</h2>
      <Aviso>{erro}</Aviso>

      {bloco.pode_avaliar && (
        <>
          <p className="andamento__texto">
            Como foi {sobre}? A sua avaliação só aparece quando {nome} também avaliar
            (ou em {formatarDataHora(bloco.prazo_ate)}, o fim do prazo).
          </p>
          {bloco.outra_enviou && <p className="andamento__feito">{nome} já avaliou. Avalie também para as duas aparecerem.</p>}
          {formulario}
        </>
      )}

      {bloco.minha && !editando && (
        <div className="avaliacao__item">
          <span className="avaliacao__quem">Sua avaliação</span>
          <Estrelas nota={bloco.minha.nota} />
          {bloco.minha.comentario && <p>{bloco.minha.comentario}</p>}
          <small>
            {bloco.minha.publicada ? 'Publicada.' : `Aparece quando ${nome} avaliar, ou em ${formatarDataHora(bloco.prazo_ate)}.`}
            {bloco.minha.pode_editar && ` Você pode editar até ${formatarDataHora(bloco.minha.editavel_ate)}.`}
          </small>
          {bloco.minha.pode_editar && (
            <Botao tipo="texto" type="button" onClick={() => { setNota(bloco.minha.nota); setComentario(bloco.minha.comentario || ''); setEditando(true); }}>
              Editar avaliação
            </Botao>
          )}
          {bloco.minha.resposta && <p className="avaliacao__resposta"><strong>Resposta de {nome}:</strong> {bloco.minha.resposta}</p>}
        </div>
      )}
      {editando && formulario}

      {bloco.da_outra_parte && (
        <div className="avaliacao__item">
          <span className="avaliacao__quem">Avaliação de {nome}</span>
          <Estrelas nota={bloco.da_outra_parte.nota} />
          {bloco.da_outra_parte.comentario && <p>{bloco.da_outra_parte.comentario}</p>}
          {bloco.da_outra_parte.resposta && <p className="avaliacao__resposta"><strong>Sua resposta:</strong> {bloco.da_outra_parte.resposta}</p>}
          {bloco.da_outra_parte.pode_responder && (
            <div className="avaliacao__responder">
              <Campo etiqueta="Responder (aparece junto da avaliação)">
                <textarea className="campo__entrada" rows={2} maxLength={500} value={resposta} onChange={(e) => setResposta(e.target.value)} />
              </Campo>
              <Botao tipo="secundario" type="button" className="botao--curto" carregando={carregando === 'responder'}
                onClick={() => {
                  if (!resposta.trim()) { setErro('Escreva a sua resposta.'); return; }
                  executar('responder', () => api.responderAvaliacao(servico.id, resposta.trim()));
                }}>
                Publicar resposta
              </Botao>
            </div>
          )}
        </div>
      )}

      {!bloco.pode_avaliar && !bloco.minha && !bloco.da_outra_parte && (
        <p className="andamento__texto">O prazo para avaliar este serviço terminou.</p>
      )}
    </section>
  );
}

const ACOES = {
  pedido: 'Pedido enviado',
  orcamento: 'Orçamento enviado',
  recusa: 'Orçamento recusado',
  pagamento_retido: 'Pix confirmado: pagamento congelado',
  chegada: 'Profissional chegou',
  inicio: 'Serviço iniciado',
  conclusao: 'Marcado como concluído',
  confirmacao: 'Serviço confirmado',
  confirmacao_automatica: 'Confirmado automaticamente',
  repasse: 'Pagamento liberado',
  repasse_cancelamento: 'Multa de cancelamento paga',
  cancelamento: 'Cancelado',
  reagendamento_proposto: 'Nova data pedida',
  reagendamento_aceito: 'Nova data aceita',
  reagendamento_recusado: 'Nova data recusada',
  avaliacao: 'Avaliação enviada',
  avaliacao_editada: 'Avaliação editada'
};

// Histórico do serviço: cada passo, quem fez e quando.
export function LinhaDoTempo({ historico }) {
  if (!historico || !historico.length) return null;
  return (
    <section className="cartao">
      <details className="linha-tempo">
        <summary><h2>Histórico do serviço</h2></summary>
        <ol>
          {historico.map((h, i) => (
            <li key={i}>
              <span className="linha-tempo__quando">{formatarDataHora(h.em)}</span>
              <span className="linha-tempo__oque">
                <strong>{ACOES[h.acao] || h.acao}</strong>
                <span>{h.quem === 'voce' ? 'por você' : `por ${h.quem}`}{h.detalhe ? ` · ${h.detalhe}` : ''}</span>
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export { Estrelas };
