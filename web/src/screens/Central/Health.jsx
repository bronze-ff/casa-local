import { usePoll } from '../../api.js';
import { Card, Dot, Lcd, Stale, Status } from '../../ui.jsx';

const TITLE = { ok: 'Tudo funcionando', warn: 'Funcionando, com avisos', fail: 'Algo parou' };
const LED = { ok: '', warn: 'env', fail: 'off' };
const CF = { ok: ['ok', 'ok'], warn: ['warn', 'Aviso'], fail: ['fail', 'Falha'] };

function fmtUptime(seconds) {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return d ? `${d}D${h}H` : `${h}H${Math.floor((seconds % 3600) / 60)}M`;
}

export default function Health() {
  const poll = usePoll('/api/health', 20000);
  const h = poll.data;
  const pc = h?.machine || {};
  const avisos = h ? h.checks.filter((c) => c.state !== 'ok').length : 0;
  return (
    <Card title="Saúde do sistema">
      <Stale poll={poll} what="a saúde" />
      {!h && !poll.error && <p className="muted" role="status">Verificando…</p>}
      {h && (
        <>
          <Lcd className="stack">
            <div className="row">
              <span className="lbl">saúde do sistema</span>
              <span className={`led ${LED[h.state] ?? 'env'}`}>{avisos ? `${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}` : 'ok'}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{TITLE[h.state] || h.state}</div>
            {pc.memory && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <div><span className="lbl">ligado há</span><div><Dot size={20}>{fmtUptime(pc.uptime)}</Dot></div></div>
                <div><span className="lbl">memória</span><div><Dot size={20} style={pc.memory.used >= 85 ? { color: 'var(--lcd-sinal)' } : undefined}>{pc.memory.used}%</Dot></div></div>
                {pc.disk && <div><span className="lbl">disco livre</span><div><Dot size={20}>{pc.disk.freeGb}GB</Dot></div></div>}
              </div>
            )}
          </Lcd>
          <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {h.checks.map((c) => (
              <li key={c.id}>
                <div>
                  <span>{c.label}<small>{c.detail}</small></span>
                  <Status kind={(CF[c.state] ?? CF.warn)[0]}>{(CF[c.state] ?? CF.warn)[1]}</Status>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
