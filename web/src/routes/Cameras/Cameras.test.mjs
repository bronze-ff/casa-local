import assert from 'node:assert/strict';
import test from 'node:test';
import { CAMS, count, setupCameras, skip } from './harness.mjs';

// Paridade de Câmeras (spec §3, #/cameras[/param]): grade com filtros e idade, ao vivo MSE/MJPEG, replay/timeline/eventos,
// vistos/novos, avisos por câmera e por computador, deep links, bandeja só com foto. Sem escrita ao abrir; mídia presa à visibilidade.
const opts = { skip };
const MOTION = { data: { connected: true, dvrOffset: 0, unseen: 2, unseenBy: { cam1: 2 }, seenBy: { cam1: 100 }, notify: ['cam3'], events: [{ id: 'm1', camera: 'cam1', start: 1730000000, end: null, count: 3, photo: true }, { id: 'm0', camera: 'cam3', start: 1729990000, end: 1729990300, count: 1 }] }, reload() {} };
const polls = (extra = {}) => ({ '/api/cameras': { data: { available: true, cameras: CAMS }, reload() {} }, '/api/motion': MOTION, '/api/alert-devices': { data: { now: 1730000000, devices: [] }, reload() {} }, ...extra });
const render = ({ param, ...over } = {}) => {
  const t = setupCameras({ polls: polls(), ...over });
  return { t, html: t.render(t.mod('Cameras/Cameras.jsx').default, { param }) };
};

test('grade: um botão por câmera com nome, sino das avisadas e selo de movimento; só quadros, nunca vídeo', opts, () => {
  const { html } = render();
  assert.equal(count(html, /class="tile"/g), 4);
  for (const cam of CAMS) assert.match(html, new RegExp(`aria-label="Abrir ${cam.name} ao vivo"`));
  assert.match(html, /aria-label="Avisa movimento"/, 'sino da câmera avisada (Interna 1)');
  assert.match(html, />Movimento</, 'câmera com evento em andamento');
  assert.match(html, /Vídeo só ao abrir uma câmera/);
  assert.match(html, /Movimento \(2\)/, 'o filtro mostra quantos movimentos novos');
  assert.ok(!/<video/.test(html), 'a grade nunca carrega vídeo');
  assert.match(html, /aria-label="Atualizar imagens agora"/);
  assert.match(html, /4 de 4/);
  assert.ok(html.indexOf('Interna 1') < html.indexOf('Externa 1'), 'câmera com sino vem primeiro');
});

test('estados: carregando, sem go2rtc, sem conexão, prévia e erro; cada um explica e não inventa câmera', opts, () => {
  assert.match(render({ polls: polls({ '/api/cameras': { data: null, error: null, reload() {} } }) }).html, /Abrindo câmeras…/);
  const down = render({ polls: polls({ '/api/cameras': { data: { available: false, cameras: [] }, reload() {} } }) }).html;
  assert.match(down, /Câmeras indisponíveis/);
  assert.match(down, /go2rtc/);
  assert.match(down, />Verificar</);
  assert.ok(!/class="tile"/.test(down));
  assert.match(render({ polls: polls({ '/api/cameras': { data: { available: true, cameras: CAMS }, stale: true, reload() {} } }) }).html, /Sem conexão com as câmeras/);
  assert.match(render({ polls: polls({ '/api/cameras': { data: null, error: new Error('Falha 502'), reload() {} } }) }).html, /Não foi possível ler as câmeras[\s\S]*Falha 502/);
  const preview = render({ home: { mode: 'preview', devices: [] } }).html;
  assert.match(preview, /As câmeras só funcionam no modo local/);
  assert.ok(!/class="tile"/.test(preview));
  const lost = render({ stateError: new Error('x') }).html;
  assert.match(lost, /Visto, sinos e avisos ficam bloqueados/);
});

