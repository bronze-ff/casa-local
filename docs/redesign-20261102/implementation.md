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
| M4 | TV, Local, Câmeras | idem |
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
| `state.integration.test.mjs` | 4 (React real): ocultar durante o GET compartilhado, reexibir com leitura pendente, modo parcial nunca "Confirmado", `homeAt` real | `core/hooks.test.mjs` | **pendente**: exige React; escrever em M2 com `test.skip` automático se React faltar |
| `errorBoundary.test.mjs` | 3: repassa filhos, falha vira aviso com `role=alert`, sem reload automático | `shell/guards.test.mjs` (teste "Boundary…") | **portado** (React real em render estático) |
| `ui.test.mjs` | 44 asserts: ícones, tecla desabilitada com motivo, slider acessível, roving tabindex, chave de 44 px, gancho de som, confiança por fase do comando, sheet | `ui/confidence.test.mjs` + `ui/kit.test.mjs` + `ui/css.test.mjs` | **portado em parte**: ícones, botão com motivo, roving tabindex, interruptor, régua, confiança/fase, overlay (aberto/fechado). **Não portado, por design**: gancho de som por tecla e escala "Doto" (o painel novo não tem fonte pixel nem som por tecla). Chave de 44 px: coberta em `css.test.mjs` |
| `Cameras/lifecycle.test.mjs` | 6: fechar o socket uma vez, idempotência, mensagens atrasadas ignoradas, reabrir, um único fallback MJPEG, fechar antes dos codecs | `routes/Cameras/live.test.mjs` | pendente M4 |
| `Cameras/effects.test.mjs` | 5: um socket por câmera, ocultar fecha, reexibir abre no máximo um, trocar de câmera, desmontar revoga URLs | `routes/Cameras/effects.test.mjs` | pendente M4 |
| `Clima/controls.test.mjs` + `check.cjs` | 6: arrastar só rascunho e soltar emite 1, soltar sem mudar não emite, cobertura IR esparsa, teclado, Home/End, geometria de 270° | `routes/Clima/dial.test.mjs` (+1 de cobertura) | **portado, 7 passam**. `check.cjs` (verificação por parser Babel do legado) não foi portado: o render estático de `Clima.test.mjs` cobre o mesmo comportamento sem depender do parser |
| `Lab/overview.test.mjs` | 7: layout da topologia, atenção primeiro, só aparelhos reais, métricas (zero ≠ ausente), modo jogo separa o que para, reserva por físico igual no Início e nas Luzes, resumo só com estado conhecido | `routes/Inicio/view.test.mjs` (3 cenários) e `routes/Lab/overview.test.mjs` (4) | **portados no M3**: reserva por físico, resumo do ambiente, métricas zero ≠ ausente, texto do modo jogo. **Pendentes M5**: layout da topologia, atenção primeiro, só aparelhos reais, jogo separa o que para |
| `Local/screens.test.mjs`, `Local/qr.test.mjs` | 8 + 5 asserts: telas sem posição, QR (tamanhos por versão, limite, JSON) | `routes/Local/*.test.mjs` | pendente M4 |
| `Central/parity.test.mjs` | 7: linha do dia, todas as seções, rotina pausada, remoção com confirmação, rotação de chave só após o toque, resumo sem inventar, navegação interna por botões | `routes/Central/parity.test.mjs` | pendente M5 |
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
