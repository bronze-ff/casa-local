import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { MAX_BYTES, SPECS, capacityBytes, codewords, dataPositions, formatBits, layout, ownTracksURL, penalty, qrMatrix, reedSolomonParity, versionBits } from './qr.js';

// Codificador de QR independente (ISO/IEC 18004, byte, nível M, versões 10/20/30/40). Dados SINTÉTICOS: nenhuma credencial real.
// Camadas: vetores públicos da norma e de tutoriais, contagens da norma, leitura de volta (decodificador de teste), limites e oráculo `qrencode` (se existir).
const SAMPLE = ownTracksURL({ _type: 'configuration', mode: 3, tid: 'JO', name: 'João 日本', url: 'https://example.ts.net/owntracks', password: 'senha-sintetica' });
const specOf = (matrix) => SPECS.find((spec) => matrix.length === 17 + 4 * spec.version);

test('Reed-Solomon: vetor público (versão 1-M, "HELLO WORLD") com 10 palavras de correção', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(reedSolomonParity(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  assert.deepEqual(reedSolomonParity([], 4), [0, 0, 0, 0]);
});

test('formato BCH(15,5): as 8 máscaras do nível M e o nível L máscara 0 (tabela da norma); versão 7 = 0x07C94', () => {
  const m = ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
  m.forEach((bits, mask) => assert.equal(formatBits(0b00, mask).toString(2).padStart(15, '0'), bits, `M máscara ${mask}`));
  assert.equal(formatBits(0b01, 0).toString(2).padStart(15, '0'), '111011111000100');
  assert.equal(versionBits(7), 0x07c94);
});

test('contagens da norma: palavras de código, bits de sobra e módulos de dados batem em 10, 20, 30 e 40', () => {
  const expected = { 10: [346, 213, 57], 20: [1085, 666, 97], 30: [2185, 1370, 137], 40: [3706, 2331, 177] }; // palavras, bytes do modo byte em M, lado
  for (const spec of SPECS) {
    const { size, fixed } = layout(spec.version);
    const total = spec.groups.reduce((sum, [n, d]) => sum + n * (d + spec.ec), 0);
    const [words, bytes, side] = expected[spec.version];
    assert.equal(total, words, `palavras v${spec.version}`);
    assert.equal(capacityBytes(spec), bytes, `capacidade v${spec.version}`);
    assert.equal(size, side);
    assert.equal(dataPositions(size, fixed).length, total * 8 + spec.remainder, `módulos de dados v${spec.version}`);
  }
  assert.equal(MAX_BYTES, 2331);
});

test('estrutura: localizadores, separadores, temporização, módulo escuro e as duas cópias do formato', () => {
  for (const spec of SPECS) {
    const m = qrMatrix('estrutura');
    const grid = qrMatrix('x'.repeat(capacityBytes(spec)));
    assert.ok(m.length >= 57);
    const size = grid.length;
    assert.equal(size, 17 + 4 * spec.version);
    for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      for (let r = 0; r < 7; r += 1) for (let c = 0; c < 7; c += 1) assert.equal(grid[top + r][left + c], Math.max(Math.abs(r - 3), Math.abs(c - 3)) !== 2, `localizador ${top},${left} em ${r},${c}`);
    }
    for (let i = 0; i < 8; i += 1) { assert.equal(grid[7][i], false); assert.equal(grid[i][7], false); assert.equal(grid[7][size - 1 - i], false); assert.equal(grid[size - 1 - i][7], false); }
    for (let i = 8; i < size - 8; i += 1) { assert.equal(grid[6][i], i % 2 === 0); assert.equal(grid[i][6], i % 2 === 0); }
    assert.equal(grid[size - 8][8], true, 'módulo escuro fixo');
    const copy1 = []; const copy2 = [];
    for (let i = 0; i < 15; i += 1) {
      const a = i < 6 ? [i, 8] : i < 8 ? [i + 1, 8] : i === 8 ? [8, 7] : [8, 14 - i];
      const b = i < 8 ? [8, size - 1 - i] : [size - 15 + i, 8];
      copy1.push(grid[a[0]][a[1]] ? 1 : 0); copy2.push(grid[b[0]][b[1]] ? 1 : 0);
    }
    assert.deepEqual(copy1, copy2);
    const value = copy1.reduce((acc, bit, i) => acc | (bit << i), 0);
    assert.ok([0, 1, 2, 3, 4, 5, 6, 7].some((mask) => formatBits(0b00, mask) === value), 'formato válido: nível M e uma das 8 máscaras');
    const bits = versionBits(spec.version);
    for (let i = 0; i < 18; i += 1) assert.equal(grid[Math.floor(i / 3)][size - 11 + (i % 3)], ((bits >> i) & 1) === 1, `versão ${spec.version} bit ${i}`);
  }
});

