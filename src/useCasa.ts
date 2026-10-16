import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bootstrap, CasaState } from './types';

async function localFetch(path: string, options: RequestInit = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(path, {...options, signal: controller.signal}); }
  finally { clearTimeout(timer); }
}

export function useCasa() {
  const [data, setData] = useState<CasaState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const token = useRef('');
  const busyRef = useRef(false);
  const polling = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announce = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 4200);
  }, []);
  const connect = useCallback(async () => {
    try {
      const response = await localFetch('/api/bootstrap', {cache: 'no-store'});
      if (!response.ok) throw new Error();
      const value: Bootstrap = await response.json();
      if (!value.csrfToken || !Array.isArray(value.devices)) throw new Error();
      token.current = value.csrfToken;
      setData(value); setError('');
    } catch { setError('A central não está disponível. Confira se ela está ligada e tente novamente.'); }
  }, []);
  useEffect(() => {
    void connect();
    const onOnline = () => void connect();
    window.addEventListener('online', onOnline);
    const interval = setInterval(async () => {
      if (document.hidden || busyRef.current || polling.current) return;
      // Sem sessão (central fora do ar ao abrir): tenta reconectar sozinho a cada 5 s.
      if (!token.current) { void connect(); return; }
      polling.current = true;
      try {
        const response = await localFetch('/api/state', {cache: 'no-store'});
        if (!response.ok) throw new Error();
        const value: CasaState = await response.json();
        if (Array.isArray(value.devices)) { setData(value); setError(''); }
      } catch { setError('Sem comunicação com a central. Os controles estão pausados.'); }
      finally { polling.current = false; }
    }, 5000);
    return () => { clearInterval(interval); clearTimeout(noticeTimer.current); window.removeEventListener('online', onOnline); };
  }, [connect]);
  const send = useCallback(async (id: string, path: string, payload: unknown, success?: string, timeout = 20000) => {
    if (busyRef.current || !token.current) return;
    busyRef.current = true; setBusy(id);
    try {
      const post = () => localFetch(path, {
        method: 'POST', cache: 'no-store',
        headers: {'Content-Type': 'application/json', 'X-Casa-Token': token.current},
        body: JSON.stringify(payload),
      }, timeout);
      let response = await post();
      let value = await response.json();
      // O servidor gera um token novo a cada reinício. O pedido recusado por token vencido nunca
      // foi executado, então renovar a sessão e repetir uma única vez é seguro.
      if (response.status === 403 && value.code === 'invalid_token') {
        await connect();
        response = await post();
        value = await response.json();
      }
      if (!response.ok) {
        throw new Error(typeof value.error === 'string' ? value.error : 'Não foi possível concluir a ação.');
      }
      const next = value.state;
      if (next && Array.isArray(next.devices) && Array.isArray(next.scenes)) setData(next);
      setError('');
      if (value.status === 'partial') announce('Cena incompleta. Confira as falhas em Últimas ações.');
      else if (success) announce(data?.mode === 'preview' ? `${success} · somente na prévia` : success);
      else if (value.command?.message) announce(value.command.message);
      else if (typeof value.message === 'string') announce(value.message);
      return value;
    } catch (cause) {
      if (cause instanceof TypeError || (cause instanceof DOMException && cause.name === 'AbortError')) {
        setError('Sem resposta da central. Confira a conexão antes de repetir o comando.');
        announce('Sem resposta. Confira o aparelho antes de repetir.');
      } else announce(cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.');
      return null;
    } finally { busyRef.current = false; setBusy(null); }
  }, [announce, connect, data?.mode]);
  const command = (id: string, values: Record<string, unknown>) => send(id, `/api/devices/${encodeURIComponent(id)}/commands`, {action: 'set', values});
  const key = (id: string, keyName: string) => send(id, `/api/devices/${encodeURIComponent(id)}/commands`, {action: 'key', key: keyName});
  const scene = (id: string, name: string) => send(id, `/api/scenes/${encodeURIComponent(id)}/run`, {}, `${name} aplicada`);
  const discover = () => send('discovery', '/api/discovery', {});
  // Aprender um botão do controle original: a central espera até 25 s pelo sinal, então o
  // navegador espera mais que isso antes de desistir.
  const learn = (id: string, body: Record<string, unknown>, label: string) => send(id, `/api/devices/${encodeURIComponent(id)}/learn`, body, `Aprendido: ${label}`, 40000);
  // Pedido avulso com o token da sessão, fora da fila de "ocupado" e sem aviso (ex.: abrir e fechar
  // replays enquanto se navega na gravação). Lança Error com a mensagem do servidor.
  const call = useCallback(async (path: string, payload: Record<string, unknown>, keepalive = false) => {
    if (!token.current) await connect();
    // keepalive: o pedido segue mesmo com a página fechando (ex.: fechar o replay ao sair).
    const post = () => localFetch(path, {method: 'POST', cache: 'no-store', keepalive, headers: {'Content-Type': 'application/json', 'X-Casa-Token': token.current}, body: JSON.stringify(payload)}, 20000);
    let response = await post();
    let value = await response.json();
    if (response.status === 403 && value.code === 'invalid_token') { await connect(); response = await post(); value = await response.json(); }
    if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'Não foi possível concluir.');
    return value;
  }, [connect]);
  // Ações fora dos aparelhos (localização): mesmo token, mesma fila de ocupado e mesmos avisos.
  const post = (id: string, path: string, body: Record<string, unknown>, success?: string, timeout?: number) => send(id, path, body, success, timeout);
  return {data, error, busy, notice, connect, command, key, scene, discover, learn, post, call};
}
