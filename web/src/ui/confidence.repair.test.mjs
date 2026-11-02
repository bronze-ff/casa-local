import assert from 'node:assert/strict';
import test from 'node:test';
import { phaseOfReceipt } from '../core/store.js';
import { PHASE, phaseView } from './confidence.js';

// Reparo do Crivo: "enviado" nunca afirma que o APARELHO aceitou ou confirmou. Distingue o servidor do efeito.
test('IR com ACK vazio (unconfirmed, delivery unknown, requested/reported vazios) vira "enviado, sem confirmação"; nunca "aceitou"', () => {
  const irAck = { outcome: 'unconfirmed', delivery: 'unknown', requested: {}, reported: {}, confirmedFields: [], divergedFields: [] };
  const phase = phaseOfReceipt(irAck);
  assert.equal(phase, 'sent', 'o núcleo não confirma pedido vazio');
  const view = phaseView({ phase });
  assert.match(view.label, /sem confirmação/i);
  assert.match(view.hint, /não (há|houve) confirmação|não confirmou|sem confirmação/i);
  assert.doesNotMatch(`${view.label} ${view.hint}`, /aceitou|relatou|confirmado|funcionou/i, 'não pode afirmar o que o aparelho fez');
  assert.match(view.hint, /pedido|comando/i, 'fala do que saiu daqui, não do que o aparelho fez');
});

test('nenhuma fase além de "confirmed" e "diverged" afirma o que o aparelho relatou ou aceitou', () => {
  for (const [name, [, label, hint]] of Object.entries(PHASE)) {
    if (name === 'confirmed' || name === 'diverged') continue;
    assert.doesNotMatch(`${label} ${hint}`, /aceitou|relatou exatamente|confirmou/i, name);
  }
  assert.match(PHASE.confirmed[2], /relatou exatamente/);
});