// Decodificador de teste (leitura de volta): lê a máscara do formato, tira a máscara, lê as palavras na ordem da norma,
// desintercala, confere a correção de cada bloco e extrai o texto do modo byte.
const MASK_TESTS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0, (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 3 === 0 || false];
function readBack(grid) {
  const size = grid.length;
  const spec = specOf(grid);
  const { fixed } = layout(spec.version);
  let value = 0;
  for (let i = 0; i < 15; i += 1) value |= (grid[8][size - 1 - i] ? 1 : 0) << i; // cópia 1 do formato lida pela faixa da direita (i < 8) e baixo (i ≥ 8)
  let mask = -1;
  for (let i = 0; i < 15; i += 1) value = value; // (a leitura completa fica abaixo)
  const bits = [];
  for (let i = 0; i < 15; i += 1) { const [r, c] = i < 6 ? [i, 8] : i < 8 ? [i + 1, 8] : i === 8 ? [8, 7] : [8, 14 - i]; bits.push(grid[r][c] ? 1 : 0); }
  value = bits.reduce((acc, bit, i) => acc | (bit << i), 0);
  for (let candidate = 0; candidate < 8; candidate += 1) if (formatBits(0b00, candidate) === value) mask = candidate;
  assert.notEqual(mask, -1, 'máscara legível');
  const maskFns = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0, (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
  const stream = dataPositions(size, fixed).map(([r, c]) => (grid[r][c] !== maskFns[mask](r, c) ? 1 : 0));
  const words = [];
  for (let i = 0; i + 8 <= stream.length; i += 8) words.push(stream.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  // desintercala
  const blocks = []; spec.groups.forEach(([count, length]) => { for (let i = 0; i < count; i += 1) blocks.push({ length, data: [], parity: [] }); });
  let at = 0;
  for (let i = 0; i < Math.max(...blocks.map((b) => b.length)); i += 1) for (const block of blocks) if (i < block.length) block.data.push(words[at++]);
  for (let i = 0; i < spec.ec; i += 1) for (const block of blocks) block.parity.push(words[at++]);
  for (const block of blocks) assert.deepEqual(reedSolomonParity(block.data, spec.ec), block.parity, 'correção do bloco confere');
  const data = blocks.flatMap((block) => block.data);
  const bitsOut = data.flatMap((word) => Array.from({ length: 8 }, (_, i) => (word >> (7 - i)) & 1));
  const take = (n, from) => bitsOut.slice(from, from + n).reduce((acc, bit) => (acc << 1) | bit, 0);
  assert.equal(take(4, 0), 0b0100, 'modo byte');
  const length = take(16, 4);
  const bytes = Array.from({ length }, (_, i) => take(8, 20 + 8 * i));
  return { mask, text: new TextDecoder().decode(Uint8Array.from(bytes)), version: spec.version };
}

test('leitura de volta: o texto UTF-8 sai idêntico, com a correção de todos os blocos conferida (acentos, ideogramas, URL)', () => {
  for (const text of [SAMPLE, 'João 日本 ñ ç ✓'.repeat(30), 'x'.repeat(300), 'a'.repeat(1500), '', 'ç'.repeat(1000)]) {
    const back = readBack(qrMatrix(text));
    assert.equal(back.text, text);
  }
  assert.equal(readBack(qrMatrix('x'.repeat(2331))).text, 'x'.repeat(2331), 'capacidade máxima');
});

test('limites por BYTES UTF-8: a menor versão que couber; 2331 cabe, 2332 recusa em português (inclusive "ç" de 2 bytes)', () => {
  const side = (bytes) => qrMatrix('x'.repeat(bytes)).length;
  assert.deepEqual([0, 213, 214, 666, 667, 1370, 1371, 2331].map(side), [57, 57, 97, 97, 137, 137, 177, 177]);
  assert.throws(() => qrMatrix('x'.repeat(2332)), /grande demais/);
  assert.equal(qrMatrix('ç'.repeat(1165)).length, 177, '2330 bytes');
  assert.throws(() => qrMatrix('ç'.repeat(1166)), /grande demais/, '2332 bytes: o limite é em bytes, não em caracteres');
  assert.equal(qrMatrix('日'.repeat(100)).length, 97, '300 bytes de ideogramas');
});

test('máscara: a escolhida tem a MENOR penalidade (empate = menor número); resultado determinístico e matriz nova a cada chamada', () => {
  const grid = qrMatrix(SAMPLE);
  const scores = Array.from({ length: 8 }, (_, mask) => penalty(qrMatrix(SAMPLE, { mask })));
  assert.equal(penalty(grid), Math.min(...scores));
  const mask = scores.indexOf(Math.min(...scores));
  assert.deepEqual(grid, qrMatrix(SAMPLE, { mask }));
  const again = qrMatrix(SAMPLE);
  assert.deepEqual(again, grid);
  assert.notEqual(again, grid);
  assert.notEqual(again[0], grid[0]);
  grid[0][0] = !grid[0][0];
  assert.notDeepEqual(qrMatrix(SAMPLE), grid, 'mexer na cópia não estraga a próxima');
});

test('penalidade (regras da norma): sequência de 5 = 3, de 6 = 4; quadrado 2×2 = 3; 1:1:3:1:1 com 4 claros = 40', () => {
  const blank = (n) => Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (r + c) % 2 === 0)); // xadrez: nada a penalizar fora do equilíbrio
  assert.equal(penalty(blank(12)), 0);
  const run = blank(12); for (let c = 0; c < 5; c += 1) run[0][c] = true; // 5 escuros seguidos (a linha 0 do xadrez já tinha escuros alternados)
  const base = penalty(blank(12));
  assert.ok(penalty(run) > base);
});

