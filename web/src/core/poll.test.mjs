import assert from 'node:assert/strict';
import test from 'node:test';
import { createPoller } from './poll.js';

// Relógio e visibilidade falsos: nenhum timer real, nenhuma rede.
function harness({ visible = true } = {}) {
  const timers = new Map();
  let nextId = 1;
  let isVisible = visible;
  const listeners = new Set();
  const reads = [];
  const data = [];
  const errors = [];
  const api = {
    timers: { setTimeout: (fn) => { const id = nextId++; timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id) },
    visibility: { isVisible: () => isVisible, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } },
    read: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
    onData: (value) => data.push(value),
    onError: (error) => errors.push(error),
  };
  return {
    api, reads, data, errors, timers,
    setVisible(value) { isVisible = value; listeners.forEach((fn) => fn()); },
    fire() { const [[id, fn]] = [...timers]; timers.delete(id); fn(); },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('lê já ao iniciar e agenda a próxima só depois da resposta (no máximo 1 leitura em voo)', async () => {
  const h = harness();
  const poller = createPoller({ ...h.api, every: 5000 });
  poller.start();
  assert.equal(h.reads.length, 1);
  assert.equal(h.timers.size, 0, 'sem timer enquanto a leitura está em voo');
  poller.refresh(); poller.refresh();
  assert.equal(h.reads.length, 1, 'refresh durante leitura reaproveita a leitura em voo');
  h.reads[0].resolve('A');
  await flush();
  assert.deepEqual(h.data, ['A']);
  assert.equal(h.timers.size, 1);
  h.fire();
  assert.equal(h.reads.length, 2);
  poller.stop();
});

test('oculto não inicia leitura; ao voltar visível retoma com UMA leitura e UM timer', async () => {
  const h = harness({ visible: false });
  const poller = createPoller({ ...h.api, every: 5000 });
  poller.start();
  assert.equal(h.reads.length, 0);
  assert.equal(h.timers.size, 0);
  h.setVisible(true); h.setVisible(true);
  assert.equal(h.reads.length, 1, 'duas notificações seguidas não geram duas leituras');
  h.reads[0].resolve('B');
  await flush();
  assert.equal(h.timers.size, 1);
  poller.stop();
});

test('ocultar durante a leitura descarta o resultado velho e limpa o timer', async () => {
  const h = harness();
  const poller = createPoller({ ...h.api, every: 5000 });
  poller.start();
  h.setVisible(false);
  h.reads[0].resolve('velho');
  await flush();
  assert.deepEqual(h.data, []);
  assert.equal(h.timers.size, 0);
  poller.stop();
});

test('stop invalida a resposta pendente e não deixa timer órfão', async () => {
  const h = harness();
  const poller = createPoller({ ...h.api, every: 5000 });
  poller.start();
  poller.stop();
  h.reads[0].resolve('tarde');
  await flush();
  assert.deepEqual(h.data, []);
  assert.equal(h.timers.size, 0);
});

test('erro de leitura vai para onError e o ciclo continua', async () => {
  const h = harness();
  const poller = createPoller({ ...h.api, every: 5000 });
  poller.start();
  h.reads[0].reject(new Error('falhou'));
  await flush();
  assert.equal(h.errors.length, 1);
  assert.equal(h.timers.size, 1);
  poller.stop();
});

test('every=0 lê uma vez e não agenda timer', async () => {
  const h = harness();
  const poller = createPoller({ ...h.api, every: 0 });
  poller.start();
  h.reads[0].resolve('x');
  await flush();
  assert.equal(h.timers.size, 0);
  poller.stop();
});

// ---------- Reparo Etapa 1: achado 4 ----------
test('achado 4: ocultar e reexibir com leitura pendente NÃO inicia segunda leitura (pico 1) e o resultado velho é descartado', async () => {
  const h = harness();
  const poller = createPoller({ ...h.api, every: 5000 });
  poller.start();
  h.setVisible(false); h.setVisible(true);
  assert.equal(h.reads.length, 1, 'a leitura real continua única');
  h.reads[0].resolve('velho');
  await flush();
  assert.deepEqual(h.data, [], 'resultado de antes da ocultação não é aplicado');
  assert.equal(h.reads.length, 2, 'só depois de a leitura real terminar, uma nova leitura');
  h.reads[1].resolve('novo');
  await flush();
  assert.deepEqual(h.data, ['novo']);
  poller.stop();
});

test('achado 4: read recebe isCurrent, que fica falso ao ocultar, parar ou trocar de geração', async () => {
  const h = harness();
  let ctx;
  const poller = createPoller({ ...h.api, every: 5000, read: (c) => { ctx = c; return new Promise(() => {}); } });
  poller.start();
  assert.equal(ctx.isCurrent(), true);
  h.setVisible(false);
  assert.equal(ctx.isCurrent(), false);
  poller.stop();
  assert.equal(ctx.isCurrent(), false);
});
