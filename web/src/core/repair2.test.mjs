import assert from 'node:assert/strict';
import test from 'node:test';
import { createPoller } from './poll.js';
import { createStore } from './store.js';

// Reparo 2 pedido pelo Crivo. Não altera store.test.mjs (B2) nem repair.test.mjs.
class ApiError extends Error {
  constructor(message, status, code, receipt = null) { super(message); this.status = status; this.code = code; this.receipt = receipt; }
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const DEVICES = [
  { id: 'quarto-luz', physicalId: 'physical-1', state: { power: false }, confidence: 'reported' },
  { id: 'banheiro-luz', physicalId: 'physical-2', state: { power: false }, confidence: 'reported' },
];
const snap = (revision) => ({ stateVersion: { epoch: 'A', revision }, mode: 'local', devices: DEVICES, scenes: [], recentActions: [] });
const MODE = '/api/scenes/chegada/run';

test('P1: só pares status/code que o backend garante ANTES do efeito liberam o modo; 4xx desconhecido fica desconhecido', async () => {
  // Pré-efeito comprovado em server.py: guard() [403 …, 429 rate_limited], read_json() [411, 413, 415, 400 invalid_request], not_found (rota/modes.get).
  const pre = [[403, 'invalid_token'], [403, 'invalid_origin'], [403, 'cross_site'], [403, 'invalid_host'], [429, 'rate_limited'], [411, 'length_required'], [413, 'body_too_large'], [415, 'unsupported_media'], [404, 'not_found'], [400, 'invalid_request']];
  // Não provam nada: 4xx sem code, code estranho, 409 genérico, 404 com outro code, 5xx e qualquer outro 4xx.
  const unproven = [[409, undefined], [409, 'preview_mode'], [404, 'other'], [404, undefined], [400, 'other'], [422, 'invalid_request'], [403, undefined], [500, 'internal_error'], [502, 'bad_gateway']];
  const outcome = async (status, code) => {
    const store = createStore({ bootstrap: async () => snap(10), get: async () => snap(10), post: async () => { throw new ApiError('x', status, code); }, ApiError });
    await store.bootstrap();
    await assert.rejects(store.run(MODE, {}));
    return ['quarto-luz', 'banheiro-luz'].map((id) => store.commandFor(id)?.phase ?? null);
  };
  for (const [status, code] of pre) assert.deepEqual(await outcome(status, code), [null, null], `${status}/${code} é pré-efeito: libera`);
  for (const [status, code] of unproven) assert.deepEqual(await outcome(status, code), ['unknown', 'unknown'], `${status}/${code} não prova pré-envio: desconhecido`);
});

test('P2: continuação de GET de era antiga reavalia isCurrent antes de abrir novo tráfego, e preserva o chamador legítimo', async () => {
  const makeStore = (gets, gate) => createStore({
    bootstrap: async () => snap(10),
    get: () => { gets.n += 1; return gets.n === 1 ? gate.promise : Promise.resolve(snap(11)); },
    post: async () => { throw new Error('sem POST'); },
  });
  const timers = { setTimeout: () => 1, clearTimeout: () => {} };

  // (a) poller real entra na fila atrás da leitura antiga e é PARADO antes de ela terminar: nenhum GET novo depois do stop.
  const a = { n: 0 }; const gateA = deferred();
  const storeA = makeStore(a, gateA);
  await storeA.bootstrap();
  const old = storeA.refresh({ force: true });          // GET 1 real em voo
  await storeA.bootstrap();                              // invalida o commit da leitura em voo
  const poller = createPoller({ read: ({ isCurrent }) => storeA.refresh({ force: true, isCurrent }), every: 0, timers });
  poller.start();                                        // enfileira atrás da leitura antiga
  poller.stop();                                         // deixa de ser vigente
  gateA.resolve(snap(10));
  await old.catch(() => {}); await flush(); await flush();
  assert.equal(a.n, 1, 'depois do stop não pode sair GET 2');

  // (b) mesmo cenário com um chamador legítimo junto: ele continua tendo UMA leitura nova depois da antiga.
  const b = { n: 0 }; const gateB = deferred();
  const storeB = makeStore(b, gateB);
  await storeB.bootstrap();
  const oldB = storeB.refresh({ force: true });
  await storeB.bootstrap();
  const poller2 = createPoller({ read: ({ isCurrent }) => storeB.refresh({ force: true, isCurrent }), every: 0, timers });
  poller2.start();
  const legit = storeB.refresh({ force: true });         // chamador vigente junto
  poller2.stop();
  gateB.resolve(snap(10));
  await Promise.all([oldB.catch(() => {}), legit]); await flush();
  assert.equal(b.n, 2, 'o chamador legítimo ainda recebe a leitura posterior ao bootstrap');
  assert.equal(storeB.getSnapshot().home.stateVersion.revision, 11);
});
