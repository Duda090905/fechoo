import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../servicos/api';
import Aviso from '../componentes/Aviso';
import Botao from '../componentes/Botao';
import Campo from '../componentes/Campo';
import Chat from '../componentes/Chat';
import ImagemProtegida from '../componentes/ImagemProtegida';
import PagamentoPix from '../componentes/PagamentoPix';
import { EtiquetaStatus } from './Servicos';
import { IconeCadeado, IconeCalendario, IconeLocal, IconeVoltar } from '../componentes/Icones';
import {
  deCampoDataHora, duracao, formatarDataHora, formatarDinheiro, formatarHora, lerDinheiro, paraCampoDataHora
} from '../utils/formatos';
import '../componentes/pagamento.css';
import './painel.css';
import './servicos.css';

const PRAZO_MAXIMO = 24;
// US17 - enquanto o Pix espera pagamento, a tela pergunta à API a cada 4 s.
const INTERVALO_PIX_MS = 4000;
const HORA_MS = 60 * 60 * 1000;

// US10 - o orçamento como um comprovante: valor, deslocamento e total
// separados, com o prazo e o horário (US13).
function Comprovante({ servico, papel }) {
  const { orcamento } = servico;
  const fim = new Date(new Date(servico.horario).getTime() + orcamento.prazo_horas * HORA_MS);
  const mudouHorario = servico.data_hora_proposta
    && new Date(servico.data_hora_proposta).getTime() !== new Date(servico.data_hora_solicitada).getTime();

  return (
    <div className={`comprovante ${servico.status === 'recusado' ? 'comprovante--recusado' : ''}`}>
      <dl className="comprovante__linhas">
        <div><dt>Serviço</dt><dd>{formatarDinheiro(orcamento.valor)}</dd></div>
        <div>
          <dt>Deslocamento</dt>
          <dd>{orcamento.taxa_deslocamento > 0 ? formatarDinheiro(orcamento.taxa_deslocamento) : 'Sem taxa'}</dd>
        </div>
      </dl>
      <div className="comprovante__total">
        <span>Total</span>
        <strong>{formatarDinheiro(orcamento.total)}</strong>
      </div>
      <dl className="comprovante__detalhes">
        <div><dt>Prazo estimado</dt><dd>{duracao(orcamento.prazo_horas)}</dd></div>
        <div>
          <dt>Horário</dt>
          <dd>{formatarDataHora(servico.horario)} até {formatarHora(fim)}</dd>
        </div>
      </dl>
      {mudouHorario && (
        <p className="comprovante__nota">
          {papel === 'contratante' ? 'Você pediu' : 'O cliente pediu'} {formatarDataHora(servico.data_hora_solicitada)}.
          O horário acima é o proposto no orçamento.
        </p>
      )}
    </div>
  );
}

// US10 - o prestador responde valor, prazo e, fora da área, a taxa de
// deslocamento. US13 - confirma ou muda o horário.
function FormularioOrcamento({ servico, aoEnviar }) {
  const [valor, setValor] = useState('');
  const [prazo, setPrazo] = useState('');
  const [dataHora, setDataHora] = useState(() => {
    const pedida = new Date(servico.data_hora_solicitada);
    return pedida > new Date() ? paraCampoDataHora(pedida) : '';
  });
  const [taxa, setTaxa] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const valorNumero = lerDinheiro(valor);
  const taxaNumero = servico.fora_da_area ? lerDinheiro(taxa) : 0;
  const totalPrevisto = (valorNumero > 0 ? valorNumero : 0) + (taxaNumero > 0 ? taxaNumero : 0);

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    if (!(valorNumero > 0)) { setErro('Informe um valor maior que zero.'); return; }
    if (!prazo) { setErro('Escolha o prazo estimado.'); return; }
    const iso = deCampoDataHora(dataHora);
    if (!iso) { setErro('Escolha o dia e a hora do atendimento.'); return; }
    if (servico.fora_da_area && (taxaNumero === '' || Number.isNaN(taxaNumero) || taxaNumero < 0)) {
      setErro('Informe a taxa de deslocamento. Se não for cobrar, escreva 0.');
      return;
    }

    setEnviando(true);
    try {
      const corpo = { valor: valorNumero, prazo_horas: Number(prazo), data_hora: iso };
      if (servico.fora_da_area) corpo.taxa_deslocamento = taxaNumero;
      await aoEnviar(corpo);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Aviso>{erro}</Aviso>
      <div className="duas-colunas">
        <Campo
          etiqueta="Valor do serviço"
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          erro={valor && !(valorNumero > 0) ? 'Informe um valor maior que zero.' : ''}
          required
        />
        <Campo etiqueta="Prazo estimado">
          <select value={prazo} onChange={(e) => setPrazo(e.target.value)} required>
            <option value="">Quanto tempo leva?</option>
            {Array.from({ length: PRAZO_MAXIMO }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>{duracao(h)}</option>
            ))}
          </select>
        </Campo>
      </div>

      <Campo
        etiqueta="Dia e hora do atendimento"
        type="datetime-local"
        value={dataHora}
        min={paraCampoDataHora(new Date(Date.now() + 5 * 60000))}
        onChange={(e) => setDataHora(e.target.value)}
        ajuda="Já vem com o horário que o cliente pediu. Mude se precisar."
        required
      />

      {servico.fora_da_area && (
        <Campo
          etiqueta="Taxa de deslocamento"
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={taxa}
          onChange={(e) => setTaxa(e.target.value)}
          ajuda={`O bairro ${servico.bairro?.nome} fica fora dos que você atende. Se não for cobrar, escreva 0.`}
          required
        />
      )}

      <div className="previsao">
        <span>O cliente vai ver o total de</span>
        <strong>{formatarDinheiro(totalPrevisto)}</strong>
      </div>

      <Botao type="submit" carregando={enviando}>Enviar orçamento</Botao>
    </form>
  );
}

