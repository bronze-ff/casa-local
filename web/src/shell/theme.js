// Tema: segue o sistema por padrão; o usuário pode fixar claro ou escuro. A bandeja é sempre escura.
import { useEffect, useState } from 'react';
import { attributeFor, nextTheme, readTheme } from './theme-logic.js';

const KEY = 'casa.tema';

export function useTheme(tray) {
  const [theme, setTheme] = useState(() => readTheme(globalThis.localStorage));
  useEffect(() => {
    const value = attributeFor(theme, tray);
    if (value) document.documentElement.dataset.theme = value; else delete document.documentElement.dataset.theme;
  }, [theme, tray]);
  const cycle = () => setTheme((old) => {
    const next = nextTheme(old);
    try { globalThis.localStorage?.setItem(KEY, next); } catch { /* sem armazenamento: vale só nesta sessão */ }
    return next;
  });
  return [theme, cycle];
}
