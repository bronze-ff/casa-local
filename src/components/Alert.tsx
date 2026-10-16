import { useEffect, useState } from 'react';
import { Camera as CameraIcon, History, Radio, X } from 'lucide-react';

type Pywebview = {api?: {dismiss?: () => void; open?: (target: string) => void}};
type Target = {camera: string; id: string; start: number};

/** Alerta de movimento da bandeja (janela própria acima do relógio): #alerta:camN:<evento>:<início>. */
function parse(): Target | null {
  const [kind, camera, id, start] = window.location.hash.slice(1).split(':');
  return kind === 'alerta' && /^cam\d{1,2}$/.test(camera ?? '') && Number(start) ? {camera, id, start: Number(start)} : null;
}

export default function Alert() {
  const [target, setTarget] = useState<Target | null>(parse);
  const [names, setNames] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState(false);
  useEffect(() => {
    const onHash = () => { setTarget(parse()); setPhoto(false); };
    window.addEventListener('hashchange', onHash);
    void fetch('/api/cameras', {cache: 'no-store'}).then(r => r.json()).then(value => setNames(Object.fromEntries((value.cameras ?? []).map((c: {id: string; name: string}) => [c.id, c.name])))).catch(() => {});
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // A foto do evento chega alguns segundos depois do aviso: confere algumas vezes.
  useEffect(() => {
    if (!target?.id) return;
    let tries = 0;
    const check = async () => {
      try {
        const value = await (await fetch(`/api/motion/${target.camera}`, {cache: 'no-store'})).json();
        if ((value.events ?? []).some((e: {id: string; photo: boolean}) => e.id === target.id && e.photo)) { setPhoto(true); return; }
      } catch { /* tenta de novo */ }
      if (++tries < 6) timer = setTimeout(check, 2000);
    };
    let timer = setTimeout(check, 300);
    return () => clearTimeout(timer);
  }, [target?.id, target?.camera]);
  const api = (window as unknown as {pywebview?: Pywebview}).pywebview?.api;
  if (!target) return <div className="alert-window" />;
  const name = names[target.camera] ?? `Câmera ${target.camera.replace('cam', '')}`;
  const time = new Date(target.start * 1000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  return <div className="alert-window" role="alertdialog" aria-label={`Movimento em ${name}`}>
    <button className="alert-photo" onClick={() => api?.open?.(`cameras:replay:${target.camera}:${Math.floor(target.start)}`)} aria-label="Ver gravação">
      {photo ? <img src={`/api/motion/${target.id}.jpg`} alt="" /> : <span><CameraIcon size={22} /></span>}
    </button>
    <div className="alert-body">
      <span className="alert-tag"><i />Movimento</span>
      <strong>{name}</strong>
      <small>às {time}</small>
      <div className="alert-actions">
        <button className="pill accent" onClick={() => api?.open?.(`cameras:replay:${target.camera}:${Math.floor(target.start)}`)}><History size={15} />Ver gravação</button>
        <button className="pill" onClick={() => api?.open?.(`cameras:${target.camera}`)}><Radio size={15} />Ao vivo</button>
      </div>
    </div>
    <button className="round ghost alert-close" aria-label="Dispensar" onClick={() => api?.dismiss?.()}><X size={16} /></button>
  </div>;
}
