import { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarClock, Check, LoaderCircle, Pencil, Plus, Power, Trash2, X, Zap } from 'lucide-react';
import type { useCasa } from '../useCasa';

type Casa = ReturnType<typeof useCasa>;
type Check = {id: string; label: string; state: 'ok' | 'warn' | 'fail'; detail: string};
type Health = {state: 'ok' | 'warn' | 'fail'; checks: Check[]};
type Action = {type: 'scene'; id: string} | {type: 'device'; device: string; values: Record<string, unknown>};
type Routine = {id: string; name: string; enabled: boolean; days: number[]; time: string; action: Action; next: number | null};
type Routines = {routines: Routine[]; timers: {id: string; at: number; label: string}[]; log: {at: number; name: string; ok: boolean; message: string}[]};
type Energy = {config: {watts: number; tariff: number}; on: boolean; today: Block; month: Block; week: {date: string; hours: number}[]};
type Block = {hours: number; kwh: number; cost: number};

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
// Ações oferecidas nas rotinas: as mesmas do painel, com valores fixos e claros.
const ACTIONS: [string, string, Action][] = [
  ['ar-off', 'Desligar o ar', {type: 'device', device: 'ar-quarto', values: {power: false}}],
  ['ar-on', 'Ligar o ar · 24 °C resfriar', {type: 'device', device: 'ar-quarto', values: {power: true, temperature: 24, mode: 'cool', fan: 'auto'}}],
  ['ar-22', 'Ligar o ar · 22 °C resfriar', {type: 'device', device: 'ar-quarto', values: {power: true, temperature: 22, mode: 'cool', fan: 'auto'}}],
  ['quarto-on', 'Acender luz do quarto', {type: 'device', device: 'quarto-luz', values: {power: true}}],
  ['quarto-off', 'Apagar luz do quarto', {type: 'device', device: 'quarto-luz', values: {power: false}}],
  ['banheiro-off', 'Apagar luz do banheiro', {type: 'device', device: 'banheiro-luz', values: {power: false}}],
  ['cena-boa-noite', 'Cena Boa noite', {type: 'scene', id: 'boa-noite'}],
  ['cena-cheguei', 'Cena Cheguei', {type: 'scene', id: 'cheguei'}],
  ['cena-cinema', 'Cena Cinema', {type: 'scene', id: 'cinema'}],
];
const actionKey = (action: Action) => ACTIONS.find(([, , a]) => JSON.stringify(a) === JSON.stringify(action))?.[0];
const actionLabel = (action: Action) => ACTIONS.find(([, , a]) => JSON.stringify(a) === JSON.stringify(action))?.[1] ?? 'Ação personalizada';
const money = (value: number) => value.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
const hours = (value: number) => value < 1 ? `${Math.round(value * 60)} min` : `${value.toLocaleString('pt-BR', {maximumFractionDigits: 1})} h`;
const when = (tst: number) => {
  const d = new Date(tst * 1000), now = new Date();
  const time = d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
  if (d.toDateString() === now.toDateString()) return `hoje ${time}`;
  if (new Date(now.getTime() + 86400000).toDateString() === d.toDateString()) return `amanhã ${time}`;
  return `${d.toLocaleDateString('pt-BR', {weekday: 'short'})} ${time}`;
};

async function get<T>(path: string): Promise<T | null> {
  try { const response = await fetch(path, {cache: 'no-store'}); return response.ok ? await response.json() as T : null; } catch { return null; }
}

function HealthCard({health}: {health: Health | null}) {
  if (!health) return <div className="empty small"><LoaderCircle className="spin" size={20} /></div>;
  const summary = health.state === 'ok' ? 'Tudo funcionando' : health.state === 'warn' ? 'Funcionando, com avisos' : 'Algo parou';
  return <section className="central-block" aria-labelledby="health-title">
    <div className="central-head"><h3 id="health-title"><Activity size={16} />Saúde do sistema</h3><span className={`health-pill ${health.state}`}><i />{summary}</span></div>
    <ul className="health-list">{health.checks.map(check => <li key={check.id} className={check.state}><i /><strong>{check.label}</strong><span>{check.detail}</span></li>)}</ul>
  </section>;
}

