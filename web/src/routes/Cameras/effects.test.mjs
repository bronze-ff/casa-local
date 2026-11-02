import assert from 'node:assert/strict';
import test from 'node:test';
import { createMediaGate } from './gate.js';

// Efeitos de visibilidade/rota da mídia (cenários do effects.test.mjs legado), na porta pura com fakes.
function harness() {
  let visible = true;
  const subs = new Set();
  const log = { opened: [], closed: [] };
  const gate = createMediaGate({
    isVisible: () => visible,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    start: (key) => { log.opened.push(key); return () => log.closed.push(key); },
  });
  const setVisible = (value) => { visible = value; subs.forEach((fn) => fn()); };
  return { gate, log, setVisible, subs };
}

test('abrir câmera: um stream aberto, nada fechado', () => {
  const { gate, log } = harness();
  gate.set('cam1');
  assert.deepEqual(log, { opened: ['cam1'], closed: [] });
});

test('ocultar a aba fecha o stream sem abrir outro; o diálogo segue montado', () => {
  const { gate, log, setVisible } = harness();
  gate.set('cam1');
  setVisible(false);
  assert.deepEqual(log, { opened: ['cam1'], closed: ['cam1'] });
  assert.equal(gate.isOpen(), false);
});

test('voltar a ficar visível abre no máximo UM stream; ocultar/mostrar várias vezes nunca acumula', () => {
  const { gate, log, setVisible } = harness();
  gate.set('cam1');
  for (let i = 0; i < 3; i += 1) { setVisible(false); setVisible(true); setVisible(true); }
  assert.equal(log.opened.length - log.closed.length, 1, 'sempre um aberto no fim');
  assert.equal(log.opened.length, 4);
});

test('trocar de câmera visível fecha a anterior e abre uma; trocar OCULTO não abre nada até voltar', () => {
  const { gate, log, setVisible } = harness();
  gate.set('cam1'); gate.set('cam2');
  assert.deepEqual(log, { opened: ['cam1', 'cam2'], closed: ['cam1'] });
  setVisible(false);
  gate.set('cam3');
  assert.deepEqual(log.opened, ['cam1', 'cam2'], 'oculto: cam3 não abre');
  setVisible(true);
  assert.deepEqual(log.opened, ['cam1', 'cam2', 'cam3']);
  assert.deepEqual(log.closed, ['cam1', 'cam2']);
});

test('sair da rota (parar) fecha o stream uma vez e solta a assinatura; depois disso nada reabre', () => {
  const { gate, log, setVisible, subs } = harness();
  gate.set('cam1');
  gate.stop(); gate.stop();
  assert.deepEqual(log.closed, ['cam1']);
  assert.equal(subs.size, 0);
  setVisible(false); setVisible(true); gate.set('cam2');
  assert.deepEqual(log.opened, ['cam1'], 'parado não abre mais');
});

test('mesma chave não reabre; começar oculto só abre ao ficar visível', () => {
  const { gate, log, setVisible } = harness();
  setVisible(false);
  gate.set('cam1'); gate.set('cam1');
  assert.deepEqual(log.opened, []);
  setVisible(true);
  assert.deepEqual(log.opened, ['cam1']);
});
