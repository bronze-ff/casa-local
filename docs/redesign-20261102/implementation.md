# Implementação do novo frontend — manifesto e plano (02/11/2026)

Dono: Vitral (Claude, frontend), único escritor de `web/**`, `DESIGN.md` (raiz) e deste arquivo, **somente** neste worktree.

- Worktree: `/home/filippe/work/CasaLocal-redesign-20261102`, branch `wip/casa-redesign-20261102`, base `63f739e`.
- Autoria honesta: a implementação é feita pela sessão Claude identificada como **Sonnet 5.5**. O desenho de referência foi gerado no `/design` com **Opus 5.5 Médio** (artefato `2xXAzursABM1bcHqj2Q4oq`, versão `1793651364-f3af`). Uma coisa não é atribuída à outra.
- Não existe `AGENTS.md` neste worktree (conferido: nenhum `AGENTS*` ou `CLAUDE*` até 3 níveis). Valem o contrato `spec.md` e as regras da sessão.
- Fora de escopo: checkout principal, produção, `backend/**`, `tests/**`, `scripts/**`, `web/public/**`, `web/package*.json`, `web/vite.config.js`, docs fechados (`spec.md`, `references.md`), Git (commit/push é do Root).

## Regras de execução (jogo em andamento)

Só edição e leitura leves. **Sem** `npm install/ci`, build, servidor, navegador, benchmark, suíte ampla nem runtime. Permitido: testes unitários puros e curtos de Node (`node --test` em arquivos novos, com fakes). Nada disso foi iniciado. O código novo **não foi compilado nem aberto num navegador**; a verificação é por leitura e por testes unitários de Node.

## Estratégia

Remake do zero **sem copiar DOM, componentes ou CSS legados**. O código antigo é lido só como especificação de comportamento e de contrato. A camada de estado/API é reescrita com os mesmos invariantes (recibo, epoch/revision, mutação, `physicalId`, single-flight, visibilidade, retry de token).

1. A árvore nova nasce **isolada** em pastas novas de `web/src/` (`core/`, `ui/`, `shell/`, `routes/`). O app legado continua sendo o ponto de entrada até a troca, então cada checkpoint deixa o worktree coerente.
2. **Troca** (M6): `main.jsx` passa a montar o shell novo; os arquivos legados são apagados do worktree; `index.html` e `DESIGN.md` são atualizados.
3. As oito rotas são feitas completas (paridade F01–F19), não apenas reskin.

## Manifesto de caminhos

Criar (novos):

| Caminho | Conteúdo |
|---|---|
| `web/src/core/api.js` | fetch, token, erro com recibo, retry único só de `invalid_token` |
| `web/src/core/store.js` | store da casa (snapshot versionado, comandos por físico, recibo, modos) |
| `web/src/core/poll.js` | poller single-flight com pausa por visibilidade |
| `web/src/core/route.js` | hash `#/nome/param` e `#nome:p1:p2`, bandeja, layout |
| `web/src/core/format.js` | hora, idade, números, rótulos humanos de confiança/estado |
| `web/src/core/hooks.js` | hooks React (store, poll, rota, layout, visibilidade) |
| `web/src/core/*.test.mjs` | testes novos, curtos, com fakes |
| `web/src/ui/theme.css` | tokens claro/escuro, tipografia, sombras, movimento |
| `web/src/ui/base.css` | reset, superfícies, foco, alvos de 44 px, `prefers-reduced-motion` |
| `web/src/ui/kit.css` | estilos dos componentes |
| `web/src/ui/Icon.jsx` | ícones inline |
| `web/src/ui/kit.jsx` | Button, Chip, Switch, Segmented, Slider, Status, Confidence, Empty, Skeleton, Toast |
| `web/src/ui/Overlay.jsx` | Dialog/Sheet/Painel com viewport, foco preso e retorno de foco |
| `web/src/ui/Draft.jsx` | controle de rascunho + Aplicar (brilho, temperatura) |
| `web/src/shell/Shell.jsx` | sidebar/rail/tabbar/bandeja, estados de conexão |
| `web/src/shell/Alert.jsx` | janela de alerta da bandeja |
| `web/src/shell/Boundary.jsx` | falha de uma tela não derruba o shell |
| `web/src/routes/Inicio/…` | Início |
| `web/src/routes/Luzes/…` | Luzes |
| `web/src/routes/Clima/…` | Clima (IR) |
| `web/src/routes/TV/…` | TV (IR + rede) |
| `web/src/routes/Local/…` | Local |
| `web/src/routes/Cameras/…` | Câmeras (grade, ao vivo, replay, avisos) |
| `web/src/routes/Lab/…` | Lab |
| `web/src/routes/Central/…` | Central |

Substituir na troca (M6): `web/src/main.jsx`, `web/index.html` (só o fundo de boot), `DESIGN.md` (raiz).

Apagar na troca (M6), só depois de a rota nova existir **e** de os testes legados da tabela abaixo estarem portados (regra: nenhuma cobertura se perde por reescrita): `web/src/{App,AlertCard,ErrorBoundary,ui}.jsx`, `web/src/{api,homeStore,polling,mode}.js`, `web/src/tokens.css`, `web/src/screens/**`, testes legados (`*.test.mjs`, `check.cjs`) que testam módulos apagados, e `web/src/redesign-verification.md`.

## Marcos

| Marco | Entrega | Verificação |
|---|---|---|
| M0 | Este manifesto | leitura |
| M1 | `core/` (api, store, poll, route, format, home, hooks) + testes de invariantes | `node --test` em `web/src/core`: **51 de 51 passam** |
| M2 | `ui/` (tokens, base, kit, overlay, rascunho de brilho) + `shell/` (Root, Shell, Boundary, Alert, nav, tema) | **fechado**: 54 testes passam (ui 37 + shell 17), sintaxe de todos os arquivos conferida com esbuild; ver "Estado do M2" |
| M3 | Início, Luzes, Clima (`routes/{Inicio,Luzes,Clima}`) | **fechado para checkpoint**: 46 testes de rotas; ver "Estado do M3" |
| M4 | TV, Local, Câmeras (`routes/{TV,Local,Cameras}`) | **fechado para checkpoint**: ver "Estado do M4"; **cópia legada remanescente: `routes/Local/qr.js`** |
| M5 | Lab, Central | idem |
| M6 | Troca, remoção do legado, `DESIGN.md`, `index.html` | busca de referências quebradas |
| M7 | Revisão de paridade F01–F19 e limites honestos | tabela no fim deste arquivo |

## Invariantes que a camada nova preserva

Snapshot por `epoch`/`revision` (mesma epoch só avança; outra epoch ressincroniza); recibo com a mesma guarda; só campo observado confirma; pedido vazio (tecla IR) nunca confirma; sem resposta é "desconhecido", nunca "erro" nem "desligado"; exclusão por `physicalId` e por modo; um poll de `/api/state` compartilhado, single-flight e pausado com a aba oculta; POST reaproveita o snapshot devolvido; retry só de `invalid_token` rejeitado antes do efeito, nunca de timeout; `#oculto` não monta nada nem faz poll; `#alerta` só na janela de alerta; nenhum POST físico nem varredura ao navegar.

## Limites conhecidos desde já

- Sem build, não há prova de que o bundle compila. Sem navegador, não há prova visual do produto.
- Sem dependências novas: as fontes do protótipo (Archivo, IBM Plex Mono) vêm de CDN e **não** entram (o painel é offline na LAN). Usa pilha de fontes do sistema; a identidade vem de escala, peso, números grandes e cor.
- O contraste AA é calculado a partir dos tokens; não é medido em tela.

## Correções de plano (02/11/2026, sem novo gate)

1. **Testes só saem do worktree em M6 depois de portados.** O inventário está abaixo. Testes fora de `web/` não são alterados.
2. **Temperatura mantém o contrato atual:** um único comando ao soltar o dial ou a tecla; não há "Aplicar" adicional. **Só o brilho** usa rascunho + Aplicar. O componente `Draft.jsx` serve ao brilho; o dial de temperatura é um componente próprio com a regra "arrastar só muda a tela; soltar emite exatamente 1 comando; soltar sem mudar não emite; dial nunca escolhe temperatura sem sinal aprendido".

## Inventário de testes: legado → novo

Os estímulos e asserts contratuais foram preservados por cópia (não o código de produção). Legenda: **portado** = roda agora; **pendente** = depende de React/DOM instalados (`web/node_modules` não existe neste worktree) ou da rota nova.

