import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ErrorBoundary: falha de uma tela vira aviso acessível com botão explícito; nada recarrega sozinho. O comportamento no navegador
// (chunk abortado, shell e menu vivos, reset ao mudar de rota) é provado por /tmp/casalocal-browser-checks/vitral-lazy.mjs.
const requireWeb = createRequire(new URL('../package.json', import.meta.url));
const { transformSync } = requireWeb('esbuild');
const { renderToStaticMarkup: render } = requireWeb('react-dom/server');
const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function load(file) {
  file = resolve(file);
  if (file.endsWith('ui.jsx')) return { Icon: ({ name }) => `ícone-${name}` };
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = transformSync(readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code;
  new Function('require', 'module', 'exports', code)((name) => (name.startsWith('.') ? load(resolve(dirname(file), name)) : requireWeb(name)), module, module.exports);
  return module.exports;
}
const ErrorBoundary = load(resolve(root, 'ErrorBoundary.jsx')).default;

test('sem erro, repassa os filhos', () => {
  assert.equal(render(new ErrorBoundary({ children: 'conteúdo' }).render()), 'conteúdo');
});

test('getDerivedStateFromError marca a falha (cobre import lazy rejeitado e erro de render)', () => {
  assert.deepEqual(ErrorBoundary.getDerivedStateFromError(new TypeError('Failed to fetch dynamically imported module')), { failed: true });
});

test('falha: aviso PT-BR com role=alert e botão "Recarregar painel"; sem reload automático', () => {
  const boundary = new ErrorBoundary({ children: 'x' });
  boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('chunk'));
  let reloads = 0;
  globalThis.window = { location: { reload: () => { reloads += 1; } } };
  const element = boundary.render();
  const html = render(element);
  assert.match(html, /role="alert"/);
  assert.match(html, /Esta tela não abriu/);
  assert.match(html, /Nenhum comando foi enviado de novo/);
  assert.match(html, /<button[^>]*type="button"[^>]*>Recarregar painel<\/button>/);
  assert.equal(reloads, 0, 'renderizar o aviso não recarrega a página');
  const button = element.props.children[2];
  button.props.onClick();
  assert.equal(reloads, 1, 'só o clique explícito recarrega, uma vez');
});
