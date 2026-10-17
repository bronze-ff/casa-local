import { useCallback, useEffect, useState } from 'react';
import { Cpu, ExternalLink, Gamepad2, HardDrive, LoaderCircle, MemoryStick, RotateCw, Server, Thermometer } from 'lucide-react';
import type { useCasa } from '../useCasa';

type Casa = ReturnType<typeof useCasa>;
type Service = {id: string; name: string; purpose: string; link: {kind: 'http' | 'https' | 'path' | 'tls'; target: number | string} | null; keep: boolean; state: string; status: string | null};
type Stats = {
  cpu?: number | null; memory?: {used: number; totalGb: number}; uptime?: number; wslGb?: number | null;
  gpu?: {name: string; temp: number | null; use: number | null; memUsed: number | null; memTotal: number | null; watts: number | null} | null;
  disks?: {drive: string; label: string; freeGb: number; totalGb: number; used: number}[];
};
type Lab = {frigate: 'fora' | 'sempre' | 'nunca'; frigateOn: boolean; presence: boolean | null; enabled: boolean; mode: 'lab' | 'jogo'; reason: string | null; since: number; step: string | null; auto: boolean; games: string[]; gamesOpen: string[];
  wsl: boolean | null; host: string | null; services: Service[]; stats: Stats; checked: number; history: [number, number | null, number | null, number | null, number | null][]};

const tone = (value: number | null | undefined, warn: number, bad: number) => value == null ? '' : value >= bad ? 'bad' : value >= warn ? 'warn' : 'ok';
const since = (ts: number) => {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
  return minutes < 60 ? `há ${minutes} min` : `há ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

function link(service: Service, host: string | null) {
  const here = window.location.hostname;
  const link = service.link;
  if (!link) return null;
  if (link.kind === 'path') return `https://${host ?? here}${link.target}`;
  if (link.kind === 'https') return `https://${host ?? here}:${link.target}`;
  if (link.kind === 'tls') return `https://${here}:${link.target}`;
  return `http://${here}:${link.target}`;
}

