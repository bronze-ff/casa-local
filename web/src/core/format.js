// Formatação em português do Brasil. Valor ausente vira traço, nunca zero.

const toMs = (value) => (typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : new Date(value).getTime());

export function fmtTime(value) {
  if (value == null) return '—';
  const date = new Date(toMs(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function fmtAgo(value, now = Date.now()) {
  if (value == null) return '—';
  const ms = toMs(value);
  if (Number.isNaN(ms)) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}

export const fmtNum = (value, digits = 0) => (Number.isFinite(value) ? value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—');
