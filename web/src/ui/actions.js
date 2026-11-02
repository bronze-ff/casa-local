import { useCallback, useState } from 'react';
import { home, resultNotice } from '../core/home.js';
import { useToast } from './kit.jsx';

/**
 * Ação com POST. Aparelho e modo passam pela store (exclusão por físico, recibo); o resto mantém busy local.
 * Erro vai para o toast em linguagem humana; modo parcial avisa. Devolve o resultado ou null. Nunca repete sozinho.
 */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (path, body, okText) => {
    setBusy(true);
    try {
      const result = await home.run(path, body);
      const notice = resultNotice(path, result);
      if (notice.kind === 'warn') toast(notice.text, 'warn');
      else if (okText) toast(okText);
      return result;
    } catch (error) {
      toast(error.message, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return [run, busy];
}
