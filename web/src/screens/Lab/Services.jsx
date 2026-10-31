import { Card, Confidence, Icon, Key, Status } from '../../ui.jsx';

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
    <Card title="Serviços · param no modo jogo" aside={<span className="lbl">{running}/{s.services.length} rodando</span>}>
      <div className="list">
        {s.services.map((x) => {
          const url = serviceUrl(x, s.host);
          const on = x.state === 'running';
          const unknown = x.state === 'unknown';
          return (
            <div key={x.id}>
              <span>{x.name}
                <small>{x.purpose}{!on && !unknown ? ' · parado' : unknown ? ' · estado desconhecido' : ''}{x.keep ? ' · continua no modo jogo' : ''}</small>
              </span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {unknown ? <Confidence kind="unknown" /> : <Status kind={on ? 'ok' : 'off'}>{on ? 'rodando' : 'parado'}</Status>}
                {(!inGame || x.keep) && (
                  <Key center aria-label={`Reiniciar ${x.name}`} title="Reiniciar" disabled={disabled || !!s.step}
                    onClick={() => send({ restart: x.id }, `Reiniciando ${x.name}`)} style={{ minHeight: 44, width: 44, padding: 0 }}>
                    <Icon name="refresh" size={18} />
                  </Key>
                )}
                {url && (
                  <a className="key c" href={url} target="_blank" rel="noreferrer" aria-label={`Abrir ${x.name}`} style={{ minHeight: 44, width: 44, padding: 0, display: 'grid', placeItems: 'center' }}>
                    <Icon name="external" size={18} />
                  </a>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted small">Serviços no WSL (Debian + Docker), mídia no HD D:. Fora de casa, abra pelo Tailscale.</p>
    </Card>
  );
}
