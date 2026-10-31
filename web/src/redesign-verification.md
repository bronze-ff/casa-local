# Redesign do painel: verificação (Etapa 7)

Escritor: Vitral. Versão do documento: 31/10/2026, após os reparos de overflow, AA, falha de chunk e mídia oculta. Escritor encerrado. O que foi **executado** está marcado como tal; **Pass final não é declarado aqui**: a re-revisão final do Crivo está em curso (pendente).

## Resultado dos testes executados (offline, dependências reais do `npm ci`, sem rede)

| Comando | Resultado |
|---|---|
| `node --test src/homeStore.test.mjs src/polling.test.mjs src/api.test.mjs src/state.integration.test.mjs src/errorBoundary.test.mjs src/screens/Clima/controls.test.mjs src/screens/Lab/overview.test.mjs src/screens/Cameras/lifecycle.test.mjs src/screens/Cameras/effects.test.mjs src/screens/Central/parity.test.mjs` | **82 de 82** passam, 0 pulados |
| `node src/mode.test.mjs` | OK |
| `node src/ui.test.mjs` | OK |
| `node src/screens/Clima/check.cjs` | OK (render, ações, cobertura IR) |
| `node src/screens/Local/qr.test.mjs` / `screens.test.mjs` | OK |
| esbuild: transformação dos arquivos js/jsx e resolução de imports de `main.jsx` | OK (checagem de sintaxe, não é build do Vite) |
| Build Vite de produção do Maestro | **PASS informado pelo Maestro** (não executado por mim; build isolado próprio em `/tmp/vitral-dist` só para as provas de navegador) |

RED observado antes da implementação: homeStore/polling (13 falhas), `controls.test` (6/6), `lifecycle.test` (3), `parity.test` (4). Escritos junto da implementação, sem RED separado: `overview.test`, `effects.test`, `errorBoundary.test`.

## Reparos concluídos (paths e provas)

| Reparo | Causa e correção (CSS/layout/efeitos; sem mudar comando, store, API ou backend) | Prova |
|---|---|---|
| Overflow responsivo | `.stack` tinha coluna `auto` (8 botões de 44 px empurravam o container a 408 px): agora `minmax(0, 1fr)`; `.stage`/`.cols`/`.masonry` com filhos `min-width: 0`; duas colunas e mosaico só a partir de 1100 px (com sidebar o conteúdo de 768 tem ~460 px); TV usa `.tv-cols`; grids `1fr` viraram `minmax(0, 1fr)`; `.hue` com `auto-fit minmax(44px)`. Sem `overflow-x: hidden`. Arquivos: `tokens.css`, `screens/TV.jsx`, `Luzes.jsx`, `Clima.jsx`, `Inicio.jsx` | Playwright (`/tmp/casalocal-browser-checks/vitral-overflow.mjs`): 390, 768, 1280 e 1600 nas 8 rotas sem elemento fora da largura (antes: Luzes 390 = 426 px; Luzes 768 = 929; Clima 768 = 785; TV 768 = 805). `vitral-targets.mjs`: nenhum alvo abaixo de 44 px em 390, 768 e 1280 |
| Contraste AA | `.key.sig` com fundo sólido `--sinal` (branco/`--sinal` 4,62:1 no dia; `--sobre-sinal`/`--sinal` 8,36:1 na noite); `--warm` só decorativo. `tokens.css` | cálculo WCAG de 16 pares de texto/fundo dos tokens: todos >= 4,5:1 (menor 4,62:1). Auditoria AA do Crivo: pendente |
| Falha de chunk lazy | `src/ErrorBoundary.jsx` por tela (shell, menu e `h1` ficam), `key` por rota, aviso PT-BR `role="alert"` e botão "Recarregar painel" explícito; sem reload automático e sem reenvio. Usado em `App.jsx` (também na janela de alerta) | `src/errorBoundary.test.mjs` (3) e Playwright `vitral-lazy.mjs`: com `assets/Luzes-*.js` abortado o corpo mantém conteúdo, 1 filho em `#root`, menu vivo, alerta visível; ir ao Clima limpa o aviso; 0 POSTs, 0 erros de página |
| Mídia oculta | `screens/Cameras/useMedia.js` (`useVisible`, `useWhileVisible`) usado em `Live.jsx` (MSE e MJPEG) e `Replay.jsx`: ocultar fecha WS, solta vídeo/src, revoga URL; voltar abre no máximo 1 stream (Replay reabre a sessão na posição, com `replace`); `Cameras/mse.js` idempotente (revoga objectURL, ignora eventos tardios, um único `onFail`) | `src/screens/Cameras/effects.test.mjs` (5, React real + `attachMse` com fakes: ocultar fecha 1x sem abrir outro; 3 ciclos nunca com mais de 1 ativo; trocar câmera oculto não conecta; desmontar fecha 1x e revoga todas as URLs) e `lifecycle.test.mjs` (6). Repetição do fixture do Crivo: pendente |

