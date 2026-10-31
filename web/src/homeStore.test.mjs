import assert from 'node:assert/strict';
import test from 'node:test';
import { createHomeStore, resultNotice } from './homeStore.js';

class ApiError extends Error {
  constructor(message, status, code, receipt = null) { super(message); this.status = status; this.code = code; this.receipt = receipt; }
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise((resolve) => setImmediate(resolve));

const DEVICES = [
  { id: 'quarto-luz', physicalId: 'physical-1', state: { power: false }, confidence: 'reported' },
  { id: 'banheiro-luz', physicalId: 'physical-2', state: { power: false }, confidence: 'reported' },
  { id: 'tv-quarto', physicalId: 'physical-3', state: {}, confidence: 'unknown' },
  { id: 'ar-quarto', physicalId: 'physical-3', state: { power: false }, confidence: 'estimated' },
];
const snap = (revision, { epoch = 'A', power = false, devices = DEVICES } = {}) => ({
  stateVersion: { epoch, revision }, mode: 'local',
  devices: devices.map((d) => (d.id === 'quarto-luz' ? { ...d, state: { power } } : d)), scenes: [], recentActions: [],
});
const receipt = (over = {}) => ({ requestId: 'r1', delivery: 'sent', stateVersion: { epoch: 'A', revision: 13 }, outcome: 'confirmed', requested: { power: true }, reported: { power: true }, confirmedFields: ['power'], divergedFields: [], observedAt: 't', timing: { budgetMs: 6000, elapsedMs: 100, overrunMs: 0 }, ...over });
const ok = (revision, rc, extra = {}) => ({ state: snap(revision, { power: true }), device: DEVICES[0], command: { status: 'acknowledged', confidence: 'reported', receipt: rc, ...extra } });

function make({ initial = snap(10), get, post } = {}) {
  const calls = { get: 0, post: [] };
  const store = createHomeStore({
    bootstrap: async () => ({ ...(typeof initial === 'function' ? initial() : initial), csrfToken: 'tok' }),
    get: get || (async () => { calls.get += 1; return snap(10); }),
    post: async (path, body) => { calls.post.push(path); return (post || (async () => ok(11, receipt())))(path, body); },
  });
  return { store, calls };
}
const light = '/api/devices/quarto-luz/commands';

test('snapshot de mesma epoch só avança: A12 aplica, A11 não regride', async () => {
  const { store } = make();
  await store.bootstrap();
  assert.equal(store.applySnapshot(snap(12, { power: true })), true);
  assert.equal(store.applySnapshot(snap(11, { power: false })), false);
  const { home } = store.getSnapshot();
  assert.equal(home.stateVersion.revision, 12);
  assert.equal(home.devices[0].state.power, true);
});

test('getSnapshot devolve referência estável até algo mudar', async () => {
  const { store } = make();
  await store.bootstrap();
  assert.equal(store.getSnapshot(), store.getSnapshot());
});

test('GET antigo em voo não substitui o snapshot aplicado pelo POST', async () => {
  const slow = deferred();
  const { store } = make({ get: () => slow.promise, post: async () => ok(13, receipt()) });
  await store.bootstrap();
  const read = store.refresh();
  await store.run(light, { action: 'set', values: { power: true } });
  slow.resolve(snap(12, { power: false }));
  await read;
  const { home } = store.getSnapshot();
  assert.equal(home.stateVersion.revision, 13);
  assert.equal(home.devices[0].state.power, true);
});

test('backend antigo sem stateVersion: iniciar mutação invalida o GET em voo', async () => {
  const slow = deferred();
  const legacy = (power) => ({ ...snap(0, { power }), stateVersion: undefined });
  const { store } = make({ initial: legacy(false), get: () => slow.promise, post: async () => ({ state: legacy(true), device: DEVICES[0], command: { status: 'sent', confidence: 'reported' } }) });
  await store.bootstrap();
  const read = store.refresh();
  await store.run(light, { action: 'set', values: { power: true } });
  slow.resolve(legacy(false));
  await read;
  assert.equal(store.getSnapshot().home.devices[0].state.power, true);
});

test('POST com snapshot não dispara GET /api/state extra', async () => {
  const { store, calls } = make();
  await store.bootstrap();
  await store.run(light, { action: 'set', values: { power: true } });
  assert.equal(calls.get, 0);
});

test('refresh() que as telas chamam logo depois do POST é absorvido; o poll usa force e lê de verdade', async () => {
  const { store, calls } = make();
  await store.bootstrap();
  await store.run(light, { action: 'set', values: { power: true } });
  await store.refresh(); await store.refresh(); // legado: reload()+refresh() da tela após o comando
  assert.equal(calls.get, 0, 'o snapshot do POST já é a verdade mais nova');
  await store.refresh({ force: true });
  assert.equal(calls.get, 1);
  await store.refresh(); // sem POST novo, refresh() normal lê
  assert.equal(calls.get, 2);
});

test('refresh é single-flight', async () => {
  const slow = deferred();
  let gets = 0;
  const { store } = make({ get: () => { gets += 1; return slow.promise; } });
  await store.bootstrap();
  const a = store.refresh(); const b = store.refresh();
  assert.equal(gets, 1);
  slow.resolve(snap(11));
  await Promise.all([a, b]);
});

test('falha de GET mantém os dados antigos e registra o erro sem mexer em comandos', async () => {
  const { store } = make({ get: async () => { throw new ApiError('Sem conexão', 0, 'offline'); } });
  await store.bootstrap();
  await store.refresh().catch(() => {});
  const s = store.getSnapshot();
  assert.equal(s.home.stateVersion.revision, 10);
  assert.ok(s.stateError);
});

test('confirmação só com receipt completo por campo', async () => {
  const cases = [
    ['power confirmado', receipt(), 'confirmed'],
    ['late complete com overrun continua confirmado', receipt({ timing: { budgetMs: 6000, elapsedMs: 6500, overrunMs: 500 }, delivery: 'unknown' }), 'confirmed'],
    ['parcial sem divergência', receipt({ outcome: 'unconfirmed', confirmedFields: [], reported: {} }), 'sent'],
    ['divergente', receipt({ outcome: 'diverged', confirmedFields: [], divergedFields: ['power'], reported: { power: false } }), 'diverged'],
    ['key sem telemetria nunca confirmed (conjunto vazio)', receipt({ requested: {}, confirmedFields: [], reported: {} }), 'sent'],
    ['confirmed mas campo pedido fora de confirmedFields', receipt({ requested: { power: true, brightness: 50 } }), 'sent'],
    ['prévia', receipt({ outcome: 'preview', delivery: 'not_sent', confirmedFields: [], reported: {} }), 'simulated'],
    ['legado sem receipt', undefined, 'sent'],
  ];
  for (const [name, rc, phase] of cases) {
    const { store } = make({ post: async () => ok(11, rc) });
    await store.bootstrap();
    await store.run(light, { action: 'set', values: { power: true } });
    assert.equal(store.commandFor('quarto-luz').phase, phase, name);
  }
});

test('ACK com status acknowledged sem receipt não vira confirmed', async () => {
  const { store } = make({ post: async () => ok(11, undefined, { status: 'acknowledged', confidence: 'reported' }) });
  await store.bootstrap();
  await store.run(light, { action: 'set', values: { power: true } });
  assert.notEqual(store.commandFor('quarto-luz').phase, 'confirmed');
});

test('erros: 502 divergente preserva receipt; 502 desconhecido é inconclusivo; 504/403 sem envio é erro; offline é inconclusivo', async () => {
  const cases = [
    ['502 divergente', new ApiError('x', 502, 'command_result_unknown', receipt({ outcome: 'diverged', delivery: 'sent', confirmedFields: [], divergedFields: ['power'], reported: { power: false } })), 'diverged'],
    ['502 desconhecido', new ApiError('x', 502, 'command_result_unknown', receipt({ outcome: 'unconfirmed', delivery: 'unknown', confirmedFields: [], reported: {} })), 'unknown'],
    ['504 não enviado', new ApiError('x', 504, 'command_deadline_exceeded', receipt({ outcome: 'unconfirmed', delivery: 'not_sent', confirmedFields: [], reported: {} })), 'error'],
    ['403 sem receipt', new ApiError('x', 403, 'invalid_token'), 'error'],
    ['offline', new ApiError('x', 0, 'offline'), 'unknown'],
  ];
  for (const [name, error, phase] of cases) {
    const { store } = make({ post: async () => { throw error; } });
    await store.bootstrap();
    await assert.rejects(store.run(light, { action: 'set', values: { power: true } }));
    const command = store.commandFor('quarto-luz');
    assert.equal(command.phase, phase, name);
    assert.equal(command.receipt, error.receipt, name);
    assert.equal(store.getSnapshot().home.devices[0].state.power, false, `${name}: erro não inventa estado`);
  }
});

test('mesmo físico: segundo comando não sai enquanto o primeiro está pendente; outro físico segue livre', async () => {
  const first = deferred();
  const { store, calls } = make({ post: () => first.promise });
  await store.bootstrap();
  const a = store.run(light, { action: 'set', values: { power: true } });
  assert.equal(store.commandFor('quarto-luz').phase, 'pending');
  await assert.rejects(store.run(light, { action: 'set', values: { power: false } }), (e) => e.code === 'device_busy');
  assert.equal(calls.post.length, 1);
  const other = store.run('/api/devices/banheiro-luz/commands', { action: 'set', values: { power: true } });
  assert.equal(calls.post.length, 2);
  first.resolve(ok(11, receipt())); await a;
  await other.catch(() => {});
});

test('TV + ar na mesma central: um só fluxo físico, entre rotas, e o estado persiste', async () => {
  const learn = deferred();
  const { store, calls } = make({ post: () => learn.promise });
  await store.bootstrap();
  const pending = store.run('/api/devices/ar-quarto/learn', {});
  // "navegar para TV": outro consumidor da mesma store tenta uma tecla
  await assert.rejects(store.run('/api/devices/tv-quarto/commands', { action: 'key', key: 'power' }), (e) => e.code === 'device_busy');
  assert.equal(calls.post.length, 1);
  assert.equal(store.commandFor('tv-quarto').phase, 'pending', 'irmão físico enxerga a pendência');
  learn.resolve({ state: snap(11), device: DEVICES[3], command: { status: 'sent', confidence: 'estimated' } });
  await pending;
  assert.equal(store.commandFor('ar-quarto').phase, 'sent');
});

test('erro atrasado de uma ação antiga não libera nem rebaixa a ação nova', async () => {
  const old = deferred();
  const fresh = deferred();
  let n = 0;
  let boots = 0;
  const { store } = make({ initial: () => (boots++ ? snap(1, { epoch: 'B' }) : snap(10)), post: () => (++n === 1 ? old.promise : fresh.promise) });
  await store.bootstrap();
  const first = store.run(light, { action: 'set', values: { power: true } });
  first.catch(() => {});
  store.applySnapshot(snap(1, { epoch: 'B' })); // restart: ação antiga fica inconclusiva e libera o físico
  assert.equal(store.commandFor('quarto-luz').phase, 'unknown');
  await flush(); // bootstrap da epoch nova termina antes de o usuário comandar de novo
  const second = store.run(light, { action: 'set', values: { power: true } });
  assert.equal(store.commandFor('quarto-luz').phase, 'pending');
  old.reject(new ApiError('tarde', 502, 'command_result_unknown', receipt({ stateVersion: { epoch: 'A', revision: 10 }, outcome: 'unconfirmed', confirmedFields: [] })));
  await flush();
  assert.equal(store.commandFor('quarto-luz').phase, 'pending', 'erro antigo não mexe na ação nova');
  fresh.resolve({ state: snap(2, { epoch: 'B', power: true }), device: DEVICES[0], command: { status: 'acknowledged', receipt: receipt({ stateVersion: { epoch: 'B', revision: 2 } }) } });
  await second;
  assert.equal(store.commandFor('quarto-luz').phase, 'confirmed');
});

test('epoch nova em snapshot pede bootstrap em vez de substituição cega', async () => {
  let boots = 0;
  const store = createHomeStore({ bootstrap: async () => { boots += 1; return { ...snap(1, { epoch: boots > 1 ? 'B' : 'A' }), csrfToken: 't' }; }, get: async () => snap(1, { epoch: 'B' }), post: async () => ok(11, receipt()) });
  await store.bootstrap();
  assert.equal(store.applySnapshot(snap(5, { epoch: 'B' })), false);
  await flush();
  assert.equal(boots, 2);
  assert.equal(store.getSnapshot().home.stateVersion.epoch, 'B');
});

test('bootstrap com mesma epoch não apaga ação pendente', async () => {
  const hang = deferred();
  const { store } = make({ post: () => hang.promise });
  await store.bootstrap();
  const run = store.run(light, { action: 'set', values: { power: true } });
  run.catch(() => {});
  await store.bootstrap();
  assert.equal(store.commandFor('quarto-luz').phase, 'pending');
});

test('POST genérico (não aparelho nem modo) não cria estado de comando', async () => {
  const { store, calls } = make({ post: async () => ({ ok: true }) });
  await store.bootstrap();
  const result = await store.run('/api/notifications', { enabled: true });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.post.length, 1);
  assert.deepEqual(store.getSnapshot().commands, {});
});

