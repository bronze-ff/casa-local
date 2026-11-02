import { useEffect, useRef, useState } from 'react';
import { fmtAgo, fmtTime } from '../../core/format.js';
import { hrefFor } from '../../core/route.js';
import { Banner } from '../../ui/kit.jsx';
import { WIDE_EVERY, pickWide, runCycle } from './frames.js';

/** Quadros parados da tela larga: ciclo de 4 s, 3 pedidos por vez, pausa com a aba oculta, URLs de imagem sempre liberadas. */
function useWideFrames(ids) {
  const [frames, setFrames] = useState({});
  const urls = useRef({});
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return undefined;
    let stop = false;
    let timer;
    const load = async (id) => {
      try {
        const response = await fetch(`/api/cameras/${id}/frame.jpg`, { cache: 'no-store' });
        if (!response.ok) throw new Error('sem imagem');
        const age = Number(response.headers.get('X-Frame-Age') ?? 0);
        const url = URL.createObjectURL(await response.blob());
        if (stop) { URL.revokeObjectURL(url); return; }
        const old = urls.current[id];
        urls.current[id] = url;
        setFrames((f) => ({ ...f, [id]: { url, at: Date.now() - (Number.isFinite(age) ? age * 1000 : 0) } }));
        if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
      } catch {
        if (!stop) setFrames((f) => ({ ...f, [id]: { ...f[id], failed: true } }));
      }
    };
    const cycle = async () => {
      if (document.hidden) { timer = setTimeout(cycle, 1500); return; }
      await runCycle({ ids: key.split(','), load, stopped: () => stop });
      if (!stop) timer = setTimeout(cycle, WIDE_EVERY);
    };
    cycle();
    return () => { stop = true; clearTimeout(timer); };
  }, [key]);
  useEffect(() => () => Object.values(urls.current).forEach((u) => URL.revokeObjectURL(u)), []);
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
