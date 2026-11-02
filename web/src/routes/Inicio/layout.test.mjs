import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HOME, LIGHT, AR, setupRoute, skip } from '../harness.mjs';

// Fix leve de layout do Início (Crivo QA): três defeitos medidos no navegador do Crivo, conferidos AQUI só no texto do CSS e na
// marcação (SSR). NÃO prova o resultado na tela: o visual segue com o Crivo.
const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); // sem comentários: o seletor vem logo depois de uma chave ou do começo
const css = read('./inicio.css');
const kit = read('../../ui/kit.css');
const rule = (source, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(' ');
};
const opts = { skip };
const parts = () => { const t = setupRoute({}); return { t, ...t.load(t.src('routes/Inicio/Parts.jsx')) }; };

test('1) ar: o anel de 132 px não come a coluna — o texto desce (flex-wrap) e o anel encolhe por container query; o card é container', () => {
  const row = rule(css, '.climate-row');
  assert.match(row, /display:\s*flex/);
  assert.match(row, /flex-wrap:\s*wrap/);
  assert.match(rule(css, '.ring'), /flex:\s*none/, 'o anel não encolhe nem estica');
  assert.match(rule(css, '.climate-row > :not(.ring)') || rule(css, '.climate-row .grow'), /min-width:\s*(0|1[0-9]{2}px)|flex:\s*1 1/, 'o texto tem base mínima e pode quebrar');
  assert.match(css, /\.inicio \.obj\s*\{[^}]*container(-type)?:[^}]*inline-size/, 'o card é container (a largura REAL do card manda, não a da janela)');
  assert.match(css, /@container[^{]*max-width:\s*\d+px\)\s*\{[^}]*\.ring\s*\{[^}]*width:\s*\d+px/, 'anel menor quando o card é estreito');
});

test('1) hero esticado: nenhuma regra faz o card grande ocupar duas linhas; os objetos têm altura natural e as colunas se adaptam à largura real', () => {
  assert.doesNotMatch(css, /grid-row:\s*span 2/, 'sem grid-row: span 2 nos objetos (o card grande esticava vazio)');
  const objs = rule(css, '.objs');
  assert.match(objs, /align-items:\s*start/);
  assert.match(objs, /repeat\(auto-fit,\s*minmax\(min\(100%,\s*2[0-9]{2}px\),\s*1fr\)\)/, 'colunas por largura disponível, não por faixa fixa de viewport');
  assert.match(rule(css, '.objs .big'), /grid-column:\s*1\s*\/\s*-1/, 'o card grande ocupa a linha inteira em vez de esticar');
  assert.doesNotMatch(css, /@media \(min-width: 700px\) \{ \.objs/, 'a regra de 1,4fr/1fr por viewport saiu');
});

test('2) luz: número, unidade e palavra não sobrepõem o botão de ligar; botão nunca encolhe abaixo de 44 px', () => {
  const main = rule(css, '.obj-main');
  assert.match(main, /display:\s*grid/);
  assert.match(main, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/, 'texto em coluna que pode encolher; botão em coluna automática');
  assert.match(rule(css, '.obj-main > :first-child'), /min-width:\s*0/);
  assert.match(rule(css, '.num.word') || rule(css, '.obj .num.word'), /overflow-wrap:\s*anywhere/, '"apagada" e "desligado" quebram em vez de passar por baixo do botão');
  assert.match(css, /\.inicio \.obj \.num\.xl\s*\{[^}]*font-size:\s*clamp\([^)]*cqw/, 'o número grande escala com a largura do card');
  assert.match(rule(kit, '.ib'), /flex:\s*none/, 'IconButton não encolhe em flex (no navegador do Crivo ficou com 35 e 42 px)');
  assert.match(rule(kit, '.ib'), /width:\s*var\(--hit\)/);
  assert.match(rule(kit, '.ib.big'), /width:\s*64px/);
});

test('3) Lab: medidores empilham rótulo e valor, em colunas por largura real, sem sobrepor; todos continuam', () => {
  for (const selector of ['.meters', '.meters.hist']) assert.match(rule(css, selector), /repeat\(auto-fit,\s*minmax\(1[0-9]{2}px,\s*1fr\)\)/, selector);
  assert.doesNotMatch(css, /repeat\(4,\s*minmax\(0,\s*1fr\)\)/, 'sem 4 colunas fixas');
  assert.match(rule(css, '.meters > div'), /min-width:\s*0/);
  assert.match(rule(css, '.meters .num.s'), /overflow-wrap:\s*anywhere/);
  assert.match(rule(css, '.meters .num.s'), /font-size:\s*2[0-9]px/);
});

test('alvos de 44 px: segmentado e IconButton (layout.json do Crivo: 38 px e 35/42 px)', () => {
  assert.match(rule(kit, '.seg button'), /min-height:\s*var\(--hit\)/, 'opção do segmentado com 44 px');
  assert.doesNotMatch(rule(kit, '.seg button'), /min-height:\s*38px/);
  assert.match(rule(kit, '.seg button'), /min-width:\s*44px/);
});

test('marcação (SSR): classes novas presentes e tudo que já existia continua (selo de confiança, atalho, botão de ligar, quatro medidores)', opts, () => {
  const { t, LightObject, ClimateObject, LabCard } = parts();
  const light = (state, extra = {}) => t.renderBare(t.h(LightObject, { device: LIGHT('quarto-luz', 'Luz do quarto', state), large: true, blocked: false, ...extra }));
  const on = light({ power: true, brightness: 80 });
  assert.match(on, /class="obj-main"/);
  assert.match(on, /aria-label="Apagar luz do quarto"/);
  assert.match(on, /80<span class="u">%<\/span>/);
  assert.match(on, /Brilho e cor em Luzes/);
  const off = light({ power: false, brightness: 80 });
  assert.match(off, /class="num xl word"[^>]*>apagada</, 'palavra recebe a classe que permite quebrar');
  assert.match(off, /aria-label="Ligar luz do quarto"/);
  assert.ok(!/class="num xl word"[^>]*>80/.test(on), 'número não vira "word"');
  const ar = t.renderBare(t.h(ClimateObject, { device: AR({ power: true, mode: 'cool', fan: 'auto', temperature: 24 }) }));
  assert.match(ar, /class="row climate-row"/);
  assert.match(ar, /class="ring" aria-hidden="true"/);
  assert.match(ar, /class="cf est"[^>]*>.*?Estimado/, 'selo de confiança preservado');
  assert.match(ar, /href="#\/clima"[^>]*>Abrir Clima</, 'atalho preservado');
  assert.match(ar, /O ar não informa o que faz/);
  const lab = t.renderBare(t.h(LabCard, { lab: { data: { enabled: true, mode: 'lab', step: null, stats: { cpu: 37, memory: { used: 62 }, gpu: { temp: 55.4 }, wslGb: 2.5 } }, error: null, stale: false, reload() {} }, compact: false, blocked: false }));
  for (const [label, value] of [['CPU', '37%'], ['Memória', '62%'], ['GPU', '55°'], ['WSL', '2,5 GB']]) assert.match(lab, new RegExp(`<span class="cap">${label}</span><b class="num s">${value}</b>`), label);
});