test('modo reserva todos os físicos e não aceita comando de aparelho durante a execução', async () => {
  const run = deferred();
  const { store, calls } = make({ post: () => run.promise });
  await store.bootstrap();
  const mode = store.run('/api/scenes/noite/run', {});
  await assert.rejects(store.run('/api/devices/banheiro-luz/commands', { action: 'set', values: { power: true } }), (e) => e.code === 'device_busy');
  assert.equal(calls.post.length, 1);
  run.resolve({ state: snap(11), results: [], status: 'completed', evidenceSummary: {} });
  await mode;
  assert.notEqual(store.commandFor('banheiro-luz')?.phase, 'pending');
});

test('resultNotice: parcial nunca é sucesso total; IR completo mostra incerteza', () => {
  assert.equal(resultNotice('/api/scenes/x/run', { status: 'partial', evidenceSummary: { confirmed: 1, unconfirmed: 2, operationalFailures: 1 } }).kind, 'warn');
  const ir = resultNotice('/api/scenes/x/run', { status: 'completed', evidenceSummary: { confirmed: 0, unconfirmed: 2, operationalFailures: 0 } });
  assert.equal(ir.kind, 'warn');
  assert.match(ir.text, /nenhum estado físico confirmado/i);
  assert.equal(resultNotice('/api/scenes/x/run', { status: 'completed', evidenceSummary: { confirmed: 2, unconfirmed: 0, operationalFailures: 0 } }).kind, 'ok');
  assert.equal(resultNotice('/api/notifications', { ok: true }).kind, 'ok');
});

