import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../servicos/api';
import { useAuth } from '../contexto/AuthContexto';
import {
  IconeBusca, IconeCadeado, IconeCheque, IconeEscudo,
  IconeConversa, IconeCarteira, IconeEstrela, IconeRelogio, IconeSeta
} from '../componentes/Icones';
import './inicio.css';

const PASSOS = [
  {
    icone: <IconeBusca />,
    titulo: 'Você encontra',
    texto: 'Busca pelo serviço e pelo bairro. Aparece quem atende ali e está disponível agora.'
  },
  {
    icone: <IconeConversa />,
    titulo: 'Combina o preço',
    texto: 'Descreve o problema, recebe o orçamento e só libera seu endereço depois de aceitar.'
  },
  {
    icone: <IconeCadeado />,
    titulo: 'Paga e o valor fica retido',
    texto: 'O Pix cai na plataforma, não no bolso de ninguém. O profissional vê que está garantido.'
  },
  {
    icone: <IconeCheque />,
    titulo: 'Serviço feito, dinheiro liberado',
    texto: 'Você confirma que ficou bom e o valor vai para quem trabalhou. Deu problema, abre disputa.'
  }
];

const PARA_CONTRATAR = [
  { icone: <IconeEscudo />, texto: 'Seu dinheiro não sai da plataforma até você confirmar o serviço.' },
  { icone: <IconeEstrela />, texto: 'Avaliação só de quem contratou de verdade. Não tem review inventado.' },
  { icone: <IconeCadeado />, texto: 'Seu endereço fica escondido até você aceitar o orçamento.' }
];

const PARA_TRABALHAR = [
  { icone: <IconeCarteira />, texto: 'O valor já está retido antes de você sair de casa. Calote não acontece.' },
  { icone: <IconeRelogio />, texto: 'Você escolhe os bairros que atende e pausa o perfil quando precisar.' },
  { icone: <IconeEstrela />, texto: 'Taxa de 8% só sobre serviço concluído, e ela cai conforme você trabalha.' }
];

const PERGUNTAS = [
  {
    p: 'Quem fica com o meu dinheiro enquanto o serviço não termina?',
    r: 'Ninguém da plataforma. O valor fica em uma instituição de pagamento autorizada pelo Banco Central. O Fechô só dá a ordem de liberar quando o serviço é confirmado.'
  },
  {
    p: 'E se o profissional fizer o serviço errado?',
    r: 'Você abre uma disputa com foto e justificativa em até 72 horas. O valor congela na hora, o profissional apresenta a defesa dele e um administrador decide para onde o dinheiro vai.'
  },
  {
    p: 'Posso contratar alguém que já me atendeu antes?',
    r: 'Pode. O histórico guarda todos os profissionais que passaram na sua casa, e dá para chamar de novo com um toque.'
  },
  {
    p: 'Sou mulher e moro sozinha. Tenho como escolher quem entra na minha casa?',
    r: 'Tem. Existe um filtro para ver apenas profissionais mulheres, e algumas prestadoras optam por atender somente mulheres.'
  },
  {
    p: 'Quanto custa para quem oferece serviço?',
    r: 'Nada para se cadastrar e nada para enviar orçamento. A plataforma fica com 8% apenas quando o serviço é concluído e pago, e essa taxa cai para 6% depois de 20 serviços e 5% depois de 50.'
  }
];

