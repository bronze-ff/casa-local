import { Icon } from '../../ui.jsx';

export const MAX_NODES = 10;

/** Posições (em %) de `count` nós numa elipse ao redor do centro; começa no topo e segue no sentido horário. */
export function topoLayout(count) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (-90 + (360 / Math.max(1, count)) * i) * (Math.PI / 180);
    return { x: Math.round((50 + 37 * Math.cos(angle)) * 10) / 10, y: Math.round((50 + 34 * Math.sin(angle)) * 10) / 10 };
  });
}

/** Os que pedem atenção primeiro (novos, vigiados sem resposta), depois o resto; no máximo MAX_NODES. */
export function pickNodes(devices = []) {
  const rank = (d) => (!d.known ? 0 : d.watched && !d.online ? 1 : !d.online ? 3 : 2);
  const sorted = [...devices].sort((a, b) => rank(a) - rank(b));
  return { shown: sorted.slice(0, MAX_NODES), hidden: Math.max(0, sorted.length - MAX_NODES) };
}

/** Mapa da rede: só aparelhos que o painel realmente viu; tocar num nó abre o inventário dele. */
export default function Topology({ devices, onSelect }) {
  const { shown, hidden } = pickNodes(devices);
  const spots = topoLayout(shown.length);
  return (
    <div>
      <div className="topo" role="group" aria-label="Mapa da rede de casa">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {shown.map((d, i) => <line key={d.id} x1="50" y1="50" x2={spots[i].x} y2={spots[i].y} vectorEffect="non-scaling-stroke" className={d.online ? '' : 'bad'} />)}
        </svg>
        <div className="node hub" style={{ left: '50%', top: '50%' }}><Icon name="radio" size={20} /><span>Rede</span></div>
        {shown.map((d, i) => (
          <button type="button" key={d.id} className={`node ${d.online ? '' : d.watched ? 'bad' : 'warn'}`} style={{ left: `${spots[i].x}%`, top: `${spots[i].y}%` }}
            aria-label={`${d.label}: ${d.online ? 'conectado' : 'sem resposta'}${d.known ? '' : ', novo'}. Abrir detalhes`} onClick={() => onSelect(d.id)}>
            <span className="led-s" aria-hidden="true" />
            <span>{d.label.length > 14 ? `${d.label.slice(0, 13)}…` : d.label}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{hidden ? `Mostrando ${shown.length} de ${shown.length + hidden}; os demais estão na lista abaixo. ` : ''}Toque num aparelho para ver o inventário. Linha tracejada = sem resposta.</p>
    </div>
  );
}