| Legado | Cenários | Destino | Estado |
|---|---|---|---|
| `homeStore.test.mjs` | 31: ordem epoch/revision, GET em voo, single-flight, recibo por campo, erros 502/504/offline, exclusão por físico, modos, achados B2 1–6 | `core/store.test.mjs` | **portado, 31 passam** |
| `polling.test.mjs` | 8: UMA leitura em voo, oculto/visível, descarte de resultado velho, stop sem timer órfão, `isCurrent` (achado 4) | `core/poll.test.mjs` | **portado, 8 passam** |
| `api.test.mjs` | 5: recibo no erro, retry único de `invalid_token`, offline sem retry, 502 sem retry | `core/api.test.mjs` (+1 novo: bootstrap compartilhado) | **portado, 6 passam** |
| `mode.test.mjs` | rota por hash, bandeja, layout | `core/route.test.mjs` (layout novo com tablet) | **portado, 4 passam** |
| — | formatação, ausente é traço | `core/format.test.mjs` | novo, 2 passam |
| `state.integration.test.mjs` | 4 (React real): ocultar durante o GET compartilhado, reexibir com leitura pendente, modo parcial nunca "Confirmado", `homeAt` real | `boot/effects.test.mjs` | **portado, 4 dos 4 cenários + 2 novos, 6 passam**, com React/ReactDOM reais (`createRoot` + `act`) e DOM mínimo falso sobre o `core/hooks.js` e a store novos: ocultar durante o GET compartilhado não publica a resposta velha; ocultar/reexibir com leitura pendente mantém UMA leitura; modo parcial com power não confirmado nunca mostra "Confirmado"; `usePoll('/api/state').at` real e estável com erro; NOVOS: desmontar para o poll e não deixa ouvinte órfão, e o efeito real de `useMediaGate` (abre uma vez, fecha ao ocultar, troca de câmera, chave nula não abre, desmontar fecha uma vez) |
| `errorBoundary.test.mjs` | 3: repassa filhos, falha vira aviso com `role=alert`, sem reload automático | `shell/guards.test.mjs` (teste "Boundary…") | **portado** (React real em render estático) |
| `ui.test.mjs` | 44 asserts: ícones, tecla desabilitada com motivo, slider acessível, roving tabindex, chave de 44 px, gancho de som, confiança por fase do comando, sheet | `ui/confidence.test.mjs` + `ui/kit.test.mjs` + `ui/css.test.mjs` | **portado em parte**: ícones, botão com motivo, roving tabindex, interruptor, régua, confiança/fase, overlay (aberto/fechado). **Não portado, por design**: gancho de som por tecla e escala "Doto" (o painel novo não tem fonte pixel nem som por tecla). Chave de 44 px: coberta em `css.test.mjs` |
| `Cameras/lifecycle.test.mjs` | 6: fechar o socket uma vez, idempotência, mensagens atrasadas ignoradas, reabrir, um único fallback MJPEG, fechar antes dos codecs | `routes/Cameras/lifecycle.test.mjs` (+3: suporte MSE lido na chamada, pedido de codecs só com socket e MediaSource prontos, onEnd) | **portado, 9 passam** |
| `Cameras/effects.test.mjs` | 5: um socket por câmera, ocultar fecha, reexibir abre no máximo um, trocar de câmera, desmontar revoga URLs | `routes/Cameras/effects.test.mjs` | **portado, 6 passam**, na porta pura `gate.js` (a lógica de visibilidade/rota/desmontagem). O efeito React que liga a porta (`useMedia.js`) agora É executado em `boot/effects.test.mjs` (React real, DOM falso); `attachMse` com WebSocket/MediaSource reais segue pendente de navegador |
| `Clima/controls.test.mjs` + `check.cjs` | 6: arrastar só rascunho e soltar emite 1, soltar sem mudar não emite, cobertura IR esparsa, teclado, Home/End, geometria de 270° | `routes/Clima/dial.test.mjs` (+1 de cobertura) | **portado, 7 passam**. `check.cjs` (verificação por parser Babel do legado) não foi portado: o render estático de `Clima.test.mjs` cobre o mesmo comportamento sem depender do parser |
| `Lab/overview.test.mjs` | 7: layout da topologia, atenção primeiro, só aparelhos reais, métricas (zero ≠ ausente), modo jogo separa o que para, reserva por físico igual no Início e nas Luzes, resumo só com estado conhecido | `routes/Inicio/view.test.mjs` (3 cenários), `routes/Lab/logic.test.mjs` (7) e `routes/Lab/Lab.test.mjs` (7) | **portados**: reserva por físico, resumo do ambiente (M3); métricas zero ≠ ausente, layout da topologia, atenção primeiro, só aparelhos reais com nome por extenso, jogo separa o que para e só conta o resultado quando o passo some (M5) |
| `Local/screens.test.mjs`, `Local/qr.test.mjs` | 8 + 5 asserts: telas sem posição, QR (tamanhos por versão, limite, JSON) | `routes/Local/{Local,geo,qr}.test.mjs` | **portados**: projeção do mapa, carregando/erro/sem celular, dados reais com zero preservado, prévia, QR (tamanhos 57/97/137/177 e limite). `screens.test` também cobria TV: o texto "Fora de alcance" virou "Sem resposta na rede" (decisão: "off" não prova desligada) e está em `routes/TV/TV.test.mjs` |
| `Central/parity.test.mjs` | 7: linha do dia, todas as seções, rotina pausada, remoção com confirmação, rotação de chave só após o toque, resumo sem inventar, navegação interna por botões | `routes/Central/Central.test.mjs` (12) e `routes/Central/logic.test.mjs` (9) | **portado, 21 passam**: linha do dia, todas as seções, rotina pausada, remoção com confirmação, rotação de chave só após o toque (a chave nem é lida ao abrir), resumo sem inventar, navegação por botões; mais formulários, timer, energia e som |
| `redesign-verification.md` | notas de verificação do legado | substituído por seção própria em M7 | pendente M7 |

Regra de M6: um arquivo de teste legado só é apagado quando a linha dele estiver "portado" e o novo arquivo passar.

## Estado do M1 (fechado)

Escrito: `web/src/core/{api,poll,route,format,home,hooks,store}.js` e cinco arquivos de teste. Verificado: `node --test` em `web/src/core` com 51 testes passando; `hooks.js` e `home.js` só tiveram a sintaxe checada (`node --check`), porque React não está instalado. Nada foi compilado nem aberto num navegador. O escritor fica fechado para o Root e o Crivo revisarem o `core` antes de as rotas o usarem.

## Estado do M2 (fechado)

Escrito, sem tocar em `core/`:

- `web/src/ui/`: `theme.css`, `base.css`, `kit.css`, `Icon.jsx`, `kit.jsx`, `Overlay.jsx`, `Draft.jsx`, `actions.js`, `confidence.js`, `focus.js`, `draft.js`, `harness.mjs` (carregador de teste) e testes `theme`, `confidence`, `focus`, `draft`, `css`, `kit`.
- `web/src/shell/`: `Root.jsx`, `Shell.jsx`, `Boundary.jsx`, `Alert.jsx`, `context.js`, `nav.js`, `theme.js`, `theme-logic.js`, `shell.css` e testes `nav`, `guards`.
- O app legado continua sendo o ponto de entrada; nada novo está ativo. `Root` recebe um `registry` (nome da rota → `{ Screen }` lazy) que será preenchido a partir do M3.

Verificado: `node --test` em `ui/` (37), `shell/` (17) e `core/` (59, intocado). Os testes de render usam o React e o esbuild já instalados no checkout principal, em modo só leitura (`CASA_WEB_ROOT`, padrão `/home/filippe/CasaLocal/web`); sem eles os testes se declaram "skip". Nada foi instalado.

Guardas cobertos por teste: `#oculto` não monta o Shell nem liga poll; a janela de alerta (`?tray=1&alerta=1`) só aceita `#alerta` e carrega o alerta por `lazy`; `#alerta` no painel normal cai no Início; uma falha de tela é contida pelo Boundary sem recarregar sozinho; o Shell liga um único poll de estado e só com a casa carregada; as oito rotas são alcançáveis em todos os layouts (celular: 4 abas + "Mais"); o menu "Mais" fechado não deixa nada no Tab; a prévia é sempre sinalizada.

Decisão de implementação: os overlays usam `<dialog>` nativo com `showModal()`. O navegador prende o Tab, inertiza o fundo, fecha com Esc e coloca o diálogo na camada superior da janela. O código só escolhe o foco inicial e devolve o foco ao botão de origem. **Isso não foi exercitado num navegador**; o teste cobre a estrutura (fechado sem conteúdo, título ligado, botão Fechar marcado), não o foco real.

Limites do M2: contraste calculado dos tokens (AA nos três estados de tema), não medido em tela; fontes do sistema (sem Archivo/Plex); o `Draft` serve só ao brilho; o dial de temperatura (um comando ao soltar) fica para o M3; os testes de hooks com React real (`state.integration`) continuam pendentes.

## Estado do M3 (fechado para checkpoint)

Escrito em caminhos novos, sem tocar em `core/`, `ui/`, `shell/` nem nos docs fechados:

- `web/src/routes/Inicio/`: `Inicio.jsx`, `Parts.jsx`, `Wide.jsx`, `view.js`, `frames.js`, `inicio.css`, `view.test.mjs`, `Inicio.test.mjs`.
- `web/src/routes/Luzes/`: `Luzes.jsx`, `colors.js`, `luzes.css`, `Luzes.test.mjs`.
- `web/src/routes/Clima/`: `Clima.jsx`, `Dial.jsx`, `Extras.jsx`, `Timer.jsx`, `Energy.jsx`, `coverage.js`, `dial.js`, `clima.css`, `dial.test.mjs`, `Clima.test.mjs`.
- `web/src/routes/{routes.css, harness.mjs, registry.js}`. O `registry.js` lista as três rotas em `lazy` e a ordem dos CSS; **não está ligado ao app**.

