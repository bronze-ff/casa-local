import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { available, createLoader, web } from './harness.mjs';

// Componentes com React REAL em render estático. Cenários do ui.test.mjs legado: ícones, tecla desabilitada com motivo,
// slider acessível, roving tabindex, chave de 44 px, confiança/estado, sheet. Sem efeitos, sem DOM, sem rede.
const opts = { skip: available ? false : 'React/esbuild indisponíveis (defina CASA_WEB_ROOT)' };
const here = (file) => fileURLToPath(new URL(file, import.meta.url));
let cached;
function kit() {
  if (cached) return cached;
  const load = createLoader();
  const React = web('react');
  const { renderToStaticMarkup } = web('react-dom/server');
  cached = { React, render: (el) => renderToStaticMarkup(el), h: React.createElement, ui: load(here('./kit.jsx')), icon: load(here('./Icon.jsx')), Overlay: load(here('./Overlay.jsx')).Overlay, Draft: load(here('./Draft.jsx')).Draft };
  return cached;
}

test('ícones: todo nome desenha um traço; alias antigo resolve; nome desconhecido cai em "home" de propósito; destinos do shell existem', opts, async () => {
  const { icon, render, h } = kit();
  const { DESTINATIONS } = await import('../shell/nav.js');
  for (const name of icon.ICON_NAMES) assert.match(render(h(icon.Icon, { name })), /<path d="M/, name);
  for (const [alias, real] of Object.entries({ bulb: 'luz', camera: 'cam', server: 'lab', warn: 'alert', external: 'ext' })) assert.equal(icon.resolveIcon(alias), real, alias);
  assert.equal(icon.resolveIcon('inexistente'), 'home');
  for (const { icon: name } of Object.values(DESTINATIONS)) assert.ok(icon.ICON_NAMES.includes(name), `ícone do shell sem desenho: ${name}`);
  assert.match(render(h(icon.Icon, { name: 'luz' })), /aria-hidden="true"/);
  assert.match(render(h(icon.Icon, { name: 'luz', label: 'Luz' })), /role="img" aria-label="Luz"/);
});

test('botão desabilitado diz o motivo para leitor de tela; ocupado marca aria-busy; variante vira classe', opts, () => {
  const { ui, render, h } = kit();
  const off = render(h(ui.Button, { disabled: true, reason: 'A luz está sem conexão.' }, 'Aplicar'));
  assert.match(off, /disabled=""/);
  assert.match(off, /aria-describedby="[^"]+"/);
  assert.match(off, /class="sr-only">A luz está sem conexão\./);
  const busy = render(h(ui.Button, { busy: true, variant: 'p' }, 'Aplicar'));
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /class="btn p busy/);
});

test('segmentado: só a opção atual entra no Tab (roving tabindex); indisponível nunca', opts, () => {
  const { ui, render, h } = kit();
  const html = render(h(ui.Segmented, { label: 'Modo', value: 'b', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C', disabled: true }] }));
  assert.match(html, /role="radiogroup" aria-label="Modo"/);
  assert.equal((html.match(/tabindex="0"/g) || []).length, 1);
  assert.match(html, /aria-checked="true" tabindex="0"[^>]*>B</);
  assert.match(html, /tabindex="-1"[^>]*disabled=""[^>]*>C</);
});

test('interruptor: role=switch, estado em aria-checked, texto dentro do alvo', opts, () => {
  const { ui, render, h } = kit();
  const on = render(h(ui.Switch, { on: true, label: 'Luz do quarto' }));
  assert.match(on, /role="switch"/);
  assert.match(on, /aria-checked="true"/);
  assert.match(on, /aria-label="Luz do quarto"/);
  const withText = render(h(ui.Switch, { on: false }, 'Ligar ao escolher cor'));
  assert.match(withText, /aria-checked="false"/);
  assert.match(withText, /Ligar ao escolher cor<\/button>/);
});

test('régua: papel de slider com nome e limites acessíveis', opts, () => {
  const { ui, render, h } = kit();
  const html = render(h(ui.Slider, { value: 60, min: 1, max: 100, label: 'Brilho do rascunho' }));
  assert.match(html, /type="range"/);
  assert.match(html, /aria-label="Brilho do rascunho"/);
  assert.match(html, /min="1"/);
  assert.match(html, /max="100"/);
});

test('confiança e fase do comando: ponto + palavra; erro anuncia como alerta; sem comando não desenha nada', opts, () => {
  const { ui, render, h } = kit();
  assert.match(render(h(ui.Confidence, { kind: 'reported' })), /class="cf rep"[^>]*>.*Confirmado/);
  assert.match(render(h(ui.Confidence, { kind: 'sent' })), /cf env.*Enviado · sem retorno/);
  assert.match(render(h(ui.Confidence, { kind: 'qualquer' })), /cf unk.*Desconhecido/);
  assert.match(render(h(ui.CommandState, { command: { phase: 'error' } })), /role="alert"[^>]*>.*Não enviado/);
  assert.match(render(h(ui.CommandState, { command: { phase: 'unknown' } })), /role="status"[^>]*>.*Sem resposta/);
  assert.equal(render(h(ui.CommandState, { command: null })), '');
  assert.equal(render(h(ui.Status, { kind: 'ok' }, 'rodando')), '<span class="st ok"><i class="dot" aria-hidden="true"></i>rodando</span>');
});

test('esqueleto é estático e escondido do leitor de tela; vazio oferece saída', opts, () => {
  const { ui, render, h } = kit();
  assert.match(render(h(ui.Skeleton, { height: 12 })), /aria-hidden="true"/);
  const empty = render(h(ui.Empty, { title: 'Nenhuma busca ainda', action: h('button', null, 'Procurar') }, 'A busca só roda quando você pede.'));
  assert.match(empty, /Nenhuma busca ainda/);
  assert.match(empty, /<button>Procurar<\/button>/);
});

test('overlay fechado não deixa conteúdo na árvore; aberto tem título ligado ao diálogo, Fechar marcado e ações no pé', opts, () => {
  const { Overlay, render, h } = kit();
  const closed = render(h(Overlay, { open: false, onClose() {}, title: 'Mais', kind: 'sheet' }, h('a', { href: '#/tv' }, 'TV')));
  assert.match(closed, /class="ov ov-sheet"/);
  assert.ok(!closed.includes('ov-box') && !closed.includes('href="#/tv"'), 'nada focável quando fechado');
  const open = render(h(Overlay, { open: true, onClose() {}, title: 'Renomear lugar', footer: h('button', null, 'Salvar') }, h('input', { 'aria-label': 'Nome' })));
  assert.match(open, /aria-labelledby="([^"]+)"/);
  const id = open.match(/aria-labelledby="([^"]+)"/)[1];
  assert.match(open, new RegExp(`<h2 id="${id.replace(/[:]/g, '\\:')}"`));
  assert.match(open, /data-close="true" aria-label="Fechar"/);
  assert.match(open, /class="ov-foot"><button>Salvar<\/button>/);
});

test('brilho: mostra o relatado ao lado do rascunho; igual ao relatado, Aplicar fica desabilitado com motivo; só brilho usa Draft', opts, () => {
  const { Draft, render, h } = kit();
  const html = render(h(Draft, { reported: 40, onApply() {} }));
  assert.match(html, /Relatado pela luz/);
  assert.match(html, /Rascunho/);
  assert.match(html, /igual ao relatado/);
  assert.match(html, /disabled=""[^>]*>Aplicar 40%/);
  assert.match(html, /O rascunho é igual ao que a luz relatou\./);
  assert.match(html, /aria-label="Brilho do rascunho"/);
  const unknown = render(h(Draft, { reported: null, onApply() {} }));
  assert.match(unknown, /sem leitura do aparelho/);
});
