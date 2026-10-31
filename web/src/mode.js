// Funções puras do modo de exibição (bandeja, rota por hash); sem React, testáveis no Node.

/** '?tray=1' popup, '?tray=1&alerta=1' alerta da bandeja; qualquer outra coisa é o painel normal (null). */
export function readTray(search = '') {
  const query = new URLSearchParams(search);
  if (query.get('tray') !== '1') return null;
  return query.get('alerta') === '1' ? 'alerta' : 'popup';
}

/**
 * Rota do hash. Aceita #/nome/param, #nome e #nome:p1:p2 (links das notificações antigas).
 * `names` são as rotas do painel; 'oculto' e 'alerta' são da bandeja. Desconhecida cai no Início ('').
 */
export function parseHash(hash = '', names = []) {
  const raw = decodeURIComponent(hash.replace(/^#\/?/, ''));
  const cut = raw.search(/[/:]/);
  const name = cut < 0 ? raw : raw.slice(0, cut);
  const known = names.includes(name) || name === 'oculto' || name === 'alerta';
  return { name: known ? name : '', param: known && cut >= 0 ? raw.slice(cut + 1) : '' };
}

/** 'mobile' < 760 px, 'desktop' 760-1599, 'wide' >= 1600 (largura da janela); a bandeja é sempre 'tray'. */
export function layoutFor(width, tray) {
  return tray ? 'tray' : width < 760 ? 'mobile' : width < 1600 ? 'desktop' : 'wide';
}
