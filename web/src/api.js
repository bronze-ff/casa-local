import { useCallback, useEffect, useRef, useState } from 'react';

// Token da sessão local: vem do /api/bootstrap e vai em todo POST (o servidor recusa sem ele).
let token = null;

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
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
    throw new ApiError(data?.error || `Falha (${response.status}).`, response.status, data?.code);
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

/** Lê `path` agora e a cada `every` ms enquanto a aba está visível. `null` pausa. */
export function usePoll(path, every = 5000) {
  const [state, setState] = useState({ data: null, error: null, at: 0 });
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const data = await get(path);
      if (alive.current) setState({ data, error: null, at: Date.now() });
    } catch (error) {
      if (alive.current) setState((old) => ({ ...old, error }));
    }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    load();
    if (!every) return () => { alive.current = false; };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, every);
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
  }, [load, every]);
  return { ...state, reload: load, stale: !!state.error && !!state.data };
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
