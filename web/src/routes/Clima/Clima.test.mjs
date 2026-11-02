import assert from 'node:assert/strict';
import test from 'node:test';
import { AR, HOME, LIGHT, count, setupRoute, skip } from '../harness.mjs';

// Paridade de Clima (spec §3, #/clima): ar IR estimado, 17–30 só nas combinações cobertas, modos/ventilação aprendidos,
// extras (Turbo/Eco/Brisa/Display), aprender, timer, energia estimada. Estado IR sempre estimado ou desconhecido.
const opts = { skip };
const OK = { power: true, temperature: 22, mode: 'cool', fan: 'auto' };
const idle = { data: null, error: null, stale: false, reload() {} };
const polls = (extra = {}) => ({
  '/api/routines': { data: { timers: [], lastError: null }, reload() {} },
  '/api/energy': { data: { today: { cost: 2.76, hours: 4.5, kwh: 3.1 }, month: { cost: 36.49, hours: 62, kwh: 41 }, config: { watts: 700, tariff: 0.89 } }, reload() {} },
  ...extra,
});
const render = (state = OK, { device = {}, over = {}, pollsOver } = {}) => {
  const { home: homeExtra, ...rest } = over;
  const t = setupRoute({ home: HOME([LIGHT('quarto-luz', 'quarto-luz', { power: false }), AR(state, device)], homeExtra), polls: pollsOver || polls(), ...rest });
  return t.render(t.load(t.src('routes/Clima/Clima.jsx')).default);
};

test('o ar é ESTIMADO: número do dial, selo "Estimado" e aviso de que o ar não confirma', opts, () => {
  const html = render();
  assert.match(html, /role="slider"[^>]*aria-label="Temperatura do ar"/);
  assert.match(html, /aria-valuenow="22"/);
  assert.match(html, /aria-valuetext="22 graus"/);
  assert.match(html, /22<sup>°<\/sup>/);
  assert.match(html, /Estimado/);
  assert.match(html, /O ar não confirma o que recebeu por infravermelho/);
  assert.match(html, /Ligado · estimado/);
  assert.ok(!/Confirmado/.test(html), 'nada do ar é confirmado');
});

test('estado desconhecido: dial sem valor, nada de zero ou desligado inventado, ligar no padrão aprendido', opts, () => {
  const html = render({ power: null, temperature: null, mode: null, fan: null });
  assert.match(html, /aria-valuetext="desconhecido"/);
  assert.match(html, /Estado estimado desconhecido/);
  assert.match(html, /Ligar em 24 °C · resfriar · auto/);
  assert.ok(!/Desligado · estimado/.test(html));
});

test('cobertura esparsa: modo sem sinal desabilitado; ± só até o próximo valor aprendido', opts, () => {
  const html = render({ ...OK, temperature: 24 });
  assert.match(html, /role="radio" aria-checked="false" tabindex="-1" disabled=""[^>]*>Calor</, 'aquecer não tem sinal aprendido');
  assert.match(html, /aria-checked="true" tabindex="0"[^>]*>Frio</);
  assert.match(html, /aria-label="Aumentar temperatura"[^>]*disabled=""/, '24 é o maior valor aprendido');
  assert.doesNotMatch(html, /aria-label="Diminuir temperatura"[^>]*disabled=""/);
  assert.match(html, /role="radio" aria-checked="false" tabindex="-1" disabled=""[^>]*>Alta</, 'ventilação alta sem sinal');
});

test('modo sem temperatura: mostra "Auto", o ar decide, e o dial fica travado', opts, () => {
  const html = render({ power: true, temperature: 24, mode: 'fan', fan: 'auto' }, { device: { irClimate: { coverage: { fan: { auto: [24] } }, templess: ['fan/auto'], off: true } } });
  assert.match(html, />Auto</);
  assert.match(html, /o ar decide/);
  assert.match(html, /Neste modo o controle não envia temperatura/);
  assert.match(html, /class="dial off"/);
});

test('desligar: sem sinal de desligar aprendido o botão trava e explica; com sinal, envia', opts, () => {
  assert.match(render(OK, { device: { irClimate: { coverage: { cool: { auto: [22] } }, off: false } } }), /Desligar ainda não foi aprendido/);
  assert.match(render(), /Desligar o ar/);
  assert.match(render({ ...OK, power: false }), /Ligar o ar/);
});

test('funções extras, timer e aprender estão ao alcance; energia é estimada', opts, () => {
  const html = render();
  assert.match(html, /aria-haspopup="dialog"[^>]*>.*Funções extras/);
  assert.match(html, /aria-haspopup="dialog"[^>]*>.*Timer/);
  assert.match(html, />Aprender</);
  assert.match(html, /Gasto do ar/);
  assert.match(html, /≈ R\$[\s\u00a0]2,76/);
  assert.match(html, /não é medição elétrica|usar o controle original muda o real/);
  assert.match(html, /Estimado/);
  assert.match(html, /Cadastro: 12 aprendido neste controle/);
  assert.match(html, /Perfil ainda não confirmado olhando o ar/);
});

test('prévia: simulado, sem IR e sem aprender; sem conexão avisa e bloqueia', opts, () => {
  const preview = render(OK, { over: { home: { mode: 'preview' } } });
  assert.match(preview, /Prévia: os comandos são simulados e nenhum sinal IR é enviado/);
  const learn = preview.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/svg>Aprender(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0];
  assert.ok(learn, 'botão Aprender existe');
  assert.match(learn.split('>')[0], /disabled=""/);
  assert.match(learn, /Aprender só funciona no modo local/);
  const off = render(OK, { over: { stateError: new Error('x') } });
  assert.match(off, /Sem conexão com o PC de casa/);
  assert.match(off, /Os comandos ficam bloqueados/);
  assert.match(render(OK, { device: { connection: 'offline' } }), /Sem conexão com a central IR\./);
  assert.match(render(OK, { device: { configured: false } }), /Configure o ar e a central IR no PC de casa\./);
});

