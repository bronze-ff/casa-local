import { useEffect, useState } from 'react';

/** true enquanto a aba está visível; reage a visibilitychange. */
export function useVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/**
 * Roda `start()` só com a aba visível e devolve o `stop` dele como cleanup. Ocultar fecha tudo (WS, vídeo, URL, handlers);
 * voltar a ficar visível abre NO MÁXIMO um novo stream; sair da rota/desmontar também fecha. `deps` = o que muda o stream.
 */
export function useWhileVisible(start, deps) {
  const visible = useVisible();
  useEffect(() => {
    if (!visible) return undefined;
    return start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ...deps]);
  return visible;
}
