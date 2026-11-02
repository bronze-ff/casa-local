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
  const actions = { useAction: () => [async (path, body, ok) => { calls.push([path, JSON.parse(JSON.stringify(body)), ok]); return {}; }, false] };
  const overlay = { Overlay: ({ open, children }) => (open ? children : null) };
  const tree = createTree({ stubs: { 'core/hooks.js': hooks, 'ui/actions.js': actions, 'ui/Overlay.jsx': overlay } });
  return { tree, calls, load: (file) => tree.load(src(file)).default };
}
const ROUTINES = { data: { timers: [{ device: 'ar-quarto', at: Math.floor(Date.now() / 1000) + 1800 }], lastError: null }, reload() {} };
const last = (calls) => calls[calls.length - 1];

test('Clima: ± anda para a temperatura APRENDIDA vizinha (não ±1), liga/desliga e Turbo calibrado', { skip }, async () => {
  const e = env({ polls: { '/api/routines': ROUTINES } });
  const app = e.tree.mount(e.load('routes/Clima/Clima.jsx'));
  await app.click('Aumentar temperatura');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/ar-quarto/commands', { action: 'set', values: { temperature: 30 } }], '24 → 30: o próximo valor com sinal');
  await app.click('Diminuir temperatura');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/ar-quarto/commands', { action: 'set', values: { temperature: 20 } }]);
  await app.click('Desligar o ar');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/ar-quarto/commands', { action: 'set', values: { power: false } }]);
  assert.equal(e.calls.length, 3, 'um POST por toque');
  await app.click('Funções extras');
  await app.click('Turbo ligadoEstimado');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/ar-quarto/commands', { action: 'set', values: { turbo: false } }]);
  await app.click('EcoAlterna no aparelho');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/ar-quarto/commands', { action: 'key', key: 'eco' }]);
});

test('Clima: trocar o modo cai na ventilação e na temperatura aprendidas mais próximas (heat → baixa, 21 °C) numa única chamada', { skip }, async () => {
  const e = env();
  const app = e.tree.mount(e.load('routes/Clima/Clima.jsx'));
  await app.click('Calor');
  assert.equal(e.calls.length, 1);
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/ar-quarto/commands', { action: 'set', values: { mode: 'heat', fan: 'low', temperature: 21 } }]);
  assert.ok(app.isDisabled('Seco'), 'modo sem sinal aprendido não é clicável');
});

test('Clima: timer — programar 30 min e cancelar, com o corpo e a rota exatos', { skip }, async () => {
  const none = env({ polls: { '/api/routines': { data: { timers: [], lastError: null }, reload() {} } } });
  const a = none.tree.mount(none.load('routes/Clima/Clima.jsx'));
  await a.click('Timer');
  await a.click('30 min');
  assert.deepEqual(last(none.calls).slice(0, 2), ['/api/routines/timer', { device: 'ar-quarto', minutes: 30 }]);
  const set = env({ polls: { '/api/routines': ROUTINES } });
  const b = set.tree.mount(set.load('routes/Clima/Clima.jsx'));
  await b.click(b.text().match(/Desliga às \d{2}:\d{2}/)[0]); // o botão do timer mostra a hora programada
  await b.click('Cancelar timer');
  assert.deepEqual(last(set.calls).slice(0, 2), ['/api/routines/timer', { device: 'ar-quarto', minutes: 0 }]);
  assert.equal(set.calls.length, 1);
});

test('Clima: Aprender — avisa os 25 s, grava o estado, regrava o desligar e grava um extra; nada é enviado antes do toque em Gravar', { skip }, async () => {
  const e = env({ polls: { '/api/routines': ROUTINES } });
  const app = e.tree.mount(e.load('routes/Clima/Clima.jsx'));
  await app.click('Aprender');
  assert.equal(e.calls.length, 0, 'entrar em Aprender não envia nada');
  assert.match(app.text(), /em até 25 s/);
  await app.click('Gravar ligar neste estado');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/ar-quarto/learn', { state: { power: true, temperature: 24, mode: 'cool', fan: 'auto' } }]);
  assert.match(app.text(), /Saia de Aprender e teste olhando o aparelho/);
  await app.click('Regravar desligar');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/ar-quarto/learn', { key: 'off' }]);
  await app.click('Funções extras');
  await app.click('BrisaGravar');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/ar-quarto/learn', { key: 'brisa' }]);
  assert.equal(e.calls.length, 3);
});

test('Luzes: cor emite só a cor (luz acesa); brilho só muda o rascunho até Aplicar; modo roda a cena; trocar de lâmpada e branco quente liga', { skip }, async () => {
  const e = env();
  const app = e.tree.mount(e.load('routes/Luzes/Luzes.jsx'));
  await app.click('Vermelho');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/quarto-luz/commands', { action: 'set', values: { colorHex: '#FF3B30' } }]);
  const before = e.calls.length;
  await app.click('Diminuir brilho');
  assert.equal(e.calls.length, before, 'ajustar o rascunho não envia');
  await app.click('Aplicar 75%');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/quarto-luz/commands', { action: 'set', values: { brightness: 75 } }]);
  await app.click('Noite');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/scenes/noite/run', {}]);
  await app.click('Banheiro · apagada');
  await app.click('Branco quente');
  assert.deepEqual(last(e.calls).slice(0, 2), ['/api/devices/banheiro-luz/commands', { action: 'set', values: { colorHex: '#FFD6A0', power: true } }], 'luz apagada + "ligar ao escolher cor" = acende');
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