test('aparelho ausente e carregando são honestos', opts, () => {
  const t = setupRoute({ home: HOME([LIGHT('quarto-luz', 'quarto-luz', { power: false })]), polls: polls() });
  assert.match(t.render(t.load(t.src('routes/Clima/Clima.jsx')).default), /Ar do quarto indisponível/);
  const loading = setupRoute({ home: null });
  assert.match(loading.render(loading.load(loading.src('routes/Clima/Clima.jsx')).default), /role="status"/);
});

// ---- painéis dos overlays, renderizados direto (o diálogo só existe aberto) ----
const panels = (name, props) => { const t = setupRoute({}); return t.renderBare(t.h(t.load(t.src(`routes/Clima/${name}.jsx`))[name === 'Extras' ? 'ExtrasPanel' : 'TimerPanel'], props)); };

test('extras: Turbo, Eco, Brisa e Display sempre alcançáveis; não aprendido explica; aprendido liga', opts, () => {
  const ir = { extras: { eco: true, display: true }, turbo: true };
  const html = panels('Extras', { ir, state: { power: true, turbo: false }, learning: false, canLearn: true, disabled: false, busy: false, onTurbo() {}, onKey() {}, onLearn() {} });
  for (const label of ['Turbo', 'Eco', 'Brisa', 'Display']) assert.match(html, new RegExp(`<b>${label}`));
  assert.match(html, /Brisa ainda não foi aprendido/, 'Brisa sem sinal: desabilitada com motivo');
  assert.equal(count(html, /disabled=""/g), 1, 'só a Brisa trava');
  assert.match(html, /Estimado/);
  assert.match(html, /Alterna no aparelho/);
  const noDisplay = panels('Extras', { ir: { extras: { eco: true } }, state: { power: true }, learning: false, canLearn: true, disabled: false, busy: false, onTurbo() {}, onKey() {}, onLearn() {} });
  assert.match(noDisplay, /Display ainda não foi aprendido\. Use Aprender\./);
  const learning = panels('Extras', { ir: { extras: { eco: true } }, state: {}, learning: true, canLearn: true, disabled: true, busy: false, onTurbo() {}, onKey() {}, onLearn() {} });
  assert.equal(count(learning, /Gravar/g), 3, 'em Aprender, cada função sem sinal pode ser gravada');
  assert.match(learning, /Regravar/);
  assert.match(learning, /Sem confirmação|sem confirmação/);
});

test('timer: opções 30 min a 4 h; sem ar ligado explica; com timer mostra a hora e cancelar; falha do agendador aparece', opts, () => {
  const routines = { data: { timers: [{ device: 'ar-quarto', at: 1730000000, attempts: 2 }], lastError: 'agendador caiu' }, reload() {} };
  const timer = routines.data.timers[0];
  const html = panels('Timer', { routines, timer, state: { power: true }, device: { configured: true }, preview: false, busy: false, onSet() {} });
  for (const text of ['30 min', '1 h', '2 h', '4 h']) assert.match(html, new RegExp(`>${text}<`));
  assert.match(html, /Desliga às/);
  assert.match(html, /Cancelar timer/);
  assert.match(html, /Tentando desligar de novo depois de uma falha/);
  assert.match(html, /Falha no agendador/);
  assert.match(html, /agendador caiu/);
  const off = panels('Timer', { routines: { data: { timers: [] }, reload() {} }, timer: undefined, state: { power: false }, device: { configured: true }, preview: false, busy: false, onSet() {} });
  assert.match(off, /Só dá para programar com o ar ligado/);
  assert.match(off, /Nenhum desligamento programado/);
  assert.match(panels('Timer', { routines: { data: { timers: [] }, reload() {} }, state: { power: true }, device: { configured: true }, preview: true, busy: false, onSet() {} }), /Timers ficam indisponíveis na prévia/);
  assert.match(panels('Timer', { routines: { ...idle, stale: true, data: { timers: [] } }, state: { power: true }, device: { configured: true }, preview: false, busy: false, onSet() {} }), /Sem conexão com o agendador/);
});

test('energia: carregando, sem conexão e dados, sempre como estimativa', opts, () => {
  const t = setupRoute({});
  const { EnergyCard } = t.load(t.src('routes/Clima/Energy.jsx'));
  assert.match(t.renderBare(t.h(EnergyCard, { energy: idle })), /Carregando a estimativa/);
  assert.match(t.renderBare(t.h(EnergyCard, { energy: { ...idle, error: new Error('x') } })), /Sem conexão para a estimativa de energia/);
  const data = { today: { cost: 1, hours: 2, kwh: 3 }, month: { cost: 4, hours: 5, kwh: 6 }, config: { watts: 700, tariff: 0.9 } };
  const html = t.renderBare(t.h(EnergyCard, { energy: { ...idle, data, stale: true } }));
  assert.match(html, /≈/);
  assert.match(html, /Estimado/);
  assert.match(html, /Sem conexão: mostrando a última estimativa/);
  assert.match(t.renderBare(t.h(EnergyCard, { energy: { ...idle, data }, preview: true })), /Simulado/);
});