test('reset invalida a geração: resposta tardia não altera a store', async () => {
  const slow = deferred();
  const { store } = make({ get: () => slow.promise });
  await store.bootstrap();
  const read = store.refresh();
  store.reset();
  slow.resolve(snap(99));
  await read.catch(() => {});
  assert.equal(store.getSnapshot().home, null);
});

// ---------- Reparo Etapa 1: 6 achados do Crivo ----------
const lamp = (power, extra = {}) => ({ id: 'quarto-luz', physicalId: 'physical-1', state: { power, brightness: 50 }, confidence: 'reported', fieldObservations: {}, ...extra });
const snapL = (revision, power, epoch = 'A') => ({ stateVersion: { epoch, revision }, mode: 'local', devices: [lamp(power), DEVICES[1], DEVICES[2], DEVICES[3]], scenes: [], recentActions: [] });
const rc = (revision, over = {}) => ({ requestId: `req-${revision}`, delivery: 'sent', stateVersion: { epoch: 'A', revision }, outcome: 'diverged', requested: { power: true }, reported: { power: false }, confirmedFields: [], divergedFields: ['power'], observedAt: '2026-10-31T20:00:00Z', timing: { budgetMs: 6000, elapsedMs: 10, overrunMs: 0 }, ...over });
const errWith = (receipt, status = 502) => new ApiError('falhou', status, 'command_result_unknown', receipt);
function makeL({ post, get, now, boot = () => snapL(12, true) } = {}) {
  const calls = { boots: 0, get: 0 };
  const store = createHomeStore({
    bootstrap: async () => { calls.boots += 1; return { ...boot(), csrfToken: 't' }; },
    get: get || (async () => { calls.get += 1; return snapL(12, true); }),
    post, ApiError, now,
  });
  return { store, calls };
}

