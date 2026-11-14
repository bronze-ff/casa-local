import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { enterFullscreen, exitFullscreen, fullscreenElement, fullscreenKind } from './media.js';
import { CAMS, setupCameras, skip } from './harness.mjs';

// Reparo P2 (Crivo QA R2): em tela cheia só o elemento alvo e seus descendentes recebem toque. Com os controles FORA do alvo,
// "Sair da tela cheia" ficava inatingível. Aqui: a composição REAL (SSR → árvore) prova que alvo, mídia e controles dividem o contêiner.
// Não é prova de pixel nem de navegador: o comportamento do `requestFullscreen` real segue com o Crivo.
const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);
function parseHtml(html) {
  const root = { tag: '#root', attrs: '', classes: [], parent: null, children: [] };
  let node = root;
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClosing] = match;
    if (closing) { if (node.parent) node = node.parent; continue; }
    const element = { tag: tag.toLowerCase(), attrs, classes: (attrs.match(/\sclass="([^"]*)"/)?.[1] || '').split(/\s+/).filter(Boolean), parent: node, children: [] };
    node.children.push(element);
    if (!selfClosing && !VOID.has(element.tag)) node = element;
  }
  return root;
}
const walk = (node) => node.children.flatMap((child) => [child, ...walk(child)]);
const inside = (el, ancestor) => { for (let up = el.parent; up; up = up.parent) if (up === ancestor) return true; return false; };

function render(componentFile, name, props) {
  globalThis.document = { fullscreenEnabled: true };
  globalThis.window = { MediaSource: class {} };
  try {
    const t = setupCameras();
    return parseHtml(t.render(t.mod(componentFile)[name], props));
  } finally { delete globalThis.document; delete globalThis.window; }
}
const live = () => render('Cameras/Live.jsx', 'Live', { cameras: CAMS, index: 0, poster: null, move() {}, close() {}, rewind() {} });
const replay = () => render('Cameras/Replay.jsx', 'Replay', { camera: CAMS[0], start: 1000, from: 900, to: 1200, offset: 0, autoStart: false, close() {}, goLive() {} });

function check(tree, label) {
  const all = walk(tree);
  const targets = all.filter((el) => /\sdata-fullscreen-target="true"/.test(el.attrs));
  assert.equal(targets.length, 1, `${label}: exatamente UM elemento é o alvo da tela cheia`);
  const [box] = targets;
  const video = all.find((el) => el.tag === 'video');
  const controls = all.find((el) => /aria-label="Som e tela"/.test(el.attrs));
  const exit = all.find((el) => el.tag === 'button' && /aria-label="Tela cheia"/.test(el.attrs));
  const sound = all.find((el) => el.tag === 'button' && /aria-label="Ligar o som"/.test(el.attrs));
  assert.ok(video && controls && exit && sound, `${label}: vídeo, grupo de controles e botões existem`);
  assert.ok(inside(video, box), `${label}: o vídeo está dentro do alvo`);
  assert.ok(inside(controls, box), `${label}: o grupo "Som e tela" está DENTRO do alvo (senão Sair da tela cheia fica inatingível)`);
  assert.ok(inside(exit, box) && inside(sound, box), `${label}: botões de tela cheia e de som dentro do alvo`);
  const stage = all.find((el) => el.classes.includes('media-stage') && inside(video, el));
  assert.ok(stage && inside(stage, box), `${label}: a moldura de vídeo (.media-stage) também está no alvo`);
  assert.ok(!inside(box, stage) && !inside(controls, stage), `${label}: os controles são IRMÃOS da moldura, dentro do mesmo alvo`);
  assert.ok(box.classes.includes('media-box'), `${label}: o alvo é o .media-box`);
}

test('Ao vivo: o alvo da tela cheia contém a mídia E os controles de som e de tela', { skip }, () => check(live(), 'Ao vivo'));
test('Replay: o alvo da tela cheia contém a mídia E os controles de som e de tela', { skip }, () => check(replay(), 'Replay'));

test('o ref do alvo é o MESMO passado aos controles (é nele que requestFullscreen é chamado)', () => {
  for (const file of ['Live.jsx', 'Replay.jsx']) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(source, /<div ref=\{box\} className="media-box" data-fullscreen-target="true">/, file);
    assert.match(source, /<MediaControls[^>]*stage=\{box\}/, `${file}: MediaControls recebe o ref do alvo`);
    assert.doesNotMatch(source, /stage=\{stage\}/, `${file}: nenhum ref antigo da moldura vai para os controles`);
  }
});

