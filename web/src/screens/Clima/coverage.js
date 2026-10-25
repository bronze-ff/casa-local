export const MODES = [['cool', 'Resfriar'], ['heat', 'Aquecer'], ['dry', 'Desumidificar'], ['fan', 'Ventilar'], ['auto', 'Automático']];
export const FANS = [['auto', 'Auto'], ['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']];
export const temperatures = (ir, mode, fan) => (ir ? ir.coverage?.[mode]?.[fan] || [] : Array.from({ length: 14 }, (_, i) => i + 17)).filter((t) => Number.isInteger(t) && t >= 17 && t <= 30);
export function supportedState(ir, mode, fan, temperature) {
  const fans = FANS.map(([value]) => value).filter((value) => temperatures(ir, mode, value).length);
  const nextFan = fans.includes(fan) ? fan : fans[0];
  const available = temperatures(ir, mode, nextFan);
  if (!available.length) return null;
  return { mode, fan: nextFan, temperature: available.reduce((best, t) => Math.abs(t - temperature) < Math.abs(best - temperature) ? t : best, available[0]) };
}
