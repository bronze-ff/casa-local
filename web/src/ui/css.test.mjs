import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Regras de CSS que o contrato exige, conferidas no texto real. Não substitui ver a tela.
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const theme = read('./theme.css'); const base = read('./base.css'); const kit = read('./kit.css'); const shell = read('../shell/shell.css');
const all = theme + base + kit + shell;

test('alvos de 44 px: token, botões, chips, ícones, abas e links de navegação', () => {
  assert.match(theme, /--hit: 44px/);
  for (const rule of [/\.btn \{[^}]*min-height: var\(--hit\)/, /\.ib \{[^}]*width: var\(--hit\); height: var\(--hit\)/, /\.chip \{[^}]*min-height: var\(--hit\)/, /\.sw \{[^}]*min-height: var\(--hit\)/, /\.inp \{[^}]*min-height: var\(--hit\)/, /\.navi \{[^}]*min-height: var\(--hit\)/]) {
    assert.match(all, rule, String(rule));
  }
  assert.match(shell, /\.tabbar \.navi \{[^}]*min-height: 56px/);
});

test('movimento: nada anima com "menos movimento"; sem keyframes; transições só de transform e opacity', () => {
  assert.match(base, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important[\s\S]*transition: none !important/);
  assert.ok(!/@keyframes/.test(all), 'sem animação contínua');
  for (const match of all.matchAll(/transition:\s*([^;}]+)/g)) {
    const properties = match[1].split(',').map((part) => part.trim().split(/\s+/)[0]);
    for (const property of properties) assert.ok(['transform', 'opacity', 'none'].includes(property), `transition de "${property}" não é transform/opacity`);
  }
});

test('vidro: todo backdrop-filter tem o par -webkit- (Safari) e não há 3D decorativo', () => {
  assert.ok(!/perspective|rotate3d|translate3d/.test(all), 'sem 3D');
  const plain = [...all.matchAll(/(?<!-webkit-)backdrop-filter:\s*([^;}]+)/g)].map((m) => m[1].trim());
  const prefixed = [...all.matchAll(/-webkit-backdrop-filter:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(plain.length > 0, 'o desenho Vidro usa desfoque de fundo');
  assert.deepEqual(prefixed.sort(), plain.sort(), 'cada backdrop-filter tem o mesmo valor com -webkit-');
  assert.match(theme, /--blur:\s*\d+px/, 'intensidade do vidro num token só');
});

test('foco visível de 3 px e utilitário só-leitor-de-tela', () => {
  assert.match(base, /:focus-visible \{ outline: 3px solid var\(--focus\)/);
  assert.match(base, /\.sr-only/);
});

test('tabbar fixa reserva espaço no fim do conteúdo (não cobre o último item) e respeita a área segura', () => {
  assert.match(shell, /\.tabbar \{[^}]*position: fixed/);
  // A pílula flutua 10 px acima da área segura e tem --tab-h de altura: o fim da página reserva os dois e mais um respiro.
  assert.match(shell, /\.tabbar \{[^}]*bottom: calc\(10px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(shell, /\.tabbar \{[^}]*min-height: var\(--tab-h\)/);
  assert.match(shell, /\.app\.mobile \.page \{[^}]*padding: 18px 16px calc\(var\(--tab-h\) \+ env\(safe-area-inset-bottom\) \+ 40px\)/);
});

test('overlay: <dialog> na camada superior; sheet ancorado na base no celular; painel lateral só ≥ 1100 px; ações presas ao pé', () => {
  assert.match(kit, /dialog\.ov \{[^}]*margin: auto/);
  assert.match(kit, /@media \(max-width: 759px\) \{[\s\S]*dialog\.ov\.ov-sheet \{ position: fixed; inset: auto 0 0 0/);
  assert.match(kit, /max-height: 86dvh/);
  assert.match(kit, /@media \(min-width: 1100px\) \{[\s\S]*dialog\.ov\.ov-panel \{ position: fixed; inset: 0 0 0 auto/);
  assert.match(kit, /\.ov-body \{[^}]*overflow-y: auto/);
  assert.match(kit, /\.ov-foot \{[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(base, /html:has\(dialog\[open\]\) \{ overflow: hidden/);
});

test('layout por largura: rail 92 px no tablet, sidebar no desktop/wide, bandeja compacta', () => {
  assert.match(shell, /\.app\.tablet \{ grid-template-columns: var\(--rail-w\) minmax\(0, 1fr\)/);
  assert.match(shell, /\.app\.desktop, \.app\.wide \{ grid-template-columns: var\(--side-w\) minmax\(0, 1fr\)/);
  assert.match(shell, /\.trayicons \{[^}]*repeat\(6/);
});
