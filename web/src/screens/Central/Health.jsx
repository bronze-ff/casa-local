import { usePoll } from '../../api.js';
import { Card, Stale } from '../../ui.jsx';

const TITLE = { ok: 'Tudo funcionando', warn: 'Funcionando, com avisos', fail: 'Algo parou' };
const dotStyle = (state) => (state === 'fail' ? { background: 'var(--danger)' } : undefined);

function fmtUptime(seconds) {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return d ? `${d} d ${h} h` : `${h} h ${Math.floor((seconds % 3600) / 60)} min`;
}

export default function Health() {
  const poll = usePoll('/api/health', 20000);
  const h = poll.data;
  const pc = h?.machine || {};
  return (
    <Card title="Saúde do sistema" aside={h && <span className="pill"><span className={`dot ${h.state === 'warn' ? 'warn' : ''}`} style={dotStyle(h.state)} />{TITLE[h.state] || h.state}</span>}>
      <Stale poll={poll} what="a saúde" />
      {!h && !poll.error && <p className="muted" role="status">Verificando…</p>}
      {h && (
        <>
          {pc.memory && (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))', gap: 12 }}>
              <div className="stack"><span className="label">Ligado há</span><span className="mono num">{fmtUptime(pc.uptime)}</span></div>
              <div className="stack"><span className="label">Memória</span><span className="mono num">{pc.memory.used}%</span></div>
              {pc.disk && <div className="stack"><span className="label">Disco livre</span><span className="mono num">{pc.disk.freeGb} GB</span></div>}
            </div>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {h.checks.map((c) => (
              <li key={c.id} className="row" style={{ alignItems: 'flex-start' }}>
                <span className={`dot ${c.state === 'warn' ? 'warn' : ''}`} style={{ marginTop: 6, ...dotStyle(c.state) }} aria-hidden="true" />
                <div className="stack" style={{ flex: 1 }}>
                  <strong>{c.label}</strong>
                  <span className="muted small">{c.detail}</span>
                </div>
                <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{c.state === 'ok' ? 'ok' : c.state === 'warn' ? 'aviso' : 'falha'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
