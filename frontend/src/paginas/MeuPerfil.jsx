import { useEffect, useRef, useState } from 'react';
import { api } from '../servicos/api';
import { useAuth } from '../contexto/AuthContexto';
import Campo from '../componentes/Campo';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import Selecao from '../componentes/Selecao';
import Avatar from '../componentes/Avatar';
import { IconeEscudo, IconeBusca, IconeSelo } from '../componentes/Icones';
import { cpfValido, formatarCpf } from '../utils/formatos';
import './painel.css';

const LIMITE = 5;
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const LIMITE_FOTO_MB = 2;
const VAZIO = { descricao: '', foto_url: '', categorias: [], bairros: [], atende_apenas_mulheres: false };

// US06 - verificação de identidade pela chave Pix (tipo CPF). Sem foto de
// documento: a chave precisa ser o CPF da própria conta.
function CartaoChavePix({ identidade, aoConfirmar }) {
  const [trocando, setTrocando] = useState(false);
  const [chave, setChave] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const verificado = identidade.verificado;

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    if (!cpfValido(chave)) { setErro('Digite os 11 números do seu CPF.'); return; }
    setEnviando(true);
    try {
      await aoConfirmar({ tipo: 'cpf', chave });
      setTrocando(false);
      setChave('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="cartao">
      <h2>Receber pelo Pix</h2>
      {verificado && !trocando ? (
        <>
          <p className="identidade">
            <span className="selo-grande"><IconeSelo width="16" height="16" aria-hidden="true" /> Identidade verificada</span>
          </p>
          <p style={{ color: 'var(--texto-suave)', fontSize: 15 }}>
            Você recebe os pagamentos na chave Pix CPF <b>{identidade.chave_pix?.mascarada}</b>.
            Como a chave está no seu CPF, seu perfil mostra o selo para quem procura profissionais.
          </p>
          <Botao tipo="secundario" className="botao--curto" type="button" onClick={() => setTrocando(true)}>Trocar chave</Botao>
        </>
      ) : (
        <form onSubmit={enviar} noValidate>
          <p style={{ color: 'var(--texto-suave)', fontSize: 15 }}>
            Cadastre a chave Pix em que você quer receber. Ela precisa ser do tipo CPF e ser o mesmo CPF desta conta:
            assim confirmamos que é você, sem pedir foto de documento. Quem confirma ganha o selo de identidade verificada.
          </p>
          <Aviso>{erro}</Aviso>
          <Campo
            etiqueta="Chave Pix (CPF)"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={chave}
            onChange={(e) => setChave(formatarCpf(e.target.value))}
            required
          />
          <div className="empilha">
            <Botao type="submit" carregando={enviando}>Confirmar chave Pix</Botao>
            {trocando && <Botao tipo="secundario" type="button" onClick={() => { setTrocando(false); setErro(''); }}>Cancelar</Botao>}
          </div>
        </form>
      )}
    </div>
  );
}

export default function MeuPerfil() {
  const { usuario } = useAuth();
  const [areas, setAreas] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [perfil, setPerfil] = useState(VAZIO);      // o que está salvo
  const [rascunho, setRascunho] = useState(VAZIO);  // o que está sendo editado
  const [editando, setEditando] = useState(false);
  const [status, setStatus] = useState('ativo');
  const [temPerfil, setTemPerfil] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  // Foto: só é enviada ao salvar. Até lá fica aqui, com prévia local.
  const [arquivoFoto, setArquivoFoto] = useState(null);
  const [previa, setPrevia] = useState('');
  const [removerFoto, setRemoverFoto] = useState(false);
  const campoArquivo = useRef(null);
  // US06
  const [identidade, setIdentidade] = useState({ verificado: false, chave_pix: null });

  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  useEffect(() => {
    async function carregar() {
      try {
        const [dadosAreas, dadosBairros, dadosPerfil] = await Promise.all([
          api.areas(), api.bairros(), api.meuPerfil()
        ]);
        setAreas(dadosAreas.areas || []);
        setBairros(dadosBairros.bairros || []);

        const p = dadosPerfil.prestador;
        const salvo = p && {
          descricao: p.descricao || '',
          foto_url: p.foto_url || '',
          categorias: p.categorias.map((c) => c.id),
          bairros: p.bairros.map((b) => b.id),
          atende_apenas_mulheres: p.atende_apenas_mulheres
        };
        if (p) setIdentidade({ verificado: p.verificado, chave_pix: p.chave_pix });
        if (p && p.categorias.length) {
          setPerfil(salvo);
          setRascunho(salvo);
          setStatus(p.status);
          setTemPerfil(true);
        } else {
          // Perfil ainda não montado: já abre em modo de edição,
          // aproveitando o que já tiver sido preenchido.
          if (salvo) setRascunho(salvo);
          setEditando(true);
        }
      } catch (e) {
        setErro(e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  async function confirmarChavePix(corpo) {
    const dados = await api.cadastrarChavePix(corpo);
    setIdentidade({ verificado: dados.prestador.verificado, chave_pix: dados.prestador.chave_pix });
    setMensagem(dados.mensagem);
    setErro('');
  }

  function alternar(campo, id) {
    setRascunho((atual) => {
      const lista = atual[campo];
      return {
        ...atual,
        [campo]: lista.includes(id) ? lista.filter((item) => item !== id) : [...lista, id]
      };
    });
  }

  function descartarFotoPendente() {
    setArquivoFoto(null);
    setPrevia('');
    setRemoverFoto(false);
  }

  function escolherFoto(evento) {
    const arquivo = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!arquivo) return;
    if (!TIPOS_FOTO.includes(arquivo.type)) {
      setErro('Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (arquivo.size > LIMITE_FOTO_MB * 1024 * 1024) {
      setErro(`A foto pode ter no máximo ${LIMITE_FOTO_MB} MB.`);
      return;
    }
    setErro('');
    setArquivoFoto(arquivo);
    setPrevia(URL.createObjectURL(arquivo));
    setRemoverFoto(false);
  }

  function tirarFoto() {
    setArquivoFoto(null);
    setPrevia('');
    setRemoverFoto(true);
  }

  function comecarEdicao() {
    descartarFotoPendente();
    setRascunho(perfil);
    setMensagem('');
    setErro('');
    setEditando(true);
  }

  function cancelar() {
    descartarFotoPendente();
    setRascunho(perfil);
    setErro('');
    setEditando(false);
  }

  async function salvar(evento) {
    evento.preventDefault();
    setErro(''); setMensagem('');

    if (!rascunho.categorias.length) { setErro('Escolha ao menos uma categoria de serviço.'); return; }
    if (!rascunho.bairros.length) { setErro('Escolha ao menos um bairro que você atende.'); return; }

    setSalvando(true);
    try {
      // A foto tem endpoint próprio; o perfil vai sem ela.
      const { foto_url: fotoAtual, ...semFoto } = rascunho;
      await api.salvarPerfil(semFoto);

      let fotoFinal = fotoAtual;
      let avisoFoto = '';
      try {
        if (arquivoFoto) {
          fotoFinal = (await api.enviarFoto(arquivoFoto)).foto_url;
        } else if (removerFoto && fotoAtual) {
          await api.removerFoto();
          fotoFinal = '';
        }
      } catch (e) {
        avisoFoto = e.message;
      }

      const salvoAgora = { ...rascunho, foto_url: fotoFinal || '' };
      setRascunho(salvoAgora);
      setPerfil(salvoAgora);
      setTemPerfil(true);
      setEditando(false);
      descartarFotoPendente();
      if (avisoFoto) setErro(`Perfil salvo, mas a foto não foi atualizada: ${avisoFoto}`);
      else setMensagem('Perfil atualizado.');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function pausar() {
    setErro(''); setMensagem('');
    try {
      const dados = await api.alternarPausa();
      setStatus(dados.status);
      setMensagem(dados.mensagem);
    } catch (e) {
      setErro(e.message);
    }
  }

  function nomesDe(ids, fonte) {
    return fonte.filter((item) => ids.includes(item.id)).map((item) => item.nome);
  }

  const todasCategorias = areas.flatMap((a) => a.categorias);

  if (carregando) return <div className="pagina"><p className="subtitulo">Carregando seu perfil...</p></div>;

  return (
    <div className="pagina pagina--larga">
      <div className="painel-topo">
        <div>
          <h1>Meu perfil</h1>
          <p className="subtitulo" style={{ marginBottom: 0 }}>
            {editando ? 'Alterando. Nada muda até você salvar.' : 'É isso que as pessoas veem sobre você.'}
          </p>
        </div>
        {temPerfil && (
          <span className={`etiqueta etiqueta--${status === 'ativo' ? 'ativo' : 'pausado'}`}>
            <span className={`ponto ponto--${status === 'ativo' ? 'verde' : 'amarelo'}`} />
            {status === 'ativo' ? 'Aparecendo nas buscas' : 'Perfil pausado'}
          </span>
        )}
      </div>

      <Aviso>{erro}</Aviso>
      <Aviso tipo="sucesso">{mensagem}</Aviso>

      {!editando ? (
        <>
          <div className="cartao cartao--perfil">
            <div className="perfil-capa">
              <Avatar nome={usuario?.nome} foto={perfil.foto_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: '0 0 4px' }}>{usuario?.nome}</h2>
                <p style={{ margin: 0, color: 'var(--texto-claro)', fontSize: 14.5 }}>
                  Prestador de serviço
                </p>
              </div>
              <Botao tipo="secundario" className="botao--curto" type="button" onClick={comecarEdicao}>
                Editar perfil
              </Botao>
            </div>

            <p className="perfil-descricao">
              {perfil.descricao || 'Você ainda não escreveu nada sobre o seu trabalho.'}
            </p>

            <div className="bloco">
              <h3>O que você faz</h3>
              <div className="linha">
                {nomesDe(perfil.categorias, todasCategorias).map((nome) => (
                  <span className="etiqueta" key={nome}>{nome}</span>
                ))}
              </div>
            </div>

            <div className="bloco">
              <h3>Onde você atende</h3>
              <div className="bloco__texto">
                <IconeBusca width="17" height="17" />
                <span>{nomesDe(perfil.bairros, bairros).join(' · ') || 'Nenhum bairro selecionado.'}</span>
              </div>
            </div>

            {perfil.atende_apenas_mulheres && (
              <div className="bloco">
                <span className="etiqueta etiqueta--ativo">
                  <IconeEscudo width="14" height="14" /> Atende apenas mulheres
                </span>
              </div>
            )}
          </div>

          <CartaoChavePix identidade={identidade} aoConfirmar={confirmarChavePix} />

          <div className="cartao">
            <h2>{status === 'ativo' ? 'Precisa dar uma pausa?' : 'Pronto para voltar?'}</h2>
            <p style={{ color: 'var(--texto-suave)', fontSize: 15 }}>
              {status === 'ativo'
                ? 'Enquanto pausado você não aparece nas buscas, mas seu perfil e seu histórico continuam guardados.'
                : 'Seu perfil volta a aparecer para quem procura profissionais.'}
            </p>
            <Botao tipo="secundario" type="button" onClick={pausar}>
              {status === 'ativo' ? 'Pausar meu perfil' : 'Voltar a aparecer'}
            </Botao>
          </div>
        </>
      ) : (
        <form onSubmit={salvar}>
          <div className="cartao">
            <h2>Sobre o seu trabalho</h2>
            <div className="foto-editor">
              <Avatar nome={usuario?.nome} foto={previa || (removerFoto ? '' : rascunho.foto_url)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="campo__etiqueta">Foto de perfil</span>
                <input
                  ref={campoArquivo}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={escolherFoto}
                  hidden
                />
                <div className="empilha" style={{ marginTop: 6 }}>
                  <Botao tipo="secundario" className="botao--curto" type="button" onClick={() => campoArquivo.current?.click()}>
                    {previa || (rascunho.foto_url && !removerFoto) ? 'Trocar foto' : 'Escolher foto'}
                  </Botao>
                  {(previa || (rascunho.foto_url && !removerFoto)) && (
                    <Botao tipo="texto" type="button" onClick={tirarFoto}>Remover</Botao>
                  )}
                </div>
                <span className="campo__ajuda" style={{ display: 'block', marginTop: 6 }}>
                  JPG, PNG ou WebP, até {LIMITE_FOTO_MB} MB. A foto só é enviada quando você salvar.
                </span>
              </div>
            </div>
            <Campo etiqueta="Descrição">
              <textarea
                value={rascunho.descricao}
                onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
                placeholder="Conte em poucas linhas o que você faz e há quanto tempo."
                maxLength={600}
              />
            </Campo>
          </div>

          <div className="cartao">
            <h2>O que você faz</h2>
            <div className="contador">
              <p>Escolha até {LIMITE} categorias</p>
              <span className="contador__marca">{rascunho.categorias.length} de {LIMITE}</span>
            </div>
            <div className="contador__trilha">
              <span style={{ width: `${(rascunho.categorias.length / LIMITE) * 100}%` }} />
            </div>
            {areas.map((area) => (
              <div key={area.id} style={{ marginBottom: 14 }}>
                <span className="etiqueta" style={{ marginBottom: 8 }}>{area.nome}</span>
                <Selecao
                  opcoes={area.categorias}
                  selecionados={rascunho.categorias}
                  limite={LIMITE}
                  aoAlternar={(id) => alternar('categorias', id)}
                />
              </div>
            ))}
          </div>

          <div className="cartao">
            <h2>Onde você atende</h2>
            <p style={{ color: 'var(--texto-suave)', fontSize: 15 }}>Selecione os bairros de Campinas.</p>
            <Selecao
              opcoes={bairros}
              selecionados={rascunho.bairros}
              aoAlternar={(id) => alternar('bairros', id)}
            />
          </div>

          {usuario?.sexo === 'feminino' && (
            <div className="cartao">
              <h2>Atendimento entre mulheres</h2>
              <label className={`marcar ${rascunho.atende_apenas_mulheres ? 'marcar--marcado' : ''}`}>
                <input
                  type="checkbox"
                  checked={rascunho.atende_apenas_mulheres}
                  onChange={(e) => setRascunho({ ...rascunho, atende_apenas_mulheres: e.target.checked })}
                />
                <span>Quero atender apenas mulheres. Você pode mudar isso quando quiser.</span>
              </label>
            </div>
          )}

          <div className="empilha">
            <Botao type="submit" carregando={salvando}>Salvar alterações</Botao>
            {temPerfil && (
              <Botao tipo="secundario" type="button" onClick={cancelar}>Cancelar</Botao>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