// US11 / US17 - o contratante informa o endereço e gera o Pix.
function FormularioAceite({ servico, aoAceitar, aoVoltar }) {
  const [endereco, setEndereco] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const nome = (servico.prestador?.nome || '').split(' ')[0];

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    if (endereco.trim().length < 5) { setErro('Informe a rua e o número onde o serviço vai ser feito.'); return; }
    setEnviando(true);
    try {
      await aoAceitar({ endereco: endereco.trim() });
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  }

  return (
    <form className="aceite" onSubmit={enviar} noValidate>
      <Aviso>{erro}</Aviso>
      <Campo
        etiqueta={`Endereço do atendimento (bairro ${servico.bairro?.nome})`}
        placeholder="Rua, número e complemento"
        value={endereco}
        maxLength={200}
        onChange={(e) => setEndereco(e.target.value)}
        ajuda={`${nome} só vê o endereço depois que o pagamento for confirmado.`}
        autoComplete="street-address"
        required
      />
      <p className="aceite__nota">
        <IconeCadeado width="16" height="16" aria-hidden="true" />
        <span>
          Você vai pagar {formatarDinheiro(servico.orcamento.total)} por Pix. O dinheiro fica congelado no Fechô
          e só vai para {nome} depois que você confirmar que o serviço foi feito.
        </span>
      </p>
      <div className="empilha">
        <Botao type="submit" carregando={enviando}>Gerar o Pix</Botao>
        <Botao tipo="secundario" type="button" onClick={aoVoltar}>Voltar</Botao>
      </div>
    </form>
  );
}

// US17 / US18 - pagamento Retido: o dinheiro está congelado.
function PagamentoCongelado({ servico, papel }) {
  const { pagamento } = servico;
  if (!pagamento || pagamento.status !== 'retido') return null;
  const nome = ((papel === 'prestador' ? servico.contratante?.nome : servico.prestador?.nome) || '').split(' ')[0];
  return (
    <div className="congelado" role="status">
      <IconeCadeado className="congelado__icone" width="20" height="20" aria-hidden="true" />
      <div>
        <strong>{papel === 'prestador' ? 'Pagamento garantido' : 'Pagamento congelado'}</strong>
        <span>
          {papel === 'prestador'
            ? `O Pix de ${formatarDinheiro(pagamento.valor)} já caiu e está guardado no Fechô. Você recebe quando ${nome} confirmar o serviço.`
            : `Seu Pix de ${formatarDinheiro(pagamento.valor)} chegou. O dinheiro fica guardado até você confirmar que o serviço foi feito.`}
        </span>
      </div>
    </div>
  );
}

