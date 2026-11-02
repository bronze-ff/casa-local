import assert from 'node:assert/strict';
import test from 'node:test';
import { HOME, LIGHT, TV, count, setupRoute, skip } from '../harness.mjs';

// Paridade de TV (spec §3, #/tv[/rede]): controle IR Geonav (teclas, origens, aprender) e TVs Samsung na rede
// (busca MANUAL, parear/renovar, renomear, controle, play/pause, apps), com os limites de Wi-Fi, espera e prévia.
const opts = { skip };
const IR = (extra = {}) => TV({ power: null }, { irKeys: { power: 'aprendido', up: 'geonav-perfil', ok: 'aprendido' }, ...extra });
const NET = { data: { tvs: [{ id: 'aaaaaaaaaaaa', label: 'Sala', model: 'QN90', paired: true, power: 'on' }, { id: 'bbbbbbbbbbbb', label: '', paired: false, power: 'on' }], scannedAt: 1730000000 }, reload() {} };
const render = ({ param, layout = 'desktop', device = IR(), polls = { '/api/tvs': NET }, home, ...over } = {}) => {
  const t = setupRoute({ home: home || HOME([LIGHT('quarto-luz', 'quarto-luz', { power: false }), device]), layout, polls, ...over });
  return t.render(t.load(t.src('routes/TV/TV.jsx')).default, { param });
};
const part = (name, props) => { const t = setupRoute({}); const m = t.load(t.src(`routes/TV/${name}.jsx`)); return t.renderBare(t.h(m[name === 'Remote' ? 'Remote' : name === 'NetworkTV' ? 'NetworkTV' : 'Infrared'], props)); };

test('IR: estado da TV NÃO é confirmado; desconhecido não vira "desligada"', opts, () => {
  const html = render();
  assert.match(html, /aria-label="Controle IR"/);
  assert.match(html, /O estado real da TV não é confirmado/);
  assert.match(html, />—<\/span>/);
  assert.ok(!/>desligada</.test(html));
  assert.match(render({ device: IR({ state: { power: true } }) }), />ligada</);
});

test('IR: teclas com 44 px, direcional circular, tecla sem código desabilitada com motivo e origem em title', opts, () => {
  const html = render();
  assert.match(html, /role="group" aria-label="Direcional"/);
  assert.match(html, /role="group" aria-label="Volume"/);
  assert.match(html, /disabled=""[^>]*aria-label="Entrada"/);
  assert.match(html, /Entrada: sem código\. Use Aprender\./);
  assert.match(html, /title="Aprendido"/);
  assert.match(html, /title="Perfil Geonav · não confirmado"/);
  assert.ok(!/aria-label="Reproduzir"/.test(html), 'reproduzir e pausar só existem pela rede');
  assert.match(html, /Códigos do controle · 2 aprendidos/);
  assert.match(html, /Não cadastrado/);
});

test('IR indisponível: prévia, offline e não configurada travam as teclas e explicam', opts, () => {
  const preview = render({ home: HOME([IR()], { mode: 'preview' }) });
  assert.match(preview, /Prévia: nenhum sinal é enviado/);
  assert.match(preview, /disabled=""[^>]*aria-label="Liga\/desliga"/);
  assert.match(render({ device: IR({ connection: 'offline' }) }), /Central IR sem conexão\./);
  assert.match(render({ device: IR({ configured: false }) }), /Central IR não configurada\. Configure-a no PC de casa\./);
  assert.match(render({ device: undefined, home: HOME([LIGHT('quarto-luz', 'quarto-luz', { power: false })]) }), /TV do quarto não está no cadastro/);
});