test('abrir a tela só LÊ: nenhuma escrita; leituras só de /api/cameras e /api/motion (e avisos dentro de Movimento)', opts, () => {
  const { t } = render();
  assert.deepEqual(t.posts, []);
  assert.ok(t.gets.every((p) => ['/api/cameras', '/api/motion'].includes(p)), t.gets.join(','));
});

test('movimento: dia, duração/"agora", disparos, Novo só com sino, marcar visto é BOTÃO; abrir a lista não escreve', opts, () => {
  const t = setupCameras({ polls: polls() });
  const { Motion } = t.mod('Cameras/Motion.jsx');
  const html = t.bare(t.h(Motion, { cameras: CAMS, motion: MOTION, onOpen() {}, openAlerts: false, blocked: false }));
  assert.match(html, /Recebendo eventos do DVR/);
  assert.match(html, /· agora · 3 disparos/);
  assert.match(html, /5 min/);
  assert.match(html, /2 movimentos novos em Externa 1/);
  assert.match(html, />Marcar tudo como visto</);
  assert.match(html, /aria-label="Ver a gravação de Externa 1 às/);
  assert.match(html, /\/api\/motion\/m1\.jpg/);
  assert.match(html, /role="group" aria-label="Filtrar por câmera"/);
  assert.match(html, /aria-label="Onde avisar"|Onde avisar/);
  assert.deepEqual(t.posts, [], 'nada é escrito ao abrir a lista');
  const blocked = t.bare(t.h(Motion, { cameras: CAMS, motion: MOTION, onOpen() {}, openAlerts: false, blocked: true }));
  assert.match(blocked, /disabled=""[^>]*>[\s\S]*?Marcar tudo como visto/);
  assert.match(blocked, /Sem conexão com o painel\./);
  const empty = t.bare(t.h(Motion, { cameras: CAMS, motion: { data: { connected: false, error: 'DVR fora', events: [], unseen: 0 }, reload() {} }, onOpen() {}, blocked: false }));
  assert.match(empty, /DVR fora/);
  assert.match(empty, /Nenhum movimento nas câmeras nas últimas 24 h/);
});

test('onde avisar: computadores, modo, câmeras, tela cheia, pausa; remover pede confirmação; sem computador explica', opts, () => {
  const t = setupCameras({ polls: polls({ '/api/alert-devices': { data: { now: 1730000000, devices: [{ id: 'd1', name: 'PC da sala', online: true, busy: false, mode: 'some', cameras: ['cam1'], game: true, pausedUntil: 0 }, { id: 'd2', name: 'Notebook', online: false, busy: false, mode: 'watched', cameras: [], game: false, pausedUntil: 4102444800 }] }, reload() {} } }) });
  const { AlertDevices } = t.mod('Cameras/AlertDevices.jsx');
  const html = t.bare(t.h(AlertDevices, { cameras: CAMS, open: true, blocked: false }));
  assert.match(html, /<details[^>]*open=""/);
  assert.match(html, /2 computadores/);
  assert.match(html, /PC da sala/);
  assert.match(html, /conectado/);
  assert.match(html, /desligado/);
  assert.match(html, /role="radiogroup" aria-label="Câmeras que avisam em PC da sala"/);
  assert.match(html, /aria-pressed="true"[^>]*>Externa 1/);
  assert.match(html, /Segurar com jogo ou vídeo em tela cheia/);
  assert.match(html, />1 h</);
  assert.match(html, />Até reativar</);
  assert.match(html, /Remover PC da sala/);
  assert.ok(!/Remover mesmo/.test(html), 'a confirmação só existe depois do primeiro toque');
  assert.match(html, /Pausado até reativar/);
  assert.match(html, />Reativar</);
  const none = setupCameras({ polls: polls() });
  assert.match(none.bare(none.h(none.mod('Cameras/AlertDevices.jsx').AlertDevices, { cameras: CAMS })), /Nenhuma bandeja se apresentou ainda/);
});

test('replay: deep link NÃO abre sessão sozinho (pede "Buscar gravação"); toque do usuário começa; linha do tempo é slider acessível', opts, () => {
  const t = setupCameras({ polls: polls() });
  const { Replay } = t.mod('Cameras/Replay.jsx');
  const window_ = { camera: CAMS[0], start: 1000, from: 970, to: 1160, offset: 0 };
  globalThis.window = { MediaSource: class {} }; // navegador com MSE
  const link = t.bare(t.h(Replay, { ...window_, autoStart: false, close() {}, goLive() {} }));
  assert.match(link, /Esta gravação só é buscada no DVR quando você pedir/);
  assert.match(link, />Buscar gravação</);
  assert.match(link, /role="slider"[^>]*aria-label="Linha do tempo da gravação"/);
  assert.match(link, /aria-label="Voltar 30 segundos"/);
  assert.match(link, /aria-label="Avançar 30 segundos"/);
  assert.match(link, /disabled=""[^>]*aria-label="Pausar"|aria-label="Pausar"/);
  assert.deepEqual(t.posts, [], 'nada foi aberto no servidor');
  const tap = t.bare(t.h(Replay, { ...window_, autoStart: true, close() {}, goLive() {} }));
  assert.match(tap, /Buscando a gravação no DVR…/);
  delete globalThis.window;
  const none = setupCameras({ polls: polls() });
  assert.match(none.bare(none.h(none.mod('Cameras/Replay.jsx').Replay, { ...window_, autoStart: true, close() {}, goLive() {} })), /Este navegador não toca a gravação/);
});

test('ao vivo: moldura com nome e canal, estado, "Rever 1 min", anterior/próxima; sem MSE cai no MJPEG; oculto diz pausado', opts, () => {
  const t = setupCameras({ polls: polls() });
  const { Live } = t.mod('Cameras/Live.jsx');
  const props = { cameras: CAMS, index: 0, poster: 'blob:p', move() {}, close() {}, rewind() {} };
  const mjpeg = t.bare(t.h(Live, props));
  assert.match(mjpeg, /aria-label="Ao vivo: Externa 1"/);
  assert.match(mjpeg, /Canal 1/);
  assert.match(mjpeg, />Conectando</);
  assert.match(mjpeg, /Rever 1 min/);
  assert.match(mjpeg, /aria-label="Câmera anterior"/);
  assert.match(mjpeg, /aria-label="Próxima câmera"/);
  assert.match(mjpeg, /alt="Imagem ao vivo: Externa 1"/, 'sem MSE: MJPEG');
  assert.ok(!/<video/.test(mjpeg));
  globalThis.window = { MediaSource: class {} };
  const mse = t.bare(t.h(Live, props));
  assert.match(mse, /<video[^>]*aria-label="Vídeo ao vivo: Externa 1"/);
  delete globalThis.window;
  const hidden = setupCameras({ polls: polls(), visible: false });
  assert.match(hidden.bare(hidden.h(hidden.mod('Cameras/Live.jsx').Live, props)), /Pausado \(aba oculta\)/);
  assert.match(t.bare(t.h(Live, { ...props, cameras: [CAMS[0]] })), /disabled=""[^>]*aria-label="Câmera anterior"/);
});

test('bandeja: abre o mesmo ao vivo do navegador, com "Rever 1 min"', opts, () => {
  const t = setupCameras({ polls: polls(), layout: 'tray' });
  const { Live } = t.mod('Cameras/Live.jsx');
  const html = t.bare(t.h(Live, { cameras: CAMS, index: 0, poster: 'blob:p', move() {}, close() {}, rewind() {} }));
  assert.match(html, /aria-label="Ao vivo: Externa 1"/);
  assert.match(html, /Rever 1 min/);
  assert.equal(t.mod('Cameras/Live.jsx').FrameView, undefined, 'o quadro parado da bandeja acabou');
});
