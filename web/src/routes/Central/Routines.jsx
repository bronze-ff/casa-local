import { useRef, useState } from 'react';
import { fmtAgo } from '../../core/format.js';
import { useAction } from '../../ui/actions.js';
import { Banner, Button, Empty, IconButton, Segmented, Skeleton, Switch } from '../../ui/kit.jsx';
import { Overlay } from '../../ui/Overlay.jsx';
import { DAYS, SINGLE, TIMER_MINUTES, actionKey, actionLabel, actionOf, dayMarks, placeText, routineBody, routineProblems, toggleBody, whenText } from './central.js';

const FORM = 'form-rotina';

/** Linha do dia: SÓ rotinas por horário; a posição é a hora marcada, nada além. */
export function DayLine({ routines }) {
  const marks = dayMarks(routines);
  if (!marks.length) return null;
  return (
    <div className="col tight">
      <div className="dayline" role="img" aria-label={`Rotinas por horário: ${marks.map((m) => `${m.time} ${m.name}${m.enabled ? '' : ' (pausada)'}`).join(', ')}`}>
        {marks.map((m) => <span key={m.id} className="mark" style={{ left: `${m.pct}%`, opacity: m.enabled ? 1 : 0.35 }} />)}
      </div>
      <div className="row sp sub" aria-hidden="true"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>
    </div>
  );
}

