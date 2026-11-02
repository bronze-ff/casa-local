import assert from 'node:assert/strict';
import test from 'node:test';
import { HOME, LIGHT, count, setupRoute, skip } from '../harness.mjs';

// Paridade de Local (spec §3, #/local[/pessoa]): pessoas até 4, mapa, lugares até 8 e raio 30–1000 m, eventos 24 h,
// OwnTracks por QR/link/JSON/arquivo com credencial privada, estados vazios honestos, prévia sem mutação, nenhuma escrita ao abrir.
const opts = { skip };
const now = 1800000000;
const place = { id: 'casa', name: 'Casa', lat: -23.55, lon: -46.63, radius: 100 };
const person = { id: 'joao', name: 'João', place: 'casa', stale: true, regionsPending: true, last: { lat: -23.55, lon: -46.63, tst: now - 2400, batt: 0, acc: 0, vel: 0, conn: 'w', bs: 2 }, trail: [], distances: { casa: 40 } };
const DATA = { configured: true, now, places: [place], people: [person], events: [{ person: 'joao', name: 'João', kind: 'chegou', place: 'casa', tst: now - 2600, exact: true }] };
const render = ({ data = DATA, error = null, stale = false, home, posts = [], param, layout } = {}) => {
  const t = setupRoute({ home: home || HOME([LIGHT('quarto-luz', 'q', { power: false })]), polls: { '/api/location': { data, error, stale, reload() {} } }, posts, layout });
  return t.render(t.load(t.src('routes/Local/Local.jsx')).default, { param });
};

test('carregando, erro e sem celular: cada estado diz o que é, sem inventar dado', opts, () => {
  assert.match(render({ data: null }), /role="status"/);
  assert.match(render({ data: null, error: new Error('Falha de leitura') }), /Falha de leitura/);
  const empty = render({ data: { configured: false, people: [], places: [], events: [] } });
  assert.match(empty, /Mapa sem posições ainda/);
  assert.match(empty, /primeiro celular/);
  assert.ok(!/tile\.openstreetmap\.org/.test(empty), 'sem posição não há mapa');
  assert.match(render({ stale: true }), /Sem conexão com o PC de casa/);
});

test('dados reais: casa, posição desatualizada, métricas com ZERO preservado, evento e lugares pendentes (cenário do screens.test legado)', opts, () => {
  const html = render();
  for (const text of ['É a casa', 'Posição desatualizada', '0%', '±0 m', '0 km/h', 'chegou em', 'tile.openstreetmap.org', 'próximo envio', 'Carregando · Wi-Fi', 'João a 40 m · posição antiga', 'Informado pelo celular', 'Último envio há mais de 30 min']) {
    assert.ok(html.includes(text), text);
  }
  assert.match(html, /Pessoas · 1 de 4/);
  assert.match(html, /Lugares · 1 de 8/);
  assert.match(html, /Últimas 24 h/);
});

test('mapa: fundo do OpenStreetMap com crédito, círculo do lugar, controles equivalentes ao arrasto', opts, () => {
  const html = render();
  assert.match(html, /role="img" aria-label="Mapa de localização"/);
  assert.match(html, /© OpenStreetMap/);
  for (const label of ['Ampliar mapa', 'Reduzir mapa', 'Mover mapa para oeste', 'Mover mapa para norte', 'Mover mapa para sul', 'Mover mapa para leste']) assert.match(html, new RegExp(`aria-label="${label}"`));
  assert.match(html, />Centralizar</);
  assert.match(html, /O círculo mostra a precisão do GPS/);
});

test('prévia: consulta liberada, toda mudança desabilitada com motivo; nada é escrito ao abrir', opts, () => {
  const posts = [];
  const html = render({ home: HOME([LIGHT('quarto-luz', 'q', { power: false })], { mode: 'preview' }), posts });
  assert.match(html, /Prévia: os dados disponíveis podem ser consultados/);
  assert.match(html, /disabled=""[^>]*>[\s\S]*?Configurar celular/);
  assert.match(html, /disabled=""[^>]*>[\s\S]*?Adicionar lugar/);
  assert.equal(posts.length, 0);
  assert.equal(render({ posts }).length > 0 && posts.length, 0, 'abrir a tela normal também não escreve');
});

test('limites: 4 pessoas e 8 lugares desabilitam o cadastro e dizem por quê', opts, () => {
  const people = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));
  const places = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `L${i}`, lat: 0, lon: 0, radius: 100 }));
  const html = render({ data: { configured: true, now, people, places, events: [] } });
  assert.match(html, /Limite de 4 pessoas/);
  assert.match(html, /Limite de 8 lugares/);
  assert.match(html, /O limite é de 4 pessoas\./);
  assert.match(html, /O limite é de 8 lugares\./);
  assert.match(html, /Nenhuma entrada ou saída dos lugares nas últimas 24 h/);
});

