import { fmtAgo } from '../../core/format.js';
import { Banner, Skeleton, Status } from '../../ui/kit.jsx';
import { CHECK, fmtUptime, healthLabel } from './central.js';

/** Saúde do sistema: resumo, memória/disco/tempo ligado e cada verificação com o detalhe do servidor. */
export function Health({ poll }) {
  const h = poll.data;
  const pc = h?.machine || {};
  const bad = h ? h.checks.filter((c) => c.state !== 'ok').length : 0;
  return (
    <section className="card col" aria-label="Saúde do sistema">
      <div className="row sp wrap"><h2 className="h2">Saúde do sistema</h2>{poll.at > 0 && <span className="sub">lido {fmtAgo(poll.at)}</span>}</div>
      {poll.stale && <Banner kind="warn" icon="off">Sem conexão para ler a saúde. Mostrando o último dado, {fmtAgo(poll.at)}.</Banner>}
      {!h && poll.error && <Banner kind="warn" icon="off">Não consegui ler a saúde: {poll.error.message}</Banner>}
      {!h && !poll.error && <div role="status" aria-label="Verificando"><Skeleton height={80} /></div>}
      {h && (
        <>
          <div className="row sp wrap">
            <b className="cen-big">{healthLabel(h.state)}</b>
            <Status kind={h.state === 'ok' ? 'ok' : h.state === 'fail' ? 'err' : 'warn'}>{bad ? `${bad} ${bad === 1 ? 'aviso' : 'avisos'}` : 'sem avisos'}</Status>
          </div>
          {pc.memory && (
            <div className="cen-stats">
              <div><span className="cap">Ligado há</span><b>{fmtUptime(pc.uptime)}</b></div>
              <div><span className="cap">Memória</span><b>{pc.memory.used}%{pc.memory.used >= 85 ? ' · alta' : ''}</b></div>
              {pc.disk && <div><span className="cap">Disco livre</span><b>{pc.disk.freeGb} GB</b></div>}
            </div>
          )}
          <ul className="list-plain">
            {h.checks.map((c) => {
              const [kind, text] = CHECK[c.state] ?? CHECK.warn;
              return <li key={c.id} className="row sp wrap cen-li"><div className="col tight grow"><b>{c.label}</b><span className="sub">{c.detail}</span></div><Status kind={kind}>{text}</Status></li>;
            })}
          </ul>
        </>
      )}
    </section>
  );
}
