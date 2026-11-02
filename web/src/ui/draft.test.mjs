import assert from 'node:assert/strict';
import test from 'node:test';
import { afterReport, clamp, isDirty, stepDraft } from './draft.js';

test('passo respeita os limites e arredonda', () => {
  assert.equal(stepDraft(60, 5), 65);
  assert.equal(stepDraft(98, 5), 100);
  assert.equal(stepDraft(3, -5), 1);
  assert.equal(stepDraft(null, 5), 6);
  assert.equal(clamp(150, 1, 100), 100);
});

test('rascunho só é "não enviado" quando difere do que a luz relatou', () => {
  assert.equal(isDirty(40, 60), true);
  assert.equal(isDirty(60, 60), false);
  assert.equal(isDirty(null, 60), true);
  assert.equal(isDirty(60, null), false);
});

test('sem toque o rascunho segue o relato; com toque, só termina quando a luz relata o mesmo valor', () => {
  assert.deepEqual(afterReport({ draft: 40, touched: false }, 55), { draft: 55, touched: false });
  assert.deepEqual(afterReport({ draft: 70, touched: true }, 55), { draft: 70, touched: true });
  assert.deepEqual(afterReport({ draft: 70, touched: true }, 70), { draft: 70, touched: false });
  assert.deepEqual(afterReport({ draft: 40, touched: false }, null), { draft: 40, touched: false });
});
