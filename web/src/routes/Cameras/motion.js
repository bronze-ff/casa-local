// Movimento (DVR, 24 h): rótulos de dia, duração, "novo", ordenação por sino e filtros. Funções puras.
export const FILTERS = [['todas', 'Todas'], ['externa', 'Externas'], ['interna', 'Internas'], ['movimento', 'Movimento']];

export function dayLabel(t, now = new Date()) {
  const d = new Date(t * 1000);
  if (d.toDateString() === now.toDateString()) return 'Hoje';
  if (new Date(now.getTime() - 864e5).toDateString() === d.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
}

/** Câmeras com sino primeiro. */
export const byBell = (list, bells = []) => [...list].sort((a, b) => Number(bells.includes(b.id)) - Number(bells.includes(a.id)));

export const visibleCameras = (all, filter, bells) => byBell(all.filter((c) => filter === 'todas' || filter === 'movimento' || c.group === filter), bells);

export const minutesOf = (event) => (event.end ? Math.max(1, Math.round((event.end - event.start) / 60)) : null);

/** "Novo" só para câmera com sino cujo evento é mais novo que o último visto quando a lista abriu. */
export const isFresh = (event, watched, seenAtOpen) => watched.includes(event.camera) && event.start > (seenAtOpen?.[event.camera] ?? Infinity);

/** Linha curta do evento: horário, duração ou "agora", disparos. */
export function eventSummary(event, fmtTime) {
  const minutes = minutesOf(event);
  return `${fmtTime(event.start)}${event.end ? ` · ${minutes} min` : ' · agora'}${event.count > 1 ? ` · ${event.count} disparos` : ''}`;
}

/** Agrupa por dia mantendo a ordem recebida. */
export function groupByDay(events = [], now = new Date()) {
  const groups = [];
  for (const event of events) {
    const label = dayLabel(event.start, now);
    if (groups.at(-1)?.label !== label) groups.push({ label, events: [] });
    groups.at(-1).events.push(event);
  }
  return groups;
}

/** Link de fora do app → ação: '#/cameras/cam2' ao vivo, 'replay:cam2:<início>', 'avisos'. Aceita ':' e '/' e o prefixo 'cameras'. */
export function parseCameraParam(param = '', cameras = []) {
  const parts = param.split(/[:/]/).filter(Boolean);
  if (parts[0] === 'cameras') parts.shift();
  const [first, id, start] = parts;
  if (first === 'replay') return Number(start) && cameras.some((c) => c.id === id) ? { type: 'replay', id, start: Number(start) } : null;
  if (first === 'avisos') return { type: 'avisos' };
  if (cameras.some((c) => c.id === first)) return { type: 'live', id: first };
  return null;
}

export const FOREVER = 4102444800; // o backend entende 2100-01-01 como "até reativar"
export function pausedText(until, now, today = new Date()) {
  if (until <= now) return null;
  if (until >= FOREVER) return 'Pausado até reativar';
  const d = new Date(until * 1000);
  const hour = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Pausado até ${d.toDateString() === today.toDateString() ? hour : `${d.toLocaleDateString('pt-BR', { weekday: 'short' })} ${hour}`}`;
}
