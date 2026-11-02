import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Colisão de CSS (Crivo M6 P1): todos os CSS entram no mesmo documento (main.jsx importa todos). Uma regra de classe simples,
// definida em dois arquivos, vaza de uma rota para outra. Conferido no TEXTO dos CSS; não substitui ver a tela.
const src = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(src, file), 'utf8');
const cssFiles = ['ui/theme.css', 'ui/base.css', 'ui/kit.css', 'shell/shell.css', 'routes/routes.css',
  ...readdirSync(join(src, 'routes'), { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => readdirSync(join(src, 'routes', d.name)).filter((f) => f.endsWith('.css')).map((f) => `routes/${d.name}/${f}`))];

/** Regras com seletor SÓ de uma classe (`.nome`), sem modificador, pai nem pseudo: as que realmente colidem entre arquivos. */
function plainClassRules(file) {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  for (const match of css.matchAll(/(?:^|[};])\s*([^{}@;]+)\{([^{}]*)\}/g)) {
    for (const selector of match[1].split(',')) {
      const plain = selector.trim().match(/^\.([a-zA-Z0-9_-]+)$/);
      if (plain) rules.push({ name: plain[1], body: match[2] });
    }
  }
  return rules;
}

test('nenhuma classe simples é definida em dois arquivos CSS (o que vaza entre rotas)', () => {
  const owners = new Map();
  for (const file of cssFiles) for (const { name } of plainClassRules(file)) owners.set(name, new Set([...(owners.get(name) || []), file]));
  const clashes = [...owners].filter(([, files]) => files.size > 1).map(([name, files]) => `.${name}: ${[...files].join(' e ')}`);
  assert.deepEqual(clashes, [], `classes simples em mais de um arquivo: ${clashes.join('; ')}`);
});

test('o layout de página (.stage) não carrega regra de vídeo; a moldura de vídeo é .media-stage', () => {
  const page = plainClassRules('routes/routes.css').find((rule) => rule.name === 'stage');
  assert.ok(page, '.stage de layout mora em routes.css');
  assert.match(page.body, /display:\s*grid/);
  for (const forbidden of [/aspect-ratio/, /overflow:\s*hidden/, /background:\s*#000/, /max-height/]) assert.doesNotMatch(page.body, forbidden, String(forbidden));
  const video = plainClassRules('routes/Cameras/cameras.css').find((rule) => rule.name === 'media-stage');
  assert.ok(video, '.media-stage existe em cameras.css');
  assert.match(video.body, /aspect-ratio:\s*16 \/ 9/);
  assert.match(video.body, /overflow:\s*hidden/);
  assert.match(video.body, /background:\s*#000/);
  assert.match(video.body, /max-height:\s*54dvh/);
  assert.equal(plainClassRules('routes/Cameras/cameras.css').some((rule) => rule.name === 'stage'), false, 'cameras.css não define .stage');
  assert.doesNotMatch(read('routes/Cameras/cameras.css'), /(^|[\s,}])\.stage(?![-\w])/m, 'nenhum seletor de cameras.css usa .stage genérico');
});

test('os componentes de vídeo usam .media-stage; as páginas de layout seguem em .stage two', () => {
  for (const file of ['routes/Cameras/Live.jsx', 'routes/Cameras/Replay.jsx']) {
    const source = read(file);
    assert.match(source, /className="media-stage"/, file);
    assert.doesNotMatch(source, /className="stage"/, `${file} não usa .stage de layout para o vídeo`);
  }
  assert.equal((read('routes/Cameras/Live.jsx').match(/className="media-stage"/g) || []).length, 2, 'Live e FrameView');
  for (const file of ['routes/Clima/Clima.jsx', 'routes/Local/Local.jsx', 'routes/TV/TV.jsx', 'routes/Lab/Lab.jsx']) assert.match(read(file), /className="stage two"/, file);
  assert.doesNotMatch(read('routes/Cameras/Cameras.jsx'), /className="stage/, 'a grade de câmeras não usa a classe da moldura');
});
