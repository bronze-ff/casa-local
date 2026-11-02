// Hooks React sobre o núcleo. Sem JSX, para poder ser checado pelo Node.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { get } from './api.js';
import { home } from './home.js';
import { createPoller } from './poll.js';
import { ROUTE_NAMES, layoutFor, parseHash } from './route.js';

const browserTimers = { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (id) => window.clearTimeout(id) };
const browserVisibility = {
  isVisible: () => document.visibilityState === 'visible',
  subscribe(fn) {
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  },
};
const noSubscribe = () => () => {};

/** Estado completo da store: home, homeAt, commands, bootError, stateError. */
export const useHome = () => useSyncExternalStore(home.subscribe, home.getSnapshot);

/** Comando em andamento ou último resultado do aparelho (por físico). */
export function useCommand(deviceId) {
  useHome(); // reage a qualquer mudança da store
  return deviceId ? home.commandFor(deviceId) : null;
}

/** UM poll compartilhado de /api/state enquanto `enabled`: single-flight, pausa oculto, nenhum timer órfão. */
export function useStatePoll(enabled, every = 5000) {
  useEffect(() => {
    if (!enabled) return undefined;
    const poller = createPoller({
      read: ({ isCurrent }) => home.refresh({ force: true, isCurrent }),
      every, visibility: browserVisibility, timers: browserTimers,
    });
    poller.start();
    return () => poller.stop();
  }, [enabled, every]);
}

/** Lê `path` agora e a cada `every` ms com a aba visível. `null` pausa. /api/state usa a store, sem poll próprio. */
export function usePoll(path, every = 5000) {
  const [own, setOwn] = useState({ data: null, error: null, at: 0 });
  const poller = useRef(null);
  const shared = path === '/api/state';
  const store = useSyncExternalStore(shared ? home.subscribe : noSubscribe, home.getSnapshot);
  useEffect(() => {
    if (!path || shared) return undefined;
    const mine = createPoller({
      read: () => get(path), every,
      onData: (data) => setOwn({ data, error: null, at: Date.now() }),
      onError: (error) => setOwn((old) => ({ ...old, error })),
      visibility: browserVisibility, timers: browserTimers,
    });
    poller.current = mine;
    mine.start();
    return () => { mine.stop(); if (poller.current === mine) poller.current = null; };
  }, [path, every, shared]);
  const reload = useCallback(() => (shared ? home.refresh().catch(() => {}) : poller.current?.refresh() ?? Promise.resolve()), [shared]);
  if (shared) return { data: store.home, error: store.stateError, at: store.homeAt, reload, stale: !!store.stateError && !!store.home };
  return { ...own, reload, stale: !!own.error && !!own.data };
}

/** Rota do hash; volta ao topo ao navegar. */
export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash, ROUTE_NAMES));
  useEffect(() => {
    const onHash = () => { setRoute(parseHash(window.location.hash, ROUTE_NAMES)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export function useLayout(tray) {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return layoutFor(width, tray);
}

/** Aba visível? Usado para soltar câmeras, replay e animações quando a aba some. */
export function useVisible() {
  return useSyncExternalStore(browserVisibility.subscribe, browserVisibility.isVisible, () => true);
}

/** A bandeja só oferece "Abrir no navegador" quando a janela expõe essa API (evento pywebviewready). */
export function useBrowserApi() {
  const [available, setAvailable] = useState(() => !!window.pywebview?.api?.open_browser);
  useEffect(() => {
    const check = () => setAvailable(!!window.pywebview?.api?.open_browser);
    window.addEventListener('pywebviewready', check);
    return () => window.removeEventListener('pywebviewready', check);
  }, []);
  return available;
}
