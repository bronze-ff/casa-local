import { useEffect, useState } from 'react';
import { fmtAgo, fmtTime } from '../../core/format.js';
import { hrefFor } from '../../core/route.js';
import { Banner } from '../../ui/kit.jsx';
import { createFrameCycle, createFrameLoader, pickWide } from './frames.js';

/** Quadros parados da tela larga: ciclo de 4 s, 3 pedidos por vez, parado com a aba oculta (sem laço de espera), URLs sempre liberadas. */
function useWideFrames(ids) {
  const [frames, setFrames] = useState({});
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return undefined;
    const visible = () => !document.hidden;
    const loader = createFrameLoader({
      fetchFn: (path, options) => fetch(path, options), createURL: (blob) => URL.createObjectURL(blob), revokeURL: (url) => URL.revokeObjectURL(url), active: () => !ended && visible(),
      onFrame: (id, frame) => setFrames((f) => ({ ...f, [id]: frame })), onFail: (id) => setFrames((f) => ({ ...f, [id]: { ...f[id], failed: true } })),
    });
    let ended = false;
    const cycle = createFrameCycle({
      ids: key.split(','), load: loader.load, isVisible: visible,
      subscribe: (fn) => { document.addEventListener('visibilitychange', fn); return () => document.removeEventListener('visibilitychange', fn); },
      setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id),
    });
    return () => { ended = true; cycle.stop(); loader.release(); };
  }, [key]);
  return frames;
}

export function WideCameras({ cameras, motion, available }) {
  const shown = pickWide(cameras, motion.data?.notify || []);
  const frames = useWideFrames(available ? shown.map((c) => c.id) : []);
  const events = (motion.data?.events || []).slice().sort((a, b) => b.start - a.start).slice(0, 6);
  const names = Object.fromEntries(cameras.map((c) => [c.id, c.name]));
  return (
    <section className="col" aria-label="Câmeras">
      <div className="row sp"><h2 className="h2">Câmeras · um quadro a cada 4 s</h2><span className="sub">sem vídeo ao vivo</span></div>
      {motion.stale && <Banner kind="warn" icon="off">Sem conexão com as câmeras. Mostrando o último dado conhecido.</Banner>}
      {!available ? <p className="sub">Câmeras indisponíveis na prévia.</p> : (
        <div className="grid two">
          {shown.map((c) => (
            <a key={c.id} className="fr" style={{ aspectRatio: '16 / 10' }} href={hrefFor('cameras', c.id)} aria-label={c.name}>
              {frames[c.id]?.url && <img src={frames[c.id].url} alt="" />}
              <span className="lb tl-ab">{c.name}</span>
              <span className="lb br-ab">{frames[c.id]?.url ? fmtAgo(frames[c.id].at) : frames[c.id]?.failed ? 'sem imagem' : 'carregando…'}</span>
            </a>
          ))}
        </div>
      )}
      {available && (
        <ul className="list-plain rows">
          {events.length === 0 && <li className="sub">{motion.data ? 'Nenhum movimento registrado.' : 'Lendo as câmeras…'}</li>}
          {events.map((e) => (
            <li key={e.id}><span className="grow col tight"><b>{names[e.camera] || e.camera}</b><span className="sub">{fmtTime(e.start)} · {e.count}×</span></span>{(motion.data?.unseenBy?.[e.camera] || 0) > 0 ? <span className="st sent">Novo</span> : <span className="sub">visto</span>}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
