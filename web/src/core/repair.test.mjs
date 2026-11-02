import assert from 'node:assert/strict';
import test from 'node:test';
import { createApi } from './api.js';
import { createStore } from './store.js';

// Fixtures do reparo pedido pelo Crivo (3 achados). Não alteram os cenários B2 de store.test.mjs.
class ApiError extends Error {
  constructor(message, status, code, receipt = null) { super(message); this.status = status; this.code = code; this.receipt = receipt; }
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise((resolve) => setImmediate(resolve));

const DEVICES = [
  { id: 'quarto-luz', physicalId: 'physical-1', state: { power: false }, confidence: 'reported' },
  { id: 'banheiro-luz', physicalId: 'physical-2', state: { power: false }, confidence: 'reported' },
  { id: 'tv-quarto', physicalId: 'physical-3', state: {}, confidence: 'unknown' },
];
const snap = (revision, epoch = 'A') => ({ stateVersion: { epoch, revision }, mode: 'local', devices: DEVICES, scenes: [], recentActions: [] });
const MODE = '/api/scenes/chegada/run';
const LIGHT = '/api/devices/quarto-luz/commands';

function make({ get, post } = {}) {
  return createStore({
    bootstrap: async () => ({ ...snap(10), csrfToken: 'tok' }),
    get: get || (async () => snap(10)),
    post: post || (async () => { throw new Error('POST não esperado'); }),
  });
}

test('reparo 1: modo sem recibo e sem resposta (status 0) deixa CADA físico desconhecido, não apaga', async () => {
  const store = make({ post: async () => { throw new ApiError('Sem conexão com o PC de casa.', 0, 'offline'); } });
  await store.bootstrap();
  await assert.rejects(store.run(MODE, {}), (error) => error.status === 0);
  for (const id of ['quarto-luz', 'banheiro-luz', 'tv-quarto']) {
    assert.equal(store.commandFor(id)?.phase, 'unknown', `${id}: o efeito pode ter ocorrido; não pode ficar sem estado`);
  }
});

test('reparo 1: modo recusado ANTES de enviar (4xx comprovado, sem recibo) libera os físicos', async () => {
  const store = make({ post: async () => { throw new ApiError('Modo inexistente.', 404, 'not_found'); } });
  await store.bootstrap();
  await assert.rejects(store.run(MODE, {}));
  for (const id of ['quarto-luz', 'banheiro-luz', 'tv-quarto']) assert.equal(store.commandFor(id), null, id);
});

test('reparo 1: modo com 5xx sem recibo (proxy/queda) fica desconhecido, não é rejeição provada', async () => {
  const store = make({ post: async () => { throw new ApiError('Bad gateway', 502, 'bad_gateway'); } });
  await store.bootstrap();
  await assert.rejects(store.run(MODE, {}));
  assert.equal(store.commandFor('quarto-luz')?.phase, 'unknown');
});

test('reparo 2: 200 com o corpo cortado (text() rejeita) é erro de transporte inconclusivo, sem retry', async () => {
  let posts = 0;
  const fetchFn = async (path, options = {}) => {
    if (path === '/api/bootstrap') return { ok: true, status: 200, text: async () => JSON.stringify({ csrfToken: 't' }) };
    if (options.method === 'POST') { posts += 1; return { ok: true, status: 200, text: async () => { throw new TypeError('terminated'); } }; }
    throw new Error('rota inesperada ' + path);
  };
  const api = createApi({ fetchFn });
  await assert.rejects(api.post(LIGHT, {}), (error) => error.status === 0 && error.code === 'transport');
  assert.equal(posts, 1, 'comando nunca é repetido por erro de transporte');

  const store = createStore({ bootstrap: async () => ({ ...snap(10) }), get: api.get, post: api.post, ApiError });
  await store.bootstrap();
  await assert.rejects(store.run(LIGHT, { action: 'set', values: { power: true } }));
  assert.equal(store.commandFor('quarto-luz').phase, 'unknown', 'o aparelho pode ter recebido o comando');
  assert.equal(posts, 2);
});

test('reparo 2: erro sem status numérico (não veio do transporte) também é inconclusivo, nunca "erro"', async () => {
  const store = make({ post: async () => { throw new TypeError('algo quebrou depois de enviar'); } });
  await store.bootstrap();
  await assert.rejects(store.run(LIGHT, { action: 'set', values: { power: true } }));
  assert.equal(store.commandFor('quarto-luz').phase, 'unknown');
});

test('reparo 3: refresh(force) → bootstrap → refresh(force) mantém UMA leitura física em voo (pico 1)', async () => {
  const first = deferred();
  let inflight = 0; let peak = 0; let calls = 0;
  const store = make({
    get: () => {
      calls += 1; inflight += 1; peak = Math.max(peak, inflight);
      const gate = calls === 1 ? first.promise : Promise.resolve(snap(11));
      return gate.then((v) => { inflight -= 1; return v; }, (e) => { inflight -= 1; throw e; });
    },
  });
  await store.bootstrap();
  const a = store.refresh({ force: true });
  await store.bootstrap();                       // zera a validade da leitura em voo, mas ela continua sendo a ÚNICA física
  const b = store.refresh({ force: true });
  await flush();
  assert.equal(peak, 1, 'o segundo GET só pode sair depois do primeiro terminar');
  first.resolve(snap(10));
  await Promise.all([a, b]);
  assert.equal(calls, 2, 'a leitura posterior ao bootstrap acontece depois da real terminar');
  assert.equal(peak, 1);
  assert.equal(store.getSnapshot().home.stateVersion.revision, 11, 'o resultado da leitura invalidada pelo bootstrap não é aplicado; o da nova é');
});
