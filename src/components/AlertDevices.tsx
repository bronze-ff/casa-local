import { useCallback, useEffect, useState } from 'react';
import { BellRing, Gamepad2, Laptop, Pencil, Trash2 } from 'lucide-react';
import type { useCasa } from '../useCasa';

type Casa = ReturnType<typeof useCasa>;
type AlertDevice = {id: string; name: string; mode: 'watched' | 'some' | 'none'; cameras: string[]; game: boolean; pausedUntil: number; online: boolean; busy: boolean; lastSeen: number};
const FOREVER = 4102444800;
const RULES: [AlertDevice['mode'], string][] = [['watched', 'Monitoradas'], ['some', 'Só estas'], ['none', 'Nenhuma']];

function pauseText(until: number, now: number) {
  if (until <= now) return null;
  if (until >= FOREVER) return 'Pausado até reativar';
  const d = new Date(until * 1000);
  const time = d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
  return `Pausado até ${d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('pt-BR', {weekday: 'short'})} ${time}`}`;
}

/** Regra de alerta de cada computador com a bandeja (o celular não recebe esses alertas). */
export default function AlertDevices({casa, cameras, open}: {casa: Casa; cameras: {id: string; name: string}[]; open: boolean}) {
  const [data, setData] = useState<{devices: AlertDevice[]; now: number} | null>(null);
  const [renaming, setRenaming] = useState<{id: string; name: string} | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const response = await fetch('/api/alert-devices', {cache: 'no-store'}); if (response.ok) setData(await response.json()); } catch { /* tenta de novo */ }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 20000); return () => clearInterval(timer); }, [load]);
  const [problem, setProblem] = useState('');
  const send = async (path: string, body: Record<string, unknown>) => {
    try { setData(await casa.call(path, body)); setProblem(''); } catch (error) { setProblem(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
  };
  const update = (id: string, body: Record<string, unknown>) => send(`/api/alert-devices/${id}`, body);
  const remove = (id: string) => send(`/api/alert-devices/${id}/remove`, {});
  const now = data?.now ?? Date.now() / 1000;
  return <details className="alert-devices" open={open || undefined}>
    <summary><BellRing size={14} />Onde avisar<span>{data ? `${data.devices.length} ${data.devices.length === 1 ? 'computador' : 'computadores'}` : ''}</span></summary>
    {!data ? null : !data.devices.length ? <p className="loc-hint">Nenhuma bandeja se apresentou ainda. Ela aparece aqui sozinha depois de atualizada no computador.</p> : <ul>
      {data.devices.map(device => {
        const paused = pauseText(device.pausedUntil, now);
        return <li key={device.id} className="alert-device">
          <div className="alert-device-head">
            <Laptop size={15} />
            {renaming?.id === device.id ? <form onSubmit={event => { event.preventDefault(); void update(device.id, {name: renaming.name}).then(() => setRenaming(null)); }}>
              <input autoFocus value={renaming.name} maxLength={30} onChange={event => setRenaming({id: device.id, name: event.target.value})} onBlur={() => setRenaming(null)} aria-label="Nome do computador" />
            </form> : <strong>{device.name}</strong>}
            <span className={`alert-device-state ${device.busy ? 'busy' : device.online ? 'on' : ''}`}>{device.busy ? <><Gamepad2 size={12} />em tela cheia</> : device.online ? 'conectado' : 'desligado'}</span>
            <button className="icon-btn" aria-label={`Renomear ${device.name}`} onMouseDown={event => event.preventDefault()} onClick={() => setRenaming({id: device.id, name: device.name})}><Pencil size={13} /></button>
            {confirm === device.id ? <button className="link danger" onClick={() => { setConfirm(null); void remove(device.id); }}>Remover?</button>
              : <button className="icon-btn" aria-label={`Remover ${device.name}`} onClick={() => setConfirm(device.id)}><Trash2 size={13} /></button>}
          </div>
          <div className="segmented" role="radiogroup" aria-label={`Câmeras que avisam em ${device.name}`}>
            {RULES.map(([id, label]) => <button key={id} role="radio" aria-checked={device.mode === id} className={device.mode === id ? 'selected' : ''} onClick={() => void update(device.id, {mode: id})}>{label}</button>)}
          </div>
          {device.mode === 'some' ? <div className="alert-device-cams" role="group" aria-label="Câmeras">
            {cameras.map(camera => {
              const on = device.cameras.includes(camera.id);
              return <button key={camera.id} aria-pressed={on} className={on ? 'on' : ''} onClick={() => void update(device.id, {cameras: on ? device.cameras.filter(c => c !== camera.id) : [...device.cameras, camera.id]})}>{camera.name}</button>;
            })}
          </div> : null}
          {device.mode !== 'none' ? <div className="alert-device-row">
            <label className="mode-keep"><input type="checkbox" checked={device.game} onChange={event => void update(device.id, {game: event.target.checked})} />
              <span>Segurar com jogo ou vídeo em tela cheia<small>Os alertas esperam e chegam num resumo quando você sair da tela cheia.</small></span></label>
            <div className="alert-device-pause">
              {paused ? <><span>{paused}</span><button className="link" onClick={() => void update(device.id, {pausedUntil: 0})}>Reativar</button></>
                : <><span>Pausar</span>
                  <button onClick={() => void update(device.id, {pausedUntil: Math.floor(now) + 3600})}>1 h</button>
                  <button onClick={() => void update(device.id, {pausedUntil: Math.floor(now) + 4 * 3600})}>4 h</button>
                  <button onClick={() => void update(device.id, {pausedUntil: FOREVER})}>Até reativar</button></>}
            </div>
          </div> : null}
        </li>;
      })}
    </ul>}
    {problem ? <p className="mode-warn" role="alert">{problem}</p> : null}
    <p className="loc-hint">"Monitoradas" segue o sino de cada câmera. A contagem de movimentos e a ordem das câmeras continuam iguais em todo lugar; isto só escolhe onde o alerta aparece.</p>
  </details>;
}
