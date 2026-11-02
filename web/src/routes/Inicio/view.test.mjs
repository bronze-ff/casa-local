import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from '../../core/store.js';
import { WIDE_CAMS, WIDE_PARALLEL, pickWide, runCycle } from './frames.js';
import { ambientOf, deviceView, gameText, greetingFor, meters, newestEvent, stepLabel, whereIs } from './view.js';

test('resumo do ambiente: só estado conhecido; IR aparece como estimado; sem aparelhos não inventa nada (cenário do overview.test legado)', () => {
  assert.deepEqual(ambientOf([]), []);
  const items = Object.fromEntries(ambientOf([
    { id: 'a', kind: 'light', state: { power: true }, confidence: 'reported' }, { id: 'b', kind: 'light', state: { power: false }, confidence: 'reported' },
    { id: 'c', kind: 'climate', state: { power: true, temperature: 24 }, confidence: 'estimated' }, { id: 'd', kind: 'tv', state: { power: null }, confidence: 'unknown', connection: 'offline' }]));
  assert.equal(items.Luzes, '1 de 2 acesas');
  assert.equal(items.Ar, '24° ligado · estimado');
  assert.equal(items.TV, 'sem leitura');
  assert.equal(items['Sem conexão'], '1');
  assert.equal(ambientOf([{ id: 'a', kind: 'light', state: { power: null } }])[0][1], 'sem leitura');
});

test('toggle do Início e das Luzes usam a MESMA reserva por físico (cenário do overview.test legado, na store nova)', async () => {
  const devices = [{ id: 'quarto-luz', physicalId: 'physical-1' }];
  let release; const posts = [];
  const store = createStore({ bootstrap: async () => ({ stateVersion: { epoch: 'A', revision: 1 }, devices }), get: async () => ({}), post: (path) => { posts.push(path); return new Promise((r) => { release = r; }); } });
  await store.bootstrap();
  const fromHome = store.run('/api/devices/quarto-luz/commands', { action: 'set', values: { power: true } });
  await assert.rejects(store.run('/api/devices/quarto-luz/commands', { action: 'set', values: { power: false } }), (e) => e.code === 'device_busy');
  assert.equal(posts.length, 1);
  release({ command: { status: 'sent' } });
  await fromHome;
});

test('métricas: zero continua zero; ausente vira traço; limites de alerta', () => {
  const zero = Object.fromEntries(meters({ cpu: 0, memory: { used: 0 }, gpu: { temp: 0 }, wslGb: 0 }).map((m) => [m.key, m.value]));
  assert.deepEqual(zero, { cpu: '0%', mem: '0%', gpu: '0°', wsl: '0 GB' });
  const none = Object.fromEntries(meters({}).map((m) => [m.key, m.value]));
  assert.deepEqual(none, { cpu: '—', mem: '—', gpu: '—', wsl: '—' });
  assert.equal(meters().every((m) => m.value === '—'), true);
  assert.equal(meters({ cpu: 95, wslGb: 5.5 }).filter((m) => m.warn).length, 2);
  assert.equal(meters({ wslGb: 4.25 })[3].value, '4,25 GB');
});

test('modo jogo: o passo do servidor vence; ação aceita não mistura com fim do processo', () => {
  assert.equal(gameText({ step: 'Parando a indexação…', mode: 'lab' }), 'Parando a indexação…');
  assert.match(gameText({ mode: 'jogo', reason: 'auto:Baldurs' }), /entrou sozinho com Baldurs/);
  assert.equal(gameText({ mode: 'lab', auto: true, games: ['A', 'B'] }), 'Desligado · liga sozinho ao abrir A, B');
  assert.equal(gameText({ mode: 'lab' }), 'Desligado');
});

