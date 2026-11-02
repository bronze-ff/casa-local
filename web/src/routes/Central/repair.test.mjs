import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createKeySession } from './keysession.js';
import { fieldViews, overview, runScene, stepEvidence, stepView, valueText } from './result.js';
import { count, setupRoute, skip } from '../harness.mjs';

// Reparo Crivo M5 (2 P2). Chaves e senhas são SINTÉTICAS. Backend simulado = o formato real de app.scene()/_step_result().
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise((r) => setImmediate(r));
const KEY_OLD = 'chave-sintetica-antiga';
const KEY_NEW = 'chave-sintetica-NOVA';

function keys() {
  const reads = []; const rotates = [];
  const session = createKeySession({ read: () => { const d = deferred(); reads.push(d); return d.promise; }, rotate: () => { const d = deferred(); rotates.push(d); return d.promise; } });
  return { session, reads, rotates };
}

test('P2-1: troca pendente → Fechar → Configurar → a resposta tardia NÃO revela a chave nova; o POST não se repete', async () => {
  const { session, reads, rotates } = keys();
  const first = session.open(); reads[0].resolve({ key: KEY_OLD }); assert.equal(await first, KEY_OLD);
  const rotating = session.rotate(); // usuário tocou em Trocar
  session.close(); // Fechar
  const reopened = session.open(); // Configurar de novo (nova leitura)
  rotates[0].resolve({ key: KEY_NEW }); // a resposta da troca chega tarde
  assert.equal(await rotating, null, 'descartada: nada de setShown(true) com a chave nova');
  reads[1].resolve({ key: KEY_NEW });
  assert.equal(await reopened, KEY_NEW, 'a chave só aparece pela leitura da sessão vigente (e sob "Mostrar chave")');
  assert.equal(rotates.length, 1, 'nenhuma troca repetida');
});

test('P2-1: troca pendente → Fechar → resposta tardia é descartada; desmontar a tela também', async () => {
  const closing = keys();
  const open1 = closing.session.open(); closing.reads[0].resolve({ key: KEY_OLD }); await open1;
  const rotate1 = closing.session.rotate();
  closing.session.close();
  closing.rotates[0].resolve({ key: KEY_NEW });
  assert.equal(await rotate1, null);
  const unmount = keys();
  const open2 = unmount.session.open(); unmount.reads[0].resolve({ key: KEY_OLD }); await open2;
  const rotate2 = unmount.session.rotate();
  unmount.session.close(); // cleanup do useEffect ao sair da rota
  unmount.rotates[0].resolve({ key: KEY_NEW });
  assert.equal(await rotate2, null);
});

test('P2-1: a leitura tardia também é descartada (fechar durante a leitura); erro de sessão velha não vira alerta', async () => {
  const a = keys();
  const reading = a.session.open();
  a.session.close();
  a.reads[0].resolve({ key: KEY_OLD });
  assert.equal(await reading, null);
  const b = keys();
  const failing = b.session.open();
  b.session.close();
  b.reads[0].reject(new Error('Sem conexão.'));
  assert.equal(await failing, null, 'sessão velha: silêncio');
  const c = keys();
  const current = c.session.open();
  c.reads[0].reject(new Error('Sem conexão.'));
  await assert.rejects(current, /Sem conexão/);
  const d = keys();
  const x = d.session.open(); d.reads[0].resolve({ key: KEY_OLD }); await x;
  const y = d.session.rotate(); d.rotates[0].resolve({ key: KEY_NEW });
  assert.equal(await y, KEY_NEW, 'sem fechar, a troca entrega a chave nova');
  const z = d.session.rotate(); d.rotates[1].resolve(null);
  assert.equal(await z, null, 'troca recusada não entrega nada');
});

