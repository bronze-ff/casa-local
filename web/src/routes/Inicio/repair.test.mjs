import assert from 'node:assert/strict';
import test from 'node:test';
import { AR, HOME, LIGHT, TV, count, setupRoute, skip } from '../harness.mjs';
import { createFrameCycle, createFrameLoader } from './frames.js';
import { guarded } from '../guard.js';
import { emptyHistory, pushSample, sparkPoints, SAMPLES } from './history.js';
import { stepLabel } from './view.js';

// Reparos do Crivo no M3 (Início). Não alteram os testes anteriores.
const opts = { skip };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const flush = () => new Promise((r) => setImmediate(r));

// ---- P1: bloqueio geral por falta de conexão chega aos três botões E ao handler ----
test('P1: guarded() não chama a ação quando bloqueado e devolve null; desbloqueado chama', async () => {
  let calls = 0;
  const act = guarded(true, async () => { calls += 1; return 'ok'; });
  assert.equal(await act(), null);
  assert.equal(calls, 0);
  const free = guarded(false, async (x) => { calls += 1; return x; });
  assert.equal(await free('v'), 'v');
  assert.equal(calls, 1);
});

test('P1: sem conexão com o PC de casa, chave da luz, modos e jogo ficam desabilitados com motivo (o banner não promete em falso)', opts, () => {
  const home = HOME([LIGHT('quarto-luz', 'quarto-luz', { power: true, brightness: 60 }), AR({ power: false })], { scenes: [{ id: 'chegada', name: 'Chegada', icon: 'home' }] });
  const polls = { '/api/homelab': { data: { enabled: true, mode: 'lab', stats: {} }, reload() {} } };
  const t = setupRoute({ home, stateError: new Error('x'), polls });
  const html = t.render(t.load(t.src('routes/Inicio/Inicio.jsx')).default);
  assert.match(html, /Os comandos ficam bloqueados/);
  assert.match(html, /aria-label="Apagar quarto-luz"[^>]*disabled=""/, 'chave da luz');
  assert.match(html, /disabled=""[^>]*>[\s\S]*?Chegada/, 'modo');
  assert.match(html, /role="switch"[^>]*aria-label="Modo jogo"[^>]*disabled=""/, 'modo jogo');
  assert.ok(count(html, /Sem conexão com o painel\./g) >= 2, 'o motivo aparece para leitor de tela');
  const ok = setupRoute({ home, polls }); const okHtml = ok.render(ok.load(ok.src('routes/Inicio/Inicio.jsx')).default);
  assert.ok(!/aria-label="Apagar quarto-luz"[^>]*disabled=""/.test(okHtml), 'com conexão a chave funciona');
});

// ---- P1: evidência do passo do modo ----
test('P1: passo com evidência divergente ou de prévia NÃO vira "enviado"; falha operacional mantém a evidência ao lado', () => {
  assert.equal(stepLabel({ evidence: 'diverged' }), 'Divergente');
  assert.equal(stepLabel({ evidence: 'preview' }), 'Simulado');
  assert.equal(stepLabel({ evidence: 'confirmed' }), 'Confirmado');
  assert.equal(stepLabel({ evidence: 'unconfirmed' }), 'Enviado · sem confirmação');
  assert.equal(stepLabel({ status: 'failed', evidence: 'diverged' }), 'Falhou · divergente');
  assert.equal(stepLabel({ operation: 'failed', evidence: 'unconfirmed' }), 'Falhou');
  assert.equal(stepLabel({ status: 'failed', evidence: 'preview' }), 'Falhou · simulado');
  assert.equal(stepLabel({ status: 'skipped' }), 'Já estava como pedido');
  assert.equal(stepLabel({}), 'Enviado · sem confirmação');
});

// ---- P2: quadros da tela larga ----
const frames = ({ visible = () => true } = {}) => {
  const log = { urls: [], revoked: [], frames: {}, failed: [], fetches: [] };
  const gate = {};
  const fetchFn = (path) => { log.fetches.push(path); gate[path] = deferred(); return gate[path].promise; };
  const loader = createFrameLoader({ fetchFn, createURL: () => { const u = `blob:${log.urls.length}`; log.urls.push(u); return u; }, revokeURL: (u) => log.revoked.push(u), active: visible, onFrame: (id, frame) => { log.frames[id] = frame; }, onFail: (id) => log.failed.push(id), later: (fn) => fn() });
  const response = (age = 0) => ({ ok: true, headers: { get: () => String(age) }, blob: async () => ({}) });
  return { log, gate, loader, response };
};

