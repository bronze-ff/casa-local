import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { available } from '../../ui/harness.mjs';
import { createTree } from '../tree.mjs';
import { supportedState, temperatures } from './coverage.js';

// Portagem do que o Clima/check.cjs legado provava ALÉM do render estático: o COMANDO que cada botão emite (rota e corpo exatos),
// com os componentes novos. Árvore com hooks substituídos (routes/tree.mjs), `run` falso que só anota. Nada de rede, nada de navegador.
const skip = available ? false : 'React/esbuild indisponíveis (defina CASA_WEB_ROOT)';
const src = (file) => fileURLToPath(new URL(`../../${file}`, import.meta.url));
const ir = { coverage: { cool: { auto: [17, 20, 24, 30], high: [22, 26] }, heat: { low: [18, 21] }, auto: { auto: [17, 30] } }, templess: ['auto/auto'], off: true, turbo: true, extras: { eco: true }, origins: { 'aprendido neste controle': 4 }, calibrated: true };
const device = (id, state, extra = {}) => ({ id, name: id, roomId: id.startsWith('banheiro') ? 'banheiro' : 'quarto', kind: id.startsWith('ar') ? 'climate' : 'light', physicalId: `p-${id}`, configured: true, connection: 'online', confidence: 'reported', updatedAt: Date.now() - 5000, state, ...extra });
const AC = device('ar-quarto', { power: true, mode: 'cool', fan: 'auto', temperature: 24, turbo: true }, { confidence: 'estimated', irClimate: ir });
const LIGHTS = [device('quarto-luz', { power: true, brightness: 80, colorHex: '#FFD6A0' }), device('banheiro-luz', { power: false, brightness: 100, colorHex: '#FFFFFF' })];
const HOME = (extra = {}) => ({ mode: 'local', devices: [...LIGHTS, AC], scenes: [{ id: 'noite', name: 'Noite', devices: ['quarto-luz'] }], stateVersion: { epoch: 'A', revision: 1 }, ...extra });

function env({ home = HOME(), polls = {} } = {}) {
  const calls = [];
  const idle = { data: null, error: null, stale: false, at: 0, reload() {} };
  const hooks = { useHome: () => ({ home, homeAt: Date.now(), stateError: null, bootError: null, commands: {} }), usePoll: (path) => polls[path] || idle, useCommand: () => null };
  const runHook = { fn: async (path, body, ok) => { calls.push([path, JSON.parse(JSON.stringify(body)), ok]); return {}; } };
  const actions = { useAction: () => [(...args) => runHook.fn(...args), false] };
  const overlay = { Overlay: ({ open, children }) => (open ? children : null) };
  const tree = createTree({ stubs: { 'core/hooks.js': hooks, 'ui/actions.js': actions, 'ui/Overlay.jsx': overlay } });
  return { tree, calls, runHook, load: (file) => tree.load(src(file)).default };
}
const ROUTINES = { data: { timers: [{ device: 'ar-quarto', at: Math.floor(Date.now() / 1000) + 1800 }], lastError: null }, reload() {} };
const CMD = '/api/devices/ar-quarto/commands';

/** Um toque = EXATAMENTE `posts` chamadas novas (legado: um envio por toque). Devolve as chamadas daquele toque como [rota, corpo]. */
async function tap(e, app, label, posts = 1) {
  const before = e.calls.length;
  await app.click(label);
  const delta = e.calls.slice(before).map(([path, body]) => [path, body]);
  assert.equal(delta.length, posts, `"${label}": esperado ${posts} POST(s) neste toque, houve ${delta.length}: ${JSON.stringify(delta)}`);
  return delta;
}
/** Toque que NÃO pode enviar nada (rascunho, abrir painel, entrar em Aprender, trocar de seleção). */
const quiet = (e, app, label) => tap(e, app, label, 0);
/** Um toque, uma chamada, esta rota e este corpo. */
async function sends(e, app, label, path, body) {
  const delta = await tap(e, app, label);
  assert.deepEqual(delta, [[path, body]], `"${label}": rota e corpo`);
}

