import { Link } from 'react-router-dom';
import './rodape.css';

export default function Rodape() {
  return (
    <footer className="rodape">
      <div className="rodape__interno">
        <div className="rodape__marca">
          <span className="marca">Fechô</span>
          <p>O profissional certo, perto de você.</p>
        </div>

        <div className="rodape__colunas">
          <div>
            <h4>Plataforma</h4>
            <Link to="/prestadores">Encontrar profissional</Link>
            <Link to="/criar-conta">Oferecer serviços</Link>
          </div>
        </div>
      </div>

      <div className="rodape__base">
        <p>
          Projeto acadêmico desenvolvido na PUC-Campinas.
        </p>
      </div>
    </footer>
  );
}
