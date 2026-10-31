const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createRequire } = require('node:module');
let dependencies = process.env.CASA_WEB_ROOT;
for (let dir = __dirname; !dependencies;) {
  if (fs.existsSync(pathFor(dir, 'web/node_modules/@babel/parser'))) dependencies = pathFor(dir, 'web');
  const parent = require('node:path').dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
function pathFor(...parts) { return require('node:path').join(...parts); }
assert.ok(dependencies, 'Set CASA_WEB_ROOT to the web checkout with installed dependencies.');
const mainRequire = createRequire(pathFor(dependencies, 'package.json'));
const parser = mainRequire('@babel/parser');
const esbuild = mainRequire('esbuild');
const React = mainRequire('react');
const { renderToStaticMarkup } = mainRequire('react-dom/server');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const paths = ['Luzes.jsx', 'Clima.jsx', 'Clima/coverage.js'];
for (const name of paths) {
  parser.parse(fs.readFileSync(path.join(root, name), 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  console.log('Syntax OK:', name);
}
function compile(file, resolve) {
  const source = esbuild.transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: resolve }, { filename: file });
  return module.exports;
}
const coverage = compile(path.join(root, 'Clima/coverage.js'), mainRequire);
const ir = { coverage: { cool: { auto: [17, 20, 24, 30], high: [22, 26] }, heat: { low: [18, 21] }, auto: { auto: [17, 30] } }, templess: ['auto/auto'], off: 'aprendido', extras: { eco: 'aprendido' }, turbo: true };
assert.deepEqual(Array.from(coverage.temperatures(ir, 'cool', 'auto')), [17, 20, 24, 30]);
assert.equal(coverage.temperatures(ir, 'dry', 'auto').length, 0);
assert.equal(coverage.temperatures(undefined, 'cool', 'auto').length, 14);
assert.equal(coverage.supportedState(ir, 'dry', 'auto', 24), null);
const fallback = coverage.supportedState(ir, 'heat', 'high', 24);
assert.equal(fallback.fan, 'low'); assert.equal(fallback.temperature, 21);
assert.equal(coverage.supportedState(ir, 'cool', 'high', 24).temperature, 22);
assert.deepEqual(Array.from(coverage.temperatures({ coverage: { cool: { auto: [16, 17, 30, 31, 24.5] } } }, 'cool', 'auto')), [17, 30]);
console.log('Coverage OK: sparse ranges, fallback fan, nearest temperature, missing mode and bounds.');
let snapshot, pollingError = null, polls = {}, preview = false;
const calls = [];
const api = { fmtAgo: () => 'há 1 min', fmtTime: () => '23:40', usePoll: (route) => ({ data: route === '/api/state' ? snapshot : polls[route] || null, error: pollingError, reload: async () => {}, at: Date.now() }) };
const uiReal = compile(path.join(root, '../ui.jsx'), (id) => id === './api.js' ? { homeStore: { run: async () => { throw Error('Network forbidden'); }, commandFor: () => null }, useHomeStore: () => ({}) } : id === './homeStore.js' ? { resultNotice: () => ({ kind: 'ok' }) } : mainRequire(id));
const ui = { ...uiReal, useConfidence: () => 'estimated', useAction: () => [async (route, body) => { calls.push({ route, body }); return {}; }, false], useToast: () => () => {} };
const resolve = (id) => id === '../App.jsx' ? { useHome: () => ({ home: snapshot, refresh: async () => {}, mode: preview ? 'preview' : 'local' }) } : id === '../api.js' ? api : id === '../ui.jsx' ? ui : id === './Clima/coverage.js' ? coverage : mainRequire(id);
const Luzes = compile(path.join(root, 'Luzes.jsx'), resolve).default;
const Clima = compile(path.join(root, 'Clima.jsx'), resolve).default;
function render(Component, param) { return renderToStaticMarkup(React.createElement(Component, { param })); }
function device(id, state, extra = {}) { return { id, name: id, roomId: id.startsWith('banheiro') ? 'banheiro' : 'quarto', configured: true, connection: 'online', confidence: 'estimated', state, ...extra }; }
const ac = device('ar-quarto', { power: true, mode: 'cool', fan: 'auto', temperature: 24, turbo: true }, { irClimate: ir });
const lights = [device('quarto-luz', { power: true, brightness: 80, colorHex: '#FFD6A0' }), device('banheiro-luz', { power: false, brightness: 100, colorHex: '#FFFFFF' })];
snapshot = { devices: [...lights, ac], scenes: [] };
polls = { '/api/routines': { timers: [{ device: 'ar-quarto', at: 1234567890 }] }, '/api/energy': { today: { hours: 2, kwh: 2.4, cost: 2 }, month: { hours: 12, kwh: 14, cost: 10 }, config: { watts: 1200, tariff: 1 } } };
let html = render(Luzes);
for (const label of ['Vermelho', 'Laranja', 'Âmbar', 'Amarelo', 'Lima', 'Verde', 'Turquesa', 'Branco frio', 'Ciano', 'Céu', 'Azul', 'Índigo', 'Violeta', 'Magenta', 'Rosa', 'Branco quente']) assert.ok(html.includes(`aria-label="${label}"`));
assert.ok(render(Luzes, 'banheiro-luz').includes('Apagada'));
html = render(Clima);
for (const text of ['Turbo ligado', 'Não aprendido', 'Cancelar timer', 'Este mês', '30 min', '4 h']) assert.ok(html.includes(text), text);
snapshot.devices = [device('ar-quarto', { power: null, mode: null, fan: null, temperature: null }, { irClimate: ir })];
html = render(Clima); assert.ok(html.includes('– –')); assert.ok(html.includes('Ligar em 24')); assert.ok(html.includes('Estado estimado'));
snapshot.devices = [{ ...ac, state: { ...ac.state, mode: 'auto' } }];
html = render(Clima); assert.ok(html.includes('não envia temperatura'));
preview = true; assert.ok(render(Clima).includes('Prévia')); assert.ok(render(Luzes).includes('Prévia')); preview = false;
pollingError = Error('Offline'); assert.ok(render(Clima).includes('Offline')); assert.ok(render(Luzes).includes('Offline')); pollingError = null;
snapshot = { devices: [] }; assert.ok(render(Clima).includes('indisponível')); assert.ok(render(Luzes).includes('Nenhuma lâmpada'));
snapshot = null; assert.ok(render(Clima).includes('Carregando')); assert.ok(render(Luzes).includes('Carregando'));
assert.equal(calls.length, 0);
console.log('Render OK: both lamps, 16 presets, climate known/unknown, templess, timers/energy, preview, error, empty, loading. Zero API calls.');
function harness(file) {
  const hooks = []; let cursor = 0;
  const fakeReact = { ...React,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef: (initial) => { const index = cursor++; return hooks[index] || (hooks[index] = { current: initial }); },
    useEffect: () => {},
  };
  const Component = compile(path.join(root, file), (id) => id === 'react' ? fakeReact : resolve(id)).default;
  return () => { cursor = 0; return Component({ param: '' }); };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...nodes(tree.props.children), ...nodes(tree.props.aside)];
}
function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  return React.isValidElement(tree) ? textOf(tree.props.children) : tree == null ? '' : String(tree);
}
function button(tree, label) {
  const isButton = (node) => node.type === 'button' || node.type === ui.Key;
  const found = nodes(tree).find((node) => isButton(node) && (node.props['aria-label'] === label || textOf(node) === label || textOf(node) + (node.props.sub || '') === label));
  assert.ok(found, `Missing button: ${label}`);
  assert.ok(!found.props.disabled, `Disabled button: ${label}`);
  return found;
}
async function lastClick(tree, label, expectedBody, expectedPath = '/api/devices/ar-quarto/commands') {
  calls.length = 0;
  await button(tree, label).props.onClick();
  assert.equal(calls.length, 1, `One request for ${label}`);
  assert.equal(calls[0].route, expectedPath);
  assert.equal(JSON.stringify(calls[0].body), JSON.stringify(expectedBody));
}
(async () => {
  snapshot = { devices: [...lights, ac], scenes: [{ id: 'noite', name: 'Noite', devices: ['quarto-luz'] }] };
  let renderTree = harness('Clima.jsx');
  await lastClick(renderTree(), 'Aumentar temperatura', { action: 'set', values: { temperature: 30 } });
  await lastClick(renderTree(), 'Diminuir temperatura', { action: 'set', values: { temperature: 20 } });
  await lastClick(renderTree(), 'Desligar ar', { action: 'set', values: { power: false } });
  await lastClick(renderTree(), 'Turbo ligadoEstimado', { action: 'set', values: { turbo: false } });
  await lastClick(renderTree(), 'EcoAlterna no aparelho', { action: 'key', key: 'eco' });
  await lastClick(renderTree(), '30 min', { device: 'ar-quarto', minutes: 30 }, '/api/routines/timer');
  await lastClick(renderTree(), 'Cancelar timer', { device: 'ar-quarto', minutes: 0 }, '/api/routines/timer');
  const selectMode = nodes(renderTree()).find((node) => node.type === ui.Segmented && node.props.label === 'Modo');
  calls.length = 0; await selectMode.props.onChange('heat');
  assert.equal(JSON.stringify(calls[0].body.values), JSON.stringify({ mode: 'heat', fan: 'low', temperature: 21 }));
  await button(renderTree(), 'Aprender').props.onClick();
  assert.ok(textOf(renderTree()).includes('em até 25 s'));
  await lastClick(renderTree(), 'Gravar ligar neste estado', { state: { power: true, temperature: 24, mode: 'cool', fan: 'auto' } }, '/api/devices/ar-quarto/learn');
  assert.ok(textOf(renderTree()).includes('Saia de Aprender e teste olhando o aparelho'));
  await lastClick(renderTree(), 'Regravar desligar', { key: 'off' }, '/api/devices/ar-quarto/learn');
  await lastClick(renderTree(), 'BrisaGravar', { key: 'brisa' }, '/api/devices/ar-quarto/learn');
  renderTree = harness('Luzes.jsx');
  await lastClick(renderTree(), 'Vermelho', { action: 'set', values: { colorHex: '#FF3B30' } }, '/api/devices/quarto-luz/commands');
  await lastClick(renderTree(), 'Diminuir brilho', { action: 'set', values: { brightness: 90 } }, '/api/devices/quarto-luz/commands');
  await lastClick(renderTree(), 'Noite', {}, '/api/scenes/noite/run');
  nodes(renderTree()).find((node) => node.type === ui.Segmented && node.props.label === 'Escolher lâmpada').props.onChange('banheiro-luz');
  await lastClick(renderTree(), 'Branco quente', { action: 'set', values: { colorHex: '#FFD6A0', power: true } }, '/api/devices/banheiro-luz/commands');
  console.log('Actions OK: sparse temperature steps, power, calibrated turbo, learned extra, mode/fan fallback, timer set/cancel, learning state/off/extra, light colors/brightness/scenes. Mocked POSTs only.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
