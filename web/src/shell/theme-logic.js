// Parte pura do tema (sem React), testável no Node.
export const THEMES = ['auto', 'claro', 'escuro'];
export const LABEL = { auto: 'Tema: automático', claro: 'Tema: claro', escuro: 'Tema: escuro' };
const KEY = 'casa.tema';

export const nextTheme = (current) => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length] || 'auto';
export const attributeFor = (theme, tray) => (tray ? 'escuro' : theme === 'auto' ? null : theme);

export function readTheme(storage) {
  try { const value = storage?.getItem(KEY); return THEMES.includes(value) ? value : 'auto'; } catch { return 'auto'; }
}

