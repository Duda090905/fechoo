import './botao.css';

export default function Botao({ children, tipo = 'principal', carregando, className = '', ...resto }) {
  return (
    <button
      className={`botao botao--${tipo} ${className}`.trim()}
      disabled={carregando || resto.disabled}
      {...resto}
    >
      {carregando ? 'Um instante...' : children}
    </button>
  );
}
