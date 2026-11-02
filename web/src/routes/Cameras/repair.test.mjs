import assert from 'node:assert/strict';
import test from 'node:test';
import { createMediaGate } from './gate.js';
import { audioAvailability, fullscreenKind } from './media.js';
import { createSessionQueue, replayKey } from './replay.js';
import { CAMS, count, setupCameras, skip } from './harness.mjs';

// Reparos Crivo M4: P1 replayId null, P1 ocultar com abertura pendente, P2 fila perde id antigo em 409, P2 controles de áudio/tela cheia.
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise((r) => setImmediate(r));
const ID = 'aabbccddeeff';

function gateHarness() {
  let visible = true; const subs = new Set(); const opened = [];
  const gate = createMediaGate({ isVisible: () => visible, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); }, start: (key) => { opened.push(key); return () => {}; } });
  return { gate, opened, setVisible: (v) => { visible = v; subs.forEach((fn) => fn()); } };
}

test('P1: chave null ou indefinida NUNCA abre stream (nada de /api/replays/null/ws)', () => {
  const { gate, opened, setVisible } = gateHarness();
  gate.set(null);
  gate.set(undefined);
  setVisible(false); setVisible(true);
  assert.deepEqual(opened, []);
  gate.set(ID);
  assert.deepEqual(opened, [ID]);
  gate.set(null);
  assert.equal(gate.isOpen(), false, 'voltar a null fecha o anterior');
});

test('P1: replayKey só libera id válido, com a busca iniciada e MSE suportado', () => {
  assert.equal(replayKey({ started: true, supported: true, id: ID }), ID);
  assert.equal(replayKey({ started: false, supported: true, id: ID }), undefined);
  assert.equal(replayKey({ started: true, supported: false, id: ID }), undefined);
  for (const id of [null, undefined, '', 'null', 'undefined', 'xyz', `${ID}0`, '../x', ID.toUpperCase()]) assert.equal(replayKey({ started: true, supported: true, id }), undefined, String(id));
});

function queueHarness() {
  const opens = []; const closes = []; const gates = [];
  const q = createSessionQueue({ open: (args) => { opens.push(args); const g = deferred(); gates.push(g); return g.promise; }, close: (id) => { closes.push(id); return Promise.resolve(); } });
  return { q, opens, closes, gates };
}

test('P1: ocultar (suspend) fecha a sessão atual e descarta a abertura pendente; retomar abre no máximo UMA, sem replace e sem retry', async () => {
  const { q, opens, closes, gates } = queueHarness();
  const first = q.request({ camera: 'cam1', start: 1 }); await flush();
  gates[0].resolve({ id: 'S1' }); assert.equal(await first, 'S1');
  const pending = q.request({ camera: 'cam1', start: 2 }); await flush();
  assert.equal(opens[1].replace, 'S1');
  q.suspend(); // aba oculta
  assert.deepEqual(closes, ['S1'], 'a sessão conhecida fecha ao ocultar');
  gates[1].resolve({ id: 'S2' }); // abertura que chega tarde
  assert.equal(await pending, null);
  assert.deepEqual(closes, ['S1', 'S2'], 'a sessão tardia é fechada no ato');
  assert.equal(q.current(), null);
  const again = q.request({ camera: 'cam1', start: 3 }); await flush(); // aba voltou: uma abertura só
  assert.equal(opens.length, 3);
  assert.equal(opens[2].replace, undefined);
  gates[2].resolve({ id: 'S3' }); assert.equal(await again, 'S3');
  assert.equal(opens.length, 3, 'nenhuma abertura automática extra');
});

test('P1: suspend sem nada aberto não faz chamada alguma', async () => {
  const { q, opens, closes } = queueHarness();
  q.suspend();
  await flush();
  assert.deepEqual([opens.length, closes.length], [0, 0]);
});

test('P2: falha ao trocar (409/rede) mantém o id antigo; dispose fecha; nada reabre sozinho', async () => {
  const { q, opens, closes, gates } = queueHarness();
  const first = q.request({ camera: 'cam1', start: 1 }); await flush(); gates[0].resolve({ id: 'S1' }); await first;
  const second = q.request({ camera: 'cam1', start: 2 }); await flush();
  assert.equal(opens[1].replace, 'S1');
  gates[1].reject(Object.assign(new Error('Há 2 replays abertos.'), { status: 409 }));
  await assert.rejects(second, /replays abertos/);
  assert.equal(q.current(), 'S1', 'o id conhecido não se perde');
  q.dispose();
  assert.deepEqual(closes, ['S1']);
  await flush();
  assert.equal(opens.length, 2, 'sem retry de abertura');
});

