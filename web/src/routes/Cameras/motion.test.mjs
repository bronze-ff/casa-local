import assert from 'node:assert/strict';
import test from 'node:test';
import { FOREVER, byBell, dayLabel, eventSummary, groupByDay, isFresh, minutesOf, parseCameraParam, pausedText, visibleCameras } from './motion.js';

const cams = [{ id: 'cam1', group: 'externa' }, { id: 'cam2', group: 'interna' }, { id: 'cam3', group: 'externa' }];
const fmt = (t) => `h${t}`;

test('câmeras: sino primeiro; filtros por grupo; "movimento" e "todas" mostram todas', () => {
  assert.deepEqual(byBell(cams, ['cam3']).map((c) => c.id), ['cam3', 'cam1', 'cam2']);
  assert.deepEqual(visibleCameras(cams, 'externa', []).map((c) => c.id), ['cam1', 'cam3']);
  assert.deepEqual(visibleCameras(cams, 'interna', []).map((c) => c.id), ['cam2']);
  assert.equal(visibleCameras(cams, 'todas', []).length, 3);
  assert.equal(visibleCameras(cams, 'movimento', []).length, 3);
});

test('eventos: duração em minutos (mínimo 1), "agora" e disparos; novo só com sino e depois do visto da abertura', () => {
  assert.equal(minutesOf({ start: 0, end: 20 }), 1);
  assert.equal(minutesOf({ start: 0, end: 300 }), 5);
  assert.equal(minutesOf({ start: 0, end: null }), null);
  assert.equal(eventSummary({ start: 10, end: 190, count: 3 }, fmt), 'h10 · 3 min · 3 disparos');
  assert.equal(eventSummary({ start: 10, end: null, count: 1 }, fmt), 'h10 · agora');
  assert.equal(isFresh({ camera: 'cam1', start: 100 }, ['cam1'], { cam1: 50 }), true);
  assert.equal(isFresh({ camera: 'cam1', start: 40 }, ['cam1'], { cam1: 50 }), false);
  assert.equal(isFresh({ camera: 'cam2', start: 100 }, ['cam1'], { cam2: 50 }), false, 'sem sino não é "novo"');
  assert.equal(isFresh({ camera: 'cam1', start: 100 }, ['cam1'], undefined), false, 'sem referência do que era visto, nada é novo');
});

test('dias: Hoje, Ontem e data; agrupa mantendo a ordem', () => {
  const now = new Date(2026, 10, 2, 12, 0, 0);
  const at = (d, h) => new Date(2026, 10, d, h).getTime() / 1000;
  assert.equal(dayLabel(at(2, 8), now), 'Hoje');
  assert.equal(dayLabel(at(1, 8), now), 'Ontem');
  assert.match(dayLabel(at(30, 8) - 86400 * 7, now), /\d{2}\/\d{2}\/\d{4}/);
  const groups = groupByDay([{ id: 1, start: at(2, 11) }, { id: 2, start: at(2, 9) }, { id: 3, start: at(1, 20) }], now);
  assert.deepEqual(groups.map((g) => [g.label, g.events.length]), [['Hoje', 2], ['Ontem', 1]]);
});

test('links de fora: ao vivo, replay com horário, avisos, prefixo "cameras", ":" e "/"; o resto não faz nada', () => {
  assert.deepEqual(parseCameraParam('cam2', cams.concat({ id: 'cam2' })), { type: 'live', id: 'cam2' });
  assert.deepEqual(parseCameraParam('replay:cam1:1730000000', cams), { type: 'replay', id: 'cam1', start: 1730000000 });
  assert.deepEqual(parseCameraParam('cameras/replay/cam1/1730000000', cams), { type: 'replay', id: 'cam1', start: 1730000000 });
  assert.deepEqual(parseCameraParam('avisos', cams), { type: 'avisos' });
  assert.equal(parseCameraParam('replay:cam9:1730000000', cams), null, 'câmera que não existe');
  assert.equal(parseCameraParam('replay:cam1:abc', cams), null);
  assert.equal(parseCameraParam('', cams), null);
  assert.equal(parseCameraParam('desconhecida', cams), null);
});

test('pausa dos avisos: ativa, até reativar e vencida', () => {
  const today = new Date(2026, 10, 2, 12, 0, 0);
  const now = today.getTime() / 1000;
  assert.equal(pausedText(now - 5, now, today), null);
  assert.equal(pausedText(FOREVER, now, today), 'Pausado até reativar');
  assert.match(pausedText(now + 3600, now, today), /^Pausado até \d{2}:\d{2}$/);
  assert.match(pausedText(now + 3 * 86400, now, today), /^Pausado até \S+ \d{2}:\d{2}$/);
});