test('Clima: ± anda para a temperatura APRENDIDA vizinha (não ±1), liga/desliga e extras — UM POST por toque, rota e corpo exatos', { skip }, async () => {
  const e = env({ polls: { '/api/routines': ROUTINES } });
  const app = e.tree.mount(e.load('routes/Clima/Clima.jsx'));
  await sends(e, app, 'Aumentar temperatura', CMD, { action: 'set', values: { temperature: 30 } }); // 24 → 30: o próximo valor com sinal
  await sends(e, app, 'Diminuir temperatura', CMD, { action: 'set', values: { temperature: 20 } });
  await sends(e, app, 'Desligar o ar', CMD, { action: 'set', values: { power: false } });
  await quiet(e, app, 'Funções extras'); // abrir o painel não envia
  await sends(e, app, 'Turbo ligadoEstimado', CMD, { action: 'set', values: { turbo: false } });
  await sends(e, app, 'EcoAlterna no aparelho', CMD, { action: 'key', key: 'eco' });
  assert.equal(e.calls.length, 5, 'cinco toques de comando, cinco POSTs, nenhum a mais');
});

test('Clima: trocar o modo cai na ventilação e na temperatura aprendidas mais próximas (heat → baixa, 21 °C) numa única chamada', { skip }, async () => {
  const e = env();
  const app = e.tree.mount(e.load('routes/Clima/Clima.jsx'));
  await sends(e, app, 'Calor', CMD, { action: 'set', values: { mode: 'heat', fan: 'low', temperature: 21 } });
  assert.ok(app.isDisabled('Seco'), 'modo sem sinal aprendido não é clicável');
});

test('Clima: timer — abrir não envia; programar 30 min e cancelar enviam UM POST cada, com rota e corpo exatos', { skip }, async () => {
  const none = env({ polls: { '/api/routines': { data: { timers: [], lastError: null }, reload() {} } } });
  const a = none.tree.mount(none.load('routes/Clima/Clima.jsx'));
  await quiet(none, a, 'Timer');
  await sends(none, a, '30 min', '/api/routines/timer', { device: 'ar-quarto', minutes: 30 });
  const set = env({ polls: { '/api/routines': ROUTINES } });
  const b = set.tree.mount(set.load('routes/Clima/Clima.jsx'));
  await quiet(set, b, b.text().match(/Desliga às \d{2}:\d{2}/)[0]); // o botão do timer mostra a hora programada; só abre o painel
  await sends(set, b, 'Cancelar timer', '/api/routines/timer', { device: 'ar-quarto', minutes: 0 });
});

test('Clima: Aprender — entrar e abrir extras não enviam; Gravar estado, Regravar desligar e extra Brisa enviam UM POST cada', { skip }, async () => {
  const e = env({ polls: { '/api/routines': ROUTINES } });
  const app = e.tree.mount(e.load('routes/Clima/Clima.jsx'));
  await quiet(e, app, 'Aprender');
  assert.match(app.text(), /em até 25 s/);
  await sends(e, app, 'Gravar ligar neste estado', '/api/devices/ar-quarto/learn', { state: { power: true, temperature: 24, mode: 'cool', fan: 'auto' } });
  assert.match(app.text(), /Saia de Aprender e teste olhando o aparelho/);
  await sends(e, app, 'Regravar desligar', '/api/devices/ar-quarto/learn', { key: 'off' });
  await quiet(e, app, 'Funções extras');
  await sends(e, app, 'BrisaGravar', '/api/devices/ar-quarto/learn', { key: 'brisa' });
  assert.equal(e.calls.length, 3);
});

