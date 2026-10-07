import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ProvedorAuth } from './contexto/AuthContexto';
import Cabecalho from './componentes/Cabecalho';
import Rodape from './componentes/Rodape';
import RotaPrivada from './componentes/RotaPrivada';
import Inicio from './paginas/Inicio';
import Entrar from './paginas/Entrar';
import CriarConta from './paginas/CriarConta';
import EsqueciSenha from './paginas/EsqueciSenha';
import RedefinirSenha from './paginas/RedefinirSenha';
import MinhaConta from './paginas/MinhaConta';
import MeuPerfil from './paginas/MeuPerfil';
import Prestadores from './paginas/Prestadores';
import Servicos from './paginas/Servicos';
import ServicoDetalhe from './paginas/ServicoDetalhe';

// Nas telas de conta a lateral escura ja cumpre o papel do rodape.
const SEM_RODAPE = ['/entrar', '/criar-conta', '/esqueci-senha', '/redefinir-senha'];

function Miolo() {
  const { pathname } = useLocation();

  return (
    <div className="app">
      <Cabecalho />
      <div className="conteudo">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/criar-conta" element={<CriarConta />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="/prestadores" element={<Prestadores />} />
          <Route path="/minha-conta" element={<RotaPrivada permiteInativa><MinhaConta /></RotaPrivada>} />
          <Route path="/meu-perfil" element={<RotaPrivada perfil="prestador"><MeuPerfil /></RotaPrivada>} />
          <Route path="/servicos" element={<RotaPrivada><Servicos /></RotaPrivada>} />
          <Route path="/servicos/:id" element={<RotaPrivada><ServicoDetalhe /></RotaPrivada>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!SEM_RODAPE.includes(pathname) && <Rodape />}
    </div>
  );
}

export default function App() {
  return (
    <ProvedorAuth>
      <BrowserRouter>
        <Miolo />
      </BrowserRouter>
    </ProvedorAuth>
  );
}
