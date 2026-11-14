// Rota por hash, bandeja e layout. Funções puras, testáveis no Node.

export const ROUTE_NAMES = ['', 'luzes', 'clima', 'tv', 'local', 'cameras', 'lab', 'central'];

/** '?tray=1' é o popup; '?tray=1&alerta=1' é o alerta. Qualquer outra coisa é o painel normal (null). */
export function readTray(search = '') {
  const query = new URLSearchParams(search);
  if (query.get('tray') !== '1') return null;
  return query.get('alerta') === '1' ? 'alerta' : 'popup';
}

/**
 * Aceita #/nome/param, #nome e #nome:p1:p2 (links antigos das notificações).
 * 'oculto' e 'alerta' são da bandeja. Nome desconhecido cai no Início (name '').
 */
export function parseHash(hash = '', names = ROUTE_NAMES) {
  const raw = decodeURIComponent(String(hash).replace(/^#\/?/, ''));
  const cut = raw.search(/[/:]/);
  const name = cut < 0 ? raw : raw.slice(0, cut);
  const known = names.includes(name) || name === 'oculto' || name === 'alerta';
  return { name: known ? name : '', param: known && cut >= 0 ? raw.slice(cut + 1) : '' };
}

export const hrefFor = (name, param) => `#/${name}${param ? `/${param}` : ''}`;

/** mobile < 760 (tabbar) · tablet 760–1099 (rail) · desktop 1100–1599 (sidebar) · wide ≥ 1600.
 *  A bandeja abre do tamanho de um tablet e usa o layout 'tablet'; estreita (tela pequena ou o alerta) cai em 'tray'. */
export function layoutFor(width, tray) {
  if (tray) return width >= 760 ? 'tablet' : 'tray';
  if (width < 760) return 'mobile';
  if (width < 1100) return 'tablet';
  return width < 1600 ? 'desktop' : 'wide';
}
