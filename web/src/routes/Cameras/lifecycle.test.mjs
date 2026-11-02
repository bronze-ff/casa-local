import assert from 'node:assert/strict';
import test from 'node:test';
import { attachMse, mseSupported } from './mse.js';

// Ciclo de vida da mídia com WebSocket/MediaSource/vídeo/URL falsos, sem rede (cenários do lifecycle.test.mjs legado).
const sockets = [];
const urls = { made: [], revoked: [] };
class FakeSocket {
  constructor(url) { this.url = url; this.closed = 0; this.sent = []; sockets.push(this); }
  send(data) { this.sent.push(data); }
  close() { this.closed += 1; }
}
class FakeSource {
  constructor() { this.listeners = {}; this.buffer = null; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  addSourceBuffer() { this.buffer = { updating: false, buffered: { length: 0 }, appended: 0, appendBuffer() { this.appended += 1; }, addEventListener() {}, remove() {} }; return this.buffer; }
  static isTypeSupported() { return true; }
}
globalThis.window = { MediaSource: FakeSource };
globalThis.location = { protocol: 'http:', host: 'casa.local' };
globalThis.WebSocket = FakeSocket;
globalThis.URL = Object.assign(Object.create(URL), { createObjectURL: () => { const u = `blob:${urls.made.length}`; urls.made.push(u); return u; }, revokeObjectURL: (u) => urls.revoked.push(u) });

function fakeVideo() {
  const listeners = new Map();
  return { paused: true, currentTime: 0, loads: 0, src: '', srcObject: undefined, removed: [],
    addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); },
    pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); },
    removeAttribute(attr) { this.removed.push(attr); this.src = ''; }, load() { this.loads += 1; }, listeners };
}
const reset = () => { sockets.length = 0; urls.made.length = 0; urls.revoked.length = 0; };

test('suporte a MSE é lido na hora da chamada', () => {
  assert.equal(mseSupported(), true);
  const saved = globalThis.window; globalThis.window = {};
  assert.equal(mseSupported(), false);
  globalThis.window = saved;
});

test('fechar: fecha o socket UMA vez, solta o vídeo, remove handlers e revoga o objectURL', () => {
  reset();
  const video = fakeVideo();
  const stop = attachMse(video, '/api/cameras/cam1/ws', () => {}, () => {});
  assert.equal(sockets.length, 1);
  assert.equal(urls.made.length, 1);
  stop();
  assert.equal(sockets[0].closed, 1);
  assert.equal(sockets[0].onmessage, null);
  assert.equal(sockets[0].onclose, null);
  assert.equal(video.listeners.size, 0, 'listener playing removido');
  assert.equal(video.loads, 1);
  assert.deepEqual(video.removed, ['src']);
  assert.deepEqual(urls.revoked, urls.made, 'objectURL revogado');
});

test('fechar duas vezes não repete efeito (idempotente)', () => {
  reset();
  const video = fakeVideo();
  const stop = attachMse(video, '/api/cameras/cam1/ws', () => {}, () => {});
  stop(); stop();
  assert.equal(sockets[0].closed, 1);
  assert.equal(urls.revoked.length, 1);
  assert.equal(video.loads, 1);
});

test('depois de fechar, mensagens e onclose atrasados são ignorados (sem onFail/onEnd)', () => {
  reset();
  const calls = [];
  const stop = attachMse(fakeVideo(), '/api/cameras/cam1/ws', () => calls.push('playing'), () => calls.push('fail'), { onEnd: () => calls.push('end') });
  const ws = sockets[0];
  const lateMessage = ws.onmessage; const lateClose = ws.onclose;
  stop();
  lateMessage?.({ data: new ArrayBuffer(8) });
  lateClose?.();
  assert.deepEqual(calls, []);
});

test('reabrir depois de fechar cria UM novo socket; o antigo continua fechado', () => {
  reset();
  const video = fakeVideo();
  attachMse(video, '/api/cameras/cam1/ws', () => {}, () => {})();
  attachMse(video, '/api/cameras/cam2/ws', () => {}, () => {});
  assert.equal(sockets.length, 2);
  assert.equal(sockets[0].closed, 1);
  assert.equal(sockets[1].closed, 0);
  assert.match(sockets[1].url, /cam2/);
});

test('falha: erro do servidor seguido do fechamento chama onFail UMA vez (um único fallback para MJPEG)', () => {
  reset();
  const fails = [];
  attachMse(fakeVideo(), '/api/cameras/cam1/ws', () => {}, () => fails.push(1));
  const ws = sockets[0];
  ws.onmessage({ data: JSON.stringify({ type: 'error', value: 'x' }) });
  ws.onclose();
  assert.equal(fails.length, 1);
});

test('fechar antes de abrir não envia o pedido de codecs depois', () => {
  reset();
  const stop = attachMse(fakeVideo(), '/api/cameras/cam1/ws', () => {}, () => {});
  const ws = sockets[0];
  const open = ws.onopen;
  stop();
  open?.();
  assert.deepEqual(ws.sent, []);
});

test('o pedido de codecs sai só quando o socket abriu E o MediaSource está pronto', () => {
  reset();
  attachMse(fakeVideo(), '/api/cameras/cam1/ws', () => {}, () => {});
  const ws = sockets[0];
  ws.onopen();
  assert.equal(ws.sent.length, 0, 'ainda falta o MediaSource abrir');
  ws.onopen();
  assert.equal(ws.sent.length, 1);
  assert.equal(JSON.parse(ws.sent[0]).type, 'mse');
});

test('fechar o socket depois de tocar chama onEnd; antes de tocar é falha', () => {
  reset();
  const events = [];
  const video = fakeVideo();
  attachMse(video, '/api/replays/abc/ws', () => events.push('playing'), () => events.push('fail'), { replay: true, onEnd: () => events.push('end') });
  video.listeners.get('playing')();
  sockets[0].onclose();
  assert.deepEqual(events, ['playing', 'end']);
});
