import { useRef, useState } from 'react';
import { useHome, usePoll } from '../../core/hooks.js';
import { fmtAgo } from '../../core/format.js';
import { useAction } from '../../ui/actions.js';
import { Banner, Button, Confidence, Skeleton, Status } from '../../ui/kit.jsx';
import { energyInput, hours, money } from './central.js';

function Block({ label, b }) {
  return (
    <div className="col tight"><span className="cap">{label}</span><b className="cen-big">{money(b.cost)}</b><span className="sub mono num">{hours(b.hours)} · {b.kwh.toLocaleString('pt-BR')} kWh</span></div>
  );
}

function Adjust({ config, busy, blocked, reason, onSave }) {
  const [watts, setWatts] = useState(String(config.watts));
  const [tariff, setTariff] = useState(String(config.tariff).replace('.', ','));
  const [problem, setProblem] = useState('');
  return (
    <form className="col" onSubmit={(event) => { event.preventDefault(); const input = energyInput(watts, tariff); setProblem(input.problem || ''); if (input.body) onSave(input.body); }}>
      <label className="fld">Potência média (W)<input className="inp" type="number" inputMode="numeric" min="100" max="5000" value={watts} aria-invalid={problem ? 'true' : undefined} onChange={(event) => setWatts(event.target.value)} /></label>
      <label className="fld">Tarifa (R$/kWh)<input className="inp" type="text" inputMode="decimal" value={tariff} aria-invalid={problem ? 'true' : undefined} onChange={(event) => setTariff(event.target.value)} /></label>
      {problem && <p className="fld"><span className="err" role="alert">{problem}</span></p>}
      <Button variant="p" type="submit" busy={busy} disabled={blocked} reason={reason}>Salvar valores</Button>
    </form>
  );
}

/** Gasto do ar: SEMPRE estimativa (liga/desliga que o painel viu × potência × tarifa). Não há medidor elétrico. */
export function Energy({ blocked, reason }) {
  const { home } = useHome();
  const poll = usePoll('/api/energy', 20000);
  const [run, busy] = useAction();
  const [adjusting, setAdjusting] = useState(false);
  const lock = useRef(false);
  const e = poll.data;
  const preview = home?.mode === 'preview';
  if (!e) return <section className="card col" aria-label="Gasto do ar"><h2 className="h2">Gasto do ar</h2>{poll.error ? <Banner kind="warn" icon="off">Não consegui ler o gasto: {poll.error.message}</Banner> : <Skeleton height={100} />}</section>;
  const top = Math.max(1, ...e.week.map((d) => d.hours));
  const save = async (body) => {
    if (blocked || lock.current) return;
    lock.current = true;
    try { if (await run('/api/energy', body, 'Valores do ar atualizados.')) { setAdjusting(false); poll.reload(); } } finally { lock.current = false; }
  };
  return (
    <section className="card col" aria-label="Gasto do ar">
      <div className="row sp wrap"><h2 className="h2">Gasto do ar</h2><Confidence kind={preview ? 'preview' : 'estimated'} /></div>
      {poll.stale && <Banner kind="warn" icon="off">Mostrando o último dado, {fmtAgo(poll.at)}.</Banner>}
      <div className="grid two"><Block label="Hoje" b={e.today} /><Block label="Este mês" b={e.month} /></div>
      {e.on && e.onSince && <p className="sub"><Status kind="ok">Ar ligado desde {new Date(e.onSince * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Status></p>}
      <div role="img" aria-label={`Horas ligado nos últimos 7 dias: ${e.week.map((d) => `${d.date} ${hours(d.hours)}`).join(', ')}`} className="col tight">
        {e.week.map((d) => (
          <div key={d.date} className="cen-week" title={`${d.date}: ${hours(d.hours)}`}>
            <span className="cap">{new Date(`${d.date}T12:00`).toLocaleDateString('pt-BR', { weekday: 'narrow' })}</span>
            <div className="bar"><i style={{ width: `${Math.round((d.hours / top) * 100)}%` }} /></div>
            <span className="sub mono num">{hours(d.hours)}</span>
          </div>
        ))}
      </div>
      <div className="row sp wrap">
        <span className="cap">Potência e tarifa</span>
        <Button variant="s" aria-expanded={adjusting ? 'true' : 'false'} onClick={() => setAdjusting((v) => !v)}>{adjusting ? 'Fechar' : 'Ajustar'}</Button>
      </div>
      {adjusting
        ? <Adjust config={e.config} busy={busy} blocked={blocked} reason={reason} onSave={save} />
        : <p className="hint">Estimativa: conta pelas vezes que o painel ligou e desligou o ar ({e.config.watts} W · {money(e.config.tariff)}/kWh). Se usar o controle original, a estimativa erra. Não há medidor de energia.</p>}
    </section>
  );
}