export default function Inicio() {
  const { usuario } = useAuth();
  const [areas, setAreas] = useState([]);

  useEffect(() => {
    // Se a API estiver fora, a home continua de pé sem a lista.
    api.areas().then((d) => setAreas(d.areas || [])).catch(() => setAreas([]));
  }, []);

  return (
    <div className="inicio">

      {/* Capa ------------------------------------------------------------ */}
      <section className="capa">
        <div className="capa__interno">
          <div className="capa__texto">
            <span className="selo-capa">Pagamento retido até o serviço terminar</span>
            <h1>
              Serviço contratado,<br />
              <span className="grifo">dinheiro garantido.</span>
            </h1>
            <p>
              Encontre eletricista, encanador, diarista ou chaveiro perto de você — e pague
              sabendo que o valor só sai quando o trabalho estiver feito.
            </p>

            <div className="capa__acoes">
              {usuario ? (
                <Link className="botao-capa" to="/prestadores">
                  Encontrar um profissional <IconeSeta width="18" height="18" />
                </Link>
              ) : (
                <>
                  <Link className="botao-capa" to="/criar-conta">
                    Preciso de um serviço <IconeSeta width="18" height="18" />
                  </Link>
                  <Link className="botao-capa botao-capa--vazado" to="/criar-conta">
                    Quero oferecer meu trabalho
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* O painel abaixo é o produto em uma imagem: o dinheiro parado
              no meio do caminho. É o que nenhum concorrente tem. */}
          <div className="painel-escrow" aria-hidden="true">
            <div className="painel-escrow__topo">
              <span>Instalação de chuveiro</span>
              <strong>R$ 180,00</strong>
            </div>

            <ol className="trilha">
              <li className="trilha__item trilha__item--feito">
                <span className="trilha__marca" />
                <div>
                  <strong>Orçamento aceito</strong>
                  <small>ontem, 19:42</small>
                </div>
              </li>
              <li className="trilha__item trilha__item--agora">
                <span className="trilha__marca" />
                <div>
                  <strong>Valor retido na plataforma</strong>
                  <small>o dinheiro está aqui, parado</small>
                </div>
              </li>
              <li className="trilha__item">
                <span className="trilha__marca" />
                <div>
                  <strong>Serviço concluído</strong>
                  <small>aguardando sua confirmação</small>
                </div>
              </li>
              <li className="trilha__item">
                <span className="trilha__marca" />
                <div>
                  <strong>Repasse liberado</strong>
                  <small>vai para o profissional</small>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Como funciona --------------------------------------------------- */}
      <section className="secao" id="como-funciona">
        <div className="secao__interno">
          <header className="secao__cabecalho">
            <span className="secao__etiqueta">Como funciona</span>
            <h2>Quatro passos, e o dinheiro sempre visível</h2>
            <p>Do primeiro contato até o pagamento, sem combinar nada por fora.</p>
          </header>

          <div className="passos">
            {PASSOS.map((passo, i) => (
              <article className="passo" key={passo.titulo}>
                <span className="passo__numero">{String(i + 1).padStart(2, '0')}</span>
                <span className="passo__icone">{passo.icone}</span>
                <h3>{passo.titulo}</h3>
                <p>{passo.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Diferencial ----------------------------------------------------- */}
      <section className="secao secao--escura" id="seguranca">
        <div className="secao__interno destaque">
          <div>
            <span className="secao__etiqueta secao__etiqueta--clara">O que muda aqui</span>
            <h2>Os outros conectam e somem.<br />O Fechô fica até o serviço terminar.</h2>
            <p>
              Em qualquer outro site de serviços o pagamento acontece por fora, no Pix direto entre
              duas pessoas que nunca se viram. Quem contrata paga e torce. Quem trabalha executa e torce.
            </p>
            <p>
              Aqui o valor passa por dentro da plataforma e fica retido até o serviço ser confirmado.
              É a mesma ideia de deixar o dinheiro com alguém de confiança enquanto o combinado não
              se cumpre — só que automático.
            </p>
          </div>

          <div className="comparativo">
            <div className="comparativo__coluna">
              <h4>Por fora</h4>
              <ul>
                <li>Paga adiantado e reza</li>
                <li>Trabalha e cobra depois</li>
                <li>Deu errado, é prejuízo</li>
                <li>Avaliação que qualquer um escreve</li>
              </ul>
            </div>
            <div className="comparativo__coluna comparativo__coluna--destaque">
              <h4>No Fechô</h4>
              <ul>
                <li>Paga e o valor fica retido</li>
                <li>Sai de casa com o dinheiro garantido</li>
                <li>Deu errado, abre disputa</li>
                <li>Só avalia quem contratou</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Serviços -------------------------------------------------------- */}
      <section className="secao" id="servicos">
        <div className="secao__interno">
          <header className="secao__cabecalho">
            <span className="secao__etiqueta">Serviços</span>
            <h2>O que dá para resolver pelo Fechô</h2>
            <p>Serviços de casa, daqueles que você contrata de vez em quando e nunca sabe a quem pedir.</p>
          </header>

          {areas.length > 0 ? (
            <div className="areas">
              {areas.map((area) => (
                <article className="area" key={area.id}>
                  <h3>{area.nome}</h3>
                  <div className="linha">
                    {area.categorias.map((c) => (
                      <span className="etiqueta" key={c.id}>{c.nome}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="subtitulo">Carregando os serviços disponíveis...</p>
          )}
        </div>
      </section>

      {/* Dois públicos --------------------------------------------------- */}
      <section className="secao secao--clara">
        <div className="secao__interno publicos">
          <article className="publico">
            <h3>Para quem precisa de um serviço</h3>
            <ul>
              {PARA_CONTRATAR.map((item) => (
                <li key={item.texto}><span>{item.icone}</span>{item.texto}</li>
              ))}
            </ul>
            <Link className="publico__link" to="/prestadores">
              Ver profissionais <IconeSeta width="17" height="17" />
            </Link>
          </article>

          <article className="publico publico--destaque">
            <h3>Para quem vive do próprio trabalho</h3>
            <ul>
              {PARA_TRABALHAR.map((item) => (
                <li key={item.texto}><span>{item.icone}</span>{item.texto}</li>
              ))}
            </ul>
            <Link className="publico__link" to="/criar-conta">
              Criar meu perfil <IconeSeta width="17" height="17" />
            </Link>
          </article>
        </div>
      </section>

      {/* Perguntas ------------------------------------------------------- */}
      <section className="secao" id="perguntas">
        <div className="secao__interno secao__interno--estreito">
          <header className="secao__cabecalho">
            <span className="secao__etiqueta">Perguntas frequentes</span>
            <h2>O que todo mundo pergunta antes</h2>
          </header>

          <div className="perguntas">
            {PERGUNTAS.map((item) => (
              <details className="pergunta" key={item.p}>
                <summary>{item.p}</summary>
                <p>{item.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Chamada final --------------------------------------------------- */}
      {!usuario && (
        <section className="chamada">
          <div className="chamada__interno">
            <h2>Precisa de alguém hoje?</h2>
            <p>Criar conta leva menos de um minuto e não custa nada.</p>
            <Link className="botao-capa" to="/criar-conta">
              Começar agora <IconeSeta width="18" height="18" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
