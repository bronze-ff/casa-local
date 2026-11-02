import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Integração com React/ReactDOM REAIS (createRoot + act) e um DOM MÍNIMO FALSO (só o que o React exige para montar componentes sem
// elementos); fetch falso. Prova os EFEITOS (poll, visibilidade, limpeza ao desmontar) que SSR não executa. NÃO é navegador:
// não cobre layout, <dialog>, foco, WebSocket, MediaSource nem eventos reais.
const CASA_WEB = process.env.CASA_WEB_ROOT || '/home/filippe/CasaLocal/web';
const requireWeb = createRequire(`${CASA_WEB}/package.json`);
const React = requireWeb('react');
const { createRoot } = requireWeb('react-dom/client');
const { transformSync } = requireWeb('esbuild');
const src = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const listeners = new Map();
const doc = {
  nodeType: 9, visibilityState: 'visible', activeElement: null,
  addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
  removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
  documentElement: { namespaceURI: 'http://www.w3.org/1999/xhtml' },
};
const win = { document: doc, HTMLElement: class {}, HTMLIFrameElement: class {}, setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {}, innerWidth: 1280 };
doc.defaultView = win;
Object.assign(globalThis, { window: win, document: doc, IS_REACT_ACT_ENVIRONMENT: true });
const container = { nodeType: 1, tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: doc, addEventListener() {}, removeEventListener() {}, firstChild: null };

const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic', target: 'node20' }).code;
  new Function('require', 'module', 'exports', code)((name) => (name.startsWith('.') ? load(resolve(dirname(file), name)) : requireWeb(name)), module, module.exports);
  return module.exports;
}
const { home } = load(resolve(src, 'core/home.js'));
const hooks = load(resolve(src, 'core/hooks.js'));
const { confidenceOf } = load(resolve(src, 'ui/confidence.js'));
const { useMediaGate } = load(resolve(src, 'routes/Cameras/useMedia.js'));

const flush = () => new Promise((done) => setImmediate(done));
const snapshot = (revision, power) => ({ stateVersion: { epoch: 'A', revision }, mode: 'local', devices: [{ id: 'quarto-luz', physicalId: 'physical-1', state: { power, brightness: 50 }, confidence: 'reported' }], csrfToken: 'token-sintetico' });
const answer = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
const hide = (hidden) => { doc.visibilityState = hidden ? 'hidden' : 'visible'; for (const fn of listeners.get('visibilitychange') || []) fn(); };

let reads = [];
const stray = []; // leituras pendentes de testes anteriores: destravadas antes de cada teste para não vazarem para o próximo
function fakeServer(extra = () => null) {
  stray.push(...reads);
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
  const root = createRoot(container);
  await React.act(async () => { root.render(React.createElement(Component)); await flush(); });
  return root;
}
async function reset() {
  for (const release of stray.splice(0)) release(answer(snapshot(1, true)));
  await flush();
  home.reset(); doc.visibilityState = 'visible'; await home.bootstrap();
}
const power = () => home.getSnapshot().home.devices[0].state.power;

test('ocultar durante o GET compartilhado: a resposta velha não é publicada; ao reexibir, a leitura nova vale', async () => {
  fakeServer();
  await reset();
  const root = await mount(function Probe() { hooks.useStatePoll(true, 600000); return null; });
  assert.equal(reads.length, 1, 'um GET em voo');
  await React.act(async () => { hide(true); await flush(); });
  await React.act(async () => { reads[0](answer(snapshot(13, false))); await flush(); });
  assert.equal(power(), true, 'a resposta de antes de ocultar foi descartada');
  await React.act(async () => { hide(false); await flush(); });
  assert.equal(reads.length, 2, 'ao voltar, uma leitura nova');
  await React.act(async () => { reads[1](answer(snapshot(14, false))); await flush(); });
  assert.equal(power(), false);
  await React.act(async () => root.unmount());
  hide(false);
});

test('ocultar e reexibir com leitura pendente mantém UMA leitura; a nova só sai depois da real', async () => {
  fakeServer();
  await reset();
  const root = await mount(function Probe() { hooks.useStatePoll(true, 600000); return null; });
  await React.act(async () => { for (let i = 0; i < 3; i += 1) { hide(true); hide(false); } await flush(); });
  assert.equal(reads.length, 1, 'ocultar/reexibir não abre outra leitura em cima da pendente');
  await React.act(async () => { reads[0](answer(snapshot(13, true))); await flush(); });
  assert.equal(reads.length, 2, 'só depois da real termina, lê de novo (a primeira foi descartada)');
  await React.act(async () => root.unmount());
  assert.equal((listeners.get('visibilitychange') || new Set()).size, 0, 'nenhum ouvinte de visibilidade fica órfão');
});

