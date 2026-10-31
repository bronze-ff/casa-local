import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Central: paridade das seções, linha do dia das rotinas e confirmações antes de apagar/trocar. SSR com api falsa, sem rede.
const requireWeb = createRequire(new URL('../../../package.json', import.meta.url));
const { transformSync } = requireWeb('esbuild');
const React = requireWeb('react');
const { renderToStaticMarkup: render } = requireWeb('react-dom/server');
const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
let polls = {};
let home = { scenes: [{ id: 'noite', name: 'Boa noite' }], mode: 'local', devices: [] };
function load(file) {
  file = resolve(file);
  if (file.endsWith('api.js')) return { fmtAgo: () => 'há 1 min', fmtTime: () => '12:00', usePoll: (path) => polls[path] || { data: null, error: null, reload: async () => {} }, homeStore: { commandFor: () => null, run: async () => ({}) }, useHomeStore: () => ({}) };
  if (file.endsWith('App.jsx')) return { useHome: () => ({ home, mode: home.mode, refresh: async () => {} }), href: (n) => `#/${n}` };
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code;
  new Function('require', 'module', 'exports', code)((name) => (name.startsWith('.') ? load(resolve(dirname(file), name)) : requireWeb(name)), module, module.exports);
  return module.exports;
}
globalThis.window = { location: { origin: 'http://casa.local', host: 'casa.local' }, localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = globalThis.window.localStorage;
const h = React.createElement;
const Central = load(resolve(root, '../Central.jsx')).default;
const centralModule = load(resolve(root, '../Central.jsx'));
const routinesModule = load(resolve(root, 'Routines.jsx'));
const Routines = routinesModule.default;

const routine = (over) => ({ id: 'r1', name: 'Boa noite', trigger: 'time', time: '23:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true, action: { type: 'scene', id: 'noite' }, ...over });

test('dayMarks: só rotinas por horário, ordenadas, posição em % do dia', () => {
  const marks = routinesModule.dayMarks([routine(), routine({ id: 'r2', time: '06:30', name: 'Acordar' }), routine({ id: 'r3', trigger: 'place', time: undefined }), routine({ id: 'r4', time: 'quebrado' })]);
  assert.deepEqual(marks.map((m) => m.id), ['r2', 'r1']);
  assert.equal(marks[0].pct, 27.1);
  assert.equal(marks[1].pct, 95.8);
});

test('Central mantém todas as seções do inventário (paridade)', () => {
  polls = {};
  const html = render(h(Central));
  for (const title of ['Saúde do sistema', 'Avisos no celular', 'Modos da casa', 'Rotinas', 'Atalhos da Siri', 'Som das teclas']) assert.match(html, new RegExp(title), title);
  assert.match(html, /gasto|Gasto|energia|Energia|Lendo/i, 'seção de energia presente (carregando)');
});

test('linha do dia aparece com descrição acessível e respeita rotina pausada', () => {
  polls = { '/api/routines': { data: { routines: [routine(), routine({ id: 'r2', time: '06:30', name: 'Acordar', enabled: false })], timers: [], log: [] }, error: null, reload: async () => {} }, '/api/location': { data: { places: [], people: [] }, error: null } };
  const html = render(h(Routines));
  assert.match(html, /class="dayline"/);
  assert.match(html, /role="img" aria-label="Rotinas por horário: 06:30 Acordar \(pausada\), 23:00 Boa noite"/);
});

test('apagar rotina e modo pedem confirmação: "Remover mesmo" não existe antes do primeiro toque', () => {
  polls = { '/api/routines': { data: { routines: [routine()], timers: [], log: [] }, error: null, reload: async () => {} }, '/api/location': { data: { places: [], people: [] }, error: null } };
  const html = render(h(Routines));
  assert.doesNotMatch(html, /Remover mesmo/);
  assert.match(html, /aria-label="Remover Boa noite"/);
});

test('rotação de chave dos atalhos só confirma depois do toque (sem "Trocar" inicial)', () => {
  polls = {};
  assert.doesNotMatch(render(h(Central)), />Trocar</);
});

test('resumo da central: só o que o servidor devolveu; sem dados não inventa número', () => {
  assert.deepEqual(centralModule.summaryOf(null, undefined), []);
  assert.deepEqual(centralModule.summaryOf(null, [{}, {}]), [['Modos', '2']]);
  const full = centralModule.summaryOf({ state: 'warn', checks: [{ state: 'ok' }, { state: 'fail' }], machine: { memory: { used: 40 }, disk: { freeGb: 80 } } }, []);
  assert.deepEqual(full.map(([k]) => k), ['Sistema', 'Avisos', 'Memória', 'Disco livre', 'Modos']);
  assert.equal(full.find(([k]) => k === 'Avisos')[1], '1');
  assert.equal(centralModule.summaryOf({ state: 'ok', checks: [] }, undefined).some(([k]) => k === 'Memória'), false);
});

test('Central: navegação interna por botões (não por hash, que quebraria a rota) e uma seção por id', () => {
  polls = {};
  const html = render(h(Central));
  for (const [id] of centralModule.SECTIONS) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.doesNotMatch(html, /href="#(saude|avisos|modos)/);
  assert.match(html, /<nav[^>]*aria-label="Seções da central"/);
});
