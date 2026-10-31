import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Lab/Início: topologia só com aparelhos vistos, métricas nulas x zero, jogo sem misturar ação aceita com fim do processo. SSR + store, sem rede.
const requireWeb = createRequire(new URL('../../../package.json', import.meta.url));
const { transformSync } = requireWeb('esbuild');
const React = requireWeb('react');
const { renderToStaticMarkup: render } = requireWeb('react-dom/server');
const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function load(file) {
  file = resolve(file);
  if (file.endsWith('api.js')) return { fmtAgo: () => 'há 1 min', fmtTime: () => '12:00', usePoll: () => ({}), homeStore: { commandFor: () => null, run: async () => ({}) }, useHomeStore: () => ({}) };
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code;
  new Function('require', 'module', 'exports', code)((name) => (name.startsWith('.') ? load(resolve(dirname(file), name)) : requireWeb(name)), module, module.exports);
  return module.exports;
}
const h = React.createElement;
const topo = load(resolve(root, 'Topology.jsx'));
const { MachineCard } = load(resolve(root, 'Stats.jsx'));
const { GameCard } = load(resolve(root, 'GameMode.jsx'));
const { ambientOf } = load(resolve(root, '../Inicio.jsx'));
const { createHomeStore } = load(resolve(root, '../../homeStore.js'));

const device = (n, extra = {}) => ({ id: `d${n}`, label: `Aparelho ${n}`, known: true, watched: false, online: true, ...extra });

test('topoLayout: dentro do quadro, sem sobreposição, começa no topo', () => {
  for (const count of [0, 1, 4, 10]) {
    const spots = topo.topoLayout(count);
    assert.equal(spots.length, count);
    assert.ok(spots.every(({ x, y }) => x >= 0 && x <= 100 && y >= 0 && y <= 100));
    assert.equal(new Set(spots.map(({ x, y }) => `${x}:${y}`)).size, count);
  }
  assert.equal(topo.topoLayout(4)[0].y, 16, 'primeiro nó no topo');
});

test('pickNodes: no máximo 10, atenção primeiro (novos, vigiados sem resposta)', () => {
  const devices = Array.from({ length: 14 }, (_, i) => device(i));
  devices[12] = device(12, { known: false });
  devices[13] = device(13, { watched: true, online: false });
  const { shown, hidden } = topo.pickNodes(devices);
  assert.equal(shown.length, topo.MAX_NODES);
  assert.equal(hidden, 4);
  assert.equal(shown[0].id, 'd12');
  assert.equal(shown[1].id, 'd13');
});

test('Topology só desenha aparelhos reais e descreve estado em texto (aria-label)', () => {
  const html = render(h(topo.default, { devices: [device(1), device(2, { online: false, watched: true }), device(3, { known: false })], onSelect() {} }));
  assert.equal((html.match(/<button/g) || []).length, 3);
  assert.match(html, /Aparelho 1: conectado/);
  assert.match(html, /Aparelho 2: sem resposta/);
  assert.match(html, /Aparelho 3: conectado, novo/);
  assert.match(html, /class="bad"/, 'linha tracejada do sem resposta');
  assert.equal((render(h(topo.default, { devices: [], onSelect() {} })).match(/<button/g) || []).length, 0);
});

test('métricas: zero continua zero, ausente aparece como traço (desconhecido)', () => {
  const base = { stats: { cpu: 0, memory: { used: 0, totalGb: 16 }, wslGb: 0, disks: [] }, history: [], checked: 1 };
  const zero = render(h(MachineCard, { s: base }));
  assert.match(zero, /0%/);
  const unknown = render(h(MachineCard, { s: { ...base, stats: { disks: [] } } }));
  assert.doesNotMatch(unknown, /0%/);
  assert.match(unknown, /—/);
});

test('modo jogo: separa o que para do que segue e não mistura ação aceita com fim do processo', () => {
  const s = { mode: 'lab', auto: false, step: null, since: 1, reason: '', games: ['Jogo A'], gamesOpen: [], stats: {}, services: [
    { id: 'a', name: 'Servidor de mídia', keep: false, state: 'running' }, { id: 'b', name: 'DNS local', keep: true, state: 'running' }] };
  const html = render(h(GameCard, { s, disabled: false, send() {} }));
  assert.match(html, /Param/);
  assert.match(html, /Continuam ligados/);
  assert.match(html, /Servidor de mídia/);
  assert.match(html, /2\/2 serviços|2\/2/);
  const switching = render(h(GameCard, { s: { ...s, step: 'Parando serviços' }, disabled: false, send() {} }));
  assert.match(switching, /TROCANDO/);
  assert.match(switching, /Parando serviços/);
  assert.doesNotMatch(switching, /Modo jogo ligado:/, 'só conta o resultado quando o passo some');
});

test('toggle do Início e Luzes usam a MESMA reserva por físico', async () => {
  const devices = [{ id: 'quarto-luz', physicalId: 'physical-1' }];
  let release; const posts = [];
  const store = createHomeStore({ bootstrap: async () => ({ stateVersion: { epoch: 'A', revision: 1 }, devices }), get: async () => ({}), post: (path) => { posts.push(path); return new Promise((r) => { release = r; }); } });
  await store.bootstrap();
  const fromHome = store.run('/api/devices/quarto-luz/commands', { action: 'set', values: { power: true } });
  await assert.rejects(store.run('/api/devices/quarto-luz/commands', { action: 'set', values: { power: false } }), (e) => e.code === 'device_busy');
  assert.equal(posts.length, 1);
  release({ command: { status: 'sent' } });
  await fromHome;
});

test('resumo do ambiente: só estado conhecido; IR aparece como estimado; sem aparelhos não inventa nada', () => {
  assert.deepEqual(ambientOf([]), []);
  const items = Object.fromEntries(ambientOf([
    { id: 'a', kind: 'light', state: { power: true }, confidence: 'reported' }, { id: 'b', kind: 'light', state: { power: false }, confidence: 'reported' },
    { id: 'c', kind: 'climate', state: { power: true, temperature: 24 }, confidence: 'estimated' }, { id: 'd', kind: 'tv', state: { power: null }, confidence: 'unknown', connection: 'offline' }]));
  assert.equal(items.Luzes, '1 de 2 acesas');
  assert.equal(items.Ar, '24° ligado · estimado');
  assert.equal(items.TV, 'sem leitura');
  assert.equal(items['Sem conexão'], '1');
  assert.equal(ambientOf([{ id: 'a', kind: 'light', state: { power: null } }])[0][1], 'sem leitura');
});
