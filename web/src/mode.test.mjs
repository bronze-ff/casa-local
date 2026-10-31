import assert from 'node:assert/strict';
import { layoutFor, parseHash, readTray } from './mode.js';

assert.equal(readTray(''), null);
assert.equal(readTray('?tray=1'), 'popup');
assert.equal(readTray('?tray=1&alerta=1'), 'alerta');
assert.equal(readTray('?alerta=1'), null);
assert.equal(readTray('?tray=0'), null);

const names = ['', 'luzes', 'clima', 'cameras'];
assert.deepEqual(parseHash('', names), { name: '', param: '' });
assert.deepEqual(parseHash('#/luzes/banheiro-luz', names), { name: 'luzes', param: 'banheiro-luz' });
assert.deepEqual(parseHash('#cameras:replay:cam2:1730000000', names), { name: 'cameras', param: 'replay:cam2:1730000000' });
assert.deepEqual(parseHash('#/cameras/cam3', names), { name: 'cameras', param: 'cam3' });
assert.deepEqual(parseHash('#oculto', names), { name: 'oculto', param: '' });
assert.deepEqual(parseHash('#alerta:cam1:1730000000-ab12cd:1730000000', names), { name: 'alerta', param: 'cam1:1730000000-ab12cd:1730000000' });
assert.deepEqual(parseHash('#desconhecida/x', names), { name: '', param: '' });

assert.equal(layoutFor(390, null), 'mobile');
assert.equal(layoutFor(759, null), 'mobile');
assert.equal(layoutFor(760, null), 'desktop');
assert.equal(layoutFor(1599, null), 'desktop');
assert.equal(layoutFor(1600, null), 'wide');
assert.equal(layoutFor(1920, 'popup'), 'tray');
console.log('mode.test OK');
