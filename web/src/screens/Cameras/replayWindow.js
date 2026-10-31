/** Janela de replay em volta de um evento (horários no relógio do DVR; `offset` = DVR − PC). */
export function replayWindow(camera, event, offset) {
  const now = Date.now() / 1000 + offset;
  const from = event.start - 30;
  const to = Math.min(now - 5, Math.max((event.end ?? now) + 60, from + 180));
  return { camera, start: event.start - 10, from, to, offset };
}