function RoutineForm({initial, onSave, onCancel, busy}: {initial?: Routine; onSave: (body: Record<string, unknown>) => void; onCancel: () => void; busy: boolean}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [time, setTime] = useState(initial?.time ?? '07:00');
  const [days, setDays] = useState<number[]>(initial?.days ?? [0, 1, 2, 3, 4]);
  const [action, setAction] = useState(initial ? actionKey(initial.action) ?? 'ar-off' : 'ar-off');
  const chosen = ACTIONS.find(([key]) => key === action)!;
  const valid = name.trim().length > 0 && days.length > 0 && /^\d{2}:\d{2}$/.test(time);
  return <div className="routine-form">
    <label className="loc-field"><span>Nome</span><input value={name} maxLength={40} placeholder="Ex.: Desligar o ar de manhã" onChange={event => setName(event.target.value)} /></label>
    <div className="routine-row">
      <label className="loc-field"><span>Horário</span><input type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
      <label className="loc-field grow"><span>Fazer</span><select value={action} onChange={event => setAction(event.target.value)}>{ACTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    <div className="day-chips" role="group" aria-label="Dias da semana">{DAYS.map((label, index) => <button key={label} aria-pressed={days.includes(index)} className={days.includes(index) ? 'on' : ''} onClick={() => setDays(current => current.includes(index) ? current.filter(d => d !== index) : [...current, index].sort())}>{label}</button>)}</div>
    <div className="routine-actions">
      <button className="pill" onClick={onCancel}><X size={15} />Cancelar</button>
      <button className="pill accent" disabled={!valid || busy} onClick={() => onSave({...(initial ? {id: initial.id, enabled: initial.enabled} : {}), name: name.trim(), time, days, action: chosen[2]})}><Check size={15} />Salvar rotina</button>
    </div>
  </div>;
}

function RoutinesCard({data, casa, reload}: {data: Routines | null; casa: Casa; reload: () => void}) {
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const busy = casa.busy === 'routines';
  const post = async (path: string, body: Record<string, unknown>, success?: string) => { const value = await casa.post('routines', path, body, success); if (value) reload(); return value; };
  return <section className="central-block" aria-labelledby="routines-title">
    <div className="central-head"><h3 id="routines-title"><CalendarClock size={16} />Rotinas</h3>{editing ? null : <button className="link" onClick={() => setEditing('new')}><Plus size={14} />Nova</button>}</div>
    {editing ? <RoutineForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} busy={busy} onCancel={() => setEditing(null)}
      onSave={body => void post('/api/routines', body, 'Rotina salva').then(value => { if (value) setEditing(null); })} /> : null}
    {data?.timers.map(timer => <div key={timer.id} className="routine timer"><Power size={15} /><div><strong>{timer.label}</strong><span>{when(timer.at)} · timer</span></div><button className="icon-btn" aria-label="Cancelar timer" onClick={() => void post('/api/routines/timer', {device: 'ar-quarto', minutes: 0}, 'Timer cancelado')}><X size={14} /></button></div>)}
    {data && data.routines.length ? <ul className="routine-list">{data.routines.map(routine => <li key={routine.id} className={`routine ${routine.enabled ? '' : 'off'}`}>
      <button className={`switch ${routine.enabled ? 'on' : ''}`} role="switch" aria-checked={routine.enabled} aria-label={`${routine.enabled ? 'Pausar' : 'Ativar'} ${routine.name}`} disabled={busy}
        onClick={() => void post('/api/routines', {id: routine.id, name: routine.name, enabled: !routine.enabled, days: routine.days, time: routine.time, action: routine.action})}><i /></button>
      <div><strong>{routine.time} · {routine.name}</strong><span>{actionLabel(routine.action)} · {routine.days.length === 7 ? 'todo dia' : routine.days.map(d => DAYS[d]).join(' ')}{routine.next ? ` · próxima ${when(routine.next)}` : ''}</span></div>
      <button className="icon-btn" aria-label={`Editar ${routine.name}`} onClick={() => setEditing(routine)}><Pencil size={14} /></button>
      {confirm === routine.id ? <button className="link danger" onClick={() => { setConfirm(null); void post(`/api/routines/${routine.id}/remove`, {}, 'Rotina removida'); }}>Remover?</button>
        : <button className="icon-btn" aria-label={`Remover ${routine.name}`} onClick={() => setConfirm(routine.id)}><Trash2 size={14} /></button>}
    </li>)}</ul> : !editing ? <p className="loc-hint">Nenhuma rotina ainda. Exemplos: desligar o ar às 6h30 nos dias úteis, ou a cena Boa noite às 23h.</p> : null}
    {data?.log.length ? <details className="routine-log"><summary>Últimas execuções</summary><ul>{data.log.map((entry, index) => <li key={index} className={entry.ok ? 'ok' : 'fail'}><time>{when(entry.at)}</time>{entry.name} · {entry.message}</li>)}</ul></details> : null}
  </section>;
}

