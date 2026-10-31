import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Integração com React/ReactDOM REAIS (createRoot + act) e um DOM mínimo simulado; fetch falso, sem rede, sem navegador.
// Cobre o que SSR/stub não vê: effects, visibilidade, hooks compartilhados e a store como singleton.
const requireWeb = createRequire(new URL('../package.json', import.meta.url));
const React = requireWeb('react');
const { createRoot } = requireWeb('react-dom/client');
const { transformSync } = requireWeb('esbuild');
const root = dirname(fileURLToPath(import.meta.url));

const listeners = new Map();
const doc = {
  nodeType: 9, visibilityState: 'visible', activeElement: null,
  addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
  removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
  documentElement: { namespaceURI: 'http://www.w3.org/1999/xhtml' },
};
const win = { document: doc, HTMLElement: class {}, HTMLIFrameElement: class {}, setTimeout, clearTimeout };
doc.defaultView = win;
Object.assign(globalThis, { window: win, document: doc, IS_REACT_ACT_ENVIRONMENT: true });
const container = { nodeType: 1, tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: doc, addEventListener() {}, removeEventListener() {}, firstChild: null };

const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code;
  new Function('require', 'module', 'exports', code)((name) => (name.startsWith('.') ? load(resolve(dirname(file), name)) : requireWeb(name)), module, module.exports);
  return module.exports;
}
const api = load(resolve(root, 'api.js'));
const ui = load(resolve(root, 'ui.jsx'));

const flush = () => new Promise((done) => setImmediate(done));
const snapshot = (revision, power) => ({ stateVersion: { epoch: 'A', revision }, mode: 'local', devices: [{ id: 'quarto-luz', physicalId: 'physical-1', state: { power, brightness: 50 }, confidence: 'reported' }], csrfToken: 'token' });
const answer = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
const hide = (hidden) => { doc.visibilityState = hidden ? 'hidden' : 'visible'; for (const fn of listeners.get('visibilitychange') || []) fn(); };

let reads;
function fakeServer(extra = () => null) {
  reads = [];
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/bootstrap') return answer(snapshot(12, true));
    const custom = extra(url, options);
    if (custom) return custom;
    if (url === '/api/state') return new Promise((resolve_) => reads.push(resolve_));
    throw new TypeError('offline');
  };
}
async function mount(Component) {
  const react = createRoot(container);
  await React.act(async () => { react.render(React.createElement(Component)); await flush(); });
  return react;
}
async function reset() { api.homeStore.reset(); doc.visibilityState = 'visible'; await api.homeStore.bootstrap(); }

test('achado 4 (React real): ocultar durante o GET compartilhado não publica a resposta velha', async () => {
  fakeServer();
  await reset();
  const react = await mount(function Probe() { api.useStatePoll(true); return null; });
  assert.equal(reads.length, 1, 'um read em voo');
  await React.act(async () => { hide(true); reads[0](answer(snapshot(13, false))); await flush(); });
  assert.equal(api.homeStore.getSnapshot().home.stateVersion.revision, 12);
  assert.equal(api.homeStore.getSnapshot().home.devices[0].state.power, true);
  assert.equal(reads.length, 1, 'oculto não abre nova leitura');
  await React.act(async () => react.unmount());
});

test('achado 4 (React real): ocultar e reexibir com read pendente mantém UMA leitura; a nova só sai depois da real', async () => {
  fakeServer();
  await reset();
  const react = await mount(function Probe() { api.useStatePoll(true); return null; });
  await React.act(async () => { hide(true); hide(false); await flush(); });
  assert.equal(reads.length, 1, 'pico de 1 leitura');
  await React.act(async () => { reads[0](answer(snapshot(13, false))); await flush(); });
  assert.equal(api.homeStore.getSnapshot().home.stateVersion.revision, 12, 'resposta de antes da ocultação não vale');
  assert.equal(reads.length, 2, 'releitura depois que a real terminou');
  await React.act(async () => { reads[1](answer(snapshot(14, false))); await flush(); });
  assert.equal(api.homeStore.getSnapshot().home.stateVersion.revision, 14);
  await React.act(async () => react.unmount());
  assert.equal(api.homeStore.getSnapshot().home.stateVersion.revision, 14);
});

test('achado 3 (React real): modo parcial com power não confirmado nunca mostra Confirmado', async () => {
  const receipt = { requestId: 'mode-r', stateVersion: { epoch: 'A', revision: 13 }, outcome: 'unconfirmed', delivery: 'sent', requested: { power: false }, reported: { brightness: 50 }, confirmedFields: [], divergedFields: [], observedAt: '2026-10-31T20:00:00Z' };
  fakeServer((url, options) => (options.method === 'POST' ? answer({ state: snapshot(13, true), status: 'partial', results: [{ deviceId: 'quarto-luz', status: 'acknowledged', operation: 'accepted', evidence: 'unconfirmed', confirmationExpected: true, receipt }], evidenceSummary: { confirmed: 0, unconfirmed: 1, operationalFailures: 0 } }) : null));
  await reset();
  let seen;
  const react = await mount(function Probe() {
    const { home } = api.useHomeStore();
    seen = { action: ui.useAction(), kind: ui.useConfidence(home.devices[0]) };
    return null;
  });
  await React.act(async () => { await seen.action[0]('/api/scenes/exemplo/run', {}); });
  assert.equal(seen.kind, 'sent');
  assert.equal(api.homeStore.commandFor('quarto-luz').receipt.reported.brightness, 50);
  await React.act(async () => react.unmount());
});

test('achado 6 (React real): usePoll(/api/state).at é o horário real da última aplicação e não muda com o erro', async () => {
  let failing = true;
  fakeServer((url) => (url === '/api/state' ? (failing ? Promise.reject(new TypeError('offline')) : answer(snapshot(20, true))) : null));
  await reset();
  const applied = api.homeStore.getSnapshot().homeAt;
  assert.ok(applied > 1e12, 'timestamp real, não 1/1970');
  let seen;
  const react = await mount(function Probe() { seen = api.usePoll('/api/state', 0); return null; });
  assert.equal(seen.at, applied);
  await React.act(async () => { await api.homeStore.refresh({ force: true }).catch(() => {}); });
  assert.ok(seen.error, 'erro visível');
  assert.equal(seen.at, applied, 'erro não renova o horário');
  failing = false;
  await new Promise((done) => setTimeout(done, 5));
  await React.act(async () => { await api.homeStore.refresh({ force: true }); });
  assert.ok(seen.at >= applied && seen.error === null);
  await React.act(async () => react.unmount());
});
