import { useEffect, useState } from 'react';
import { urlDaFoto } from '../servicos/api';
import './avatar.css';

// Foto do prestador, ou a inicial do nome quando nao ha foto ou ela nao carrega.
export default function Avatar({ nome, foto }) {
  const [falhou, setFalhou] = useState(false);

  useEffect(() => { setFalhou(false); }, [foto]);

  const inicial = (nome || '?').trim().charAt(0).toUpperCase();

  return (
    <span className="ficha__avatar">
      {foto && !falhou
        ? <img className="avatar__foto" src={urlDaFoto(foto)} alt="" loading="lazy" onError={() => setFalhou(true)} />
        : inicial}
    </span>
  );
}
