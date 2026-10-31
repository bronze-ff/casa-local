import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Passe o package.json do checkout principal se esta worktree não tiver node_modules.
const require = createRequire(process.argv[2] || new URL('../../../package.json', import.meta.url));
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup: render } = require('react-dom/server');
const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
let home, poll;
function load(file) {
  file = resolve(file);
  if (file.endsWith('App.jsx')) return { useHome: () => home };
  if (file.endsWith('api.js')) return {
    usePoll: () => poll, post: async () => { throw Error('POST proibido no teste'); },
    homeStore: { run: async () => { throw Error('POST proibido no teste'); }, commandFor: () => null }, useHomeStore: () => ({}),
    fmtAgo: () => 'há 40 min', fmtTime: () => '12:00',
  };
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(resolve(dirname(file), name)) : require(name), module, module.exports);
  return module.exports;
}
const TV = load(resolve(root, '../TV.jsx')).default;
const Local = load(resolve(root, '../Local.jsx')).default;
const map = load(resolve(root, 'Map.jsx'));
for (const zoom of [2, 15, 19]) for (const [lat, lon] of [[0, 0], [-23.55, -46.63], [85, 179], [-85, -179]]) {
  const result = map.unproject(...map.project(lat, lon, zoom), zoom);
  assert(Math.abs(result[0] - lat) < 1e-8 && Math.abs(result[1] - lon) < 1e-8);
}
home = { mode: 'local', home: { devices: [{ id: 'tv-quarto', configured: true, connection: 'online', irKeys: { power: 'aprendido' } }] }, refresh() {} };
const fixture = (data, error = null) => { poll = { data, error, at: Date.now(), reload() {} }; };
const screen = (Component, props) => render(React.createElement(Component, props));
fixture(null); assert.match(screen(TV, { param: 'rede' }), /Carregando TVs/);
fixture({ tvs: [] }); assert.match(screen(TV, { param: 'rede' }), /Nenhuma TV encontrada/);
fixture({ tvs: [{ id: 'abcdef123456', label: 'Sala', model: 'Samsung', power: 'off', paired: true }] });
assert.match(screen(TV, { param: 'rede' }), /Fora de alcance/);
fixture(null, Error('Falha de leitura')); assert.match(screen(Local), /Falha de leitura/);
fixture(null); assert.match(screen(Local), /Carregando localização/);
fixture({ configured: false }); assert.match(screen(Local), /primeiro celular/);
const now = 1800000000;
fixture({ configured: true, now, places: [{ id: 'casa', name: 'Casa', lat: -23.55, lon: -46.63, radius: 100 }],
  people: [{ id: 'joao', name: 'João', place: 'casa', stale: true, regionsPending: true, last: { lat: -23.55, lon: -46.63, tst: now - 2400, batt: 0, acc: 0, vel: 0 }, trail: [] }],
  events: [{ person: 'joao', name: 'João', kind: 'chegou', place: 'casa', tst: now - 2600, exact: true }],
});
const local = screen(Local);
for (const text of ['É a casa', 'Posição desatualizada', '0%', '±0 m', '0 km/h', 'chegou em', 'tile.openstreetmap.org', 'próximo envio']) assert(local.includes(text), text);
home.mode = 'preview';
assert.match(screen(Local), /Prévia/);
assert.match(screen(TV), /Prévia/);
console.log('OK: renderização TV/Local (carga, vazio, erro, dados, prévia), métricas zero e projeção. Nenhum POST, servidor ou rede.');
