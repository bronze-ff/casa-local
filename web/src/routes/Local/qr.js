// Gerador de QR (bytes, correção M) para a configuração do OwnTracks. É ALGORITMO puro, não componente: reaproveitado do legado
// por já ter sido lido por celular real; o contrato está fixado em qr.test.mjs (tamanhos por versão e limite).
// QR em bytes, correção M: apenas as versões necessárias para a configuração OwnTracks.
const VERSIONS = [
  [10, [6, 28, 50], [[4, 69, 43], [1, 70, 44]]],
  [20, [6, 34, 62, 90], [[3, 67, 41], [13, 68, 42]]],
  [30, [6, 26, 52, 78, 104, 130], [[19, 75, 47], [10, 76, 48]]],
  [40, [6, 30, 58, 86, 114, 142, 170], [[18, 75, 47], [31, 76, 48]]],
];

export function ownTracksURL(config) {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  return `owntracks:///config?inline=${encodeURIComponent(btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')))}`;
}

const multiply = (a, b) => {
  let result = 0;
  while (b) { if (b & 1) result ^= a; b >>>= 1; a <<= 1; if (a & 256) a ^= 0x11d; }
  return result;
};

function parity(data, count) {
  let generator = [1], root = 1;
  for (let i = 0; i < count; i++) {
    const next = Array(generator.length + 1).fill(0);
    generator.forEach((value, j) => { next[j] ^= value; next[j + 1] ^= multiply(value, root); });
    generator = next; root = multiply(root, 2);
  }
  const result = [...data, ...Array(count).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = result[i];
    generator.forEach((value, j) => { result[i + j] ^= multiply(value, factor); });
  }
  return result.slice(data.length);
}

function bch(value, polynomial) {
  const degree = n => 31 - Math.clz32(n);
  let remainder = value;
  while (degree(remainder) >= degree(polynomial)) remainder ^= polynomial << (degree(remainder) - degree(polynomial));
  return remainder;
}

export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSIONS.find(([, , groups]) => bytes.length * 8 + 20 <= groups.reduce((sum, [count, , data]) => sum + count * data * 8, 0));
  if (!spec) throw new Error('Configuração grande demais para o QR. Use Copiar configuração ou Abrir no OwnTracks.');
  const [version, align, groups] = spec;
  const capacity = groups.reduce((sum, [count, , data]) => sum + count * data, 0);
  const bits = [];
  const put = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(4, 4); put(bytes.length, 16); bytes.forEach(byte => put(byte, 8));
  put(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((value, bit) => value * 2 + bit, 0));
  for (let pad = 0; data.length < capacity; pad++) data.push(pad % 2 ? 0x11 : 0xec);
  let offset = 0;
  const blocks = groups.flatMap(([count, total, length]) => Array.from({ length: count }, () => {
    const block = data.slice(offset, offset += length);
    return { data: block, ecc: parity(block, total - length) };
  }));
  const codewords = [];
  for (const key of ['data', 'ecc']) {
    const length = Math.max(...blocks.map(block => block[key].length));
    for (let i = 0; i < length; i++) blocks.forEach(block => { if (i < block[key].length) codewords.push(block[key][i]); });
  }
  const size = version * 4 + 17;
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));
  const finder = (row, col) => {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      if (row + y < 0 || row + y >= size || col + x < 0 || col + x >= size) continue;
      matrix[row + y][col + x] = (y >= 0 && y <= 6 && (x === 0 || x === 6)) || (x >= 0 && x <= 6 && (y === 0 || y === 6)) || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
    }
  };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
  for (const row of align) for (const col of align) {
    if (matrix[row][col] !== null) continue;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) matrix[row + y][col + x] = Math.abs(y) === 2 || Math.abs(x) === 2 || (y === 0 && x === 0);
  }
  for (let i = 8; i < size - 8; i++) {
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
  }
  const versionBits = (version << 12) | bch(version << 12, 0x1f25);
  for (let i = 0; i < 18; i++) {
    matrix[Math.floor(i / 3)][i % 3 + size - 11] = !!((versionBits >>> i) & 1);
    matrix[i % 3 + size - 11][Math.floor(i / 3)] = !!((versionBits >>> i) & 1);
  }
  // M = 00; máscara 0, válida sem heurística de escolha de máscara.
  const format = 0x5412;
  for (let i = 0; i < 15; i++) {
    const bit = !!((format >>> i) & 1);
    matrix[i < 6 ? i : i < 8 ? i + 1 : size - 15 + i][8] = bit;
    matrix[8][i < 8 ? size - i - 1 : i < 9 ? 15 - i : 14 - i] = bit;
  }
  matrix[size - 8][8] = true;
  let row = size - 1, direction = -1, bitIndex = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let x = 0; x < 2; x++) {
        if (matrix[row][col - x] !== null) continue;
        const dark = bitIndex < codewords.length * 8 && !!((codewords[bitIndex >>> 3] >>> (7 - bitIndex % 8)) & 1);
        matrix[row][col - x] = dark !== ((row + col - x) % 2 === 0);
        bitIndex++;
      }
      row += direction;
      if (row < 0 || row >= size) { row -= direction; direction = -direction; break; }
    }
  }
  return matrix;
}