Verificado: `node --test` em `routes/` (46) e em `core ui shell` (119, intocados), todos passando; esbuild confere a sintaxe de todos os arquivos novos.

Decisões de implementação:

- **Dados reais, nenhum mock em modo local.** "Simulado" só aparece na prévia (rótulo vindo do backend). Ao abrir, as telas só leem; nenhuma faz POST (testado).
- **Brilho** usa `Draft` (rascunho + Aplicar), de 10 a 100, com 20/40/60/80/100 como atalhos que só movem o rascunho. **Temperatura** usa o dial de 270°: arrastar muda só a tela e sai **um** comando ao soltar; soltar sem mudar não emite; a cobertura IR esparsa nunca vira temperatura sem sinal. Clima não importa o `Draft` (testado).
- **Cor:** 16 opções, brancos quente/frio, e "Ligar ao escolher cor" é uma escolha explícita (ligada por padrão): ligada, uma luz apagada acende junto; desligada, só a cor muda.
- **Ar IR é estimado:** só o último comando enviado; nenhum "Confirmado" para ele (testado). Funções extras (Turbo, Eco, Brisa, Display) ficam todas alcançáveis: não aprendido aparece desabilitado com o motivo; em Aprender, cada uma pode ser gravada. Timer cria/cancela e mostra falha e tentativas do agendador. Energia é sempre estimativa.
- **Início:** luz e ar são objetos protagonistas (tamanhos diferentes), relógio secundário, presença e modos numa faixa. O resultado de um modo lista cada aparelho (confirmado / enviado sem confirmação / falhou / já estava como pedido) e nunca trata parcial como sucesso. Câmera só com quadros disponíveis. Tela larga: 4 quadros parados (3 pedidos por vez, 4 s, pausa oculto), sem vídeo.
- **Limites corrigidos do protótipo:** o Clima tem Display alcançável; o Lab/topologia fica para o M5.

Não verificado: foco real e layout em navegador, contraste em tela, os efeitos (poll, timers, URL de imagem), o comportamento do dial com ponteiro real, hooks com React real. Sem fontes Archivo/Plex; ícones novos; o `Draft` anda de 5 em 5 (o legado andava de 10 em 10).

## Estado do M4 (fechado para checkpoint)

Escrito em caminhos novos, sem tocar em `core/`, `ui/`, `shell/` nem nos docs fechados; o M3 só ganhou o registro em `registry.js`:

- `web/src/routes/TV/`: `TV.jsx`, `Infrared.jsx`, `NetworkTV.jsx`, `Remote.jsx`, `keys.js`, `tv.css`, `keys.test.mjs`, `TV.test.mjs` (12 testes).
- `web/src/routes/Local/`: `Local.jsx`, `LocalMap.jsx`, `PhoneSetup.jsx`, `Panels.jsx`, `geo.js`, `qr.js`, `local.css`, `geo.test.mjs`, `qr.test.mjs`, `Local.test.mjs`.
- `web/src/routes/Cameras/`: `Cameras.jsx`, `Live.jsx`, `Replay.jsx`, `Motion.jsx`, `AlertDevices.jsx`, `MediaDialog.jsx`, `mse.js`, `gate.js`, `useMedia.js`, `useFrames.js`, `replay.js`, `motion.js`, `harness.mjs`, `cameras.css`, mais `lifecycle`, `effects`, `replay`, `motion` e `Cameras` `.test.mjs`.
- `registry.js` agora lista seis rotas em `lazy` e a ordem dos sete CSS; continua **sem ligar ao app**.

Verificado: `node --test` em `routes/TV`, `routes/Local` e `routes/Cameras` passa 62 de 62; `core`, `ui` e `shell` seguem com 119; `esbuild` confere a sintaxe de todos os arquivos novos.

### Cópia legada remanescente (honesto)

**`web/src/routes/Local/qr.js` é cópia do legado** (algoritmo do QR, byte mode, correção M, versões 10/20/30/40) e **está marcado como provisório**. Enquanto ele existir, **o frontend não pode ser descrito como remake 100% sem cópia**. Todo o resto do código novo foi escrito sem copiar componentes, CSS nem DOM do legado; os testes reaproveitam estímulos e asserts contratuais, o que é permitido.

Plano de substituição (M6, sem nova autorização): escrever um encoder próprio, independente, a partir do padrão (ISO/IEC 18004: modo byte, correção M, tabelas de blocos, Reed-Solomon em GF(256), máscaras e informação de formato/versão), **sem criptografia adicional**. Verificação: os testes de interoperabilidade atuais (`qr.test.mjs`: tamanhos por versão, limite, decodificação da URL) continuam valendo, e o `qrencode` do sistema (`/usr/bin/qrencode`) serve de oráculo independente para comparar a matriz módulo a módulo por versão. Se o oráculo divergir, o encoder novo não entra e o `qr.js` provisório permanece, declarado. Dependência de terceiros só se já for auditável e já estiver no projeto; hoje não há nenhuma.

### Decisões de implementação do M4

- **Nenhuma escrita ao abrir.** Todas as telas só leem ao abrir (testado). Busca de TVs é botão. "Marcar como visto" virou botão explícito (o legado marcava sozinho ao escolher a câmera). Um link de fora para um replay abre o diálogo e pede o toque em "Buscar gravação" antes de abrir a sessão no servidor; replay aberto por toque numa linha de evento ou em "Rever 1 min" começa na hora.
- **Mídia presa à visibilidade e à rota.** `gate.js` (puro, testado) abre no máximo um stream, fecha ao ocultar, trocar de câmera ou sair; a grade usa o ciclo de quadros do M3 (3 pedidos por vez, 4 s, sem laço de espera). Sessões de replay passam por uma fila (`replay.js`): nunca dois "abrir" juntos, cada novo pedido troca o anterior, e a sessão que chega depois de cancelar é fechada.
- **Segredo fora do DOM.** O QR, o link e o JSON do OwnTracks só existem dentro do diálogo aberto (testado: a página fechada não tem `owntracks://`), nunca vão para log ou armazenamento, e a senha não aparece em texto.
- **Limites:** o fundo do mapa continua vindo do OpenStreetMap pela internet (o navegador pede os quadrados); a bandeja só mostra quadro/foto (sem WebSocket, MJPEG nem replay).

Não verificado: foco real dos diálogos, `<dialog>`/`showModal`, WebSocket e MediaSource reais, `visibilitychange`, ponteiro/toque na linha do tempo e no mapa, layout em tela, contraste. Os efeitos React (`useMedia.js`, `useGridFrames`) não foram executados.

## Reparo Crivo M4 (5 prioritários)

Cada item tem fixture própria (`routes/Local/prepare.test.mjs` com 5 testes, `routes/Cameras/repair.test.mjs` com 10). Os 62 testes M4 anteriores seguem e continuam passando; os 15 novos são adicionais. Os testes novos foram escritos antes do código (RED: módulos `prepare.js` e `media.js` não existiam). Para `gate.js` e `createSessionQueue` não rodei o código antigo contra os testes novos: o RED desses dois é só por leitura do código.

1. **P1 Local, credencial tardia.** `Local/prepare.js` (`createPrepare`): cada pedido tem uma geração; `close`, troca de pessoa (`select`) e desmontagem chamam `invalidate()`. Resposta que chega depois é descartada: não vira estado, nem diálogo, nem log. O servidor já gerou a credencial; a pessoa pede de novo em "Celular".
2. **P1 Replay, id nulo.** `gate.js` não abre com chave `null` nem `undefined`. `replayKey` (em `replay.js`) só devolve id com 12 hexadecimais, busca iniciada e MSE suportado. Antes disso nada abre, e nunca existe `/api/replays/null/ws`.
3. **P1 Replay, ocultar.** `createSessionQueue.suspend()` fecha a sessão conhecida no servidor e invalida a abertura em voo (a tardia é fechada no ato). Aba oculta chama `suspend` e zera o id. Ao voltar, `resume` abre UMA sessão na posição em que parou, sem `replace` e sem repetir sozinho.
4. **P2 Fila, id antigo.** O id conhecido só é descartado quando o servidor confirma a troca. Em 409 ou erro de rede ele fica guardado para `suspend`/`dispose` fecharem. Abertura nunca é repetida automaticamente.
5. **P2 Som e tela cheia.** `Cameras/media.js` (capacidades) e `MediaControls.jsx`. O vídeo sempre nasce mudo (cada stream recomeça mudo); o som liga por toque, com aviso honesto quando o navegador não prova que há áudio. Tela cheia por elemento (padrão/webkit) ou só do vídeo no iPhone; sem suporte não há botão. Presente no Ao vivo (sem som em MJPEG) e no Replay.

Não verificado (nada foi aberto em navegador): efeitos React reais (`useMediaGate`, visibilidade), `requestFullscreen`, `video.muted`, WebSocket e MediaSource reais.

## Estado do M5 (fechado para checkpoint)

Só `routes/Lab/**` e `routes/Central/**`. Não alterei `registry.js`, M4, core, ui, shell. Os nomes dos testes evitam colisão de maiúsculas e minúsculas (Windows): no Lab, `Lab.test.mjs` e `logic.test.mjs`; na Central, `Central.test.mjs` e `logic.test.mjs`.