test('P2: imagem que chega com a aba oculta é descartada: nenhuma URL criada, nada publicado', async () => {
  let visible = true;
  const t = frames({ visible: () => visible });
  const pending = t.loader.load('cam1');
  visible = false; // a aba some enquanto a imagem vinha
  t.gate['/api/cameras/cam1/frame.jpg'].resolve(t.response());
  await pending;
  assert.equal(t.log.urls.length, 0, 'não cria URL de imagem para aba oculta');
  assert.deepEqual(t.log.frames, {});
  assert.deepEqual(t.log.failed, [], 'descartar não é falha');
  const t2 = frames();
  const ok = t2.loader.load('cam2');
  t2.gate['/api/cameras/cam2/frame.jpg'].resolve(t2.response(3));
  await ok;
  assert.equal(t2.log.urls.length, 1);
  assert.ok(t2.log.frames.cam2.url);
  t2.loader.release();
  assert.deepEqual(t2.log.revoked, ['blob:0'], 'release libera todas as URLs');
});

test('P2: ocultar depois do 1º pedido impede o 4º de começar; nenhum timer enquanto oculto; reexibir retoma UM ciclo', async () => {
  let visible = true; const subs = new Set(); const timers = new Map(); let seq = 0; const started = [];
  const gates = {};
  const load = (id) => { started.push(id); gates[id] = deferred(); return gates[id].promise; };
  const cycle = createFrameCycle({ ids: ['c1', 'c2', 'c3', 'c4'], parallel: 3, every: 4000, load, isVisible: () => visible, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); }, setTimer: (fn) => { const id = ++seq; timers.set(id, fn); return id; }, clearTimer: (id) => timers.delete(id) });
  await flush();
  assert.deepEqual(started, ['c1', 'c2', 'c3'], 'só 3 por vez');
  visible = false; subs.forEach((fn) => fn());
  gates.c1.resolve(); await flush();
  assert.deepEqual(started, ['c1', 'c2', 'c3'], 'oculto: o 4º NÃO inicia');
  gates.c2.resolve(); gates.c3.resolve(); await flush(); await flush();
  assert.equal(timers.size, 0, 'oculto não agenda ciclo nenhum (sem loop de espera)');
  visible = true; subs.forEach((fn) => fn()); await flush();
  assert.deepEqual(started.slice(3), ['c1', 'c2', 'c3'], 'reexibir retoma um ciclo novo');
  cycle.stop();
  assert.equal(subs.size, 0, 'parar remove a assinatura de visibilidade');
});

// ---- P2: histórico real da tela larga ----
test('P2: histórico: só amostras reais, sem zero inventado; até 24; zero real é guardado; idade vem da última amostra', () => {
  let h = emptyHistory();
  h = pushSample(h, { cpu: 12, memory: { used: 40 }, gpu: { temp: 55 }, wslGb: null }, 1000);
  assert.deepEqual(h.cpu.map((s) => s.v), [12]);
  assert.deepEqual(h.wsl, [], 'ausente não vira zero');
  h = pushSample(h, { cpu: 0, memory: { used: 41 } }, 1004);
  assert.deepEqual(h.cpu.map((s) => s.v), [12, 0], 'zero REAL é amostra');
  assert.deepEqual(h.gpu.map((s) => s.v), [55], 'sem leitura nova de GPU não repete a antiga');
  for (let i = 0; i < 40; i += 1) h = pushSample(h, { cpu: i }, 2000 + i);
  assert.equal(h.cpu.length, SAMPLES);
  assert.equal(h.cpu.at(-1).v, 39);
  assert.equal(h.cpu.at(-1).at, 2039);
  assert.equal(pushSample(h, undefined, 5), h, 'sem stats não muda nada');
});

test('P2: sparkline só com 2 ou mais amostras reais; cresce com o valor, nunca desenha dado inventado', () => {
  assert.equal(sparkPoints([]), '');
  assert.equal(sparkPoints([{ v: 5, at: 1 }]), '');
  const points = sparkPoints([{ v: 0, at: 1 }, { v: 50, at: 2 }, { v: 100, at: 3 }], { w: 100, h: 20, hi: 100 }).split(' ').map((p) => p.split(',').map(Number));
  assert.equal(points.length, 3);
  assert.deepEqual(points[0], [0, 20]);
  assert.deepEqual(points[2], [100, 0]);
  assert.ok(points[1][1] > points[2][1] && points[1][1] < points[0][1]);
});

test('P2: tela larga mostra histórico real com idade ou diz que ainda não há; as demais telas não mostram', opts, () => {
  const home = HOME([LIGHT('quarto-luz', 'quarto-luz', { power: true, brightness: 60 }), AR({ power: false }), TV()]);
  const lab = { data: { enabled: true, mode: 'lab', stats: { cpu: 10, memory: { used: 40 }, gpu: { temp: 50 }, wslGb: 2 } }, at: 5000, reload() {} };
  const t = setupRoute({ home, layout: 'wide', polls: { '/api/homelab': lab } });
  const wide = t.render(t.load(t.src('routes/Inicio/Inicio.jsx')).default);
  assert.match(wide, /Histórico desde que esta tela abriu/);
  assert.match(wide, /ainda sem histórico/i);
  assert.ok(!/<polyline/.test(wide), 'uma amostra só não desenha linha');
  const d = setupRoute({ home, layout: 'desktop', polls: { '/api/homelab': lab } });
  assert.ok(!/Histórico desde/.test(d.render(d.load(d.src('routes/Inicio/Inicio.jsx')).default)));
});