test('desmontar para o poll: nenhum GET novo, nenhum timer, nenhum ouvinte', async () => {
  fakeServer();
  await reset();
  const root = await mount(function Probe() { hooks.useStatePoll(true, 600000); return null; });
  await React.act(async () => root.unmount());
  await React.act(async () => { reads.forEach((resolve_) => resolve_(answer(snapshot(20, false)))); await flush(); });
  assert.equal(reads.length, 1);
  assert.equal(power(), true, 'resposta de poll parado é descartada');
  assert.equal((listeners.get('visibilitychange') || new Set()).size, 0);
});

test('modo parcial com power NÃO confirmado nunca mostra "Confirmado" (store + selo reais)', async () => {
  const receipt = { requestId: 'mode-r', stateVersion: { epoch: 'A', revision: 13 }, outcome: 'unconfirmed', delivery: 'sent', requested: { power: false }, reported: { brightness: 50 }, confirmedFields: [], divergedFields: [], observedAt: '2026-10-31T20:00:00Z' };
  fakeServer((url, options) => (options.method === 'POST' ? answer({ state: snapshot(13, true), stateVersion: { epoch: 'A', revision: 13 }, status: 'partial', results: [{ deviceId: 'quarto-luz', status: 'acknowledged', operation: 'accepted', evidence: 'unconfirmed', confirmationExpected: true, receipt }], evidenceSummary: { confirmed: 0, unconfirmed: 1, operationalFailures: 0 } }) : null));
  await reset();
  let seen;
  const root = await mount(function Probe() { const { home: current } = hooks.useHome(); const command = hooks.useCommand('quarto-luz'); seen = { kind: confidenceOf(current.devices[0], command), command }; return null; });
  await React.act(async () => { await home.run('/api/scenes/exemplo/run', {}); await flush(); });
  assert.equal(seen.kind, 'sent');
  assert.equal(home.commandFor('quarto-luz').receipt.reported.brightness, 50);
  await React.act(async () => root.unmount());
});

test('usePoll(/api/state).at é o horário real da última aplicação e não muda com o erro', async () => {
  let failing = true;
  fakeServer((url) => (url === '/api/state' ? (failing ? Promise.reject(new TypeError('offline')) : answer(snapshot(20, true))) : null));
  await reset();
  const applied = home.getSnapshot().homeAt;
  assert.ok(applied > 1e12, 'timestamp real, não 1/1970');
  let seen;
  const root = await mount(function Probe() { seen = hooks.usePoll('/api/state', 0); return null; });
  assert.equal(seen.at, applied);
  await React.act(async () => { await home.refresh({ force: true }).catch(() => {}); });
  assert.ok(seen.error, 'erro visível');
  assert.equal(seen.at, applied, 'erro não renova o horário');
  failing = false;
  await new Promise((done) => setTimeout(done, 5));
  await React.act(async () => { await home.refresh({ force: true }); });
  assert.ok(seen.at >= applied && seen.error === null);
  await React.act(async () => root.unmount());
});

test('porta de mídia com o efeito REAL: abre uma vez, fecha ao ocultar, troca de câmera, id nulo não abre, desmontar fecha UMA vez', async () => {
  doc.visibilityState = 'visible';
  const log = { opened: [], closed: [] };
  let setKey;
  function Probe() {
    const [key, set] = React.useState('cam1');
    setKey = set;
    useMediaGate(key, (k) => { log.opened.push(k); return () => log.closed.push(k); });
    return null;
  }
  const root = await mount(Probe);
  assert.deepEqual(log, { opened: ['cam1'], closed: [] });
  await React.act(async () => { hide(true); await flush(); });
  assert.deepEqual(log, { opened: ['cam1'], closed: ['cam1'] }, 'ocultar fecha');
  await React.act(async () => { hide(false); hide(false); await flush(); });
  assert.deepEqual(log.opened, ['cam1', 'cam1'], 'reexibir abre no máximo um');
  await React.act(async () => { setKey('cam2'); await flush(); });
  assert.deepEqual(log, { opened: ['cam1', 'cam1', 'cam2'], closed: ['cam1', 'cam1'] }, 'trocar fecha a anterior e abre uma');
  await React.act(async () => { setKey(null); await flush(); });
  assert.equal(log.closed.at(-1), 'cam2');
  assert.equal(log.opened.length, 3, 'chave nula nunca abre');
  await React.act(async () => { setKey('cam3'); await flush(); });
  await React.act(async () => root.unmount());
  assert.deepEqual(log.opened, ['cam1', 'cam1', 'cam2', 'cam3']);
  assert.equal(log.closed.filter((k) => k === 'cam3').length, 1, 'desmontar fecha uma vez');
  assert.equal((listeners.get('visibilitychange') || new Set()).size, 0);
});
