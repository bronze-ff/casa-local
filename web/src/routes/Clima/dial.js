// Dial de 270° da temperatura. Arrastar ou usar as setas só muda o RASCUNHO (a tela); o comando sai UMA vez, ao soltar.
// Sem mudança de valor, soltar não emite nada. `values` limita ao que existe: cobertura IR esparsa nunca vira temperatura sem sinal.
export const SWEEP = 270;
export const START = 135;

export const progressToAngle = (progress) => START + SWEEP * Math.max(0, Math.min(1, progress));

/** Ângulo (graus, horário a partir de +x) → progresso 0..1. A zona morta embaixo cai na extremidade mais próxima. */
export function angleToProgress(angle) {
  const rel = (((angle - START) % 360) + 360) % 360;
  if (rel <= SWEEP) return rel / SWEEP;
  return rel - SWEEP < (360 - SWEEP) / 2 ? 1 : 0;
}

export function createDial({ min, max, values, onCommit }) {
  // `values` ausente = sem informação de cobertura (vale a faixa inteira). `values` = [] = cobertura conhecida e VAZIA: nada a escolher.
  const list = Array.isArray(values) ? [...values].sort((a, b) => a - b) : Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const none = list.length === 0;
  const nearest = (raw) => list.reduce((best, v) => (Math.abs(v - raw) < Math.abs(best - raw) ? v : best), list[0]);
  let origin = null;
  let current = null;
  return {
    start(value) { origin = value; current = value; },
    move(progress) { if (none) return null; current = nearest(min + Math.max(0, Math.min(1, progress)) * (max - min)); return current; },
    key(direction) {
      if (none) return null;
      if (direction === 'home') current = list[0];
      else if (direction === 'end') current = list[list.length - 1];
      else current = list[Math.max(0, Math.min(list.length - 1, list.indexOf(nearest(current ?? list[0])) + direction))];
      return current;
    },
    draft: () => current,
    release() {
      if (none || current == null || current === origin) return null;
      const value = current;
      origin = value;
      onCommit(value);
      return value;
    },
  };
}

/** Ponto do polegar no arco (viewBox 200×200, raio 80). */
export function thumbPoint(progress) {
  const angle = (progressToAngle(progress) * Math.PI) / 180;
  return { x: 100 + 80 * Math.cos(angle), y: 100 + 80 * Math.sin(angle) };
}