test('aparelho: desconhecido e sem conexão nunca viram "desligado"; ar desligado mostra o último envio', () => {
  assert.deepEqual(deviceView({ kind: 'light', state: { power: null } }), { value: '—', known: false, off: true, sub: 'sem leitura' });
  assert.equal(deviceView({ kind: 'light', state: { power: false }, connection: 'offline' }).sub, 'sem conexão');
  assert.equal(deviceView({ kind: 'light', state: { power: true, brightness: 60 } }).value, '60%');
  assert.equal(deviceView({ kind: 'light', state: { power: false } }).value, 'apagada');
  assert.deepEqual(deviceView({ kind: 'climate', state: { power: false, temperature: 22, mode: 'cool' } }), { value: 'desligado', known: true, off: true, sub: 'último envio 22° · frio' });
  assert.equal(deviceView({ kind: 'climate', state: { power: true, temperature: 24, mode: 'cool' } }).value, '24°');
  assert.equal(deviceView({ kind: 'tv', state: { power: true }, brand: 'Samsung' }).sub, 'Samsung');
});

test('presença: sem posição, em lugar, fora dos lugares e posição antiga', () => {
  const places = [{ id: 'casa', name: 'Casa' }];
  const ago = () => 'há 4 min';
  assert.equal(whereIs({ name: 'A' }, places, ago), 'sem posição');
  assert.equal(whereIs({ last: { tst: 1 }, place: 'casa' }, places, ago), 'em Casa · há 4 min');
  assert.equal(whereIs({ last: { tst: 1 } }, places, ago), 'fora dos lugares · há 4 min');
  assert.equal(whereIs({ last: { tst: 1 }, place: 'casa', stale: true }, places, ago), 'em Casa · posição antiga');
});

test('último movimento, saudação e passo de modo em português', () => {
  assert.equal(newestEvent([]), null);
  assert.equal(newestEvent([{ id: 'a', start: 10 }, { id: 'b', start: 30 }, { id: 'c', start: 20 }]).id, 'b');
  assert.equal(greetingFor(new Date(2026, 10, 2, 3)), 'Boa madrugada');
  assert.equal(greetingFor(new Date(2026, 10, 2, 9)), 'Bom dia');
  assert.equal(greetingFor(new Date(2026, 10, 2, 15)), 'Boa tarde');
  assert.equal(greetingFor(new Date(2026, 10, 2, 21)), 'Boa noite');
  assert.equal(stepLabel({ status: 'skipped' }), 'Já estava como pedido');
  assert.equal(stepLabel({ status: 'failed' }), 'Falhou');
  assert.equal(stepLabel({ evidence: 'confirmed' }), 'Confirmado');
  assert.equal(stepLabel({ evidence: 'unconfirmed' }), 'Enviado · sem confirmação');
});

test('quadros da tela larga: no máximo 3 pedidos ao mesmo tempo, todos carregam, parar interrompe', async () => {
  let inflight = 0; let peak = 0; const loaded = [];
  const load = async (id) => { inflight += 1; peak = Math.max(peak, inflight); await new Promise((r) => setImmediate(r)); inflight -= 1; loaded.push(id); };
  const done = await runCycle({ ids: ['a', 'b', 'c', 'd'], load });
  assert.equal(done, 4);
  assert.equal(peak, WIDE_PARALLEL);
  let stop = false; const some = [];
  await runCycle({ ids: ['a', 'b', 'c', 'd', 'e'], parallel: 1, load: async (id) => { some.push(id); stop = true; }, stopped: () => stop });
  assert.deepEqual(some, ['a'], 'depois de parar, nenhum pedido novo sai');
  assert.equal(await runCycle({ ids: [], load }), 0);
});

test('tela larga mostra 4 câmeras e as com aviso ligado vêm primeiro', () => {
  const cams = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => ({ id }));
  assert.equal(pickWide(cams, []).length, WIDE_CAMS);
  assert.deepEqual(pickWide(cams, ['c5', 'c3']).map((c) => c.id).slice(0, 2).sort(), ['c3', 'c5']);
});
