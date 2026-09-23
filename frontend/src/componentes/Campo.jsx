import './campo.css';

export default function Campo({ etiqueta, ajuda, erro, children, ...resto }) {
  return (
    <label className="campo">
      <span className="campo__etiqueta">{etiqueta}</span>
      {children || <input className={`campo__entrada ${erro ? 'campo__entrada--erro' : ''}`} {...resto} />}
      {ajuda && !erro && <span className="campo__ajuda">{ajuda}</span>}
      {erro && <span className="campo__erro">{erro}</span>}
    </label>
  );
}
