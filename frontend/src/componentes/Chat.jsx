import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../servicos/api';
import ImagemProtegida from './ImagemProtegida';
import { IconeEnviar, IconeFechar, IconeImagem } from './Icones';
import { formatarDia, formatarHora, chaveDoDia } from '../utils/formatos';
import './chat.css';

const INTERVALO_MS = 3000;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

// US12 - Chat interno do serviço. Só as duas partes veem; busca as novas
// mensagens a cada 3 segundos; depois do encerramento, só leitura.
export default function Chat({ servicoId, aberto, outraParte, aoMudarStatus }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [imagem, setImagem] = useState(null); // { arquivo, previa }
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ampliada, setAmpliada] = useState(null);
  const ultimoId = useRef(0);
  const lista = useRef(null);
  const campoArquivo = useRef(null);
  const statusConhecido = useRef(null);

  const acrescentar = useCallback((novas) => {
    if (!novas.length) return;
    ultimoId.current = novas[novas.length - 1].id;
    setMensagens((atuais) => {
      const ids = new Set(atuais.map((m) => m.id));
      return [...atuais, ...novas.filter((m) => !ids.has(m.id))];
    });
  }, []);

  // Busca inicial e as novas a cada 3 segundos, enquanto a aba está visível.
  useEffect(() => {
    let ativo = true;
    async function buscar() {
      if (document.hidden) return;
      try {
        const dados = await api.mensagens(servicoId, ultimoId.current);
        if (!ativo) return;
        acrescentar(dados.mensagens);
        // A outra parte mudou o serviço (por exemplo, recusou o orçamento).
        if (statusConhecido.current && statusConhecido.current !== dados.status) aoMudarStatus?.();
        statusConhecido.current = dados.status;
      } catch { /* tenta de novo na próxima volta */ }
    }
    buscar();
    const temporizador = setInterval(buscar, INTERVALO_MS);
    return () => { ativo = false; clearInterval(temporizador); };
  }, [servicoId, acrescentar, aoMudarStatus]);

  // Rola até a última mensagem quando chega uma nova.
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens.length]);

  useEffect(() => () => { if (imagem) URL.revokeObjectURL(imagem.previa); }, [imagem]);

  function escolherImagem(evento) {
    const arquivo = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!arquivo) return;
    if (!TIPOS.includes(arquivo.type)) { setErro('Use uma imagem JPG, PNG ou WebP.'); return; }
    if (arquivo.size > 2 * 1024 * 1024) { setErro('A imagem pode ter no máximo 2 MB.'); return; }
    setErro('');
    setImagem({ arquivo, previa: URL.createObjectURL(arquivo) });
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (!texto.trim() && !imagem) return;
    const form = new FormData();
    if (texto.trim()) form.append('texto', texto.trim());
    if (imagem) form.append('imagem', imagem.arquivo);

    setEnviando(true);
    setErro('');
    try {
      const dados = await api.enviarMensagem(servicoId, form);
      acrescentar([dados.mensagem]);
      setTexto('');
      setImagem(null);
    } catch (e) {
      setErro(e.message);
      aoMudarStatus?.();
    } finally {
      setEnviando(false);
    }
  }

  function aoTeclar(evento) {
    // Enter envia; Shift+Enter quebra a linha.
    if (evento.key === 'Enter' && !evento.shiftKey) enviar(evento);
  }

  let diaAnterior = '';

  return (
    <section className="chat" aria-label={`Conversa com ${outraParte}`}>
      <header className="chat__topo">
        <h2>Conversa com {outraParte}</h2>
        <p>{aberto ? 'Só vocês dois veem estas mensagens.' : 'Conversa encerrada. As mensagens continuam guardadas.'}</p>
      </header>

      <div className="chat__mensagens" ref={lista} aria-live="polite">
        {!mensagens.length && (
          <p className="chat__vazio">
            {aberto ? 'Combine os detalhes por aqui, sem precisar passar seu telefone.' : 'Nenhuma mensagem foi trocada.'}
          </p>
        )}
        {mensagens.map((m) => {
          const dia = chaveDoDia(m.enviada_em);
          const mostrarDia = dia !== diaAnterior;
          diaAnterior = dia;
          return (
            <div key={m.id} className="chat__grupo">
              {mostrarDia && <p className="chat__dia">{formatarDia(m.enviada_em)}</p>}
              <div className={`balao ${m.minha ? 'balao--minha' : ''}`}>
                {m.imagem && (
                  <ImagemProtegida
                    servicoId={servicoId}
                    nome={m.imagem}
                    alt={`Imagem enviada por ${m.minha ? 'você' : m.autor?.nome}`}
                    className="balao__imagem"
                    aoAbrir={(url, alt) => setAmpliada({ url, alt })}
                  />
                )}
                {m.imagem_removida && <span className="balao__removida">Imagem removida depois do prazo de guarda</span>}
                {m.texto && <p className="balao__texto">{m.texto}</p>}
                <span className="balao__hora">{formatarHora(m.enviada_em)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {aberto ? (
        <form className="chat__escrever" onSubmit={enviar}>
          {erro && <p className="chat__erro" role="alert">{erro}</p>}
          {imagem && (
            <div className="chat__previa">
              <img src={imagem.previa} alt="Imagem escolhida" />
              <button type="button" onClick={() => setImagem(null)} aria-label="Tirar a imagem">
                <IconeFechar width="16" height="16" />
              </button>
            </div>
          )}
          <div className="chat__linha">
            <button
              type="button"
              className="chat__anexar"
              onClick={() => campoArquivo.current?.click()}
              aria-label="Enviar imagem"
              title="Enviar imagem"
            >
              <IconeImagem />
            </button>
            <input ref={campoArquivo} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={escolherImagem} />
            <label className="sr-only" htmlFor={`mensagem-${servicoId}`}>Mensagem</label>
            <textarea
              id={`mensagem-${servicoId}`}
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={aoTeclar}
              placeholder="Escreva uma mensagem"
              maxLength={1000}
            />
            <button
              type="submit"
              className="chat__enviar"
              disabled={enviando || (!texto.trim() && !imagem)}
              aria-label="Enviar mensagem"
            >
              <IconeEnviar />
            </button>
          </div>
        </form>
      ) : (
        <p className="chat__encerrado">Este serviço foi encerrado e a conversa não recebe novas mensagens.</p>
      )}

      {ampliada && (
        <div className="ampliada" role="dialog" aria-modal="true" aria-label="Imagem ampliada" onClick={() => setAmpliada(null)}>
          <img src={ampliada.url} alt={ampliada.alt} />
          <button type="button" aria-label="Fechar imagem" onClick={() => setAmpliada(null)}><IconeFechar /></button>
        </div>
      )}
    </section>
  );
}
