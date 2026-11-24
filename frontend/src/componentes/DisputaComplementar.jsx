import { useState } from 'react';
import { api } from '../servicos/api';
import Aviso from './Aviso';
import Botao from './Botao';
import Campo from './Campo';
import ImagemProtegida from './ImagemProtegida';
import PagamentoPix from './PagamentoPix';
import { IconeCadeado, IconeEscudo, IconeImagem, IconeRelogio } from './Icones';
import { formatarDataHora, formatarDinheiro, lerDinheiro } from '../utils/formatos';
import './disputa-complementar.css';

// Sprint 5 - na página do serviço:
//   US23 - abrir a disputa (cliente) e enviar a defesa (profissional)
//   US25 - a decisão do Fechô, quando sai
//   US19 - proposta de valor complementar (profissional propõe; cliente aceita ou recusa)

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];
const LIMITE_BYTES = 2 * 1024 * 1024;
const LIMITE_FOTOS = 3;

function primeiroNome(nome) {
  return (nome || '').split(' ')[0];
}

function nomeDaOutraParte(servico) {
  return primeiroNome(servico.papel === 'prestador' ? servico.contratante?.nome : servico.prestador?.nome);
}

// Escolha de fotos com prévia. Confere tipo e tamanho antes de enviar.
function EscolherFotos({ fotos, aoMudar, maximo = LIMITE_FOTOS, rotulo = 'Adicionar foto', aoErro }) {
  function escolher(evento) {
    const novas = [...evento.target.files];
    evento.target.value = '';
    for (const f of novas) {
      if (!TIPOS_ACEITOS.includes(f.type)) { aoErro('Use fotos JPG, PNG ou WebP.'); return; }
      if (f.size > LIMITE_BYTES) { aoErro('Cada foto pode ter no máximo 2 MB.'); return; }
    }
    aoErro('');
    aoMudar([...fotos, ...novas].slice(0, maximo));
  }
  return (
    <div className="fotos-escolha">
      {fotos.map((f, i) => (
        <span key={`${f.name}-${i}`} className="fotos-escolha__item">
          <img src={URL.createObjectURL(f)} alt={`Foto ${i + 1}`} />
          <button type="button" aria-label="Tirar esta foto" onClick={() => aoMudar(fotos.filter((_, j) => j !== i))}>×</button>
        </span>
      ))}
      {fotos.length < maximo && (
        <label className="fotos-escolha__botao">
          <IconeImagem width="18" height="18" aria-hidden="true" />
          <span>{rotulo}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple={maximo > 1} onChange={escolher} hidden />
        </label>
      )}
    </div>
  );
}

function GaleriaProtegida({ servicoId, nomes, rotulo, aoAbrirFoto }) {
  if (!nomes?.length) return null;
  return (
    <div className="disputa__fotos">
      {nomes.map((nome, i) => (
        <ImagemProtegida
          key={nome}
          servicoId={servicoId}
          nome={nome}
          alt={`${rotulo} ${i + 1}`}
          className="disputa__foto"
          aoAbrir={aoAbrirFoto}
        />
      ))}
    </div>
  );
}

const DECISOES = {
  devolver: 'Valor devolvido ao cliente',
  liberar: 'Valor liberado ao profissional',
  dividir: 'Valor dividido entre os dois'
};