test('achado 1: receipt velho (A10) depois de snapshot A12 não rebaixa valor nem vira divergente; fica em histórico', async () => {
  const { store } = makeL({ post: async () => { throw errWith(rc(10)); } });
  await store.bootstrap();
  await assert.rejects(store.run(light, {}));
  const command = store.commandFor('quarto-luz');
  assert.equal(command.phase, 'unknown');
  assert.equal(command.receipt, null);
  assert.equal(command.staleReceipt.stateVersion.revision, 10);
  const { home } = store.getSnapshot();
  assert.equal(home.stateVersion.revision, 12);
  assert.equal(home.devices[0].state.power, true);
});

test('achado 1: receipt novo parcial (A13) mescla SÓ reported e metadados reais ao snapshot', async () => {
  const { store } = makeL({ post: async () => { throw errWith(rc(13)); } });
  await store.bootstrap();
  await assert.rejects(store.run(light, {}));
  const command = store.commandFor('quarto-luz');
  assert.equal(command.phase, 'diverged');
  assert.equal(command.receipt.stateVersion.revision, 13);
  const { home } = store.getSnapshot();
  assert.equal(home.stateVersion.revision, 13);
  const device = home.devices[0];
  assert.equal(device.state.power, false, 'campo observado entra');
  assert.equal(device.state.brightness, 50, 'campo não observado fica como estava, sem inventar');
  assert.deepEqual(device.fieldObservations.power, { observedAt: '2026-10-31T20:00:00Z', revision: 13 });
  assert.equal(device.fieldObservations.brightness, undefined);
});

