import './selecao.css';

// Lista de opcoes em formato de etiqueta clicavel (categorias e bairros).
export default function Selecao({ opcoes, selecionados, aoAlternar, limite }) {
  return (
    <div className="selecao">
      {opcoes.map((opcao) => {
        const marcado = selecionados.includes(opcao.id);
        const bloqueado = !marcado && limite && selecionados.length >= limite;
        return (
          <button
            key={opcao.id}
            type="button"
            className={`selecao__item ${marcado ? 'selecao__item--ativo' : ''}`}
            onClick={() => aoAlternar(opcao.id)}
            disabled={bloqueado}
            aria-pressed={marcado}
          >
            {opcao.nome}
          </button>
        );
      })}
    </div>
  );
}
