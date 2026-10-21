import { useEffect, useRef, useState } from 'react';
import Botao from './Botao';
import { IconeCadeado, IconeRelogio } from './Icones';
import { formatarDinheiro, formatarHora } from '../utils/formatos';
import './pagamento.css';

function contagem(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = String(total % 60).padStart(2, '0');
  return `${min}:${seg}`;
}

/**
 * US17 - tela do Pix: QR code, código copia e cola e prazo para pagar.
 * O aceite só vira "Aceito" quando o banco confirma (US18); a tela de
 * detalhe consulta a API sozinha enquanto isso.
 */
export default function PagamentoPix({ pagamento, outraParte, aoVencer }) {
  const [agora, setAgora] = useState(Date.now());
  const [copiado, setCopiado] = useState(false);
  const campo = useRef(null);
  const vencido = useRef(false);

  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, []);

  const restante = new Date(pagamento.expira_em).getTime() - agora;
  useEffect(() => {
    if (restante <= 0 && !vencido.current) {
      vencido.current = true;
      aoVencer?.();
    }
  }, [restante, aoVencer]);

  const { pix } = pagamento;
  if (!pix) return null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pix.copia_cola);
    } catch {
      campo.current?.select();
      document.execCommand?.('copy');
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div className="pix">
      <div className="pix__cabeca">
        <span className="pix__icone"><IconeCadeado width="20" height="20" /></span>
        <div>
          <strong>Pague com Pix para fechar</strong>
          <span>O dinheiro fica congelado no Fechô até você confirmar que o serviço foi feito.</span>
        </div>
      </div>

      <div className="pix__corpo">
        {pix.qr_code ? (
          <img className="pix__qr" src={`data:image/png;base64,${pix.qr_code}`} alt="QR code do Pix" />
        ) : (
          <div className="pix__qr pix__qr--teste" role="img" aria-label="Modo de teste, sem QR code">
            <span>Modo de teste</span>
            <small>sem QR code: use o código abaixo</small>
          </div>
        )}
        <div className="pix__dados">
          <span className="pix__rotulo">Valor</span>
          <strong className="pix__valor">{formatarDinheiro(pagamento.valor)}</strong>
          <span className="pix__prazo">
            <IconeRelogio width="16" height="16" aria-hidden="true" />
            {restante > 0
              ? <>Pague em até <b>{contagem(restante)}</b> (até {formatarHora(pagamento.expira_em)})</>
              : 'Este Pix venceu.'}
          </span>
        </div>
      </div>

      <label className="pix__codigo">
        <span>Pix copia e cola</span>
        <textarea ref={campo} readOnly rows={3} value={pix.copia_cola} onFocus={(e) => e.target.select()} />
      </label>
      <Botao type="button" onClick={copiar}>{copiado ? 'Código copiado' : 'Copiar código Pix'}</Botao>

      <div className="espera pix__espera">
        <span className="espera__pontos" aria-hidden="true"><i /><i /><i /></span>
        <p>
          Esperando o banco confirmar o pagamento. Esta tela atualiza sozinha.
          {outraParte ? ` Assim que confirmar, ${outraParte} recebe o endereço.` : ''}
        </p>
      </div>
    </div>
  );
}