test('rede: a busca é MANUAL; nada é procurado ao abrir; mostra última busca e as TVs', opts, () => {
  const posts = [];
  const html = render({ polls: { '/api/tvs': NET }, posts });
  assert.match(html, /aria-label="TVs na rede e apps"/);
  assert.match(html, /Procurar TVs/);
  assert.match(html, /nada é procurado ao abrir a tela/);
  assert.match(html, /Última busca há/);
  assert.match(html, /aria-label="Sala"/);
  assert.match(html, /QN90 · pareada/);
  assert.equal(posts.length, 0);
  assert.match(render({ polls: { '/api/tvs': { data: { tvs: [] }, reload() {} } } }), /Nenhuma TV encontrada\. Ligue a TV e toque em Procurar TVs\./);
  assert.match(render({ polls: { '/api/tvs': { data: null, error: null, reload() {} } } }), /Carregando TVs…/);
  assert.match(render({ polls: { '/api/tvs': { ...NET, stale: true } } }), /Sem conexão com a lista de TVs/);
});

test('layout: desktop mostra IR e rede juntos; celular tem abas e #/tv/rede abre a rede', opts, () => {
  const both = render({ layout: 'desktop' });
  assert.match(both, /aria-label="Controle IR"/);
  assert.match(both, /aria-label="TVs na rede e apps"/);
  const mobile = render({ layout: 'mobile' });
  assert.match(mobile, /role="radiogroup" aria-label="Tipo de controle"/);
  assert.match(mobile, /aria-label="Controle IR"/);
  assert.ok(!/aria-label="TVs na rede e apps"/.test(mobile));
  const rede = render({ layout: 'mobile', param: 'rede' });
  assert.match(rede, /aria-label="TVs na rede e apps"/);
  assert.match(rede, /aria-checked="true" tabindex="0"[^>]*>Samsung · rede</);
});

test('TV na rede: parear só com a TV ligada; aguardando mostra a permissão na TV; sem resposta avisa o limite de Wi-Fi', opts, () => {
  const base = { preview: false, reload() {} };
  const can = part('NetworkTV', { ...base, tv: { id: 'a', label: 'Sala', paired: false, power: 'on' } });
  assert.match(can, />Parear</);
  assert.ok(!/disabled=""[^>]*>Parear/.test(can));
  assert.match(can, /Ligue a TV para parear e aceite o pedido na tela dela/);
  const off = part('NetworkTV', { ...base, tv: { id: 'a', label: 'Sala', paired: false, power: 'off' } });
  assert.match(off, /Ligue a TV para parear\./);
  assert.match(off, /Sem resposta na rede/);
  assert.match(off, /Ligar pela rede pode não funcionar em Wi-Fi/);
  const waiting = part('NetworkTV', { ...base, tv: { id: 'a', label: 'Sala', paired: false, power: 'on', pairing: true } });
  assert.match(waiting, /Aguardando permissão…/);
  assert.match(waiting, /escolha “Permitir” para “Casa Local”\. Aguarde até 35 segundos/);
  const paired = part('NetworkTV', { ...base, tv: { id: 'a', label: 'Sala', paired: true, power: 'standby' } });
  assert.match(paired, /Em espera/);
  assert.match(paired, /Ligar ou desligar Sala/);
  assert.match(paired, /Abrir controle/);
  assert.ok(!/Parear/.test(paired.replace(/Parear novamente/g, '')), 'pareada não oferece Parear de novo no cartão fechado');
});

test('TV na rede em prévia: tudo desabilitado com motivo; renomear usa diálogo fechado até abrir', opts, () => {
  const html = part('NetworkTV', { preview: true, reload() {}, tv: { id: 'a', label: 'Sala', paired: true, power: 'on' } });
  assert.match(html, /Indisponível na prévia\./);
  assert.match(html, /class="ov ov-sheet"/);
  assert.ok(!html.includes('ov-box'), 'o campo de nome só existe com o diálogo aberto');
});

test('controle da rede inclui reproduzir e pausar; todas as teclas existem', opts, () => {
  const net = part('Remote', { send() {}, disabled: false, network: true });
  assert.match(net, /aria-label="Reproduzir"/);
  assert.match(net, /aria-label="Pausar"/);
  assert.equal(count(net, /class="btn [sp] +rk/g), 14);
  const ir = part('Remote', { send() {}, disabled: false, keys: { power: 'aprendido' }, learning: true });
  assert.equal(count(ir, /aria-label="Aprender: /g), 12);
  assert.ok(!/disabled=""/.test(ir), 'em Aprender nenhuma tecla fica bloqueada por falta de código');
});
