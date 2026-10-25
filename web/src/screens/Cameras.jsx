import { useCallback, useEffect, useRef, useState } from 'react';
import { usePoll, fmtAgo } from '../api.js';
import { useHome, href } from '../App.jsx';
import { Card, Icon, Segmented, Stale } from '../ui.jsx';
import Live from './Cameras/Live.jsx';
import Motion from './Cameras/Motion.jsx';
import Replay, { replayWindow } from './Cameras/Replay.jsx';

const FRAME_EVERY = 4000; // o backend atualiza o cache a cada ~4 s com alguém olhando: não adianta pedir mais
const FRAME_PARALLEL = 3; // igual ao limite do backend (cameras.py: BoundedSemaphore(3)); acima disso responde 429
const FILTERS = [['todas', 'Todas'], ['externa', 'Externas'], ['interna', 'Internas'], ['movimento', 'Movimento']];

// Câmeras com sino primeiro.
const byBell = (list, bells = []) => [...list].sort((a, b) => Number(bells.includes(b.id)) - Number(bells.includes(a.id)));

/** Quadros da grade: baixa frame.jpg de cada câmera em ciclos, pausa com a aba oculta ou `paused`. */
function useFrames(ids, paused, tick) {
  const [frames, setFrames] = useState({});
  const urls = useRef({});
  const key = ids.join(',');

  useEffect(() => {
    if (!key || paused) return;
    let stop = false;
    let timer;
    const list = key.split(',');
    const load = async (id) => {
      try {
        const response = await fetch(`/api/cameras/${id}/frame.jpg`, { cache: 'no-store' });
        if (!response.ok) throw new Error();
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
      const queue = [...list];
      await Promise.all(Array.from({ length: FRAME_PARALLEL }, async () => {
        while (queue.length && !stop) await load(queue.shift());
      }));
      if (!stop) timer = setTimeout(cycle, FRAME_EVERY);
    };
    cycle();
    return () => { stop = true; clearTimeout(timer); };
  }, [key, paused, tick]);

  useEffect(() => () => Object.values(urls.current).forEach((u) => URL.revokeObjectURL(u)), []);
  return frames;
}

function Tile({ camera, frame, moving, onOpen }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`Abrir ${camera.name} ao vivo`}
      style={{ position: 'relative', padding: 0, border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', aspectRatio: '16 / 9', background: 'var(--raised)', color: 'inherit', minHeight: 44, display: 'block', width: '100%' }}>
      {frame?.url ? (
        <img src={frame.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <span className="placeholder" style={{ position: 'absolute', inset: 0 }}>{frame?.failed ? 'sem imagem' : 'carregando…'}</span>
      )}
      <span className="chip mono" style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,.6)' }}>{camera.id.replace('cam', '')}</span>
      {moving && <span className="chip hot" style={{ position: 'absolute', top: 6, right: 6 }}>Movimento</span>}
      <span className="small" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 8px 6px', textAlign: 'left', background: 'rgba(0,0,0,.6)', color: '#fff' }}>{camera.name}</span>
    </button>
  );
}

export default function Cameras({ param }) {
  const { mode } = useHome();
  const preview = mode === 'preview';
  const cams = usePoll(preview ? null : '/api/cameras', 30000);
  const motion = usePoll('/api/motion', 15000);
  const [filter, setFilter] = useState('todas');
  const [liveId, setLiveId] = useState(null);
  const [replay, setReplay] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [, setNow] = useState(0);
  const handled = useRef('');

  const all = cams.data?.cameras ?? [];
  const available = cams.data?.available === true;
  const offset = motion.data?.dvrOffset ?? 0;
  const shown = byBell(all.filter((c) => filter === 'todas' || filter === 'movimento' || c.group === filter), motion.data?.notify);
  const index = liveId === null ? -1 : shown.findIndex((c) => c.id === liveId);
  // A grade só baixa imagens quando está visível e utilizável.
  const frames = useFrames(shown.map((c) => c.id), preview || !available || filter === 'movimento' || liveId !== null || !!replay, tick);
  const movingNow = new Set((motion.data?.events ?? []).filter((e) => e.end === null).map((e) => e.camera));

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);

  // Links de fora do app: '#/cameras/cam2' (ao vivo), '#/cameras/replay:cam2:<início>' e '#/cameras/avisos'.
  // Também aceita o formato antigo com ':' ou '/' como separador e o prefixo 'cameras'.
  useEffect(() => {
    if (handled.current === param || !cams.data || !(motion.data || motion.error)) return;
    handled.current = param;
    const parts = param.split(/[:/]/).filter(Boolean);
    if (parts[0] === 'cameras') parts.shift();
    const [first, id, start] = parts;
    if (first === 'replay') {
      const camera = all.find((c) => c.id === id);
      if (camera && Number(start)) {
        setLiveId(null);
        setReplay(replayWindow(camera, { start: Number(start), end: null }, offset));
      }
    } else if (first === 'avisos') {
      setLiveId(null); setFilter('movimento'); setAlertsOpen(true);
    } else if (all.some((c) => c.id === first)) {
      setFilter('todas'); setLiveId(first);
    }
  }, [param, cams.data, motion.data, motion.error, all, offset]);

  const leave = () => { if (param) window.location.hash = href('cameras'); };
  const closeLive = () => { setLiveId(null); leave(); };
  const closeReplay = () => { setReplay(null); leave(); };
  const move = useCallback((step) => setLiveId((id) => {
    const at = shown.findIndex((c) => c.id === id);
    return at < 0 ? id : shown[(at + step + shown.length) % shown.length].id;
  }), [shown.map((c) => c.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const rewind = (camera) => {
    const now = Date.now() / 1000 + offset;
    setLiveId(null);
    setReplay({ camera, start: now - 60, from: now - 300, to: now - 5, offset });
  };
  const openEvent = (event) => {
    const camera = all.find((c) => c.id === event.camera);
    if (camera) setReplay(replayWindow(camera, event, offset));
  };
  const newest = Math.max(0, ...shown.map((c) => frames[c.id]?.at ?? 0));

  return (
    <>
      <Card
        title="Câmeras"
        aside={!preview && available && filter !== 'movimento' ? (
          <button type="button" className="btn ghost" aria-label="Atualizar imagens agora" onClick={() => setTick((n) => n + 1)} style={{ minWidth: 44, padding: 0 }}><Icon name="refresh" /></button>
        ) : null}
      >
        <Segmented label="Filtrar câmeras" value={filter} options={FILTERS.map(([v, t]) => [v, v === 'movimento' && motion.data?.unseen ? `${t} (${motion.data.unseen})` : t])} onChange={setFilter} />

        {preview ? (
          <div className="notice info" role="status">
            <Icon name="warn" size={18} style={{ flex: 'none', marginTop: 2 }} />
            <span>As câmeras só funcionam no modo local, no PC de casa. Aqui você vê só os avisos de movimento.</span>
          </div>
        ) : (
          <>
            <Stale poll={cams} what="câmeras" />
            {cams.data && !available && (
              <div className="notice" role="alert">
                <Icon name="warn" size={18} style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
                <span style={{ flex: 1 }}>Câmeras indisponíveis: o serviço de câmeras (go2rtc) não está rodando no PC de casa.</span>
                <button type="button" className="btn ghost" style={{ minHeight: 32 }} onClick={cams.reload}>Verificar</button>
              </div>
            )}
            {!cams.data && !cams.error && <p className="muted" role="status">Abrindo câmeras…</p>}
          </>
        )}

        {filter === 'movimento' || preview ? (
          <Motion cameras={all} motion={motion} onOpen={openEvent} openAlerts={alertsOpen} />
        ) : cams.data && available ? (
          <>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))' }}>
              {shown.map((c) => <Tile key={c.id} camera={c} frame={frames[c.id]} moving={movingNow.has(c.id)} onOpen={() => setLiveId(c.id)} />)}
            </div>
            <p className="small muted">{shown.length} de {all.length} · {newest ? `Automático · ${fmtAgo(newest)}` : 'Atualização automática'}</p>
          </>
        ) : null}
      </Card>

      {index >= 0 && <Live cameras={shown} index={index} poster={frames[liveId]?.url} move={move} close={closeLive} rewind={rewind} />}
      {replay && (
        <Replay
          key={`${replay.camera.id}-${replay.start}`}
          {...replay}
          close={closeReplay}
          goLive={() => { const id = replay.camera.id; setReplay(null); setFilter('todas'); setLiveId(id); }}
        />
      )}
    </>
  );
}