## Desempenho: comparação R2 (candidato publicável final)

Fonte lida diretamente (sem coleta nova): `/tmp/casalocal-browser-comparison-4174-r2/comparison.json` (candidato `/tmp/casalocal-browser-comparison-4174-r2/results.json` contra a linha de base `/tmp/casalocal-browser-baseline-4173/results.json`). Build: JS de entrada `index-C97ctc30.js`, CSS `index-BGMK1WQK.css`. Script original sem alteração (`scriptUnmodifiedVerified: true`), mesmo método nos dois lados.

Método: 8 casos (rotas `#/`, `#/luzes`, `#/lab`, `#/cameras` em 390x844 e 1280x900), **1 amostra por caso**, contexto de navegador novo por caso, cache HTTP desligado, service worker bloqueado, estabilização de 2 s e janela ociosa de 5 s, Chromium 156 headless em Linux, prévia sem aparelho físico.

| Medida (8 casos) | Antes -> depois |
|---|---|
| Bytes transferidos (CDP `encodedDataLength`) | de **-29,3% a -45,3%** (ex.: Luzes 390: 160.887 -> 88.007 B; Câmeras: 136.933 -> 96.875 B) |
| Requisições | de -16,7% a -42,9% (Luzes: 14 -> 8; fontes: 2 a 4 requisições -> 0) |
| JS decodificado | **+5,4% a +6,5%** (ex.: Início 181.950 -> 192.714 B) |
| CSS decodificado | **+36,9%** (24.933 -> 34.131 B, igual em todos os casos) |
| Polls de `/api/state` na janela ociosa | Luzes **2 -> 1** (390 e 1280); demais casos 1 -> 1 |
| Tempo de tarefas do renderer na janela ociosa de 5 s (`taskDurationMs`) | menor em 7 dos 8 casos; **Lab 1280: 3,183 -> 3,991 ms (maior)**; Luzes 1280: 3,421 -> 2,107 ms |

Limites dessa evidência: uma amostra por caso (sem significância nem p95); `taskDurationMs` é tempo de tarefa do renderer, **não** CPU global nem FPS nem latência de comando; sem carga de interação ou de stream; sem aparelho físico, backend de produção ou latência física; cache do sistema e carga do host não controlados. O aumento de CSS e de JS é custo real do redesign; a queda de bytes vem principalmente da remoção das fontes. O aumento do Lab em 1280 é de uma amostra e não foi investigado.

## Pendente / não declarado

- **Pass final: não declarado.** Re-revisão final do Crivo em curso (inclui auditoria AA e repetição do fixture de mídia oculta e dos scripts de browser sobre o build do Maestro).
- Sem stream real (câmera ao vivo/replay com vídeo), sem aparelho físico e sem arrasto em toque real: nada disso foi testado por mim.
- 768 e 1600 foram verificados só por medição de overflow, sem revisão de captura; tray não foi recapturado.
- Regressão relevante de desempenho ainda não definida com o Maestro; nenhum orçamento absoluto foi inventado.

## Matriz de paridade (feature-spec §3)