**Lab (14 testes).** `Lab.jsx`, `GameMode.jsx`, `Machine.jsx`, `Services.jsx`, `Network.jsx`, `Topology.jsx`, `lab.js`, `lab.css`.
- Modo do PC manual e automático, motivo, jogos abertos, o que para e o que continua, passo de troca (leitura a 2 s só durante o passo, depois 8 s) e resultado só quando o passo some.
- CPU, memória, GPU, WSL, discos e backup, sempre com a idade da leitura. Histórico: só as amostras de `history` do servidor; coluna nula não vira zero; sem duas amostras não há linha ("sem histórico suficiente").
- Serviços: estado, desconhecido sem inventar, reiniciar (bloqueado durante a troca e no modo jogo para quem para), link privado pela mesma regra do painel anterior.
- Rede: inventário em grupos (novos, vigiados, outros), varredura SÓ por botão, "É meu", nome, vigia, remoção em dois passos, topologia abstrata com nome por extenso e aviso de que as linhas não são a conexão real. Não há campo de notas no backend (`/api/network/<id>` aceita só `name`, `known`, `watch`); não inventei.
- Escrita bloqueada sem conexão, na prévia e com o home lab inativo; leitura continua.

**Central (21 testes).** `Central.jsx`, `Health.jsx`, `Notifications.jsx`, `Modes.jsx`, `Routines.jsx`, `Energy.jsx`, `Shortcuts.jsx`, `SoundCard.jsx`, `CopyText.jsx`, `central.js`, `sound.js`, `central.css`.
- UM poll por caminho (`/api/health`, `/api/notifications`, `/api/routines`, `/api/location`), compartilhado entre as seções. O legado lia `/api/notifications` e `/api/routines` mais de uma vez.
- Modos: criar, editar, ordenar (botões), rodar, remover com confirmação e aviso antes quando uma rotina usa o modo (o servidor ainda recusa com 409). Os aparelhos do formulário vêm do cadastro real (luzes e ar), não de uma lista fixa.
- Rotinas por horário ou lugar (pessoa e faixa), ações avulsas existentes, ativar, editar, remover, histórico com falha, falha do agendador e timer do ar (o timer é só do `ar-quarto`, contrato do backend). O corpo do POST não leva o campo `next`.
- Energia: sempre "Estimado" (na prévia, "Simulado"); potência e tarifa com os mesmos limites do backend.
- Atalhos: a chave só é lida quando o usuário toca em Configurar, só aparece depois de Mostrar chave e some ao fechar; trocar pede confirmação; uma leitura da chave em voo é invalidada ao fechar.
- Som das teclas: opcional, desligado por padrão, um único ouvinte de clique no documento.

Desvios em relação ao legado: o som usa um ouvinte de clique no documento (o legado usava um gancho no componente de tecla); a lista de aparelhos do modo vem do cadastro; salvar modo e rotina é por botão em painel lateral (não por modal central).

Pendências para o M6 (não são do M5): registrar `lab` e `central` e `lab.css`/`central.css` em `registry.js`; chamar `initSound()` no boot do app (a Central só liga o som depois de visitada); trocar `qr.js`.

Não verificado (nada foi aberto em navegador): efeitos e `usePoll` reais, `<dialog>`, rolagem por âncora, AudioContext, layout, contraste. Os testes são de renderização estática e de lógica pura.

Testes: core 59, ui 39, shell 21, routes 169 (M3 57, M4 77, Lab 14, Central 21). Nada disso é Crivo PASS: o M4 reparado segue aguardando o Crivo.

## Reparo do residual P2 de áudio (Crivo M4)

Problema: o stream recomeça mudo ao ocultar e mostrar a aba com a mesma câmera, mas o botão (`key` igual) mantinha o estado "som ligado"; o botão dizia ligado com o vídeo mudo e o primeiro toque não ligava. Correção só em `routes/Cameras`: `createSoundControl` (em `media.js`) lê `muted` do próprio vídeo e reavalia em `volumechange`; `MediaControls` usa `useSyncExternalStore` sobre ele (sem estado paralelo); `Live` e `Replay` reiniciam mudos pela mesma `startMuted` em todo início de stream. 4 testes novos em `Cameras/repair.test.mjs` (vídeo falso com `volumechange`, o componente real renderizado com o vídeo falso, e a garantia de que Live e Replay só usam `startMuted`). Testes: routes 173, tudo passa. O efeito React real (`useSyncExternalStore` com um `<video>` de verdade e `volumechange` do navegador) não foi executado.
Os 5 reparos originais do M4 e o residual não são Crivo PASS: aguardam o Crivo.

## Reparo Crivo M5 (2 P2)

1. **Atalhos, troca de chave tardia.** `Central/keysession.js` (`createKeySession`): leitura e troca da chave pertencem a uma sessão. Fechar, reabrir ou desmontar a tela (cleanup do efeito) invalida o que estiver em voo; a resposta tardia da troca é descartada e nunca chama `setShown(true)`. Nada é repetido (o POST da troca sai uma vez). A chave nova só aparece pela leitura da sessão vigente e sob "Mostrar chave".
2. **Modos, resultado do "Rodar".** `Central/result.js` + `ModeResult.jsx` (semântica nova, nenhum componente legado): por aparelho e por campo, o que foi pedido, o que o aparelho leu depois e a evidência do recibo (confirmado, divergente, simulado, sem confirmação, falhou, já estava como pedido), mais a mensagem de falha do servidor inteira. O título do conjunto nunca mostra parcial como sucesso. O aviso genérico por toast (`resultNotice`) continua.

Testes novos: `Central/repair.test.mjs`, 9 testes (fixture no formato real de `app.scene()`: confirmado, divergente, falha com mensagem exclusiva, infravermelho aceito). Passaram. Limite honesto: nesta rodada escrevi o código antes dos testes; o RED não foi demonstrado rodando o código antigo (o defeito antigo é visível na leitura: `setShown(true)` na resposta da troca e `stepLabel` genérico). Efeitos React reais (cleanup do `useEffect`, cliques) não foram executados.

## QR independente (Local/qr.js)

`Local/qr.js` foi reescrito do zero a partir da ISO/IEC 18004 (modo byte, nível M, versões 10/20/30/40; GF(256) 0x11D; Reed-Solomon; BCH(15,5) e BCH(18,6); 8 máscaras com penalidade N1 a N4). O contrato de `qr.test.mjs` está intacto (2 testes). Novo: `qr.standard.test.mjs` (10 testes): vetor público de Reed-Solomon, as 8 palavras de formato do nível M, versão 7, palavras e módulos de dados das 4 versões, estrutura (localizadores, temporização, módulo escuro, duas cópias do formato, informação de versão), leitura de volta com a correção de todos os blocos conferida, limites por bytes UTF-8 (213/214, 666/667, 1370/1371, 2331/2332), escolha da menor penalidade, e o oráculo.
- **Oráculo executado:** `qrencode` 4.1.1 existe neste computador (`/usr/bin/qrencode`). A matriz é idêntica módulo a módulo, com a mesma máscara, em 9 amostras (versões 10, 20, 30 e 40, UTF-8, URL do OwnTracks sintética, limites). O teste fica `skip` com aviso explícito se o `qrencode` não existir; nesse caso o oráculo NÃO foi executado.
- **Não há decodificador de câmera:** a leitura por celular real não foi feita. O que existe é a igualdade com um codificador independente e a leitura de volta pelo próprio teste.
- **Divulgação:** para confirmar o comportamento de `ownTracksURL` abri as 43 primeiras linhas do `qr.js` antigo, que incluíam as tabelas de blocos. As tabelas são dados públicos da norma (conferidos pelas contagens de palavras e módulos e pelo oráculo); o código foi escrito separado. Cópia do antigo ficou só em área temporária fora do repositório.
- O QR está em pausa consistente (nenhuma edição durante o reparo da Central).

## Reparo do residual P2 do resultado de modo (Crivo M5)

Defeito: `overview()` caía em "Confirmado" quando não havia nenhuma evidência. Caso real do backend: modo só com o ar e `keepIfOn`, ar já ligado: todos os passos `skipped`, `evidence: not_applicable`, `receipt: null`, resumo `completed` com `notApplicable: 1` e `confirmed: 0`. A tela dizia "Confirmado" sem confirmar nada. `results` vazio também.

Correção em `Central/result.js`: `evidenceCounts()` (resumo do servidor, ou os passos quando o resumo falta). "Confirmado" só com `confirmed > 0` e nenhum passo sem confirmação; tudo pulado = "Nenhuma ação necessária"; sem passo algum = "Sem resultado". `ModeResult.jsx` mudou numa linha: o aviso do infravermelho agora usa `evidenceCounts` (antes dependia do resumo existir). Nenhuma mudança cosmética.

Fixtures (4 testes novos em `Central/repair.test.mjs`): modo todo pulado (SSR do componente real: sem "Confirmado", sem selo verde, sem aviso de IR), resultado vazio ou ausente, resumo ausente com passos reais, e o "Confirmado" legítimo (com evidência observada). RED rodado ANTES da correção: 3 dos 4 falharam (o 4º já passava, é a guarda do caso legítimo); GREEN depois. Testes: routes 196, tudo passa. Nada de M6, M4, core ou QR foi tocado.