// US23 / US25 -------------------------------------------------------------
export function Disputa({ servico, aoAtualizar, aoAbrirFoto }) {
  const [abrindo, setAbrindo] = useState(false);
  const [texto, setTexto] = useState('');
  const [fotos, setFotos] = useState([]);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const { papel, disputa } = servico;
  const nome = nomeDaOutraParte(servico);

  async function enviar(funcao) {
    if (texto.trim().length < 10) { setErro('Conte com um pouco mais de detalhe (pelo menos 10 caracteres).'); return; }
    setErro('');
    setEnviando(true);
    try {
      const form = new FormData();
      fotos.forEach((f) => form.append('fotos', f));
      const dados = await funcao(form);
      setAbrindo(false);
      setTexto('');
      setFotos([]);
      await aoAtualizar(dados?.mensagem);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  // Ainda sem disputa: o cliente pode abrir (em andamento ou até 72 h depois de concluído).
  if (!disputa) {
    if (!servico.pode_abrir_disputa) return null;
    return (
      <section className="cartao disputa disputa--abrir">
        <div className="disputa__cabeca">
          <IconeEscudo width="20" height="20" aria-hidden="true" />
          <div>
            <h2>Algo deu errado?</h2>
            <p>
              Abra uma disputa e o pagamento continua congelado até o Fechô decidir.
              {servico.prazo_disputa && <> Você pode abrir até <strong>{formatarDataHora(servico.prazo_disputa)}</strong>.</>}
            </p>
          </div>
        </div>
        {!abrindo ? (
          <Botao tipo="perigo" type="button" onClick={() => setAbrindo(true)}>Abrir disputa</Botao>
        ) : (
          <form className="empilha" onSubmit={(e) => { e.preventDefault(); enviar((form) => { form.append('justificativa', texto.trim()); return api.abrirDisputa(servico.id, form); }); }}>
            <Aviso>{erro}</Aviso>
            <Campo etiqueta="O que aconteceu?" ajuda="Seja específico: o que foi combinado e o que ficou diferente.">
              <textarea className="campo__entrada" rows={4} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Campo>
            <div>
              <span className="campo__etiqueta">Evidências (até 3 fotos)</span>
              <EscolherFotos fotos={fotos} aoMudar={setFotos} aoErro={setErro} />
            </div>
            <p className="disputa__nota">
              {nome} é avisado na hora e tem 48 horas para mandar a versão dele. A conversa do serviço também vale como evidência.
            </p>
            <div className="empilha">
              <Botao tipo="perigo" type="submit" carregando={enviando}>Enviar e abrir disputa</Botao>
              <Botao tipo="secundario" type="button" onClick={() => setAbrindo(false)}>Voltar</Botao>
            </div>
          </form>
        )}
      </section>
    );
  }

  const decidida = disputa.status === 'decidida';
  const minha = papel === 'contratante';
  return (
    <section className={`cartao disputa ${decidida ? 'disputa--decidida' : ''}`}>
      <div className="disputa__cabeca">
        <IconeEscudo width="20" height="20" aria-hidden="true" />
        <div>
          <h2>{decidida ? 'Disputa decidida' : 'Serviço em disputa'}</h2>
          <p>
            {decidida
              ? `Decisão em ${formatarDataHora(disputa.decisao.em)}.`
              : <>Aberta em {formatarDataHora(disputa.aberta_em)}. O pagamento está congelado. O Fechô decide até <strong>{formatarDataHora(disputa.prazo_decisao)}</strong>.</>}
          </p>
        </div>
      </div>

      {decidida && (
        <div className="disputa__decisao">
          <strong>{DECISOES[disputa.decisao.tipo]}</strong>
          <dl>
            <div><dt>Para o cliente</dt><dd>{formatarDinheiro(disputa.decisao.valor_contratante)}</dd></div>
            <div><dt>Para o profissional</dt><dd>{formatarDinheiro(disputa.decisao.valor_prestador)}</dd></div>
          </dl>
          <p><b>Justificativa:</b> {disputa.decisao.justificativa}</p>
        </div>
      )}

      <div className="disputa__lado">
        <span className="disputa__quem">{minha ? 'O que você relatou' : `O que ${nome} relatou`}</span>
        <p>{disputa.justificativa}</p>
        <GaleriaProtegida servicoId={servico.id} nomes={disputa.evidencias} rotulo="Evidência" aoAbrirFoto={aoAbrirFoto} />
      </div>

      <div className="disputa__lado">
        <span className="disputa__quem">{minha ? `A defesa de ${nome}` : 'A sua defesa'}</span>
        {disputa.defesa ? (
          <>
            <p>{disputa.defesa}</p>
            <GaleriaProtegida servicoId={servico.id} nomes={disputa.defesa_evidencias} rotulo="Foto da defesa" aoAbrirFoto={aoAbrirFoto} />
          </>
        ) : papel === 'prestador' && !decidida ? (
          <form className="empilha" onSubmit={(e) => { e.preventDefault(); enviar((form) => { form.append('defesa', texto.trim()); return api.defenderDisputa(servico.id, form); }); }}>
            <p className="disputa__nota">
              <IconeRelogio width="15" height="15" aria-hidden="true" /> Responda até {formatarDataHora(disputa.prazo_defesa)}.
              Depois disso o Fechô pode decidir sem a sua versão.
            </p>
            <Aviso>{erro}</Aviso>
            <Campo etiqueta="A sua versão">
              <textarea className="campo__entrada" rows={4} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Campo>
            <div>
              <span className="campo__etiqueta">Fotos (até 3)</span>
              <EscolherFotos fotos={fotos} aoMudar={setFotos} aoErro={setErro} />
            </div>
            <Botao type="submit" carregando={enviando}>Enviar defesa</Botao>
          </form>
        ) : (
          <p className="disputa__nota">
            {decidida ? 'Não houve defesa.' : `Esperando a resposta de ${nome} (até ${formatarDataHora(disputa.prazo_defesa)}).`}
          </p>
        )}
      </div>
    </section>
  );
}

// US19 --------------------------------------------------------------------
const STATUS_COMPLEMENTAR = {
  pendente: 'Esperando a resposta do cliente',
  aceita: 'Aceita, esperando o Pix',
  paga: 'Pago e congelado',
  recusada: 'Recusada',
  encerrada: 'Sem efeito'
};

export function Complementar({ servico, aoAtualizar, aoAbrirFoto }) {
  const [abrindo, setAbrindo] = useState(false);
  const [valor, setValor] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [fotos, setFotos] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState('');
  const { papel, complementar } = servico;
  const nome = nomeDaOutraParte(servico);

  async function executar(chave, funcao) {
    setErro('');
    setCarregando(chave);
    try {
      const dados = await funcao();
      setAbrindo(false);
      await aoAtualizar(dados?.mensagem);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando('');
    }
  }

  function propor(evento) {
    evento.preventDefault();
    const numero = lerDinheiro(valor);
    if (!(numero > 0)) { setErro('Informe o valor a mais.'); return; }
    if (numero > servico.complementar_maximo) {
      setErro(`O máximo é ${formatarDinheiro(servico.complementar_maximo)} (50% do valor original).`);
      return;
    }
    if (justificativa.trim().length < 10) { setErro('Explique o trabalho a mais (pelo menos 10 caracteres).'); return; }
    if (!fotos.length) { setErro('A foto é obrigatória: mostre o que precisa ser feito.'); return; }
    const form = new FormData();
    form.append('valor', String(numero));
    form.append('justificativa', justificativa.trim());
    form.append('foto', fotos[0]);
    executar('propor', () => api.proporComplementar(servico.id, form));
  }

  if (!complementar) {
    if (!servico.pode_propor_complementar) return null;
    return (
      <section className="cartao complementar">
        <h2>Encontrou um trabalho a mais?</h2>
        <p className="complementar__texto">
          Você pode pedir um valor complementar uma única vez neste serviço, de até{' '}
          <strong>{formatarDinheiro(servico.complementar_maximo)}</strong> (50% do valor original), com foto e justificativa.
          O pedido aparece no seu perfil.
        </p>
        {!abrindo ? (
          <Botao tipo="secundario" type="button" onClick={() => setAbrindo(true)}>Propor valor complementar</Botao>
        ) : (
          <form className="empilha" onSubmit={propor}>
            <Aviso>{erro}</Aviso>
            <Campo etiqueta="Valor a mais (R$)" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            <Campo etiqueta="O que precisa ser feito e por quê">
              <textarea className="campo__entrada" rows={3} maxLength={600} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
            </Campo>
            <div>
              <span className="campo__etiqueta">Foto do problema (obrigatória)</span>
              <EscolherFotos fotos={fotos} aoMudar={setFotos} maximo={1} rotulo="Tirar ou escolher foto" aoErro={setErro} />
            </div>
            <div className="empilha">
              <Botao type="submit" carregando={carregando === 'propor'}>Enviar proposta para {nome}</Botao>
              <Botao tipo="secundario" type="button" onClick={() => setAbrindo(false)}>Voltar</Botao>
            </div>
          </form>
        )}
      </section>
    );
  }

  const { pagamento } = complementar;
  return (
    <section className="cartao complementar">
      <div className="entre">
        <h2>Valor complementar</h2>
        <span className={`etiqueta complementar__status complementar__status--${complementar.status}`}>{STATUS_COMPLEMENTAR[complementar.status]}</span>
      </div>
      <Aviso>{erro}</Aviso>
      <div className="complementar__proposta">
        <ImagemProtegida
          servicoId={servico.id}
          nome={complementar.foto}
          alt="Foto do trabalho a mais"
          className="complementar__foto"
          aoAbrir={aoAbrirFoto}
        />
        <div>
          <strong className="complementar__valor">+ {formatarDinheiro(complementar.valor)}</strong>
          <p>{complementar.justificativa}</p>
          <small>Proposto em {formatarDataHora(complementar.enviada_em)}</small>
        </div>
      </div>

      {papel === 'contratante' && complementar.status === 'pendente' && (
        <>
          <p className="complementar__texto">
            Se aceitar, você paga um Pix adicional. Ele fica congelado junto com o original e só sai quando você confirmar o serviço.
            Se recusar, vale o orçamento original.
          </p>
          <div className="andamento__botoes">
            <Botao type="button" carregando={carregando === 'aceitar'} onClick={() => executar('aceitar', () => api.aceitarComplementar(servico.id))}>
              Aceitar e pagar {formatarDinheiro(complementar.valor)}
            </Botao>
            <Botao tipo="perigo" type="button" carregando={carregando === 'recusar'} onClick={() => executar('recusar', () => api.recusarComplementar(servico.id))}>
              Recusar
            </Botao>
          </div>
        </>
      )}

      {papel === 'contratante' && complementar.status === 'aceita' && (
        pagamento?.em_aberto ? (
          <>
            <PagamentoPix pagamento={pagamento} aoVencer={() => aoAtualizar('')} />
            <Botao tipo="texto" type="button" onClick={() => executar('recusar', () => api.recusarComplementar(servico.id))}>
              Desistir do valor complementar
            </Botao>
          </>
        ) : (
          <div className="andamento__botoes">
            <p className="complementar__texto">O Pix adicional venceu sem pagamento.</p>
            <Botao type="button" carregando={carregando === 'aceitar'} onClick={() => executar('aceitar', () => api.aceitarComplementar(servico.id))}>
              Gerar o Pix de novo
            </Botao>
            <Botao tipo="perigo" type="button" carregando={carregando === 'recusar'} onClick={() => executar('recusar', () => api.recusarComplementar(servico.id))}>
              Recusar
            </Botao>
          </div>
        )
      )}

      {papel === 'prestador' && complementar.status === 'pendente' && (
        <p className="complementar__texto">Esperando {nome} responder. Enquanto isso, vale o orçamento original.</p>
      )}
      {papel === 'prestador' && complementar.status === 'aceita' && (
        <p className="complementar__texto">{nome} aceitou e está pagando o Pix adicional.</p>
      )}
      {complementar.status === 'paga' && (
        <div className="congelado" role="status">
          <IconeCadeado className="congelado__icone" width="20" height="20" aria-hidden="true" />
          <div>
            <strong>Valor complementar congelado</strong>
            <span>
              {papel === 'prestador'
                ? `Você recebe junto com o pagamento original quando ${nome} confirmar o serviço.`
                : 'Ele sai junto com o pagamento original quando você confirmar o serviço.'}
            </span>
          </div>
        </div>
      )}
      {complementar.status === 'recusada' && (
        <p className="complementar__texto">Proposta recusada. Vale o orçamento original, e o pagamento dele continua congelado.</p>
      )}
      {complementar.status === 'encerrada' && (
        <p className="complementar__texto">O serviço seguiu sem o pagamento do valor complementar, então a proposta ficou sem efeito.</p>
      )}
    </section>
  );
}
