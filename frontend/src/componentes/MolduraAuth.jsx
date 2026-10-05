import { Link } from 'react-router-dom';
import { IconeBusca, IconeCadeado, IconeEscudo } from './Icones';
import './moldura-auth.css';

const ARGUMENTOS = [
  { icone: <IconeBusca />, texto: 'Encontre quem atende no seu bairro.' },
  { icone: <IconeEscudo />, texto: 'Prefere ser atendida por uma mulher? Use o filtro.' },
  { icone: <IconeCadeado />, texto: 'Seus dados são seus: apague quando quiser.' }
];

// Nas telas de conta, a lateral escura repete por que vale a pena
// criar a conta. Some no celular, onde espaço é o que falta.
export default function MolduraAuth({ titulo, subtitulo, children, rodape }) {
  return (
    <div className="moldura">
      <aside className="moldura__lado">
        <Link to="/" className="marca">Fechô</Link>
        <h2>O profissional certo, perto de você.</h2>
        <ul>
          {ARGUMENTOS.map((item) => (
            <li key={item.texto}><span>{item.icone}</span>{item.texto}</li>
          ))}
        </ul>
        <p className="moldura__nota">
          Projeto acadêmico.
        </p>
      </aside>

      <main className="moldura__forma">
        <div className="moldura__caixa">
          <h1>{titulo}</h1>
          {subtitulo && <p className="subtitulo">{subtitulo}</p>}
          {children}
          {rodape}
        </div>
      </main>
    </div>
  );
}
