import assert from 'node:assert/strict';
import test from 'node:test';
import { HOME, LIGHT, count, setupRoute, skip } from '../harness.mjs';

// Paridade do Lab (spec §3, #/lab): modo manual/automático/jogos, serviços, CPU/RAM/GPU/discos/WSL com histórico real,
// rede (varredura MANUAL, nome, "é meu", vigia, remoção em dois passos) e topologia nomeada. SSR com a casa falsa.
const opts = { skip };
const now = () => Math.floor(Date.now() / 1000);
const LAB = (extra = {}) => ({
  enabled: true, mode: 'lab', reason: '', since: now() - 3600, step: null, auto: false, games: ['Jogo A'], gamesOpen: [], host: 'pc.ts.net', wsl: true, checked: now() - 20, backups: { last: now() - 7200, count: 3, sizeMb: 120 },
  services: [{ id: 'media', name: 'Servidor de mídia', purpose: 'Filmes', keep: false, state: 'running', link: { kind: 'https', target: 8920 } }, { id: 'dns', name: 'DNS local', purpose: 'Bloqueio', keep: true, state: 'running', link: null }],
  stats: { cpu: 0, memory: { used: 41, totalGb: 16 }, gpu: { temp: 52, use: 3, memUsed: 1024, memTotal: 8192 }, wslGb: 2.5, disks: [{ drive: 'C', label: 'Sistema', freeGb: 90, used: 60 }, { drive: 'D', label: 'Mídia', freeGb: 5, used: 92 }] },
  history: [[now() - 600, 10, 40, 50, 2], [now() - 300, 0, 41, 52, 2.5], [now(), 20, 42, 54, 2.5]], ...extra,
});
const NET = (extra = {}) => ({ scanned: now() - 60, scanning: false, online: 2, learningUntil: null, error: null, devices: [
  { id: 'aaaaaaaaaaaa', label: 'Celular da Lorena', name: 'Celular da Lorena', known: true, watched: true, online: true, ip: '192.168.0.10', mac: 'aa:bb' },
  { id: 'bbbbbbbbbbbb', label: 'Aparelho sem nome', known: false, watched: false, online: true, ip: '192.168.0.11', mac: 'cc:dd', firstSeen: now() - 90 },
  { id: 'cccccccccccc', label: 'Impressora', name: 'Impressora', known: true, watched: true, online: false, ip: '192.168.0.12', mac: 'ee:ff', lastSeen: now() - 7200 }] , ...extra });
const ok = (data) => ({ data, error: null, stale: false, at: Date.now(), reload() {} });
const render = ({ lab = LAB(), net = NET(), layout = 'desktop', home, ...over } = {}) => {
  const t = setupRoute({ home: home || HOME([LIGHT('quarto-luz', 'quarto-luz', { power: false })]), layout, polls: { '/api/homelab': lab === null ? { data: null, error: null, reload() {} } : ok(lab), '/api/network': ok(net) }, ...over });
  return t.render(t.load(t.src('routes/Lab/Lab.jsx')).default, {});
};

