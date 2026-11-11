// Preparação da entrada, sem React: tema da bandeja antes da primeira pintura, som opcional salvo e cópia offline.
import { readTray } from '../core/route.js';
import { initSound } from '../routes/Central/sound.js';

/** A bandeja é sempre escura (antes de pintar, para não piscar o tema do sistema). Liga o som SÓ se o usuário já tinha ligado. */
export function prepareBoot({ search, root, init = initSound }) {
  const tray = readTray(search);
  if (tray) root.dataset.theme = 'escuro';
  init();
  return tray;
}

/** Cópia offline: só em produção e só se o navegador oferece. O sw.js nunca guarda /api/. Falha de registro não derruba nada. */
export function registerOffline({ nav, prod }) {
  if (!prod || !nav?.serviceWorker) return false;
  nav.serviceWorker.register('/sw.js').catch(() => {});
  return true;
}
