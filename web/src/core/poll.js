// Poller sem React: no máximo UMA leitura real em voo, pausa quando a aba está oculta, sem timer órfão.
// read({ isCurrent }) devolve uma Promise; isCurrent() fica falso ao ocultar, parar ou trocar de geração,
// para quem aplica o resultado (a store) descartá-lo. visibility = { isVisible(), subscribe(fn) -> unsubscribe }.
export function createPoller({ read, every = 5000, onData = () => {}, onError = () => {}, visibility, timers }) {
  let running = false;
  let epoch = 0;
  let timer = null;
  let pending = null;
  let unsubscribe = null;
  let wasVisible = true;

  const visible = () => !visibility || visibility.isVisible();
  const clearTimer = () => { if (timer != null) { timers.clearTimeout(timer); timer = null; } };
  const schedule = () => {
    clearTimer();
    if (running && every && visible()) timer = timers.setTimeout(() => { timer = null; refresh(); }, every);
  };

  function refresh() {
    if (!running || !visible()) return Promise.resolve();
    if (pending) return pending; // a leitura real continua única; ocultar/reexibir não abre outra
    clearTimer();
    const mine = epoch;
    const isCurrent = () => running && mine === epoch && visible();
    let reading;
    try { reading = Promise.resolve(read({ isCurrent })); } catch (error) { reading = Promise.reject(error); }
    const done = reading
      .then((data) => { if (isCurrent()) onData(data); }, (error) => { if (isCurrent()) onError(error); })
      .finally(() => {
        if (pending === done) pending = null;
        if (!running) return;
        if (mine !== epoch && visible()) refresh(); // o resultado foi descartado: lê de novo agora
        else schedule();
      });
    pending = done;
    return done;
  }

  function onVisibility() {
    const now = visible();
    if (now === wasVisible) return;
    wasVisible = now;
    epoch += 1; // o que estava em voo antes da mudança não vale mais
    clearTimer();
    if (now) refresh();
  }

  return {
    start() {
      if (running) return;
      running = true;
      epoch += 1;
      wasVisible = visible();
      if (visibility) unsubscribe = visibility.subscribe(onVisibility);
      refresh();
    },
    refresh,
    stop() {
      running = false;
      epoch += 1;
      clearTimer();
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    },
  };
}
