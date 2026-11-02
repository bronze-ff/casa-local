import assert from 'node:assert/strict';
import test from 'node:test';
import { FOCUSABLE, pickInitialFocus } from './focus.js';

const el = (tagName, extra = {}) => ({ tagName, dataset: {}, ...extra });

test('foco inicial: primeiro campo, senão primeiro botão que não seja Fechar', () => {
  const close = el('BUTTON', { dataset: { close: 'true' } });
  const save = el('BUTTON');
  const field = el('INPUT');
  assert.equal(pickInitialFocus([close, field, save]), field);
  assert.equal(pickInitialFocus([close, save]), save);
  assert.equal(pickInitialFocus([close]), close);
  assert.equal(pickInitialFocus([]), null);
});

test('seletor de focáveis ignora desabilitados e tabindex -1', () => {
  assert.match(FOCUSABLE, /button:not\(\[disabled\]\)/);
  assert.match(FOCUSABLE, /\[tabindex\]:not\(\[tabindex="-1"\]\)/);
});
