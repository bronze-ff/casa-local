import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseHash } from '../core/route.js';
import { skipToContent } from './skip.js';

// Reparo do Crivo: o link "Pular para o conteúdo" não pode mudar o hash (o roteador cairia no Início).
test('#conteudo não é rota: se o hash mudasse, o roteador voltaria ao Início', () => {
  assert.deepEqual(parseHash('#conteudo'), { name: '', param: '' });
});

test('pular para o conteúdo: preventDefault, foca o <main> e NÃO toca no hash nem na rota', () => {
  const calls = [];
  const main = { focus: (options) => calls.push(['focus', options]) };
  const doc = { getElementById: (id) => { calls.push(['get', id]); return id === 'conteudo' ? main : null; } };
  const location = { hash: '#/clima/quarto' };
  const event = { preventDefault: () => calls.push(['prevent']) };
  skipToContent(event, doc);
  assert.deepEqual(calls.map((c) => c[0]), ['prevent', 'get', 'focus']);
  assert.equal(calls[1][1], 'conteudo');
  assert.equal(location.hash, '#/clima/quarto', 'a rota continua a mesma');
});

test('sem <main> na página, ainda assim cancela a navegação e não quebra', () => {
  let prevented = false;
  skipToContent({ preventDefault: () => { prevented = true; } }, { getElementById: () => null });
  assert.equal(prevented, true);
});

test('o Shell liga o link ao tratador e o <main> é focável sem entrar no Tab', () => {
  const source = readFileSync(new URL('./Shell.jsx', import.meta.url), 'utf8');
  assert.match(source, /className="skip" href="#conteudo" onClick=\{skipToContent\}/);
  assert.match(source, /<main id="conteudo" className="page" tabIndex=\{-1\}/);
});
