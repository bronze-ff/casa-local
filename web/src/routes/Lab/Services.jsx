import { Confidence, IconButton, Status } from '../../ui/kit.jsx';
import { Icon } from '../../ui/Icon.jsx';
import { countServices, serviceUrl } from './lab.js';

/** Serviços do home lab: estado lido do Docker, o que continua no modo jogo, reiniciar e link privado. */
export function Services({ s, blocked, reason, send, here }) {
  const services = s.services || [];
  const inGame = s.mode === 'jogo';
  const { running, total } = countServices(services);
  return (
    <section className="card col" aria-label="Serviços">
      <div className="row sp wrap"><h2 className="h2">Serviços</h2><span className="sub">{running} de {total} rodando · param no modo jogo</span></div>
      {s.wsl === false && <p className="hint" role="status">A máquina Linux (WSL) está desligada: os serviços aparecem parados.</p>}
      {!services.length && <p className="sub">O servidor não listou serviços.</p>}
      <ul className="list-plain lab-svc">
        {services.map((x) => {
          const url = serviceUrl(x, s.host, here);
          const on = x.state === 'running';
          const unknown = x.state === 'unknown';
          return (
            <li key={x.id} className="row sp wrap">
              <div className="col tight grow">
                <b>{x.name}</b>
                <span className="sub">{x.purpose}{!on && !unknown ? ' · parado' : unknown ? ' · estado desconhecido' : ''}{x.keep ? ' · continua no modo jogo' : ''}</span>
              </div>
              {unknown ? <Confidence kind="unknown" /> : <Status kind={on ? 'ok' : 'off'}>{on ? 'rodando' : 'parado'}</Status>}
              <span className="row">
                {(!inGame || x.keep) && <IconButton icon="refresh" label={`Reiniciar ${x.name}`} title={reason || 'Reiniciar'} disabled={blocked || !!s.step} onClick={() => send({ restart: x.id }, `Reiniciando ${x.name}`)} />}
                {url && <a className="ib" href={url} target="_blank" rel="noreferrer" aria-label={`Abrir ${x.name}`}><Icon name="ext" size={20} /></a>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hint">Serviços no WSL (Debian + Docker), mídia no HD D:. Fora de casa, abra pelo Tailscale. Os links são privados e só funcionam na sua rede.</p>
    </section>
  );
}
