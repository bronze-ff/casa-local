// Cobertura IR do ar do quarto: só vale o que foi APRENDIDO. Funções puras.
export const MODES = [{ value: 'cool', label: 'Resfriar', short: 'Frio' }, { value: 'heat', label: 'Aquecer', short: 'Calor' }, { value: 'dry', label: 'Desumidificar', short: 'Seco' }, { value: 'fan', label: 'Ventilar', short: 'Ventilar' }, { value: 'auto', label: 'Automático', short: 'Auto' }];
export const FANS = [{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Baixa' }, { value: 'medium', label: 'Média' }, { value: 'high', label: 'Alta' }];
export const EXTRAS = [{ key: 'turbo', label: 'Turbo' }, { key: 'eco', label: 'Eco' }, { key: 'brisa', label: 'Brisa' }, { key: 'display', label: 'Display' }];
export const TIMERS = [30, 60, 120, 240];
export const labelOf = (list, value) => list.find((item) => item.value === value)?.label;

/** Temperaturas com sinal aprendido para modo/ventilação. Sem cadastro (ir ausente), toda a faixa 17–30. */
export const temperatures = (ir, mode, fan) =>
  (ir ? ir.coverage?.[mode]?.[fan] || [] : Array.from({ length: 14 }, (_, i) => i + 17)).filter((t) => Number.isInteger(t) && t >= 17 && t <= 30);

/** Estado suportado mais próximo do pedido, ou null se o modo não tem nenhum sinal. */
export function supportedState(ir, mode, fan, temperature) {
  const fans = FANS.map((f) => f.value).filter((value) => temperatures(ir, mode, value).length);
  const nextFan = fans.includes(fan) ? fan : fans[0];
  const available = temperatures(ir, mode, nextFan);
  if (!available.length) return null;
  return { mode, fan: nextFan, temperature: available.reduce((best, t) => (Math.abs(t - temperature) < Math.abs(best - temperature) ? t : best), available[0]) };
}
