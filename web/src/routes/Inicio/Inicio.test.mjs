import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AR, HOME, LIGHT, TV, count, setupRoute, skip } from '../harness.mjs';

// Paridade do Início (spec §3, #/): presença, modos reais, atalhos/toggle das luzes, ar estimado, movimento, Lab/jogo, últimas ações.
const opts = { skip };
const base = () => HOME([LIGHT('quarto-luz', 'quarto-luz', { power: true, brightness: 60 }), LIGHT('banheiro-luz', 'banheiro-luz', { power: false }), AR({ power: true, temperature: 24, mode: 'cool', fan: 'auto' }), TV()]);
const polls = (extra = {}) => ({
  '/api/location': { data: { people: [{ id: 'p1', name: 'Ana', place: 'casa', last: { tst: 1 } }, { id: 'p2', name: 'Bia' }], places: [{ id: 'casa', name: 'Casa' }] }, reload() {} },
  '/api/homelab': { data: { enabled: true, mode: 'lab', stats: { cpu: 0, memory: { used: 41 }, gpu: {}, wslGb: null } }, reload() {} },
  ...extra,
});
const render = (over = {}, props = {}) => { const t = setupRoute({ home: base(), polls: polls(), ...over }); return t.render(t.load(t.src('routes/Inicio/Inicio.jsx')).default, props); };

