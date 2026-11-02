import { useEffect, useRef } from 'react';
import { createMediaGate } from './gate.js';

const browser = {
  isVisible: () => document.visibilityState !== 'hidden',
  subscribe(fn) { document.addEventListener('visibilitychange', fn); return () => document.removeEventListener('visibilitychange', fn); },
};

/**
 * Liga a mídia à visibilidade: `start(chave)` devolve o "desfazer". A chave identifica o stream (câmera + modo).
 * Sair da tela ou ocultar a aba fecha tudo. Devolve nada: o estado visível quem quiser lê de useVisible (core).
 */
export function useMediaGate(key, start) {
  const startRef = useRef(start);
  startRef.current = start;
  const gate = useRef(null);
  useEffect(() => {
    gate.current = createMediaGate({ ...browser, start: (k) => startRef.current(k) });
    return () => { gate.current.stop(); gate.current = null; };
  }, []);
  useEffect(() => { gate.current?.set(key); }, [key]);
}
