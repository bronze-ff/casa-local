import { useRef, useState } from 'react';
import { Icon } from '../../ui.jsx';

export function project(lat, lon, zoom) {
  const sine = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180);
  const scale = 256 * 2 ** zoom;
  return [(lon + 180) / 360 * scale, (.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale];
}

export function unproject(x, y, zoom) {
  const scale = 256 * 2 ** zoom;
  return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI, ((x / scale * 360) % 360 + 360) % 360 - 180];
}

export default function LocationMap({ people, places, selected, draft, onPick }) {
  const [zoom, setZoom] = useState(15);
  const [view, setView] = useState(null);
  const [failed, setFailed] = useState(false);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const person = people.find(person => person.id === selected) || people[0];
  const focus = person?.last || places[0];
  const center = view || (focus ? [focus.lat, focus.lon] : [-23.55, -46.63]);
  const [cx, cy] = project(...center, zoom);
  const left = cx - 300, top = cy - 180;
  const point = (lat, lon) => { const [x, y] = project(lat, lon, zoom); return [x - left, y - top]; };
  const radius = (meters, lat) => Math.max(0, meters || 0) / (156543.03392 * Math.cos(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180) / 2 ** zoom);
  const tiles = [];
  for (let y = Math.floor(top / 256); y <= Math.floor((top + 360) / 256); y++) {
    if (y < 0 || y >= 2 ** zoom) continue;
    for (let x = Math.floor(left / 256); x <= Math.floor((left + 600) / 256); x++) tiles.push({ x, y, wrapped: ((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom });
  }
  const circle = (place, isDraft) => {
    const [x, y] = point(place.lat, place.lon);
    return <g key={isDraft ? 'draft' : place.id}>
      <circle cx={x} cy={y} r={radius(place.radius, place.lat)} fill={isDraft ? 'var(--accent)' : 'var(--info)'} fillOpacity=".12" stroke={isDraft ? 'var(--accent)' : 'var(--info)'} strokeDasharray="5 4" />
      <text x={x} y={y - 8} textAnchor="middle" fill="#101114" stroke="#fff" strokeWidth="3" paintOrder="stroke" fontSize="15">{place.name || 'Novo lugar'}</text>
    </g>;
  };
  const pan = (x, y) => setView(unproject(cx + x, cy + y, zoom));
  return <div className="stack" style={{ gap: 10 }}>
    <div style={{ position: 'relative', width: '100%', aspectRatio: '5 / 3', overflow: 'hidden', borderRadius: 12, background: 'var(--raised)', border: '1px solid var(--line)' }}>
      {tiles.map(tile => <img alt="" draggable="false" key={`${zoom}-${tile.x}-${tile.y}`} src={`https://tile.openstreetmap.org/${zoom}/${tile.wrapped}/${tile.y}.png`} referrerPolicy="origin" onError={() => setFailed(true)}
        style={{ position: 'absolute', width: `${256 / 6}%`, maxWidth: 'none', height: 'auto', left: `${(tile.x * 256 - left) / 6}%`, top: `${(tile.y * 256 - top) / 3.6}%` }} />)}
      <svg viewBox="0 0 600 360" role="img" aria-label={`Mapa de localização${onPick ? '. Toque para escolher o lugar ou use os campos de coordenadas.' : ''}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: onPick ? 'crosshair' : 'grab', touchAction: 'none' }}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, cx, cy, moved: false };
      }} onPointerMove={event => {
        if (!drag.current || !event.isPrimary) return;
        const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
        if (Math.hypot(dx, dy) < 6 && !drag.current.moved) return;
        drag.current.moved = true;
        const bounds = event.currentTarget.getBoundingClientRect();
        setView(unproject(drag.current.cx - dx / bounds.width * 600, drag.current.cy - dy / bounds.height * 360, zoom));
      }} onPointerUp={() => { suppressClick.current = !!drag.current?.moved; drag.current = null; }}
      onPointerCancel={() => { drag.current = null; suppressClick.current = true; }} onClick={event => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        if (!onPick) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const [lat, lon] = unproject(left + (event.clientX - bounds.left) / bounds.width * 600, top + (event.clientY - bounds.top) / bounds.height * 360, zoom);
        onPick({ lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) });
      }}>
        {places.map(place => circle(place, false))}
        {person?.trail?.length > 1 && <polyline points={person.trail.map(([lat, lon]) => point(lat, lon).join(',')).join(' ')} fill="none" stroke="var(--info)" strokeWidth="3" />}
        {people.filter(person => person.last).map(person => {
          const [x, y] = point(person.last.lat, person.last.lon);
          return <g key={person.id} opacity={person.stale ? .55 : 1}>
            {person.id === selected && person.last.acc > 0 && <circle cx={x} cy={y} r={radius(person.last.acc, person.last.lat)} fill="var(--info)" fillOpacity=".15" />}
            <circle cx={x} cy={y} r={person.id === selected ? 9 : 6} fill={person.stale ? '#6e7176' : '#15729e'} stroke="white" strokeWidth="3" />
            <text x={x + 13} y={y + 5} fontSize="16" fill="#101114" stroke="white" strokeWidth="3" paintOrder="stroke">{person.name}</text>
          </g>;
        })}
        {draft && Number.isFinite(Number(draft.lat)) && Number.isFinite(Number(draft.lon)) && draft.lat !== '' && draft.lon !== '' && circle({ ...draft, lat: Number(draft.lat), lon: Number(draft.lon), radius: Number(draft.radius) }, true)}
      </svg>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--bg)', padding: '4px 8px', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 11 }}>© OpenStreetMap</a>
    </div>
    <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-start', gap: 6 }}>
      <button type="button" className="btn" aria-label="Ampliar mapa" disabled={zoom >= 19} onClick={() => setZoom(zoom + 1)}><Icon name="plus" /></button>
      <button type="button" className="btn" aria-label="Reduzir mapa" disabled={zoom <= 2} onClick={() => setZoom(zoom - 1)}><Icon name="minus" /></button>
      {[['left', -150, 0, 'oeste'], ['up', 0, -90, 'norte'], ['down', 0, 90, 'sul'], ['right', 150, 0, 'leste']].map(([icon, x, y, name]) => <button type="button" className="btn" key={icon} aria-label={`Mover mapa para ${name}`} onClick={() => pan(x, y)}><Icon name={icon} /></button>)}
      <button type="button" className="btn" disabled={!focus} onClick={() => { setView(null); setZoom(15); }}>Centralizar</button>
    </div>
    {onPick && <p className="small" style={{ color: 'var(--accent)' }}>Toque no mapa para posicionar o lugar. Ajuste o raio no formulário.</p>}
    {!focus && <p className="small muted">Sem posição recebida. O mapa começa em São Paulo como referência; navegue até o lugar ou informe as coordenadas.</p>}
    {failed && <p role="status" className="small muted">Alguns tiles não carregaram. As posições e coordenadas continuam disponíveis na lista.</p>}
    <p className="small muted">Trajeto das últimas 6 h da pessoa selecionada. O círculo indica a precisão do GPS.</p>
  </div>;
}
