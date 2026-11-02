import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHits, clampSeek, createSessionQueue, isOngoing, keyTarget, nextHit, percentAt, replayWindow, rewindWindow, timeAtX } from './replay.js';

const cam = { id: 'cam1', name: 'Externa 1' };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise((r) => setImmediate(r));

test('janela do replay: 30 s antes, fim + 1 min (mínimo 3 min) e nunca além de agora − 5 s; offset do DVR vale', () => {
  const w = replayWindow(cam, { start: 1000, end: 1100 }, 0, 5000);
  assert.deepEqual([w.start, w.from, w.to], [990, 970, 1160]);
  const near = replayWindow(cam, { start: 4990, end: null }, 0, 5000);
  assert.equal(near.to, 4995, 'evento em andamento: até agora − 5 s');
  assert.equal(replayWindow(cam, { start: 1000, end: 1100 }, 100, 5000).to, 1160);
  assert.equal(replayWindow(cam, { start: 4900, end: 4901 }, 50, 5000).to, 5045, 'o relógio do DVR (offset) conta');
  const back = rewindWindow(cam, 0, 5000);
  assert.deepEqual([back.start, back.from, back.to], [4940, 4700, 4995]);
});

test('trechos com movimento: evento em andamento termina agora; ordena; linha do tempo preso entre 0 e 100', () => {
  const hits = buildHits([{ start: 300, end: 320 }, { start: 100, end: null }, { start: 50, end: 60, hits: [[50, 55], [58, 60]] }], 200);
  assert.deepEqual(hits, [[50, 55], [58, 60], [100, 200], [300, 320]]);
  assert.equal(isOngoing([{ start: 100, end: null }], 120), true);
  assert.equal(isOngoing([{ start: 300, end: null }], 120), false);
  assert.equal(percentAt(150, 100, 200), 50);
  assert.equal(percentAt(50, 100, 200), 0);
  assert.equal(percentAt(999, 100, 200), 100);
  assert.equal(timeAtX(150, 100, 100, 1000, 1100), 1050);
  assert.equal(timeAtX(0, 100, 100, 1000, 1100), 1000);
  assert.equal(timeAtX(500, 100, 100, 1000, 1100), 1100);
});

test('linha do tempo: próximo movimento, teclado ±10 s/Home/End e busca que não passa de agora − 10 s', () => {
  assert.equal(nextHit([[100, 110], [200, 210]], 150), 200);
  assert.equal(nextHit([[100, 110]], 150), undefined);
  assert.equal(keyTarget('ArrowLeft', 500, 100, 900), 490);
  assert.equal(keyTarget('ArrowRight', 500, 100, 900), 510);
  assert.equal(keyTarget('Home', 500, 100, 900), 100);
  assert.equal(keyTarget('End', 500, 100, 900), 900);
  assert.equal(keyTarget('x', 500, 100, 900), undefined);
  assert.equal(clampSeek(10000, 5000), 4990);
  assert.equal(clampSeek(4000.9, 5000), 4000);
});

test('fila de sessões: nunca dois "abrir" ao mesmo tempo; o segundo troca a sessão anterior (replace)', async () => {
  const opens = []; const closes = []; let inflight = 0; let peak = 0;
  const gates = [];
  const q = createSessionQueue({
    open: (args) => { opens.push(args); inflight += 1; peak = Math.max(peak, inflight); const g = deferred(); gates.push(g); return g.promise.finally(() => { inflight -= 1; }); },
    close: (id) => { closes.push(id); return Promise.resolve(); },
  });
  const first = q.request({ camera: 'cam1', start: 1 });
  await flush();
  const second = q.request({ camera: 'cam1', start: 2 });
  gates[0].resolve({ id: 'S1' });
  assert.equal(await first, null, 'o primeiro foi substituído antes de terminar: não vira a sessão atual');
  assert.deepEqual(closes, ['S1'], 'a sessão que chegou tarde é fechada no ato');
  await flush();
  gates[1].resolve({ id: 'S2' });
  assert.equal(await second, 'S2');
  assert.equal(peak, 1);
  assert.equal(opens[1].replace, undefined, 'S1 já tinha sido fechada: não há o que trocar');
  const third = q.request({ camera: 'cam1', start: 3 });
  await flush();
  assert.equal(opens[2].replace, 'S2', 'sessão viva é trocada numa chamada só');
  gates[2].resolve({ id: 'S3' });
  assert.equal(await third, 'S3');
});

test('fila: cancelar fecha a sessão que chega depois; dispose fecha a atual; erro do servidor volta ao pedido vigente', async () => {
  const closes = [];
  const gate = deferred();
  const q = createSessionQueue({ open: () => gate.promise, close: (id) => { closes.push(id); return Promise.resolve(); } });
  const pending = q.request({ start: 1 });
  await flush();
  q.cancel();
  gate.resolve({ id: 'LATE' });
  assert.equal(await pending, null);
  assert.deepEqual(closes, ['LATE']);
  const q2 = createSessionQueue({ open: async () => ({ id: 'OK' }), close: (id) => { closes.push(id); return Promise.resolve(); } });
  assert.equal(await q2.request({}), 'OK');
  assert.equal(q2.current(), 'OK');
  q2.dispose();
  assert.deepEqual(closes, ['LATE', 'OK']);
  assert.equal(q2.current(), null);
  const q3 = createSessionQueue({ open: async () => { throw new Error('DVR sem gravação'); }, close: () => Promise.resolve() });
  await assert.rejects(q3.request({}), /DVR sem gravação/);
});
