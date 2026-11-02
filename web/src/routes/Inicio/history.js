// Histórico curto do computador na tela larga: SÓ amostras reais acumuladas no navegador desde que a tela abriu
// (a API devolve apenas o valor atual). Nada de zero inventado: leitura ausente não vira amostra.
export const SAMPLES = 24;
export const emptyHistory = () => ({ cpu: [], gpu: [], mem: [], wsl: [] });

export function pushSample(history, stats, at) {
  if (!stats) return history;
  const readings = { cpu: stats.cpu, gpu: stats.gpu?.temp, mem: stats.memory?.used, wsl: stats.wslGb };
  let changed = false;
  const next = { ...history };
  for (const [key, value] of Object.entries(readings)) {
    if (value == null) continue;
    next[key] = [...history[key], { v: value, at }].slice(-SAMPLES);
    changed = true;
  }
  return changed ? next : history;
}

/** Pontos da linha (SVG). Menos de 2 amostras reais: nenhuma linha. `hi` fixa o topo da escala (ex.: 100 %). */
export function sparkPoints(samples = [], { w = 120, h = 32, hi } = {}) {
  if (samples.length < 2) return '';
  const top = Math.max(hi ?? 0, ...samples.map((s) => s.v)) || 1;
  return samples.map((s, i) => `${((i / (samples.length - 1)) * w).toFixed(1)},${(h - (Math.max(0, s.v) / top) * h).toFixed(1)}`).join(' ');
}

export const HISTORY_SCALE = { cpu: 100, gpu: 100, mem: 100, wsl: undefined };
