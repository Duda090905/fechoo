import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../servicos/api';
import { useAuth } from '../contexto/AuthContexto';
import Campo from './Campo';
import Botao from './Botao';
import Aviso from './Aviso';
import Avatar from './Avatar';
import { IconeFechar, IconeMais } from './Icones';
import { deCampoDataHora, paraCampoDataHora } from '../utils/formatos';
import './pedir-orcamento.css';

const LIMITE_FOTOS = 3;
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const LIMITE_FOTO_MB = 2;

// US10 - pedido de orçamento, com fotos. US13 - com data e hora.
// Abre por cima da busca: no celular sobe de baixo, no computador vem da lateral.
export default function PedirOrcamento({ prestador, bairros, bairroInicial, aoFechar }) {
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const primeiroCampo = useRef(null);
  const campoArquivo = useRef(null);

  const [descricao, setDescricao] = useState('');
  const [bairro, setBairro] = useState(bairroInicial || '');
  const [dataHora, setDataHora] = useState('');
  const [fotos, setFotos] = useState([]); // { arquivo, previa }
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Fecha com Esc e devolve a rolagem da página ao fechar.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    primeiroCampo.current?.focus();
    function aoTeclar(e) { if (e.key === 'Escape') aoFechar(); }
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [aoFechar]);

  // Prévias locais: liberadas ao tirar a foto e ao fechar o pedido.
  const previas = useRef([]);
  previas.current = fotos;
  useEffect(() => () => previas.current.forEach((f) => URL.revokeObjectURL(f.previa)), []);

  const foraDaArea = bairro && !prestador.bairros.some((b) => String(b.id) === String(bairro));
  const minimo = paraCampoDataHora(new Date(Date.now() + 5 * 60000));

  function escolherFotos(evento) {
    const escolhidas = Array.from(evento.target.files || []);
    evento.target.value = '';
    const novas = [];
    for (const arquivo of escolhidas) {
      if (!TIPOS_FOTO.includes(arquivo.type)) { setErro('Use fotos JPG, PNG ou WebP.'); return; }
      if (arquivo.size > LIMITE_FOTO_MB * 1024 * 1024) { setErro(`Cada foto pode ter no máximo ${LIMITE_FOTO_MB} MB.`); return; }
      novas.push({ arquivo, previa: URL.createObjectURL(arquivo) });
    }
    if (fotos.length + novas.length > LIMITE_FOTOS) {
      novas.forEach((f) => URL.revokeObjectURL(f.previa));
      setErro(`Envie no máximo ${LIMITE_FOTOS} fotos.`);
      return;
    }
    setErro('');
    setFotos([...fotos, ...novas]);
  }

  function tirarFoto(indice) {
    URL.revokeObjectURL(fotos[indice].previa);
    setFotos(fotos.filter((_, i) => i !== indice));
  }

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    if (!descricao.trim()) { setErro('Conte o que você precisa.'); return; }
    if (!bairro) { setErro('Escolha o bairro onde o serviço vai ser feito.'); return; }
    const iso = deCampoDataHora(dataHora);
    if (!iso) { setErro('Escolha o dia e a hora.'); return; }
    if (new Date(iso) <= new Date()) { setErro('Essa data já passou. Escolha um dia e hora que ainda estão por vir.'); return; }

    const form = new FormData();
    form.append('id_prestador', prestador.id);
    form.append('descricao', descricao.trim());
    form.append('bairro_id', bairro);
    form.append('data_hora', iso);
    fotos.forEach((f) => form.append('fotos', f.arquivo));

    setEnviando(true);
    try {
      const dados = await api.criarServico(form);
      navegar(`/servicos/${dados.servico.id}`, { state: { recemCriado: true } });
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="gaveta" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="gaveta__painel" role="dialog" aria-modal="true" aria-labelledby="titulo-pedido">
        <header className="gaveta__topo">
          <div className="gaveta__quem">
            <Avatar nome={prestador.nome} foto={prestador.foto_url} />
            <div>
              <h2 id="titulo-pedido">Pedir orçamento</h2>
              <p>para {prestador.nome}</p>
            </div>
          </div>
          <button type="button" className="gaveta__fechar" onClick={aoFechar} aria-label="Fechar">
            <IconeFechar />
          </button>
        </header>

        {!usuario ? (
          <div className="gaveta__corpo">
            <p className="subtitulo">Para pedir um orçamento, entre na sua conta. Leva menos de um minuto para criar uma.</p>
            <div className="empilha">
              <Link className="botao botao--principal gaveta__link" to="/entrar">Entrar</Link>
              <Link className="botao botao--secundario gaveta__link" to="/criar-conta">Criar conta</Link>
            </div>
          </div>
        ) : (
          <form className="gaveta__corpo" onSubmit={enviar} noValidate>
            <Aviso>{erro}</Aviso>

            <Campo etiqueta="O que você precisa?" ajuda="Não precisa informar o endereço agora.">
              <textarea
                ref={primeiroCampo}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: trocar o chuveiro e consertar uma tomada que não funciona."
                maxLength={1000}
                required
              />
            </Campo>

            <Campo etiqueta="Em qual bairro?">
              <select value={bairro} onChange={(e) => setBairro(e.target.value)} required>
                <option value="">Escolha o bairro</option>
                {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </Campo>
            {foraDaArea && (
              <Aviso tipo="neutro">
                {prestador.nome.split(' ')[0]} normalmente não atende esse bairro. O orçamento pode vir com taxa de deslocamento.
              </Aviso>
            )}

            <Campo
              etiqueta="Quando?"
              type="datetime-local"
              value={dataHora}
              min={minimo}
              onChange={(e) => setDataHora(e.target.value)}
              ajuda="O profissional confirma ou sugere outro horário no orçamento."
              required
            />

            <div className="campo">
              <span className="campo__etiqueta">Fotos (opcional)</span>
              <div className="fotos-pedido">
                {fotos.map((f, i) => (
                  <div className="fotos-pedido__item" key={f.previa}>
                    <img src={f.previa} alt={`Foto ${i + 1} do pedido`} />
                    <button type="button" onClick={() => tirarFoto(i)} aria-label={`Tirar a foto ${i + 1}`}>
                      <IconeFechar width="16" height="16" />
                    </button>
                  </div>
                ))}
                {Array.from({ length: LIMITE_FOTOS - fotos.length }).map((_, i) => (
                  <button
                    type="button"
                    key={`vaga-${i}`}
                    className="fotos-pedido__vaga"
                    onClick={() => campoArquivo.current?.click()}
                    aria-label="Adicionar foto"
                  >
                    <IconeMais width="22" height="22" />
                  </button>
                ))}
              </div>
              <input
                ref={campoArquivo}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={escolherFotos}
              />
              <span className="campo__ajuda">Até {LIMITE_FOTOS} fotos de {LIMITE_FOTO_MB} MB. A localização gravada na foto é apagada no envio.</span>
            </div>

            <Botao type="submit" carregando={enviando}>Enviar pedido</Botao>
          </form>
        )}
      </div>
    </div>
  );
}
