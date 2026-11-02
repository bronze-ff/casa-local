import assert from 'node:assert/strict';
import test from 'node:test';

// Transporte: recibo em ApiError, renovação única de token, sem retry de comando. fetch falso, sem rede.
import * as api from './api.js';
const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

function fakeFetch(...responses) {
  const log = [];
  globalThis.fetch = async (path, options = {}) => {
    log.push(`${options.method || 'GET'} ${path}`);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return log;
}

test('exports públicos e assinatura antiga de ApiError continuam válidos', () => {
  for (const name of ['get', 'post', 'bootstrap', 'ApiError', 'createApi']) assert.ok(api[name], name);
  const legacy = new api.ApiError('m', 500, 'c');
  assert.equal(legacy.receipt, null);
  assert.equal(new api.ApiError('m', 502, 'c', { requestId: 'r' }).receipt.requestId, 'r');
});

test('erro HTTP copia o receipt do corpo para ApiError', async () => {
  const receipt = { requestId: 'r9', delivery: 'unknown', outcome: 'unconfirmed' };
  fakeFetch(json(502, { error: 'Resultado incerto', code: 'command_result_unknown', receipt }));
  await assert.rejects(api.get('/api/state'), (e) => e.status === 502 && e.code === 'command_result_unknown' && e.receipt.requestId === 'r9');
});

test('invalid_token renova UMA vez e repete o POST; segunda rejeição não gera laço', async () => {
  const log = fakeFetch(json(200, { csrfToken: 't1' }), json(403, { error: 'x', code: 'invalid_token' }), json(200, { csrfToken: 't2' }), json(200, { ok: true }));
  assert.deepEqual(await api.post('/api/x', {}), { ok: true });
  assert.deepEqual(log, ['GET /api/bootstrap', 'POST /api/x', 'GET /api/bootstrap', 'POST /api/x']);
  const again = fakeFetch(json(403, { error: 'x', code: 'invalid_token' }), json(200, { csrfToken: 't3' }), json(403, { error: 'x', code: 'invalid_token' }));
  await assert.rejects(api.post('/api/x', {}), (e) => e.code === 'invalid_token');
  assert.equal(again.length, 3, 'um POST, um bootstrap, um POST — nada além');
});

test('sem conexão no POST: uma tentativa só, erro offline (status 0), nenhum retry', async () => {
  const log = fakeFetch(json(200, { csrfToken: 't' }), new Error('rede'));
  await api.bootstrap();
  log.length = 0;
  fakeFetch(new Error('rede'));
  await assert.rejects(api.post('/api/devices/quarto-luz/commands', {}), (e) => e.status === 0 && e.code === 'offline');
});

test('502 de comando não é repetido pelo transporte', async () => {
  fakeFetch(json(200, { csrfToken: 't' }));
  await api.bootstrap();
  const log = fakeFetch(json(502, { error: 'x', code: 'command_result_unknown', receipt: { requestId: 'r' } }));
  await assert.rejects(api.post('/api/devices/quarto-luz/commands', {}), (e) => e.receipt.requestId === 'r');
  assert.equal(log.length, 1);
});

test('vários pedidos de token ao mesmo tempo compartilham UM bootstrap', async () => {
  const log = fakeFetch(json(200, { csrfToken: 'a' }));
  const [one, two] = await Promise.all([api.bootstrap(), api.bootstrap()]);
  assert.equal(one.csrfToken, two.csrfToken);
  assert.deepEqual(log, ['GET /api/bootstrap']);
});