## M6 preparação da troca (caminhos ANTES da mudança)

Só no worktree. Nada do legado é apagado. A entrada antiga (`main.jsx`, `App.jsx`, `tokens.css`, `ui.jsx`, `screens/**` e testes) fica no Git do checkpoint e no disco.

Escrever ou alterar:
- `web/src/routes/registry.js`: registrar `lab` e `central`; somar `lab.css` e `central.css`.
- `web/src/main.jsx`: nova entrada (CSS novo na ordem, tema da bandeja, `initSound`, service worker).
- `web/src/boot/start.js` (lógica pura do boot) e `web/src/boot/App.jsx` (Root com o registro).
- `web/index.html`: fundo e cor do boot nos tokens novos.
- `DESIGN.md` (raiz do worktree): direção "Papel e carvão".
- Testes: `web/src/boot/boot.test.mjs` (consistência estática), `web/src/boot/effects.test.mjs` (React real com DOM mínimo falso).
Não toco: `core/`, `ui/`, `shell/`, `routes/Central/**` (congelado), M4, QR, backend, `package.json`, `vite.config.js`, `public/`.

## Estado do M6 (troca preparada no worktree; legado NÃO removido)

**Feito** (só nos caminhos declarados acima):
- `routes/registry.js`: as 8 rotas (`''`, `luzes`, `clima`, `tv`, `local`, `cameras`, `lab`, `central`) e os 9 CSS de rota.
- `main.jsx` novo: CSS na ordem (tema, base, kit, shell, e um por rota, na mesma ordem do registro), `prepareBoot` (bandeja sempre Noite antes de pintar, `initSound` do som opcional salvo), `registerOffline` (só em produção), `<StrictMode><App/></StrictMode>`. O painel antigo não é importado por nada da entrada nova (testado).
- `boot/App.jsx` (Root + registro) e `boot/start.js`.
- `index.html`: fundo e cor do tema do boot nos tokens novos (claro `#F2EDE5`, escuro `#1B1917`); texto do boot em fonte do sistema.
- `DESIGN.md` da raiz do worktree: nova direção "Papel e carvão" com o contrato de comportamento.
- Testes: `boot/boot.test.mjs` (7) e `boot/effects.test.mjs` (6).

**Sem mudar:** `package.json` (as dependências `@fontsource/doto` e `@fontsource/jetbrains-mono` ficam sem uso; remover é decisão de Root junto com o legado), `vite.config.js`, `public/`, `core/`, `ui/`, `shell/`, `routes/Central/**`, M4, QR, backend, Git.

**Contagem sem dupla contagem** (`node --test` por pasta, rodado no worktree): core 59, ui 39, shell 21, routes 196, boot 13 = 328. `routes` já inclui M3, M4, QR (`Local/qr.test` + `qr.standard.test`), Lab e Central; `boot` não repete nada de `routes`.

**Legado no worktree:** os 14 arquivos de teste antigos (`src/*.test.mjs` e `src/screens/**`) ficam intactos. Neste worktree eles NÃO rodam por inteiro: 8 falham ao carregar com `Cannot find module 'esbuild'`, porque o worktree não tem `node_modules` e esses testes resolvem módulos a partir do `package.json` do worktree. É ambiental, não regressão: os arquivos não foram tocados. No checkout principal eles continuam passando.

### Inventário de regressões antes de remover o legado (para Root revisar)
- **Portados e passando (nenhum cenário perdido):** `homeStore`, `polling`, `api`, `mode`, `state.integration` (agora com React real), `errorBoundary`, `Cameras/lifecycle`, `Cameras/effects`, `Clima/controls`, `Lab/overview`, `Local/qr`, `Local/screens`, `Central/parity` (tabela acima).
- **Portado em parte, por decisão:** `ui.test.mjs` (gancho de som por tecla e fonte Doto não existem no painel novo; o som agora é um ouvinte de clique opcional, coberto em `Central/logic.test.mjs`).
- **Não portado:** `Clima/check.cjs` (parser Babel; substituído por `Clima.test.mjs`) e `redesign-verification.md` (vira seção própria no M7).
- **Pendente de navegador (nenhum teste cobre):** foco real e `<dialog>`/`showModal`, `requestFullscreen`, `video.muted` e `volumechange`, WebSocket e MediaSource reais, rolagem por âncora na Central, AudioContext, layout e contraste medidos, `visibilitychange` real, ponteiro no mapa e na linha do tempo, service worker.
- **Antes de apagar:** (1) Root revisar este inventário; (2) remover `App.jsx`, `ui.jsx`, `tokens.css`, `mode.js`, `api.js`, `homeStore.js`, `polling.js`, `ErrorBoundary.jsx`, `AlertCard.jsx`, `screens/**` e os 14 testes antigos de uma vez; (3) decidir as dependências `@fontsource/*`; (4) rodar o build no checkout principal (eu não rodei build).

## Regra de build (correção do Root, vale daqui para frente)

Todo build futuro roda SOMENTE num worktree isolado, com `outDir` ABSOLUTO em `/tmp/...` (por exemplo `vite build --outDir /tmp/casa-build-AAAAMMDD --emptyOutDir`). Nunca no checkout principal. Nunca `npm run build` do `package.json`: ele encadeia `scripts/build-offline.mjs` e escreve `../dist`, que o backend de produção serve. Eu não rodei build nenhum em nenhum momento.

## Reparo Crivo M6 P1: colisão de `.stage` entre CSS

Defeito: `routes/routes.css` define `.stage` como layout de página (grid; usada por Clima, Local, TV e Lab em `stage two`) e `routes/Cameras/cameras.css` definia `.stage` como moldura de vídeo (fundo preto, `aspect-ratio: 16/9`, `overflow: hidden`, `max-height: 54dvh`). O `main.jsx` importa os dois, então a moldura de vídeo vazava para as quatro páginas.

Correção: a moldura de vídeo agora é `.media-stage` (`cameras.css`, `Live.jsx` em dois lugares — ao vivo e quadro da bandeja — e `Replay.jsx`). `.stage` de layout ficou só em `routes.css`. A grade de câmeras não usava a classe e não mudou. `.stage-note` (camada sobre o vídeo, nome único) ficou.

Fixture: `routes/css.test.mjs` (3 testes, sobre o TEXTO dos CSS): (1) nenhuma classe simples (`.nome` sozinho) é definida em dois arquivos entre os 13 CSS (tema, base, kit, shell, routes e um por rota); (2) o `.stage` de layout não tem aspect-ratio, overflow hidden, fundo preto nem max-height, e `cameras.css` não usa `.stage`; `.media-stage` tem as quatro regras; (3) Live, Replay e a bandeja usam `media-stage`, e Clima, Local, TV e Lab continuam em `stage two`. RED rodado antes da correção (3 falhas, a primeira apontando `.stage: routes/routes.css e routes/Cameras/cameras.css`); GREEN depois.

Varredura dos outros seletores genéricos: só `.stage` colidia como regra base. `.col` e `.grid` (base.css + routes.css) e `.hint` (routes.css + local.css) e `.obj` (kit.css + inicio.css) aparecem em dois arquivos, mas a segunda definição é sempre modificador (`.col.tight`, `.grid.two`, `.hint.accent`, `.obj.big`, `.inicio.tray .obj`), não regra base repetida. Sem refatoração ampla. Limite: o teste não vê a tela; um seletor descendente que vaze ainda dependeria de olhar no navegador.

## Clima/check.cjs: inventário exato e portagem

`screens/Clima/check.cjs` (135 linhas) tinha 4 partes. Estado de cada uma:
1. **Análise de sintaxe com o parser Babel** (`Luzes.jsx`, `Clima.jsx`, `coverage.js`): NÃO portada, por decisão. Todo teste novo carrega esses arquivos pelo esbuild; erro de sintaxe derruba `Clima.test`, `Luzes.test` e `actions.test`.
2. **Cobertura (7 asserts, fixture exata)**: `temperatures` cool/auto = [17,20,24,30]; dry = 0; sem cadastro = 14; `supportedState` dry = null; heat/high cai em baixa 21; cool/high 24 = 22; limites [16,17,30,31,24.5] = [17,30]. Portados em `routes/Clima/actions.test.mjs` ("cobertura (a fixture EXATA do check.cjs legado)") e em `dial.test.mjs` (esparsa, sem cadastro, descarte fora de 17–30).
3. **Render estático (SSR)**: 16 nomes de cor, banheiro apagada; Turbo ligado, Não aprendido, Cancelar timer, Este mês, 30 min, 4 h; estado desconhecido e "Ligar em 24"; modo auto sem temperatura; prévia; erro offline; vazio; carregando; zero chamadas. Portados em `Luzes.test.mjs` ("cor: 16 opções…", "cores: 16 nomes…", "as duas luzes…", "bloqueio explicado…", "estado desconhecido…", "só o brilho usa rascunho… nenhum POST ao abrir") e `Clima.test.mjs` ("estado desconhecido…", "modo sem temperatura…", "funções extras, timer e aprender…", "prévia…", "aparelho ausente e carregando…", "extras…", "timer…", "energia…"). Os textos mudaram de redação onde o design mudou (desconhecido agora é "—", não "– –"); os cenários estão cobertos.
4. **Ações (a parte que o SSR não vê): o corpo e a rota que cada botão emite**. Era a lacuna. Portada em `routes/Clima/actions.test.mjs` (6 testes) com a árvore de componentes sem hooks reais (`routes/tree.mjs`): Aumentar/Diminuir temperatura (24 → 30 e → 20, vizinho APRENDIDO), Desligar o ar, Turbo calibrado (`turbo:false`), Eco (`key:'eco'`), modo Calor (`mode:'heat', fan:'low', temperature:21` numa chamada), timer 30 min e Cancelar (`/api/routines/timer`), Aprender (entrar não envia; "em até 25 s"; Gravar ligar neste estado; Regravar desligar; extra Brisa), Luzes (Vermelho `colorHex`; Diminuir brilho só muda o rascunho e `Aplicar 75%` envia; cena Noite; trocar de lâmpada e Branco quente liga), e bloqueios (botão desabilitado recusa o clique).
   Diferença de produto, intencional: o legado enviava o brilho a cada ±10; o novo só envia ao Aplicar (rascunho).

