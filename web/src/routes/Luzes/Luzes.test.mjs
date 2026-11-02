import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AR, HOME, LIGHT, count, setupRoute, skip } from '../harness.mjs';
import { COLORS, WHITES, colorValues, isWhite } from './colors.js';

// Paridade de Luzes (spec §3, #/luzes[/id]): selecionar as duas luzes, power, brilho em rascunho + Aplicar, atalhos e +/-,
// branco/cor, 16 cores, ligar ao escolher cor, modos com resultado parcial, bloqueio explicado por configuração/conexão.
const opts = { skip };
const home = (over = {}, a = {}, b = {}) => HOME([LIGHT('quarto-luz', 'quarto-luz', { power: true, brightness: 40, colorHex: '#FFD6A0' }, a), LIGHT('banheiro-luz', 'banheiro-luz', { power: false }, b), AR({ power: false })], over);
const render = (over = {}, props = {}) => { const t = setupRoute({ home: home(), ...over }); return t.render(t.load(t.src('routes/Luzes/Luzes.jsx')).default, props); };

test('as duas luzes aparecem para escolher; o parâmetro da rota seleciona a segunda', opts, () => {
  const html = render();
  assert.match(html, /role="radiogroup" aria-label="Escolher lâmpada"/);
  assert.match(html, /Quarto · 40%/);
  assert.match(html, /Banheiro · apagada/);
  assert.match(html, /aria-label="quarto-luz"/);
  const second = render({}, { param: 'banheiro-luz' });
  assert.match(second, /<section class="obj[^"]*" aria-label="banheiro-luz"/);
  assert.ok(!/<section class="obj[^"]*" aria-label="quarto-luz"/.test(second));
});

test('brilho: relatado ao lado do rascunho, só "Aplicar" envia, cinco atalhos e +/-', opts, () => {
  const html = render();
  assert.match(html, /Relatado pela luz/);
  assert.match(html, /Rascunho/);
  assert.match(html, /igual ao relatado/);
  assert.match(html, /disabled=""[^>]*>Aplicar 40%/, 'sem diferença, Aplicar fica desabilitado');
  for (const value of [20, 40, 60, 80, 100]) assert.match(html, new RegExp(`aria-pressed="(true|false)"[^>]*>${value}%</button>`));
  assert.match(html, /aria-label="Diminuir brilho"/);
  assert.match(html, /aria-label="Aumentar brilho"/);
  assert.match(html, /aria-label="Brilho do rascunho"/);
  assert.match(html, /min="10"/);
});

test('cor: 16 opções, branco/cor, "ligar ao escolher cor" explícito e ligado por padrão', opts, () => {
  const html = render();
  assert.match(html, /role="group" aria-label="Cor da luz: 16 opções"/);
  assert.equal(count(html, /class="swatch"/g), 16);
  assert.match(html, /aria-label="Branco quente"[^>]*aria-pressed="true"/, 'a cor atual aparece marcada');
  assert.match(html, /role="radiogroup" aria-label="Branco ou cor"/);
  assert.match(html, /role="switch"[^>]*aria-checked="true"[^>]*>.*Ligar ao escolher cor/);
  assert.match(html, /Escolher uma cor liga a luz se ela estiver apagada/);
});

test('cores: 16 nomes, brancos, e a escolha de ligar é do usuário', () => {
  assert.equal(COLORS.length, 16);
  assert.ok(COLORS.every(([hex]) => /^#[0-9A-F]{6}$/.test(hex)));
  assert.deepEqual(WHITES, ['#FFD6A0', '#FFFFFF']);
  assert.equal(isWhite('#ffffff'), true);
  assert.equal(isWhite('#FF3B30'), false);
  assert.deepEqual(colorValues('#FF3B30', { power: false, turnOn: true }), { colorHex: '#FF3B30', power: true });
  assert.deepEqual(colorValues('#FF3B30', { power: true, turnOn: true }), { colorHex: '#FF3B30' }, 'já acesa: não manda power');
  assert.deepEqual(colorValues('#FF3B30', { power: false, turnOn: false }), { colorHex: '#FF3B30' }, 'ligar desmarcado: só a cor');
  assert.deepEqual(colorValues('#FF3B30', { power: null, turnOn: true }), { colorHex: '#FF3B30', power: true });
});

test('bloqueio explicado em texto: sem conexão com a lâmpada, não configurada, sem conexão com o painel', opts, () => {
  const offline = render({ home: home({}, { connection: 'offline' }) });
  assert.match(offline, /Sem conexão com a lâmpada\./);
  assert.match(offline, /aria-label="Ligar quarto-luz|aria-label="Apagar quarto-luz"[^>]*disabled=""/);
  assert.match(render({ home: home({}, { configured: false }) }), /Configure a lâmpada no PC de casa/);
  const panel = render({ stateError: new Error('x') });
  assert.match(panel, /Sem conexão com o PC de casa/);
  assert.match(panel, /Sem conexão com o painel\./);
});

test('estado desconhecido: não deixa ajustar brilho e diz por quê; prévia é avisada', opts, () => {
  const html = render({ home: home({}, { state: { power: null } }) });
  assert.match(html, /A luz não informou o estado\./);
  assert.match(html, /sem leitura do aparelho/);
  assert.match(render({ home: home({ mode: 'preview' }) }), /Prévia: os ajustes são simulados/);
});

test('modos: botão por modo; bloqueia se algum aparelho do modo não está configurado (fora da prévia)', opts, () => {
  const ok = render({ home: home({ scenes: [{ id: 'chegada', name: 'Chegada', devices: ['quarto-luz'], description: 'Acende o quarto' }] }) });
  assert.match(ok, /aria-label="Modos"/);
  assert.match(ok, /Acende o quarto/);
  const blocked = render({ home: home({ scenes: [{ id: 'x', name: 'Filme', devices: ['quarto-luz'] }] }, { configured: false }) });
  assert.match(blocked, /disabled=""[^>]*>[\s\S]*?Filme/);
  assert.match(blocked, /Algum aparelho deste modo não está configurado/);
});

test('só o brilho usa rascunho + Aplicar; nenhum POST ao abrir', opts, () => {
  const posts = [];
  const t = setupRoute({ home: home(), posts });
  t.render(t.load(t.src('routes/Luzes/Luzes.jsx')).default);
  assert.equal(posts.length, 0);
  assert.match(readFileSync(new URL('./Luzes.jsx', import.meta.url), 'utf8'), /import \{ Draft \}/);
  assert.ok(!/import \{ Draft \}/.test(readFileSync(new URL('../Clima/Clima.jsx', import.meta.url), 'utf8')), 'temperatura não usa rascunho + Aplicar');
});
