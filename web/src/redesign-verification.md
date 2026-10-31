# Redesign do painel: verificação (Etapa 7)

Escritor: Vitral. Data: 31/10/2026. Nada aqui é prova de aparência no navegador nem de desempenho em runtime: o que foi **executado** está marcado como tal; o resto é **pendente** (build/servidor/URL do Maestro).

## Resultado dos testes executados (offline, dependências reais do `npm ci`, sem rede)

| Comando | Resultado |
|---|---|
| `node --test src/homeStore.test.mjs src/polling.test.mjs src/api.test.mjs src/state.integration.test.mjs src/screens/Clima/controls.test.mjs src/screens/Lab/overview.test.mjs src/screens/Cameras/lifecycle.test.mjs src/screens/Central/parity.test.mjs` | 74 de 74 passam, 0 pulados |
| `node src/mode.test.mjs` | OK |
| `node src/ui.test.mjs` | OK |
| `node src/screens/Clima/check.cjs` | OK (render, ações, cobertura IR) |
| `node src/screens/Local/qr.test.mjs` / `screens.test.mjs` | OK |
| esbuild: transformação dos 39 arquivos js/jsx e resolução de imports de `main.jsx` | OK (checagem de sintaxe, não é build do Vite) |

RED observado antes da implementação: homeStore/polling (13 falhas), `controls.test` (6/6 falhando), `lifecycle.test` (3 falhando), `parity.test` (4 falhando). `overview.test` foi escrito depois da implementação do Lab (sem RED separado).

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
- Verificação visual feita só em 1280 (todas as telas) e 390 (Início, Clima, TV) com Playwright contra build isolado em `/tmp/vitral-dist` (prévia porta 4175, backend de prévia 8788, sem tocar `dist` nem a 4174); 768, 1600 e tray não foram recapturados.
- `state.integration.test` usa React real com DOM simulado; o teste de sheet foi feito no navegador via script em `/tmp`, não está no repositório.
- `sent`/`unknown` sem reconciliação por observação posterior seguem conservadores; Samsung e ações genéricas mantêm busy local.
- Desabilitados agora usam contraste reduzido com o motivo em texto (sem hachurado); a prévia continua explícita pelo aviso, pela faixa e pelos cartões "Simulado".
- Arco do dial muda sem animar (só o polegar), por restrição a `transform`/`opacity`.

## Checagem visual e de desempenho (para quando houver URL/build)
- Formatos: 390, 768, 1280, 1600 e tray; teclado/foco/Esc, zoom, contraste AA, alvos de 44 px, `prefers-reduced-motion`, arcos e sheets, erro e conteúdo longo.
- Comparação antes/depois por rota/dispositivo/rede/browser/cache: bytes JS/CSS/imagens (baseline em `/tmp/casalocal-frontend-before-redesign-20261031/dist-manifest.json`), requests/polls e concorrência, CPU/memória ocioso e ativo, toque até pending, abrir/fechar mídia. Não há métricas medidas neste documento; o tamanho do bundle de teste do esbuild (sem minificar, com React de desenvolvimento) não vale como comparação.
- Regressão relevante deve ser definida com o baseline antes do veredito; nenhum orçamento absoluto foi inventado aqui.
