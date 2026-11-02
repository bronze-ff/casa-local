// Lógica pura da Central (sem React): resumo, saúde, rotinas, modos, energia, atalhos e som.

export const SECTIONS = [['saude', 'Saúde'], ['avisos', 'Avisos'], ['modos', 'Modos'], ['rotinas', 'Rotinas'], ['energia', 'Energia'], ['atalhos', 'Atalhos'], ['som', 'Som']];
export const TITLE = { ok: 'Tudo funcionando', warn: 'Funcionando, com avisos', fail: 'Algo parou' };
export const CHECK = { ok: ['ok', 'ok'], warn: ['warn', 'Aviso'], fail: ['err', 'Falha'] };
export const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const TIMER_MINUTES = [30, 60, 120, 240];

/** Resumo só com o que o servidor devolveu; ausente não vira número inventado. */
export function summaryOf(health, scenes) {
  const items = [];
  if (health) {
    const bad = (health.checks || []).filter((check) => check.state !== 'ok').length;
    items.push(['Sistema', TITLE[health.state] || health.state], ['Avisos', String(bad)]);
    const machine = health.machine || {};
    if (machine.memory) items.push(['Memória', `${machine.memory.used}%`]);
    if (machine.disk) items.push(['Disco livre', `${machine.disk.freeGb} GB`]);
  }
  if (Array.isArray(scenes)) items.push(['Modos', String(scenes.length)]);
  return items;
}

export function fmtUptime(seconds) {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return d ? `${d} d ${h} h` : `${h} h ${Math.floor((seconds % 3600) / 60)} min`;
}

export const healthLabel = (state) => TITLE[state] || state;

