// Resultado de um modo, por aparelho e por campo, com a evidência do recibo. Puro (sem React).
// Entrada: o corpo de POST /api/scenes/:id/run ({ status, evidenceSummary, results: [{ deviceId, status, operation, evidence, message, receipt }] }).
const FIELDS = { power: 'Ligado', brightness: 'Brilho', colorHex: 'Cor', temperature: 'Temperatura', mode: 'Modo', fan: 'Ventilação' };
const MODES = { cool: 'resfriar', heat: 'aquecer', dry: 'desumidificar', fan: 'ventilar', auto: 'automático' };
const FANS = { auto: 'automática', low: 'baixa', medium: 'média', high: 'alta' };

export function valueText(field, value) {
  if (value === undefined || value === null) return '—';
  if (field === 'power') return value ? 'ligado' : 'desligado';
  if (field === 'brightness') return `${value}%`;
  if (field === 'temperature') return `${value} °C`;
  if (field === 'mode') return MODES[value] || String(value);
  if (field === 'fan') return FANS[value] || String(value);
  return String(value);
}

/** Um campo pedido: o que foi pedido, o que o aparelho leu depois e se isso prova o pedido (confirmado, divergente ou sem confirmação). */
export function fieldViews(receipt) {
  if (!receipt) return [];
  const confirmed = receipt.confirmedFields || [];
  const diverged = receipt.divergedFields || [];
  return Object.keys(receipt.requested || {}).map((field) => ({
    field, label: FIELDS[field] || field,
    requested: valueText(field, receipt.requested[field]),
    reported: field in (receipt.reported || {}) ? valueText(field, receipt.reported[field]) : null,
    state: diverged.includes(field) ? 'diverged' : confirmed.includes(field) ? 'confirmed' : 'unconfirmed',
  }));
}

export const FIELD_STATE = { confirmed: 'confirmado', diverged: 'divergente', unconfirmed: 'sem confirmação' };

/** Evidência do passo, em ordem de gravidade: falhou, divergiu, pulado, simulado, confirmado, enviado sem confirmação. */
export function stepEvidence(item) {
  if (item.status === 'skipped' || item.operation === 'skipped') return 'skipped';
  if (item.status === 'failed' || item.operation === 'failed') return 'failed';
  if (item.evidence === 'diverged') return 'diverged';
  if (item.evidence === 'preview' || item.status === 'preview') return 'preview';
  if (item.evidence === 'confirmed') return 'confirmed';
  return 'unconfirmed';
}
const LABEL = { failed: 'Falhou', diverged: 'Divergente', skipped: 'Já estava como pedido', preview: 'Simulado', confirmed: 'Confirmado', unconfirmed: 'Enviado · sem confirmação' };
const KIND = { failed: 'err', diverged: 'warn', skipped: 'off', preview: 'sim', confirmed: 'ok', unconfirmed: 'sent' };

export function stepView(item, nameOf = (id) => id) {
  const evidence = stepEvidence(item);
  const receipt = item.receipt || null;
  return {
    deviceId: item.deviceId, name: nameOf(item.deviceId), evidence, kind: KIND[evidence],
    label: evidence === 'failed' && item.evidence === 'diverged' ? 'Falhou · divergente' : LABEL[evidence],
    message: item.message || '', fields: fieldViews(receipt),
    reason: evidence === 'failed' && receipt?.delivery === 'not_sent' ? 'Nada foi enviado ao aparelho.' : '',
  };
}

/** Contagem por evidência OBSERVADA: o resumo do servidor quando existe; senão, os próprios passos. Nunca um padrão otimista. */
export function evidenceCounts(result) {
  const steps = result?.results || [];
  const sum = result?.evidenceSummary;
  if (sum && Object.keys(sum).length) return { confirmed: sum.confirmed || 0, unconfirmed: sum.unconfirmed || 0, diverged: sum.diverged || 0 };
  const count = (kind) => steps.filter((item) => stepEvidence(item) === kind).length;
  return { confirmed: count('confirmed'), unconfirmed: count('unconfirmed'), diverged: count('diverged') };
}

/**
 * Título e gravidade do conjunto: parcial nunca parece sucesso; sem confirmação física não vira "ok".
 * "Confirmado" só existe quando algum passo teve evidência observada (confirmed > 0) e nenhum ficou sem confirmação.
 * Tudo pulado (ex.: ar já ligado com "manter como está") é "Nenhuma ação necessária"; sem passo algum é "Sem resultado".
 */
export function overview(result) {
  const steps = result?.results || [];
  const sum = result?.evidenceSummary || {};
  const counts = evidenceCounts(result);
  const failed = steps.filter((item) => stepEvidence(item) === 'failed').length;
  if (result?.status === 'partial' || failed || counts.diverged > 0) return { kind: 'warn', title: 'Executado em parte', icon: 'alert', failed, sum };
  if (result?.status === 'preview') return { kind: '', title: 'Simulado', icon: 'eye', failed, sum };
  if (counts.unconfirmed > 0) return { kind: 'info', title: counts.confirmed > 0 ? 'Enviado; parte sem confirmação física' : 'Enviado; sem confirmação física', icon: 'check', failed, sum };
  if (counts.confirmed > 0) return { kind: 'info', title: 'Confirmado', icon: 'check', failed, sum };
  if (steps.length > 0 && steps.every((item) => stepEvidence(item) === 'skipped')) return { kind: 'info', title: 'Nenhuma ação necessária', icon: 'check', failed, sum };
  return { kind: 'info', title: 'Sem resultado', icon: 'off', failed, sum };
}

/** Roda o modo UMA vez; devolve o par que a tela mostra (ou null se o POST falhou, caso em que o aviso já foi dado). Nunca repete sozinho. */
export async function runScene(run, scene) {
  const result = await run(`/api/scenes/${scene.id}/run`, {}, `Modo ${scene.name} aplicado.`);
  return result ? { scene, result } : null;
}
