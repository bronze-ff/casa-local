import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Camera as CameraIcon, CameraOff, Cctv, ChevronLeft, ChevronRight, History, LoaderCircle, Pause, Play, Radio, RefreshCw, RotateCcw, RotateCw, ShieldCheck, X } from 'lucide-react';
import type { useCasa } from '../useCasa';

type Camera = {id: string; name: string; group: 'externa' | 'interna'};
type Frame = {url?: string; at?: number; failed?: boolean};
type Filter = 'todas' | 'externa' | 'interna' | 'movimento';
type MotionEvent = {id: string; camera: string; start: number; end: number | null; count: number; photo: boolean};
type Motion = {connected: boolean; error: string | null; events: MotionEvent[]; notify: string[]; unseen: number};
type Casa = ReturnType<typeof useCasa>;

const REFRESH_MS = 4000;
const PARALLEL = 5;
// Same codec list go2rtc's own player offers; the server answers with the camera's real codec.
const CODECS = ['avc1.640029', 'avc1.64002A', 'avc1.640033', 'hvc1.1.6.L153.B0', 'mp4a.40.2', 'mp4a.40.5', 'flac', 'opus'];
type MediaSourceCtor = typeof MediaSource;
const MSE: MediaSourceCtor | undefined = (window as unknown as {ManagedMediaSource?: MediaSourceCtor}).ManagedMediaSource ?? window.MediaSource;

function ago(at: number | undefined, now: number) {
  if (!at) return '';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  return seconds < 5 ? 'agora' : seconds < 60 ? `há ${seconds}s` : `há ${Math.round(seconds / 60)} min`;
}

/** H264 direto do DVR via go2rtc (MSE por WebSocket): primeiro quadro em ~1 s, sem conversão no PC. */
type PlayOptions = {replay?: boolean; held?: () => boolean; onEnd?: () => void};
/** No ao vivo segue a ponta do stream; no replay (`replay`) toca no ritmo da gravação, respeita a
 * pausa do usuário (`held`) e avisa quando o trecho acaba (`onEnd`). */
