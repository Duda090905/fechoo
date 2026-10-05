import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../servicos/api';
import { useAuth } from '../contexto/AuthContexto';
import {
  IconeBusca, IconeCadeado, IconeEscudo, IconeRelogio, IconeSeta
} from '../componentes/Icones';
import './inicio.css';

// A home só fala do que o sistema faz hoje (Sprint 1). Pagamento retido,
// orçamento, avaliação e disputa entram aqui quando forem entregues.

const PARA_CONTRATAR = [
  { icone: <IconeBusca />, texto: 'Veja os profissionais com perfil completo: o que fazem e em quais bairros atendem.' },
  { icone: <IconeEscudo />, texto: 'Prefere ser atendida por uma mulher? Use o filtro para ver só prestadoras mulheres.' },
  { icone: <IconeCadeado />, texto: 'Seus dados são seus: você pode desativar a conta ou apagar tudo quando quiser.' }
];

const PARA_TRABALHAR = [
  { icone: <IconeBusca />, texto: 'Escolha até 5 serviços e os bairros que você atende, e seja encontrado.' },
  { icone: <IconeRelogio />, texto: 'Vai viajar ou está sem agenda? Pause o perfil e volte quando quiser.' },
  { icone: <IconeEscudo />, texto: 'Prestadoras podem optar por atender apenas mulheres.' }
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
            <h1>
              O profissional certo,<br />
              <span className="grifo">perto de você.</span>
            </h1>
            <p>
              Encontre eletricista, encanador, diarista ou chaveiro que atende no seu bairro.
              Ou monte o seu perfil e seja encontrado por quem precisa.
            </p>

            <div className="capa__acoes">
              {usuario ? (
                <Link className="botao-capa" to="/prestadores">
                  Ver profissionais <IconeSeta width="18" height="18" />
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
        </div>
      </section>

      {/* Serviços -------------------------------------------------------- */}
      <section className="secao" id="servicos">
        <div className="secao__interno">
          <header className="secao__cabecalho">
            <span className="secao__etiqueta">Serviços</span>
            <h2>O que você encontra por aqui</h2>
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

      {/* Chamada final --------------------------------------------------- */}
      {!usuario && (
        <section className="chamada">
          <div className="chamada__interno">
            <h2>Pronto para começar?</h2>
            <p>Criar conta leva menos de um minuto e não custa nada.</p>
            <Link className="botao-capa" to="/criar-conta">
              Criar conta <IconeSeta width="18" height="18" />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
