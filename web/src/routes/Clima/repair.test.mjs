import assert from 'node:assert/strict';
import test from 'node:test';
import { AR, HOME, LIGHT, setupRoute, skip } from '../harness.mjs';
import { temperatures } from './coverage.js';
import { createDial } from './dial.js';

// Reparo do Crivo no M3 (Clima): "nada aprendido" é diferente de "sem informação de cobertura".
const opts = { skip };

test('P2: values [] (modo sem sinal aprendido) NÃO cai na faixa 17–30: nada se move, nada é emitido', () => {
  const commits = [];
  const dial = createDial({ min: 17, max: 30, values: [], onCommit: (v) => commits.push(v) });
  dial.start(24);
  assert.equal(dial.move(1), null, 'arrastar ao máximo não escolhe 30');
  assert.equal(dial.key('end'), null);
  assert.equal(dial.key(1), null);
  assert.equal(dial.key('home'), null);
  assert.equal(dial.release(), null);
  assert.deepEqual(commits, [], 'nenhum comando');
});

test('P2: values ausente (sem cadastro de cobertura) continua valendo a faixa inteira', () => {
  const commits = [];
  const dial = createDial({ min: 17, max: 30, values: undefined, onCommit: (v) => commits.push(v) });
  dial.start(24); dial.move(1); dial.release();
  assert.deepEqual(commits, [30]);
  assert.equal(temperatures(null, 'cool', 'auto').length, 14);
  assert.deepEqual(temperatures({ coverage: { cool: { auto: [] } } }, 'cool', 'auto'), [], 'cadastro existe e está vazio');
});

test('P2: tela com cool/auto = [] trava dial e ± e diz que nada foi aprendido para esse modo', opts, () => {
  const ir = { coverage: { cool: { auto: [] }, heat: { auto: [24] } }, off: true, extras: {}, templess: [], origins: {} };
  const t = setupRoute({ home: HOME([LIGHT('quarto-luz', 'quarto-luz', { power: false }), AR({ power: true, temperature: 24, mode: 'cool', fan: 'auto' }, { irClimate: ir })]), polls: { '/api/routines': { data: { timers: [] }, reload() {} }, '/api/energy': { data: null, reload() {} } } });
  const html = t.render(t.load(t.src('routes/Clima/Clima.jsx')).default);
  assert.match(html, /class="dial off"/);
  assert.match(html, /Nenhuma temperatura aprendida para este modo e ventilação/);
  assert.match(html, /aria-label="Aumentar temperatura"[^>]*disabled=""/);
  assert.match(html, /aria-label="Diminuir temperatura"[^>]*disabled=""/);
  assert.match(html, /Use Aprender/);
});
