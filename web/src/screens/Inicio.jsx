import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtAgo, fmtTime, get, usePoll } from '../api.js';
import { href, useHome } from '../App.jsx';
import { Badge, Confidence, Dot, Icon, Key, Lcd, PixelBar, Spark, Stale, Switch, Tile, useAction, useConfidence } from '../ui.jsx';

const SCENE_ICONS = { home: 'home', film: 'film', moon: 'moon', book: 'book', sun: 'sun', sofa: 'sofa', coffee: 'coffee', bed: 'bed', power: 'power' };
const AC_MODES = { cool: 'frio', heat: 'quente', dry: 'seco', fan: 'ventilar', auto: 'auto' };
const SCREEN_FOR = { light: 'luzes', climate: 'clima', tv: 'tv' };
const WIDE_CAMS = 4;
const WIDE_PARALLEL = 3;
const WIDE_EVERY = 4000;
// Alvo de toque mínimo de 44 px também nos links soltos.
const LINK = { minHeight: 44, display: 'inline-flex', alignItems: 'center' };

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const isOffline = (d) => !!d.connection && !['online', 'preview'].includes(d.connection);

function Hero({ location, size, led }) {
  const now = useClock();
  const people = location?.people || [];
  const places = Object.fromEntries((location?.places || []).map((p) => [p.id, p.name]));
  const day = now.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  return (
    <Lcd style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div>
          <span className="lbl">{day}</span>
          <div><Dot size={size}>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Dot></div>
        </div>
        {led}
      </div>
      {people.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="list" aria-label="Pessoas">
          {people.map((p) => {
            const where = !p.last ? 'sem posição' : p.place ? `em ${places[p.place] || p.place}` : 'fora dos lugares';
            return (
              <a key={p.id} role="listitem" className="chip" href={href('local')}>
                <span className="avatar" aria-hidden="true">{(p.name || '?').slice(0, 1).toUpperCase()}</span>
                <span><b>{p.name}</b><small className="dim"> {where}{p.stale ? ' · posição antiga' : p.last ? ` · ${fmtAgo(p.last.tst)}` : ''}</small></span>
              </a>
            );
          })}
        </div>
      )}
    </Lcd>
  );
}

function SceneKey({ scene, active, running, other, onRun }) {
  return (
    <Key on={active || undefined} loading={running} disabled={other} sub={scene.description} onClick={() => onRun(scene)}>
      <span className="ic"><Icon name={SCENE_ICONS[scene.icon] || 'sun'} size={24} /></span>{scene.name}
    </Key>
  );
}

/** Modos da casa; `limit` corta a lista (a grade ampla só tem 3 colunas para eles). */
function Scenes({ limit, style }) {
  const { home, refresh } = useHome();
  const [run] = useAction();
  const [running, setRunning] = useState(null);
  const [last, setLast] = useState(null);
  const scenes = (home.scenes || []).slice(0, limit);
  if (!scenes.length) return null;
  const start = async (scene) => {
    setRunning(scene.id);
    if (await run(`/api/scenes/${scene.id}/run`, {}, `${scene.name} aplicado`)) { setLast(scene.id); refresh(); }
    setRunning(null);
  };
  return (
    <>
      {scenes.map((s) => <SceneKey key={s.id} scene={s} active={last === s.id} running={running === s.id} other={running !== null && running !== s.id} onRun={start} />)}
    </>
  );
}

function deviceView(d) {
  const st = d.state || {};
  if (isOffline(d)) return { value: '—', off: true, sub: 'sem conexão' };
  if (st.power == null) return { value: '– –', off: true };
  if (d.kind === 'light') return { value: st.power ? `${st.brightness ?? '—'}%` : 'OFF', off: !st.power, bar: st.power ? st.brightness : null };
  if (d.kind === 'climate') {
    const mode = AC_MODES[st.mode] || st.mode;
    return st.power ? { value: `${st.temperature ?? '–'}°`, sub: mode } : { value: 'OFF', off: true, sub: st.temperature ? `último ${st.temperature}°${mode ? ` · ${mode}` : ''}` : null };
  }
  if (d.kind === 'tv') return { value: st.power ? 'ON' : 'OFF', off: !st.power, sub: d.brand };
  return { value: '—', off: true };
}

/** Controle do aparelho: chave nas luzes, atalho para a tela nos demais. */
function DeviceControl({ d }) {
  const { refresh } = useHome();
  const [run, busy] = useAction();
  if (d.kind !== 'light') return <a href={href(SCREEN_FOR[d.kind] || 'luzes')} aria-label={`Abrir ${d.name}`} className="hit"><Icon name={d.kind === 'climate' ? 'ar' : 'tv'} size={20} /></a>;
  const toggle = async () => {
    if (await run(`/api/devices/${d.id}/commands`, { action: 'set', values: { power: !d.state?.power } })) refresh();
  };
  return <Switch on={d.state?.power === true} label={d.name} disabled={busy || isOffline(d)} onChange={toggle} />;
}