test('máquina: zero real continua zero; ausente vira —; idade da leitura e histórico real aparecem', opts, () => {
  const html = render();
  assert.match(html, /aria-label="Máquina"/);
  assert.match(html, /lido há 20 s/);
  assert.match(html, /CPU<\/span><span class="num">0<span class="u">%/);
  assert.match(html, /aria-label="CPU: histórico de 10 min"/);
  assert.match(html, /D: Mídia/);
  assert.match(html, /role="meter" aria-label="Disco D"/);
  const unknown = render({ lab: LAB({ stats: { disks: [] }, history: [] }) });
  assert.match(unknown, /CPU<\/span><span class="num">—</);
  assert.match(unknown, /sem leitura da GPU/);
  assert.match(unknown, /sem histórico suficiente/);
  assert.ok(!/aria-label="CPU: histórico/.test(unknown));
  assert.match(render({ lab: LAB({ checked: now() - 900 }) }), /A leitura está antiga/);
});

test('backup: com idade real; sem backup e atrasado são avisos em texto', opts, () => {
  assert.match(render(), /Último há 2 h · 3 guardados · 120 MB no HD D:/);
  assert.match(render({ lab: LAB({ backups: { last: 0, count: 0 } }) }), /sem backup/);
  assert.match(render({ lab: LAB({ backups: { last: now() - 200000, count: 1 } }) }), /atrasado/);
});

test('modo do PC: o que para e o que segue, manual e automático, jogos; passo mostra Trocando e bloqueia', opts, () => {
  const html = render({ lab: LAB({ auto: true, gamesOpen: ['Jogo A'] }) });
  assert.match(html, /Param/);
  assert.match(html, /Continuam ligados/);
  assert.match(html, /role="radiogroup" aria-label="Modo do PC"/);
  assert.match(html, /aria-checked="true" tabindex="0"[^>]*>Home lab</);
  assert.match(html, /role="switch"[^>]*aria-label="Modo jogo automático"/);
  assert.match(html, /Jogo A · aberto/);
  assert.match(html, /Home lab ligado: 2 de 2 serviços rodando · WSL usando 2.5 GB/);
  const switching = render({ lab: LAB({ step: 'Parando serviços' }) });
  assert.match(switching, />Trocando</);
  assert.match(switching, /Parando serviços/);
  assert.match(switching, /disabled=""[^>]*>Modo jogo</);
  assert.ok(!/Modo jogo ligado:/.test(switching), 'resultado só depois que o passo some');
  const game = render({ lab: LAB({ mode: 'jogo', reason: 'auto:Jogo A' }) });
  assert.match(game, /Entrou sozinho: Jogo A aberto/);
  assert.match(game, /Voltam a ligar/);
  assert.match(render({ lab: LAB({ games: [] }) }), /nenhum jogo cadastrado/);
});

test('serviços: estado, desconhecido sem inventar, reiniciar, link privado e bloqueio no modo jogo', opts, () => {
  const html = render({ lab: LAB({ services: [...LAB().services, { id: 'x', name: 'Indexador', purpose: 'Busca', keep: false, state: 'unknown', link: null }] }) });
  assert.match(html, /2 de 3 rodando/);
  assert.match(html, /aria-label="Reiniciar Servidor de mídia"/);
  assert.match(html, /href="https:\/\/pc\.ts\.net:8920"[^>]*aria-label="Abrir Servidor de mídia"/);
  assert.match(html, /Indexador<\/b><span class="sub">Busca · estado desconhecido/);
  const game = render({ lab: LAB({ mode: 'jogo' }) });
  assert.ok(!/aria-label="Reiniciar Servidor de mídia"/.test(game), 'no modo jogo só reinicia quem continua');
  assert.match(game, /aria-label="Reiniciar DNS local"/);
  assert.match(render({ lab: LAB({ wsl: false }) }), /A máquina Linux \(WSL\) está desligada/);
});

test('controles bloqueados: prévia, home lab inativo e sem conexão; leitura continua', opts, () => {
  const preview = render({ home: HOME([], { mode: 'preview' }) });
  assert.match(preview, /Prévia: o home lab roda só no PC de casa/);
  assert.match(preview, /aria-label="Reiniciar Servidor de mídia"[^>]*disabled=""/);
  assert.match(preview, /CPU/);
  assert.match(render({ lab: LAB({ enabled: false }) }), /O home lab não está ativo neste servidor/);
  const down = render({ stateError: new Error('x') });
  assert.match(down, /Sem conexão com o PC de casa/);
  assert.match(down, /aria-label="Reiniciar Servidor de mídia"[^>]*disabled=""/);
  assert.match(down, /aria-label="Máquina"/);
});

test('leitura: carregando e erro sem dado', opts, () => {
  assert.match(render({ lab: null }), /Lendo o home lab/);
  const t = setupRoute({ home: HOME([]), polls: { '/api/homelab': { data: null, error: new Error('Falha (500).'), reload() {} } } });
  assert.match(t.render(t.load(t.src('routes/Lab/Lab.jsx')).default), /Sem conexão com o home lab[\s\S]*Falha \(500\)\./);
});

test('rede: varredura é botão manual, nada é varrido ao abrir; grupos, topologia nomeada e detalhes em diálogo fechado', opts, () => {
  const posts = [];
  const html = render({ posts });
  assert.equal(posts.length, 0);
  assert.match(html, /Varrer agora/);
  assert.match(html, /2 conectados · varrida há 1 min · 1 vigiado sem resposta/);
  assert.match(html, /aria-label="Aparelhos novos"/);
  assert.match(html, /aria-label="Aparelhos vigiados"/);
  assert.match(html, /role="group" aria-label="Esquema da rede de casa"/);
  assert.equal(count(html, /class="node (ok|warn|bad)"/g), 3);
  assert.match(html, /aria-label="Celular da Lorena: conectado\. Abrir detalhes"/);
  assert.match(html, /aria-label="Impressora: sem resposta\. Abrir detalhes"/);
  assert.match(html, /aria-label="Aparelho sem nome: conectado, novo\. Abrir detalhes"/);
  assert.match(html, /<span>Celular da Lorena<\/span>/, 'nome por extenso no nó');
  assert.match(html, /O esquema não mostra a conexão real/);
  assert.ok(!html.includes('ov-box'), 'detalhe só existe com o diálogo aberto');
  assert.match(html, />É meu</);
  assert.match(render({ net: NET({ devices: [] }) }), /Nenhum aparelho visto ainda\./);
  assert.match(render({ net: NET({ learningUntil: now() + 3600 }) }), /Aprendendo a rede até/);
  assert.match(render({ net: NET({ error: 'Sem rede.' }) }), /Sem rede\. Tento de novo em 15 min\./);
});

test('detalhe do aparelho: nome, é meu, vigia e remoção só depois da confirmação', opts, () => {
  const t = setupRoute({});
  const { DeviceDetail } = t.load(t.src('routes/Lab/Network.jsx'));
  const d = { id: 'bbbbbbbbbbbb', label: 'Aparelho sem nome', known: false, watched: false, online: true, ip: '1.2.3.4', mac: 'cc:dd', firstSeen: now() - 90 };
  const html = t.renderBare(t.h(DeviceDetail, { d, act: async () => null, busy: false, blocked: false, onDone() {} }));
  assert.match(html, />É meu</);
  assert.match(html, /Nome do aparelho/);
  assert.match(html, /role="switch"[^>]*>.*Avisar se sumir da rede/s);
  assert.match(html, /aria-label="Remover Aparelho sem nome da lista"/);
  assert.ok(!/Remover mesmo/.test(html));
  const blocked = t.renderBare(t.h(DeviceDetail, { d, act: async () => null, busy: false, blocked: true, onDone() {} }));
  assert.match(blocked, /disabled="" aria-disabled="true"[^>]*><svg[^>]*>.*?<\/svg>É meu/);
  assert.match(blocked, /Sem conexão com o painel\./);
});
