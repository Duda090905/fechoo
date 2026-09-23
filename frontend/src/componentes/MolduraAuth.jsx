import { Link } from 'react-router-dom';
import { IconeCadeado, IconeEscudo, IconeCarteira } from './Icones';
import './moldura-auth.css';

const ARGUMENTOS = [
  { icone: <IconeCadeado />, texto: 'O pagamento fica retido até o serviço terminar.' },
  { icone: <IconeEscudo />, texto: 'Seu endereço só aparece depois que você aceita o orçamento.' },
  { icone: <IconeCarteira />, texto: 'Quem trabalha sai de casa com o dinheiro garantido.' }
];

// Nas telas de conta, a lateral escura repete por que vale a pena
// criar a conta. Some no celular, onde espaço é o que falta.
export default function MolduraAuth({ titulo, subtitulo, children, rodape }) {
  return (
    <div className="moldura">
      <aside className="moldura__lado">
        <Link to="/" className="marca">Fechô</Link>
        <h2>Serviço contratado, dinheiro garantido.</h2>
        <ul>
          {ARGUMENTOS.map((item) => (
            <li key={item.texto}><span>{item.icone}</span>{item.texto}</li>
          ))}
        </ul>
        <p className="moldura__nota">
          Projeto acadêmico. Os pagamentos rodam em ambiente de teste.
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
