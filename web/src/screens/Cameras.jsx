import { useCallback, useEffect, useRef, useState } from 'react';
import { usePoll, fmtAgo } from '../api.js';
import { useHome, href } from '../App.jsx';
import { Card, Icon, Key, Segmented, Stale } from '../ui.jsx';
import Live, { FrameView } from './Cameras/Live.jsx';
import Motion from './Cameras/Motion.jsx';
import Replay from './Cameras/Replay.jsx';
import { replayWindow } from './Cameras/replayWindow.js';

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

function Tile({ camera, frame, moving, bell, onOpen }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`Abrir ${camera.name} ao vivo`} className="frame">
      {frame?.url && <img src={frame.url} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />}
      {!frame?.url && <span className="age" style={{ top: 10, bottom: 'auto' }}>{frame?.failed ? 'sem imagem' : 'carregando…'}</span>}
      {bell && <span className="ic" style={{ position: 'absolute', top: 6, right: 6, color: '#f1ead7', filter: 'drop-shadow(0 1px 2px #000)' }}><Icon name="bell" size={16} label="Avisa movimento" /></span>}
      {moving && <span className="badge">Movimento</span>}
      <span className="age">{camera.name}{frame?.at ? ` · ${fmtAgo(frame.at)}` : ''}</span>
    </button>
  );
}

export default function Cameras({ param }) {
  const { mode, tray } = useHome();
  const preview = mode === 'preview';
  const cams = usePoll(preview ? null : '/api/cameras', 30000);
  const motion = usePoll('/api/motion', 15000);
  const [filter, setFilter] = useState('todas');
  const [liveId, setLiveId] = useState(null);
  const [replay, setReplay] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [snap, setSnap] = useState(null);
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
      if (tray) return; // a bandeja não toca gravação
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
  }, [param, cams.data, motion.data, motion.error, all, offset, tray]);

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
    if (!camera) return;
    if (tray) { if (event.photo) setSnap({ camera, src: `/api/motion/${event.id}.jpg` }); } // bandeja: sem WebSocket, só a foto do evento
    else setReplay(replayWindow(camera, event, offset));
  };
  const newest = Math.max(0, ...shown.map((c) => frames[c.id]?.at ?? 0));

  return (
    <>
      <Card
        title={`Câmeras · ${all.length || ''}`.replace(/ · $/, '')}
        aside={!preview && available && filter !== 'movimento' ? (
          <Key center aria-label="Atualizar imagens agora" onClick={() => setTick((n) => n + 1)} style={{ minHeight: 44, width: 44, padding: 0 }}><Icon name="refresh" /></Key>
        ) : null}
      >
        <Segmented label="Filtrar câmeras" value={filter} options={FILTERS.map(([v, t]) => [v, v === 'movimento' && motion.data?.unseen ? `${t} (${motion.data.unseen})` : t])} onChange={setFilter} />

        {preview ? (
          <div className="aviso" role="status">
            <Icon name="alert" size={20} />
            <span>As câmeras só funcionam no modo local, no PC de casa. Aqui você vê só os avisos de movimento.</span>
          </div>
        ) : (
          <>
            <Stale poll={cams} what="câmeras" />
            {cams.data && !available && (
              <div className="aviso err" role="alert">
                <Icon name="alert" size={20} />
                <span>Câmeras indisponíveis: o serviço de câmeras (go2rtc) não está rodando no PC de casa.</span>
                <button type="button" className="act" onClick={cams.reload}>Verificar</button>
              </div>
            )}
            {!cams.data && !cams.error && <p className="muted" role="status">Abrindo câmeras…</p>}
          </>
        )}

        {filter === 'movimento' || preview ? (
          <Motion cameras={all} motion={motion} onOpen={openEvent} openAlerts={alertsOpen} />
        ) : cams.data && available ? (
          <>
            <div className="mosaic">
              {shown.map((c) => <Tile key={c.id} camera={c} frame={frames[c.id]} moving={movingNow.has(c.id)} bell={(motion.data?.notify ?? []).includes(c.id)} onOpen={() => setLiveId(c.id)} />)}
            </div>
            <p className="small muted" role="status">{shown.length} de {all.length} · {newest ? `Automático · ${fmtAgo(newest)}` : 'Atualização automática'}</p>
          </>
        ) : null}
      </Card>

      {index >= 0 && tray && <FrameView title={shown[index].name} sub={`Canal ${shown[index].id.replace('cam', '')}`} src={frames[liveId]?.url} close={closeLive} />}
      {snap && <FrameView title={snap.camera.name} sub="Foto do movimento" src={snap.src} close={() => setSnap(null)} />}
      {index >= 0 && !tray && <Live cameras={shown} index={index} poster={frames[liveId]?.url} move={move} close={closeLive} rewind={rewind} />}
      {replay && !tray && (
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
