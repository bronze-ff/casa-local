// Poller sem React: no máximo uma leitura em voo, pausa quando oculto, sem timer órfão.
// read() devolve Promise; visibility = { isVisible(), subscribe(listener) -> unsubscribe }; timers = { setTimeout, clearTimeout }.
export function createPoller({ read, every = 5000, onData = () => {}, onError = () => {}, visibility, timers }) {
  let running = false;
  let generation = 0;
  let timer = null;
  let inflight = null;
  let unsubscribe = null;
  let wasVisible = true;

  const visible = () => !visibility || visibility.isVisible();
  const clear = () => { if (timer != null) { timers.clearTimeout(timer); timer = null; } };

  function schedule() {
    clear();
    if (running && every && visible()) timer = timers.setTimeout(() => { timer = null; refresh(); }, every);
  }

  function refresh() {
    if (!running || !visible()) return Promise.resolve();
    if (inflight) return inflight;
    clear();
    const mine = generation;
    let reading;
    try { reading = Promise.resolve(read()); } catch (error) { reading = Promise.reject(error); }
    inflight = reading
      .then(
        (data) => { if (mine === generation) onData(data); },
        (error) => { if (mine === generation) onError(error); },
      )
      .finally(() => {
        if (mine !== generation) return;
        inflight = null;
        schedule();
      });
    return inflight;
  }

  function onVisibility() {
    const now = visible();
    if (now === wasVisible) return; // notificação repetida não reinicia a leitura em voo
    wasVisible = now;
    generation += 1; // resposta em voo de antes da mudança de visibilidade não vale mais
    inflight = null;
    clear();
    if (visible()) refresh();
  }

  function start() {
    if (running) return;
    running = true;
    generation += 1;
    wasVisible = visible();
    if (visibility) unsubscribe = visibility.subscribe(onVisibility);
    refresh();
  }

  function stop() {
    running = false;
    generation += 1;
    inflight = null;
    clear();
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  return { start, refresh, stop };
}
