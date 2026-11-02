import assert from 'node:assert/strict';
import test from 'node:test';
import { APPS, IR_KEYS, LABELS, canPair, keyBlocked, learnedCount, networkState, originText } from './keys.js';

test('teclas: 14 no total; reprodução e pausa só pela rede; quatro apps', () => {
  assert.equal(Object.keys(LABELS).length, 14);
  assert.ok(!IR_KEYS.includes('play') && !IR_KEYS.includes('pause'));
  assert.equal(IR_KEYS.length, 12);
  assert.deepEqual(APPS.map(([id]) => id), ['youtube', 'netflix', 'prime', 'globoplay']);
});

test('tecla IR sem código fica bloqueada, exceto em Aprender; sem cadastro nenhum nada é bloqueado', () => {
  assert.equal(keyBlocked('source', { power: 'aprendido' }, false), true);
  assert.equal(keyBlocked('power', { power: 'aprendido' }, false), false);
  assert.equal(keyBlocked('source', { power: 'aprendido' }, true), false, 'em Aprender qualquer tecla pode ser gravada');
  assert.equal(keyBlocked('source', undefined, false), false);
});

test('origem do código em palavras; só "aprendido" conta como aprendido; genérico não é confirmado', () => {
  assert.equal(originText('aprendido'), 'Aprendido');
  assert.match(originText('samsung-padrao'), /não confirmado/);
  assert.match(originText('geonav-perfil'), /não confirmado/);
  assert.equal(originText('outro'), 'Código cadastrado');
  assert.equal(originText(undefined), 'Não cadastrado');
  assert.equal(learnedCount({ power: 'aprendido', up: 'geonav-perfil', down: 'aprendido' }), 2);
  assert.equal(learnedCount(), 0);
});

test('TV na rede: "off" é sem resposta, nunca "desligada" com certeza; só parear com a TV ligada e sem pareamento em curso', () => {
  assert.equal(networkState('on'), 'Ligada');
  assert.equal(networkState('standby'), 'Em espera');
  assert.equal(networkState('off'), 'Sem resposta na rede');
  assert.equal(networkState(undefined), 'Estado desconhecido');
  assert.equal(canPair({ paired: false, power: 'on' }), true);
  assert.equal(canPair({ paired: false, power: 'on', pairing: true }), false);
  assert.equal(canPair({ paired: false, power: 'off' }), false);
  assert.equal(canPair({ paired: true, power: 'on' }), false);
});