test('luz e ar são objetos protagonistas; relógio é secundário; a saudação vem da hora', opts, () => {
  const html = render();
  assert.match(html, /Bom dia|Boa tarde|Boa noite|Boa madrugada/);
  assert.match(html, /class="obj warm big col" aria-label="quarto-luz"/);
  assert.match(html, /60<span class="u">%<\/span>/);
  assert.match(html, /brilho relatado pela luz/);
  assert.match(html, /aria-label="Apagar quarto-luz"[^>]*aria-pressed="true"/);
  assert.match(html, /aria-label="Ligar banheiro-luz"/);
  assert.equal(count(html, /class="obj[^"]*" aria-label=/g), 3, 'duas luzes e o ar');
});

test('ar é ESTIMADO: último comando enviado, nunca leitura nem "Confirmado"; leva à tela Clima', opts, () => {
  const html = render();
  assert.match(html, /24°/);
  assert.match(html, /Estimado/);
  assert.match(html, /último comando enviado, não uma leitura/);
  assert.match(html, /href="#\/clima"/);
  const ar = html.slice(html.indexOf('aria-label="Ar do quarto"'));
  assert.ok(!/Confirmado/.test(ar.slice(0, ar.indexOf('</section>'))), 'o ar nunca aparece como confirmado pelo aparelho');
  assert.match(html, /aria-label="quarto-luz"[\s\S]*?Confirmado/, 'já a luz, que relata o próprio estado, pode ser Confirmado');
});

test('estado desconhecido e aparelho sem conexão nunca viram "desligado"; a chave fica desabilitada', opts, () => {
  const home = HOME([LIGHT('quarto-luz', 'quarto-luz', { power: null }), LIGHT('banheiro-luz', 'banheiro-luz', { power: false }, { connection: 'offline' })]);
  const html = render({ home });
  assert.match(html, /sem leitura/);
  assert.match(html, /sem conexão/);
  assert.equal(count(html, /class="ib big round " aria-label="[^"]+" aria-pressed="false" disabled=""/g), 2);
  assert.ok(!/apagada/.test(html), 'desconhecido e offline não são "apagada"');
});

test('modos reais viram botões; nenhum resultado aparece antes de rodar; ícone desconhecido cai no sol', opts, () => {
  const home = { ...base(), scenes: [{ id: 'chegada', name: 'Chegada', icon: 'home' }, { id: 'filme', name: 'Filme', icon: 'inexistente' }] };
  const html = render({ home });
  assert.match(html, /aria-label="Modos"/);
  assert.match(html, /Chegada/);
  assert.match(html, /Filme/);
  assert.ok(!/parcial|enviado<|Infravermelho não devolve/.test(html), 'sem resultado antes de rodar');
});

test('presença: nome, onde está e idade; sem posição diz isso; leva ao Local', opts, () => {
  const html = render();
  assert.match(html, /Ana/);
  assert.match(html, /em Casa · há/);
  assert.match(html, /Bia/);
  assert.match(html, /sem posição/);
  assert.match(html, /href="#\/local"/);
});

test('Lab: modo Lab/Jogo, zero continua zero, ausente vira traço; desativado some', opts, () => {
  const html = render();
  assert.match(html, /aria-label="Home lab"/);
  assert.match(html, /<b class="num s">0%<\/b>/);
  assert.match(html, /<b class="num s">41%<\/b>/);
  assert.match(html, /<b class="num s">—<\/b>/);
  assert.match(html, /role="switch"[^>]*aria-checked="false"[^>]*aria-label="Modo jogo"/);
  assert.ok(!render({ polls: polls({ '/api/homelab': { data: { enabled: false }, reload() {} } }) }).includes('Home lab'));
});

test('movimento: foto parada com câmera e hora; "Novo" só se há não vistos; sem eventos diz isso; some na prévia', opts, () => {
  const motion = { data: { events: [{ id: 'm1', camera: 'cam1', start: 1730000000, count: 3, photo: true }, { id: 'm0', camera: 'cam1', start: 10, count: 1 }], unseenBy: { cam1: 1 } }, reload() {} };
  const html = render({ polls: polls({ '/api/motion': motion }) });
  assert.match(html, /\/api\/motion\/m1\.jpg/);
  assert.match(html, /foto, não vídeo/);
  assert.match(html, /3×/);
  assert.match(html, />Novo</);
  assert.match(render({ polls: polls({ '/api/motion': { data: { events: [] }, reload() {} } }) }), /Nenhum movimento registrado/);
  const preview = render({ home: { ...base(), mode: 'preview' } });
  assert.match(preview, /Prévia: nada físico é acionado/);
  assert.ok(!preview.includes('Último movimento'));
});

test('últimas ações em linha do tempo; falha marcada; sem conexão avisa a idade do último estado', opts, () => {
  const home = { ...base(), recentActions: [{ id: 'a', name: 'Chegada', message: 'Parcial', status: 'failed', createdAt: 1730000000 }, { id: 'b', name: 'Luz', message: 'ok', status: 'ok', createdAt: 1730000100 }] };
  const html = render({ home, stateError: new Error('x') });
  assert.match(html, /<li class="bad">/);
  assert.match(html, /Sem conexão com o PC de casa/);
  assert.match(html, /Mostrando o último estado conhecido, há/);
});

test('em local, nada é rotulado "Simulado"; só a prévia fala em simulação', opts, () => {
  assert.ok(!/Simulado/.test(render()));
});

test('layouts: bandeja compacta, tela larga com quadros parados e SEM vídeo ao vivo', opts, () => {
  const tray = render({ layout: 'tray' });
  assert.match(tray, /class="col inicio tray"/);
  assert.ok(!/Boa (noite|tarde)|Bom dia/.test(tray), 'a bandeja não tem saudação grande');
  const wide = render({ layout: 'wide' });
  assert.match(wide, /class="col inicio wide"/);
  assert.match(wide, /um quadro a cada 4 s/);
  assert.match(wide, /sem vídeo ao vivo/);
  assert.ok(!/<video/.test(wide));
  assert.ok(!/<video/.test(render({ layout: 'desktop' })));
});

test('carregando mostra esqueleto; o Início nunca faz POST ao abrir', opts, () => {
  const posts = [];
  const t = setupRoute({ home: null, posts });
  const html = t.render(t.load(t.src('routes/Inicio/Inicio.jsx')).default);
  assert.match(html, /role="status"/);
  assert.equal(posts.length, 0);
  assert.ok(!/fetch\(|\.post\(/.test(readFileSync(new URL('./Inicio.jsx', import.meta.url), 'utf8').replace(/get\('\/api\/cameras'\)/, '')), 'só leitura ao abrir');
});
