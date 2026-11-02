import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { prepareBoot, registerOffline } from './start.js';

// Consistência da entrada nova (sem build, sem navegador): tudo que o main.jsx liga existe, na ordem certa, e nada do painel antigo entra.
const src = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(src, file), 'utf8');
const main = read('main.jsx');
const registry = read('routes/registry.js');
const ROUTES = ['', 'luzes', 'clima', 'tv', 'local', 'cameras', 'lab', 'central'];

test('o registro tem as 8 rotas do shell, cada uma apontando para um arquivo que existe', () => {
  const entries = [...registry.matchAll(/^\s*(?:'([a-z]*)'|([a-z]+)):\s*\{ Screen: lazy\(\(\) => import\('([^']+)'\)\) \}/gm)].map((m) => [m[1] ?? m[2], m[3]]);
  assert.deepEqual(entries.map(([name]) => name), ROUTES);
  for (const [name, file] of entries) assert.ok(existsSync(resolve(src, 'routes', file)), `rota "${name}" → ${file}`);
  const nav = read('shell/nav.js');
  for (const name of ROUTES) assert.match(nav, new RegExp(`${name ? name : "''"}: \\{ title`), `destino ${name || 'início'} no shell`);
  const core = read('core/route.js');
  for (const name of ROUTES.filter(Boolean)) assert.match(core, new RegExp(`'${name}'`));
});

test('o main.jsx importa o CSS na ordem do registro (base, kit, shell e depois um por rota), todos existentes', () => {
  const css = [...main.matchAll(/^import '(\.\/[^']+\.css)';$/gm)].map((m) => m[1]);
  const listed = [...registry.match(/export const stylesheets = \[([^\]]+)\]/)[1].matchAll(/'\.\/([^']+)'/g)].map((m) => `./routes/${m[1]}`);
  assert.deepEqual(css, ['./ui/theme.css', './ui/base.css', './ui/kit.css', './shell/shell.css', ...listed]);
  assert.equal(listed.length, 9);
  for (const file of css) assert.ok(existsSync(resolve(src, file)), file);
});

test('a entrada nova não importa NADA do painel antigo', () => {
  for (const legacy of ['tokens.css', './App.jsx', './ui.jsx', './mode.js', './screens', './api.js', './homeStore.js', 'fontsource', 'Central/Sound.js', 'screens/']) assert.ok(!main.includes(legacy), legacy);
  for (const file of ['boot/App.jsx', 'boot/start.js']) assert.doesNotMatch(read(file), /\.\.\/(App\.jsx|ui\.jsx|screens|api\.js|homeStore|mode\.js|tokens)/, file);
  assert.match(main, /from '\.\/boot\/App\.jsx'/);
  assert.match(main, /prepareBoot\(\{ search: window\.location\.search, root: document\.documentElement \}\)/);
  assert.match(main, /registerOffline\(\{ nav: navigator, prod: import\.meta\.env\.PROD \}\)/);
  assert.match(main, /<StrictMode><App \/><\/StrictMode>/);
});

test('index.html: fundo do boot e cor do tema nos tokens novos, claro e escuro, e o script aponta para a entrada nova', () => {
  const html = readFileSync(resolve(src, '../index.html'), 'utf8');
  const theme = read('ui/theme.css');
  const light = theme.match(/--bg: (#[0-9A-Fa-f]{6})/)[1];
  const dark = theme.match(/prefers-color-scheme: dark\)[\s\S]*?--bg: (#[0-9A-Fa-f]{6})/)[1];
  assert.match(html, new RegExp(`theme-color" content="${light}" media="\\(prefers-color-scheme: light\\)"`));
  assert.match(html, new RegExp(`theme-color" content="${dark}" media="\\(prefers-color-scheme: dark\\)"`));
  assert.match(html, new RegExp(`html,body\\{background:${light}`));
  assert.match(html, new RegExp(`prefers-color-scheme:dark\\)\\{html,body\\{background:${dark}`));
  assert.ok(!/E4DED0|1C1B18/.test(html), 'cores do painel antigo');
  assert.match(html, /<script type="module" src="\/src\/main\.jsx">/);
});

test('boot: bandeja é sempre Noite antes de pintar; painel normal não mexe no tema; o som salvo é inicializado uma vez', () => {
  const calls = [];
  for (const [search, theme] of [['?tray=1', 'noite'], ['?tray=1&alerta=1', 'noite'], ['', undefined], ['?outra=1', undefined]]) {
    const root = { dataset: {} };
    prepareBoot({ search, root, init: () => calls.push(search) });
    assert.equal(root.dataset.theme, theme, search);
  }
  assert.equal(calls.length, 4);
  assert.equal(prepareBoot({ search: '?tray=1&alerta=1', root: { dataset: {} }, init() {} }), 'alerta');
  assert.equal(prepareBoot({ search: '', root: { dataset: {} }, init() {} }), null);
});

test('cópia offline: só em produção e só com suporte; falha de registro não explode', async () => {
  let registered = null;
  const nav = { serviceWorker: { register: (url) => { registered = url; return Promise.reject(new Error('x')); } } };
  assert.equal(registerOffline({ nav, prod: false }), false);
  assert.equal(registered, null);
  assert.equal(registerOffline({ nav: {}, prod: true }), false);
  assert.equal(registerOffline({ nav, prod: true }), true);
  assert.equal(registered, '/sw.js');
  await new Promise((done) => setImmediate(done)); // a rejeição foi engolida: o teste não cai
});

test('o sw.js nunca guarda /api/ e o registro de rotas não perdeu a bandeja nem o alerta (Root lazy)', () => {
  assert.match(readFileSync(resolve(src, '../public/sw.js'), 'utf8'), /url\.pathname\.startsWith\('\/api\/'\)\) return;/);
  assert.match(read('shell/Root.jsx'), /lazy\(\(\) => import\('\.\/Alert\.jsx'\)\)/);
});
