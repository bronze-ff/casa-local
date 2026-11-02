import { Icon } from '../../ui/Icon.jsx';
import { nodeState, nodeText, pickNodes, topoLayout, deviceName } from './lab.js';

/**
 * Esquema da rede: o roteador no centro e os aparelhos que a varredura VIU, cada um com o nome por extenso.
 * É abstrato: as linhas não mostram o caminho real (cabo, repetidor), só que o aparelho apareceu na varredura.
 */
export function Topology({ devices, onSelect }) {
  const { shown, hidden } = pickNodes(devices);
  const spots = topoLayout(shown.length);
  return (
    <div className="col">
      <div className="topo" role="group" aria-label="Esquema da rede de casa">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {shown.map((d, i) => <line key={d.id} x1="50" y1="50" x2={spots[i].x} y2={spots[i].y} vectorEffect="non-scaling-stroke" className={d.online ? '' : 'off'} />)}
        </svg>
        <span className="node hub" style={{ left: '50%', top: '50%' }}><Icon name="radio" size={20} /><span>Rede</span></span>
        {shown.map((d, i) => (
          <button type="button" key={d.id} className={`node ${nodeState(d)}`} style={{ left: `${spots[i].x}%`, top: `${spots[i].y}%` }} aria-label={`${nodeText(d)}. Abrir detalhes`} title={deviceName(d)} onClick={() => onSelect(d.id)}>
            <i className="dot" aria-hidden="true" /><span>{deviceName(d)}</span>
          </button>
        ))}
      </div>
      <p className="hint">{hidden ? `Mostrando ${shown.length} de ${shown.length + hidden}; os demais estão na lista abaixo. ` : ''}Linha tracejada = sem resposta na última varredura. O esquema não mostra a conexão real entre os aparelhos.</p>
    </div>
  );
}
