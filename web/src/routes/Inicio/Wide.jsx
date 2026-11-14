import { useEffect, useMemo, useState } from 'react';
import { fmtAgo, fmtTime } from '../../core/format.js';
import { hrefFor } from '../../core/route.js';
import { Icon } from '../../ui/Icon.jsx';
import { Banner } from '../../ui/kit.jsx';
import { createFrameCycle, createFrameLoader, pickWide } from './frames.js';
import { newestEvent } from './view.js';

/** Quadros parados da tela larga: ciclo de 4 s, 3 pedidos por vez, parado com a aba oculta (sem laço de espera), URLs sempre liberadas. */
export function useWideFrames(ids) {
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

/**
 * Câmeras do Início na mesa: o último movimento em destaque (foto parada do evento, com hora e contagem) e, embaixo,
 * miniaturas de até quatro câmeras (quadros parados a cada 4 s, câmeras com aviso primeiro) e o atalho "Todas".
 * Sem movimento registrado, a primeira miniatura vira o destaque. Vídeo só existe depois do toque, em Câmeras.
 */
export function HeroCameras({ cameras, motion, available, thumbs = true }) {
  const latest = useMemo(() => newestEvent(motion.data?.events), [motion.data]);
  const names = useMemo(() => Object.fromEntries(cameras.map((c) => [c.id, c.name])), [cameras]);
  const shown = pickWide(cameras, motion.data?.notify || []);
  const frames = useWideFrames(available && thumbs ? shown.map((c) => c.id) : []);
  const fresh = latest && (motion.data?.unseenBy?.[latest.camera] || 0) > 0;
  const lead = latest ? latest.camera : shown[0]?.id;
  const leadName = lead ? names[lead] || lead : null;
  const photo = latest?.photo ? `/api/motion/${latest.id}.jpg` : frames[lead]?.url;
  return (
    <section className="card hero-cam col" aria-label="Câmeras">
      {motion.stale && <Banner kind="warn" icon="off">Sem conexão com as câmeras. Mostrando o último dado conhecido.</Banner>}
      {!available ? <p className="sub">Câmeras indisponíveis na prévia.</p> : !lead ? <p className="sub">{motion.data ? 'Nenhuma câmera encontrada.' : 'Lendo as câmeras…'}</p> : (
        <a className="fr hero-fr" href={hrefFor('cameras', lead)} aria-label={latest ? `Movimento em ${leadName}, ${fmtTime(latest.start)}` : `Abrir ${leadName}`}>
          {photo && <img src={photo} alt="" />}
          <span className="lb tl-ab">{latest ? 'Último movimento' : 'Quadro parado'}</span>
          {fresh && <span className="lb tr-ab">Novo</span>}
          <span className="hero-cap"><b>{leadName}</b><span>{latest ? `foto, não vídeo · ${fmtTime(latest.start)} · ${latest.count}×` : frames[lead]?.url ? `foto · ${fmtAgo(frames[lead].at)}` : 'carregando…'}</span></span>
        </a>
      )}
      {available && thumbs && shown.length > 0 && (
        <ul className="list-plain cam-thumbs" aria-label="Outras câmeras">
          {shown.map((c) => (
            <li key={c.id}>
              <a className={`fr cam-thumb${c.id === lead ? ' on' : ''}`} href={hrefFor('cameras', c.id)} aria-label={c.name} aria-current={c.id === lead ? 'true' : undefined}>
                {frames[c.id]?.url && <img src={frames[c.id].url} alt="" />}
                <span className="cam-thumb-t">{c.name}</span>
              </a>
            </li>
          ))}
          <li><a className="cam-thumb all" href={hrefFor('cameras')}><Icon name="cam" size={20} /><span>Todas</span></a></li>
        </ul>
      )}
    </section>
  );
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
