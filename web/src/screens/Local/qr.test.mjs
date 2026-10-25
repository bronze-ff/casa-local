import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ownTracksURL, qrMatrix } from './qr.js';

const configuration = { _type: 'configuration', mode: 3, tid: 'JO', name: 'João 日本', url: 'https://example.ts.net/owntracks' };
const url = ownTracksURL(configuration);
assert.deepEqual(JSON.parse(Buffer.from(decodeURIComponent(url.split('inline=')[1]), 'base64').toString('utf8')), configuration);
const samples = [url, 'x'.repeat(300), 'x'.repeat(800), 'x'.repeat(1500), 'x'.repeat(2331)];
const sizes = [57, 97, 137, 177, 177];
for (const [index, sample] of samples.entries()) {
  const matrix = qrMatrix(sample);
  assert.equal(matrix.length, sizes[index]);
  assert(matrix.every(row => row.length === matrix.length && row.every(cell => typeof cell === 'boolean')));
}
assert.throws(() => qrMatrix('x'.repeat(2332)), /grande demais/);

// O bundle é lido apenas como referência de algoritmo; nenhum componente ou pedido de rede é executado.
if (process.argv[2]) {
  const source = readFileSync(process.argv[2], 'utf8');
  const marker = 'k=e(n(((e,t)=>{';
  const start = source.indexOf(marker) + marker.length;
  const end = source.indexOf('}))(),1),A=r()', start);
  assert(start >= marker.length && end > start, 'Encoder antigo não localizado');
  const body = source.slice(start, end).replace('ee(!1,ne())', 'ee(!1,0)');
  const module = { exports: {} };
  new Function('e', 't', body)(module.exports, module);
  for (const sample of samples) {
    const matrix = qrMatrix(sample);
    const reference = module.exports((matrix.length - 17) / 4, 'M');
    reference.addData(sample); reference.make();
    assert.equal(reference.getModuleCount(), matrix.length);
    matrix.forEach((row, y) => row.forEach((cell, x) => assert.equal(cell, reference.isDark(y, x), `QR difere em ${x},${y}`)));
  }
  console.log('QR: cinco matrizes idênticas ao encoder antigo, nível M / máscara 0.');
}
console.log('QR: UTF-8, versões 10/20/30/40, limite e células verificados.');