test('API: alvo do elemento recebe requestFullscreen; iPhone cai no vídeo; sem API não faz nada; sair usa o documento', () => {
  const calls = [];
  const box = { requestFullscreen() { calls.push(['box', this === box]); } };
  const video = { webkitSupportsFullscreen: true, webkitEnterFullscreen() { calls.push(['video']); } };
  enterFullscreen('element', box, video);
  assert.deepEqual(calls, [['box', true]], 'o alvo é o contêiner, não o vídeo');
  calls.length = 0;
  enterFullscreen('video', box, video);
  assert.deepEqual(calls, [['video']], 'iPhone: só o vídeo (controles nativos do sistema)');
  calls.length = 0;
  enterFullscreen(null, box, video);
  assert.deepEqual(calls, [], 'sem API nenhuma: nada acontece');
  assert.equal(fullscreenKind({}, null), null);
  assert.equal(fullscreenKind({ fullscreenEnabled: true }, video), 'element', 'com a API de elemento, o alvo é o contêiner mesmo no iPhone que também a tenha');
  const doc = { exitFullscreen() { calls.push(['sair', this === doc]); }, fullscreenElement: box };
  exitFullscreen(doc);
  assert.deepEqual(calls, [['sair', true]]);
  assert.equal(fullscreenElement(doc), box);
  assert.equal(fullscreenElement({ webkitFullscreenElement: box }), box);
  assert.equal(fullscreenElement({}), null);
});

test('regra de CSS: em tela cheia o alvo é preto e a moldura segue 16:9 limitada pela altura da tela, sem o teto de 54dvh', () => {
  const css = readFileSync(new URL('./cameras.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.media-box:fullscreen\s*\{[^}]*background:\s*#000/);
  assert.match(css, /\.media-box:fullscreen \.media-stage\s*\{[^}]*max-height:\s*calc\(100dvh - 120px\)[^}]*16 \/ 9/);
  assert.match(css, /\.media \{[^}]*object-fit:\s*fill/, 'o quadro anamórfico do DVR preenche a moldura 16:9');
  assert.match(css, /\.media-box:-webkit-full-screen\s*\{/, 'prefixo do Safari antigo');
});

// Contraste do aviso (.hint) sobre o fundo preto da tela cheia. Cálculo WCAG, não medição em tela.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('tela cheia: o aviso (.hint) tem contraste >= 4,5:1 sobre o preto, nos dois seletores; o tema claro herdado reprovaria; fora da tela cheia nada muda', () => {
  const css = readFileSync(new URL('./cameras.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const themeMut = readFileSync(new URL('../../ui/theme.css', import.meta.url), 'utf8').match(/--mut:\s*(#[0-9A-Fa-f]{6})/)[1];
  assert.equal(themeMut.toUpperCase(), '#545451');
  assert.ok(contrast(themeMut, '#000000') < 4.5, `o --mut do tema claro sobre preto é ${contrast(themeMut, '#000000').toFixed(3)}:1 (reprova, defeito original)`);
  for (const selector of ['.media-box:fullscreen .hint', '.media-box:-webkit-full-screen .hint']) {
    const body = css.match(new RegExp(`${selector.replace(/[.:\-]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1];
    assert.ok(body, `regra de ${selector}`);
    const color = body.match(/color:\s*(#[0-9A-Fa-f]{6})/)?.[1];
    assert.ok(color, `${selector} define cor literal`);
    assert.ok(contrast(color, '#000000') >= 4.5, `${selector}: ${color} sobre #000 = ${contrast(color, '#000000').toFixed(2)}:1`);
  }
  const hintRules = [...css.matchAll(/([^{}]+)\{[^}]*\}/g)].map((m) => m[1].trim()).filter((sel) => /\.hint\b/.test(sel));
  assert.deepEqual(hintRules.sort(), ['.media-box:-webkit-full-screen .hint', '.media-box:fullscreen .hint'], 'toda regra de .hint em cameras.css vive só dentro da tela cheia (nada vaza para fora dela)');
});
