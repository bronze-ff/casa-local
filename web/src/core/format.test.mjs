import assert from 'node:assert/strict';
import test from 'node:test';
import { fmtAgo, fmtNum, fmtTime } from './format.js';

test('ausente vira traço, nunca zero', () => {
  assert.equal(fmtTime(null), '—');
  assert.equal(fmtAgo(undefined), '—');
  assert.equal(fmtNum(NaN), '—');
  assert.equal(fmtNum(0), '0');
});

test('idade relativa em português', () => {
  const now = 1_800_000_000_000;
  assert.equal(fmtAgo(now - 12_000, now), 'há 12 s');
  assert.equal(fmtAgo(now - 4 * 60_000, now), 'há 4 min');
  assert.equal(fmtAgo(now - 3 * 3_600_000, now), 'há 3 h');
  assert.equal(fmtAgo((now - 9 * 86_400_000) / 1000, now), 'há 9 d'); // segundos também valem
});
