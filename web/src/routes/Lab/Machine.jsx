import { fmtAgo } from '../../core/format.js';
import { Status } from '../../ui/kit.jsx';
import { backupState, gb, historySpan, readingIsOld, sparkOf } from './lab.js';

/** Uma leitura do computador: valor atual (— se o servidor não leu), aviso em texto e linha do histórico REAL do servidor. */
function Reading({ label, detail, value, unit, history, series, hi, high }) {
  const points = sparkOf(history, series, hi);
  const span = historySpan(history, series);
  return (
    <div className="lab-read">
      <div className="row sp"><span className="cap">{label}</span><span className="num">{value == null ? '—' : <>{value}<span className="u">{unit}</span></>}</span></div>
      {detail && <span className="sub">{detail}</span>}
      {high && <span className="st warn"><i className="dot" aria-hidden="true" />alto</span>}
      {points
        ? <svg viewBox="0 0 120 32" className="spark" role="img" aria-label={`${label}: histórico de ${span}`}><polyline points={points} /></svg>
        : <span className="hint">sem histórico suficiente</span>}
      {span && <span className="hint">últimas {span}</span>}
    </div>
  );
}

/** CPU, memória, GPU, WSL, discos e backup. Valor ausente fica como — (nunca zero); a idade da leitura sempre aparece. */
export function Machine({ s, now = Date.now() }) {
  const st = s.stats || {};
  const gpu = st.gpu;
  const old = readingIsOld(s.checked, now);
  const backup = backupState(s.backups, now);
  const history = s.history;
  return (
    <section className="card col" aria-label="Máquina">
      <div className="row sp wrap">
        <h2 className="h2">Máquina</h2>
        <span className="sub">{s.checked ? `lido ${fmtAgo(s.checked, now)}` : 'sem leitura ainda'}</span>
      </div>
      {old && <p className="hint" role="status">A leitura está antiga: o monitor do PC pode estar parado. Os números abaixo são os últimos conhecidos.</p>}
      <div className="lab-reads">
        <Reading label="CPU" value={st.cpu} unit="%" history={history} series="cpu" hi={100} high={st.cpu >= 70} />
        <Reading label="Memória" detail={st.memory ? `de ${st.memory.totalGb} GB` : undefined} value={st.memory?.used} unit="%" history={history} series="mem" hi={100} high={st.memory?.used >= 80} />
        <Reading label="GPU · temperatura" detail={gpu ? `${gpu.use ?? '—'}% de uso · ${gb(gpu.memUsed) ?? '—'} de ${gb(gpu.memTotal) ?? '—'} GB` : 'sem leitura da GPU'}
          value={gpu?.temp == null ? null : Math.round(gpu.temp)} unit="°" history={history} series="gpu" hi={100} high={gpu?.temp >= 75} />
        <Reading label="WSL · memória presa" value={st.wslGb} unit=" GB" history={history} series="wsl" />
      </div>
      {st.disks?.length > 0 && (
        <div className="col">
          <h3 className="cap">Discos</h3>
          {st.disks.map((d) => (
            <div key={d.drive} className="col tight">
              <div className="row sp small"><span>{d.drive}: {d.label}</span><span>{d.freeGb} GB livres · {d.used}% usado</span></div>
              <div className={`bar ${d.used >= 85 ? 'hot' : ''}`} role="meter" aria-label={`Disco ${d.drive}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.used}><i style={{ width: `${Math.max(0, Math.min(100, d.used))}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      {backup && (
        <div className="row sp wrap">
          <div className="col tight">
            <b>Backup noturno</b>
            <span className="sub">{s.backups.last
              ? `Último ${fmtAgo(s.backups.last, now)} · ${s.backups.count} guardado${s.backups.count > 1 ? 's' : ''}${s.backups.sizeMb == null ? '' : ` · ${s.backups.sizeMb} MB`} no HD D:`
              : 'Ainda não rodou: sai às 04:30 para o HD D:'}</span>
          </div>
          <Status kind={backup.kind === 'ok' ? 'ok' : backup.kind === 'warn' ? 'warn' : 'err'}>{backup.label}</Status>
        </div>
      )}
    </section>
  );
}
