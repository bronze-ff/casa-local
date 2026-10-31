# Redesign do painel: verificação (Etapa 7)

Escritor: Vitral. Data: 31/10/2026. Nada aqui é prova de aparência no navegador nem de desempenho em runtime: o que foi **executado** está marcado como tal; o resto é **pendente** (build/servidor/URL do Maestro).

## Resultado dos testes executados (offline, dependências reais do `npm ci`, sem rede)

| Comando | Resultado |
|---|---|
| `node --test src/homeStore.test.mjs src/polling.test.mjs src/api.test.mjs src/state.integration.test.mjs src/screens/Clima/controls.test.mjs src/screens/Lab/overview.test.mjs src/screens/Cameras/lifecycle.test.mjs src/screens/Central/parity.test.mjs` | 71 de 71 passam, 0 pulados |
| `node src/mode.test.mjs` | OK |
| `node src/ui.test.mjs` | OK |
| `node src/screens/Clima/check.cjs` | OK (render, ações, cobertura IR) |
| `node src/screens/Local/qr.test.mjs` / `screens.test.mjs` | OK |
| esbuild: transformação dos 39 arquivos js/jsx e resolução de imports de `main.jsx` | OK (checagem de sintaxe, não é build do Vite) |

RED observado antes da implementação: homeStore/polling (13 falhas), `controls.test` (6/6 falhando), `lifecycle.test` (3 falhando), `parity.test` (4 falhando). `overview.test` foi escrito depois da implementação do Lab (sem RED separado).

## Matriz de paridade (feature-spec §3)

| Área | Capacidade existente | Onde está agora | Evidência | Pendência |
|---|---|---|---|---|
| Início | presença/localização, modos reais, atalhos de aparelhos, toggle das luzes, movimento recente com foto, resumo do Lab e modo jogo, últimas ações, frames no wide | `screens/Inicio.jsx` (chips de presença novos; resto preservado, nova pele) | toggle usa a mesma reserva que Luzes: `overview.test`; store: `homeStore.test` | conferência visual wide/tray |
| Luzes | 2 lâmpadas, ligar/desligar, brilho em rascunho + Aplicar, atalhos e ±10, branco/cor, 16 cores, modos reais, motivo de bloqueio | `screens/Luzes.jsx` (cena com halo, controle vertical `VSlider`, roda de 16 cores) | `Clima/check.cjs` (cores, brilho, modos), `controls.test` | conferência visual; arrasto real em toque |
| Clima | ar IR, power, 17 a 30 conforme cobertura aprendida, modo/ventilação permitidos, extras, aprender, timer, energia, estimado/desconhecido | `screens/Clima.jsx` (dial arrastável; comando só ao soltar) | `controls.test` (esparsa nunca pede temperatura sem sinal; POST=0 no arrasto; 1 ao soltar), `check.cjs` | sheet de extras não virou sheet (ficou na tela); conferência visual |
| TV | IR e teclas, aprender, busca/pareamento Samsung, renomear, remoto e apps | `screens/TV.jsx` (nova pele: dpad redondo, teclas táteis; lógica intacta) | `Local/screens.test` (render e nenhum POST) | sem recomposição própria; conferência visual |
| Local | pessoas (até 4), mapa, eventos 24h, lugares (até 8), OwnTracks QR/arquivo/link, prévia sem mutação | `screens/Local.jsx` e `Local/*` (nova pele; lógica intacta) | `qr.test`, `screens.test` | sem recomposição própria; conferência visual |
| Câmeras | grade e filtros, frame com idade, ao vivo MSE/WS com fallback MJPEG, replay/timeline, fotos/eventos, avisos, tray só frame/foto | `screens/Cameras.jsx` (mosaico assimétrico `.mosaic/.frame`); `Cameras/mse.js` com ciclo de vida corrigido | `lifecycle.test` (fechar 1x, idempotente, revoga objectURL, ignora eventos tardios, um único onFail, reabrir) | timeline do replay mantém o controle antigo (só nova pele); vídeo real não testado |
| Lab | modo jogo manual/automático, serviços e reiniciar, estatísticas, inventário e varredura, nomes/vigiados | `screens/Lab.jsx` + `Lab/Topology.jsx` (mapa de rede com sheet de inventário), 2 colunas | `overview.test` (topologia só com aparelhos vistos, zero x nulo, jogo sem misturar aceito com fim) | conferência visual |
| Central | saúde, notificações, modos (criar/editar/ordenar/executar/remover), rotinas, timer, energia, atalhos e rotação, som | `screens/Central.jsx` + `Central/Routines.jsx` (linha do dia nova) | `parity.test` (todas as seções, confirmação antes de remover/trocar, linha do dia acessível) | sem recomposição das demais seções |
| Shell | oito rotas e deep links, mobile/desktop/wide/tray, `?tray=1`, `?tray=1&alerta=1`, `#oculto`, `open_browser` só se existir | `App.jsx`, `tokens.css`, `mode.js` (lógica de rotas inalterada) | `mode.test`; rotas e `#oculto` sem mudança de código | indicador deslizante da tabbar e fade entre telas só no CSS (não verificado no navegador) |

Estados transversais (carregando, vazio, dados antigos com idade, sem conexão, prévia, pendente/enviado/confirmado/divergente/erro, resultado parcial de modo): cobertos pela store e por `homeStore.test`, `state.integration.test` e `controls.test`.

## Limites e não feito
- Nenhum build do Vite, servidor, navegador ou dispositivo foi usado por mim. `state.integration.test` usa React real com DOM simulado, não um navegador.
- Telas TV, Local e Central (exceto linha do dia) receberam a nova linguagem pelos tokens e componentes compartilhados, sem recomposição própria como Clima, Luzes, Lab e Câmeras.
- Sheet de extras do Clima não implementada como bottom sheet; o sheet usa `dialog` nativo apenas onde já existia (`Modal`).
- `sent`/`unknown` sem reconciliação posterior por observação seguem conservadores.
- Pareamento Samsung e ações genéricas mantêm busy local, sem reserva por físico.
- Arco do dial muda sem animar (só o polegar anima) por restrição a `transform`/`opacity`.

## Checagem visual e de desempenho (para quando houver URL/build)
- Formatos: 390, 768, 1280, 1600 e tray; teclado/foco/Esc, zoom, contraste AA, alvos de 44 px, `prefers-reduced-motion`, arcos e sheets, erro e conteúdo longo.
- Comparação antes/depois por rota/dispositivo/rede/browser/cache: bytes JS/CSS/imagens (baseline em `/tmp/casalocal-frontend-before-redesign-20261031/dist-manifest.json`), requests/polls e concorrência, CPU/memória ocioso e ativo, toque até pending, abrir/fechar mídia. Não há métricas medidas neste documento; o tamanho do bundle de teste do esbuild (sem minificar, com React de desenvolvimento) não vale como comparação.
- Regressão relevante deve ser definida com o baseline antes do veredito; nenhum orçamento absoluto foi inventado aqui.
