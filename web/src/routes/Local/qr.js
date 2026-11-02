// Codificador de QR escrito do zero a partir da norma ISO/IEC 18004: modo BYTE, correção de erro M, versões 10, 20, 30 e 40
// (57, 97, 137 e 177 módulos). Serve à configuração do OwnTracks. Sem dependências e sem criptografia: é só codificação.
// Contrato (qr.test.mjs): a menor das quatro versões que couber; acima de 2331 bytes UTF-8 recusa em português.

/** Link que o OwnTracks abre para importar a configuração inteira (JSON em UTF-8, base64, escapado para URL). */
export function ownTracksURL(config) {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `owntracks:///config?inline=${encodeURIComponent(btoa(binary))}`;
}

// ---- Tabelas da norma (nível M) ---------------------------------------------------------------------------------------
// `groups`: [quantidade de blocos, palavras de dados por bloco] (o grupo 2 tem uma palavra a mais); `ec`: palavras de correção por bloco.
// `remainder`: bits de sobra depois das palavras de código. O total de palavras sai do desenho do símbolo (conferido em qr.test.mjs).
export const SPECS = [
  { version: 10, ec: 26, groups: [[4, 43], [1, 44]], remainder: 0 },
  { version: 20, ec: 26, groups: [[3, 41], [13, 42]], remainder: 3 },
  { version: 30, ec: 28, groups: [[19, 47], [10, 48]], remainder: 3 },
  { version: 40, ec: 28, groups: [[18, 47], [31, 48]], remainder: 0 },
];
const EC_LEVEL_M = 0b00; // indicador de nível de correção na informação de formato
const dataWords = (spec) => spec.groups.reduce((sum, [blocks, size]) => sum + blocks * size, 0);
export const capacityBytes = (spec) => Math.floor((dataWords(spec) * 8 - 4 - 16) / 8); // modo (4 bits) + contagem (16 bits, versão ≥ 10)
export const MAX_BYTES = capacityBytes(SPECS[SPECS.length - 1]);

// ---- Corpo finito GF(256), polinômio x^8 + x^4 + x^3 + x^2 + 1 -----------------------------------------------------------
const EXP = new Uint8Array(510);
const LOG = new Uint8Array(256);
for (let i = 0, value = 1; i < 255; i += 1) {
  EXP[i] = value; LOG[value] = i;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let i = 255; i < 510; i += 1) EXP[i] = EXP[i - 255];
const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** Palavras de correção Reed-Solomon: resto da divisão de data·x^count pelo gerador ∏(x − α^i), i = 0…count−1. */
export function reedSolomonParity(data, count) {
  let generator = [1];
  for (let i = 0; i < count; i += 1) {
    const next = new Array(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j += 1) { next[j] ^= generator[j]; next[j + 1] ^= gfMul(generator[j], EXP[i]); }
    generator = next;
  }
  const register = new Array(count).fill(0); // generator[0] = 1 (mônico); os demais coeficientes ficam em generator[1…count]
  for (const byte of data) {
    const lead = byte ^ register[0];
    register.shift(); register.push(0);
    if (lead) for (let j = 0; j < count; j += 1) register[j] ^= gfMul(generator[j + 1], lead);
  }
  return register;
}

// ---- Informação de formato e de versão (códigos BCH) ----------------------------------------------------------------------
const bitLength = (n) => 32 - Math.clz32(n);
function bchRemainder(value, generator) {
  let rest = value;
  while (bitLength(rest) >= bitLength(generator)) rest ^= generator << (bitLength(rest) - bitLength(generator));
  return rest;
}
/** 15 bits: nível (2) + máscara (3), BCH(15,5) com 0x537, XOR 0x5412. */
export function formatBits(level, mask) {
  const data = (level << 3) | mask;
  return (((data << 10) | bchRemainder(data << 10, 0x537)) ^ 0x5412);
}
/** 18 bits: versão (6) + BCH(18,6) com 0x1F25 (só versões ≥ 7). */
export function versionBits(version) { return (version << 12) | bchRemainder(version << 12, 0x1f25); }

// ---- Desenho do símbolo ---------------------------------------------------------------------------------------------------
/** Posições dos padrões de alinhamento: 6 e depois de ((4v+10) para trás) em passos pares iguais. */
function alignmentCenters(version) {
  const count = Math.floor(version / 7) + 2;
  const last = 4 * version + 10;
  const step = Math.ceil((last - 6) / (count - 1) / 2) * 2;
  const centers = [6];
  for (let position = last - step * (count - 2); position <= last; position += step) centers.push(position);
  return centers;
}

/** Matriz de módulos de função (localizadores, separadores, temporização, alinhamento, formato, versão): `fixed[linha][coluna]`; `dark` já traz os escuros. */
export function layout(version) {
  const size = 17 + 4 * version;
  const dark = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const put = (row, col, value) => { if (row >= 0 && col >= 0 && row < size && col < size) { dark[row][col] = value; fixed[row][col] = true; } };
  const finder = (top, left) => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        put(top + dr, left + dc, inside && ring !== 2); // anel externo e miolo 3×3 escuros; anel intermediário e separador claros
      }
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i += 1) { put(6, i, i % 2 === 0); put(i, 6, i % 2 === 0); }
  const centers = alignmentCenters(version);
  const lastCenter = centers[centers.length - 1];
  for (const row of centers) {
    for (const col of centers) {
      if ((row === 6 && (col === 6 || col === lastCenter)) || (row === lastCenter && col === 6)) continue; // cai em cima de um localizador
      for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) put(row + dr, col + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  put(size - 8, 8, true); // módulo escuro fixo
  for (let i = 0; i < 15; i += 1) { // reserva as áreas de formato (valor real entra depois)
    const [r1, c1] = i < 6 ? [i, 8] : i < 8 ? [i + 1, 8] : i === 8 ? [8, 7] : [8, 14 - i];
    put(r1, c1, false);
    put(...(i < 8 ? [8, size - 1 - i] : [size - 15 + i, 8]), false);
  }
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const value = ((bits >> i) & 1) === 1;
      const near = size - 11 + (i % 3); const far = Math.floor(i / 3);
      put(far, near, value); put(near, far, value);
    }
  }
  return { size, dark, fixed };
}