function DeviceTile({ d, compact }) {
  const { mode } = useHome();
  const confidence = useConfidence(d);
  const view = deviceView(d);
  return (
    <Tile name={d.name} value={view.value} off={view.off} sim={mode === 'preview'} confidence={confidence} aside={<DeviceControl d={d} />}>
      {view.bar != null && <PixelBar value={view.bar} small onBody />}
      {!compact && view.sub && <small style={{ color: 'var(--ink2)' }}>{view.sub}</small>}
    </Tile>
  );
}

/** Linha compacta da bandeja: nome, valor, confiança e o controle. */
function DeviceRow({ d }) {
  const confidence = useConfidence(d);
  return (
    <div>
      <span>{d.name}<small>{deviceView(d).value} · <Confidence kind={confidence} /></small></span>
      <DeviceControl d={d} />
    </div>
  );
}

function newestEvent(motion) {
  const events = motion.data?.events || [];
  return events.reduce((best, e) => (!best || e.start > best.start ? e : best), null);
}

function LastMotion({ cameraNames, motion, tray }) {
  const latest = useMemo(() => newestEvent(motion), [motion.data]);
  const fresh = latest && (motion.data?.unseenBy?.[latest.camera] || 0) > 0;
  const name = latest && (cameraNames[latest.camera] || latest.camera);
  return (
    <section className="stack" aria-label="Último movimento">
      <div className="row"><h2 className="lbl">Último movimento</h2><a className="lbl" href={href('cameras')} style={LINK}>câmeras</a></div>
      <Stale poll={motion} what="os eventos" />
      {!latest ? (
        <p className="mut">{motion.data ? 'Nenhum movimento registrado.' : 'Lendo as câmeras…'}</p>
      ) : (
        <a href={href('cameras', latest.camera)} style={{ display: 'block', color: 'var(--ink)', textDecoration: 'none' }}>
          <div className="thumb" style={{ height: tray ? 92 : 150 }}>
            {latest.photo && <img src={`/api/motion/${latest.id}.jpg`} alt={`Movimento em ${name}`} />}
            {fresh && <span className="badge">Novo</span>}
            <span className="t"><span>{name}</span><span>{fmtTime(latest.start)} · {latest.count}×</span></span>
          </div>
        </a>
      )}
    </section>
  );
}

/** Amostras dos medidores acumuladas no cliente (a API só devolve o valor atual). */
function useHistory(stats) {
  const [hist, setHist] = useState({ cpu: [], gpu: [], mem: [], wsl: [] });
  const seen = useRef(null);
  useEffect(() => {
    if (!stats || seen.current === stats) return;
    seen.current = stats;
    const push = (list, v) => (v == null ? list : [...list, v].slice(-24));
    setHist((h) => ({ cpu: push(h.cpu, stats.cpu), gpu: push(h.gpu, stats.gpu?.temp), mem: push(h.mem, stats.memory?.used), wsl: push(h.wsl, stats.wslGb) }));
  }, [stats]);
  return hist;
}

function meters(stats = {}) {
  return [
    ['cpu', stats.cpu != null ? `${stats.cpu}%` : '—', (stats.cpu || 0) >= 90],
    ['mem', stats.memory ? `${stats.memory.used}%` : '—', (stats.memory?.used || 0) >= 85],
    ['gpu', stats.gpu?.temp != null ? `${Math.round(stats.gpu.temp)}°` : '—', (stats.gpu?.temp || 0) >= 80],
    ['wsl', stats.wslGb != null ? String(stats.wslGb).replace('.', ',') : '—', (stats.wslGb || 0) >= 5.5],
  ];
}

function gameText(d) {
  if (d.step) return d.step;
  if (d.mode === 'jogo') return `Ligado${d.reason?.startsWith('auto:') ? ` · entrou sozinho com ${d.reason.slice(5)}` : ''} · mídia e downloads parados`;
  return d.auto ? `Desligado · liga sozinho ao abrir ${(d.games || []).join(', ')}` : 'Desligado';
}

function GameRow({ lab, className, compact }) {
  const [run, busy] = useAction();
  const d = lab.data;
  const game = d?.mode === 'jogo';
  const toggle = async () => {
    if (await run('/api/homelab', { mode: game ? 'lab' : 'jogo' }, game ? 'Voltando ao normal…' : 'Ligando o modo jogo…')) lab.reload();
  };
  return (
    <div className={className}>
      <span>Modo jogo{!compact && <small>{d ? gameText(d) : '—'}</small>}</span>
      <Switch on={game} label="Modo jogo" disabled={!d || busy || !!d?.step} onChange={toggle} />
    </div>
  );
}