function RoutineForm({ initial, modes, places, people, onSave }) {
  const isPlace = initial?.trigger === 'place';
  const [name, setName] = useState(initial?.name ?? '');
  const [trigger, setTrigger] = useState(initial?.trigger ?? 'time');
  const [time, setTime] = useState(initial?.trigger === 'time' ? initial.time : '07:00');
  const [place, setPlace] = useState(isPlace ? initial.place : places[0]?.id ?? '');
  const [event, setEvent] = useState(isPlace ? initial.event : 'saiu');
  const [between, setBetween] = useState(isPlace ? initial.between ?? null : null);
  const [person, setPerson] = useState(isPlace ? initial.person ?? '' : '');
  const [days, setDays] = useState(initial?.days ?? [0, 1, 2, 3, 4]);
  const [pick, setPick] = useState(initial ? actionKey(initial.action) : modes[0] ? `modo:${modes[0].id}` : 'ar-off');
  const [tried, setTried] = useState(false);
  const form = { name, trigger, time, place, event, between, person, days, action: actionOf(pick, initial) };
  const problems = routineProblems(form);
  return (
    <form id={FORM} className="col" onSubmit={(e) => { e.preventDefault(); setTried(true); if (!problems.length) onSave(routineBody(form, initial)); }}>
      <label className="fld">Nome<input className="inp" type="text" value={name} maxLength={40} placeholder={trigger === 'time' ? 'Ex.: Desligar o ar de manhã' : 'Ex.: Saindo da academia'} aria-invalid={tried && !name.trim() ? 'true' : undefined} onChange={(e) => setName(e.target.value)} /></label>
      <Segmented label="Quando" value={trigger} onChange={setTrigger} options={[{ value: 'time', label: 'Num horário' }, { value: 'place', label: 'Num lugar' }]} />
      {trigger === 'time' ? (
        <label className="fld">Horário<input className="inp" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      ) : places.length ? (
        <>
          <label className="fld">Quem<select className="inp" value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Qualquer pessoa</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="fld">Evento<select className="inp" value={event} onChange={(e) => setEvent(e.target.value)}><option value="saiu">sair de</option><option value="chegou">chegar em</option></select></label>
          <label className="fld">Lugar<select className="inp" value={place} onChange={(e) => setPlace(e.target.value)}>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="cen-check"><input type="checkbox" checked={!!between} onChange={(e) => setBetween(e.target.checked ? ['17:00', '21:00'] : null)} />Só numa faixa de horário (fora dela a rotina não roda)</label>
          {between && <div className="grid two"><label className="fld">De<input className="inp" type="time" value={between[0]} onChange={(e) => setBetween([e.target.value, between[1]])} /></label><label className="fld">Até<input className="inp" type="time" value={between[1]} onChange={(e) => setBetween([between[0], e.target.value])} /></label></div>}
        </>
      ) : <p className="sub">Cadastre lugares (academia, serviço, casa) na tela Local para usar a chegada ou a saída como gatilho.</p>}
      <label className="fld">Fazer
        <select className="inp" value={pick} onChange={(e) => setPick(e.target.value)}>
          {initial && actionKey(initial.action) === 'atual' && <option value="atual">Ação atual (mantida)</option>}
          {modes.length > 0 && <optgroup label="Modos">{modes.map((m) => <option key={m.id} value={`modo:${m.id}`}>Modo {m.name}</option>)}</optgroup>}
          <optgroup label="Ações avulsas">{SINGLE.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</optgroup>
        </select>
      </label>
      <div className="col tight" role="group" aria-label="Dias da semana">
        <div className="row wrap">{DAYS.map((d, i) => { const on = days.includes(i); return <button key={d} type="button" className="chip" aria-pressed={on ? 'true' : 'false'} onClick={() => setDays((old) => (on ? old.filter((x) => x !== i) : [...old, i].sort()))}>{d}</button>; })}</div>
      </div>
      {tried && problems.length > 0 && <p className="fld"><span className="err" role="alert">{problems.join(' ')}</span></p>}
    </form>
  );
}

/** Rotinas e timer do ar. Cria, edita, pausa e remove só por toque; o histórico mostra o que realmente rodou. */
export function Routines({ poll, modes, places, people, climate, blocked, reason }) {
  const [run, busy] = useAction();
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const lock = useRef(false);
  const d = poll.data;
  const off = busy || blocked;
  const post = async (path, body, ok) => {
    if (blocked || lock.current) return null;
    lock.current = true;
    try { const r = await run(path, body, ok); if (r) poll.reload(); return r; } finally { lock.current = false; }
  };
  const timer = d?.timers?.[0];
  const setTimer = (minutes) => post('/api/routines/timer', { device: 'ar-quarto', minutes }, minutes ? 'Timer do ar ligado.' : 'Timer cancelado.');
  return (
    <section className="card col" aria-label="Rotinas">
      <div className="row sp wrap">
        <h2 className="h2">Rotinas</h2>
        <Button variant="s" icon="plus" disabled={blocked || !d} reason={reason || 'Leia as rotinas primeiro.'} onClick={() => setEditing('new')}>Nova rotina</Button>
      </div>
      {poll.stale && <Banner kind="warn" icon="off">Sem conexão para ler as rotinas. Mostrando o último dado, {fmtAgo(poll.at)}.</Banner>}
      {!d && poll.error && <Banner kind="warn" icon="off">Não consegui ler as rotinas: {poll.error.message}</Banner>}
      {!d && !poll.error && <div role="status" aria-label="Lendo as rotinas"><Skeleton height={100} /></div>}
      {d?.lastError && <Banner kind="err" icon="alert" title="Falha do agendador">Última falha {d.lastErrorAt ? fmtAgo(d.lastErrorAt) : ''}: {d.lastError}</Banner>}
      {d && (
        <>
          <div className="row sp wrap cen-li">
            <div className="col tight grow"><b>Desligar o ar daqui a</b><span className="sub">{timer ? `Desliga ${whenText(timer.at)}` : 'Nenhum timer ligado.'}</span></div>
            <span className="row wrap">
              {TIMER_MINUTES.map((m) => <Button key={m} variant="s" disabled={off || !climate} reason={reason || 'O servidor não listou o ar.'} onClick={() => setTimer(m)}>{m < 60 ? `${m} min` : `${m / 60} h`}</Button>)}
              {timer && <Button variant="s" disabled={off} reason={reason} onClick={() => setTimer(0)}>Cancelar timer</Button>}
            </span>
          </div>
          <DayLine routines={d.routines} />
          {!d.routines.length && <Empty title="Nenhuma rotina ainda">Exemplos: o modo Boa noite às 23h, ou o modo Cheguei ao sair da academia.</Empty>}
          <ul className="list-plain">
            {d.routines.map((r) => (
              <li key={r.id} className="col cen-li" style={{ opacity: r.enabled ? 1 : 0.7 }}>
                <div className="row sp wrap">
                  <Switch on={r.enabled} label={`${r.enabled ? 'Pausar' : 'Ativar'} ${r.name}`} disabled={off} onChange={() => post('/api/routines', toggleBody(r))} />
                  <div className="col tight grow">
                    <b>{r.trigger === 'time' ? <span className="mono num">{r.time} · </span> : null}{r.name}{!r.enabled && ' (pausada)'}</b>
                    <span className="sub">{actionLabel(r.action, modes)} · {r.trigger === 'place' ? `${placeText(r, places, people)} · ` : ''}{r.days.length === 7 ? 'todo dia' : r.days.map((x) => DAYS[x]).join(' ')}{r.next ? ` · próxima ${whenText(r.next)}` : ''}</span>
                  </div>
                  <Button variant="s" icon="edit" aria-label={`Editar ${r.name}`} disabled={blocked} reason={reason} onClick={() => setEditing(r)}>Editar</Button>
                  {removing !== r.id && <IconButton icon="trash" label={`Remover ${r.name}`} disabled={blocked} onClick={() => setRemoving(r.id)} />}
                </div>
                {removing === r.id && <Banner kind="err" icon="alert" title="Remover esta rotina?" action={<span className="row"><Button variant="p" busy={busy} disabled={blocked} reason={reason} onClick={async () => { setRemoving(null); await post(`/api/routines/${r.id}/remove`, {}, 'Rotina removida.'); }}>Remover mesmo</Button><Button variant="s" onClick={() => setRemoving(null)}>Não</Button></span>}>Ela deixa de rodar e não dá para desfazer.</Banner>}
              </li>
            ))}
          </ul>
          {d.log?.length > 0 && (
            <details>
              <summary className="cen-sum">Últimas execuções</summary>
              <ul className="list-plain">{d.log.map((l, i) => <li key={`${l.at}-${i}`} className="row cen-log"><span className="mono num sub">{whenText(l.at)}</span><span className={l.ok ? '' : 'cen-fail'}>{l.ok ? '' : 'Falhou · '}{l.name} · {l.message}</span></li>)}</ul>
            </details>
          )}
        </>
      )}
      <Overlay open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nova rotina' : 'Editar rotina'} kind="panel"
        footer={<><Button variant="s" onClick={() => setEditing(null)}>Cancelar</Button><Button variant="p" type="submit" form={FORM} busy={busy} disabled={blocked} reason={reason}>Salvar rotina</Button></>}>
        {editing && <RoutineForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} modes={modes} places={places} people={people} onSave={async (body) => { if (await post('/api/routines', body, 'Rotina salva.')) setEditing(null); }} />}
      </Overlay>
    </section>
  );
}
