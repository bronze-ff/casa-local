import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIDENCE, PHASE, confidenceOf, phaseView } from './confidence.js';

// Cenários do ui.test.mjs legado ("confiança por fase do comando"), mesmos estímulos e asserts.
const lamp = { id: 'quarto-luz', confidence: 'reported', updatedAt: '2026-10-25T10:00:00Z' };

test('selo do backend sem comando', () => {
  assert.equal(confidenceOf(lamp, null), 'reported');
  assert.equal(confidenceOf({ ...lamp, confidence: 'estimated' }, null), 'estimated');
  assert.equal(confidenceOf({ ...lamp, confidence: null }, null), 'unknown');
  assert.equal(confidenceOf(null, { phase: 'pending' }), 'unknown');
});

test('a fase do comando refina o selo; inconclusivo nunca vira confirmado', () => {
  assert.equal(confidenceOf(lamp, { phase: 'pending' }), 'pending');
  assert.equal(confidenceOf(lamp, { phase: 'sent' }), 'sent');
  assert.equal(confidenceOf(lamp, { phase: 'unknown' }), 'sent');
  assert.equal(confidenceOf(lamp, { phase: 'diverged' }), 'diverged');
  assert.equal(confidenceOf(lamp, { phase: 'confirmed' }), 'reported'); // o selo continua vindo do backend
  assert.equal(confidenceOf({ ...lamp, updatedAt: '2026-10-25T10:00:05Z' }, { phase: 'sent' }), 'sent'); // updatedAt maior não confirma
});

test('rótulos em português para cada selo e fase', () => {
  assert.deepEqual(CONFIDENCE.reported, ['rep', 'Confirmado']);
  assert.deepEqual(CONFIDENCE.sent, ['env', 'Enviado · sem retorno']);
  assert.deepEqual(CONFIDENCE.pending, ['env', 'Enviando…']);
  assert.deepEqual(CONFIDENCE.diverged, ['div', 'Divergente']);
  assert.deepEqual(CONFIDENCE.estimated, ['est', 'Estimado']);
  assert.deepEqual(CONFIDENCE.preview, ['sim', 'Simulado']);
  assert.deepEqual(CONFIDENCE.unknown, ['unk', 'Desconhecido']);
  for (const phase of ['pending', 'sent', 'unknown', 'diverged', 'confirmed', 'error', 'simulated']) assert.ok(PHASE[phase], phase);
});

test('phaseView: fase desconhecida não inventa texto; erro diz que nada mudou', () => {
  assert.equal(phaseView(null), null);
  assert.equal(phaseView({ phase: 'qualquer' }), null);
  assert.match(phaseView({ phase: 'error' }).hint, /Nada mudou/);
  assert.match(phaseView({ phase: 'unknown' }).hint, /desconhecido/);
});
