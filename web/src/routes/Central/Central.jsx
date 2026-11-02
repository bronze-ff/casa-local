import { useHome, usePoll } from '../../core/hooks.js';
import { useShell } from '../../shell/context.js';
import { Banner, Skeleton } from '../../ui/kit.jsx';
import { fmtAgo } from '../../core/format.js';
import { Energy } from './Energy.jsx';
import { Health } from './Health.jsx';
import { Modes } from './Modes.jsx';
import { Notifications } from './Notifications.jsx';
import { Routines } from './Routines.jsx';
import { Shortcuts } from './Shortcuts.jsx';
import { SoundCard } from './SoundCard.jsx';
import { SECTIONS, summaryOf } from './central.js';

const goTo = (id) => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
};

/**
 * Central: saúde, avisos, modos, rotinas, energia, atalhos e som. Abrir só LÊ (GET). Cada leitura é compartilhada pelas seções
 * (um poll por caminho). Toda escrita é toque do usuário e fica bloqueada sem conexão com o painel.
 */
export default function Central() {
  const shell = useShell();
  const { home, homeAt, stateError } = useHome();
  const health = usePoll('/api/health', 20000);
  const notifications = usePoll('/api/notifications', 20000);
  const routines = usePoll('/api/routines', 20000);
  const location = usePoll('/api/location', 60000);
  if (!home) return <div className="col" role="status"><Skeleton height={28} width="30%" /><Skeleton height={240} /></div>;
  const reason = stateError ? 'Sem conexão com o painel.' : null;
  const blocked = !!reason;
  const modes = home.scenes || [];
  const summary = summaryOf(health.data, home.scenes);
  const climate = (home.devices || []).some((d) => d.kind === 'climate');
  return (
    <div className="col">
      {stateError && <Banner kind="warn" icon="off" title="Sem conexão com o PC de casa">Mostrando o último estado conhecido, {fmtAgo(homeAt)}. As alterações ficam bloqueadas.</Banner>}
      <section className="col" aria-label="Resumo da central">
        {summary.length > 0 && <dl className="cen-summary">{summary.map(([label, value]) => <div key={label}><dt className="cap">{label}</dt><dd>{value}</dd></div>)}</dl>}
        <nav className="row wrap" aria-label="Seções da central">
          {SECTIONS.map(([id, label]) => <button key={id} type="button" className="btn s" onClick={() => goTo(id)}>{label}</button>)}
        </nav>
      </section>
      <div className={`cen-grid ${shell?.layout || 'desktop'}`}>
        <div id="saude" className="cen-sec"><Health poll={health} /></div>
        <div id="avisos" className="cen-sec"><Notifications poll={notifications} blocked={blocked} reason={reason} /></div>
        <div id="modos" className="cen-sec"><Modes modes={modes} devices={home.devices} routines={routines.data?.routines} blocked={blocked} reason={reason} refresh={shell?.refresh} /></div>
        <div id="rotinas" className="cen-sec"><Routines poll={routines} modes={modes} places={location.data?.places || []} people={location.data?.people || []} climate={climate} blocked={blocked} reason={reason} /></div>
        <div id="energia" className="cen-sec"><Energy blocked={blocked} reason={reason} /></div>
        <div id="atalhos" className="cen-sec"><Shortcuts modes={modes} subscribe={notifications.data?.subscribe} blocked={blocked} reason={reason} /></div>
        <div id="som" className="cen-sec"><SoundCard /></div>
      </div>
    </div>
  );
}
