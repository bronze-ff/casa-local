// Lógica pura do Lab (sem React): ritmo de leitura, séries reais, links de serviço, agrupamento da rede e topologia.
import { sparkPoints } from '../Inicio/history.js';

export const FAST = 2000;
export const SLOW = 8000;
export const SETTLE_MS = 20000;
export const STALE_READING_S = 120; // leitura do computador mais velha que isso aparece como antiga
export const BACKUP_LATE_S = 129600; // 36 h
export const MAX_NODES = 10;

/** Ritmo de leitura: rápido enquanto há passo de troca; o resto do tempo, o normal. */
export const pollEvery = (step) => (step ? FAST : SLOW);

/** Colunas de /api/homelab history: [instante, cpu, memória %, temperatura da GPU, GB do WSL]; null = sem leitura. */
export const SERIES = { cpu: 1, mem: 2, gpu: 3, wsl: 4 };

export function seriesOf(history, key) {
  const column = SERIES[key];
  if (!Array.isArray(history)) return [];
  return history.filter((row) => Array.isArray(row) && Number.isFinite(row[column])).map((row) => ({ v: row[column], at: row[0] }));
}

export const sparkOf = (history, key, hi) => sparkPoints(seriesOf(history, key), { hi });

/** Texto de quanto tempo cobre o histórico real (ou null se não há duas amostras). */
export function historySpan(history, key) {
  const samples = seriesOf(history, key);
  if (samples.length < 2) return null;
  const minutes = Math.round((samples[samples.length - 1].at - samples[0].at) / 60);
  return minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

export const readingIsOld = (checked, now = Date.now()) => !!checked && now / 1000 - checked > STALE_READING_S;
export const gb = (mb) => (Number.isFinite(mb) ? Math.round((mb / 1024) * 10) / 10 : null);

export const backupState = (backups, now = Date.now()) => {
  if (!backups) return null;
  if (!backups.last) return { kind: 'fail', label: 'sem backup' };
  return now / 1000 - backups.last > BACKUP_LATE_S ? { kind: 'warn', label: 'atrasado' } : { kind: 'ok', label: 'ok' };
};

/** O motivo do modo jogo em português; nunca inventa quando o servidor não informou. */
export function reasonText(reason) {
  if (typeof reason === 'string' && reason.startsWith('auto:')) return `Entrou sozinho: ${reason.slice(5)} aberto`;
  return 'Ligado por você';
}

/** Contagem de serviços. `unknown` não conta como parado nem como rodando. */
export function countServices(services = []) {
  const running = services.filter((x) => x.state === 'running').length;
  const unknown = services.filter((x) => x.state === 'unknown').length;
  return { total: services.length, running, unknown, stopped: services.length - running - unknown };
}

/** Resultado de uma troca de modo: só existe quando o passo SUMIU (a ação aceita não é o fim do processo). */
export const switchEnded = (prevStep, step) => !!prevStep && !step;

export function resultText(mode, services = []) {
  const { total, running, stopped } = countServices(services);
  if (mode === 'jogo') return `Modo jogo ligado: ${stopped} serviço${stopped === 1 ? '' : 's'} parado${stopped === 1 ? '' : 's'}, ${running} seguem.`;
  return `Home lab de volta: ${running} de ${total} serviços rodando.`;
}

/** Mesma regra do painel anterior: 'path' e 'https' pelo nome do Tailscale (quando há); 'tls' e 'http' pelo endereço atual. */
export function serviceUrl(service, host, here) {
  const link = service.link;
  if (!link) return null;
  if (link.kind === 'path') return `https://${host || here}${link.target}`;
  if (link.kind === 'https') return `https://${host || here}:${link.target}`;
  if (link.kind === 'tls') return `https://${here}:${link.target}`;
  return `http://${here}:${link.target}`;
}

/** Aparelhos da rede em grupos: novos, vigiados e outros. */
export function groupDevices(devices = []) {
  return {
    fresh: devices.filter((d) => !d.known),
    watched: devices.filter((d) => d.known && d.watched),
    others: devices.filter((d) => d.known && !d.watched),
  };
}

export const missingWatched = (devices = []) => devices.filter((d) => d.known && d.watched && !d.online).length;
export const deviceName = (d) => d.label || 'Aparelho sem nome';

export function deviceMeta(d, now = Date.now(), ago = () => '') {
  const parts = [d.ip, d.name || d.hint ? d.host : null, d.private ? 'MAC privado' : d.mac].filter(Boolean).join(' · ');
  return `${parts}${d.online ? '' : ` · visto ${ago(d.lastSeen, now)}`}${d.known ? '' : ` · apareceu ${ago(d.firstSeen, now)}`}`;
}

/** Posições (em %) de `count` nós numa elipse; o primeiro fica no topo, no sentido horário. */
export function topoLayout(count) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (-90 + (360 / Math.max(1, count)) * i) * (Math.PI / 180);
    return { x: Math.round((50 + 36 * Math.cos(angle)) * 10) / 10, y: Math.round((50 + 33 * Math.sin(angle)) * 10) / 10 };
  });
}

/** Quem pede atenção vem primeiro (novos, vigiados sem resposta), depois o resto; no máximo MAX_NODES. */
export function pickNodes(devices = []) {
  const rank = (d) => (!d.known ? 0 : d.watched && !d.online ? 1 : !d.online ? 3 : 2);
  const sorted = [...devices].sort((a, b) => rank(a) - rank(b));
  return { shown: sorted.slice(0, MAX_NODES), hidden: Math.max(0, sorted.length - MAX_NODES) };
}

export const nodeState = (d) => (d.online ? 'ok' : d.watched ? 'bad' : 'warn');
export const nodeText = (d) => `${deviceName(d)}: ${d.online ? 'conectado' : 'sem resposta'}${d.known ? '' : ', novo'}`;
