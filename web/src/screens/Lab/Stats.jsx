import { fmtAgo } from '../../api.js';
import { Card, Dot, Lcd, PixelBar, Spark, Status } from '../../ui.jsx';

const gb = (mb) => Math.round(((mb ?? 0) / 1024) * 10) / 10;

/** Linha do LCD: rótulo, número em Doto e (se houver histórico) sparkline de 24 h; `warn` pinta o número em sinal. */
function Reading({ label, value, unit = '', values, hi, warn }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row">
        <span className="lbl">{label}</span>
        <Dot size={20} style={warn ? { color: 'var(--lcd-sinal)' } : undefined}>{value == null ? '—' : `${value}${unit}`}</Dot>
      </div>
      {values?.length > 1 && <Spark values={values} hi={hi} />}
    </div>
  );
}

export function MachineCard({ s }) {
  const st = s.stats || {};
  const gpu = st.gpu;
  const history = s.history || [];
  const col = (i) => history.map((p) => p[i] ?? 0);
  const backup = s.backups;
  const old = backup?.last ? Date.now() / 1000 - backup.last > 129600 : false;
  return (
    <Card title="Máquina · 24 h" aside={<span className="lbl">atualizado {s.checked ? fmtAgo(s.checked) : '—'}</span>}>
      <Lcd className="stack">
        <Reading label="cpu" value={st.cpu} unit="%" values={col(1)} hi={70} warn={st.cpu >= 70} />
        <Reading label={`memória${st.memory ? ` · de ${st.memory.totalGb} GB` : ''}`} value={st.memory?.used} unit="%" values={col(2)} hi={80} warn={st.memory?.used >= 80} />
        <Reading label={gpu ? `gpu · ${gpu.use ?? 0}% uso · ${gb(gpu.memUsed)}/${Math.round(gb(gpu.memTotal))} GB` : 'gpu · sem leitura'} value={gpu?.temp == null ? gpu?.temp : Math.round(gpu.temp)} unit="°" values={col(3)} hi={75} warn={gpu?.temp >= 75} />
        <Reading label="wsl · memória presa" value={st.wslGb} unit="GB" values={col(4)} />
      </Lcd>

      {st.disks?.length > 0 && (
        <div className="stack">
          <span className="lbl">Discos</span>
          {st.disks.map((d) => (
            <div key={d.drive} className="stack" style={{ gap: 4 }}>
              <div className="row small"><span>{d.drive}: {d.label}</span><span>{d.freeGb} GB livres</span></div>
              <PixelBar small onBody steps={20} value={d.used} max={100} signal={d.used >= 85} />
            </div>
          ))}
        </div>
      )}

      {backup && (
        <div className="list">
          <div>
            <span>Backup noturno
              <small>
                {backup.last
                  ? `Último ${fmtAgo(backup.last)} · ${backup.count} guardado${backup.count > 1 ? 's' : ''}${backup.sizeMb == null ? '' : ` · ${backup.sizeMb} MB`} no HD D:`
                  : 'Ainda não rodou: sai às 04:30 para o HD D:'}
              </small>
            </span>
            <Status kind={!backup.last ? 'fail' : old ? 'warn' : 'ok'}>{!backup.last ? 'sem backup' : old ? 'atrasado' : 'ok'}</Status>
          </div>
        </div>
      )}
    </Card>
  );
}
