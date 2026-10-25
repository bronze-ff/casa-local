import { useState } from 'react';
import { usePoll } from '../../api.js';
import { Card, Stale, useAction } from '../../ui.jsx';

const money = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`);

function Block({ label, b }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="label">{label}</span>
      <strong className="mono num" style={{ fontSize: 24, fontWeight: 500 }}>{money(b.cost)}</strong>
      <span className="muted small mono num">{hours(b.hours)} · {b.kwh.toLocaleString('pt-BR')} kWh</span>
    </div>
  );
}

function Adjust({ config, onDone }) {
  const [watts, setWatts] = useState(String(config.watts));
  const [tariff, setTariff] = useState(String(config.tariff).replace('.', ','));
  const [run, busy] = useAction();
  const save = async (e) => {
    e.preventDefault();
    if (await run('/api/energy', { watts: Number(watts), tariff: Number(tariff.replace(',', '.')) }, 'Valores do ar atualizados')) onDone();
  };
  return (
    <form className="grid" style={{ alignItems: 'end' }} onSubmit={save}>
      <label className="field">Potência média (W)<input type="number" inputMode="numeric" min="100" max="5000" value={watts} onChange={(e) => setWatts(e.target.value)} /></label>
      <label className="field">Tarifa (R$/kWh)<input type="text" inputMode="decimal" value={tariff} onChange={(e) => setTariff(e.target.value)} /></label>
      <button type="submit" className="btn primary" disabled={busy}>Salvar</button>
    </form>
  );
}

export default function Energy() {
  const poll = usePoll('/api/energy', 20000);
  const [adjusting, setAdjusting] = useState(false);
  const e = poll.data;
  if (!e) return <Card title="Gasto do ar (estimado)">{poll.error ? <Stale poll={poll} what="o gasto" /> : <p className="muted">Lendo…</p>}</Card>;
  const top = Math.max(1, ...e.week.map((d) => d.hours));
  return (
    <Card title="Gasto do ar (estimado)" aside={<button type="button" className="btn ghost" onClick={() => setAdjusting((v) => !v)}>{adjusting ? 'Fechar' : 'Ajustar'}</button>}>
      <Stale poll={poll} what="o gasto" />
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Block label="Hoje" b={e.today} />
        <Block label="Este mês" b={e.month} />
      </div>
      {e.on && e.onSince && <p className="small"><span className="dot" style={{ display: 'inline-block', marginRight: 6 }} />Ar ligado desde {new Date(e.onSince * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
      <div role="img" aria-label={`Horas ligado nos últimos 7 dias: ${e.week.map((d) => `${d.date} ${hours(d.hours)}`).join(', ')}`}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90 }}>
        {e.week.map((d) => (
          <div key={d.date} title={`${d.date}: ${hours(d.hours)}`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%' }}>
            <i style={{ display: 'block', width: '100%', height: `${Math.max(4, (d.hours / top) * 70)}%`, borderRadius: 4, background: d.hours ? 'var(--info)' : 'var(--line)' }} />
            <span className="muted mono" style={{ fontSize: 11 }}>{new Date(`${d.date}T12:00`).toLocaleDateString('pt-BR', { weekday: 'narrow' })}</span>
          </div>
        ))}
      </div>
      {adjusting
        ? <Adjust config={e.config} onDone={() => { setAdjusting(false); poll.reload(); }} />
        : <p className="muted small">Conta pelas vezes que o painel ligou e desligou o ar ({e.config.watts} W · {money(e.config.tariff)}/kWh). Se usar o controle original, a estimativa erra.</p>}
    </Card>
  );
}
