import './aviso.css';

export default function Aviso({ tipo = 'erro', children }) {
  if (!children) return null;
  return <div className={`aviso aviso--${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>{children}</div>;
}
