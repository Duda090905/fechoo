import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../servicos/api';
import Aviso from '../componentes/Aviso';
import Avatar from '../componentes/Avatar';
import Botao from '../componentes/Botao';
import Campo from '../componentes/Campo';
import PedirOrcamento from '../componentes/PedirOrcamento';
import { Estrelas } from '../componentes/AndamentoServico';
import { IconeConversa, IconeLocal, IconeVoltar } from '../componentes/Icones';
import { formatarDia, formatarDinheiro } from '../utils/formatos';
import './painel.css';
import './servicos.css';

// US16 - Histórico e recontratação: quem já atendeu o contratante, com data,
// valor e a nota que ele deu. "Chamar de novo" abre um pedido já preenchido.
// Quem saiu da plataforma continua no histórico, mas sem o botão.
export default function Historico() {
  const [categoria, setCategoria] = useState('');
  const [categorias, setCategorias] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [chamando, setChamando] = useState(null);

  useEffect(() => {
    api.bairros().then((d) => setBairros(d.bairros || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setCarregando(true);
    api.historico(categoria)
      .then((d) => {
        setServicos(d.servicos || []);
        if (!categoria) setCategorias(d.categorias || []);
        setErro('');
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [categoria]);

  return (
    <div className="pagina pagina--larga">
      <div className="painel-topo">
        <div>
          <Link to="/servicos" className="voltar"><IconeVoltar width="18" height="18" /> Meus serviços</Link>
          <h1>Quem já me atendeu</h1>
          <p className="subtitulo" style={{ marginBottom: 0 }}>Os serviços já feitos. Gostou? Chame de novo com um clique.</p>
        </div>
        {categorias.length > 1 && (
          <div className="historico__filtro">
            <Campo etiqueta="Tipo de serviço">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Todos</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          </div>
        )}
      </div>

      <Aviso>{erro}</Aviso>
      {carregando && <p className="subtitulo">Carregando...</p>}

      {!carregando && !servicos.length && (
        <div className="nada-servicos">
          <span className="nada-servicos__icone"><IconeConversa width="26" height="26" /></span>
          <h3>{categoria ? 'Nenhum serviço desse tipo' : 'Nenhum serviço concluído ainda'}</h3>
          <p>Quando um serviço for confirmado, o profissional aparece aqui para você chamar de novo.</p>
          <Link className="botao botao--secundario botao--curto" to="/prestadores">Encontrar um profissional</Link>
        </div>
      )}

      {!carregando && servicos.length > 0 && (
        <div className="historico">
          {servicos.map((s) => (
            <article className="historico__item" key={s.id}>
              <Avatar nome={s.prestador.nome} foto={s.prestador.foto_url} />
              <div className="historico__texto">
                <span className="pedido__quem">{s.prestador.nome}</span>
                <span className="pedido__descricao">{s.descricao}</span>
                <span className="pedido__meta">
                  {formatarDia(s.horario)}
                  {s.categoria && <span className="etiqueta">{s.categoria.nome}</span>}
                  <span className="pedido__bairro"><IconeLocal width="14" height="14" aria-hidden="true" /> {s.bairro?.nome}</span>
                </span>
                <span className="historico__numeros">
                  <strong>{formatarDinheiro(s.valor)}</strong>
                  {s.minha_nota ? <Estrelas nota={s.minha_nota} tamanho={15} /> : <span>Você não avaliou</span>}
                  <Link to={`/servicos/${s.id}`}>Ver o serviço</Link>
                </span>
              </div>
              <div className="historico__acao">
                {s.prestador.disponivel ? (
                  <Botao tipo="escuro" type="button" className="botao--curto" onClick={() => setChamando(s)}>
                    Chamar de novo
                  </Botao>
                ) : (
                  <span className="historico__indisponivel">
                    {s.prestador.situacao === 'pausado' ? 'Pausado no momento' : 'Não está mais no Fechô'}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {chamando && (
        <PedirOrcamento
          prestador={chamando.prestador.perfil}
          bairros={bairros}
          bairroInicial={chamando.bairro?.id ? String(chamando.bairro.id) : ''}
          categoriaId={chamando.categoria?.id}
          descricaoInicial={chamando.descricao}
          aoFechar={() => setChamando(null)}
        />
      )}
    </div>
  );
}
