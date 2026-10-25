import { useState } from 'react';
import { useHome } from '../../App.jsx';
import { fmtAgo, usePoll } from '../../api.js';
import { Card, Icon, Modal, Segmented, Stale, Switch, useAction } from '../../ui.jsx';

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
// Ações avulsas aceitas pelo backend (luz e ar); o resto é modo.
const SINGLE = [
  ['ar-off', 'Desligar o ar', { type: 'device', device: 'ar-quarto', values: { power: false } }],
  ['ar-on', 'Ligar o ar · 24 °C resfriar', { type: 'device', device: 'ar-quarto', values: { power: true, temperature: 24, mode: 'cool', fan: 'auto' } }],
  ['ar-22', 'Ligar o ar · 22 °C resfriar', { type: 'device', device: 'ar-quarto', values: { power: true, temperature: 22, mode: 'cool', fan: 'auto' } }],
  ['quarto-on', 'Acender luz do quarto', { type: 'device', device: 'quarto-luz', values: { power: true } }],
  ['quarto-off', 'Apagar luz do quarto', { type: 'device', device: 'quarto-luz', values: { power: false } }],
  ['banheiro-off', 'Apagar luz do banheiro', { type: 'device', device: 'banheiro-luz', values: { power: false } }],
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const actionKey = (a) => (a.type === 'scene' ? `modo:${a.id}` : SINGLE.find(([, , v]) => same(v, a))?.[0] ?? 'atual');
const actionLabel = (a, modes) => (a.type === 'scene' ? `Modo ${modes.find((m) => m.id === a.id)?.name ?? '(apagado)'}` : SINGLE.find(([, , v]) => same(v, a))?.[1] ?? 'Ação personalizada');

const when = (sec) => {
  const t = new Date(sec * 1000);
  const hm = t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  if (t.toDateString() === now.toDateString()) return `hoje ${hm}`;
  if (t.toDateString() === new Date(now.getTime() + 864e5).toDateString()) return `amanhã ${hm}`;
  return `${t.toLocaleDateString('pt-BR', { weekday: 'short' })} ${hm}`;
};

function placeText(r, places, people) {
  const place = places.find((p) => p.id === r.place)?.name ?? 'lugar apagado';
  const who = r.person ? people.find((p) => p.id === r.person)?.name ?? 'pessoa removida' : 'alguém';
  return `${who} ${r.event === 'chegou' ? 'chegar em' : 'sair de'} ${place}${r.between ? ` (${r.between[0]}–${r.between[1]})` : ''}`;
}

function RoutineForm({ initial, modes, places, people, busy, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [trigger, setTrigger] = useState(initial?.trigger ?? 'time');
  const [time, setTime] = useState(initial?.trigger === 'time' ? initial.time : '07:00');
  const [place, setPlace] = useState(initial?.trigger === 'place' ? initial.place : places[0]?.id ?? '');
  const [event, setEvent] = useState(initial?.trigger === 'place' ? initial.event : 'saiu');
  const [between, setBetween] = useState(initial?.trigger === 'place' ? initial.between ?? null : null);
  const [person, setPerson] = useState(initial?.trigger === 'place' ? initial.person ?? '' : '');
  const [days, setDays] = useState(initial?.days ?? [0, 1, 2, 3, 4]);
  const [pick, setPick] = useState(initial ? actionKey(initial.action) : modes[0] ? `modo:${modes[0].id}` : 'ar-off');
  const action = pick.startsWith('modo:') ? { type: 'scene', id: pick.slice(5) } : pick === 'atual' ? initial.action : SINGLE.find(([k]) => k === pick)?.[2];
  const hhmm = (v) => /^\d{2}:\d{2}$/.test(v);
  const whenOk = trigger === 'time' ? hhmm(time) : !!place && (!between || (hhmm(between[0]) && hhmm(between[1]) && between[0] !== between[1]));
  const valid = name.trim() && days.length && whenOk && action;

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      ...(initial ? { id: initial.id, enabled: initial.enabled } : {}), name: name.trim(), days, action,
      ...(trigger === 'time' ? { trigger, time } : { trigger, place, event, between, person: person || null }),
    });
  };

  return (
    <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
      <label className="field">Nome
        <input type="text" value={name} maxLength={40} placeholder={trigger === 'time' ? 'Ex.: Desligar o ar de manhã' : 'Ex.: Saindo da academia'} onChange={(e) => setName(e.target.value)} />
      </label>
      <Segmented label="Quando" value={trigger} onChange={setTrigger} options={[['time', 'Num horário'], ['place', 'Num lugar']]} />
      {trigger === 'time' ? (
        <label className="field">Horário<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      ) : places.length ? (
        <>
          <label className="field">Quem
            <select value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Qualquer pessoa</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">Quando
            <select value={event} onChange={(e) => setEvent(e.target.value)}><option value="saiu">sair de</option><option value="chegou">chegar em</option></select>
          </label>
          <label className="field">Lugar
            <select value={place} onChange={(e) => setPlace(e.target.value)}>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" style={{ width: 22, height: 22 }} checked={!!between} onChange={(e) => setBetween(e.target.checked ? ['17:00', '21:00'] : null)} />
            <span className="small">Só numa faixa de horário (fora dela a rotina não roda)</span>
          </label>
          {between && (
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="field">De<input type="time" value={between[0]} onChange={(e) => setBetween([e.target.value, between[1]])} /></label>
              <label className="field">Até<input type="time" value={between[1]} onChange={(e) => setBetween([between[0], e.target.value])} /></label>
            </div>
          )}
        </>
      ) : (
        <p className="muted small">Cadastre lugares (academia, serviço, casa) na aba Local para usar a chegada ou a saída como gatilho.</p>
      )}
      <label className="field">Fazer
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          {initial && actionKey(initial.action) === 'atual' && <option value="atual">Ação atual (mantida)</option>}
          {modes.length > 0 && <optgroup label="Modos">{modes.map((m) => <option key={m.id} value={`modo:${m.id}`}>Modo {m.name}</option>)}</optgroup>}
          <optgroup label="Ações avulsas">{SINGLE.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</optgroup>
        </select>
      </label>
      <div role="group" aria-label="Dias da semana" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {DAYS.map((d, i) => {
          const on = days.includes(i);
          return <button key={d} type="button" aria-pressed={on} className={`chip ${on ? 'hot' : ''}`} style={{ minHeight: 44, minWidth: 48, fontSize: 14 }}
            onClick={() => setDays((old) => (on ? old.filter((x) => x !== i) : [...old, i].sort()))}>{d}</button>;
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={!valid || busy}>Salvar rotina</button>
      </div>
    </form>
  );
}

export default function Routines() {
  const { home } = useHome();
  const poll = usePoll('/api/routines', 20000);
  const loc = usePoll('/api/location', 60000);
  const [run, busy] = useAction();
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const d = poll.data;
  const modes = home?.scenes ?? [];
  const places = loc.data?.places ?? [];
  const people = loc.data?.people ?? [];

  const post = async (path, body, ok) => { const r = await run(path, body, ok); if (r) poll.reload(); return r; };
  // O status traz "next" (só leitura); o backend recusa campos que não conhece.
  const toggle = (r) => { const { next, ...rest } = r; return post('/api/routines', { ...rest, enabled: !r.enabled }); };
  const timer = d?.timers?.[0];
  const setTimer = (minutes) => post('/api/routines/timer', { device: 'ar-quarto', minutes }, minutes ? 'Timer do ar ligado' : 'Timer cancelado');

  return (
    <Card title="Rotinas" aside={<button type="button" className="btn" onClick={() => setEditing('new')}><Icon name="plus" size={18} />Nova</button>}>
      <Stale poll={poll} what="as rotinas" />
      {!d && !poll.error && <p className="muted" role="status">Lendo…</p>}
      {d?.lastError && (
        <div className="notice" role="status">
          <Icon name="warn" size={18} style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
          <span>Última falha do agendador {d.lastErrorAt ? fmtAgo(d.lastErrorAt) : ''}: {d.lastError}</span>
        </div>
      )}

      {d && (
        <div className="stack">
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="stack" style={{ flex: '1 1 160px' }}>
              <strong>Desligar o ar daqui a</strong>
              <span className="muted small">{timer ? `Desliga ${when(timer.at)}` : 'Nenhum timer ligado.'}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[30, 60, 120, 240].map((m) => <button key={m} type="button" className="btn" disabled={busy} onClick={() => setTimer(m)}>{m < 60 ? `${m} min` : `${m / 60} h`}</button>)}
              {timer && <button type="button" className="btn ghost" disabled={busy} onClick={() => setTimer(0)}>Cancelar</button>}
            </div>
          </div>

          {!d.routines.length && <p className="muted small" style={{ padding: '12px 0' }}>Nenhuma rotina ainda. Exemplos: o modo Boa noite às 23h, ou o modo Cheguei ao sair da academia.</p>}
          {d.routines.map((r) => (
            <div key={r.id} className="row" style={{ flexWrap: 'wrap', opacity: r.enabled ? 1 : 0.6 }}>
              <Switch on={r.enabled} label={`${r.enabled ? 'Pausar' : 'Ativar'} ${r.name}`} disabled={busy} onChange={() => toggle(r)} />
              <div className="stack" style={{ flex: '1 1 180px' }}>
                <strong>{r.trigger === 'time' ? <span className="mono num">{r.time} · </span> : null}{r.name}</strong>
                <span className="muted small">
                  {actionLabel(r.action, modes)} · {r.trigger === 'place' ? `${placeText(r, places, people)} · ` : ''}
                  {r.days.length === 7 ? 'todo dia' : r.days.map((x) => DAYS[x]).join(' ')}{r.next ? ` · próxima ${when(r.next)}` : ''}
                </span>
              </div>
              <button type="button" className="btn ghost" aria-label={`Editar ${r.name}`} onClick={() => setEditing(r)}>Editar</button>
              {removing === r.id ? (
                <>
                  <button type="button" className="btn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} disabled={busy}
                    onClick={() => { setRemoving(null); post(`/api/routines/${r.id}/remove`, {}, 'Rotina removida'); }}>Remover mesmo</button>
                  <button type="button" className="btn ghost" onClick={() => setRemoving(null)}>Não</button>
                </>
              ) : (
                <button type="button" className="btn ghost" style={{ minWidth: 44, padding: 0 }} aria-label={`Remover ${r.name}`} onClick={() => setRemoving(r.id)}><Icon name="close" size={18} /></button>
              )}
            </div>
          ))}

          {d.log?.length > 0 && (
            <details>
              <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Últimas execuções</summary>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {d.log.map((l, i) => (
                  <li key={i} className="row small">
                    <span className="mono num muted" style={{ flex: 'none' }}>{when(l.at)}</span>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', color: l.ok ? undefined : 'var(--danger)' }}>{l.name} · {l.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nova rotina' : 'Editar rotina'}>
        {editing && (
          <RoutineForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} modes={modes} places={places} people={people} busy={busy}
            onCancel={() => setEditing(null)} onSave={async (body) => { if (await post('/api/routines', body, 'Rotina salva')) setEditing(null); }} />
        )}
      </Modal>
    </Card>
  );
}
