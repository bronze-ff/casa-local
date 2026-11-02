import assert from 'node:assert/strict';
import test from 'node:test';
import { ROUTE_NAMES, hrefFor, layoutFor, parseHash, readTray } from './route.js';

test('bandeja: só ?tray=1 liga; alerta exige tray', () => {
  assert.equal(readTray(''), null);
  assert.equal(readTray('?tray=1'), 'popup');
  assert.equal(readTray('?tray=1&alerta=1'), 'alerta');
  assert.equal(readTray('?alerta=1'), null);
  assert.equal(readTray('?tray=0'), null);
});

test('hash: #/nome/param, #nome:p1:p2, oculto, alerta e desconhecida cai no Início', () => {
  const names = ['', 'luzes', 'clima', 'cameras'];
  assert.deepEqual(parseHash('', names), { name: '', param: '' });
  assert.deepEqual(parseHash('#/luzes/banheiro-luz', names), { name: 'luzes', param: 'banheiro-luz' });
  assert.deepEqual(parseHash('#cameras:replay:cam2:1730000000', names), { name: 'cameras', param: 'replay:cam2:1730000000' });
  assert.deepEqual(parseHash('#/cameras/cam3', names), { name: 'cameras', param: 'cam3' });
  assert.deepEqual(parseHash('#oculto', names), { name: 'oculto', param: '' });
  assert.deepEqual(parseHash('#alerta:cam1:1730000000-ab12cd:1730000000', names), { name: 'alerta', param: 'cam1:1730000000-ab12cd:1730000000' });
  assert.deepEqual(parseHash('#desconhecida/x', names), { name: '', param: '' });
});

test('as oito rotas são alcançáveis e o link antigo vira o novo formato', () => {
  assert.equal(ROUTE_NAMES.length, 8);
  for (const name of ROUTE_NAMES) assert.equal(parseHash(`#/${name}`).name, name);
  assert.equal(hrefFor('clima', 'quarto'), '#/clima/quarto');
  assert.equal(hrefFor(''), '#/');
  const old = parseHash('#clima:quarto');
  assert.equal(hrefFor(old.name, old.param), '#/clima/quarto');
});

test('layout: mobile, tablet, desktop, wide; a bandeja é sempre tray', () => {
  assert.equal(layoutFor(390, null), 'mobile');
  assert.equal(layoutFor(759, null), 'mobile');
  assert.equal(layoutFor(768, null), 'tablet');
  assert.equal(layoutFor(1099, null), 'tablet');
  assert.equal(layoutFor(1280, null), 'desktop');
  assert.equal(layoutFor(1599, null), 'desktop');
  assert.equal(layoutFor(1600, null), 'wide');
  assert.equal(layoutFor(1920, 'popup'), 'tray');
});
