import assert from 'node:assert/strict';
import test from 'node:test';
import { backupState, countServices, groupDevices, historySpan, missingWatched, pickNodes, pollEvery, readingIsOld, resultText, reasonText, serviceUrl, seriesOf, sparkOf, switchEnded, topoLayout, MAX_NODES } from './lab.js';

const dev = (n, extra = {}) => ({ id: `d${n}`, label: `Aparelho ${n}`, known: true, watched: false, online: true, ...extra });

test('ritmo: rápido só enquanto há passo de troca', () => {
  assert.equal(pollEvery('Parando serviços'), 2000);
  assert.equal(pollEvery(null), 8000);
});

test('histórico real: colunas do servidor, null não vira zero, sem amostras suficientes não há linha', () => {
  const history = [[1000, 10, 40, 50, 2], [1060, null, 42, null, 3], [1120, 30, 44, 55, null]];
  assert.deepEqual(seriesOf(history, 'cpu').map((s) => s.v), [10, 30]);
  assert.deepEqual(seriesOf(history, 'gpu').map((s) => s.v), [50, 55]);
  assert.deepEqual(seriesOf(history, 'wsl').map((s) => s.v), [2, 3]);
  assert.deepEqual(seriesOf(undefined, 'cpu'), []);
  assert.deepEqual(seriesOf([[1, 0, 0, 0, 0]], 'cpu').map((s) => s.v), [0], 'zero real continua zero');
  assert.equal(sparkOf([[1, 5, 5, 5, 5]], 'cpu', 100), '', 'uma amostra não desenha linha');
  assert.notEqual(sparkOf(history, 'mem', 100), '');
  assert.equal(historySpan(history, 'cpu'), '2 min');
  assert.equal(historySpan([[0, 1, 1, 1, 1], [7200, 1, 1, 1, 1]], 'cpu'), '2 h');
  assert.equal(historySpan([], 'cpu'), null);
});

test('idade da leitura e do backup', () => {
  const now = 1_000_000 * 1000;
  assert.equal(readingIsOld(1_000_000 - 30, now), false);
  assert.equal(readingIsOld(1_000_000 - 500, now), true);
  assert.equal(readingIsOld(0, now), false, 'sem leitura não é "antiga"');
  assert.equal(backupState(null), null);
  assert.equal(backupState({ last: 0 }, now).kind, 'fail');
  assert.equal(backupState({ last: 1_000_000 - 3600 }, now).kind, 'ok');
  assert.equal(backupState({ last: 1_000_000 - 200000 }, now).label, 'atrasado');
});

test('modo jogo: motivo, contagem sem tratar desconhecido como parado e resultado só ao fim do passo', () => {
  assert.equal(reasonText('auto:Baldurs.exe'), 'Entrou sozinho: Baldurs.exe aberto');
  assert.equal(reasonText(''), 'Ligado por você');
  const services = [{ state: 'running' }, { state: 'stopped' }, { state: 'unknown' }];
  assert.deepEqual(countServices(services), { total: 3, running: 1, unknown: 1, stopped: 1 });
  assert.equal(switchEnded('Parando', null), true);
  assert.equal(switchEnded(null, null), false);
  assert.equal(switchEnded('Parando', 'Limpando cache'), false);
  assert.match(resultText('jogo', services), /1 serviço parado, 1 seguem/);
  assert.match(resultText('lab', services), /1 de 3 serviços rodando/);
});

test('link do serviço segue a regra antiga (path/https pelo Tailscale; tls/http pelo endereço atual)', () => {
  const link = (kind, target) => ({ link: { kind, target } });
  assert.equal(serviceUrl({}, 'pc.ts.net', 'casa.local'), null);
  assert.equal(serviceUrl(link('path', '/x'), 'pc.ts.net', 'casa.local'), 'https://pc.ts.net/x');
  assert.equal(serviceUrl(link('https', 8443), '', 'casa.local'), 'https://casa.local:8443');
  assert.equal(serviceUrl(link('tls', 9), 'pc.ts.net', 'casa.local'), 'https://casa.local:9');
  assert.equal(serviceUrl(link('http', 80), 'pc.ts.net', 'casa.local'), 'http://casa.local:80');
});

test('rede: grupos, vigiados sem resposta e topologia (máx. 10, atenção primeiro, dentro do quadro)', () => {
  const devices = Array.from({ length: 14 }, (_, i) => dev(i));
  devices[12] = dev(12, { known: false });
  devices[13] = dev(13, { watched: true, online: false });
  const { shown, hidden } = pickNodes(devices);
  assert.equal(shown.length, MAX_NODES);
  assert.equal(hidden, 4);
  assert.deepEqual(shown.slice(0, 2).map((d) => d.id), ['d12', 'd13']);
  const groups = groupDevices(devices);
  assert.equal(groups.fresh.length, 1);
  assert.equal(groups.watched.length, 1);
  assert.equal(groups.others.length, 12);
  assert.equal(missingWatched(devices), 1);
  for (const count of [0, 1, 4, 10]) {
    const spots = topoLayout(count);
    assert.equal(spots.length, count);
    assert.ok(spots.every(({ x, y }) => x >= 0 && x <= 100 && y >= 0 && y <= 100));
    assert.equal(new Set(spots.map(({ x, y }) => `${x}:${y}`)).size, count);
  }
});
