import assert from 'node:assert/strict';
import test from 'node:test';
import { ownTracksURL, qrMatrix } from './qr.js';

// Cenários do qr.test.mjs legado (mesmos estímulos e asserts).
test('a URL carrega a configuração inteira em base64 e a decodifica de volta, com acentos e ideogramas', () => {
  const configuration = { _type: 'configuration', mode: 3, tid: 'JO', name: 'João 日本', url: 'https://example.ts.net/owntracks' };
  const url = ownTracksURL(configuration);
  assert.ok(url.startsWith('owntracks:///config?inline='));
  assert.deepEqual(JSON.parse(Buffer.from(decodeURIComponent(url.split('inline=')[1]), 'base64').toString('utf8')), configuration);
});

test('QR: tamanhos por versão e matriz só de booleanos; acima do limite recusa em português', () => {
  const url = ownTracksURL({ _type: 'configuration', mode: 3, tid: 'JO', name: 'João 日本', url: 'https://example.ts.net/owntracks' });
  const samples = [url, 'x'.repeat(300), 'x'.repeat(800), 'x'.repeat(1500), 'x'.repeat(2331)];
  const sizes = [57, 97, 137, 177, 177];
  for (const [index, sample] of samples.entries()) {
    const matrix = qrMatrix(sample);
    assert.equal(matrix.length, sizes[index]);
    assert.ok(matrix.every((row) => row.length === matrix.length && row.every((cell) => typeof cell === 'boolean')));
  }
  assert.throws(() => qrMatrix('x'.repeat(2332)), /grande demais/);
});
