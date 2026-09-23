import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexto/AuthContexto';

export default function RotaPrivada({ children, perfil, permiteInativa = false }) {
  const { usuario, carregando } = useAuth();

  if (carregando) return <div className="pagina"><p className="subtitulo">Carregando...</p></div>;
  if (!usuario) return <Navigate to="/entrar" replace />;
  // Conta desativada so tem acesso a propria conta, para poder reativar.
  if (usuario.status === 'inativo' && !permiteInativa) return <Navigate to="/minha-conta" replace />;
  if (perfil && usuario.tipo_perfil !== perfil) return <Navigate to="/" replace />;

  return children;
}