/** Linha de 24 h (um ponto a cada 5 min) para CPU, memória ou temperatura. */
function Spark({points, max, label, unit}: {points: (number | null)[]; max: number; label: string; unit: string}) {
  const values = points.map(v => v ?? null);
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return null;
  const w = 100, h = 28;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - Math.min(1, v / max) * (h - 2) - 1;
  const path = values.map((v, i) => v == null ? '' : `${i && values[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return <div className="spark" title={`${label}: mín ${Math.min(...known)}${unit}, máx ${Math.max(...known)}${unit} em 24 h`}>
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><path d={`${path}`} /></svg>
    <span>{label} · máx {Math.round(Math.max(...known))}{unit}</span>
  </div>;
}

/** Aba Lab: home lab no WSL (serviços, links), modo jogo e números do PC, pensada para o celular. */
export default function LabTab({casa}: {casa: Casa}) {
  const [lab, setLab] = useState<Lab | null>(null);
  const load = useCallback(async () => {
    try { const response = await fetch('/api/homelab', {cache: 'no-store'}); if (response.ok) setLab(await response.json()); } catch { /* tenta de novo */ }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 8000); return () => clearInterval(timer); }, [load]);
  const send = async (body: Record<string, unknown>, success: string) => { const value = await casa.post('homelab', '/api/homelab', body, success); if (value) setLab(value as unknown as Lab); };
  if (!lab) return <section className="card lab"><div className="empty"><LoaderCircle className="spin" size={22} /><p>Lendo o home lab</p></div></section>;
  if (!lab.enabled) return <section className="card lab"><p className="loc-hint">O home lab roda só no PC de casa (esta é a prévia).</p></section>;
  const gaming = lab.mode === 'jogo';
  const busy = !!lab.step || casa.busy === 'homelab';
  const { stats } = lab;
  const up = lab.services.filter(s => s.state === 'running').length;
  return <section className="card lab" aria-label="Home lab">
    <div className={`lab-mode ${gaming ? 'game' : ''}`}>
      <div className="lab-mode-head">
        {gaming ? <Gamepad2 size={22} /> : <Server size={22} />}
        <div>
          <strong>{lab.step ?? (gaming ? 'Modo jogo' : 'Home lab ligado')}</strong>
          <span>{lab.step ? 'Isso leva alguns segundos.' : gaming
            ? `${lab.reason?.startsWith('auto:') ? `Entrou sozinho: ${lab.reason.slice(5)} aberto` : 'Ligado por você'} · ${since(lab.since)}. Mídia, downloads e Frigate parados; avisos do celular seguem ligados.`
            : `${up} de ${lab.services.length} serviços rodando${lab.stats.wslGb ? ` · WSL usando ${lab.stats.wslGb} GB` : ''}`}</span>
        </div>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Modo do PC">
        <button role="radio" aria-checked={!gaming} className={!gaming ? 'selected' : ''} disabled={busy} onClick={() => void send({mode: 'lab'}, 'Ligando o home lab')}><Server size={15} />Home lab</button>
        <button role="radio" aria-checked={gaming} className={gaming ? 'selected' : ''} disabled={busy} onClick={() => void send({mode: 'jogo'}, 'Modo jogo: parando o home lab')}><Gamepad2 size={15} />Modo jogo</button>
      </div>
      <label className="mode-keep"><input type="checkbox" checked={lab.auto} onChange={event => void send({auto: event.target.checked}, event.target.checked ? 'Modo jogo automático ligado' : 'Modo jogo automático desligado')} />
        <span>Entrar sozinho ao abrir {lab.games.join(', ').replaceAll('.exe', '').toUpperCase()}<small>E voltar ao home lab 2 min depois que o jogo fechar. Se você ligar o modo jogo à mão, só sai à mão.</small></span></label>
    </div>

    <div className="lab-frigate">
      <span><strong>Câmeras inteligentes (Frigate)</strong><small>{lab.frigateOn ? 'Ligado agora' : 'Desligado agora'}{lab.frigate === 'fora' && lab.presence == null ? ' · sem localização do celular: configure na aba Local um lugar chamado "Casa"' : ''} · usa ~2 GB de memória e parte da GPU</small></span>
      <div className="segmented" role="radiogroup" aria-label="Quando ligar o Frigate">
        {([['fora', 'Fora de casa'], ['sempre', 'Sempre'], ['nunca', 'Nunca']] as const).map(([id, label]) =>
          <button key={id} role="radio" aria-checked={lab.frigate === id} className={lab.frigate === id ? 'selected' : ''} disabled={busy}
            onClick={() => void send({frigate: id}, id === 'fora' ? 'Frigate só com você fora de casa' : id === 'sempre' ? 'Frigate sempre ligado' : 'Frigate desligado')}>{label}</button>)}
      </div>
    </div>

    <div className="lab-stats">
      <div className={tone(stats.cpu, 70, 90)}><Cpu size={15} /><span>CPU</span><strong>{stats.cpu ?? '—'}%</strong></div>
      <div className={tone(stats.memory?.used, 80, 92)}><MemoryStick size={15} /><span>Memória</span><strong>{stats.memory?.used ?? '—'}%</strong><small>de {stats.memory?.totalGb ?? '—'} GB</small></div>
      <div className={tone(stats.gpu?.temp, 75, 85)}><Thermometer size={15} /><span>GPU</span><strong>{stats.gpu?.temp ?? '—'} °C</strong><small>{stats.gpu ? `${stats.gpu.use ?? 0}% · ${Math.round((stats.gpu.memUsed ?? 0) / 1024 * 10) / 10}/${Math.round((stats.gpu.memTotal ?? 0) / 1024)} GB` : 'sem leitura'}</small></div>
    </div>
    {lab.history?.length > 1 ? <div className="sparks">
      <Spark points={lab.history.map(p => p[1])} max={100} label="CPU" unit="%" />
      <Spark points={lab.history.map(p => p[2])} max={100} label="Memória" unit="%" />
      <Spark points={lab.history.map(p => p[3])} max={95} label="GPU" unit=" °C" />
    </div> : null}
    {stats.disks?.length ? <ul className="lab-disks">{stats.disks.map(disk => <li key={disk.drive} className={tone(disk.used, 85, 95)}>
      <HardDrive size={14} /><span>{disk.drive}: {disk.label}</span><i><b style={{width: `${disk.used}%`}} /></i><small>{disk.freeGb} GB livres</small>
    </li>)}</ul> : null}

    <h3 className="lab-title">Serviços</h3>
    <ul className="lab-services">{lab.services.map(service => {
      const url = link(service, lab.host);
      const state = service.state === 'running' ? 'on' : service.state === 'unknown' ? '' : 'off';
      return <li key={service.id} className={state}>
        <i />
        <div><strong>{service.name}</strong><span>{service.purpose}{service.state !== 'running' && service.state !== 'unknown' ? ' · parado' : ''}{gaming && service.keep ? ' · segue no jogo' : ''}</span></div>
        <span className="lab-actions">
          {!gaming || service.keep ? <button className="icon-btn" aria-label={`Reiniciar ${service.name}`} title="Reiniciar" disabled={busy}
            onClick={() => void send({restart: service.id}, `Reiniciando ${service.name}`)}><RotateCw size={14} /></button> : null}
          {url ? <a className="icon-btn" href={url} target="_blank" rel="noreferrer" aria-label={`Abrir ${service.name}`}><ExternalLink size={15} /></a> : null}
        </span>
      </li>;
    })}</ul>
    <p className="loc-hint">Serviços no WSL (Debian + Docker), mídia no HD D:. Fora de casa, abra pelo Tailscale. Atualizado {lab.checked ? since(lab.checked) : '—'}.</p>
  </section>;
}