export default function ServicoDetalhe() {
  const { id } = useParams();
  const { state } = useLocation();
  const [servico, setServico] = useState(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState(state?.recemCriado ? 'Pedido enviado. Assim que o profissional responder, o orçamento aparece aqui.' : '');
  const [confirmarRecusa, setConfirmarRecusa] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const [aceitando, setAceitando] = useState(false);
  const statusAnterior = useRef(null);

  const carregar = useCallback(() => {
    api.servico(id)
      .then((d) => { setServico(d.servico); setErro(''); })
      .catch((e) => setErro(e.message));
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  // US18 - enquanto o Pix espera, consulta a API até o banco confirmar.
  const pixEmAberto = Boolean(servico?.pagamento?.em_aberto);
  useEffect(() => {
    if (!pixEmAberto) return undefined;
    const consulta = setInterval(carregar, INTERVALO_PIX_MS);
    return () => clearInterval(consulta);
  }, [pixEmAberto, carregar]);

  // Avisa na tela quando o serviço vira Aceito enquanto ela está aberta.
  useEffect(() => {
    if (!servico) return;
    if (statusAnterior.current === 'orcamento_enviado' && servico.status === 'aceito') {
      setMensagem(servico.papel === 'contratante'
        ? 'Pagamento confirmado! O dinheiro está congelado e o profissional já pode ver o endereço.'
        : 'Pagamento garantido! O endereço do atendimento já aparece no pedido.');
    }
    statusAnterior.current = servico.status;
  }, [servico]);

  async function aceitar(corpo) {
    const dados = await api.aceitarOrcamento(id, corpo);
    setServico((atual) => ({ ...atual, ...dados.servico }));
    setAceitando(false);
    setMensagem('');
  }

  async function enviarOrcamento(corpo) {
    const dados = await api.enviarOrcamento(id, corpo);
    setServico((atual) => ({ ...atual, ...dados.servico }));
    setMensagem('Orçamento enviado. O cliente já pode ver.');
  }

  async function recusar() {
    setRecusando(true);
    setErro('');
    try {
      const dados = await api.recusarOrcamento(id);
      setServico((atual) => ({ ...atual, ...dados.servico }));
      setConfirmarRecusa(false);
      setMensagem('Orçamento recusado. Este pedido foi encerrado.');
    } catch (e) {
      setErro(e.message);
    } finally {
      setRecusando(false);
    }
  }

  if (!servico) {
    return (
      <div className="pagina pagina--larga">
        <div className="painel-topo"><Link to="/servicos" className="voltar"><IconeVoltar width="18" height="18" /> Meus serviços</Link></div>
        {erro ? <Aviso>{erro}</Aviso> : <p className="subtitulo">Carregando...</p>}
      </div>
    );
  }

  const { papel } = servico;
  const outra = papel === 'prestador' ? servico.contratante?.nome : servico.prestador?.nome;
  const primeiroNome = (outra || '').split(' ')[0];

  return (
    <div className="pagina pagina--servico">
      <div className="servico-topo">
        <Link to="/servicos" className="voltar"><IconeVoltar width="18" height="18" /> Meus serviços</Link>
        <div className="servico-topo__titulo">
          <h1>{papel === 'prestador' ? `Pedido de ${outra}` : `Pedido para ${outra}`}</h1>
          <EtiquetaStatus status={servico.status} />
        </div>
      </div>

      <Aviso>{erro}</Aviso>
      <Aviso tipo="sucesso">{mensagem}</Aviso>

      <div className="servico-grade">
        <div className="servico-grade__principal">
          <section className="cartao">
            <h2>O pedido</h2>
            <p className="pedido-texto">{servico.descricao}</p>
            <ul className="pedido-dados">
              <li>
                <IconeLocal width="18" height="18" aria-hidden="true" />
                <span>
                  Bairro {servico.bairro?.nome}
                  {papel === 'prestador' && servico.fora_da_area && <span className="etiqueta etiqueta--pausado">fora dos seus bairros</span>}
                </span>
              </li>
              <li>
                <IconeCalendario width="18" height="18" aria-hidden="true" />
                <span>Pedido para {formatarDataHora(servico.data_hora_solicitada)}</span>
              </li>
              {/* US11 - endereço só do aceite em diante */}
              {servico.endereco ? (
                <li className="pedido-endereco">
                  <IconeLocal width="18" height="18" aria-hidden="true" />
                  <span>
                    <strong>{servico.endereco.logradouro}</strong>
                    <small>
                      {papel === 'prestador'
                        ? 'Endereço liberado porque o pagamento está congelado.'
                        : `Visível para ${primeiroNome} porque o pagamento está congelado.`}
                    </small>
                  </span>
                </li>
              ) : papel === 'prestador' && ['aguardando_orcamento', 'orcamento_enviado'].includes(servico.status) && (
                <li>
                  <IconeCadeado width="18" height="18" aria-hidden="true" />
                  <span>O endereço completo aparece aqui quando o cliente aceitar e o pagamento for confirmado.</span>
                </li>
              )}
            </ul>
            {servico.fotos.length > 0 && (
              <div className="pedido-fotos">
                {servico.fotos.map((nome, i) => (
                  <ImagemProtegida
                    key={nome}
                    servicoId={servico.id}
                    nome={nome}
                    alt={`Foto ${i + 1} do pedido`}
                    className="pedido-fotos__imagem"
                    aoAbrir={(url, alt) => setFotoAmpliada({ url, alt })}
                  />
                ))}
              </div>
            )}
            {servico.fotos_removidas && (
              <p className="pedido-nota">As fotos foram apagadas depois do prazo de guarda.</p>
            )}
          </section>

          <section className="cartao">
            <h2>Orçamento</h2>

            {servico.status === 'aguardando_orcamento' && papel === 'contratante' && (
              <div className="espera">
                <span className="espera__pontos" aria-hidden="true"><i /><i /><i /></span>
                <p>Esperando o orçamento de {primeiroNome}. Enquanto isso, combine os detalhes pela conversa.</p>
              </div>
            )}

            {servico.status === 'aguardando_orcamento' && papel === 'prestador' && (
              <>
                <p className="subtitulo" style={{ marginBottom: 18 }}>
                  {primeiroNome} quer saber quanto fica. Responda com valor, prazo e horário.
                </p>
                <FormularioOrcamento servico={servico} aoEnviar={enviarOrcamento} />
              </>
            )}

            {servico.orcamento && <Comprovante servico={servico} papel={papel} />}

            {servico.status === 'orcamento_enviado' && papel === 'prestador' && (
              <p className="pedido-nota">
                {servico.pagamento?.em_aberto
                  ? `${primeiroNome} aceitou e está pagando o Pix. Assim que o banco confirmar, o endereço aparece aqui.`
                  : `Orçamento enviado. Agora é com ${primeiroNome}.`}
              </p>
            )}

            {/* US11 / US17 - aceitar gera o Pix; o Pix aberto aparece aqui */}
            {servico.status === 'orcamento_enviado' && papel === 'contratante' && (
              servico.pagamento?.em_aberto ? (
                <PagamentoPix pagamento={servico.pagamento} outraParte={primeiroNome} aoVencer={carregar} />
              ) : aceitando ? (
                <FormularioAceite servico={servico} aoAceitar={aceitar} aoVoltar={() => setAceitando(false)} />
              ) : (
                <>
                  {servico.pagamento?.expirado && (
                    <p className="pedido-nota">O Pix anterior venceu sem pagamento. Se ainda quiser, aceite de novo.</p>
                  )}
                  {!confirmarRecusa && (
                    <Botao type="button" className="aceitar" onClick={() => setAceitando(true)}>
                      Aceitar e pagar com Pix
                    </Botao>
                  )}
                </>
              )
            )}

            {servico.status === 'orcamento_enviado' && papel === 'contratante' && !aceitando && (
              !confirmarRecusa ? (
                <Botao tipo="perigo" type="button" onClick={() => setConfirmarRecusa(true)} className="recusar">
                  Recusar orçamento
                </Botao>
              ) : (
                <div className="confirmar">
                  <p>
                    Recusar encerra este pedido e a conversa
                    {servico.pagamento?.em_aberto ? ', e o Pix gerado deixa de valer' : ''}. Quer mesmo recusar?
                  </p>
                  <div className="empilha">
                    <Botao tipo="perigo" type="button" carregando={recusando} onClick={recusar}>Recusar orçamento</Botao>
                    <Botao tipo="secundario" type="button" onClick={() => setConfirmarRecusa(false)}>Voltar</Botao>
                  </div>
                </div>
              )
            )}

            {servico.status === 'recusado' && (
              <p className="pedido-nota">Orçamento recusado. Este pedido foi encerrado.</p>
            )}

            <PagamentoCongelado servico={servico} papel={papel} />
          </section>
        </div>

        <Chat servicoId={servico.id} aberto={servico.chat_aberto} outraParte={outra} aoMudarStatus={carregar} />
      </div>

      {fotoAmpliada && (
        <div className="ampliada" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={() => setFotoAmpliada(null)}>
          <img src={fotoAmpliada.url} alt={fotoAmpliada.alt} />
        </div>
      )}
    </div>
  );
}
