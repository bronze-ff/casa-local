// Visão do Início: funções puras que transformam o que o servidor devolveu em texto honesto. Nada é inventado.
export const AC_MODES = { cool: 'frio', heat: 'quente', dry: 'seco', fan: 'ventilar', auto: 'automático' };

/** Aparelho com conexão conhecida diferente de online/preview está sem conexão. */
export const isOffline = (d) => !!d?.connection && !['online', 'preview'].includes(d.connection);

export function greetingFor(date) {
  const hour = date.getHours();
  return hour < 5 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

/** Valor curto de um aparelho. Desconhecido nunca vira zero nem "desligado". */
export function deviceView(d) {
  const st = d?.state || {};
  if (isOffline(d)) return { value: '—', known: false, off: true, sub: 'sem conexão' };
  if (st.power == null) return { value: '—', known: false, off: true, sub: 'sem leitura' };
  if (d.kind === 'light') return { value: st.power ? `${st.brightness ?? '—'}%` : 'apagada', known: true, off: !st.power, level: st.power ? st.brightness ?? null : null };
  if (d.kind === 'climate') {
    const mode = AC_MODES[st.mode] || st.mode;
    return st.power
      ? { value: `${st.temperature ?? '—'}°`, known: true, off: false, sub: mode }
      : { value: 'desligado', known: true, off: true, sub: st.temperature ? `último envio ${st.temperature}°${mode ? ` · ${mode}` : ''}` : null };
  }
  if (d.kind === 'tv') return { value: st.power ? 'ligada' : 'desligada', known: true, off: !st.power, sub: d.brand };
  return { value: '—', known: false, off: true };
}

/** Resumo do ambiente só com o último estado conhecido; infravermelho aparece como estimado. */
export function ambientOf(devices = []) {
  const lights = devices.filter((d) => d.kind === 'light');
  const read = lights.filter((d) => d.state?.power != null);
  const items = [];
  if (lights.length) items.push(['Luzes', read.length ? `${read.filter((d) => d.state.power === true).length} de ${lights.length} acesas` : 'sem leitura']);
  for (const [kind, label] of [['climate', 'Ar'], ['tv', 'TV']]) {
    const d = devices.find((x) => x.kind === kind);
    if (!d) continue;
    const st = d.state || {};
    const value = st.power == null ? 'sem leitura' : st.power ? (kind === 'climate' && st.temperature ? `${st.temperature}° ligado` : 'ligado') : 'desligado';
    items.push([label, `${value}${d.confidence === 'reported' || st.power == null ? '' : ' · estimado'}`]);
  }
  const offline = devices.filter(isOffline).length;
  if (offline) items.push(['Sem conexão', String(offline)]);
  return items;
}

/** Onde a pessoa está, com a idade da posição. Sem posição, diz isso. */
export function whereIs(person, places = [], ago = (v) => String(v)) {
  const names = Object.fromEntries(places.map((p) => [p.id, p.name]));
  if (!person?.last) return 'sem posição';
  const where = person.place ? `em ${names[person.place] || person.place}` : 'fora dos lugares';
  return `${where}${person.stale ? ' · posição antiga' : ` · ${ago(person.last.tst)}`}`;
}

export const newestEvent = (events = []) => events.reduce((best, e) => (!best || e.start > best.start ? e : best), null);

/** Medidores do computador. Zero continua zero; ausente (null/undefined) vira traço e nunca "0". */
export function meters(stats = {}) {
  const pct = (v) => (v == null ? '—' : `${v}%`);
  return [
    { key: 'cpu', label: 'CPU', value: pct(stats.cpu), warn: (stats.cpu ?? 0) >= 90 },
    { key: 'mem', label: 'Memória', value: pct(stats.memory?.used), warn: (stats.memory?.used ?? 0) >= 85 },
    { key: 'gpu', label: 'GPU', value: stats.gpu?.temp == null ? '—' : `${Math.round(stats.gpu.temp)}°`, warn: (stats.gpu?.temp ?? 0) >= 80 },
    { key: 'wsl', label: 'WSL', value: stats.wslGb == null ? '—' : `${String(stats.wslGb).replace('.', ',')} GB`, warn: (stats.wslGb ?? 0) >= 5.5 },
  ];
}

/** Texto do modo jogo. Ação aceita não é fim do processo: o passo atual vem do servidor. */
export function gameText(d) {
  if (d.step) return d.step;
  if (d.mode === 'jogo') return `Ligado${d.reason?.startsWith('auto:') ? ` · entrou sozinho com ${d.reason.slice(5)}` : ''} · mídia e downloads parados`;
  return d.auto ? `Desligado · liga sozinho ao abrir ${(d.games || []).join(', ')}` : 'Desligado';
}

/**
 * Linha de resultado de um passo de modo, em linguagem humana. Forma confirmada da API (backend/app.py `_step_result`):
 * { deviceId, status, operation, evidence, confirmationExpected, message, receipt }. A operação (saiu ou falhou) e a EVIDÊNCIA
 * (o que o aparelho provou) são coisas diferentes: divergente e simulado nunca viram "enviado"; falha mantém a evidência ao lado.
 */
const EVIDENCE = { confirmed: 'Confirmado', diverged: 'Divergente', preview: 'Simulado' };
export function stepLabel(item) {
  if (item.status === 'skipped') return 'Já estava como pedido';
  const evidence = EVIDENCE[item.evidence];
  if (item.status === 'failed' || item.operation === 'failed') return evidence ? `Falhou · ${evidence.toLowerCase()}` : 'Falhou';
  return evidence || 'Enviado · sem confirmação';
}
