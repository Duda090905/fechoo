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
import Historico from './paginas/Historico';
import Extrato from './paginas/Extrato';
import Admin from './paginas/Admin';
import AdminDisputa from './paginas/AdminDisputa';

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
          {/* US16 */}
          <Route path="/historico" element={<RotaPrivada perfil="contratante"><Historico /></RotaPrivada>} />
          {/* US22 */}
          <Route path="/extrato" element={<RotaPrivada perfil="prestador"><Extrato /></RotaPrivada>} />
          {/* US25 */}
          <Route path="/admin" element={<RotaPrivada perfil="administrador"><Admin /></RotaPrivada>} />
          <Route path="/admin/disputas/:id" element={<RotaPrivada perfil="administrador"><AdminDisputa /></RotaPrivada>} />
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
