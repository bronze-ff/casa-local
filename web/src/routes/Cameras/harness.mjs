// Render estático de Câmeras: hooks do núcleo trocados (inclui useVisible), POST e GET falsos que só anotam.
import { fileURLToPath } from 'node:url';
import { available, createLoader, web } from '../../ui/harness.mjs';

export { available };
export const skip = available ? false : 'React/esbuild indisponíveis (defina CASA_WEB_ROOT)';
const src = (file) => fileURLToPath(new URL(`../../${file}`, import.meta.url));
const idle = { data: null, error: null, stale: false, at: 0, reload() {} };

export function setupCameras({ home = { mode: 'local', devices: [] }, homeAt = Date.now(), stateError = null, layout = 'desktop', polls = {}, visible = true, posts = [], gets = [] } = {}) {
  const hooks = {
    useHome: () => ({ home, homeAt, stateError, bootError: null, commands: {} }),
    usePoll: (path) => { if (path) gets.push(path); return path ? polls[path] || idle : idle; },
    useCommand: () => null,
    useVisible: () => visible,
  };
  const store = { home: { run: async (path, body) => { posts.push([path, body]); return {}; } }, resultNotice: () => ({ kind: 'ok' }) };
  const api = { get: async () => ({}), post: async (path, body) => { posts.push([path, body]); return {}; } };
  const load = createLoader({ stubs: { 'core/hooks.js': hooks, 'core/home.js': store, 'core/api.js': api } });
  const React = web('react');
  const { renderToStaticMarkup } = web('react-dom/server');
  const { ShellContext } = load(src('shell/context.js'));
  const mod = (file) => load(src(`routes/${file}`));
  return {
    load, mod, h: React.createElement, posts, gets,
    render: (Component, props = {}) => renderToStaticMarkup(React.createElement(ShellContext.Provider, { value: { layout, mode: home?.mode } }, React.createElement(Component, props))),
    bare: (el) => renderToStaticMarkup(el),
  };
}
export const CAMS = [
  { id: 'cam1', name: 'Externa 1', group: 'externa' }, { id: 'cam2', name: 'Externa 2', group: 'externa' },
  { id: 'cam3', name: 'Interna 1', group: 'interna' }, { id: 'cam4', name: 'Interna 2', group: 'interna' },
];
export const count = (html, pattern) => (html.match(pattern) || []).length;
