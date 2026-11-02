// Render estático das rotas com React REAL (do checkout principal, só leitura) e a casa falsa. Sem rede, sem navegador.
import { fileURLToPath } from 'node:url';
import { available, createLoader, web } from '../ui/harness.mjs';

export { available };
export const skip = available ? false : 'React/esbuild indisponíveis (defina CASA_WEB_ROOT)';
const src = (file) => fileURLToPath(new URL(`../${file}`, import.meta.url));

const idle = { data: null, error: null, stale: false, at: 0, reload() {} };

/** Monta o ambiente: hooks do núcleo trocados por dados da casa falsa; o resto (kit, Overlay, Draft) é o código real. */
export function setupRoute({ home = null, homeAt = Date.now(), stateError = null, layout = 'desktop', polls = {}, commands = {}, posts = [] } = {}) {
  const hooks = {
    useHome: () => ({ home, homeAt, stateError, bootError: null, commands }),
    usePoll: (path) => (path ? polls[path] || idle : idle),
    useCommand: (id) => commands[id] || null,
  };
  const store = { home: { run: async (path, body) => { posts.push([path, body]); return {}; } }, resultNotice: () => ({ kind: 'ok' }) };
  const api = { get: async () => ({ cameras: [] }) };
  const load = createLoader({ stubs: { 'core/hooks.js': hooks, 'core/home.js': store, 'core/api.js': api } });
  const React = web('react');
  const { renderToStaticMarkup } = web('react-dom/server');
  const { ShellContext } = load(src('shell/context.js'));
  const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(ShellContext.Provider, { value: { layout, mode: home?.mode, route: { name: '', param: '' } } }, React.createElement(Component, props)));
  return { load, src, render, h: React.createElement, renderBare: (el) => renderToStaticMarkup(el) };
}

export const count = (html, pattern) => (html.match(pattern) || []).length;

export const LIGHT = (id, name, state, extra = {}) => ({ id, name, kind: 'light', roomId: id.split('-')[0], physicalId: `p-${id}`, configured: true, connection: 'online', confidence: 'reported', updatedAt: Date.now() - 12000, state, ...extra });
export const AR = (state, extra = {}) => ({ id: 'ar-quarto', name: 'Ar do quarto', kind: 'climate', physicalId: 'p-ir', configured: true, connection: 'online', confidence: 'estimated', updatedAt: Date.now() - 540000, state,
  irClimate: { coverage: { cool: { auto: [18, 22, 24], low: [20, 22] }, heat: {}, dry: {}, fan: { auto: [24] }, auto: {} }, off: true, turbo: false, extras: { eco: true }, templess: [], origins: { 'aprendido neste controle': 12 }, calibrated: false }, ...extra });
export const TV = (state = { power: null }, extra = {}) => ({ id: 'tv-quarto', name: 'TV infravermelho', kind: 'tv', physicalId: 'p-ir', configured: true, connection: 'online', confidence: 'unknown', state, ...extra });
export const HOME = (devices, extra = {}) => ({ mode: 'local', devices, scenes: [{ id: 'chegada', name: 'Chegada', icon: 'home', devices: ['quarto-luz'] }], recentActions: [], stateVersion: { epoch: 'A', revision: 3 }, ...extra });