function placeFormat(dark, size, mask) {
  const bits = formatBits(EC_LEVEL_M, mask);
  for (let i = 0; i < 15; i += 1) {
    const value = ((bits >> i) & 1) === 1;
    const first = i < 6 ? [i, 8] : i < 8 ? [i + 1, 8] : i === 8 ? [8, 7] : [8, 14 - i];
    const second = i < 8 ? [8, size - 1 - i] : [size - 15 + i, 8];
    dark[first[0]][first[1]] = value;
    dark[second[0]][second[1]] = value;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Pontuação de penalidade da norma (regras N1 a N4): quanto menor, melhor a máscara. */
export function penalty(grid) {
  const size = grid.length;
  let score = 0;
  const lines = [];
  for (let i = 0; i < size; i += 1) { lines.push(grid[i]); lines.push(grid.map((row) => row[i])); }
  const finderLike = [[true, false, true, true, true, false, true, false, false, false, false], [false, false, false, false, true, false, true, true, true, false, true]];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === line[i - 1]) run += 1;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    for (let i = 0; i + 11 <= size; i += 1) for (const pattern of finderLike) if (pattern.every((value, k) => line[i + k] === value)) score += 40;
  }
  for (let r = 0; r + 1 < size; r += 1) for (let c = 0; c + 1 < size; c += 1) if (grid[r][c] === grid[r][c + 1] && grid[r][c] === grid[r + 1][c] && grid[r][c] === grid[r + 1][c + 1]) score += 3;
  const darkCount = grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  score += 10 * Math.floor(Math.abs((darkCount * 100) / (size * size) - 50) / 5);
  return score;
}

// ---- Dados ----------------------------------------------------------------------------------------------------------------
function dataBytes(payload, spec) {
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1); };
  push(0b0100, 4); // modo byte
  push(payload.length, 16);
  for (const byte of payload) push(byte, 8);
  const capacityBits = dataWords(spec) * 8;
  push(0, Math.min(4, capacityBits - bits.length)); // terminador
  while (bits.length % 8) bits.push(0);
  const words = [];
  for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  for (let pad = 0; words.length < dataWords(spec); pad += 1) words.push(pad % 2 === 0 ? 0xec : 0x11);
  return words;
}

/** Palavras de código na ordem de gravação: dados e correção intercalados bloco a bloco. */
export function codewords(payload, spec) {
  const words = dataBytes(payload, spec);
  const blocks = [];
  let at = 0;
  for (const [count, length] of spec.groups) {
    for (let i = 0; i < count; i += 1) { const data = words.slice(at, at + length); at += length; blocks.push({ data, parity: reedSolomonParity(data, spec.ec) }); }
  }
  const out = [];
  const longest = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < longest; i += 1) for (const block of blocks) if (i < block.data.length) out.push(block.data[i]);
  for (let i = 0; i < spec.ec; i += 1) for (const block of blocks) out.push(block.parity[i]);
  return out;
}

/** Ordem de gravação dos módulos de dados: colunas duplas da direita para a esquerda, subindo e descendo, pulando a coluna de temporização. */
export function dataPositions(size, fixed) {
  const out = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const upward = ((right + 1) & 2) === 0;
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) if (!fixed[row][col]) out.push([row, col]);
    }
  }
  return out;
}

/**
 * Matriz de booleanos (true = módulo escuro), linha a linha, SEM margem. `options.mask` (0 a 7) fixa a máscara (para testes);
 * sem ela, escolhe a de menor penalidade (empate: a de menor número).
 */
export function qrMatrix(text, options = {}) {
  const payload = new TextEncoder().encode(String(text));
  const spec = SPECS.find((candidate) => payload.length <= capacityBytes(candidate));
  if (!spec) throw new Error(`A configuração é grande demais para o QR (limite de ${MAX_BYTES} bytes).`);
  const { size, dark, fixed } = layout(spec.version);
  const bits = [];
  for (const word of codewords(payload, spec)) for (let i = 7; i >= 0; i -= 1) bits.push(((word >> i) & 1) === 1);
  const positions = dataPositions(size, fixed);
  const draw = (mask) => {
    const grid = dark.map((row) => row.slice());
    positions.forEach(([row, col], i) => { grid[row][col] = (i < bits.length ? bits[i] : false) !== MASKS[mask](row, col); });
    placeFormat(grid, size, mask);
    return grid;
  };
  if (options.mask !== undefined) return draw(options.mask);
  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const grid = draw(mask);
    const score = penalty(grid);
    if (!best || score < best.score) best = { grid, score, mask };
  }
  return best.grid;
}