test('P2-1: no componente, Mostrar só vem depois de uma troca VIGENTE e o desmonte invalida a sessão', () => {
  const source = readFileSync(new URL('./Shortcuts.jsx', import.meta.url), 'utf8');
  assert.match(source, /const value = await session\.rotate\(\);[^\n]*\n\s*if \(value\) \{ setKey\(value\); setShown\(true\); \}/);
  assert.equal(count(source, /setShown\(true\)/g), 2, 'só na troca vigente e no toque em "Mostrar chave"');
  assert.match(source, /useEffect\(\(\) => \(\) => session\.close\(\), \[session\]\)/);
  assert.match(source, /if \(open\) \{ session\.close\(\);/);
});

// Resposta real do backend: modo com 4 aparelhos (confirmado, divergente, falha com mensagem exclusiva, infravermelho aceito).
const receipt = (over) => ({ requestId: 'r', delivery: 'sent', stateVersion: null, outcome: 'unconfirmed', requested: {}, reported: {}, confirmedFields: [], divergedFields: [], observedAt: null, ...over });
const PARTIAL = {
  status: 'partial', evidenceSummary: { confirmed: 1, unconfirmed: 1, diverged: 1, notApplicable: 0, preview: 0, operationalFailures: 1 },
  results: [
    { deviceId: 'quarto-luz', status: 'sent', operation: 'accepted', evidence: 'confirmed', confirmationExpected: true, receipt: receipt({ outcome: 'confirmed', requested: { power: true, brightness: 80 }, reported: { power: true, brightness: 80 }, confirmedFields: ['brightness', 'power'], observedAt: 1 }) },
    { deviceId: 'banheiro-luz', status: 'sent', operation: 'accepted', evidence: 'diverged', confirmationExpected: true, receipt: receipt({ outcome: 'diverged', requested: { power: true, brightness: 80 }, reported: { power: true, brightness: 40 }, confirmedFields: ['power'], divergedFields: ['brightness'], observedAt: 1 }) },
    { deviceId: 'corredor-luz', status: 'failed', code: 'device_offline', message: 'Lâmpada do corredor sem resposta (mensagem exclusiva da fixture).', operation: 'failed', evidence: 'unconfirmed', confirmationExpected: true, receipt: receipt({ delivery: 'not_sent', requested: { power: true } }) },
    { deviceId: 'ar-quarto', status: 'sent', operation: 'accepted', evidence: 'unconfirmed', confirmationExpected: false, receipt: receipt({ requested: { power: true, temperature: 24, mode: 'cool', fan: 'auto' } }) },
  ],
};
const NAMES = { 'quarto-luz': 'Luz do quarto', 'banheiro-luz': 'Luz do banheiro', 'corredor-luz': 'Luz do corredor', 'ar-quarto': 'Ar do quarto' };
const nameOf = (id) => NAMES[id] || id;

test('P2-2 (puro): evidência por passo, por campo e o título do conjunto; parcial nunca parece sucesso', () => {
  assert.deepEqual(PARTIAL.results.map(stepEvidence), ['confirmed', 'diverged', 'failed', 'unconfirmed']);
  assert.equal(stepEvidence({ status: 'skipped', operation: 'skipped' }), 'skipped');
  assert.equal(stepEvidence({ status: 'preview', evidence: 'preview', operation: 'preview' }), 'preview');
  const fields = fieldViews(PARTIAL.results[1].receipt);
  assert.deepEqual(fields.map((f) => [f.field, f.state, f.requested, f.reported]), [['power', 'confirmed', 'ligado', 'ligado'], ['brightness', 'diverged', '80%', '40%']]);
  assert.deepEqual(fieldViews(PARTIAL.results[3].receipt).map((f) => [f.field, f.state, f.reported]), [['power', 'unconfirmed', null], ['temperature', 'unconfirmed', null], ['mode', 'unconfirmed', null], ['fan', 'unconfirmed', null]]);
  assert.deepEqual(fieldViews(null), []);
  assert.equal(valueText('mode', 'cool'), 'resfriar');
  assert.equal(valueText('temperature', 24), '24 °C');
  assert.equal(valueText('colorHex', '#FFD9A0'), '#FFD9A0');
  assert.equal(valueText('power', undefined), '—');
  assert.equal(overview(PARTIAL).title, 'Executado em parte');
  assert.equal(overview({ status: 'completed', evidenceSummary: { confirmed: 2, unconfirmed: 0 }, results: [] }).title, 'Confirmado');
  assert.equal(overview({ status: 'completed', evidenceSummary: { confirmed: 1, unconfirmed: 1 }, results: [] }).title, 'Enviado; parte sem confirmação física');
  assert.equal(overview({ status: 'completed', evidenceSummary: { confirmed: 0, unconfirmed: 2 }, results: [] }).title, 'Enviado; sem confirmação física');
  assert.equal(overview({ status: 'preview', evidenceSummary: { preview: 2 }, results: [] }).title, 'Simulado');
  assert.equal(overview({ status: 'completed', evidenceSummary: { diverged: 1 }, results: [] }).kind, 'warn', 'divergência sozinha já é aviso');
  assert.equal(stepView(PARTIAL.results[2], nameOf).reason, 'Nada foi enviado ao aparelho.');
});

test('P2-2 (puro): "Rodar" faz UM POST, devolve o resultado inteiro; erro vira null sem repetir', async () => {
  const calls = [];
  const shown = await runScene(async (path, body, ok) => { calls.push([path, body, ok]); return PARTIAL; }, { id: 'noite', name: 'Boa noite' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/scenes/noite/run');
  assert.equal(shown.result, PARTIAL, 'o corpo do servidor chega intacto à tela');
  assert.equal(await runScene(async () => null, { id: 'noite', name: 'Boa noite' }), null);
});

const render = (props) => { const t = setupRoute({}); const { ModeResult } = t.load(t.src('routes/Central/ModeResult.jsx')); return t.renderBare(t.h(ModeResult, { scene: { id: 'noite', name: 'Boa noite' }, nameOf, ...props })); };

test('P2-2 (componente real): resultado por aparelho e por campo, evidência, mensagem exclusiva de falha alcançável', { skip }, () => {
  const html = render({ result: PARTIAL, onClose() {} });
  assert.match(html, /Boa noite: Executado em parte/);
  assert.match(html, /1 confirmados · 1 sem confirmação · 1 divergentes · 1 falhas/);
  assert.match(html, /aria-label="Resultado de Boa noite por aparelho"/);
  assert.equal(count(html, /class="col tight cen-step"/g), 4, 'um item por aparelho');
  for (const name of Object.values(NAMES)) assert.match(html, new RegExp(`<b>${name}</b>`));
  assert.match(html, /class="st ok"[^>]*>.*?Confirmado/);
  assert.match(html, /class="st warn"[^>]*>.*?Divergente/);
  assert.match(html, /class="st err"[^>]*>.*?Falhou/);
  assert.match(html, /class="st sent"[^>]*>.*?Enviado · sem confirmação/);
  assert.match(html, /Lâmpada do corredor sem resposta \(mensagem exclusiva da fixture\)\./, 'a mensagem do servidor aparece inteira');
  assert.match(html, /Nada foi enviado ao aparelho\./);
  assert.match(html, /Brilho: pedido 80% · aparelho leu 40% · <b>divergente<\/b>/);
  assert.match(html, /Ligado: pedido ligado · aparelho leu ligado · <b>confirmado<\/b>/);
  assert.match(html, /Temperatura: pedido 24 °C · sem leitura depois · <b>sem confirmação<\/b>/);
  assert.match(html, /Modo: pedido resfriar/);
  assert.match(html, /Infravermelho não devolve confirmação/);
  assert.match(html, /Fechar resultado/);
  assert.ok(!/segredo|password|senha/i.test(html), 'nenhum segredo no resultado');
});

test('P2-2 (componente real): modo totalmente confirmado, simulado e pulado não inventam alarme nem confirmação', { skip }, () => {
  const ok = { status: 'completed', evidenceSummary: { confirmed: 1, unconfirmed: 0, diverged: 0, notApplicable: 0, preview: 0, operationalFailures: 0 }, results: [PARTIAL.results[0]] };
  const done = render({ result: ok });
  assert.match(done, /Boa noite: Confirmado/);
  assert.ok(!/Infravermelho não devolve/.test(done));
  assert.ok(!/Fechar resultado/.test(done), 'sem onClose não há botão');
  const preview = render({ result: { status: 'preview', evidenceSummary: { preview: 1 }, results: [{ deviceId: 'quarto-luz', status: 'preview', operation: 'preview', evidence: 'preview', message: 'Simulado na prévia.', receipt: receipt({ outcome: 'preview', requested: { power: true } }) }] } });
  assert.match(preview, /Boa noite: Simulado/);
  assert.match(preview, /class="st sim"[^>]*>.*?Simulado/);
  assert.ok(!/Infravermelho não devolve/.test(preview));
  const skipped = render({ result: { status: 'completed', evidenceSummary: { notApplicable: 1 }, results: [{ deviceId: 'ar-quarto', status: 'skipped', message: 'Já estava ligado; mantido como está.', operation: 'skipped', evidence: 'not_applicable', receipt: null }] } });
  assert.match(skipped, /Já estava como pedido/);
  assert.match(skipped, /Já estava ligado; mantido como está\./);
  assert.match(render({ result: { status: 'completed', evidenceSummary: {}, results: [] } }), /não devolveu o resultado de nenhum aparelho/);
});

test('P2-2: a tela de Modos usa runScene + ModeResult com o corpo do servidor (sem o resumo genérico) e não mostra resultado antes de rodar', { skip }, () => {
  const source = readFileSync(new URL('./Modes.jsx', import.meta.url), 'utf8');
  assert.match(source, /const shown = await runScene\(run, scene\); if \(shown\) setLast\(shown\)/);
  assert.match(source, /<ModeResult scene=\{last\.scene\} result=\{last\.result\}/);
  assert.match(source, /onClick=\{\(\) => play\(m\)\}>Rodar/);
  const t = setupRoute({ home: null });
  const { Modes } = t.load(t.src('routes/Central/Modes.jsx'));
  const html = t.renderBare(t.h(Modes, { modes: [{ id: 'noite', name: 'Boa noite', icon: 'moon', description: '' }], devices: [], routines: [], blocked: false, reason: null }));
  assert.ok(!/cen-step|Executado em parte|Resultado de/.test(html));
  assert.match(html, />Rodar</);
});
