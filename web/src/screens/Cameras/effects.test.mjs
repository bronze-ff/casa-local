import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Efeitos de mídia com React REAL (createRoot + act): ocultar fecha, voltar abre no máximo 1, trocar de rota/câmera e desmontar fecham.
// O pipeline é o mesmo de Live/Replay: useWhileVisible + attachMse, com WebSocket/MediaSource/URL falsos (sem stream real).
const requireWeb = createRequire(new URL('../../../package.json', import.meta.url));
const React = requireWeb('react');
const { createRoot } = requireWeb('react-dom/client');
const { transformSync } = requireWeb('esbuild');
const root = dirname(fileURLToPath(import.meta.url));

const listeners = new Map();
const doc = { nodeType: 9, visibilityState: 'visible', activeElement: null, addEventListener(n, f) { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(f); }, removeEventListener(n, f) { listeners.get(n)?.delete(f); }, documentElement: { namespaceURI: 'http://www.w3.org/1999/xhtml' } };
class FakeSource { constructor() { this.listeners = {}; } addEventListener(name, fn) { this.listeners[name] = fn; } static isTypeSupported() { return true; } }
const sockets = []; const urls = { made: [], revoked: [] };
class FakeSocket { constructor(url) { this.url = url; this.closed = 0; this.sent = []; sockets.push(this); } send(d) { this.sent.push(d); } close() { this.closed += 1; } }
const win = { document: doc, MediaSource: FakeSource, HTMLElement: class {}, HTMLIFrameElement: class {}, setTimeout, clearTimeout };
doc.defaultView = win;
Object.assign(globalThis, { window: win, document: doc, IS_REACT_ACT_ENVIRONMENT: true, location: { protocol: 'http:', host: 'casa.local' }, WebSocket: FakeSocket });
globalThis.URL = Object.assign(Object.create(URL), { createObjectURL: () => { const u = `blob:${urls.made.length}`; urls.made.push(u); return u; }, revokeObjectURL: (u) => urls.revoked.push(u) });
const container = { nodeType: 1, tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: doc, addEventListener() {}, removeEventListener() {}, firstChild: null };

const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = transformSync(readFileSync(file, 'utf8'), { loader: 'js', format: 'cjs' }).code;
  new Function('require', 'module', 'exports', code)((name) => (name.startsWith('.') ? load(resolve(dirname(file), name)) : requireWeb(name)), module, module.exports);
  return module.exports;
}
const { useWhileVisible } = load(resolve(root, 'useMedia.js'));
const { attachMse } = load(resolve(root, 'mse.js'));

const fakeVideo = () => ({ paused: true, currentTime: 0, src: '', srcObject: undefined, addEventListener() {}, removeEventListener() {}, pause() {}, play: async () => {}, removeAttribute() { this.src = ''; }, load() {} });
function Stream({ id }) {
  const video = React.useMemo(fakeVideo, [id]);
  useWhileVisible(() => attachMse(video, `/api/cameras/${id}/ws`, () => {}, () => {}), [id]);
  return null;
}
const h = React.createElement;
const flush = () => new Promise((done) => setImmediate(done));
const active = () => sockets.filter((s) => s.closed === 0);
const setHidden = async (hidden) => { doc.visibilityState = hidden ? 'hidden' : 'visible'; await React.act(async () => { for (const fn of listeners.get('visibilitychange') || []) fn(); await flush(); }); };
const reset = () => { sockets.length = 0; urls.made.length = 0; urls.revoked.length = 0; doc.visibilityState = 'visible'; };
async function mount(id = 'cam1') {
  const react = createRoot(container);
  await React.act(async () => { react.render(h(Stream, { id })); await flush(); });
  return react;
}
const rerender = (react, id) => React.act(async () => { react.render(h(Stream, { id })); await flush(); });

test('abrir câmera: um socket aberto, nada fechado', async () => {
  reset();
  const react = await mount();
  assert.equal(sockets.length, 1);
  assert.equal(active().length, 1);
  await React.act(async () => react.unmount());
});

test('ocultar a aba fecha o stream (socket, URL), sem abrir outro; o diálogo segue montado', async () => {
  reset();
  const react = await mount();
  await setHidden(true);
  assert.equal(sockets.length, 1, 'não abre segundo stream');
  assert.equal(sockets[0].closed, 1, 'socket fechado ao ocultar');
  assert.deepEqual(urls.revoked, urls.made, 'URLs revogadas');
  assert.equal(active().length, 0);
  await React.act(async () => react.unmount());
  assert.equal(sockets[0].closed, 1, 'desmontar depois de oculto não fecha de novo');
});

test('voltar a ficar visível abre no máximo UM stream; ocultar/mostrar várias vezes nunca acumula', async () => {
  reset();
  const react = await mount();
  for (let i = 0; i < 3; i += 1) {
    await setHidden(true);
    assert.equal(active().length, 0);
    await setHidden(false);
    assert.equal(active().length, 1, `ciclo ${i}: exatamente 1 stream`);
  }
  assert.equal(sockets.length, 4);
  await setHidden(false); // notificação repetida
  assert.equal(sockets.length, 4);
  await React.act(async () => react.unmount());
  assert.equal(active().length, 0);
  assert.deepEqual(urls.revoked, urls.made);
});

test('trocar de câmera visível fecha a anterior e abre uma; trocar OCULTO não abre nada até voltar', async () => {
  reset();
  const react = await mount('cam1');
  await rerender(react, 'cam2');
  assert.equal(sockets[0].closed, 1);
  assert.equal(active().length, 1);
  assert.match(active()[0].url, /cam2/);
  await setHidden(true);
  await rerender(react, 'cam3');
  assert.equal(sockets.length, 2, 'oculto: nenhuma conexão nova');
  await setHidden(false);
  assert.equal(active().length, 1);
  assert.match(active()[0].url, /cam3/);
  await React.act(async () => react.unmount());
});

test('sair da rota (desmontar) fecha o stream uma vez e revoga todas as URLs', async () => {
  reset();
  const react = await mount();
  await rerender(react, 'cam2');
  await React.act(async () => react.unmount());
  assert.deepEqual(sockets.map((s) => s.closed), [1, 1]);
  assert.equal(urls.revoked.length, urls.made.length);
  assert.equal(urls.made.length, 2);
});
