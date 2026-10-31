import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createHomeStore } from './homeStore.js';
import { createPoller } from './polling.js';

// Token da sessão local: vem do /api/bootstrap e vai em todo POST (o servidor recusa sem ele).
let token = null;

export class ApiError extends Error {
  constructor(message, status, code, receipt = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.receipt = receipt; // prova do comando (backend), preservada também em erro HTTP
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { cache: 'no-store', ...options });
  } catch {
    throw new ApiError('Sem conexão com o PC de casa.', 0, 'offline');
  }
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    if (data?.code === 'invalid_token') token = null;
    throw new ApiError(data?.error || `Falha (${response.status}).`, response.status, data?.code, data?.receipt ?? null);
  }
  return data;
}

export async function bootstrap() {
  const data = await request('/api/bootstrap');
  token = data.csrfToken;
  return data;
}

export const get = (path) => request(path);

export async function post(path, body = {}) {
  if (!token) await bootstrap();
  const send = () => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Casa-Token': token }, body: JSON.stringify(body) });
  try {
    return await send();
  } catch (error) {
    // O servidor reiniciou e trocou o token: renova uma vez e repete.
    if (error.code !== 'invalid_token') throw error;
    await bootstrap();
    return send();
  }
}

/** Store único da casa (snapshots, comandos por físico). Singleton: sobrevive a #oculto e à troca de rota. */
export const homeStore = createHomeStore({ bootstrap, get, post, ApiError });
const noSubscribe = () => () => {};
export const useHomeStore = () => useSyncExternalStore(homeStore.subscribe, homeStore.getSnapshot);

const browserTimers = { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (id) => window.clearTimeout(id) };
const browserVisibility = {
  isVisible: () => document.visibilityState === 'visible',
  subscribe(listener) {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
};

/** UM poll compartilhado de /api/state enquanto `enabled`: single-flight, pausa oculto, nenhum timer órfão. */
export function useStatePoll(enabled, every = 5000) {
  useEffect(() => {
    if (!enabled) return undefined;
    const poller = createPoller({ read: ({ isCurrent }) => homeStore.refresh({ force: true, isCurrent }), every, visibility: browserVisibility, timers: browserTimers });
    poller.start();
    return () => poller.stop();
  }, [enabled, every]);
}

/** Lê `path` agora e a cada `every` ms enquanto a aba está visível. `null` pausa. */
export function usePoll(path, every = 5000) {
  const [state, setState] = useState({ data: null, error: null, at: 0 });
  const poller = useRef(null);
  const shared = path === '/api/state'; // o snapshot da casa é UM só: usa a store em vez de um poll próprio
  const store = useSyncExternalStore(shared ? homeStore.subscribe : noSubscribe, homeStore.getSnapshot); // só assina a store quem usa /api/state
  useEffect(() => {
    if (!path || shared) return undefined;
    const mine = createPoller({
      read: () => get(path), // poll próprio: o poller já descarta no onData, não há store por trás
      every,
      onData: (data) => setState({ data, error: null, at: Date.now() }),
      onError: (error) => setState((old) => ({ ...old, error })),
      visibility: browserVisibility,
      timers: browserTimers,
    });
    poller.current = mine;
    mine.start();
    return () => { mine.stop(); if (poller.current === mine) poller.current = null; };
  }, [path, every, shared]);
  const reload = useCallback(() => (shared ? homeStore.refresh().catch(() => {}) : poller.current?.refresh() ?? Promise.resolve()), [shared]);
  if (shared) return { data: store.home, error: store.stateError, at: store.homeAt, reload, stale: !!store.stateError && !!store.home };
  return { ...state, reload, stale: !!state.error && !!state.data };
}

export const fmtTime = (value) => {
  if (value == null) return '—';
  const date = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const fmtAgo = (value) => {
  if (value == null) return '—';
  const ms = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : new Date(value).getTime();
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
};