test('privacidade: a credencial NÃO está na página; o diálogo de celular só existe aberto', opts, () => {
  const html = render();
  assert.ok(!/owntracks:\/\//.test(html) && !/otrc/.test(html) && !/<svg[^>]*class="qr"/.test(html), 'nenhum QR, link ou credencial com o diálogo fechado');
  assert.match(html, /class="ov ov-sheet"/);
  assert.ok(!html.includes('ov-box'));
});

// ---- painéis e diálogos renderizados direto ----
const mod = (name) => { const t = setupRoute({}); return { t, m: t.load(t.src(`routes/Local/${name}.jsx`)) }; };

test('celular: QR com rótulo acessível, link "Abrir no OwnTracks", três formas de importar e aviso de credencial', opts, () => {
  const { t, m } = mod('PhoneSetup');
  const phone = { person: 'joao', otrc: { _type: 'configuration', mode: 3, tid: 'JO', name: 'João', url: 'https://x.ts.net/owntracks' } };
  const html = t.renderBare(t.h(m.PhoneSetup, { phone, name: 'João' }));
  assert.match(html, /role="img" aria-label="QR de configuração do OwnTracks de João"/);
  assert.match(html, /href="owntracks:\/\/\/config\?inline=/);
  for (const label of ['Copiar link', 'Copiar JSON', 'Baixar configuração', 'Abrir no OwnTracks']) assert.match(html, new RegExp(label));
  assert.match(html, /A senha não é exibida em texto/);
  assert.match(html, /Instale o OwnTracks/);
  assert.ok(!/password|pass"/.test(html), 'campo de senha não aparece em texto');
  const huge = { person: 'x', otrc: { blob: 'x'.repeat(5000) } };
  const failed = t.renderBare(t.h(m.PhoneSetup, { phone: huge, name: 'João' }));
  assert.match(failed, /grande demais/);
  assert.match(failed, /O link e o arquivo abaixo importam a mesma configuração/);
  assert.ok(!/<svg[^>]*class="qr"/.test(failed));
});

test('lugar: formulário valida com os limites e explica; só salva com tudo certo', opts, () => {
  const { t, m } = mod('Panels');
  const geo = t.load(t.src('routes/Local/geo.js'));
  const base = { places: [place], people: [], person: undefined, locked: false, busy: false, setDraft() {}, onNew() {}, onEdit() {}, onRemove() {}, onSave() {}, onRadius() {} };
  const bad = { name: '', lat: '', lon: '', radius: 10 };
  const html = t.renderBare(t.h(m.PlacesPanel, { ...base, draft: bad, problems: geo.placeProblems(bad) }));
  assert.match(html, /Novo lugar/);
  assert.match(html, /Falta ajustar/);
  assert.match(html, /Escreva o nome do lugar/);
  assert.match(html, /O raio vai de 30 a 1000 metros/);
  assert.match(html, /min="30"/); assert.match(html, /max="1000"/);
  assert.match(html, /disabled=""[^>]*>Salvar lugar/);
  const good = { id: 'casa', name: 'Casa', lat: -23.5, lon: -46.6, radius: 100 };
  const ok = t.renderBare(t.h(m.PlacesPanel, { ...base, draft: good, problems: geo.placeProblems(good) }));
  assert.match(ok, /Editar lugar/);
  assert.ok(!/Falta ajustar/.test(ok));
  assert.equal(count(ok, /class="chip"/g), 3);
  assert.match(ok, /aria-pressed="true"[^>]*>100 m/);
  assert.match(ok, /Para marcar a sua casa, use o nome “Casa”/);
});

test('pessoa: sem posição pede o primeiro envio; ações por pessoa existem e a remoção é de risco (vermelha)', opts, () => {
  const { t, m } = mod('Panels');
  const html = t.renderBare(t.h(m.PeoplePanel, { people: [{ id: 'bia', name: 'Bia' }], places: [], events: [], selected: 'bia', onSelect() {}, locked: false, onPhone() {}, onRename() {}, onRenew() {}, onRemove() {}, onAdd() {} }));
  assert.match(html, /Sem dado/);
  assert.match(html, /Aguardando o primeiro envio/);
  assert.match(html, /toque na seta para enviar a posição/);
  for (const text of ['Configurar celular', 'Renomear', 'Renovar credencial', 'Remover pessoa', 'Adicionar pessoa']) assert.match(html, new RegExp(text));
  assert.match(html, /class="btn d[^"]*"[^>]*>Remover pessoa/);
});
