// Replay do DVR. Funções puras e a fila de sessões. Horários no relógio do DVR (`offset` = DVR − PC).
export const clock = (t) => new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const stamp = (t) => new Date(t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Janela em volta de um evento: de 30 s antes até 1 min depois do fim (mínimo 3 min), nunca além de "agora − 5 s". */
export function replayWindow(camera, event, offset, nowSec = Date.now() / 1000) {
  const now = nowSec + offset;
  const from = event.start - 30;
  const to = Math.min(now - 5, Math.max((event.end ?? now) + 60, from + 180));
  return { camera, start: event.start - 10, from, to, offset };
}

/** "Rever 1 min": começa 1 min atrás, olhando de 5 min atrás até 5 s atrás. */
export function rewindWindow(camera, offset, nowSec = Date.now() / 1000) {
  const now = nowSec + offset;
  return { camera, start: now - 60, from: now - 300, to: now - 5, offset };
}

/** Trechos com movimento dentro da janela; evento em andamento termina "agora". */
export function buildHits(events = [], nowDvr) {
  const list = [];
  for (const event of events) for (const [s, e] of event.hits ?? [[event.start, event.end]]) list.push([s, e ?? Math.max(s + 5, nowDvr)]);
  return list.sort((a, b) => a[0] - b[0]);
}
export const isOngoing = (events = [], to) => events.some((e) => e.end === null && e.start <= to + 60);

/** Posição em % na linha do tempo, presa entre 0 e 100. */
export const percentAt = (t, from, to) => Math.min(100, Math.max(0, ((t - from) / Math.max(1, to - from)) * 100));
/** Instante do clique/arrasto (x em relação à faixa), preso à janela. */
export const timeAtX = (x, left, width, from, to) => from + Math.min(1, Math.max(0, (x - left) / width)) * Math.max(1, to - from);
/** Próximo movimento depois de `now`. */
export const nextHit = (hits, now) => hits.map(([s]) => s).find((s) => s > now + 2);
/** Teclado da linha do tempo: setas ±10 s, Home/End. */
export const keyTarget = (key, now, from, to) => ({ ArrowLeft: now - 10, ArrowRight: now + 10, Home: from, End: to })[key];
/** Buscar nunca passa de "agora − 10 s": o DVR ainda não gravou isso. */
export const clampSeek = (t, nowDvr) => Math.min(Math.floor(nowDvr) - 10, Math.floor(t));

/** Id de sessão de replay válido (12 hexadecimais, como o servidor emite). Qualquer outra coisa nunca vira URL de WebSocket. */
export const REPLAY_ID = /^[0-9a-f]{12}$/;
/** Chave da porta de mídia do replay: só existe com a busca iniciada, MSE suportado e id válido; senão `undefined` (nada abre). */
export const replayKey = ({ started, supported, id }) => (started && supported && typeof id === 'string' && REPLAY_ID.test(id) ? id : undefined);

/**
 * Fila de sessões de replay: NUNCA dois "abrir" ao mesmo tempo (o servidor limita a 2 sessões); cada abertura troca a anterior
 * numa chamada só (`replace`). O id conhecido só some quando o servidor confirma a troca: em falha (409, rede) ele continua
 * guardado para `suspend`/`dispose` fecharem, e a abertura NUNCA é repetida sozinha. Resposta que chega depois de cancelar,
 * suspender ou descartar fecha a sessão no ato. `suspend` (aba oculta) fecha a atual e invalida o que estiver em voo.
 */
export function createSessionQueue({ open, close }) {
  let chain = Promise.resolve();
  let current = null;
  let token = 0;
  const closeQuiet = (id) => { Promise.resolve(close(id)).catch(() => {}); };
  const release = () => { token += 1; if (current) { closeQuiet(current); current = null; } };
  return {
    request(args) {
      const mine = ++token;
      return new Promise((resolve, reject) => {
        chain = chain.then(async () => {
          if (mine !== token) return resolve(null); // já substituído por um pedido mais novo
          const replace = current;
          try {
            const opened = await open({ ...args, ...(replace ? { replace } : {}) });
            if (current === replace) current = null; // o servidor trocou a anterior: não há o que fechar
            if (mine !== token) { closeQuiet(opened.id); resolve(null); return; }
            current = opened.id;
            resolve(opened.id);
          } catch (error) { if (mine === token) reject(error); else resolve(null); }
        });
      });
    },
    cancel() { token += 1; },
    suspend: release,
    dispose: release,
    current: () => current,
  };
}
