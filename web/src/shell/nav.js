// Navegação e guardas do shell. Funções puras, testáveis no Node.

export const DESTINATIONS = {
  '': { title: 'Início', icon: 'home' },
  luzes: { title: 'Luzes', icon: 'luz' },
  clima: { title: 'Clima', icon: 'ar' },
  tv: { title: 'TV', icon: 'tv' },
  local: { title: 'Local', icon: 'pin' },
  cameras: { title: 'Câmeras', icon: 'cam' },
  lab: { title: 'Lab', icon: 'lab' },
  central: { title: 'Central', icon: 'central' },
};
/** As cinco telas do dia a dia, na mesma ordem em todo layout. */
export const MAIN = ['', 'cameras', 'clima', 'luzes', 'tv'];
/** O resto fica atrás de "Mais" (celular e bandeja) ou num grupo menor no fim da barra lateral. */
export const MORE = ['local', 'lab', 'central'];
export const SIDEBAR = [...MAIN, ...MORE];
export const MOBILE_TABS = MAIN;

export const mobileTabActive = (name) => (MAIN.includes(name) ? name : 'mais');

/** Destinos alcançáveis por navegação em cada layout (para provar que nenhuma rota some em nenhum tamanho). */
export function reachable(layout) {
  if (layout === 'mobile') return [...MOBILE_TABS, ...MORE];
  return [...SIDEBAR]; // os outros layouts alcançam as oito pela barra lateral ou por "Mais"
}

/**
 * Guardas por modo:
 *  - #oculto (popup da bandeja dormente): nada montado, nenhum poll, nenhuma câmera.
 *  - janela de alerta (?tray=1&alerta=1): só #alerta existe; qualquer outra rota fica dormente.
 *  - #alerta no painel normal ou no popup: não vale; cai no Início.
 */
export function resolveRoute(route, tray) {
  if (route.name === 'oculto') return { kind: 'dormant' };
  if (tray === 'alerta') return route.name === 'alerta' ? { kind: 'alert', param: route.param } : { kind: 'dormant' };
  return { kind: 'shell', route: route.name === 'alerta' ? { name: '', param: '' } : route };
}

/** Selo de conexão em linguagem humana. Prévia nunca parece a casa real. */
export function connectionOf({ online, mode }) {
  if (!online) return { kind: 'err', label: 'Sem conexão' };
  if (mode === 'preview') return { kind: 'sim', label: 'Prévia · nada é enviado' };
  return { kind: 'ok', label: 'Rede local' };
}
