import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { available, createLoader, web } from '../ui/harness.mjs';

// Guardas do shell com React REAL em render estático (sem efeitos, sem rede, sem navegador).
// Se o React do checkout principal não estiver disponível, os testes se declaram "skip" em vez de passar em falso.
const opts = { skip: available ? false : 'React/esbuild indisponíveis (defina CASA_WEB_ROOT)' };
const here = (file) => fileURLToPath(new URL(file, import.meta.url));

function setup({ route = { name: '', param: '' }, layout = 'desktop', search = '', home = null, bootError = null, stateError = null, status = null } = {}) {
  const calls = { statePoll: [], homeReads: 0, layoutReads: 0, routeReads: 0, bootstrap: 0 };
  globalThis.window = { location: { search, hash: '', reload() { calls.reload = true; } }, pywebview: undefined };
  globalThis.document = { querySelector: () => null, documentElement: { dataset: {} } };
  const hooks = {
    useRoute: () => { calls.routeReads += 1; return route; },
    useLayout: () => { calls.layoutReads += 1; return layout; },
    useHome: () => { calls.homeReads += 1; return { home, bootError, stateError }; },
    usePoll: () => ({ data: status }),
    useStatePoll: (enabled) => { calls.statePoll.push(enabled); },
    useBrowserApi: () => false,
  };
  const store = { home: { bootstrap: () => { calls.bootstrap += 1; return Promise.resolve(); }, refresh: () => Promise.resolve(), applySnapshot: () => false } };
  const load = createLoader({ stubs: { 'core/hooks.js': hooks, 'core/home.js': store, 'core/api.js': { get: () => Promise.resolve({}) } } });
  const React = web('react');
  const { renderToStaticMarkup } = web('react-dom/server');
  const Root = load(here('./Root.jsx')).default;
  const Boundary = load(here('./Boundary.jsx')).default;
  const render = (registry) => renderToStaticMarkup(React.createElement(Root, { registry }));
  return { calls, render, React, Boundary, renderToStaticMarkup, load };
}
const HOME = { mode: 'local', devices: [], scenes: [], recentActions: [], stateVersion: { epoch: 'A', revision: 1 } };

test('#oculto: não monta o Shell, não lê a casa, não liga poll', opts, () => {
  const t = setup({ route: { name: 'oculto', param: '' } });
  assert.equal(t.render({}), '<div aria-hidden="true"></div>');
  assert.equal(t.calls.homeReads, 0);
  assert.deepEqual(t.calls.statePoll, []);
});

test('janela de alerta: rota que não é #alerta fica dormente, sem Shell e sem poll', opts, () => {
  const t = setup({ route: { name: 'cameras', param: '' }, search: '?tray=1&alerta=1', layout: 'tray' });
  assert.equal(t.render({}), '<div aria-hidden="true"></div>');
  assert.equal(t.calls.homeReads, 0);
  assert.deepEqual(t.calls.statePoll, []);
});

test('janela de alerta com #alerta: carrega o alerta sob demanda (lazy) e nunca o Shell', opts, () => {
  const t = setup({ route: { name: 'alerta', param: 'cam1:1730000000-ab:1730000000' }, search: '?tray=1&alerta=1', layout: 'tray' });
  const html = t.render({});
  assert.ok(!html.includes('Pular para o conteúdo'), 'o Shell não pode montar na janela de alerta');
  assert.equal(t.calls.homeReads, 0);
  assert.deepEqual(t.calls.statePoll, []);
});

test('#alerta no painel normal cai no Início (Shell montado)', opts, () => {
  const t = setup({ route: { name: 'alerta', param: 'x' }, home: HOME });
  const html = t.render({});
  assert.match(html, /Pular para o conteúdo/);
  assert.match(html, /<h1[^>]*>Início<\/h1>/);
});

test('abertura: mensagem humana e, sem resposta, o motivo e o intervalo de nova tentativa', opts, () => {
  assert.match(setup({ home: null }).render({}), /Abrindo sua casa/);
  const html = setup({ home: null, bootError: new Error('Sem conexão com o PC de casa.') }).render({});
  assert.match(html, /Sem conexão com o PC de casa/);
  assert.match(html, /a cada 4 s/);
});

test('rota sem tela registrada mostra aviso honesto; tela lazy mostra carregamento; tela síncrona renderiza', opts, () => {
  const t = setup({ home: HOME });
  assert.match(t.render({}), /ainda não está disponível/);
  const lazy = t.React.lazy(() => new Promise(() => {}));
  assert.match(t.render({ '': { Screen: lazy } }), /Carregando a tela/);
  const Plain = () => t.React.createElement('p', null, 'conteúdo da rota');
  assert.match(t.render({ '': { Screen: Plain } }), /conteúdo da rota/);
});

test('Boundary: falha vira aviso com role=alert e botão; não recarrega sozinho; filhos passam quando não há erro', opts, () => {
  const t = setup({ home: HOME });
  assert.deepEqual(t.Boundary.getDerivedStateFromError(), { failed: true });
  class Failed extends t.Boundary { state = { failed: true }; }
  const html = t.renderToStaticMarkup(t.React.createElement(Failed));
  assert.match(html, /role="alert"/);
  assert.match(html, /Esta tela não abriu/);
  assert.match(html, /Recarregar painel/);
  assert.match(html, /Nenhum comando foi enviado de novo/);
  assert.equal(t.calls.reload, undefined, 'nunca recarrega sozinho');
  assert.match(t.renderToStaticMarkup(t.React.createElement(t.Boundary, null, t.React.createElement('i', null, 'ok'))), /<i>ok<\/i>/);
});

test('navegação por layout: oito destinos em tablet/desktop/wide/bandeja; celular tem 4 abas + Mais e o menu fechado não deixa nada no Tab', opts, () => {
  const count = (html, pattern) => (html.match(pattern) || []).length;
  for (const layout of ['tablet', 'desktop', 'wide']) {
    const html = setup({ home: HOME, layout }).render({});
    assert.equal(count(html, /class="navi"/g), 8, layout);
    assert.match(html, /aria-label="Seções"/);
  }
  const tray = setup({ home: HOME, layout: 'tray', search: '?tray=1' }).render({});
  assert.equal(count(tray, /class="ib" href="#\//g), 8, 'bandeja: oito ícones de rota');
  const mobile = setup({ home: HOME, layout: 'mobile' }).render({});
  assert.equal(count(mobile, /<a class="navi"/g), 4);
  assert.match(mobile, /<button type="button" class="navi" aria-haspopup="dialog"/);
  assert.match(mobile, /class="tabbar"/);
  assert.ok(!/href="#\/tv"|href="#\/lab"/.test(mobile), 'o menu "Mais" só tem conteúdo quando aberto');
});

test('prévia: faixa explícita e selo; rede local é o padrão; sem conexão aparece no selo', opts, () => {
  assert.match(setup({ home: { ...HOME, mode: 'preview' } }).render({}), /Prévia[\s\S]*nada é enviado/);
  assert.match(setup({ home: HOME }).render({}), /Rede local/);
  assert.match(setup({ home: HOME, stateError: new Error('x') }).render({}), /Sem conexão/);
});

test('o Shell liga UM poll de estado só com a casa carregada', opts, () => {
  const a = setup({ home: null }); a.render({});
  assert.deepEqual(a.calls.statePoll, [false]);
  const b = setup({ home: HOME }); b.render({});
  assert.deepEqual(b.calls.statePoll, [true]);
});