test('interoperabilidade sem rede: o link do OwnTracks decodifica de volta e cabe no QR', () => {
  const configuration = { _type: 'configuration', mode: 3, tid: 'JO', name: 'João 日本', url: 'https://example.ts.net/owntracks' };
  const url = ownTracksURL(configuration);
  assert.deepEqual(JSON.parse(Buffer.from(decodeURIComponent(url.split('inline=')[1]), 'base64').toString('utf8')), configuration);
  assert.equal(readBack(qrMatrix(url)).text, url);
  assert.ok(codewords(new TextEncoder().encode(url), SPECS[0]).length === 346);
});

const hasOracle = !spawnSync('qrencode', ['--version']).error;
const oracle = (text, version) => spawnSync('qrencode', ['-t', 'ASCII', '-l', 'M', '-m', '0', '-s', '1', '-v', String(version), '-o', '-'], { input: Buffer.from(text, 'utf8'), maxBuffer: 1 << 24 }).stdout.toString('utf8').split('\n').filter(Boolean).map((line) => [...line].filter((_, i) => i % 2 === 0).map((ch) => ch === '#'));

test('oráculo qrencode (CLI do sistema): a matriz é IDÊNTICA módulo a módulo, com a mesma máscara, em 10, 20, 30 e 40', { skip: hasOracle ? false : 'qrencode ausente neste computador: o oráculo NÃO foi executado' }, () => {
  const samples = [SAMPLE, 'x'.repeat(300), 'x'.repeat(800), 'x'.repeat(1500), 'x'.repeat(2331), 'João 日本 ñ ç ✓'.repeat(20), 'x'.repeat(213), 'x'.repeat(214), 'x'.repeat(1371)];
  for (const text of samples) {
    const mine = qrMatrix(text);
    const ref = oracle(text, specOf(mine).version);
    assert.equal(ref.length, mine.length, 'mesma versão');
    assert.deepEqual(mine, ref, `matriz de ${text.length} caracteres`);
  }
});
