import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Contraste calculado a partir do CSS real (fórmula WCAG). Não substitui medição em tela.
const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const tokens = (block) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const light = tokens(css.slice(0, css.indexOf('@media')));
const darkMedia = tokens(css.slice(css.indexOf('@media'), css.indexOf(':root[data-theme="escuro"]')));
const darkForced = tokens(css.slice(css.indexOf(':root[data-theme="escuro"]')));
const themes = { claro: light, 'escuro (sistema)': { ...light, ...darkMedia }, 'escuro (escolhido)': { ...light, ...darkForced } };

const channel = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const TEXT_ON_SURFACE = ['--ink', '--mut', '--acc', '--info', '--ok', '--warn', '--div', '--err', '--sim'];
const SURFACES = ['--bg', '--sf', '--sf2'];
const SOFT = [['--info', '--info-soft'], ['--ok', '--ok-soft'], ['--warn', '--warn-soft'], ['--div', '--div-soft'], ['--err', '--err-soft'], ['--sim', '--sim-soft'], ['--acc', '--acc-soft']];

for (const [name, t] of Object.entries(themes)) {
  test(`${name}: os dois temas definem os mesmos tokens`, () => {
    for (const key of Object.keys(light)) assert.ok(t[key], key);
  });
  test(`${name}: texto e cores de estado ≥ 4,5:1 sobre as três superfícies`, () => {
    for (const fg of TEXT_ON_SURFACE) for (const bg of SURFACES) assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${fg} sobre ${bg}: ${ratio(t[fg], t[bg]).toFixed(2)}`);
  });
  test(`${name}: etiquetas de estado (cor sobre o próprio fundo suave) ≥ 4,5:1`, () => {
    for (const [fg, bg] of SOFT) assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${fg} sobre ${bg}: ${ratio(t[fg], t[bg]).toFixed(2)}`);
  });
  test(`${name}: texto sobre o acento ≥ 4,5:1, foco e borda de controle ≥ 3:1, --line só separa`, () => {
    assert.ok(ratio(t['--acc-ink'], t['--acc']) >= 4.5);
    for (const bg of SURFACES) {
      assert.ok(ratio(t['--ctl'], t[bg]) >= 3, `--ctl sobre ${bg}: ${ratio(t['--ctl'], t[bg]).toFixed(2)}`);
      assert.ok(ratio(t['--focus'], t[bg]) >= 3, `--focus sobre ${bg}: ${ratio(t['--focus'], t[bg]).toFixed(2)}`);
    }
    assert.ok(ratio(t['--line'], t['--bg']) < 3, 'o fio decorativo não pode ser usado como borda de controle');
  });
}
