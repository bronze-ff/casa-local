import { fmtAgo } from '../../api.js';
import { Bar, Card } from '../../ui.jsx';
import Spark from './Spark.jsx';

function Gauge({ label, value, unit, pct, warn, sub }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="label">{label}</span>
      <span className="mono num" style={{ fontSize: 26, fontWeight: 500 }}>{value ?? '—'}<span className="muted" style={{ fontSize: 14 }}>{value == null ? '' : unit}</span></span>
      <Bar pct={pct} warn={warn} />
      {sub && <span className="muted small">{sub}</span>}
    </div>
  );
}

const gb = (mb) => Math.round(((mb ?? 0) / 1024) * 10) / 10;

export function MachineCard({ s }) {
  const st = s.stats || {};
  const gpu = st.gpu;
  const history = s.history || [];
  const col = (i) => history.map((p) => p[i]);
  const backup = s.backups;
  const old = backup?.last ? Date.now() / 1000 - backup.last > 129600 : false;
  return (
    <Card title="Máquina" aside={<span className="muted small">atualizado {s.checked ? fmtAgo(s.checked) : '—'}</span>}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        <Gauge label="CPU" value={st.cpu} unit="%" pct={st.cpu} warn={st.cpu >= 70} />
        <Gauge label="Memória" value={st.memory?.used} unit="%" pct={st.memory?.used} warn={st.memory?.used >= 80} sub={st.memory ? `de ${st.memory.totalGb} GB` : null} />
        <Gauge label="GPU" value={gpu?.temp} unit=" °C" pct={gpu?.temp} warn={gpu?.temp >= 75}
          sub={gpu ? `${gpu.use ?? 0}% de uso · ${gb(gpu.memUsed)}/${Math.round(gb(gpu.memTotal))} GB` : 'sem leitura'} />
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">WSL (VM)</span>
          <span className="mono num" style={{ fontSize: 26, fontWeight: 500 }}>{st.wslGb ?? '—'}<span className="muted" style={{ fontSize: 14 }}>{st.wslGb == null ? '' : ' GB'}</span></span>
          <span className="muted small">memória presa pela VM</span>
        </div>
      </div>

      {history.length > 1 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
          <Spark points={col(1)} max={100} label="CPU" unit="%" />
          <Spark points={col(2)} max={100} label="Memória" unit="%" />
          <Spark points={col(3)} max={95} label="GPU" unit=" °C" />
          <Spark points={col(4)} label="WSL" unit=" GB" />
        </div>
      )}

      {st.disks?.length > 0 && (
        <div className="stack">
          {st.disks.map((d) => (
            <div key={d.drive} className="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: 12 }}>
              <span>{d.drive}: {d.label}</span>
              <Bar pct={d.used} warn={d.used >= 85} />
              <span className="mono num small muted">{d.freeGb} GB livres</span>
            </div>
          ))}
        </div>
      )}

      {backup && (
        <div className="row" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="stack">
            <strong>Backup noturno</strong>
            <span className="muted small">
              {backup.last
                ? `Último ${fmtAgo(backup.last)} · ${backup.count} guardado${backup.count > 1 ? 's' : ''}${backup.sizeMb == null ? '' : ` · ${backup.sizeMb} MB`} no HD D:`
                : 'Ainda não rodou: sai às 04:30 para o HD D:'}
            </span>
          </div>
          <span className={`chip ${old || !backup.last ? 'hot' : ''}`}>{!backup.last ? 'sem backup' : old ? 'atrasado' : 'em dia'}</span>
        </div>
      )}
    </Card>
  );
}