function playMse(video: HTMLVideoElement, path: string, onLive: () => void, onFail: () => void, options: PlayOptions = {}) {
  const source = new MSE!();
  const managed = MSE !== window.MediaSource;
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`);
  socket.binaryType = 'arraybuffer';
  let buffer: SourceBuffer | null = null;
  let queue: ArrayBuffer[] = [];
  let ready = 0;
  let live = false;
  let closed = false;
  const request = () => { if (++ready === 2) socket.send(JSON.stringify({type: 'mse', value: CODECS.filter(codec => MSE!.isTypeSupported(`video/mp4; codecs="${codec}"`)).join()})); };
  const pump = () => {
    if (!buffer || buffer.updating) return;
    if (queue.length) {
      const size = queue.reduce((total, part) => total + part.byteLength, 0);
      const joined = new Uint8Array(size);
      let offset = 0;
      for (const part of queue) { joined.set(new Uint8Array(part), offset); offset += part.byteLength; }
      queue = [];
      try { buffer.appendBuffer(joined); } catch { /* quota or decode error: next segment retries */ }
      return;
    }
    if (buffer.buffered.length) {
      const end = buffer.buffered.end(buffer.buffered.length - 1);
      const start = buffer.buffered.start(0);
      if (options.replay) {
        // Gravação: sem pular para a ponta (pausar segura a imagem); descarta só o que já passou.
        if (video.currentTime - start > 10) { try { buffer.remove(start, video.currentTime - 5); } catch { /* ignore */ } }
      } else {
        // Stay at the live edge and keep only a few seconds in memory.
        if (end - video.currentTime > 1.2) video.currentTime = end - 0.2;
        if (end - start > 10) { try { buffer.remove(start, end - 6); } catch { /* ignore */ } }
      }
    }
  };
  source.addEventListener('sourceopen', request, {once: true});
  if (managed) { video.disableRemotePlayback = true; video.srcObject = source as unknown as MediaStream; } else video.src = URL.createObjectURL(source);
  socket.onopen = request;
  socket.onmessage = event => {
    if (typeof event.data === 'string') {
      const message = JSON.parse(event.data) as {type: string; value: string};
      if (message.type === 'mse' && !buffer) {
        buffer = source.addSourceBuffer(message.value);
        buffer.mode = 'segments';
        buffer.addEventListener('updateend', pump);
      } else if (message.type === 'error' && !live) onFail();
      return;
    }
    queue.push(event.data as ArrayBuffer);
    pump();
    if (video.paused && !options.held?.()) void video.play().catch(() => {});
  };
  socket.onclose = () => { if (closed) return; if (!live) onFail(); else options.onEnd?.(); };
  const onPlaying = () => { if (!live) { live = true; onLive(); } };
  video.addEventListener('playing', onPlaying);
  return () => {
    closed = true;
    socket.close();
    video.removeEventListener('playing', onPlaying);
    video.pause();
    video.removeAttribute('src');
    video.srcObject = null;
    video.load();
  };
}

function LiveView({cameras, index, poster, move, close, rewind}: {cameras: Camera[]; index: number; poster?: string; move: (step: number) => void; close: () => void; rewind: (camera: Camera) => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<'loading' | 'live' | 'failed'>('loading');
  const [mjpeg, setMjpeg] = useState(!MSE);
  const camera = cameras[index];
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  useEffect(() => { setState('loading'); setMjpeg(!MSE); }, [camera.id]);
  useEffect(() => {
    if (mjpeg || !video.current) return;
    return playMse(video.current, `/api/cameras/${camera.id}/ws`, () => setState('live'), () => setMjpeg(true));
  }, [camera.id, mjpeg]);
  useEffect(() => {
    const node = image.current;
    if (!mjpeg || !node) return;
    node.src = `/api/cameras/${camera.id}/live.mjpeg`;
    // Browsers keep a removed MJPEG <img> downloading; swapping src aborts it and frees the server's live slot.
    return () => { node.src = 'data:,'; };
  }, [camera.id, mjpeg]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'ArrowLeft') move(-1); if (event.key === 'ArrowRight') move(1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);
  // No celular: arrastar o vídeo para baixo fecha; para os lados troca de câmera.
  const swipe = useRef<{x: number; y: number} | null>(null);
  const onTouchStart = (event: React.TouchEvent) => { const t = event.touches[0]; swipe.current = {x: t.clientX, y: t.clientY}; };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = swipe.current, t = event.changedTouches[0];
    swipe.current = null;
    if (!start) return;
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) close();
    else if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
  };
  return <dialog ref={dialog} className="camera-live" onCancel={close} aria-label={`Ao vivo: ${camera.name}`}>
    <div className="camera-live__bar">
      <button className="round ghost back" aria-label="Voltar para a grade" onClick={close}><ChevronLeft size={20} /><span>Voltar</span></button>
      <div><strong>Canal {camera.id.replace('cam', '')}</strong><small>{camera.name}</small></div>
      <button className="pill rewind" onClick={() => rewind(camera)} title="Ver a gravação do último minuto"><History size={15} />Rever 1 min</button>
      <span className={`live-badge ${state}`}><i />{state === 'live' ? 'Ao vivo' : state === 'failed' ? 'Sem sinal' : 'Conectando'}</span>
      <button className="round ghost close" aria-label="Fechar câmera" onClick={close}><X size={18} /></button>
    </div>
    <div className="camera-live__stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {poster && state !== 'live' ? <img className="camera-live__poster" src={poster} alt="" /> : null}
      {mjpeg
        ? <img ref={image} src="data:," alt={`Imagem ao vivo: ${camera.name}`} onLoad={event => { if (!event.currentTarget.src.startsWith('data:')) setState('live'); }} onError={event => { if (!event.currentTarget.src.startsWith('data:')) setState('failed'); }} />
        : <video ref={video} muted autoPlay playsInline aria-label={`Vídeo ao vivo: ${camera.name}`} />}
      {state === 'loading' ? <div className="camera-live__overlay"><LoaderCircle className="spin" size={26} /><p>Carregando…</p></div> : null}
      {state === 'failed' ? <div className="camera-live__overlay"><CameraOff size={26} /><p>A transmissão não abriu. Tente de novo em instantes.</p></div> : null}
      <button className="camera-live__nav prev" aria-label="Câmera anterior" onClick={() => move(-1)}><ChevronLeft size={24} /></button>
      <button className="camera-live__nav next" aria-label="Próxima câmera" onClick={() => move(1)}><ChevronRight size={24} /></button>
    </div>
  </dialog>;
}

const stamp = (tst: number) => new Date(tst * 1000).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'});

/** Gravação do próprio DVR a partir de um horário: voltar/avançar 30 s, pausar e ir ao ao vivo. */
function ReplayView({camera, start, casa, close, goLive}: {camera: Camera; start: number; casa: Casa; close: () => void; goLive: () => void}) {
  type State = 'loading' | 'live' | 'failed' | 'ended' | 'unsupported';
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [base, setBase] = useState(Math.floor(start));
  const [replay, setReplay] = useState<string | null>(null);
  const [state, setState] = useState<State>(MSE ? 'loading' : 'unsupported');
  const [failure, setFailure] = useState('');
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const held = useRef(false);
  const first = useRef<number | null>(null);
  const current = useRef<string | null>(null);
  const shut = (id: string) => { void casa.call(`/api/replays/${id}/close`, {}).catch(() => {}); };
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  // Cada horário pedido abre um replay novo no servidor, que já descarta o anterior.
  useEffect(() => {
    if (!MSE) return;
    let cancelled = false;
    setState('loading'); setReplay(null); setOffset(0); setPaused(false); held.current = false; first.current = null;
    const previous = current.current;
    current.current = null;
    // Chamada própria (fora da fila de botões do painel): pular 30 s nunca é recusado por "ocupado".
    casa.call(`/api/cameras/${camera.id}/replay`, {start: base, ...(previous ? {replace: previous} : {})}).then(value => {
      if (cancelled) { shut(value.id); return; }  // resposta de um pedido já trocado ou fechado
      current.current = value.id;
      setReplay(value.id);
    }).catch((error: Error) => { if (!cancelled) { setFailure(error.message); setState('failed'); } });
    return () => { cancelled = true; };
  }, [camera.id, base]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (current.current) shut(current.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!replay || !video.current) return;
    return playMse(video.current, `/api/replays/${replay}/ws`, () => setState('live'), () => setState('failed'),
      {replay: true, held: () => held.current, onEnd: () => setState('ended')});
  }, [replay]);
  const now = base + offset;
  const jump = (seconds: number) => setBase(Math.min(Math.floor(Date.now() / 1000) - 10, Math.floor(now + seconds)));
  const toggle = () => {
    const node = video.current;
    if (!node) return;
    held.current = !node.paused;
    if (node.paused) void node.play(); else node.pause();
    setPaused(held.current);
  };
  return <dialog ref={dialog} className="camera-live replay" onCancel={close} aria-label={`Gravação: ${camera.name}`}>
    <div className="camera-live__bar">
      <button className="round ghost back" aria-label="Voltar" onClick={close}><ChevronLeft size={20} /><span>Voltar</span></button>
      <div><strong>{camera.name}</strong><small>Gravação do DVR · {stamp(now)}</small></div>
      <button className="pill live-jump" onClick={goLive}><Radio size={15} />Ao vivo</button>
      <button className="round ghost close" aria-label="Fechar" onClick={close}><X size={18} /></button>
    </div>
    <div className="camera-live__stage">
      <video ref={video} muted autoPlay playsInline aria-label={`Gravação de ${camera.name}`}
        onTimeUpdate={event => { const t = event.currentTarget.currentTime; if (first.current === null) first.current = t; setOffset(Math.max(0, t - first.current)); }} />
      {state === 'loading' ? <div className="camera-live__overlay"><LoaderCircle className="spin" size={26} /><p>Buscando a gravação no DVR…</p></div> : null}
      {state === 'failed' ? <div className="camera-live__overlay"><CameraOff size={26} /><p>{failure || 'O DVR não entregou a gravação desse horário (pode não ter sido gravado).'}</p></div> : null}
      {state === 'ended' ? <div className="camera-live__overlay"><History size={26} /><p>Fim deste trecho da gravação. Avance ou volte para continuar.</p></div> : null}
      {state === 'unsupported' ? <div className="camera-live__overlay"><CameraOff size={26} /><p>Este navegador não toca a gravação. Use o Chrome, o Edge ou o Safari atualizado.</p></div> : null}
      <div className="replay-controls" role="group" aria-label="Controle da gravação">
        <button aria-label="Voltar 30 segundos" onClick={() => jump(-30)}><RotateCcw size={18} /><span>30 s</span></button>
        <button aria-label={paused ? 'Continuar' : 'Pausar'} className="main" disabled={state !== 'live'} onClick={toggle}>{paused ? <Play size={20} /> : <Pause size={20} />}</button>
        <button aria-label="Avançar 30 segundos" onClick={() => jump(30)}><RotateCw size={18} /><span>30 s</span></button>
      </div>
    </div>
  </dialog>;
}

const clock = (tst: number) => new Date(tst * 1000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
const day = (tst: number) => { const d = new Date(tst * 1000), today = new Date(); return d.toDateString() === today.toDateString() ? 'Hoje' : new Date(today.getTime() - 86400000).toDateString() === d.toDateString() ? 'Ontem' : d.toLocaleDateString('pt-BR'); };

/** Linha do tempo de movimento (eventos do próprio DVR) e escolha de quais câmeras avisam. */
function MotionView({cameras, motion, casa, open, reload}: {cameras: Camera[]; motion: Motion | null; casa: Casa; open: (event: MotionEvent) => void; reload: () => void}) {
  const [cam, setCam] = useState<string>('todas');
  const names = Object.fromEntries(cameras.map(c => [c.id, c.name]));
  if (!motion) return <div className="empty"><LoaderCircle className="spin" size={22} /><p>Lendo eventos do DVR</p></div>;
  const events = motion.events.filter(event => cam === 'todas' || event.camera === cam);
  const watching = motion.notify.includes(cam);
  const toggle = async (id: string) => { await casa.post('motion', '/api/motion/notify', {camera: id, on: !motion.notify.includes(id)}); reload(); };
  let lastDay = '';
  return <div className="motion">
    <div className={`motion-status ${motion.connected ? 'ok' : 'warn'}`}><i />{motion.connected ? 'Recebendo eventos do DVR' : motion.error ?? 'Conectando ao DVR…'}<span>últimas 24 h</span></div>
    <div className="motion-cams" role="group" aria-label="Filtrar por câmera">
      <button className={cam === 'todas' ? 'selected' : ''} onClick={() => setCam('todas')}>Todas</button>
      {cameras.map(c => <button key={c.id} className={cam === c.id ? 'selected' : ''} onClick={() => setCam(c.id)}>{motion.notify.includes(c.id) ? <Bell size={12} /> : null}{c.name}</button>)}
    </div>
    {cam !== 'todas' ? <button className={`motion-bell ${watching ? 'on' : ''}`} aria-pressed={watching} disabled={!!casa.busy} onClick={() => void toggle(cam)}>
      {watching ? <Bell size={15} /> : <BellOff size={15} />}{watching ? `Avisando quando houver movimento em ${names[cam]}` : `Avisar quando houver movimento em ${names[cam]}`}
    </button> : <p className="loc-hint">Escolha uma câmera acima para ligar os avisos dela (na bandeja do Windows).</p>}
    {events.length ? <ol className="motion-list">{events.map(event => {
      const label = day(event.start);
      const header = label !== lastDay ? (lastDay = label) : null;
      const duration = event.end ? Math.max(1, Math.round((event.end - event.start) / 60)) : null;
      return <li key={event.id}>
        {header ? <h4>{header}</h4> : null}
        <button onClick={() => open(event)} aria-label={`Ver a gravação de ${names[event.camera]} às ${clock(event.start)}`}>
          {event.photo ? <img src={`/api/motion/${event.id}.jpg`} alt="" loading="lazy" /> : <span className="motion-nophoto"><CameraIcon size={16} /></span>}
          <span className="motion-text"><strong>{names[event.camera] ?? event.camera}</strong><small>{clock(event.start)}{event.end ? ` · ${duration} min` : ' · agora'}{event.count > 1 ? ` · ${event.count} disparos` : ''}</small></span>
          {motion.notify.includes(event.camera) ? <Bell size={14} className="motion-flag" /> : null}
        </button>
      </li>;
    })}</ol> : <p className="loc-hint">Nenhum movimento {cam === 'todas' ? 'nas câmeras' : 'nesta câmera'} nas últimas 24 h.</p>}
  </div>;
}

export default function Cameras({casa, openCamera}: {casa: Casa; openCamera?: string | null}) {
  const [cameras, setCameras] = useState<Camera[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('todas');
  const [frames, setFrames] = useState<Record<string, Frame>>({});
  const [live, setLive] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [nonce, setNonce] = useState(0);
  const urls = useRef<Record<string, string>>({});
  const [motion, setMotion] = useState<Motion | null>(null);
  const [replay, setReplay] = useState<{camera: Camera; start: number} | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const loadMotion = useCallback(async () => {
    try {
      const response = await fetch('/api/motion', {cache: 'no-store'});
      if (!response.ok) return;
      const value: Motion = await response.json();
      setMotion(value);
      // Com o filtro Movimento aberto, cada leitura reenvia o "visto" enquanto houver não vistos:
      // uma falha passageira não deixa o aviso da bandeja preso.
      if (filterRef.current === 'movimento' && value.unseen) void casa.call('/api/motion/seen', {}).catch(() => {});
    } catch { /* tenta de novo */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadMotion(); const timer = setInterval(() => { if (!document.hidden) void loadMotion(); }, 15000); return () => clearInterval(timer); }, [loadMotion]);
  // Abrir a aba de movimento conta como "visto" para o aviso da bandeja.
  // Chamada própria (fora da fila de ocupado): não se perde se outra ação, como parear a TV, estiver em andamento.
  useEffect(() => { if (filter === 'movimento' && motion?.unseen) void casa.call('/api/motion/seen', {}).then(() => loadMotion()).catch(() => {}); }, [filter, motion?.unseen]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = new Set((motion?.events ?? []).filter(event => event.end === null).map(event => event.camera));

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/cameras', {cache: 'no-store'});
      if (!response.ok) throw new Error();
      const value = await response.json();
      if (!Array.isArray(value.cameras)) throw new Error();
      setCameras(value.cameras); setAvailable(value.available === true); setError(false);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = (cameras ?? []).filter(camera => filter === 'todas' || filter === 'movimento' || camera.group === filter);
  const visibleIds = visible.map(camera => camera.id).join(',');
  const paused = live !== null || !available || filter === 'movimento';
  // A bandeja pode abrir uma câmera direto ao vivo (#cameras:cam4).
  useEffect(() => { if (!cameras || !openCamera) return; const index = cameras.findIndex(c => c.id === openCamera); if (index >= 0) { setFilter('todas'); setLive(index); } }, [cameras, openCamera]);

  useEffect(() => {
    if (!visibleIds || paused) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ids = visibleIds.split(',');
    const fetchOne = async (id: string) => {
      try {
        const response = await fetch(`/api/cameras/${id}/frame.jpg`, {cache: 'no-store'});
        if (!response.ok) throw new Error();
        const age = Number(response.headers.get('X-Frame-Age') ?? 0);
        const url = URL.createObjectURL(await response.blob());
        if (stopped) { URL.revokeObjectURL(url); return; }
        const old = urls.current[id];
        urls.current[id] = url;
        setFrames(current => ({...current, [id]: {url, at: Date.now() - (Number.isFinite(age) ? age * 1000 : 0)}}));
        if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
      } catch {
        if (!stopped) setFrames(current => ({...current, [id]: {...current[id], failed: true}}));
      }
    };
    const cycle = async () => {
      if (document.hidden) { timer = setTimeout(cycle, 1500); return; }
      const queue = [...ids];
      await Promise.all(Array.from({length: PARALLEL}, async () => { while (queue.length && !stopped) await fetchOne(queue.shift()!); }));
      if (!stopped) timer = setTimeout(cycle, REFRESH_MS);
    };
    void cycle();
    return () => { stopped = true; clearTimeout(timer); };
  }, [visibleIds, paused, nonce]);

  useEffect(() => { const tick = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(tick); }, []);
  useEffect(() => () => Object.values(urls.current).forEach(url => URL.revokeObjectURL(url)), []);

  const move = useCallback((step: number) => setLive(current => current === null ? null : (current + step + visible.length) % visible.length), [visible.length]);

  if (error || !cameras) {
    return <div className="empty">{error ? <CameraOff size={24} /> : <LoaderCircle className="spin" size={24} />}<p>{error ? 'Câmeras indisponíveis' : 'Abrindo câmeras'}</p>{error ? <button className="pill" onClick={() => void load()}><RefreshCw size={15} />Tentar de novo</button> : null}</div>;
  }
  const latest = Math.max(0, ...visible.map(camera => frames[camera.id]?.at ?? 0));
  return <section className="card cameras" aria-labelledby="cameras-heading">
    <div className="card-head">
      <div className="title"><Cctv size={17} /><strong id="cameras-heading">Câmeras</strong><span>{visible.length} de {cameras.length}</span></div>
      <button className="round accent" aria-label="Atualizar imagens agora" disabled={paused} onClick={() => setNonce(value => value + 1)}><RefreshCw size={17} /></button>
    </div>
    <div className="segmented wide" role="group" aria-label="Filtrar câmeras">{([['todas', 'Todas'], ['externa', 'Externas'], ['interna', 'Internas'], ['movimento', 'Movimento']] as const).map(([value, label]) => <button key={value} className={filter === value ? 'selected' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}{value === 'movimento' && motion?.unseen ? <b className="count">{motion.unseen}</b> : null}</button>)}</div>
    {!available ? <div className="alert" role="alert"><p>O serviço de câmeras (go2rtc) não está rodando no PC de casa.</p><button onClick={() => void load()}><RefreshCw size={15} />Verificar</button></div> : null}
    {filter === 'movimento' ? <MotionView cameras={cameras} motion={motion} casa={casa} reload={() => void loadMotion()} open={event => { const camera = cameras.find(c => c.id === event.camera); if (camera) setReplay({camera, start: event.start - 10}); }} /> : <div className="cam-grid">
      {visible.map((camera, index) => {
        const frame = frames[camera.id];
        return <button key={camera.id} className="cam" onClick={() => setLive(index)} aria-label={`Abrir ${camera.name} ao vivo`}>
          {frame?.url ? <img src={frame.url} alt="" /> : <span className="cam-empty">{frame?.failed ? <CameraOff size={20} /> : <LoaderCircle className="spin" size={18} />}</span>}
          <span className="cam-ch">{camera.id.replace('cam', '')}</span>
          <span className="cam-snap" aria-hidden="true"><CameraIcon size={13} /></span>
          <span className="cam-name">{camera.name}</span>
          {active.has(camera.id) ? <span className="cam-motion" title="Movimento agora"><i />Movimento</span> : null}
        </button>;
      })}
    </div>}
    <p className={`card-foot ${available ? 'tone-online' : 'tone-offline'}`}><ShieldCheck size={14} />{available ? 'Conectado ao DVR' : 'Sem conexão'}<span>{latest ? `Automático · ${ago(latest, now)}` : 'Atualização automática'}</span></p>
    {live !== null && visible[live] ? <LiveView cameras={visible} index={live} poster={frames[visible[live].id]?.url} move={move} close={() => setLive(null)}
      rewind={camera => { setLive(null); setReplay({camera, start: Date.now() / 1000 - 60}); }} /> : null}
    {replay ? <ReplayView key={`${replay.camera.id}-${replay.start}`} camera={replay.camera} start={replay.start} casa={casa} close={() => setReplay(null)}
      goLive={() => { const camera = replay.camera; setReplay(null); setFilter('todas'); setLive(cameras.findIndex(c => c.id === camera.id)); }} /> : null}
  </section>;
}