function EnergyCard({data, casa, reload}: {data: Energy | null; casa: Casa; reload: () => void}) {
  const [editing, setEditing] = useState(false);
  const [watts, setWatts] = useState('');
  const [tariff, setTariff] = useState('');
  useEffect(() => { if (data && !editing) { setWatts(String(data.config.watts)); setTariff(String(data.config.tariff).replace('.', ',')); } }, [data, editing]);
  if (!data) return null;
  const max = Math.max(1, ...data.week.map(d => d.hours));
  const save = async () => {
    const value = await casa.post('energy', '/api/energy', {watts: Number(watts), tariff: Number(tariff.replace(',', '.'))}, 'Valores do ar atualizados');
    if (value) { setEditing(false); reload(); }
  };
  return <section className="central-block" aria-labelledby="energy-title">
    <div className="central-head"><h3 id="energy-title"><Zap size={16} />Gasto do ar <small>estimado</small></h3><button className="link" onClick={() => setEditing(value => !value)}>{editing ? 'Fechar' : 'Ajustar'}</button></div>
    <div className="energy-stats">
      <div><span>Hoje</span><strong>{money(data.today.cost)}</strong><small>{hours(data.today.hours)} · {data.today.kwh.toLocaleString('pt-BR')} kWh</small></div>
      <div><span>Este mês</span><strong>{money(data.month.cost)}</strong><small>{hours(data.month.hours)} · {data.month.kwh.toLocaleString('pt-BR')} kWh</small></div>
    </div>
    <div className="energy-week" aria-label="Horas ligado nos últimos 7 dias">{data.week.map(d => <div key={d.date} title={`${d.date}: ${hours(d.hours)}`}><i style={{height: `${Math.max(4, (d.hours / max) * 100)}%`}} /><span>{new Date(`${d.date}T12:00`).toLocaleDateString('pt-BR', {weekday: 'narrow'})}</span></div>)}</div>
    {editing ? <div className="routine-row">
      <label className="loc-field"><span>Potência média (W)</span><input inputMode="numeric" value={watts} onChange={event => setWatts(event.target.value)} /></label>
      <label className="loc-field"><span>Tarifa (R$/kWh)</span><input inputMode="decimal" value={tariff} onChange={event => setTariff(event.target.value)} /></label>
      <button className="pill accent" disabled={!!casa.busy} onClick={() => void save()}><Check size={15} />Salvar</button>
    </div> : <p className="loc-hint">Conta pelas vezes que o painel ligou e desligou o ar ({data.config.watts} W · {money(data.config.tariff)}/kWh). Se usar o controle original, a estimativa erra.</p>}
  </section>;
}

/** "Desligar em…" do ar, direto na aba Clima: um timer de uma vez, executado pelo servidor. */
export function AcTimer({casa, on}: {casa: Casa; on: boolean}) {
  const [data, setData] = useState<Routines | null>(null);
  const [energy, setEnergy] = useState<Energy | null>(null);
  const load = useCallback(async () => {
    const [r, e] = await Promise.all([get<Routines>('/api/routines'), get<Energy>('/api/energy')]);
    if (r) setData(r);
    if (e) setEnergy(e);
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 20000); return () => clearInterval(timer); }, [load]);
  const timer = data?.timers[0];
  const set = async (minutes: number) => { const value = await casa.post('routines', '/api/routines/timer', {device: 'ar-quarto', minutes}, minutes ? `O ar desliga ${when(Math.floor(Date.now() / 1000) + minutes * 60)}` : 'Timer cancelado'); if (value) void load(); };
  return <div className="ac-timer">
    <div className="ac-timer-row" role="group" aria-label="Desligar o ar daqui a">
      <span><Power size={14} />Desligar em</span>
      {[30, 60, 120, 240].map(minutes => <button key={minutes} disabled={!on || !!casa.busy} onClick={() => void set(minutes)}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}</button>)}
    </div>
    {timer ? <p className="ac-timer-on">Desliga {when(timer.at)}<button className="link" onClick={() => void set(0)}>Cancelar</button></p> : null}
    {energy ? <p className="ac-energy"><Zap size={13} />Hoje {hours(energy.today.hours)} ligado · {money(energy.today.cost)} estimados · mês {money(energy.month.cost)}</p> : null}
  </div>;
}

export default function Central({casa}: {casa: Casa}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [routines, setRoutines] = useState<Routines | null>(null);
  const [energy, setEnergy] = useState<Energy | null>(null);
  const load = useCallback(async () => {
    const [h, r, e] = await Promise.all([get<Health>('/api/health'), get<Routines>('/api/routines'), get<Energy>('/api/energy')]);
    if (h) setHealth(h);
    if (r) setRoutines(r);
    if (e) setEnergy(e);
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 20000); return () => clearInterval(timer); }, [load]);
  return <section className="card central" aria-label="Central">
    <HealthCard health={health} />
    <RoutinesCard data={routines} casa={casa} reload={() => void load()} />
    <EnergyCard data={energy} casa={casa} reload={() => void load()} />
  </section>;
}