test('achado 1: receipt de epoch diferente não mescla, fica inconclusivo e pede bootstrap', async () => {
  const { store, calls } = makeL({ post: async () => { throw errWith(rc(3, { stateVersion: { epoch: 'B', revision: 3 } })); } });
  await store.bootstrap();
  await assert.rejects(store.run(light, {}));
  await flush();
  assert.equal(store.commandFor('quarto-luz').phase, 'unknown');
  assert.equal(store.getSnapshot().home.devices[0].state.power, true);
  assert.equal(calls.boots, 2);
});

test('achado 1: sucesso com receipt/snapshot mais velho que o aplicado não confirma', async () => {
  const { store } = makeL({ post: async () => ({ state: snapL(11, false), device: lamp(false), command: { status: 'acknowledged', receipt: rc(11, { outcome: 'confirmed', confirmedFields: ['power'], divergedFields: [], requested: { power: false } }) } }) });
  await store.bootstrap();
  await store.run(light, {});
  assert.equal(store.commandFor('quarto-luz').phase, 'unknown');
  assert.equal(store.getSnapshot().home.stateVersion.revision, 12);
  assert.equal(store.getSnapshot().home.devices[0].state.power, true);
});

test('achado 2: bootstrap/remount da MESMA epoch durante o POST não descarta o snapshot novo nem confirma valor velho', async () => {
  const pending = deferred();
  const { store } = makeL({ post: () => pending.promise });
  await store.bootstrap();
  const action = store.run(light, {});
  await store.bootstrap();
  pending.resolve({ state: snapL(13, false), device: lamp(false), command: { status: 'acknowledged', receipt: rc(13, { outcome: 'confirmed', confirmedFields: ['power'], divergedFields: [], requested: { power: false } }) } });
  await action;
  const { home } = store.getSnapshot();
  assert.equal(home.stateVersion.revision, 13);
  assert.equal(home.devices[0].state.power, false);
  assert.equal(store.commandFor('quarto-luz').phase, 'confirmed');
});

test('achado 2: backend antigo (sem stateVersion) e bootstrap durante o POST terminam inconclusivos, nunca confirmados', async () => {
  const pending = deferred();
  const legacy = (power) => ({ mode: 'local', devices: [lamp(power)], scenes: [], recentActions: [] });
  const { store } = makeL({ boot: () => legacy(true), post: () => pending.promise });
  await store.bootstrap();
  const action = store.run(light, {});
  await store.bootstrap();
  pending.resolve({ state: legacy(false), command: { status: 'acknowledged' } });
  await action;
  assert.equal(store.commandFor('quarto-luz').phase, 'unknown');
  assert.equal(store.getSnapshot().home.devices[0].state.power, true, 'snapshot sem versão de geração antiga é descartado');
});