Limite do `routes/tree.mjs`: chama os componentes como funções com hooks falsos; não é navegador (sem foco, layout, evento nativo ou `<dialog>`; o Overlay é trocado por uma passagem direta).

## Som das teclas: teclado

`routes/Central/sound.test.mjs` (4 testes): desligado por padrão e sem ouvinte; ligar instala UM ouvinte de `click` em captura e desligar remove; clique em botão habilitado faz o tique, inclusive com `detail: 0` (é assim que o navegador entrega Enter e Espaço em `<button>`); desabilitado, alvo que não é controle e `null` não fazem som; o ouvinte não chama `preventDefault` nem `stopPropagation`; sem `AudioContext` o clique segue mudo. Não é prova de teclado real: o disparo de `click` por Enter/Espaço pelo navegador está pendente de navegador (cenário para quando houver DOM).

## Contagem (node --test por pasta, sem dupla contagem)

core 59, ui 39, shell 21, routes 211 (inclui Clima 29 com `actions.test`, Central com `sound.test`, `css.test`), boot 13 = 343.

## M7: matriz de paridade F01–F19 (final, para a revisão de Root)

Esta seção SUBSTITUI `web/src/redesign-verification.md`. Fonte das famílias: `spec.md` §F01–F19 (fechado, não editado). Nenhuma família tem prova de navegador: a coluna "Só o navegador prova" é o que continua aberto. Contagens por arquivo = `test(` de nível superior; os totais por pasta são os do `node --test` (core 59, ui 39, shell 21, routes 211, boot 13 = 343). Caminhos relativos a `web/src/`.

| Família | Implementação | Testes (arquivo · testes) | Divergência de produto conhecida | Só o navegador prova |
|---|---|---|---|---|
| F01 Navegação e shell | `shell/{Shell,Root,Alert,Boundary}.jsx`, `shell/{nav,skip,theme,theme-logic}.js`, `core/route.js`, `routes/registry.js`, `boot/{App.jsx,start.js}`, `main.jsx` | `shell/nav.test` 7 · `shell/guards.test` 10 · `shell/skip.test` 4 · `core/route.test` 4 · `boot/boot.test` 7 · `boot/effects.test` 6 | tablet com rail e "Mais" no celular são novos; links antigos `#nome:p1:p2` continuam aceitos | `hashchange` real, janela da bandeja/alerta, pontos de corte de layout, foco ao navegar |
| F02 Comandos e evidência | `core/{store,api,home,hooks}.js`, `ui/{confidence,actions}.js`, `ui/kit.jsx` (Confidence, CommandState), `routes/Central/{result.js,ModeResult.jsx}` | `core/store.test` 31 · `core/repair.test` 6 · `core/repair2.test` 2 · `core/api.test` 6 · `ui/confidence*.test` · `routes/Inicio/{Inicio,repair,view}.test` 11+8+9 · `routes/Central/repair.test` 13 · `boot/effects.test` (modo parcial nunca "Confirmado") | "Confirmado" só com evidência observada; modo todo pulado é "Nenhuma ação necessária" | tempo real entre envio e leitura, aparência dos selos |
| F03 Luz/brilho/cor | `routes/Luzes/{Luzes.jsx,colors.js,luzes.css}`, `ui/{Draft.jsx,draft.js}`, `routes/Inicio/Parts.jsx` (LightObject) | `routes/Luzes/Luzes.test` 8 · `ui/draft.test` · `routes/Clima/actions.test` (cenário Luzes: cor, Aplicar 75%, cena, branco quente) | brilho só envia em Aplicar (legado enviava a cada ±10); "ligar ao escolher cor" é escolha explícita | arrastar o slider real, seletor de cor do sistema |
| F04 Clima/IR | `routes/Clima/{Clima,Dial,Extras,Timer,Energy}.jsx`, `{coverage,dial}.js` | `routes/Clima/Clima.test` 11 · `dial.test` 7 · `repair.test` 3 · `actions.test` 8 | estado sempre "Estimado"; ± vai ao vizinho aprendido; `values: []` trava o dial | arrasto e teclado reais no dial, aprender com a central IR real |
| F05 TV/pareamento | `routes/TV/{TV,Infrared,NetworkTV,Remote}.jsx`, `keys.js` | `routes/TV/TV.test` 8 · `keys.test` 4 | "Fora de alcance" virou "Sem resposta na rede" (power off não prova desligada); busca só por botão | pareamento com TV real, permissão em até 35 s |
| F06 Local/OwnTracks | `routes/Local/{Local,LocalMap,PhoneSetup,Panels}.jsx`, `{geo,prepare,qr}.js` | `routes/Local/Local.test` 9 · `geo.test` 6 · `prepare.test` 5 · `qr.test` 2 · `qr.standard.test` 10 (oráculo `qrencode` executado: 9 matrizes idênticas) | mapa de fundo vem do OpenStreetMap pela internet; credencial só com o diálogo aberto; QR reescrito do zero | câmera do iPhone lendo o QR, clipboard e download reais, ponteiro no mapa, tiles |
| F07 Grade/ao vivo | `routes/Cameras/{Cameras,Live,MediaControls,MediaDialog}.jsx`, `{useFrames,useMedia,gate,mse,media}.js`, `cameras.css` | `routes/Cameras/Cameras.test` 8 · `lifecycle.test` 9 · `effects.test` 6 · `repair.test` 14 · `boot/effects.test` (efeito real de `useMediaGate`) · `routes/css.test` 3 | vídeo nasce mudo (som por toque); bandeja só mostra quadro | WebSocket e MediaSource reais, `requestFullscreen`, `volumechange`, deslizar no celular |
| F08 Replay/movimento | `routes/Cameras/{Replay,Motion}.jsx`, `{replay,motion}.js` | `routes/Cameras/replay.test` 5 · `motion.test` 5 · `Cameras.test` (deep link, movimento) · `repair.test` (fila, suspend, id inválido) | deep link de replay pede toque em "Buscar gravação"; "Marcar como visto" é botão explícito | linha do tempo por ponteiro, sessão real do DVR |
| F09 Avisos/computadores | `routes/Cameras/AlertDevices.jsx`, `routes/Central/Notifications.jsx` | `routes/Cameras/Cameras.test` ("onde avisar") · `routes/Central/Central.test` (avisos) | teste de aviso só por botão | entrega real no ntfy |
| F10 Métricas/histórico Lab | `routes/Lab/{Machine.jsx,lab.js}` | `routes/Lab/Lab.test` 8 · `logic.test` 6 | histórico só do `history` do servidor; sem 2 amostras não há linha | aparência da linha, leitura real do monitor do PC |
| F11 Modo Jogo/serviços | `routes/Lab/{GameMode,Services}.jsx` | `routes/Lab/Lab.test` · `logic.test` (ritmo 2 s/8 s, fim do passo, link por regra antiga, desconhecido sem inventar) | escrita bloqueada sem conexão, na prévia e com home lab inativo | troca real de modo e o passo, o efeito de 20 s |
| F12 Inventário/topologia | `routes/Lab/{Network,Topology}.jsx` | `routes/Lab/Lab.test` (inventário, varredura manual, DeviceDetail) · `logic.test` (grupos, topologia) | NÃO há campo de notas: o backend só aceita `name`, `known`, `watch` | toque nos nós, varredura real |
| F13 Saúde/backup | `routes/Central/Health.jsx`, `routes/Lab/Machine.jsx` | `routes/Central/Central.test` (saúde) · `routes/Lab/Lab.test` (backup com idade real, atrasado, sem backup) | nenhuma | — |
| F14 Modos da casa | `routes/Central/{Modes,ModeResult}.jsx`, `{central,result}.js` | `routes/Central/Central.test` · `logic.test` 9 · `repair.test` 13 | aparelhos do formulário vêm do cadastro real; aviso de uso em rotina antes do 409 | formulário no painel lateral real |
| F15 Rotinas | `routes/Central/Routines.jsx`, `central.js` | `routes/Central/Central.test` · `logic.test` | corpo do POST sem o campo `next` | `<input type=time>` do sistema |
| F16 Timers | `routes/Clima/Timer.jsx`, `routes/Central/Routines.jsx` | `routes/Clima/{Clima,actions}.test` · `routes/Central/Central.test` | timer só do `ar-quarto` (contrato do backend) | agendador real |
| F17 Energia | `routes/Central/Energy.jsx`, `routes/Clima/Energy.jsx` | `routes/Central/{Central,logic}.test` · `routes/Clima/Clima.test` | sempre "Estimado" (simulado na prévia); limites do backend (100–5000 W, R$ 0,10–5,00) | — |
| F18 Chaves/configuração | `routes/Central/{Shortcuts,SoundCard}.jsx`, `{keysession,sound}.js`, `routes/Local/PhoneSetup.jsx` | `routes/Central/{Central,repair,sound}.test` · `routes/Local/{Local,prepare}.test` | chave só lida ao tocar em Configurar, só visível após Mostrar chave, resposta tardia descartada; som opcional, desligado | clipboard, AudioContext, Enter/Espaço reais |
| F19 Formulários/overlays | `ui/{Overlay.jsx,focus.js,Draft.jsx}`, formulários de Modes, Routines, Local, Lab (DeviceDetail) | `ui/{kit,focus,draft}.test` · `routes/Central/Central.test` (formulários) · `routes/Lab/Lab.test` · `routes/Local/Local.test` | `<dialog>` nativo em vez de modal próprio | foco preso, Esc e retorno de foco, `showModal` |

