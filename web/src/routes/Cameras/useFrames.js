import { useEffect, useState } from 'react';
import { createFrameCycle, createFrameLoader } from '../Inicio/frames.js';

/**
 * Quadros da grade: um pedido de frame.jpg por câmera, em ciclos (3 por vez, a cada 4 s: o backend só renova a cada ~4 s e
 * responde 429 acima de 3 simultâneos). Parado com a aba oculta, em `paused` e ao sair; todas as URLs de imagem são liberadas.
 * `tick` força um ciclo novo (botão "Atualizar agora").
 */
export function useGridFrames(ids, paused, tick) {
  const [frames, setFrames] = useState({});
  const key = ids.join(',');
  useEffect(() => {
    if (!key || paused) return undefined;
    let ended = false;
    const visible = () => !document.hidden;
    const loader = createFrameLoader({
      fetchFn: (path, options) => fetch(path, options), createURL: (blob) => URL.createObjectURL(blob), revokeURL: (url) => URL.revokeObjectURL(url), active: () => !ended && visible(),
      onFrame: (id, frame) => setFrames((f) => ({ ...f, [id]: frame })), onFail: (id) => setFrames((f) => ({ ...f, [id]: { ...f[id], failed: true } })),
    });
    const cycle = createFrameCycle({
      ids: key.split(','), load: loader.load, isVisible: visible,
      subscribe: (fn) => { document.addEventListener('visibilitychange', fn); return () => document.removeEventListener('visibilitychange', fn); },
      setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id),
    });
    return () => { ended = true; cycle.stop(); loader.release(); };
  }, [key, paused, tick]);
  return frames;
}
