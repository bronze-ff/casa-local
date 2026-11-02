// Geografia e regras do Local. Funções puras.
const MAX_LAT = 85.05112878;

/** Projeção Web Mercator em pixels de mapa (tiles de 256 px). */
export function project(lat, lon, zoom) {
  const sine = Math.sin((Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180);
  const scale = 256 * 2 ** zoom;
  return [((lon + 180) / 360) * scale, (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale];
}

export function unproject(x, y, zoom) {
  const scale = 256 * 2 ** zoom;
  return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI, ((((x / scale) * 360) % 360) + 360) % 360 - 180];
}

/** Raio em pixels de um círculo de `meters` metros na latitude dada. */
export const radiusPx = (meters, lat, zoom) => Math.max(0, meters || 0) / ((156543.03392 * Math.cos((Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180)) / 2 ** zoom);

export const MAP_W = 600;
export const MAP_H = 360;

/** Tiles que cobrem a janela de 600×360 centrada em `center`. Nenhum fora do mundo vertical. */
export function tilesFor(center, zoom) {
  const [cx, cy] = project(center[0], center[1], zoom);
  const left = cx - MAP_W / 2;
  const top = cy - MAP_H / 2;
  const n = 2 ** zoom;
  const tiles = [];
  for (let y = Math.floor(top / 256); y <= Math.floor((top + MAP_H) / 256); y += 1) {
    if (y < 0 || y >= n) continue;
    for (let x = Math.floor(left / 256); x <= Math.floor((left + MAP_W) / 256); x += 1) tiles.push({ x, y, wrapped: ((x % n) + n) % n });
  }
  return { tiles, left, top };
}

export const HOME_NAMES = ['casa', 'home', 'minha casa', 'casa local'];
export const isHomePlace = (place) => HOME_NAMES.includes(String(place?.name || '').trim().toLowerCase());

export const distanceText = (meters) => (meters == null ? '—' : meters < 1000 ? `${meters} m` : `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`);

export const LIMITS = { people: 4, places: 8, radius: [30, 1000], name: 24, person: 30 };

/** Valida o formulário de lugar com os limites do backend. Devolve uma lista de problemas em português (vazia = pode salvar). */
export function placeProblems(draft) {
  const problems = [];
  const lat = Number(draft.lat); const lon = Number(draft.lon); const radius = Number(draft.radius);
  if (!String(draft.name || '').trim()) problems.push('Escreva o nome do lugar.');
  if (draft.lat === '' || draft.lat == null || !Number.isFinite(lat) || lat < -90 || lat > 90) problems.push('A latitude vai de −90 a 90.');
  if (draft.lon === '' || draft.lon == null || !Number.isFinite(lon) || lon < -180 || lon > 180) problems.push('A longitude vai de −180 a 180.');
  if (!Number.isFinite(radius) || radius < LIMITS.radius[0] || radius > LIMITS.radius[1]) problems.push('O raio vai de 30 a 1000 metros.');
  return problems;
}

/** Corpo do POST de lugar (só depois de placeProblems vazio). */
export const placeBody = (draft) => ({ ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), lat: Number(draft.lat), lon: Number(draft.lon), radius: Number(draft.radius) });

/** Eventos das últimas 24 h, do mais novo para o mais velho. */
export function eventsLast24h(events = [], now = Date.now() / 1000) {
  return [...events].filter((event) => event.tst >= now - 86400).sort((a, b) => b.tst - a.tst);
}

/** Estado de uma pessoa em palavras. Posição antiga e sem posição ficam explícitos. */
export function personState(person) {
  const last = person.last;
  if (person.stale) return { kind: 'warn', label: 'Posição antiga' };
  return last ? { kind: 'ok', label: 'Recebida' } : { kind: 'off', label: 'Sem dado' };
}

export function whereText(person, placeName) {
  const last = person.last;
  if (person.place) return `Em ${placeName(person.place)}`;
  if (!last) return 'Aguardando o primeiro envio';
  return (last.vel ?? 0) >= 3 ? 'A caminho' : 'Fora dos lugares';
}

export const CONNECTION = { w: 'Wi-Fi', m: 'Rede móvel', o: 'Sem rede no envio' };
export const batteryText = (last) => `${last.bs === 2 ? 'Carregando · ' : last.bs === 3 ? 'Carga completa · ' : ''}${CONNECTION[last.conn] || 'Rede não informada'}`;
