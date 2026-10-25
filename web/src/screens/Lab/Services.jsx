import { Card, Icon } from '../../ui.jsx';

/* Mesma regra do painel antigo: 'path' e 'https' pelo nome do Tailscale (quando há), 'tls' e 'http' pelo endereço atual. */
export function serviceUrl(service, host) {
  const link = service.link;
  if (!link) return null;
  const here = window.location.hostname;
  if (link.kind === 'path') return `https://${host || here}${link.target}`;
  if (link.kind === 'https') return `https://${host || here}:${link.target}`;
  if (link.kind === 'tls') return `https://${here}:${link.target}`;
  return `http://${here}:${link.target}`;
}

export function ServicesCard({ s, disabled, send }) {
  const inGame = s.mode === 'jogo';
  const running = s.services.filter((x) => x.state === 'running').length;
  return (
    <Card title="Serviços" aside={<span className="mono num muted small">{running}/{s.services.length} rodando</span>}>
      <div className="stack">
        {s.services.map((x) => {
          const url = serviceUrl(x, s.host);
          const on = x.state === 'running';
          const unknown = x.state === 'unknown';
          return (
            <div key={x.id} className="row">
              <span className={`dot ${on ? '' : 'off'}`} title={on ? 'rodando' : unknown ? 'estado desconhecido' : 'parado'} />
              <div className="stack" style={{ flex: 1 }}>
                <strong>{x.name}</strong>
                <span className="muted small">
                  {x.purpose}{!on && !unknown ? ' · parado' : ''}
                </span>
              </div>
              {x.keep && <span className="chip" style={{ color: 'var(--info)', borderColor: '#24465A' }} title="Continua ligado no modo jogo">segue no jogo</span>}
              {(!inGame || x.keep) && (
                <button type="button" className="btn ghost" style={{ minWidth: 44, padding: 0 }} aria-label={`Reiniciar ${x.name}`} title="Reiniciar"
                  disabled={disabled || !!s.step} onClick={() => send({ restart: x.id }, `Reiniciando ${x.name}`)}>
                  <Icon name="refresh" size={18} />
                </button>
              )}
              {url && (
                <a className="btn ghost" style={{ minWidth: 44, padding: 0 }} href={url} target="_blank" rel="noreferrer" aria-label={`Abrir ${x.name}`}>
                  <Icon name="external" size={18} />
                </a>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted small">Serviços no WSL (Debian + Docker), mídia no HD D:. Fora de casa, abra pelo Tailscale.</p>
    </Card>
  );
}