| Área | Capacidade existente | Onde está agora | Evidência | Pendência |
|---|---|---|---|---|
| Início | presença, modos reais, atalhos de aparelhos, toggle das luzes, movimento recente com foto, resumo do Lab e modo jogo, últimas ações, frames no wide | `screens/Inicio.jsx`: cabeçalho com saudação por hora e relógio, chips de presença, faixa de resumo do ambiente (`ambientOf`, só estado conhecido; IR como estimado) e painéis em grade que ocupa a largura no desktop; wide e tray preservados | `overview.test` (ambientOf, mesma reserva do toggle); captura 1280 | wide/tray não recapturados |
| Luzes | 2 lâmpadas, ligar/desligar, brilho + Aplicar, atalhos e ±10, branco/cor, 16 cores, modos, motivo de bloqueio | `screens/Luzes.jsx`: cena com halo, controle vertical, roda de 16 cores | `check.cjs`, `controls.test`; captura 1280 | arrasto em toque real |
| Clima | ar IR, power, 17 a 30 conforme cobertura, modo/ventilação, extras, aprender, timer, energia, estimado | `screens/Clima.jsx`: dial + painel lateral no desktop; **Funções extras** e **Timer** em bottom sheet real (`Sheet`) | `controls.test`, `check.cjs`; **Playwright**: sheet abre, Esc fecha, foco volta ao botão | arrasto em toque real |
| TV | IR e teclas, aprender, busca/pareamento Samsung, renomear, remoto e apps | `screens/TV.jsx`: controle físico (corpo, anel direcional com OK, volume/mudo agrupados, reprodução) à esquerda; painel separado "TVs na rede · apps" | `Local/screens.test`; captura 1280 | wide/tray |
| Local | pessoas (até 4), mapa, eventos 24h, lugares (até 8), OwnTracks QR/arquivo/link, prévia sem mutação | `screens/Local.jsx`: mapa protagonista (ou estado vazio sem mapa fictício) + lugares à esquerda; pessoas + últimas 24 h à direita | `qr.test`, `screens.test`; captura 1280 | mapa com dados reais não capturado (prévia sem posição) |
| Câmeras | grade e filtros, frame com idade, ao vivo MSE/WS + MJPEG, replay/timeline, fotos/eventos, avisos | `screens/Cameras.jsx` mosaico; `Cameras/mse.js` ciclo de vida | `lifecycle.test`; captura 1280 | timeline do replay mantém o controle de antes; vídeo real |
| Lab | modo jogo, serviços e reiniciar, estatísticas, inventário, varredura, nomes/vigiados | `screens/Lab.jsx`: máquina + topologia à esquerda, modo jogo à direita, serviços em grade compacta de largura total | `overview.test`; captura 1280 | topologia com aparelhos reais |
| Central | saúde, notificações, modos, rotinas, timer, energia, atalhos e rotação, som | `screens/Central.jsx`: resumo + navegação interna por botões, seções em colunas balanceadas; modos com identidade (`mode-bubble`); linha do dia nas rotinas | `parity.test` (seções, resumo, navegação sem hash, confirmações) | rotação de chave e atalhos só em SSR |
| Shell | oito rotas, deep links, mobile/desktop/wide/tray, `?tray=1`, alerta, `#oculto` | `App.jsx` com `h1` por tela (oculto no mobile/tray), `tokens.css` | `mode.test`; Playwright: 1 `h1` por tela | tray/wide não recapturados |

Estados transversais (carregando, vazio, dados antigos com idade, sem conexão, prévia, pendente/enviado/confirmado/divergente/erro, resultado parcial de modo): cobertos pela store e por `homeStore.test`, `state.integration.test` e `controls.test`.

## Limites e não feito
- Capturas de tela: 1280 (todas as telas) e 390 (Início, Clima e TV) via Playwright contra build isolado `/tmp/vitral-dist` (prévia na porta 4175, encerrada; backend de prévia 8788). 768 e 1600 só por medição de overflow.
- `state.integration.test` e `effects.test` usam React real com DOM simulado (componentes sem elementos de host); `Live`/`Replay` não são montados nos testes. O teste do sheet do Clima e o da falha de chunk foram scripts de navegador em `/tmp`, fora do repositório.
- `sent`/`unknown` sem reconciliação por observação posterior seguem conservadores; Samsung e ações genéricas mantêm busy local.
- Desabilitados usam contraste reduzido com o motivo em texto; a prévia continua explícita pelo aviso, pela faixa e pelos cartões "Simulado".
- Arco do dial muda sem animar (só o polegar), por restrição a `transform`/`opacity`.

## Checagem visual e de desempenho (para quando houver URL/build)
- Formatos: 390, 768, 1280, 1600 e tray; teclado/foco/Esc, zoom, contraste AA, alvos de 44 px, `prefers-reduced-motion`, arcos e sheets, erro e conteúdo longo.
- Comparação antes/depois por rota/dispositivo/rede/browser/cache: bytes JS/CSS/imagens (baseline em `/tmp/casalocal-frontend-before-redesign-20261031/dist-manifest.json`), requests/polls e concorrência, CPU/memória ocioso e ativo, toque até pending, abrir/fechar mídia. As únicas métricas medidas são as da seção "Desempenho: comparação R2" acima (1 amostra por caso); o tamanho do bundle de teste do esbuild (sem minificar, com React de desenvolvimento) não vale como comparação.
- Regressão relevante deve ser definida com o baseline antes do veredito; nenhum orçamento absoluto foi inventado aqui.

## Fechamento independente — Maestro/Crivo

Crivo registrou **Pass integrado de código/browser em prévia** no build `index-C97ctc30.js` / `index-BGMK1WQK.css`: 32 combinações de rota/largura sem overflow ou erro JS; alvos habilitados >=44px; falha de chunk contida e recuperação sem POST; Live/Replay/MJPEG pausam ocultos e retomam com pico de um stream nas fixtures; botão principal AA 4,619:1 claro / 8,358:1 escuro. Evidências em `/tmp/crivo-b2-final-browser-r2`. Maestro repetiu 82 testes (zero falhas/skips), build Vite e igualdade do pacote de publicação com a prévia, exceto o SW gerado. Este fechamento supera as pendências de revisão de código/browser acima; vídeo real, acionamento físico e offline funcional completo permanecem fora da prova. Métricas agregadas preservadas em `docs/evidence/2026-10-31-redesign-performance.json`. Publicação e checagem de produção são registradas separadamente pelo Maestro.
