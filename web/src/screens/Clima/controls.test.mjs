import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Controles expressivos (dial e controle vertical): arrasto só altera rascunho; o comando sai UMA vez, ao soltar/aplicar.
const requireWeb = createRequire(new URL('../../../package.json', import.meta.url));
const { transformSync } = requireWeb('esbuild');
const root = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  if (file.endsWith('api.js')) { module.exports = { homeStore: {}, useHomeStore: () => ({}) }; return module.exports; }
  const code = transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code;
  new Function('require', 'module', 'exports', code)((name) => (name.startsWith('.') ? load(resolve(dirname(file), name)) : requireWeb(name)), module, module.exports);
  return module.exports;
}
const { dialController, angleToProgress, progressToAngle } = load(resolve(root, '../../ui.jsx'));
const { temperatures, supportedState } = load(resolve(root, 'coverage.js'));

const make = (values, commits) => dialController({ min: 17, max: 30, values, onCommit: (value) => commits.push(value) });

test('arrasto altera só o rascunho: POST/commit = 0 até soltar; soltar emite exatamente 1', () => {
  const commits = [];
  const dial = make(undefined, commits);
  dial.start(24);
  for (const progress of [0.1, 0.2, 0.35, 0.5, 0.62, 0.7]) dial.move(progress);
  assert.equal(commits.length, 0, 'nenhum comando durante o arrasto');
  assert.equal(dial.draft(), 26, 'rascunho acompanha o arrasto');
  dial.release();
  assert.deepEqual(commits, [26]);
  dial.release();
  assert.equal(commits.length, 1, 'soltar de novo não repete');
});

test('soltar sem mudar o valor não emite comando', () => {
  const commits = [];
  const dial = make(undefined, commits);
  dial.start(24);
  dial.move(7 / 13);
  dial.release();
  assert.deepEqual(commits, []);
});

test('cobertura IR esparsa: o dial nunca escolhe temperatura sem sinal aprendido', () => {
  const ir = { coverage: { cool: { auto: [18, 22, 24, 28] } } };
  const values = temperatures(ir, 'cool', 'auto');
  assert.deepEqual(values, [18, 22, 24, 28]);
  const commits = [];
  const dial = make(values, commits);
  dial.start(22);
  for (let p = 0; p <= 1.0001; p += 0.05) dial.move(Math.min(1, p));
  assert.ok(values.includes(dial.draft()));
  dial.move(0.3); // 17 + .3*13 = 20.9: o mais próximo suportado é 22
  assert.equal(dial.draft(), 22);
  dial.move(0.55);
  assert.equal(dial.draft(), 24);
  dial.release();
  assert.ok(commits.every((v) => values.includes(v)));
  assert.equal(supportedState(ir, 'cool', 'auto', 21).temperature, 22);
});

test('teclado: setas mudam o rascunho pulando valores sem cobertura; soltar a tecla emite 1 comando', () => {
  const commits = [];
  const dial = make([18, 22, 24, 28], commits);
  dial.start(22);
  dial.key(1); dial.key(1); dial.key(1); dial.key(1);
  assert.equal(dial.draft(), 28, 'trava no último valor suportado');
  assert.equal(commits.length, 0);
  dial.key(-1);
  assert.equal(dial.draft(), 24);
  dial.release();
  assert.deepEqual(commits, [24]);
  dial.start(18); dial.key(-1);
  assert.equal(dial.draft(), 18, 'não passa do menor');
});

test('Home/End vão aos extremos suportados', () => {
  const dial = make([19, 23, 29], []);
  dial.start(23);
  dial.key('end'); assert.equal(dial.draft(), 29);
  dial.key('home'); assert.equal(dial.draft(), 19);
});

test('geometria: 270 graus de varredura, ponta morta embaixo escolhe a extremidade mais próxima', () => {
  assert.equal(progressToAngle(0), 135);
  assert.equal(progressToAngle(1), 405);
  assert.ok(Math.abs(angleToProgress(135) - 0) < 1e-9);
  assert.ok(Math.abs(angleToProgress(270) - 0.5) < 1e-9); // topo
  assert.ok(Math.abs(angleToProgress(45) - 1) < 1e-9);
  assert.equal(angleToProgress(80), 1, 'zona morta perto do fim vira o máximo');
  assert.equal(angleToProgress(100), 0, 'zona morta perto do início vira o mínimo');
});