Transversais cobertos por teste de texto: contraste e 44 px (`ui/theme.test`, `ui/css.test`), sem keyframes, sem blur, só `transform`/`opacity`, e a colisão de CSS (`routes/css.test`). Contraste foi CALCULADO, não medido em tela.

## Remoção do legado: lista EXATA (EXECUTADA, ver "Remoção concluída" ao fim)

Escopo: `web/` do worktree. São 57 arquivos versionados. `src/main.jsx` NÃO entra na lista: já é a entrada nova. Antes de remover, o Root confere que nada novo importa o legado (conferido por mim em `core ui shell routes boot`: as únicas ocorrências de `./api.js` são o `core/api.js` NOVO, que fica).

Raiz de `src/` (17 arquivos):
`src/AlertCard.jsx` · `src/App.jsx` · `src/ErrorBoundary.jsx` · `src/api.js` · `src/api.test.mjs` · `src/errorBoundary.test.mjs` · `src/homeStore.js` · `src/homeStore.test.mjs` · `src/mode.js` · `src/mode.test.mjs` · `src/polling.js` · `src/polling.test.mjs` · `src/redesign-verification.md` · `src/state.integration.test.mjs` · `src/tokens.css` · `src/ui.jsx` · `src/ui.test.mjs`

Atenção ao nome: `src/api.js` (legado, REMOVER) não é `src/core/api.js` (novo, MANTER).

`src/screens/` inteiro (40 arquivos; a pasta fica vazia e some):
`src/screens/{Cameras,Central,Clima,Inicio,Lab,Local,Luzes,TV}.jsx` e as subpastas `src/screens/Cameras/` (`AlertDevices.jsx`, `Live.jsx`, `Motion.jsx`, `Replay.jsx`, `VideoDialog.jsx`, `effects.test.mjs`, `lifecycle.test.mjs`, `mse.js`, `replayWindow.js`, `useMedia.js`), `src/screens/Central/` (`CopyText.jsx`, `Energy.jsx`, `Health.jsx`, `Modes.jsx`, `Notifications.jsx`, `Routines.jsx`, `Shortcuts.jsx`, `Sound.js`, `parity.test.mjs`), `src/screens/Clima/` (`check.cjs`, `controls.test.mjs`, `coverage.js`), `src/screens/Lab/` (`GameMode.jsx`, `Network.jsx`, `Services.jsx`, `Stats.jsx`, `Topology.jsx`, `overview.test.mjs`), `src/screens/Local/` (`Map.jsx`, `qr.js`, `qr.test.mjs`, `screens.test.mjs`).

Os 15 arquivos de teste ou verificação desta lista (14 `*.test.mjs` + `check.cjs`) são exatamente os do inventário de portagem acima; todos têm destino novo ou decisão registrada.

NÃO remover: `src/{core,ui,shell,routes,boot}/**`, `src/main.jsx`, `index.html`, `public/**`, `vite.config.js`, `package.json`, `package-lock.json`.

Pendente de decisão do Root, fora desta lista: `package.json` ainda declara `@fontsource/doto` e `@fontsource/jetbrains-mono`, que nenhum arquivo novo importa (a única referência a `fontsource` em `src/` é um teste que garante que a entrada nova NÃO importa). Tirá-las exige `npm`, que não rodei.

Conferências sugeridas ANTES e DEPOIS da remoção (leves): `node --test core ui shell routes boot` (esperado 343, igual antes, porque os 14 testes antigos nunca entraram na contagem); `grep -rnE "screens/|tokens\.css|from '\./(App|ui|homeStore|polling|mode)" src` sem achados fora de `boot/boot.test.mjs`; e UM build SOMENTE em worktree isolado com `outDir` absoluto em `/tmp` (regra de build acima), em que eu não encosto.

## Reparo Crivo M7 P2: "um POST por toque" em `actions.test`

Lacuna: `actions.test` conferia só a ÚLTIMA chamada (`last(calls)`), então um toque que enviasse duas vezes passava (mutação do Crivo: `onKey` do Eco chamado 2x passou 7/7). O legado travava EXATAMENTE 1 POST por toque.

Correção só em `routes/Clima/actions.test.mjs` (produto intacto: `Clima.jsx` não mudou; já enviava 1 POST). Novo auxiliar `tap(...)`: mede as chamadas ANTES e DEPOIS de cada toque e exige o número exato (1 para comando, 0 para rascunho). `sends(...)` exige 1 chamada com a rota e o corpo exatos; `quiet(...)` exige 0 (abrir Funções extras, abrir Timer, entrar em Aprender, ±brilho, trocar de lâmpada). Cobre: temperatura +/−, desligar, Turbo, Eco, modo, timer programar e cancelar, Aprender (gravar estado, regravar desligar, extra), cor, brilho Aplicar, cena, branco quente. Fixtures não foram enfraquecidas.

Prova de mutação (sem navegador), feita trocando `Clima.jsx` por um mutante e restaurando byte a byte (conferido com `cmp`): (a) Eco e Turbo enviando 2x em sequência: o teste de comandos FALHA em "Turbo ligadoEstimado: esperado 1 POST(s), houve 2" e o teste-guarda também; (b) só o Eco enviando 2x: o teste de comandos FALHA no Eco. Original: GREEN. Um teste-guarda extra duplica a chamada no `run` falso (como o Crivo fez) e exige que o contador reprove. Observação honesta: o `lock` de `action()` já impede dois POSTs simultâneos no produto; o mutante precisou enviar em sequência para duplicar.

Suíte curta (SSR, árvore sem hooks, lógica pura; sem rede): `routes/Clima` 29 testes; total por pasta: core 59, ui 39, shell 21, routes 211, boot 13 = 343, todos passam. Legado NÃO removido.

## Remoção do legado concluída (M7)

Autorizada por Root com a lista validada `/tmp/casa-legacy-removal-57.json` (57 paths, `problems: []`, gerada deste manifesto). Executada SÓ no worktree, sobre a base `8a2e484`, que estava limpa (a única entrada fora do Git era o `web/node_modules`, um link somente leitura criado pelo Root; não toquei nele).

Antes de apagar: lista regenerada e igual à validada; por path, arquivo existe, está versionado no Git e não cai em `core`, `ui`, `shell`, `routes`, `boot`, `main.jsx`, `index.html`, `public`, `vite.config.js`, `package.json` nem `package-lock.json`. Se QUALQUER path falhasse, nada seria apagado (verificação em passada separada). Depois, 57 arquivos apagados e 6 pastas vazias removidas (`src/screens` e as 5 subpastas).

Depois de apagar:
- `git status`: 57 deleções (`D`) e nada mais além do `web/node_modules` não versionado do Root. `git diff --name-status`: só `D`. O conjunto de deletados é IGUAL ao da lista (comparação por conjunto, 57 e 57, nada a mais e nada a menos).
- `git diff --check`: limpo.
- Busca de imports legados em `core ui shell routes boot main.jsx`: nenhum achado (a única menção está em `boot/boot.test.mjs`, que garante a ausência). Todos os imports relativos e `import '...css'` do código restante resolvem para arquivos que existem.
- Suíte curta (`node --test` por pasta, fakes, sem rede): core 59, ui 39, shell 21, routes 211, boot 13 = 343, todos passam, `skipped 0`, `cancelled 0`, `todo 0`. O teste do oráculo `qrencode` não foi pulado (o CLI existe aqui).
- Os cenários dos 14 testes antigos seguem cobertos pelos testes novos listados no inventário de portagem; nenhum teste antigo restou, e eles nunca entravam na contagem de 343.

Estado honesto: não rodei build, navegador nem runtime. Root registrou um primeiro build isolado do Vite e uma prévia; a prova de navegador é do Crivo/Root. `package.json` ainda declara `@fontsource/doto` e `@fontsource/jetbrains-mono` sem uso (tirar exige `npm`, decisão do Root). As pendências de navegador da matriz F01–F19 continuam abertas.

