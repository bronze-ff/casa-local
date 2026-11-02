// Quadros da tela larga: 4 câmeras, no máximo 3 pedidos ao mesmo tempo, um ciclo a cada 4 s, parado com a aba oculta.
// Só imagens paradas: nenhum vídeo contínuo. Lógica pura aqui; o hook que usa fetch/URL fica em Wide.jsx.
export const WIDE_CAMS = 4;
export const WIDE_PARALLEL = 3;
export const WIDE_EVERY = 4000;

/** Percorre `ids` com no máximo `parallel` pedidos simultâneos. Devolve quantos carregou. */
export async function runCycle({ ids, parallel = WIDE_PARALLEL, load, stopped = () => false }) {
  const queue = [...ids];
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    while (queue.length && !stopped()) { await load(queue.shift()); done += 1; }
  }));
  return done;
}

/** As câmeras com aviso ligado vêm primeiro; corta em WIDE_CAMS. */
export const pickWide = (cameras = [], notify = []) => [...cameras].sort((a, b) => Number(notify.includes(b.id)) - Number(notify.includes(a.id))).slice(0, WIDE_CAMS);

/**
 * Carregador de UM quadro. `active()` é checado ANTES do pedido e DEPOIS de cada espera (resposta e corpo): se a aba ocultou
 * ou a rota saiu no meio, o resultado é descartado sem criar URL de imagem (descartar não é falha). `release()` libera todas as URLs.
 */
export function createFrameLoader({ fetchFn, createURL, revokeURL, active, onFrame, onFail, now = Date.now, later = (fn, ms) => setTimeout(fn, ms) }) {
  const urls = {};
  async function load(id) {
    if (!active()) return;
    try {
      const response = await fetchFn(`/api/cameras/${id}/frame.jpg`, { cache: 'no-store' });
      if (!response.ok) throw new Error('sem imagem');
      if (!active()) return;
      const age = Number(response.headers.get('X-Frame-Age') ?? 0);
      const blob = await response.blob();
      if (!active()) return;
      const url = createURL(blob);
      const old = urls[id];
      urls[id] = url;
      onFrame(id, { url, at: now() - (Number.isFinite(age) ? age * 1000 : 0) });
      if (old) later(() => revokeURL(old), 1000);
    } catch {
      if (active()) onFail(id);
    }
  }
  const release = () => { for (const id of Object.keys(urls)) { revokeURL(urls[id]); delete urls[id]; } };
  return { load, release };
}

/**
 * Ciclo de quadros guiado pela visibilidade, SEM laço de espera: oculto não agenda nada e não inicia pedido novo;
 * ao reexibir (evento) retoma um ciclo. Um ciclo por vez. `stop()` encerra e remove a assinatura.
 */
export function createFrameCycle({ ids, load, parallel = WIDE_PARALLEL, every = WIDE_EVERY, isVisible, subscribe, setTimer, clearTimer }) {
  let stopped = false;
  let timer = null;
  let running = false;
  const active = () => !stopped && isVisible();
  async function cycle() {
    if (!active() || running) return;
    running = true;
    try { await runCycle({ ids, parallel, load, stopped: () => !active() }); } finally { running = false; }
    if (active()) timer = setTimer(cycle, every);
  }
  const unsubscribe = subscribe(() => { clearTimer(timer); timer = null; if (active()) cycle(); });
  cycle();
  return { active, stop() { stopped = true; clearTimer(timer); timer = null; unsubscribe(); } };
}