test('Luzes: cor, Aplicar, cena e branco quente enviam UM POST cada; ajustar o rascunho e trocar de lâmpada não enviam', { skip }, async () => {
  const e = env();
  const app = e.tree.mount(e.load('routes/Luzes/Luzes.jsx'));
  await sends(e, app, 'Vermelho', '/api/devices/quarto-luz/commands', { action: 'set', values: { colorHex: '#FF3B30' } });
  await quiet(e, app, 'Diminuir brilho'); // só o rascunho
  await sends(e, app, 'Aplicar 75%', '/api/devices/quarto-luz/commands', { action: 'set', values: { brightness: 75 } });
  await sends(e, app, 'Noite', '/api/scenes/noite/run', {});
  await quiet(e, app, 'Banheiro · apagada'); // trocar a seleção não envia
  await sends(e, app, 'Branco quente', '/api/devices/banheiro-luz/commands', { action: 'set', values: { colorHex: '#FFD6A0', power: true } }); // luz apagada + "ligar ao escolher cor" = acende
  assert.equal(e.calls.length, 4);
});

test('bloqueios: botão desabilitado não emite (sem conexão com o ar, prévia sem aprender); a árvore recusa o clique', { skip }, async () => {
  const offline = env({ home: HOME({ devices: [...LIGHTS, { ...AC, connection: 'offline' }] }) });
  const app = offline.tree.mount(offline.load('routes/Clima/Clima.jsx'));
  await assert.rejects(app.click('Desligar o ar'), /desabilitado/);
  assert.equal(offline.calls.length, 0);
  const preview = env({ home: HOME({ mode: 'preview' }) });
  const p = preview.tree.mount(preview.load('routes/Clima/Clima.jsx'));
  await assert.rejects(p.click('Aprender'), /desabilitado/);
  assert.equal(preview.calls.length, 0);
});

test('o contador de POST por toque FALHA quando um toque envia duas vezes (guarda contra a mutação "onKey chamado 2x")', { skip }, async () => {
  const doubled = env({ polls: { '/api/routines': ROUTINES } });
  const realRun = doubled.runHook.fn;
  doubled.runHook.fn = async (path, body, ok) => { const result = await realRun(path, body, ok); if (body?.key === 'eco' || body?.values?.turbo === false) await realRun(path, body, ok); return result; };
  const app = doubled.tree.mount(doubled.load('routes/Clima/Clima.jsx'));
  await quiet(doubled, app, 'Funções extras');
  await assert.rejects(sends(doubled, app, 'EcoAlterna no aparelho', CMD, { action: 'key', key: 'eco' }), /esperado 1 POST\(s\).*houve 2/);
  await assert.rejects(sends(doubled, app, 'Turbo ligadoEstimado', CMD, { action: 'set', values: { turbo: false } }), /esperado 1 POST\(s\).*houve 2/);
});

test('cobertura (a fixture EXATA do check.cjs legado): faixas esparsas, ventilação de reserva, temperatura mais próxima, modo ausente e limites', () => {
  const legacy = { coverage: { cool: { auto: [17, 20, 24, 30], high: [22, 26] }, heat: { low: [18, 21] }, auto: { auto: [17, 30] } }, templess: ['auto/auto'], off: 'aprendido', extras: { eco: 'aprendido' }, turbo: true };
  assert.deepEqual(temperatures(legacy, 'cool', 'auto'), [17, 20, 24, 30]);
  assert.equal(temperatures(legacy, 'dry', 'auto').length, 0);
  assert.equal(temperatures(undefined, 'cool', 'auto').length, 14);
  assert.equal(supportedState(legacy, 'dry', 'auto', 24), null);
  const fallback = supportedState(legacy, 'heat', 'high', 24);
  assert.deepEqual([fallback.fan, fallback.temperature], ['low', 21]);
  assert.equal(supportedState(legacy, 'cool', 'high', 24).temperature, 22);
  assert.deepEqual(temperatures({ coverage: { cool: { auto: [16, 17, 30, 31, 24.5] } } }, 'cool', 'auto'), [17, 30]);
});
