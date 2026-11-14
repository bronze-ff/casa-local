// Navegação e guardas do shell. Funções puras, testáveis no Node.

export const DESTINATIONS = {
  '': { title: 'Início', icon: 'home', hint: 'Resumo da casa' },
  luzes: { title: 'Luzes', icon: 'luz', hint: 'Brilho, cor e cenas' },
  clima: { title: 'Clima', icon: 'ar', hint: 'Ar-condicionado e temperatura' },
  tv: { title: 'TV', icon: 'tv', hint: 'Controle por infravermelho e pela rede' },
  local: { title: 'Local', icon: 'pin', hint: 'Onde cada pessoa está' },
  cameras: { title: 'Câmeras', icon: 'cam', hint: 'Câmeras, movimento e replay' },
  lab: { title: 'Lab', icon: 'lab', hint: 'Servidor, serviços e modo jogo' },
  central: { title: 'Central', icon: 'central', hint: 'Rotinas, modos, avisos e saúde' },
};

/** Busca da barra superior: destinos e aparelhos que casam com o texto (sem acento e sem caixa). Função pura. */
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DEVICE_ROUTE = { light: 'luzes', climate: 'clima', tv: 'tv' };
export function searchItems(query, devices = [], cameras = []) {
  const q = fold(query).trim();
  if (!q) return [];
  const hit = (...texts) => texts.some((t) => fold(t).includes(q));
  const items = [];
  for (const [name, d] of Object.entries(DESTINATIONS)) if (hit(d.title, d.hint)) items.push({ key: `r:${name}`, name, param: '', label: d.title, kind: 'Seção', icon: d.icon });
  for (const d of devices) if (DEVICE_ROUTE[d.kind] && hit(d.name)) items.push({ key: `d:${d.id}`, name: DEVICE_ROUTE[d.kind], param: d.kind === 'light' ? d.id : '', label: d.name, kind: 'Aparelho', icon: DESTINATIONS[DEVICE_ROUTE[d.kind]].icon });
  for (const c of cameras) if (hit(c.name)) items.push({ key: `c:${c.id}`, name: 'cameras', param: c.id, label: c.name, kind: 'Câmera', icon: 'cam' });
  return items.slice(0, 8);
}
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
