import { useEffect, useMemo, useState } from 'react';
import { fmtAgo, fmtTime, get, usePoll } from '../api.js';
import { href, useHome } from '../App.jsx';
import { Bar, Card, Icon, Stale, Switch, useAction } from '../ui.jsx';

const SCENE_ICONS = { film: 'film', moon: 'moon', door: 'door', sun: 'sun' };

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function Hero({ location }) {
  const now = useClock();
  const people = location?.people || [];
  const places = Object.fromEntries((location?.places || []).map((p) => [p.id, p.name]));
  return (
    <section className="entra" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">{now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1 className="num" style={{ fontSize: 'clamp(48px, 9vw, 64px)', lineHeight: 1, fontWeight: 600, letterSpacing: '-0.03em' }}>
          {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </h1>
      </div>
      {people.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {people.map((p) => {
            const where = !p.last ? 'sem posição ainda' : p.place ? `em ${places[p.place] || p.place}` : 'fora dos lugares';
            return (
              <a key={p.id} href={href('local')} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 14, padding: '10px 14px', color: 'var(--text)' }}>
                <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--raised)', display: 'grid', placeItems: 'center', fontWeight: 600 }}>{p.name.slice(0, 1)}</span>
                <span className="stack">
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span className="small muted">{where}{p.stale ? ' · posição antiga' : p.last ? ` · ${fmtAgo(p.last.tst)}` : ''}</span>
                </span>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Scenes() {
  const { home, refresh } = useHome();
  const [run, busy] = useAction();
  const [last, setLast] = useState(null);
  if (!home.scenes?.length) return null;
  const start = async (scene) => {
    if (await run(`/api/scenes/${scene.id}/run`, {}, `${scene.name} aplicado`)) { setLast(scene.id); refresh(); }
  };
  return (
    <section className="entra" aria-labelledby="modos-t" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 id="modos-t" className="label">Modos</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {home.scenes.map((s) => (
          <button key={s.id} type="button" disabled={busy} onClick={() => start(s)} aria-pressed={last === s.id}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, textAlign: 'left', minHeight: 76, padding: '14px 16px', borderRadius: 16,
              background: last === s.id ? 'var(--accent-bg)' : 'var(--card)', border: `1px solid ${last === s.id ? 'var(--accent)' : 'var(--line)'}` }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 600 }}>
              <Icon name={SCENE_ICONS[s.icon] || 'sun'} size={18} />{s.name}
            </span>
            <span className="small muted">{s.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function deviceLine(d) {
  const st = d.state || {};
  if (d.kind === 'light') return st.power ? `${st.brightness ?? '—'}%` : st.power === false ? 'apagada' : 'estado desconhecido';
  if (d.kind === 'climate') return st.power ? `${st.temperature ?? '–'} °C` : st.power === false ? 'desligado' : '– – °C';
  if (d.kind === 'tv') return st.power ? 'ligada' : st.power === false ? 'desligada' : 'estado estimado';
  return '';
}

const SCREEN_FOR = { light: 'luzes', climate: 'clima', tv: 'tv' };

function Devices() {
  const { home, refresh } = useHome();
  const [run, busy] = useAction();
  const devices = home.devices || [];
  const toggleLight = async (d) => {
    if (await run(`/api/devices/${d.id}/commands`, { action: 'set', values: { power: !d.state?.power } })) refresh();
  };
  return (
    <section className="entra" aria-labelledby="ap-t" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 id="ap-t" className="label">Aparelhos</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {devices.map((d) => {
          const on = d.state?.power === true;
          const offline = d.connection && d.connection !== 'online';
          return (
            <div key={d.id} style={{ minHeight: 104, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10, padding: 14, borderRadius: 16,
              background: on ? 'var(--accent-bg)' : 'var(--card)', border: `1px solid ${on ? 'var(--accent-line)' : 'var(--line)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="mono small" style={{ color: on ? 'var(--text)' : 'var(--muted)' }}>{offline ? 'sem conexão' : deviceLine(d)}</span>
                {d.kind === 'light' && <Switch on={on} label={d.name} disabled={busy || offline} onChange={() => toggleLight(d)} />}
              </div>
              <a href={href(SCREEN_FOR[d.kind] || 'luzes')} style={{ color: 'var(--text)', fontSize: 16, fontWeight: 600 }}>{d.name}</a>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LastMotion({ cameraNames }) {
  const motion = usePoll('/api/motion', 15000);
  const latest = useMemo(() => {
    const events = motion.data?.events || [];
    return events.reduce((best, e) => (!best || e.start > best.start ? e : best), null);
  }, [motion.data]);
  return (
    <Card title="Último movimento" aside={<a href={href('cameras')}>Câmeras</a>}>
      <Stale poll={motion} what="os eventos" />
      {!latest ? (
        <p className="muted">{motion.data ? 'Nenhum movimento registrado.' : 'Lendo as câmeras…'}</p>
      ) : (
        <a href={href('cameras', latest.camera)} style={{ display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--text)' }}>
          {latest.photo
            ? <img src={`/api/motion/${latest.id}.jpg`} alt={`Movimento em ${cameraNames[latest.camera] || latest.camera}`} style={{ borderRadius: 14, aspectRatio: '16 / 9', objectFit: 'cover', width: '100%', background: 'var(--raised)' }} />
            : <span className="placeholder" style={{ aspectRatio: '16 / 9', borderRadius: 14 }}>sem foto</span>}
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{cameraNames[latest.camera] || latest.camera}</span>
            <span className="mono small muted">{fmtTime(latest.start)} · {latest.count}×</span>
          </span>
        </a>
      )}
    </Card>
  );
}

function LabSummary() {
  const lab = usePoll('/api/homelab', 15000);
  const [run, busy] = useAction();
  const d = lab.data;
  if (d && !d.enabled) return null;
  const stats = d?.stats || {};
  const game = d?.mode === 'jogo';
  const switching = !!d?.step;
  const toggleGame = async () => {
    if (await run('/api/homelab', { mode: game ? 'lab' : 'jogo' }, game ? 'Voltando ao normal…' : 'Ligando o modo jogo…')) lab.reload();
  };
  const items = [
    ['CPU', stats.cpu != null ? `${stats.cpu}%` : '—', stats.cpu, false],
    ['Memória', stats.memory ? `${stats.memory.used}%` : '—', stats.memory?.used, (stats.memory?.used || 0) >= 85],
    ['GPU', stats.gpu?.temp != null ? `${Math.round(stats.gpu.temp)} °C` : '—', stats.gpu?.temp, (stats.gpu?.temp || 0) >= 80],
    ['WSL', stats.wslGb != null ? `${String(stats.wslGb).replace('.', ',')} GB` : '—', stats.wslGb != null ? (stats.wslGb / 6) * 100 : 0, (stats.wslGb || 0) >= 5.5],
  ];
  return (
    <Card title="Home lab" aside={<a href={href('lab')}>Abrir Lab</a>}>
      <Stale poll={lab} what="o home lab" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        {items.map(([label, value, pct, warn]) => (
          <div key={label} className="stack" style={{ gap: 4 }}>
            <span className="label" style={{ letterSpacing: '.04em' }}>{label}</span>
            <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{value}</span>
            <Bar pct={pct} warn={warn} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 16px', borderRadius: 14, background: 'var(--raised)' }}>
        <span className="stack">
          <span style={{ fontWeight: 600 }}>Modo jogo</span>
          <span className="small muted">{switching ? d.step : game ? `Ligado${d.reason?.startsWith('auto:') ? ` · ${d.reason.slice(5)}` : ''} · mídia, downloads e Frigate parados` : d?.auto ? `Desligado · liga sozinho ao abrir ${(d.games || []).join(', ')}` : 'Desligado'}</span>
        </span>
        <Switch on={game} label="Modo jogo" disabled={!d || busy || switching} onChange={toggleGame} />
      </div>
    </Card>
  );
}

function RecentActions() {
  const { home } = useHome();
  const actions = home.recentActions || [];
  if (!actions.length) return null;
  return (
    <Card title="Últimas ações">
      <div>
        {actions.slice(0, 5).map((a) => (
          <div key={a.id} className="row">
            <span className="stack"><span>{a.name}</span><span className="small muted">{a.message}</span></span>
            <span className="mono small" style={{ color: a.status === 'failed' ? 'var(--danger)' : 'var(--muted)' }}>{fmtTime(a.createdAt)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Inicio() {
  const { mode } = useHome();
  const location = usePoll('/api/location', 60000);
  const [cameraNames, setCameraNames] = useState({});
  useEffect(() => {
    if (mode === 'preview') return;
    get('/api/cameras').then((d) => setCameraNames(Object.fromEntries((d.cameras || []).map((c) => [c.id, c.name])))).catch(() => {});
  }, [mode]);
  return (
    <>
      {mode === 'preview' && <div className="notice info"><Icon name="warn" size={18} /><span>Prévia: nada físico é acionado e as câmeras ficam desligadas.</span></div>}
      <Hero location={location.data} />
      <Scenes />
      <Devices />
      <div className="grid">
        {mode !== 'preview' && <LastMotion cameraNames={cameraNames} />}
        <LabSummary />
        <RecentActions />
      </div>
    </>
  );
}
