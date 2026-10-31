import { useState } from 'react';
import { useHome } from '../../App.jsx';
import { usePoll } from '../../api.js';
import { Card, Confidence, Dot, Key, PixelBar, Stale, Status, useAction } from '../../ui.jsx';

const money = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`);

function Block({ label, b }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="lbl">{label}</span>
      <Dot size={34}>{money(b.cost)}</Dot>
      <span className="small mono num">{hours(b.hours)} · {b.kwh.toLocaleString('pt-BR')} kWh</span>
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
      <Key center signal type="submit" disabled={busy}>Salvar</Key>
    </form>
  );
}

export default function Energy() {
  const { mode } = useHome();
  const poll = usePoll('/api/energy', 20000);
  const [adjusting, setAdjusting] = useState(false);
  const e = poll.data;
  const title = 'Gasto do ar';
  if (!e) return <Card title={title}>{poll.error ? <Stale poll={poll} what="o gasto" /> : <p className="muted">Lendo…</p>}</Card>;
  const top = Math.max(1, ...e.week.map((d) => d.hours));
  return (
    <Card title={title} aside={<Confidence kind={mode === 'preview' ? 'preview' : 'estimated'} />}>
      <Stale poll={poll} what="o gasto" />
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Block label="Hoje" b={e.today} />
        <Block label="Este mês" b={e.month} />
      </div>
      {e.on && e.onSince && <p className="small"><Status kind="ok">Ar ligado desde {new Date(e.onSince * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Status></p>}
      <div role="img" aria-label={`Horas ligado nos últimos 7 dias: ${e.week.map((d) => `${d.date} ${hours(d.hours)}`).join(', ')}`} className="stack" style={{ gap: 6 }}>
        {e.week.map((d) => (
          <div key={d.date} title={`${d.date}: ${hours(d.hours)}`} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 56px', gap: 8, alignItems: 'center' }}>
            <span className="lbl">{new Date(`${d.date}T12:00`).toLocaleDateString('pt-BR', { weekday: 'narrow' })}</span>
            <PixelBar small onBody steps={20} value={d.hours} max={top} />
            <span className="small mono num" style={{ textAlign: 'right' }}>{hours(d.hours)}</span>
          </div>
        ))}
      </div>
      <div className="row">
        <span className="lbl">potência e tarifa</span>
        <Key center aria-expanded={adjusting} onClick={() => setAdjusting((v) => !v)}>{adjusting ? 'Fechar' : 'Ajustar'}</Key>
      </div>
      {adjusting
        ? <Adjust config={e.config} onDone={() => { setAdjusting(false); poll.reload(); }} />
        : <p className="muted small">Estimativa: conta pelas vezes que o painel ligou e desligou o ar ({e.config.watts} W · {money(e.config.tariff)}/kWh). Se usar o controle original, a estimativa erra.</p>}
    </Card>
  );
}