test('achado 3: modo preserva receipt por aparelho/físico ao liberar o busy; parcial não vira confirmado', async () => {
  const modeResult = {
    state: snapL(13, true), status: 'partial',
    results: [
      { deviceId: 'quarto-luz', status: 'acknowledged', operation: 'accepted', evidence: 'unconfirmed', confirmationExpected: true, receipt: rc(13, { outcome: 'unconfirmed', requested: { power: false }, reported: { brightness: 50 }, divergedFields: [], confirmedFields: [] }) },
      { deviceId: 'banheiro-luz', status: 'failed', operation: 'failed', evidence: 'unconfirmed', confirmationExpected: true, receipt: rc(13, { outcome: 'unconfirmed', delivery: 'unknown', reported: {}, divergedFields: [], confirmedFields: [] }) },
      { deviceId: 'ar-quarto', status: 'sent', operation: 'accepted', evidence: 'unconfirmed', confirmationExpected: false, receipt: rc(13, { outcome: 'unconfirmed', requested: {}, reported: {}, divergedFields: [], confirmedFields: [] }) },
    ],
    evidenceSummary: { confirmed: 0, unconfirmed: 3, diverged: 0, operationalFailures: 1 },
  };
  const { store } = makeL({ post: async () => modeResult });
  await store.bootstrap();
  await store.run('/api/scenes/noite/run', {});
  const light1 = store.commandFor('quarto-luz');
  assert.equal(light1.phase, 'sent');
  assert.equal(light1.receipt.reported.brightness, 50);
  assert.equal(store.commandFor('banheiro-luz').phase, 'unknown');
  assert.equal(store.commandFor('ar-quarto').phase, 'sent');
  assert.equal(store.commandFor('tv-quarto').phase, 'sent', 'mesmo físico do ar enxerga o resultado, sem confirmação');
  // busy liberado: novo comando é aceito
  assert.equal(Object.values(store.getSnapshot().commands).some((c) => c.phase === 'pending'), false);
});

test('achado 3: modo completed misto (DP confirmado + IR) qualifica a incerteza', () => {
  const notice = resultNotice('/api/scenes/mix/run', { status: 'completed', evidenceSummary: { confirmed: 1, unconfirmed: 1, operationalFailures: 0 } });
  assert.equal(notice.kind, 'warn');
  assert.match(notice.text, /parte/i);
  assert.match(notice.text, /confirmação física/i);
});

test('achado 4: refresh só aplica se algum chamador ainda está vigente; chamador legítimo junto mantém o commit', async () => {
  const slow = deferred();
  const { store } = makeL({ get: () => slow.promise });
  await store.bootstrap();
  const stale = store.refresh({ force: true, isCurrent: () => false });
  slow.resolve(snapL(13, false));
  await stale;
  assert.equal(store.getSnapshot().home.stateVersion.revision, 12, 'poll oculto não publica');
  const slow2 = deferred();
  const second = makeL({ get: () => slow2.promise });
  await second.store.bootstrap();
  const a = second.store.refresh({ force: true, isCurrent: () => false });
  const b = second.store.refresh({ force: true }); // legítimo, junta-se à leitura em voo
  slow2.resolve(snapL(13, false));
  await Promise.all([a, b]);
  assert.equal(second.store.getSnapshot().home.stateVersion.revision, 13);
});

test('achado 5: GET velho que falha DEPOIS de um POST bem sucedido não derruba a conexão atual', async () => {
  const slow = deferred();
  const { store } = makeL({ get: () => slow.promise, post: async () => ({ state: snapL(13, false), device: lamp(false), command: { status: 'acknowledged', receipt: rc(13, { outcome: 'confirmed', requested: { power: false }, confirmedFields: ['power'], divergedFields: [] }) } }) });
  await store.bootstrap();
  const old = store.refresh().catch(() => {});
  await store.run(light, {});
  slow.reject(new ApiError('old GET failed', 0, 'offline'));
  await old;
  const s = store.getSnapshot();
  assert.equal(s.stateError, null);
  assert.equal(s.home.stateVersion.revision, 13);
  assert.equal(store.commandFor('quarto-luz').phase, 'confirmed');
});

test('achado 6: homeAt guarda o horário REAL da última aplicação e não muda por erro de leitura', async () => {
  let clock = 1000;
  let fail = false;
  const { store } = makeL({ now: () => clock, get: async () => { if (fail) throw new ApiError('x', 0, 'offline'); return snapL(14, true); } });
  assert.equal(store.getSnapshot().homeAt, 0);
  await store.bootstrap();
  assert.equal(store.getSnapshot().homeAt, 1000);
  clock = 2000; await store.refresh({ force: true });
  assert.equal(store.getSnapshot().homeAt, 2000);
  clock = 3000; fail = true; await store.refresh({ force: true }).catch(() => {});
  assert.equal(store.getSnapshot().homeAt, 2000, 'erro não renova o horário');
  assert.ok(store.getSnapshot().stateError);
});
