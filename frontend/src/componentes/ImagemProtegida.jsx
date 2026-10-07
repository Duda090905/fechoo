import { useEffect, useState } from 'react';
import { baixarArquivoProtegido } from '../servicos/api';

// US10 / US12 - foto do pedido ou imagem do chat. O arquivo só sai da API com
// login, então é baixado e exibido a partir de um endereço local.
export default function ImagemProtegida({ servicoId, nome, alt, className, aoAbrir }) {
  const [url, setUrl] = useState('');
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    let criada = '';
    baixarArquivoProtegido(`/servicos/${servicoId}/arquivos/${nome}`)
      .then((u) => { criada = u; if (ativo) setUrl(u); else URL.revokeObjectURL(u); })
      .catch(() => { if (ativo) setFalhou(true); });
    return () => { ativo = false; if (criada) URL.revokeObjectURL(criada); };
  }, [servicoId, nome]);

  if (falhou) return <span className={`imagem-protegida imagem-protegida--vazia ${className || ''}`}>Imagem indisponível</span>;
  if (!url) return <span className={`imagem-protegida imagem-protegida--carregando ${className || ''}`} aria-hidden="true" />;

  const imagem = <img src={url} alt={alt} className={`imagem-protegida ${className || ''}`} />;
  return aoAbrir
    ? <button type="button" className="imagem-protegida__botao" onClick={() => aoAbrir(url, alt)}>{imagem}</button>
    : imagem;
}
