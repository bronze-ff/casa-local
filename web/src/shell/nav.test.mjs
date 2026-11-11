import assert from 'node:assert/strict';
import test from 'node:test';
import { DESTINATIONS, MOBILE_TABS, MORE, SIDEBAR, connectionOf, mobileTabActive, reachable, resolveRoute } from './nav.js';
import { ROUTE_NAMES } from '../core/route.js';
import { attributeFor, nextTheme, readTheme } from './theme-logic.js';

test('as oito rotas são alcançáveis em todos os layouts (inclusive o celular via "Mais")', () => {
  for (const layout of ['mobile', 'tablet', 'desktop', 'wide', 'tray']) {
    assert.deepEqual([...reachable(layout)].sort(), [...ROUTE_NAMES].sort(), layout);
  }
  assert.equal(MOBILE_TABS.length + MORE.length, 8);
  assert.deepEqual(Object.keys(DESTINATIONS).sort(), [...ROUTE_NAMES].sort());
  assert.deepEqual([...SIDEBAR].sort(), [...ROUTE_NAMES].sort());
});

test('celular e bandeja: rota fora das cinco abas marca "Mais"', () => {
  assert.equal(mobileTabActive('cameras'), 'cameras');
  assert.equal(mobileTabActive('lab'), 'mais');
  assert.equal(mobileTabActive('tv'), 'tv');
  assert.equal(mobileTabActive('central'), 'mais');
});

test('guarda #oculto: dormente em qualquer modo, sem montar nada', () => {
  assert.deepEqual(resolveRoute({ name: 'oculto', param: '' }, null), { kind: 'dormant' });
  assert.deepEqual(resolveRoute({ name: 'oculto', param: '' }, 'popup'), { kind: 'dormant' });
  assert.deepEqual(resolveRoute({ name: 'oculto', param: '' }, 'alerta'), { kind: 'dormant' });
});

test('guarda de alerta: a janela de alerta só tem #alerta; o resto fica dormente', () => {
  assert.deepEqual(resolveRoute({ name: 'alerta', param: 'cam1:1730000000-ab:1730000000' }, 'alerta'), { kind: 'alert', param: 'cam1:1730000000-ab:1730000000' });
  assert.deepEqual(resolveRoute({ name: 'cameras', param: '' }, 'alerta'), { kind: 'dormant' });
  assert.deepEqual(resolveRoute({ name: '', param: '' }, 'alerta'), { kind: 'dormant' });
});

test('#alerta no painel normal e no popup cai no Início; as demais rotas passam', () => {
  assert.deepEqual(resolveRoute({ name: 'alerta', param: 'x' }, null), { kind: 'shell', route: { name: '', param: '' } });
  assert.deepEqual(resolveRoute({ name: 'alerta', param: 'x' }, 'popup'), { kind: 'shell', route: { name: '', param: '' } });
  assert.deepEqual(resolveRoute({ name: 'clima', param: 'quarto' }, null), { kind: 'shell', route: { name: 'clima', param: 'quarto' } });
});

test('selo de conexão: sem conexão, prévia e rede local, em português', () => {
  assert.deepEqual(connectionOf({ online: false, mode: 'local' }), { kind: 'err', label: 'Sem conexão' });
  assert.equal(connectionOf({ online: true, mode: 'preview' }).kind, 'sim');
  assert.match(connectionOf({ online: true, mode: 'preview' }).label, /nada é enviado/);
  assert.deepEqual(connectionOf({ online: true, mode: 'local' }), { kind: 'ok', label: 'Rede local' });
});

test('tema: ciclo auto → claro → escuro; bandeja sempre escura; armazenamento ruim não quebra', () => {
  assert.equal(nextTheme('auto'), 'claro');
  assert.equal(nextTheme('claro'), 'escuro');
  assert.equal(nextTheme('escuro'), 'auto');
  assert.equal(attributeFor('auto', false), null);
  assert.equal(attributeFor('claro', false), 'claro');
  assert.equal(attributeFor('claro', 'popup'), 'escuro');
  assert.equal(readTheme({ getItem: () => 'escuro' }), 'escuro');
  assert.equal(readTheme({ getItem: () => 'lixo' }), 'auto');
  assert.equal(readTheme({ getItem: () => { throw new Error('bloqueado'); } }), 'auto');
  assert.equal(readTheme(undefined), 'auto');
});