## Fix leve de layout do Início (Crivo QA): caminhos ANTES da mudança

Autorizado por Root. Sem navegador, sem build; testes só SSR e texto de CSS. Alterar: `web/src/routes/Inicio/Parts.jsx` (marcação de `LightObject`, `ClimateObject`, `LabCard`: só classes), `web/src/routes/Inicio/inicio.css`, `web/src/ui/kit.css` (só `.ib` e `.seg button`, regra compartilhada). Novo: `web/src/routes/Inicio/layout.test.mjs`. Não toco: core, shell, backend, segurança, `registry.js`, `main.jsx`, outros CSS de rota.

### Fix leve do Início: o que mudou e o que NÃO está provado

Arquivos alterados (como declarado): `routes/Inicio/Parts.jsx` (só classes: `obj-main`, `climate-row`, e `word` no texto de estado), `routes/Inicio/inicio.css`, `ui/kit.css` (`.ib { flex: none }` e `.seg button { min-height: var(--hit) }`), e o novo `routes/Inicio/layout.test.mjs` (6 testes: texto do CSS e marcação SSR).
1. **Ar (anel de 132 px):** `.climate-row` com `flex-wrap`; texto com base de 150 px que desce para baixo do anel em coluna estreita; `.inicio .obj` virou container (`container: obj / inline-size`) e o anel encolhe para 104 px quando o card tem até 260 px. Selo de confiança e atalho "Abrir Clima" preservados.
2. **Hero esticado:** saiu o `grid-row: span 2`; `.objs` usa colunas `auto-fit` pela largura REAL (`minmax(min(100%, 240px), 1fr)`), `align-items: start`, e o card grande ocupa a linha inteira.
3. **Luz:** `.obj-main` é grid `minmax(0, 1fr) auto` (texto encolhe, botão na coluna automática); número grande escala com a largura do card (`cqw`); "apagada" e "desligado" ganham `word` (quebram em vez de passar por baixo do botão). `.ib` não encolhe mais em flex (no navegador do Crivo ficou com 35 e 42 px).
4. **Lab (medidores):** `.meters` e `.meters.hist` em `auto-fit` (104 e 120 px), rótulo em cima do valor, `min-width: 0`, valor com 24 px e quebra permitida; os quatro continuam.
5. **Alvos de 44 px:** a opção do segmentado passou de 38 para `var(--hit)` (44 px). Mudança COMPARTILHADA: todos os `Segmented` ficam 6 px mais altos.

Limites: tudo conferido em texto de CSS e marcação; NENHUM resultado de tela foi visto. `container-type` e `cqw` exigem navegador recente (Chrome 105+, Safari 16+). O RED foi rodado antes (6 de 6 falharam); depois de implementar, 3 testes ainda falharam por defeito do próprio auxiliar de teste (não removia comentários do CSS), corrigido sem enfraquecer nenhuma verificação. Rebuild e conferência visual são do Root/Crivo quando o usuário não estiver jogando. Contagem: core 59, ui 39, shell 21, routes 217, boot 13 = 349, `skipped 0`.

### Fix leve do Início, residual P2 (Crivo): seletor amplo `.objs .big`

Defeito: `.objs .big { grid-column: 1 / -1 }` alcançava também o `IconButton.big` (classe `ib big round`), filho do grid `.obj-main` dentro do card, não só o card grande. O botão de ligar passava a ocupar as duas colunas do `.obj-main`.

Correção só em `routes/Inicio/inicio.css`: `.objs > .obj.big` (filho direto). O teste que exigia o seletor amplo (`layout.test.mjs`) agora exige o seletor restrito E que `.objs .big` não exista.

Regressão sobre a árvore real (em `layout.test.mjs`, +2 testes): renderiza `LightObject` (grande e pequeno) e `ClimateObject` reais dentro de `.inicio-grid > .objs`, converte o HTML do SSR numa árvore, avalia as regras do `inicio.css` com um casador de seletores mínimo (classes, tag, descendente e `>`, recursivo em `@media`/`@container`) e exige que toda regra com `grid-column`/`grid-row` alcance SÓ o card grande: os dois `button.ib.big` e os cards pequenos ficam de fora. Um teste-guarda aplica o seletor amplo ao texto e exige que a verificação de árvore o reprove.

RED/GREEN: com o seletor amplo (estado anterior) FALHAM 3 testes (inclui "IconButton.big NÃO pode ser alcançado"); com o restrito, 8 de 8 passam. Mutante reaplicado no arquivo real (`.objs > .obj.big` → `.objs .big`) e restaurado byte a byte (`cmp`): 3 falhas; original: GREEN. Limite: o casador de seletores é mínimo (não cobre pseudo-classes nem atributos, que nunca casam) e o resultado em tela continua com o Crivo. Contagem: core 59, ui 39, shell 21, routes 219, boot 13 = 351, `skipped 0`.

## Reparo P2 de tela cheia (Crivo QA R2): caminhos ANTES da mudança

Autorizado por Root. Só fontes e testes curtos (SSR/unitário); nada de servidor, build ou navegador. Alterar: `web/src/routes/Cameras/Live.jsx` e `Replay.jsx` (um contêiner `.media-box`, alvo da tela cheia, que contém a moldura de mídia E os controles), `web/src/routes/Cameras/cameras.css` (regras do `.media-box` em tela cheia). `MediaControls.jsx` só se for preciso. Novo: `web/src/routes/Cameras/fullscreen.test.mjs`. Não toco: core, M5, segurança, backend, `registry.js`, outros CSS.

### Reparo P2 de tela cheia: o que mudou (fontes FECHADAS; verificação completa pendente)

Defeito (Crivo QA R2, 390 px): `requestFullscreen` ia só para `.media-stage` (vídeo e nota), e `MediaControls` ficava FORA dele. Em tela cheia só o elemento alvo e seus descendentes recebem toque, então "Sair da tela cheia" ficava inatingível.

Mudança (só `routes/Cameras`): `Live.jsx` e `Replay.jsx` ganharam o contêiner `.media-box` (`data-fullscreen-target="true"`, ref `box`) que envolve a moldura de vídeo `.media-stage` E os `MediaControls`; `MediaControls` recebe o ref do `.media-box` (`stage={box}`), então `requestFullscreen` vai para o contêiner inteiro. `cameras.css`: `.media-box` em coluna; em `:fullscreen` e `:-webkit-full-screen` fundo preto, conteúdo centralizado e a moldura sem o teto de 54dvh. `MediaControls.jsx`, `media.js` e o caso do iPhone (só o vídeo, sem API de elemento) NÃO mudaram. O som nasce mudo como antes; a lógica do primeiro toque (`createSoundControl`) não foi tocada.

Teste novo: `routes/Cameras/fullscreen.test.mjs` (5 testes): composição real (SSR → árvore) de Ao vivo e de Replay exigindo UM alvo, com vídeo, moldura, grupo "Som e tela", botão de tela cheia e de som todos DENTRO dele e os controles irmãos da moldura; o mesmo ref vai ao alvo e aos controles; API (`requestFullscreen` no contêiner, iPhone no vídeo, sem API nada, sair pelo documento); regras de CSS em tela cheia.

Estado honesto da verificação: o RED foi rodado antes (4 de 5 falharam). Depois da edição, `node --test Cameras css.test.mjs` passou 55 de 55. As suítes completas por pasta, a prova de mutação (controles de volta para fora do alvo) e o `git diff --check` NÃO foram rodados: a coleta de baseline do Root pediu só edição de fonte. Fazer depois da baseline. O comportamento real em tela cheia (390 px) é do Crivo/Root no navegador.

### Reparo P2 residual de tela cheia: contraste do aviso (caminhos ANTES da mudança)

Defeito (Crivo, mesmo fullscreen): o `.media-box` em tela cheia tem fundo `#000`, mas o `.hint` (aviso de áudio dos `MediaControls`) herda `--mut` do tema claro (`#665B50`, 12,5 px): contraste 3,177:1 sobre preto (mínimo AA 4,5:1). Alterar SOMENTE: `web/src/routes/Cameras/cameras.css` (cor do `.hint` dentro do `.media-box` em `:fullscreen` e `:-webkit-full-screen`) e `web/src/routes/Cameras/fullscreen.test.mjs` (1 teste de contraste calculado e de escopo). Botões, fora de tela cheia, temas, recibos e o `routes.css` não mudam.

Mudança feita: em `cameras.css`, `.media-box:fullscreen .hint` e `.media-box:-webkit-full-screen .hint` com `color: #D9D2C6` (contraste calculado ~14:1 sobre `#000`, contra 3,177:1 do `--mut` herdado). Teste novo em `fullscreen.test.mjs` (contraste WCAG calculado: o `--mut` do tema claro reprova com 3,177; as duas regras passam de 4,5; e toda regra `.hint` de `cameras.css` vive só dentro da tela cheia). NÃO FOI EXECUTADO: a baseline do Root proíbe teste, esbuild e build durante a coleta. Só li o arquivo escrito (escapes de regex conferidos à mão). Rodar depois: `node --test routes/Cameras/fullscreen.test.mjs` e as 5 pastas (esperado 357 = 351 + 5 + 1). Cálculo, não medição em tela.
