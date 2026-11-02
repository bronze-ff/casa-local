// Rascunho de brilho: o que a luz RELATOU é uma coisa, o que o usuário ajustou e ainda NÃO enviou é outra.
// Só o brilho usa rascunho + Aplicar. Temperatura emite um comando ao soltar (componente próprio, em Clima).
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function stepDraft(draft, delta, { min = 1, max = 100 } = {}) {
  const base = Number.isFinite(draft) ? draft : min;
  return clamp(Math.round(base + delta), min, max);
}

/** Há diferença entre o ajustado e o relatado? Sem relato (null), qualquer valor ajustado é diferença. */
export const isDirty = (reported, draft) => Number.isFinite(draft) && draft !== reported;

/** Estado do rascunho quando chega um novo relato: sem toque do usuário segue o relato; ao coincidir, o toque acaba. */
export function afterReport({ draft, touched }, reported) {
  if (!touched) return { draft: Number.isFinite(reported) ? reported : draft, touched: false };
  if (draft === reported) return { draft, touched: false };
  return { draft, touched: true };
}