function LabSummary({ lab, tray }) {
  const d = lab.data;
  if (d && !d.enabled) return null;
  return (
    <section className="stack" aria-label="Home lab">
      {!tray && <div className="row"><h2 className="lbl">Home lab</h2><a className="lbl" href={href('lab')} style={LINK}>abrir lab</a></div>}
      <Stale poll={lab} what="o home lab" />
      <Lcd style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, padding: 12 }}>
        {meters(d?.stats).map(([label, value, warn]) => (
          <div key={label}><span className="lbl">{label}</span><div><Dot size={20} style={warn ? { color: 'var(--lcd-sinal)' } : undefined}>{value}</Dot></div></div>
        ))}
      </Lcd>
      <div className="list"><GameRow lab={lab} /></div>
    </section>
  );
}

function RecentActions() {
  const { home } = useHome();
  const actions = home.recentActions || [];
  if (!actions.length) return null;
  return (
    <section className="stack" aria-label="Últimas ações">
      <h2 className="lbl">Últimas ações</h2>
      <div className="list">
        {actions.slice(0, 5).map((a) => (
          <div key={a.id}>
            <span>{a.name}<small>{a.message}</small></span>
            <span style={{ fontSize: 11, color: a.status === 'failed' ? 'var(--sinal-tx)' : 'var(--ink2)' }}>{fmtTime(a.createdAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Quadros da grade ampla: 4 câmeras, 3 por vez, a cada 4 s; pausa com a aba oculta. */
function useWideFrames(ids) {
  const [frames, setFrames] = useState({});
  const urls = useRef({});
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return;
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
      await Promise.all(Array.from({ length: WIDE_PARALLEL }, async () => { while (queue.length && !stop) await load(queue.shift()); }));
      if (!stop) timer = setTimeout(cycle, WIDE_EVERY);
    };
    cycle();
    return () => { stop = true; clearTimeout(timer); };
  }, [key]);
  useEffect(() => () => Object.values(urls.current).forEach((u) => URL.revokeObjectURL(u)), []);
  return frames;
}

function WideCameras({ cameras, motion, available }) {
  const bells = motion.data?.notify || [];
  const shown = useMemo(() => [...cameras].sort((a, b) => Number(bells.includes(b.id)) - Number(bells.includes(a.id))).slice(0, WIDE_CAMS), [cameras, bells.join(',')]);
  const frames = useWideFrames(available ? shown.map((c) => c.id) : []);
  const events = (motion.data?.events || []).slice().sort((a, b) => b.start - a.start).slice(0, 6);
  const names = Object.fromEntries(cameras.map((c) => [c.id, c.name]));
  return (
    <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      <div className="row"><h2 className="lbl" style={{ fontSize: 13 }}>Câmeras · frame a cada 4 s</h2><span className="lbl" style={{ fontSize: 13 }}>sem vídeo ao vivo</span></div>
      <Stale poll={motion} what="os eventos" />
      {!available ? <p className="mut">Câmeras indisponíveis na prévia.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {shown.map((c) => (
            <a key={c.id} href={href('cameras', c.id)} className="thumb" style={{ aspectRatio: '16 / 10', display: 'block' }} aria-label={c.name}>
              {frames[c.id]?.url && <img src={frames[c.id].url} alt="" />}
              {!frames[c.id]?.url && <span className="t" style={{ top: 8, bottom: 'auto' }}><span>{frames[c.id]?.failed ? 'sem imagem' : 'carregando…'}</span></span>}
              <span className="t"><span>{c.name}</span><span>{frames[c.id]?.at ? fmtAgo(frames[c.id].at) : ''}</span></span>
            </a>
          ))}
        </div>
      )}
      {available && (
        <div className="list">
          {events.length === 0 && <div><span className="mut">{motion.data ? 'Nenhum movimento registrado.' : 'Lendo as câmeras…'}</span></div>}
          {events.map((e) => (
            <div key={e.id}>
              <span>{names[e.camera] || e.camera}<small>{fmtTime(e.start)} · {e.count}×</small></span>
              {(motion.data?.unseenBy?.[e.camera] || 0) > 0 ? <Badge>Novo</Badge> : <span className="lbl">visto</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 2º monitor (>= 1600 px): tudo numa tela, sem rolar. */
function Wide({ led, location, cameras, motion, lab, mode }) {
  const { home } = useHome();
  const d = lab.data;
  const hist = useHistory(d?.stats);
  const game = d?.mode === 'jogo';
  const labOn = !d || d.enabled;
  const history = { cpu: [hist.cpu, 85], gpu: [hist.gpu, 80], mem: [hist.mem, 85], wsl: [hist.wsl, 6] };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr 1.25fr', gridTemplateRows: 'auto auto 1fr', gap: 18, height: 'calc(100dvh - 72px)', minHeight: 0 }}>
      <Hero location={location} size={150} led={led} />
      <Lcd style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
        <div className="row"><span className="lbl">modo do PC</span><span className={`led ${game ? 'env' : ''}`}>{!labOn ? 'indisponível' : game ? 'jogando' : 'home lab'}</span></div>
        <div><Dot size={64}>{!labOn ? '—' : game ? 'JOGO' : 'LAB'}</Dot></div>
        <div className="dim" style={{ fontSize: 14 }}>{labOn && d ? gameText(d) : 'Home lab não configurado neste painel.'}</div>
        {labOn && <GameRow lab={lab} className="row" compact />}
      </Lcd>
      <div style={{ gridColumn: 3, gridRow: '1 / span 3', minHeight: 0, overflow: 'hidden' }}>
        <WideCameras cameras={cameras} motion={motion} available={mode !== 'preview'} />
      </div>
      <Lcd style={{ gridColumn: '1 / span 2', gridRow: 2, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 22, minHeight: 0 }}>
        {meters(d?.stats).map(([label, value, warn]) => (
          <div key={label} className="stack" style={{ gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
            <div className="row"><span className="lbl">{label === 'mem' ? 'memória' : label}</span><Dot size={34} style={warn ? { color: 'var(--lcd-sinal)' } : undefined}>{label === 'wsl' && value !== '—' ? `${value}GB` : value}</Dot></div>
            <Spark className="fill" values={[...Array(Math.max(0, 24 - history[label][0].length)).fill(0), ...history[label][0]]} hi={history[label][1]} />
          </div>
        ))}
      </Lcd>
      <div style={{ gridColumn: '1 / span 2', gridRow: 3, alignSelf: 'start', display: 'grid', gap: 12 }}>
        <div style={sceneGrid(3)}><Scenes limit={3} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {(home.devices || []).slice(0, 4).map((d2) => <DeviceTile key={d2.id} d={d2} compact />)}
        </div>
      </div>
    </div>
  );
}

const sceneGrid = (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 });

export default function Inicio() {
  const { mode, layout, home } = useHome();
  const tray = layout === 'tray';
  const location = usePoll('/api/location', 60000);
  const motion = usePoll(mode === 'preview' ? null : '/api/motion', tray ? 30000 : 15000);
  const lab = usePoll('/api/homelab', layout === 'wide' ? 5000 : 15000);
  const [cameras, setCameras] = useState([]);
  useEffect(() => {
    if (mode === 'preview') return;
    get('/api/cameras').then((data) => setCameras(data.cameras || [])).catch(() => {});
  }, [mode]);
  const cameraNames = useMemo(() => Object.fromEntries(cameras.map((c) => [c.id, c.name])), [cameras]);
  const online = !location.error;
  const led = <span className={`led ${!online ? 'off' : mode === 'preview' ? 'env' : ''}`}>{!online ? 'sem conexão' : mode === 'preview' ? 'prévia' : 'rede local'}</span>;

  if (layout === 'wide') return <Wide led={led} location={location.data} cameras={cameras} motion={motion} lab={lab} mode={mode} />;

  const devices = home.devices || [];
  const notice = mode === 'preview' && (
    <div className="aviso" role="status"><Icon name="warn" size={20} /><span>Prévia: nada físico é acionado e as câmeras ficam desligadas.</span></div>
  );
  const modes = <div style={sceneGrid(3)}><Scenes /></div>;
  if (tray) {
    return (
      <>
        {notice}
        <Hero location={location.data} size={34} led={led} />
        {modes}
        {devices.length > 0 && <div className="list">{devices.map((d) => <DeviceRow key={d.id} d={d} />)}</div>}
        {mode !== 'preview' && <LastMotion cameraNames={cameraNames} motion={motion} tray />}
        <LabSummary lab={lab} tray />
      </>
    );
  }
  const desktop = layout === 'desktop';
  const left = (
    <>
      <Hero location={location.data} size={64} led={led} />
      <div className="row"><h2 className="lbl">Modos</h2><span className="lbl">toque para rodar</span></div>
      {modes}
      <div className="row"><h2 className="lbl">Aparelhos</h2></div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(2, minmax(0, 1fr))`, gap: 12 }}>
        {devices.map((d) => <DeviceTile key={d.id} d={d} />)}
      </div>
    </>
  );
  const right = (
    <>
      {mode !== 'preview' && <LastMotion cameraNames={cameraNames} motion={motion} />}
      <LabSummary lab={lab} />
      <RecentActions />
    </>
  );
  return (
    <>
      {notice}
      {desktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 16, alignItems: 'start' }}>
          <div className="stack" style={{ gap: 12 }}>{left}</div>
          <div className="stack" style={{ gap: 12 }}>{right}</div>
        </div>
      ) : <>{left}{right}</>}
    </>
  );
}
