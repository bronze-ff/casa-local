import assert from 'node:assert/strict';
import test from 'node:test';
import { SINGLE, actionKey, actionLabel, actionOf, buildSteps, dayMarks, energyInput, fmtUptime, iconFor, initialSteps, modeProblems, modeTargets, moveIds, placeText, routineBody, routineProblems, routinesUsing, sceneUrl, shortcutBase, summaryOf, toggleBody, whenText } from './central.js';
import { applySound } from './sound.js';

// Lógica pura da Central (resumo, rotinas, modos, energia, atalhos, som). Sem rede, sem navegador.
const routine = (over = {}) => ({ id: 'r1', name: 'Boa noite', trigger: 'time', time: '23:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true, action: { type: 'scene', id: 'noite' }, ...over });

test('resumo: só o que o servidor devolveu; sem dados não inventa número', () => {
  assert.deepEqual(summaryOf(null, undefined), []);
  assert.deepEqual(summaryOf(null, [{}, {}]), [['Modos', '2']]);
  const full = summaryOf({ state: 'warn', checks: [{ state: 'ok' }, { state: 'fail' }], machine: { memory: { used: 40 }, disk: { freeGb: 80 } } }, []);
  assert.deepEqual(full.map(([k]) => k), ['Sistema', 'Avisos', 'Memória', 'Disco livre', 'Modos']);
  assert.equal(full.find(([k]) => k === 'Avisos')[1], '1');
  assert.equal(summaryOf({ state: 'ok', checks: [] }, undefined).some(([k]) => k === 'Memória'), false);
  assert.equal(fmtUptime(null), '—');
  assert.equal(fmtUptime(90061), '1 d 1 h');
  assert.equal(fmtUptime(3700), '1 h 1 min');
});

test('linha do dia: só horário válido, ordenada, % do dia; lugar e horário quebrado ficam de fora', () => {
  const marks = dayMarks([routine(), routine({ id: 'r2', time: '06:30', name: 'Acordar' }), routine({ id: 'r3', trigger: 'place', time: undefined }), routine({ id: 'r4', time: 'quebrado' })]);
  assert.deepEqual(marks.map((m) => m.id), ['r2', 'r1']);
  assert.equal(marks[0].pct, 27.1);
  assert.equal(marks[1].pct, 95.8);
});

test('ações da rotina: modo, avulsa conhecida e "atual" preservada; apagado vira texto honesto', () => {
  assert.equal(actionKey({ type: 'scene', id: 'x' }), 'modo:x');
  assert.equal(actionKey(SINGLE[0][2]), 'ar-off');
  assert.equal(actionKey({ type: 'device', device: 'ar-quarto', values: { power: true, temperature: 19 } }), 'atual');
  assert.equal(actionLabel({ type: 'scene', id: 'gone' }, []), 'Modo (apagado)');
  assert.equal(actionLabel({ type: 'device', device: 'z', values: {} }, []), 'Ação personalizada');
  assert.deepEqual(actionOf('modo:noite'), { type: 'scene', id: 'noite' });
  assert.deepEqual(actionOf('ar-off'), SINGLE[0][2]);
  const custom = { action: { type: 'device', device: 'ar-quarto', values: { power: true, temperature: 19 } } };
  assert.equal(actionOf('atual', custom), custom.action);
  assert.equal(actionOf('inexistente'), undefined);
});

test('formulário de rotina: valida horário, lugar, faixa e dias; o corpo não leva campos só de leitura', () => {
  const ok = { name: 'A', days: [1], trigger: 'time', time: '07:00', action: { type: 'scene', id: 'a' } };
  assert.deepEqual(routineProblems(ok), []);
  assert.equal(routineProblems({ ...ok, name: '  ' }).length, 1);
  assert.equal(routineProblems({ ...ok, days: [] }).length, 1);
  assert.equal(routineProblems({ ...ok, time: '7:00' }).length, 1);
  assert.equal(routineProblems({ ...ok, action: undefined }).length, 1);
  const place = { ...ok, trigger: 'place', place: 'casa', between: ['17:00', '17:00'] };
  assert.match(routineProblems(place).join(' '), /início e fim diferentes/);
  assert.equal(routineProblems({ ...place, place: '' }).some((p) => /lugar/.test(p)), true);
  assert.deepEqual(routineProblems({ ...place, between: ['17:00', '21:00'] }), []);
  assert.deepEqual(routineBody({ ...ok, name: ' A ' }, null), { name: 'A', days: [1], action: ok.action, trigger: 'time', time: '07:00' });
  assert.deepEqual(routineBody({ ...place, between: null, event: 'saiu', person: '' }, { id: 'r9', enabled: false }), { id: 'r9', enabled: false, name: 'A', days: [1], action: ok.action, trigger: 'place', place: 'casa', event: 'saiu', between: null, person: null });
  const toggled = toggleBody({ ...routine(), next: 999 });
  assert.equal(toggled.enabled, false);
  assert.ok(!('next' in toggled), 'o backend recusa campos que não conhece');
  assert.match(placeText({ place: 'casa', event: 'chegou', person: 'p1', between: ['17:00', '21:00'] }, [{ id: 'casa', name: 'Casa' }], [{ id: 'p1', name: 'Ana' }]), /Ana chegar em Casa \(17:00–21:00\)/);
  assert.match(placeText({ place: 'x', event: 'saiu' }, [], []), /alguém sair de lugar apagado/);
});

test('modos: alvos do cadastro real, etapas, validação e ordem', () => {
  const devices = [{ id: 'quarto-luz', name: 'Luz do quarto', kind: 'light' }, { id: 'ar-quarto', name: 'Ar', kind: 'climate' }, { id: 'tv-quarto', name: 'TV', kind: 'tv' }];
  const targets = modeTargets(devices);
  assert.deepEqual(targets.map((t) => [t.id, t.kind]), [['quarto-luz', 'light'], ['ar-quarto', 'ac']]);
  assert.deepEqual(modeTargets(undefined), []);
  const steps = initialSteps(targets, { 'quarto-luz': { power: true, brightness: 80, colorHex: '#FFAA00' }, 'ar-quarto': { power: false } });
  assert.equal(steps['quarto-luz'].kind, 'on');
  assert.equal(steps['quarto-luz'].colorHex, '#ffaa00');
  assert.equal(steps['ar-quarto'].kind, 'off');
  assert.equal(initialSteps(targets)['quarto-luz'].kind, 'skip');
  const built = buildSteps(targets, { 'quarto-luz': { ...steps['quarto-luz'] }, 'ar-quarto': { ...steps['ar-quarto'] } });
  assert.deepEqual(built, { 'quarto-luz': { power: true, brightness: 80, colorHex: '#FFAA00' }, 'ar-quarto': { power: false } });
  const ac = buildSteps(targets, { 'ar-quarto': { kind: 'on', temperature: '22', mode: 'cool', fan: 'auto', keepIfOn: true } });
  assert.deepEqual(ac, { 'ar-quarto': { power: true, temperature: 22, mode: 'cool', fan: 'auto', keepIfOn: true } });
  assert.deepEqual(buildSteps(targets, initialSteps(targets)), {}, 'tudo "não mexer" = sem etapas');
  assert.equal(modeProblems('', {}).length, 2);
  assert.deepEqual(modeProblems('Filme', built), []);
  assert.match(modeProblems('Filme', { a: { power: true, temperature: 40 } }).join(' '), /17 a 30/);
  assert.equal(iconFor('inexistente'), 'home');
  assert.equal(iconFor('moon'), 'moon');
  assert.deepEqual(routinesUsing('noite', [routine(), routine({ id: 'r2', action: { type: 'device' } })]).map((r) => r.id), ['r1']);
  assert.deepEqual(routinesUsing('x', undefined), []);
  assert.deepEqual(moveIds(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(moveIds(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c'], 'fora dos limites não muda');
  assert.deepEqual(moveIds(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']);
});

test('energia: mesmos limites do backend (100–5000 W, R$ 0,10–5,00); vírgula decimal aceita', () => {
  assert.deepEqual(energyInput('900', '0,95'), { body: { watts: 900, tariff: 0.95 } });
  assert.deepEqual(energyInput('1200.5', '1.2'), { body: { watts: 1200.5, tariff: 1.2 } });
  for (const [w, t] of [['99', '1'], ['5001', '1'], ['', '1'], ['abc', '1'], ['900', '0,05'], ['900', '5,01'], ['900', ''], ['900', 'x']]) assert.ok(energyInput(w, t).problem, `${w}/${t}`);
});

test('atalhos: base pelo Tailscale (sem a porta do ntfy) ou endereço atual; URL do modo', () => {
  assert.equal(shortcutBase('pc.ts.net:10000', 'http://casa'), 'pc.ts.net');
  assert.equal(shortcutBase(undefined, 'http://casa'), 'http://casa');
  assert.equal(sceneUrl('pc.ts.net', 'noite'), 'pc.ts.net/api/scenes/noite/run');
});

test('quando: hoje, amanhã e dia da semana', () => {
  const now = new Date('2026-11-02T10:00:00');
  assert.match(whenText(new Date('2026-11-02T23:00:00').getTime() / 1000, now), /^hoje /);
  assert.match(whenText(new Date('2026-11-03T07:00:00').getTime() / 1000, now), /^amanhã /);
  assert.doesNotMatch(whenText(new Date('2026-11-09T07:00:00').getTime() / 1000, now), /^(hoje|amanhã)/);
});

test('som: um único ouvinte, liga e desliga pela preferência; sem documento não faz nada', () => {
  const log = [];
  const doc = { addEventListener: (...a) => log.push(['add', a[0]]), removeEventListener: (...a) => log.push(['remove', a[0]]) };
  assert.equal(applySound(true, null), false);
  assert.equal(applySound(true, doc), true);
  assert.equal(applySound(true, doc), true);
  assert.equal(applySound(false, doc), false);
  assert.equal(applySound(false, doc), false);
  assert.deepEqual(log, [['add', 'click'], ['remove', 'click']]);
});
