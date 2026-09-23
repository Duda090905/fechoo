import { Link } from 'react-router-dom';
import './rodape.css';

export default function Rodape() {
  return (
    <footer className="rodape">
      <div className="rodape__interno">
        <div className="rodape__marca">
          <span className="marca">Fechô</span>
          <p>Serviço contratado, dinheiro garantido.</p>
        </div>

        <div className="rodape__colunas">
          <div>
            <h4>Plataforma</h4>
            <Link to="/prestadores">Encontrar profissional</Link>
            <Link to="/criar-conta">Oferecer serviços</Link>
            <a href="/#como-funciona">Como funciona</a>
          </div>
          <div>
            <h4>Confiança</h4>
            <a href="/#seguranca">Pagamento retido</a>
            <a href="/#perguntas">Perguntas frequentes</a>
          </div>
        </div>
      </div>

      <div className="rodape__base">
        <p>
          Projeto acadêmico desenvolvido na PUC-Campinas. Os pagamentos rodam em ambiente
          de homologação e não há movimentação financeira real.
        </p>
      </div>
    </footer>
  );
}
