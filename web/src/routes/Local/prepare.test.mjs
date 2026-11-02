import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createPrepare } from './prepare.js';

// Reparo Crivo M4 P1: resposta tardia do preparo do celular não pode reabrir o diálogo com a credencial.
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const PHONE = { person: 'p1', otrc: { password: 'segredo-de-teste' } };

test('fechar o diálogo com o pedido pendente descarta a resposta tardia (credencial nunca chega à tela)', async () => {
  const gate = deferred(); const ready = [];
  const prep = createPrepare({ call: () => gate.promise, onReady: (phone, args) => ready.push([phone, args]) });
  const run = prep.start({ name: 'Ana' });
  prep.invalidate(); // usuário fechou
  gate.resolve({ phone: PHONE });
  assert.equal(await run, null);
  assert.deepEqual(ready, []);
});

test('sem fechar, a resposta entrega UMA vez', async () => {
  const ready = [];
  const prep = createPrepare({ call: async () => ({ phone: PHONE }), onReady: (phone) => ready.push(phone) });
  assert.equal(await prep.start({}), PHONE);
  assert.equal(ready.length, 1);
  prep.invalidate();
  assert.equal(ready.length, 1, 'invalidar depois não desfaz nem repete');
});

test('novo pedido (outra pessoa) invalida o anterior: só o último entrega', async () => {
  const a = deferred(); const b = deferred(); const ready = [];
  const calls = [a, b];
  const prep = createPrepare({ call: () => calls.shift().promise, onReady: (phone, args) => ready.push(args.person) });
  const first = prep.start({ person: 'p1' });
  const second = prep.start({ person: 'p2' });
  b.resolve({ phone: { ...PHONE, person: 'p2' } });
  a.resolve({ phone: PHONE });
  assert.equal(await first, null);
  assert.ok(await second);
  assert.deepEqual(ready, ['p2']);
});

test('resposta sem celular ou pedido recusado não entrega nada', async () => {
  const ready = [];
  assert.equal(await createPrepare({ call: async () => ({}), onReady: () => ready.push(1) }).start({}), null);
  assert.equal(await createPrepare({ call: async () => null, onReady: () => ready.push(1) }).start({}), null);
  assert.deepEqual(ready, []);
});

test('a tela invalida ao fechar, ao trocar de pessoa e ao sair (desmontar)', () => {
  const source = readFileSync(new URL('./Local.jsx', import.meta.url), 'utf8');
  assert.match(source, /const close = \(\) => \{[^}]*prep\.current\.invalidate\(\)/);
  assert.match(source, /const select = \(id\) => \{[^}]*prep\.current\.invalidate\(\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => prep\.current\.invalidate\(\), \[\]\)/);
});
