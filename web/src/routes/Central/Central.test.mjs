import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HOME, LIGHT, AR, count, setupRoute, skip } from '../harness.mjs';

// Paridade da Central (spec §3, #/central): saúde, avisos, modos, rotinas, timer, energia, atalhos/chave e som. SSR com a casa falsa.
const opts = { skip };
const now = () => Math.floor(Date.now() / 1000);
const ok = (data, extra = {}) => ({ data, error: null, stale: false, at: Date.now() - 5000, reload() {}, ...extra });
const HEALTH = { state: 'warn', machine: { uptime: 90061, memory: { used: 88 }, disk: { freeGb: 80 } }, checks: [{ id: 'dns', label: 'DNS', detail: 'respondendo', state: 'ok' }, { id: 'bk', label: 'Backup', detail: 'atrasado', state: 'warn' }, { id: 'tv', label: 'Câmeras', detail: 'sem sinal', state: 'fail' }] };
const NOTIF = { topics: { cameras: 'casa-cam', sistema: 'casa-sys', casa: 'casa-casa' }, enabled: { cameras: true, sistema: false, casa: true }, external: [{ topic: 'casa-ext', label: 'Backup', detail: 'Resultado do backup.' }], cameraScope: 'watched', home: true, subscribe: 'pc.ts.net:10000', sent: 12, failed: 1, lastError: 'timeout' };
const ROUT = { routines: [{ id: 'r1', name: 'Boa noite', trigger: 'time', time: '23:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true, action: { type: 'scene', id: 'noite' }, next: now() + 3600 }, { id: 'r2', name: 'Acordar', trigger: 'time', time: '06:30', days: [0, 1], enabled: false, action: { type: 'device', device: 'ar-quarto', values: { power: false } } }, { id: 'r3', name: 'Saindo', trigger: 'place', place: 'casa', event: 'saiu', person: 'p1', days: [0], enabled: true, action: { type: 'scene', id: 'noite' } }], timers: [], log: [{ at: now() - 60, ok: true, name: 'Boa noite', message: 'ok' }, { at: now() - 600, ok: false, name: 'Acordar', message: 'ar sem resposta' }], lastError: null };
const ENERGY = { today: { cost: 1.5, hours: 2, kwh: 1.8 }, month: { cost: 30, hours: 40, kwh: 36 }, week: [{ date: '2026-10-30', hours: 1 }, { date: '2026-10-31', hours: 3 }], on: true, onSince: now() - 600, config: { watts: 900, tariff: 0.95 } };
const LOC = { places: [{ id: 'casa', name: 'Casa' }], people: [{ id: 'p1', name: 'Ana' }] };
const POLLS = () => ({ '/api/health': ok(HEALTH), '/api/notifications': ok(NOTIF), '/api/routines': ok(ROUT), '/api/location': ok(LOC), '/api/energy': ok(ENERGY) });
const DEVICES = () => [LIGHT('quarto-luz', 'Luz do quarto', { power: true }), AR({ power: false })];
const render = ({ home, polls = POLLS(), layout = 'desktop', module = 'Central.jsx', props, ...over } = {}) => {
  const t = setupRoute({ home: home || HOME(DEVICES()), polls, layout, ...over });
  const m = t.load(t.src(`routes/Central/${module}`));
  return t.render(module === 'Central.jsx' ? m.default : m[module.replace('.jsx', '')], props);
};
const tag = (html, label) => html.match(new RegExp(`<[^>]*aria-label="${label}"[^>]*>`))?.[0] || '';

test('todas as seções existem, com navegação interna por botão (não por hash) e resumo só com dados reais', opts, () => {
  const html = render();
  for (const label of ['Saúde do sistema', 'Avisos no celular', 'Modos da casa', 'Rotinas', 'Gasto do ar', 'Atalhos da Siri', 'Som das teclas']) assert.match(html, new RegExp(`aria-label="${label}"`), label);
  for (const id of ['saude', 'avisos', 'modos', 'rotinas', 'energia', 'atalhos', 'som']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.doesNotMatch(html, /href="#(saude|avisos|modos)/);
  assert.match(html, /<nav[^>]*aria-label="Seções da central"/);
  assert.match(html, /<dt class="cap">Sistema<\/dt><dd>Funcionando, com avisos<\/dd>/);
  assert.match(html, /<dt class="cap">Avisos<\/dt><dd>2<\/dd>/);
  const empty = render({ polls: {}, home: HOME([]) });
  assert.doesNotMatch(empty, /<dt class="cap">Sistema/);
  assert.match(empty, /Verificando/);
});

test('abrir só LÊ: nenhuma escrita, nenhum teste de aviso, a chave não é lida nem aparece', opts, () => {
  const posts = [];
  const html = render({ posts });
  assert.equal(posts.length, 0);
  assert.match(html, /Configurar/);
  assert.doesNotMatch(html, /Lendo a chave|Authorization|Mostrar chave|Trocar a chave|>Trocar</);
  const source = readFileSync(new URL('./Shortcuts.jsx', import.meta.url), 'utf8');
  assert.equal(count(source, /get\('\/api\/shortcuts'\)/g), 1, 'a chave é lida num único lugar');
  assert.match(source, /read: \(\) => get\('\/api\/shortcuts'\)/, 'a leitura mora na sessão da chave');
  assert.equal(count(source, /session\.open\(\)/g), 1, 'e a sessão só abre dentro do toque em Configurar');
  assert.match(source, /const toggle = async \(\) => \{[\s\S]*session\.open\(\)/);
});

test('saúde: estado, tempo ligado, memória alta, cada verificação com detalhe; falha sem dado explica; antigo mostra idade', opts, () => {
  const html = render({ module: 'Health.jsx', props: { poll: ok(HEALTH) } });
  assert.match(html, /Funcionando, com avisos/);
  assert.match(html, /2 avisos/);
  assert.match(html, /1 d 1 h/);
  assert.match(html, /88%[^<]*alta/);
  assert.match(html, /80 GB/);
  assert.match(html, /DNS<\/b><span class="sub">respondendo/);
  assert.match(html, />Aviso<\/span>|Aviso<\/span>/);
  assert.match(html, /class="st err"[^>]*>.*?Falha/);
  assert.match(render({ module: 'Health.jsx', props: { poll: ok(null, { error: new Error('Falha (500).') }) } }), /Não consegui ler a saúde: Falha \(500\)\./);
  assert.match(render({ module: 'Health.jsx', props: { poll: ok(HEALTH, { stale: true, error: new Error('x') }) } }), /Sem conexão para ler a saúde\. Mostrando o último dado/);
});

test('avisos: tópicos, avulsos, escopo das câmeras, presença, como assinar, contagem; teste só por botão', opts, () => {
  const html = render({ module: 'Notifications.jsx', props: { poll: ok(NOTIF), blocked: false, reason: null } });
  assert.match(html, /Movimento nas câmeras/);
  assert.equal(count(html, /role="switch"/g), 4, '3 tópicos + escopo das câmeras');
  assert.match(html, /aria-label="Avisar de todas as câmeras"[^>]*>|aria-checked="false"[^>]*aria-label="Avisar de todas as câmeras"/);
  assert.match(html, /Resultado do backup\. Assine/);
  assert.match(html, /Você está em casa: câmeras chegam sem som\./);
  assert.match(html, /Como receber no iPhone/);
  assert.match(html, /pc\.ts\.net:10000/);
  assert.match(html, /aria-label="Copiar o tópico casa-ext"/);
  assert.match(html, /12<\/span> enviados · 1 falharam \(timeout\)/);
  assert.match(html, />Testar</);
  const blocked = render({ module: 'Notifications.jsx', props: { poll: ok(NOTIF), blocked: true, reason: 'Sem conexão com o painel.' } });
  assert.match(blocked, /aria-disabled="true"[^>]*>.*?Testar/s);
  assert.equal(count(blocked, /role="switch"[^>]*disabled=""/g), 4);
  assert.match(render({ module: 'Notifications.jsx', props: { poll: ok({ ...NOTIF, subscribe: null, home: null }), blocked: false } }), /Sem localização recente[\s\S]*indisponível: o PC ainda não informou o nome no Tailscale/);
});

const MODES = [{ id: 'noite', name: 'Boa noite', icon: 'moon', description: '2 aparelhos' }, { id: 'filme', name: 'Filme', icon: 'film', description: '' }];
const modesProps = (over = {}) => ({ modes: MODES, devices: DEVICES(), routines: ROUT.routines, blocked: false, reason: null, ...over });

test('modos: rodar, subir/descer nos limites, editar, remover com confirmação, uso em rotina e diálogo fechado', opts, () => {
  const html = render({ module: 'Modes.jsx', props: modesProps() });
  assert.match(html, /Modos da casa · 2/);
  assert.match(html, /aria-label="Subir Boa noite"[^>]*disabled=""/);
  assert.match(html, /aria-label="Descer Filme"[^>]*disabled=""/);
  assert.match(html, /aria-label="Subir Filme"/);
  assert.ok(!/aria-label="Subir Filme"[^>]*disabled=""/.test(html));
  assert.match(html, /aria-label="Editar Boa noite"/);
  assert.match(html, /aria-label="Remover Filme"/);
  assert.ok(!/Remover mesmo/.test(html), 'a confirmação só existe depois do toque');
  assert.match(html, /usado pela rotina Boa noite e mais 1/);
  assert.equal(count(html, />Rodar</g), 2);
  assert.ok(!html.includes('ov-box'), 'formulário só existe com o diálogo aberto');
  assert.match(render({ module: 'Modes.jsx', props: modesProps({ modes: [], routines: undefined }) }), /Nenhum modo ainda/);
  const blocked = render({ module: 'Modes.jsx', props: modesProps({ blocked: true, reason: 'Sem conexão com o painel.' }) });
  assert.match(blocked, /disabled="" aria-disabled="true"[^>]*>.*?Rodar/s);
  assert.match(blocked, /Sem conexão com o painel\./);
});

test('formulário do modo: aparelhos do cadastro real, "não mexer" por padrão, brilho/cor só ao ligar luz, ar com temperatura e ventilação', opts, () => {
  const t = setupRoute({});
  const { ModeForm } = t.load(t.src('routes/Central/Modes.jsx'));
  const targets = [{ id: 'quarto-luz', name: 'Luz do quarto', kind: 'light' }, { id: 'ar-quarto', name: 'Ar do quarto', kind: 'ac' }];
  const blank = t.renderBare(t.h(ModeForm, { initial: null, targets, busy: false, onSave() {} }));
  assert.match(blank, /<legend class="cap">Luz do quarto<\/legend>/);
  assert.match(blank, /<legend class="cap">Ar do quarto<\/legend>/);
  assert.equal(count(blank, /aria-checked="true"[^>]*>Não mexer</g), 2);
  assert.ok(!/Brilho de|Temperatura \(°C\)/.test(blank));
  const edit = t.renderBare(t.h(ModeForm, { initial: { id: 'noite', name: 'Boa noite', icon: 'moon', steps: { 'quarto-luz': { power: true, brightness: 40, colorHex: '#FFD9A0' }, 'ar-quarto': { power: true, temperature: 22, mode: 'cool', fan: 'auto', keepIfOn: true } } }, targets, busy: false, onSave() {} }));
  assert.match(edit, /value="Boa noite"/);
  assert.match(edit, /aria-label="Brilho de Luz do quarto"/);
  assert.match(edit, /aria-label="Cor de Luz do quarto"/);
  assert.match(edit, /Temperatura \(°C\)/);
  assert.match(edit, /Manter como está se o ar já estiver ligado/);
  assert.match(t.renderBare(t.h(ModeForm, { initial: null, targets: [], busy: false, onSave() {} })), /não listou luzes nem ar/);
});

test('rotinas: linha do dia, pausada, ação e quando, timer do ar, histórico com falha, falha do agendador; remover só confirma depois do toque', opts, () => {
  const html = render({ module: 'Routines.jsx', props: { poll: ok(ROUT), modes: MODES, places: LOC.places, people: LOC.people, climate: true, blocked: false, reason: null } });
  assert.match(html, /role="img" aria-label="Rotinas por horário: 06:30 Acordar \(pausada\), 23:00 Boa noite"/);
  assert.match(html, /Acordar \(pausada\)/);
  assert.match(html, /Modo Boa noite · todo dia · próxima/);
  assert.match(html, /Desligar o ar · Seg Ter/);
  assert.match(html, /Ana sair de Casa/);
  assert.equal(count(html, />(30 min|1 h|2 h|4 h)</g), 4);
  assert.match(html, /Nenhum timer ligado\./);
  assert.match(html, /Últimas execuções/);
  assert.match(html, /Falhou · Acordar · ar sem resposta/);
  assert.ok(!/Remover mesmo/.test(html));
  assert.match(html, /aria-label="Pausar Boa noite"/);
  assert.match(html, /aria-label="Ativar Acordar"/);
  assert.ok(!html.includes('ov-box'));
  const failing = render({ module: 'Routines.jsx', props: { poll: ok({ ...ROUT, lastError: 'sem rede', lastErrorAt: now() - 120, timers: [{ at: now() + 1800 }] }), modes: MODES, places: [], people: [], climate: true } });
  assert.match(failing, /Falha do agendador[\s\S]*sem rede/);
  assert.match(failing, /Desliga hoje|Desliga amanhã|Desliga /);
  assert.match(failing, />Cancelar timer</);
  assert.match(render({ module: 'Routines.jsx', props: { poll: ok(ROUT), modes: MODES, places: [], people: [], climate: false } }), /O servidor não listou o ar\./);
  assert.match(render({ module: 'Routines.jsx', props: { poll: ok({ routines: [], timers: [], log: [] }), modes: [], places: [], people: [], climate: true } }), /Nenhuma rotina ainda/);
});

test('formulário da rotina: horário ou lugar, faixa opcional, ações avulsas existentes, dias; sem lugares cadastrados orienta', opts, () => {
  const t = setupRoute({});
  const { RoutineForm } = t.load(t.src('routes/Central/Routines.jsx'));
  const props = { initial: null, modes: MODES, places: LOC.places, people: LOC.people, onSave() {} };
  const time = t.renderBare(t.h(RoutineForm, props));
  assert.match(time, /role="radiogroup" aria-label="Quando"/);
  assert.match(time, /type="time" value="07:00"/);
  assert.match(time, /<optgroup label="Modos">/);
  assert.match(time, /<optgroup label="Ações avulsas">/);
  assert.equal(count(time, /class="chip" aria-pressed/g), 7, 'sete dias');
  assert.equal(count(time, /aria-pressed="true"/g), 5, 'seg a sex por padrão');
  const place = t.renderBare(t.h(RoutineForm, { ...props, initial: { id: 'r3', name: 'Saindo', trigger: 'place', place: 'casa', event: 'saiu', person: 'p1', between: ['17:00', '21:00'], days: [0], enabled: true, action: { type: 'scene', id: 'noite' } } }));
  assert.match(place, /Qualquer pessoa/);
  assert.match(place, /Só numa faixa de horário/);
  assert.match(place, /value="17:00"/);
  assert.match(t.renderBare(t.h(RoutineForm, { ...props, initial: { id: 'r3', name: 'X', trigger: 'place', place: '', event: 'saiu', days: [0], enabled: true, action: { type: 'scene', id: 'a' } }, places: [], people: [] })), /Cadastre lugares/);
  const kept = t.renderBare(t.h(RoutineForm, { ...props, initial: { id: 'r4', name: 'Custom', trigger: 'time', time: '08:00', days: [0], enabled: true, action: { type: 'device', device: 'ar-quarto', values: { power: true, temperature: 19 } } } }));
  assert.match(kept, /Ação atual \(mantida\)/);
});

test('energia: sempre estimada (simulada na prévia), custo/horas/kWh, semana acessível, ajuste só por botão e sem medidor fictício', opts, () => {
  const html = render({ module: 'Energy.jsx', props: {} });
  assert.match(html, /class="cf est"[^>]*>.*?Estimado/);
  assert.match(html, /R\$\s?1,50/);
  assert.match(html, /2 h · 1,8 kWh/);
  assert.match(html, /role="img" aria-label="Horas ligado nos últimos 7 dias: 2026-10-30 1 h, 2026-10-31 3 h"/);
  assert.match(html, /Ar ligado desde/);
  assert.match(html, /900 W · R\$\s?0,95\/kWh/);
  assert.match(html, /Não há medidor de energia/);
  assert.match(html, /aria-expanded="false"[^>]*>Ajustar/);
  assert.ok(!/Potência média \(W\)/.test(html));
  assert.match(render({ module: 'Energy.jsx', props: {}, home: HOME(DEVICES(), { mode: 'preview' }) }), /class="cf sim"[^>]*>.*?Simulado/);
  assert.match(render({ module: 'Energy.jsx', props: {}, polls: { '/api/energy': ok(null, { error: new Error('Falha (500).') }) } }), /Não consegui ler o gasto: Falha \(500\)\./);
});

test('atalhos: fechado não mostra chave nem instruções; segredo nunca no HTML inicial; sem conexão não troca', opts, () => {
  const html = render({ module: 'Shortcuts.jsx', props: { modes: MODES, subscribe: 'pc.ts.net:10000', blocked: false, reason: null } });
  assert.match(html, /aria-expanded="false"[^>]*>.*?Configurar/s);
  assert.doesNotMatch(html, /Obter conteúdo de URL|Bearer|Mostrar chave|api\/scenes/);
});

test('som: opcional e desligado por padrão, vale só neste aparelho', opts, () => {
  const html = render({ module: 'SoundCard.jsx', props: {} });
  assert.match(html, /aria-checked="false"[^>]*aria-label="Som das teclas"|aria-label="Som das teclas"[^>]*aria-checked="false"/);
  assert.match(html, /Desligado por padrão\. Vale só neste aparelho\./);
});

test('sem conexão com o painel: aviso global e todas as ações de escrita bloqueadas com o motivo; leitura continua', opts, () => {
  const html = render({ stateError: new Error('x') });
  assert.match(html, /Sem conexão com o PC de casa/);
  assert.match(html, /As alterações ficam bloqueadas/);
  assert.match(html, /Sem conexão com o painel\./);
  assert.match(html, /DNS<\/b>/, 'a saúde segue legível');
  assert.equal(count(html, /role="switch"[^>]*disabled=""/g) >= 4, true);
});