test('P2: dispose com abertura em andamento fecha o id conhecido e a sessão tardia', async () => {
  const { q, closes, gates } = queueHarness();
  const first = q.request({ camera: 'cam1', start: 1 }); await flush(); gates[0].resolve({ id: 'S1' }); await first;
  const second = q.request({ camera: 'cam1', start: 2 }); await flush();
  q.dispose();
  assert.deepEqual(closes, ['S1']);
  gates[1].resolve({ id: 'S2' });
  assert.equal(await second, null);
  assert.deepEqual(closes, ['S1', 'S2']);
});

test('P2: troca bem-sucedida consome o id antigo (não fecha duas vezes)', async () => {
  const { q, closes, gates } = queueHarness();
  const first = q.request({ camera: 'cam1', start: 1 }); await flush(); gates[0].resolve({ id: 'S1' }); await first;
  const second = q.request({ camera: 'cam1', start: 2 }); await flush(); gates[1].resolve({ id: 'S2' }); await second;
  q.dispose();
  assert.deepEqual(closes, ['S2']);
});

test('P2: tela cheia — elemento (padrão e webkit), vídeo do iPhone ou nada', () => {
  assert.equal(fullscreenKind(undefined, null), null);
  assert.equal(fullscreenKind({ fullscreenEnabled: true }, null), 'element');
  assert.equal(fullscreenKind({ webkitFullscreenEnabled: true }, null), 'element');
  assert.equal(fullscreenKind({ fullscreenEnabled: false }, null), null);
  assert.equal(fullscreenKind({}, { webkitSupportsFullscreen: true }), 'video');
  assert.equal(fullscreenKind({ fullscreenEnabled: true }, { webkitSupportsFullscreen: true }), 'element');
});

test('P2: áudio — só afirma quando o navegador prova; senão "não sei" (null), nunca falso positivo', () => {
  assert.equal(audioAvailability(null), null);
  assert.equal(audioAvailability({}), null);
  assert.equal(audioAvailability({ mozHasAudio: true }), true);
  assert.equal(audioAvailability({ audioTracks: { length: 1 } }), true);
  assert.equal(audioAvailability({ webkitAudioDecodedByteCount: 10 }), true);
  assert.equal(audioAvailability({ audioTracks: { length: 0 } }), false);
  assert.equal(audioAvailability({ mozHasAudio: false }), false);
});

test('P2: Live e Replay têm som e tela cheia acessíveis quando o navegador oferece; o vídeo nasce mudo', { skip }, () => {
  globalThis.document = { fullscreenEnabled: true };
  globalThis.window = { MediaSource: class {} }; // MSE disponível: o ao vivo usa <video>
  try {
    const t = setupCameras();
    const live = t.render(t.mod('Cameras/Live.jsx').Live, { cameras: CAMS, index: 0, poster: null, move() {}, close() {}, rewind() {} });
    assert.match(live, /<video[^>]*muted=""/);
    assert.match(live, /aria-label="Ligar o som"[^>]*aria-pressed="false"/);
    assert.match(live, /aria-label="Tela cheia"/);
    const replay = t.render(t.mod('Cameras/Replay.jsx').Replay, { camera: CAMS[0], start: 1000, from: 900, to: 1200, offset: 0, autoStart: false, close() {}, goLive() {} });
    assert.match(replay, /aria-label="Ligar o som"/);
    assert.match(replay, /aria-label="Tela cheia"/);
    assert.equal(count(live, /aria-label="Tela cheia"/g), 1);
  } finally { delete globalThis.document; delete globalThis.window; }
  const t = setupCameras();
  const none = t.render(t.mod('Cameras/Live.jsx').Live, { cameras: CAMS, index: 0, poster: null, move() {}, close() {}, rewind() {} });
  assert.ok(!/aria-label="Tela cheia"/.test(none), 'sem suporte do navegador, sem botão que não funciona');
});
