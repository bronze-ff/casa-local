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
/** Barra lateral, rail e ícones da bandeja: as oito, sempre. */
export const SIDEBAR = ['', 'luzes', 'clima', 'tv', 'local', 'cameras', 'lab', 'central'];
/** Barra inferior do celular: quatro destinos + "Mais", que abre as outras quatro. */
export const MOBILE_TABS = ['', 'luzes', 'clima', 'cameras'];
export const MORE = ['tv', 'local', 'lab', 'central'];

export const mobileTabActive = (name) => (MOBILE_TABS.includes(name) ? name : 'mais');

/** Destinos alcançáveis por navegação em cada layout (para provar que nenhuma rota some em nenhum tamanho). */
export function reachable(layout) {
  if (layout === 'mobile') return [...MOBILE_TABS, ...MORE];
  return [...SIDEBAR]; // tablet, desktop, wide e bandeja listam as oito
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
