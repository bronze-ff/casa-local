import assert from 'node:assert/strict';
import test from 'node:test';
import { batteryText, distanceText, eventsLast24h, isHomePlace, personState, placeBody, placeProblems, project, radiusPx, tilesFor, unproject, whereText } from './geo.js';

test('projeção do mapa: ida e volta em vários zooms e pontos extremos (cenário do screens.test legado)', () => {
  for (const zoom of [2, 15, 19]) for (const [lat, lon] of [[0, 0], [-23.55, -46.63], [85, 179], [-85, -179]]) {
    const back = unproject(...project(lat, lon, zoom), zoom);
    assert.ok(Math.abs(back[0] - lat) < 1e-8 && Math.abs(back[1] - lon) < 1e-8, `${lat},${lon}@${zoom}`);
  }
});

test('tiles: cobrem a janela, nunca saem do mundo vertical e dão a volta na longitude', () => {
  const { tiles } = tilesFor([-23.55, -46.63], 15);
  assert.ok(tiles.length >= 6 && tiles.length <= 12);
  assert.ok(tiles.every((t) => t.y >= 0 && t.y < 2 ** 15 && t.wrapped >= 0 && t.wrapped < 2 ** 15));
  assert.ok(tilesFor([85, 0], 2).tiles.every((t) => t.y >= 0 && t.y < 4));
  const wrap = tilesFor([0, 179.9], 3).tiles;
  assert.ok(wrap.some((t) => t.x !== t.wrapped), 'x além do mundo volta pelo outro lado');
  assert.ok(radiusPx(100, -23.55, 15) > 0 && radiusPx(0, 0, 15) === 0 && radiusPx(null, 0, 15) === 0);
});

test('lugar: valida com os limites do backend e explica cada problema', () => {
  const ok = { name: 'Casa', lat: -23.55, lon: -46.63, radius: 100 };
  assert.deepEqual(placeProblems(ok), []);
  assert.equal(placeProblems({ ...ok, name: '  ' }).length, 1);
  assert.match(placeProblems({ ...ok, lat: 91 })[0], /latitude/);
  assert.match(placeProblems({ ...ok, lon: '' })[0], /longitude/);
  assert.match(placeProblems({ ...ok, radius: 29 })[0], /raio/);
  assert.match(placeProblems({ ...ok, radius: 1001 })[0], /raio/);
  assert.equal(placeProblems({ name: '', lat: '', lon: '', radius: '' }).length, 4);
  assert.deepEqual(placeBody({ id: 'x', name: ' Casa ', lat: '1', lon: '2', radius: '30' }), { id: 'x', name: 'Casa', lat: 1, lon: 2, radius: 30 });
  assert.ok(!('id' in placeBody(ok)));
});

test('"Casa" decide a presença: o backend reconhece estes quatro nomes', () => {
  for (const name of ['Casa', ' home ', 'Minha Casa', 'CASA LOCAL']) assert.equal(isHomePlace({ name }), true, name);
  assert.equal(isHomePlace({ name: 'Trabalho' }), false);
  assert.equal(isHomePlace(undefined), false);
});

test('eventos: só as últimas 24 h, do mais novo ao mais velho', () => {
  const now = 1800000000;
  const list = eventsLast24h([{ tst: now - 90000 }, { tst: now - 100 }, { tst: now - 5000 }], now);
  assert.deepEqual(list.map((e) => e.tst), [now - 100, now - 5000]);
  assert.deepEqual(eventsLast24h(undefined, now), []);
});

test('pessoa: sem dado, recebida e posição antiga; zero continua zero no texto', () => {
  assert.deepEqual(personState({}), { kind: 'off', label: 'Sem dado' });
  assert.deepEqual(personState({ last: {} }), { kind: 'ok', label: 'Recebida' });
  assert.deepEqual(personState({ last: {}, stale: true }), { kind: 'warn', label: 'Posição antiga' });
  const name = (id) => (id === 'casa' ? 'Casa' : 'lugar removido');
  assert.equal(whereText({ place: 'casa' }, name), 'Em Casa');
  assert.equal(whereText({}, name), 'Aguardando o primeiro envio');
  assert.equal(whereText({ last: { vel: 5 } }, name), 'A caminho');
  assert.equal(whereText({ last: { vel: 0 } }, name), 'Fora dos lugares');
  assert.equal(whereText({ last: {} }, name), 'Fora dos lugares');
  assert.equal(batteryText({ bs: 2, conn: 'w' }), 'Carregando · Wi-Fi');
  assert.equal(batteryText({ bs: 3, conn: 'o' }), 'Carga completa · Sem rede no envio');
  assert.equal(batteryText({}), 'Rede não informada');
  assert.equal(distanceText(0), '0 m');
  assert.equal(distanceText(250), '250 m');
  assert.equal(distanceText(1500), '1,5 km');
  assert.equal(distanceText(null), '—');
});
