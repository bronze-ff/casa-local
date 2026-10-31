import { useEffect, useState } from 'react';
import { fmtTime, get } from './api.js';
import { Dot, Key } from './ui.jsx';

/** Alerta de movimento da bandeja (390x176): foto, câmera, hora e duas teclas. Sem polling, sem animação. */
export default function AlertCard({ param }) {
  const [cam, id, start] = param.split(':');
  const [name, setName] = useState(cam);
  const [photo, setPhoto] = useState(!!id);
  useEffect(() => {
    let alive = true;
    get('/api/cameras').then((data) => { const found = data?.cameras?.find((item) => item.id === cam); if (alive && found) setName(found.name); }).catch(() => {});
    return () => { alive = false; };
  }, [cam]);
  const api = () => window.pywebview?.api;
  return (
    <div className="alert-card">
      <div className="thumb" style={{ borderRadius: 0 }}>
        {photo && <img src={`/api/motion/${id}.jpg`} alt="" onError={() => setPhoto(false)} />}
      </div>
      <div className="body">
        <div>
          <span className="lbl" style={{ color: 'var(--sinal-tx)' }}>movimento</span>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{name}</div>
          <Dot size={20}>{fmtTime(Number(start))}</Dot>
        </div>
        <div className="two">
          <Key signal center style={{ minHeight: 44 }} onClick={() => api()?.open('cameras:' + cam)}>Abrir</Key>
          <Key center style={{ minHeight: 44 }} onClick={() => api()?.dismiss()}>Dispensar</Key>
        </div>
      </div>
    </div>
  );
}