// ---------- Rotinas ----------
// Ações avulsas aceitas pelo backend (luz e ar); o resto é modo. Os ids são o contrato do servidor.
export const SINGLE = [
  ['ar-off', 'Desligar o ar', { type: 'device', device: 'ar-quarto', values: { power: false } }],
  ['ar-on', 'Ligar o ar · 24 °C resfriar', { type: 'device', device: 'ar-quarto', values: { power: true, temperature: 24, mode: 'cool', fan: 'auto' } }],
  ['ar-22', 'Ligar o ar · 22 °C resfriar', { type: 'device', device: 'ar-quarto', values: { power: true, temperature: 22, mode: 'cool', fan: 'auto' } }],
  ['quarto-on', 'Acender luz do quarto', { type: 'device', device: 'quarto-luz', values: { power: true } }],
  ['quarto-off', 'Apagar luz do quarto', { type: 'device', device: 'quarto-luz', values: { power: false } }],
  ['banheiro-off', 'Apagar luz do banheiro', { type: 'device', device: 'banheiro-luz', values: { power: false } }],
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const actionKey = (a) => (a.type === 'scene' ? `modo:${a.id}` : SINGLE.find(([, , v]) => same(v, a))?.[0] ?? 'atual');
export const actionLabel = (a, modes) => (a.type === 'scene' ? `Modo ${modes.find((m) => m.id === a.id)?.name ?? '(apagado)'}` : SINGLE.find(([, , v]) => same(v, a))?.[1] ?? 'Ação personalizada');
export const actionOf = (pick, initial) => (pick.startsWith('modo:') ? { type: 'scene', id: pick.slice(5) } : pick === 'atual' ? initial?.action : SINGLE.find(([k]) => k === pick)?.[2]);

export function whenText(sec, now = new Date()) {
  const t = new Date(sec * 1000);
  const hm = t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (t.toDateString() === now.toDateString()) return `hoje ${hm}`;
  if (t.toDateString() === new Date(now.getTime() + 864e5).toDateString()) return `amanhã ${hm}`;
  return `${t.toLocaleDateString('pt-BR', { weekday: 'short' })} ${hm}`;
}

/** Marcas da linha do dia: só rotinas por horário, com a posição em % das 24 h. */
export function dayMarks(routines = []) {
  return routines
    .filter((r) => r.trigger === 'time' && /^\d{2}:\d{2}$/.test(r.time || ''))
    .map((r) => { const [hh, mm] = r.time.split(':').map(Number); return { id: r.id, name: r.name, time: r.time, enabled: r.enabled, pct: Math.round(((hh * 60 + mm) / 1440) * 1000) / 10 }; })
    .sort((a, b) => a.pct - b.pct);
}

export function placeText(r, places, people) {
  const place = places.find((p) => p.id === r.place)?.name ?? 'lugar apagado';
  const who = r.person ? people.find((p) => p.id === r.person)?.name ?? 'pessoa removida' : 'alguém';
  return `${who} ${r.event === 'chegou' ? 'chegar em' : 'sair de'} ${place}${r.between ? ` (${r.between[0]}–${r.between[1]})` : ''}`;
}

const hhmm = (v) => /^\d{2}:\d{2}$/.test(v || '');

/** Problemas do formulário de rotina, em texto; vazio = pode salvar. */
export function routineProblems({ name, days, trigger, time, place, between, action }) {
  const out = [];
  if (!String(name || '').trim()) out.push('Dê um nome à rotina.');
  if (!days?.length) out.push('Escolha pelo menos um dia.');
  if (trigger === 'time' && !hhmm(time)) out.push('Informe o horário.');
  if (trigger === 'place') {
    if (!place) out.push('Escolha um lugar.');
    if (between && (!hhmm(between[0]) || !hhmm(between[1]) || between[0] === between[1])) out.push('A faixa de horário precisa de início e fim diferentes.');
  }
  if (!action) out.push('Escolha o que fazer.');
  return out;
}

/** Corpo do POST /api/routines: o status traz campos só de leitura (next) que o backend recusa. */
export function routineBody(form, initial) {
  return {
    ...(initial ? { id: initial.id, enabled: initial.enabled } : {}), name: form.name.trim(), days: form.days, action: form.action,
    ...(form.trigger === 'time' ? { trigger: 'time', time: form.time } : { trigger: 'place', place: form.place, event: form.event, between: form.between, person: form.person || null }),
  };
}
export const toggleBody = (routine) => { const { next, ...rest } = routine; return { ...rest, enabled: !routine.enabled }; };

// ---------- Modos ----------
export const ICONS = [['home', 'Casa'], ['film', 'Filme'], ['moon', 'Noite'], ['book', 'Leitura'], ['sun', 'Sol'], ['sofa', 'Sofá'], ['coffee', 'Café'], ['bed', 'Cama'], ['power', 'Desligar']];
export const iconFor = (name) => (ICONS.some(([id]) => id === name) ? name : 'home');
export const AC_MODES = [['cool', 'Resfriar'], ['heat', 'Aquecer'], ['dry', 'Desumidificar'], ['fan', 'Ventilar'], ['auto', 'Automático']];
export const AC_FANS = [['auto', 'Automática'], ['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']];

/** Aparelhos que um modo pode mexer: luzes e ar do cadastro REAL da casa. */
export const modeTargets = (devices = []) => devices.filter((d) => d.kind === 'light' || d.kind === 'climate').map((d) => ({ id: d.id, name: d.name, kind: d.kind === 'light' ? 'light' : 'ac' }));

export function initialSteps(targets, steps = {}) {
  const out = {};
  for (const { id } of targets) {
    const s = steps[id];
    out[id] = { kind: !s ? 'skip' : s.power ? 'on' : 'off', brightness: s?.brightness ?? 50, colorHex: (s?.colorHex ?? '#FFD9A0').toLowerCase(), temperature: s?.temperature ?? 24, mode: s?.mode ?? 'cool', fan: s?.fan ?? 'auto', keepIfOn: s?.keepIfOn ?? false };
  }
  return out;
}

export function buildSteps(targets, steps) {
  const out = {};
  for (const { id, kind } of targets) {
    const s = steps[id];
    if (!s || s.kind === 'skip') continue;
    if (s.kind === 'off') out[id] = { power: false };
    else if (kind === 'light') out[id] = { power: true, brightness: Number(s.brightness), colorHex: s.colorHex.toUpperCase() };
    else out[id] = { power: true, temperature: Number(s.temperature), mode: s.mode, fan: s.fan, keepIfOn: s.keepIfOn };
  }
  return out;
}

export function modeProblems(name, steps) {
  const out = [];
  if (!String(name || '').trim()) out.push('Dê um nome ao modo.');
  if (!Object.keys(steps).length) out.push('Escolha o que o modo faz em pelo menos um aparelho.');
  const bad = Object.entries(steps).find(([, s]) => s.temperature !== undefined && !(s.temperature >= 17 && s.temperature <= 30));
  if (bad) out.push('A temperatura vai de 17 a 30 °C.');
  return out;
}

/** Rotinas que usam o modo (o servidor recusa apagar com 409; aqui a tela avisa antes). */
export const routinesUsing = (modeId, routines = []) => routines.filter((r) => r.action?.type === 'scene' && r.action.id === modeId);

export function moveIds(ids, index, by) {
  const next = [...ids];
  const to = index + by;
  if (to < 0 || to >= next.length) return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// ---------- Energia ----------
export const money = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const hours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`);

/** Potência (W) e tarifa (R$/kWh) do formulário → corpo do POST, ou o problema em texto. */
export function energyInput(watts, tariff) {
  const w = Number(String(watts).replace(',', '.'));
  const t = Number(String(tariff).replace(',', '.'));
  if (!Number.isFinite(w) || w < 100 || w > 5000) return { problem: 'A potência vai de 100 a 5000 W.' };
  if (!Number.isFinite(t) || t < 0.1 || t > 5) return { problem: 'A tarifa vai de R$ 0,10 a R$ 5,00 por kWh.' };
  return { body: { watts: w, tariff: t } };
}

// ---------- Atalhos ----------
/** Pelo Tailscale (sem a porta do ntfy); sem ele, o endereço atual. */
export const shortcutBase = (subscribe, origin) => (subscribe ? subscribe.replace(/:10000$/, '') : origin);
export const sceneUrl = (base, id) => `${base}/api/scenes/${id}/run`;

// ---------- Avisos ----------
export const TOPICS = [
  ['cameras', 'Movimento nas câmeras', 'Qualquer movimento do DVR, com foto e link para a gravação.'],
  ['sistema', 'Sistema e home lab', 'Algo caiu ou voltou, disco quase cheio, GPU quente, aparelho novo na rede.'],
  ['casa', 'Casa', 'Chegadas e saídas e as rotinas que rodaram.'],
];
export const presenceText = (home) => (home === true ? 'Você está em casa: câmeras chegam sem som.' : home === false ? 'Você está fora: câmeras chegam com som.' : 'Sem localização recente: câmeras chegam com som.');
export const allTopics = (n) => [...Object.values(n.topics || {}), ...(n.external || []).map((t) => t.topic)];
