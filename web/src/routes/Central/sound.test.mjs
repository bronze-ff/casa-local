import assert from 'node:assert/strict';
import test from 'node:test';
import { applySound, soundOn } from './sound.js';

// Som das teclas (opcional): o ouvinte de clique do documento. Teclado: Enter e Espaço em <button> disparam o evento NATIVO "click",
// então o mesmo ouvinte atende mouse, toque e teclado. Aqui o evento nativo é simulado; o disparo real pelo teclado é pendente de navegador.
let ticks = 0; // o sound.js guarda o AudioContext no primeiro uso: o contador precisa valer para o arquivo todo
class FakeAudio { constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; } createOscillator() { ticks += 1; return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, start() {}, stop() {} }; } createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }; } }

function setup({ audio = true } = {}) {
  ticks = 0;
  const handlers = {};
  const doc = { addEventListener: (type, fn, capture) => { handlers[type] = { fn, capture }; }, removeEventListener: (type) => { delete handlers[type]; } };
  globalThis.window = audio ? { AudioContext: FakeAudio } : {};
  const el = (over = {}) => ({ disabled: false, closest(selector) { return selector.includes('button') && this.interactive !== false ? this : null; }, interactive: true, ...over });
  const click = (target, extra = {}) => { const calls = []; handlers.click.fn({ target, detail: 0, preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation'), ...extra }); return calls; };
  return { doc, handlers, el, click, ticks: () => ticks, done: () => { applySound(false, doc); delete globalThis.window; } };
}

test('sem áudio disponível o clique segue mudo e não lança', () => {
  const t = setup({ audio: false });
  applySound(true, t.doc);
  assert.doesNotThrow(() => t.click(t.el()));
  assert.equal(t.ticks(), 0);
  t.done();
});

test('desligado por padrão: sem ouvinte, nenhum som; ligar instala UM ouvinte de clique em captura e desligar remove', () => {
  const t = setup();
  assert.equal(soundOn(), false);
  assert.deepEqual(t.handlers, {});
  assert.equal(applySound(true, t.doc), true);
  assert.equal(t.handlers.click.capture, true);
  assert.equal(applySound(true, t.doc), true);
  assert.equal(Object.keys(t.handlers).length, 1);
  assert.equal(applySound(false, t.doc), false);
  assert.deepEqual(t.handlers, {});
  delete globalThis.window;
});

test('clique nativo em botão habilitado faz o tique (Enter/Espaço no teclado chegam como "click" com detail 0, igual ao mouse)', () => {
  const t = setup();
  applySound(true, t.doc);
  t.click(t.el(), { detail: 1 }); // mouse/toque
  assert.equal(t.ticks(), 1);
  t.click(t.el(), { detail: 0 }); // teclado: o navegador dispara click com detail 0
  assert.equal(t.ticks(), 2);
  t.done();
});

test('botão desabilitado e alvo que não é controle NÃO fazem som; o ouvinte nunca bloqueia o clique', () => {
  const t = setup();
  applySound(true, t.doc);
  t.click(t.el({ disabled: true }));
  t.click(t.el({ interactive: false }));
  t.click({ closest: undefined });
  t.click(null);
  assert.equal(t.ticks(), 0);
  const calls = t.click(t.el());
  assert.deepEqual(calls, [], 'sem preventDefault nem stopPropagation: a ação do botão segue normalmente');
  assert.equal(t.ticks(), 1);
  t.done();
});
