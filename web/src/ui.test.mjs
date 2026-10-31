import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Componentes base: ícones de todos os nomes usados, teclas, barras e a confiança "Enviado" (calculada no front).
const require = createRequire(new URL('../package.json', import.meta.url));
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup: render } = require('react-dom/server');
const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(resolve(dirname(file), name)) : require(name), module, module.exports);
  return module.exports;
}
const ui = load(resolve(root, 'ui.jsx'));
const h = React.createElement;

// Todo nome de ícone do painel desenha pixels (nenhum cai no fallback "home" por engano).
const NAMES = 'home bulb camera server bell snow tv pin power plus minus back next up down left right close external warn refresh radio film moon door book sofa coffee bed sun fan game lab central alert luz ar cam ext'.split(' ');
const home = render(h(ui.Icon, { name: 'home' }));
for (const name of NAMES) {
  const html = render(h(ui.Icon, { name }));
  assert.match(html, /<path d="M/, name);
  if (!['home'].includes(name)) assert.notEqual(html, home, name);
}
assert.match(render(h(ui.Icon, { name: 'bulb', label: 'Luz' })), /role="img" aria-label="Luz"/);

// Tecla desabilitada mostra o motivo; carregando não repete o clique.
assert.match(render(h(ui.Key, { disabled: true, reason: 'Sem lâmpada' }, 'Ligar')), /disabled[^>]*>.*Sem lâmpada/);
assert.match(render(h(ui.Key, { loading: true }, 'Ligar')), /is-load/);
assert.match(render(h(ui.Key, { on: true }, 'Ligar')), /aria-pressed="true"/);

// Barra de pixels: 3 de 10 cheios, o pixel de sinal e o atual.
const cells = (html) => [...html.matchAll(/<i class="([^"]*)"/g)].map((m) => m[1]);
assert.deepEqual(cells(render(h(ui.PixelBar, { value: 30, max: 100, steps: 10 }))), ['f', 'f', 'f', '', '', '', '', '', '', '']);
assert.deepEqual(cells(render(h(ui.PixelBar, { value: 30, steps: 10, current: 2, signal: 3 }))).slice(0, 4), ['f', 'd', 's', '']);
assert.deepEqual(cells(render(h(ui.PixelBar, { value: 20, steps: 10, signal: true }))).slice(0, 3), ['s', 's', '']);
assert.equal(cells(render(h(ui.PixelBar, { value: 999, steps: 5 }))).filter((c) => c === 'f').length, 5);

// Slider: papel de slider com valores acessíveis.
assert.match(render(h(ui.PixelSlider, { value: 40, min: 10, max: 100, step: 10, label: 'Brilho', onChange() {} })), /role="slider"[^>]*aria-valuemin="10"[^>]*aria-valuemax="100"[^>]*aria-valuenow="40"/);

// Segmentado: só a opção atual entra no Tab (roving tabindex); indisponível nunca.
const seg = render(h(ui.Segmented, { value: 'b', options: [['a', 'A'], ['b', 'B'], ['c', 'C', true]], onChange() {}, label: 'x' }));
assert.deepEqual([...seg.matchAll(/tabindex="(-?\d)"/g)].map((m) => m[1]), ['-1', '0', '-1']);
assert.match(seg, /<button[^>]*role="radio"[^>]*class="x"[^>]*disabled/);
assert.deepEqual([...render(h(ui.Segmented, { value: 'z', options: [['a', 'A'], ['b', 'B']], onChange() {} })).matchAll(/tabindex="(-?\d)"/g)].map((m) => m[1]), ['0', '-1']);
// Chave: o alvo de 44 px é o rótulo inteiro.
assert.match(render(h(ui.Switch, { on: true, onChange() {}, label: 'x' })), /<label class="hit"><input[^>]*role="switch"/);

// Gancho do clique sonoro: chamado por Key e Switch, nunca por tecla em carga.
let clicks = 0;
ui.clickHook.fn = () => { clicks += 1; };
const key = ui.Key({ children: 'x', onClick() {} });
key.props.onClick({}); key.props.onClick({});
assert.equal(clicks, 2);
assert.equal(ui.Key({ children: 'x', loading: true }).props.onClick, undefined);
const sw = ui.Switch({ on: false, onChange() {}, label: 'x' });
sw.props.children.props.onChange({ target: { checked: true } });
assert.equal(clicks, 3);
ui.clickHook.fn = null;
key.props.onClick({}); // sem gancho: não quebra

// Doto só nos tamanhos da escala.
assert.match(render(h(ui.Dot, { size: 64 }, '10:26')), /font-size:64px/);
assert.match(render(h(ui.Dot, { size: 17 }, '1')), /font-size:34px/);

// Confiança: 5 selos; "enviado" por 6 s, ou até o /api/state trazer updatedAt maior.
const label = (kind) => render(h(ui.Confidence, { kind }));
assert.match(label('reported'), /rep.*Confirmado/);
assert.match(label('sent'), /env.*Enviado · sem retorno/);
assert.match(label('estimated'), /est.*Estimado/);
assert.match(label('preview'), /sim.*Simulado/);
assert.match(label('qualquer'), /unk.*Desconhecido/);
function Probe({ device }) { return h('i', null, ui.useConfidence(device)); }
const kind = (device) => render(h(Probe, { device })).replace(/<\/?i>/g, '');
const lamp = { id: 'quarto-luz', confidence: 'reported', updatedAt: '2026-10-25T10:00:00Z' };
assert.equal(kind(lamp), 'reported');
assert.equal(kind({ ...lamp, confidence: 'estimated' }), 'estimated');
assert.equal(kind({ ...lamp, confidence: null }), 'unknown');
assert.equal(kind(null), 'unknown');
ui.markSent('quarto-luz', '2026-10-25T10:00:00Z');
assert.equal(kind(lamp), 'sent');
assert.equal(kind({ ...lamp, updatedAt: '2026-10-25T10:00:05Z' }), 'reported'); // leitura nova encerra o "enviado"
assert.equal(kind({ ...lamp, id: 'banheiro-luz' }), 'reported'); // outro aparelho não é afetado
assert.equal(render(h(ui.Status, { kind: 'ok' }, 'rodando')), '<span class="st ok">rodando</span>');
assert.match(render(h(ui.Status, {}, 'parado')), /class="st off"/); // sem kind = vazado
assert.equal(render(h(ui.Badge, null, 'Novo')), '<span class="tag">Novo</span>');
console.log('OK: ui (ícones, teclas, barras, slider, Doto, confiança e "enviado").');
process.exit(0); // o temporizador de 6 s do markSent não deve segurar o teste
