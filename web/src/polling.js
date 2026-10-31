// Poller sem React: UMA leitura real em voo por vez, pausa quando oculto, sem timer órfão.
// read({isCurrent}) devolve Promise; isCurrent() fica falso ao ocultar/parar, para quem aplica o resultado (a store) descartá-lo.
// visibility = { isVisible(), subscribe(listener) -> unsubscribe }; timers = { setTimeout, clearTimeout }.
export function createPoller({ read, every = 5000, onData = () => {}, onError = () => {}, visibility, timers }) {
  let running = false;
  let generation = 0;
  let timer = null;
  let inflight = null; // a leitura REAL continua única até terminar; ocultar/reexibir não abre outra
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
    const current = () => running && mine === generation && visible();
    let reading;
    try { reading = Promise.resolve(read({ isCurrent: current })); } catch (error) { reading = Promise.reject(error); }
    const promise = reading
      .then(
        (data) => { if (current()) onData(data); },
        (error) => { if (current()) onError(error); },
      )
      .finally(() => {
        if (inflight === promise) inflight = null;
        if (!running) return;
        if (mine !== generation && visible()) refresh(); // ocultou/reexibiu durante a leitura: o resultado foi descartado, lê de novo agora
        else schedule();
      });
    inflight = promise;
    return promise;
  }

  function onVisibility() {
    const now = visible();
    if (now === wasVisible) return; // notificação repetida não mexe em nada
    wasVisible = now;
    generation += 1; // resultado de antes da mudança não vale mais
    clear();
    if (now) refresh(); // com leitura ainda em voo, refresh() só espera: a nova leitura sai quando a real terminar
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
    clear();
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  return { start, refresh, stop };
}
