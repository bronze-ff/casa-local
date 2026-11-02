import { useEffect, useState } from 'react';
import { get } from '../core/api.js';
import { fmtTime } from '../core/format.js';
import { Icon } from '../ui/Icon.jsx';

/** Janela de alerta de movimento da bandeja: foto, câmera, hora e duas ações. Sem poll e sem animação. param = "cam:idDaFoto:inicio". */
export default function Alert({ param = '' }) {
  const [cam, id, start] = param.split(':');
  const [name, setName] = useState(cam);
  const [photo, setPhoto] = useState(!!id);
  useEffect(() => {
    let alive = true;
    get('/api/cameras').then((data) => { const found = data?.cameras?.find((item) => item.id === cam); if (alive && found) setName(found.name); }).catch(() => {});
    return () => { alive = false; };
  }, [cam]);
  const bridge = () => window.pywebview?.api;
  return (
    <section className="alert" aria-labelledby="alert-title">
      <div className="alert-photo">
        {photo ? <img src={`/api/motion/${id}.jpg`} alt={`Foto do movimento em ${name}`} onError={() => setPhoto(false)} /> : <div className="alert-nophoto"><Icon name="cam" size={28} /><span>Sem foto</span></div>}
      </div>
      <div className="alert-body">
        <div>
          <span className="cap">Movimento</span>
          <h1 id="alert-title" className="h2">{name}</h1>
          <span className="mono mut">{fmtTime(Number(start))}</span>
        </div>
        <div className="row">
          <button type="button" className="btn p grow" onClick={() => bridge()?.open('cameras:' + cam)}>Abrir</button>
          <button type="button" className="btn s grow" onClick={() => bridge()?.dismiss()}>Dispensar</button>
        </div>
      </div>
    </section>
  );
}
