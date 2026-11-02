import { useRef, useState } from 'react';
import { Icon } from '../../ui/Icon.jsx';
import { Button, IconButton } from '../../ui/kit.jsx';
import { MAP_H, MAP_W, project, radiusPx, tilesFor, unproject } from './geo.js';

const DEFAULT_CENTER = [-23.55, -46.63]; // referência quando ninguém enviou posição ainda

/**
 * Mapa com o fundo do OpenStreetMap (vem da internet; o navegador pede os quadrados ao servidor deles), lugares como círculos,
 * trajeto de 6 h da pessoa escolhida e a precisão do GPS. Arrastar, os botões de mover/ampliar e "Centralizar" são equivalentes:
 * nada depende só do arrasto. `onPick` (formulário de lugar aberto) transforma o toque em coordenadas.
 */
export function LocalMap({ people, places, selected, draft, onPick }) {
  const [zoom, setZoom] = useState(15);
  const [view, setView] = useState(null);
  const [failed, setFailed] = useState(false);
  const drag = useRef(null);
  const suppress = useRef(false);
  const person = people.find((p) => p.id === selected) || people[0];
  const focus = person?.last || places[0];
  const center = view || (focus ? [focus.lat, focus.lon] : DEFAULT_CENTER);
  const [cx, cy] = project(center[0], center[1], zoom);
  const { tiles, left, top } = tilesFor(center, zoom);
  const at = (lat, lon) => { const [x, y] = project(lat, lon, zoom); return [x - left, y - top]; };
  const circle = (place, isDraft) => {
    const [x, y] = at(place.lat, place.lon);
    return (
      <g key={isDraft ? 'rascunho' : place.id}>
        <circle cx={x} cy={y} r={radiusPx(place.radius, place.lat, zoom)} className={isDraft ? 'm-draft' : 'm-place'} />
        <text x={x} y={y - 8} textAnchor="middle" className="m-label">{place.name || 'Novo lugar'}</text>
      </g>
    );
  };
  const pan = (dx, dy) => setView(unproject(cx + dx, cy + dy, zoom));
  const draftOk = draft && draft.lat !== '' && draft.lon !== '' && Number.isFinite(Number(draft.lat)) && Number.isFinite(Number(draft.lon));
  return (
    <div className="col">
      <div className="map">
        {tiles.map((tile) => (
          <img key={`${zoom}-${tile.x}-${tile.y}`} alt="" draggable="false" referrerPolicy="origin" src={`https://tile.openstreetmap.org/${zoom}/${tile.wrapped}/${tile.y}.png`} onError={() => setFailed(true)}
            style={{ left: `${((tile.x * 256 - left) / MAP_W) * 100}%`, top: `${((tile.y * 256 - top) / MAP_H) * 100}%`, width: `${(256 / MAP_W) * 100}%` }} />
        ))}
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label={`Mapa de localização${onPick ? '. Toque para escolher o lugar ou use os campos de coordenadas.' : ''}`} className={onPick ? 'pick' : ''}
          onPointerDown={(event) => { if (!event.isPrimary || event.button !== 0) return; suppress.current = false; event.currentTarget.setPointerCapture?.(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, cx, cy, moved: false }; }}
          onPointerMove={(event) => {
            if (!drag.current || !event.isPrimary) return;
            const dx = event.clientX - drag.current.x; const dy = event.clientY - drag.current.y;
            if (Math.hypot(dx, dy) < 6 && !drag.current.moved) return;
            drag.current.moved = true;
            const box = event.currentTarget.getBoundingClientRect();
            setView(unproject(drag.current.cx - (dx / box.width) * MAP_W, drag.current.cy - (dy / box.height) * MAP_H, zoom));
          }}
          onPointerUp={() => { suppress.current = !!drag.current?.moved; drag.current = null; }}
          onPointerCancel={() => { drag.current = null; suppress.current = true; }}
          onClick={(event) => {
            if (suppress.current) { suppress.current = false; return; }
            if (!onPick) return;
            const box = event.currentTarget.getBoundingClientRect();
            const [lat, lon] = unproject(left + ((event.clientX - box.left) / box.width) * MAP_W, top + ((event.clientY - box.top) / box.height) * MAP_H, zoom);
            onPick({ lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) });
          }}>
          {places.map((place) => circle(place, false))}
          {person?.trail?.length > 1 && <polyline className="m-trail" points={person.trail.map(([lat, lon]) => at(lat, lon).join(',')).join(' ')} />}
          {people.filter((p) => p.last).map((p) => {
            const [x, y] = at(p.last.lat, p.last.lon);
            return (
              <g key={p.id} opacity={p.stale ? 0.55 : 1}>
                {p.id === selected && p.last.acc > 0 && <circle cx={x} cy={y} r={radiusPx(p.last.acc, p.last.lat, zoom)} className="m-acc" />}
                <circle cx={x} cy={y} r={p.id === selected ? 9 : 6} className={p.stale ? 'm-who stale' : 'm-who'} />
                <text x={x + 13} y={y + 5} className="m-label">{p.name}</text>
              </g>
            );
          })}
          {draftOk && circle({ ...draft, lat: Number(draft.lat), lon: Number(draft.lon), radius: Number(draft.radius) }, true)}
        </svg>
        <a className="osm" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      </div>
      <div className="row wrap">
        <IconButton icon="plus" label="Ampliar mapa" disabled={zoom >= 19} onClick={() => setZoom(zoom + 1)} />
        <IconButton icon="minus" label="Reduzir mapa" disabled={zoom <= 2} onClick={() => setZoom(zoom - 1)} />
        {[['back', -150, 0, 'oeste'], ['up', 0, -90, 'norte'], ['down', 0, 90, 'sul'], ['next', 150, 0, 'leste']].map(([icon, x, y, name]) => <IconButton key={name} icon={icon} label={`Mover mapa para ${name}`} onClick={() => pan(x, y)} />)}
        <Button variant="s" disabled={!focus} reason="Ainda não há posição para centralizar." onClick={() => { setView(null); setZoom(15); }}>Centralizar</Button>
      </div>
      {onPick && <p className="hint accent">Toque no mapa para posicionar o lugar. Ajuste o raio no formulário.</p>}
      {!focus && <p className="hint">Sem posição recebida. O mapa começa em São Paulo só como referência; navegue até o lugar ou informe as coordenadas.</p>}
      {failed && <p role="status" className="hint">Alguns quadrados do mapa não carregaram (o fundo vem da internet). As posições e coordenadas continuam na lista.</p>}
      <p className="hint">Trajeto das últimas 6 h da pessoa escolhida. O círculo mostra a precisão do GPS.</p>
    </div>
  );
}
