# Redesign completo do painel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execução já escolhida pelo usuário: Maestro/equipe, com o MESMO implementador Vitral/Claude em todas as etapas B2. Não propor outro método, criar agentes ou acrescentar gate de permissão inferido.

**Goal:** Expandir a direção Clima+Luzes aprovada a todas as oito áreas e capacidades existentes, com controles autorais, organização, animações úteis e frontend leve.

**Architecture:** Preservar React/JSX, Vite, rotas hash e APIs. Concentrar snapshots, receipts e exclusão por físico em um store compartilhado; manter os módulos de domínio e adaptar apresentação e ciclo de vida gradualmente. Backend C+D está concluído e congelado: consumir seu contrato, sem modificá-lo.

**Tech Stack:** React 18, JavaScript/JSX, CSS, Vite 6; testes Node/assert, esbuild e React DOM server já disponíveis. Sem novo framework, engine 3D ou dependência de animação.

**Spec:** Nota compartilhada `feature-spec`, contrato técnico v0.4 e requisitos visuais/performance atuais: `maestri note read "feature-spec"`, sobretudo §§3, 6.1–6.8 e 9–9.2. Artefato ÚNICO: [Casa Design](https://claude.ai/artifact/2xXAzursABM1bcHqj2Q4oq).

**Estado e propriedade:** Prumo escreve exclusivamente este plano; revisão/handoff ao Maestro antes de liberar fontes B2. Vitral permanece somente no artefato até essa liberação. Depois, Vitral é o único implementador de `web/**` e `DESIGN.md`; etapas sequenciais, sem escritores concorrentes. Git/checkpoints exclusivamente Maestro.

## Global Constraints

- Usuário aprovou a NOVA direção Clima+Luzes: “sim, esta proxima, gostei das duas”. Aceite de direção para expandir TODAS áreas/funcionalidades; não é aceite do frontend implementado nem confirmação física.
- Termostato circular/arco, bottom sheet de modos, ciano/laranja, assimetria e controles táteis; Câmeras/Lab também com composições próprias. Usar somente capacidades reais, PT-BR, dados reais ou fixtures claramente identificadas.
- Alvos de toque >=44px, contraste AA, teclado/foco, reduced-motion, sem rolagem horizontal. Matrizes 390/768/1280, wide >=1600 e tray.
- Nenhum comando espera animação; feedback pending imediato difere de confirmação física. Sem POST por frame de slider; conservar Aplicar onde já existe.
- Pausar trabalho oculto; mídia sob demanda e recursos liberados. Animações curtas de interação em transform/opacity; sem loops decorativos, blur pesado ou 3D decorativo.
- Preservar interfaces legadas, CSRF/guardas, prévia, estados desconhecidos e falhas parciais; sem retry de transporte/comando ambíguo ou fila offline.
- C+D: PASS de código/offline55 e push `bcedfbc` em `origin/wip/casa-20261031`, conforme Maestro; checkout limpo antes deste plano. Não reabrir revisão/backend, alterar budgets ou política timer.
- Baseline de fontes: `/tmp/casalocal-frontend-before-redesign-20261031/web/`; bytes/hashes publicados: `/tmp/casalocal-frontend-before-redesign-20261031/dist-manifest.json`. Backup não equivale a baseline runtime.
- Prumo não executa implementação, Git mutável, testes de produto, build ou servidor nesta fase. Builds/servidores futuros são executados pelo usuário; testes unitários offline listados abaixo são para o implementador quando liberado. Sem commits por especialistas.

## Review Focus

1. Restart, GET antigo e ApiError atrasado não podem substituir snapshot novo ou limpar busy de outra requisição — testes da etapa 1.
2. Troca de rota entre TV/ar compartilhados não permite segundo comando físico; luz independente continua operável — etapas 1 e 3.
3. Cobertura IR esparsa, leitura parcial e key sem telemetria nunca viram confirmação por coincidência, relógio ou conjunto vazio — etapas 1 e 3.
4. Ocultar/reabrir/navegar durante stream ou POST não deixa recursos órfãos nem tempestade de requests — etapas 1 e 5.
5. Shell compacto, links antigos, preview e movimento reduzido mantêm acesso a todas as funções — etapas 2, 6 e 7.

## Mapa de arquivos e interfaces

Todos os paths seguintes pertencem ao MESMO implementador Vitral após liberação. Arquivos novos têm papel restrito; não dividir backend nem reestruturar domínios fora deste mapa.

| Unidade | Paths exatos | Responsabilidade |
|---|---|---|
| Estado/transporte | novos `web/src/homeStore.js`, `web/src/polling.js`; existentes `web/src/api.js`, `web/src/App.jsx`, `web/src/ui.jsx` | Snapshot/receipt, comando compartilhado, poll/lifecycle e adaptadores React |
| Provas base | novos `web/src/homeStore.test.mjs`, `web/src/polling.test.mjs`, `web/src/api.test.mjs` | Corridas, erros, exclusão por físico e visibilidade |
| Sistema/shell | `web/src/tokens.css`, `web/src/main.jsx`, `web/src/mode.js`, `web/src/mode.test.mjs`, `web/src/ui.test.mjs`, `web/src/AlertCard.jsx`, `DESIGN.md` | Tokens, navegação, componentes acessíveis e shell/alerta |
| Domínios | Paths explicitados em cada etapa abaixo | Paridade funcional e composição própria |
| Evidência integrada | novo `web/src/redesign-verification.md` | Matriz de paridade e resultados visuais/performance; sem inventar Pass |

Interface técnica existente (não redefinir): HomeSnapshot tem `stateVersion:{epoch,revision}`; Device expõe `physicalId`, `observedAt`, `estimatedAt`, `fieldObservations` e `updatedAt` legado. POST individual retorna `{state,device,command:{status,confidence,message,receipt}}`; erro HTTP pode retornar `{error,code,receipt}`. Receipt conserva requestId, delivery, stateVersion, outcome, requested/reported, confirmedFields/divergedFields, observedAt e timing. Modos têm results com operation/evidence/confirmationExpected/receipt e evidenceSummary. A tabela HTTP e precedência de prova são EXATAMENTE as de feature-spec §6.4/6.8.

Contratos internos B2 propostos para revisão do Maestro (sem alteração HTTP):

- `createHomeStore({bootstrap,get,post})` em homeStore.js, sem importar React ou api.js, retorna `{getSnapshot,subscribe,bootstrap,applySnapshot,refresh,run,commandFor,reset}`. getSnapshot() retorna referência estável `{home,commands,bootError}`; subscribe(listener) retorna unsubscribe; applySnapshot(snapshot) retorna boolean de aplicação; refresh()/bootstrap() retornam Promise de snapshot; run(path,body={}) retorna Promise do resultado ou lança ApiError; commandFor(deviceId) retorna estado de comando ou null. reset() invalida geração e libera estado/assinantes previstos, sem reenviar.
- `api.js` exporta singleton `homeStore` construído com transporte existente; evita ciclo de imports. Preservar `get(path)`, `post(path,body={})`, `bootstrap()`, `usePoll(path,every=5000)` e seu retorno `{data,error,at,reload,stale}`. `ApiError(message,status,code,receipt=null)` preserva receipt em erro.
- `createPoller({read,every,onData,onError,visibility,timers})` em polling.js retorna `{start,refresh,stop}`; read() é Promise, visibility fornece isVisible()/subscribe(listener), timers fornece setTimeout/clearTimeout. Somente um read em voo; stop/path change invalidam respostas pendentes. Adaptador browser fica em api.js.
- `useHome()` mantém `{home,refresh,mode,route,layout,tray}`, podendo acrescentar applySnapshot. `useAction()` mantém `[run,busy]` e `run(path,body,okText?) -> Promise<resultado|null>`; adapta homeStore sem exigir migração simultânea de todos os chamadores. Comandos/learn de Device e modos resolvem físicos do snapshot; configurações comuns conservam busy local.
- `commandFor(deviceId)` usa epoch+physicalId do backend. Store reserva antes do POST, persiste ao navegar e libera apenas sua geração de ação; requestId do receipt é correlação do servidor, não dedupe. Sem inferir agrupamento por nome ou expor segredos.

---

### Etapa 1 — Estado/API e comando compartilhados

**Files:** criar homeStore.js, polling.js e os três testes base; modificar api.js, App.jsx e ui.jsx conforme mapa. Vitral único dono.

**Consumes:** APIs/receipt aprovados. **Produces:** interfaces internas acima; um único poll /api/state no Shell e estado de comando compartilhado.

- [ ] Escrever testes comportamentais com fetch/clock/visibility falsos, sem rede: snapshot epoch A rev12 vence GET rev11 e ApiError rev10; restart invalida epoch anterior; receipt sem campos em key nunca confirmed; receipt ausente mantém confiança conservadora.
- [ ] Fixar assertions: `applySnapshot(A12) === true`; após A11, `getSnapshot().home.stateVersion.revision === 12`; GET antigo e erro antigo preservam reported novo e busy da ação atual; late complete confirmed/200 continua confirmado apesar de timing.overrunMs; 502/diverged conserva power observado e divergedFields.
- [ ] Cobrir dois consumidores cross-route no mesmo físico: TV/ar reservam uma central; segundo POST não ocorre enquanto a primeira ação está pendente; outro physicalId continua operável. Navegar durante pending não apaga estado. Modos partial não geram toast de sucesso total; completed com IR mostra incerteza.
- [ ] Cobrir polling: leituras simultâneas <=1; oculto/stop não inicia leitura nem aplica resultado velho; voltar visível gera uma retomada, não múltiplos timers. POST com snapshot provoca ZERO GET extra /api/state. Invalid_token renova uma vez após rejeição; offline/502 não repete POST; erro abortado de leitura não é falha física de comando.
- [ ] Executar `node --test web/src/homeStore.test.mjs web/src/polling.test.mjs web/src/api.test.mjs` antes de implementar; deve falhar pelas interfaces/assertions ausentes. Usar Node/assert e isolamento de dependências já empregado nos testes existentes; não instalar biblioteca.
- [ ] Implementar store/transporte/poller mínimos; aplicar desired separado de reported, guarda epoch/revision também em ApiError e proteção por geração da ação. Remover dupla consulta App/Luzes/Clima, timers artificiais de “Enviado” e dependência de updatedAt para confirmar comando.
- [ ] Reexecutar o mesmo comando; aceitação: exit0 com os casos acima, sem request real/timer órfão. Registrar resultado para Maestro, sem commit.

### Etapa 2 — Tokens, shell e navegação

**Files:** tokens.css, main.jsx, App.jsx, ui.jsx, mode.js, mode.test.mjs, ui.test.mjs, AlertCard.jsx e DESIGN.md. Não alterar package/lock salvo necessidade concreta de fonte aprovada pelo Maestro; preferir fontes disponíveis/fallback.

**Consumes:** homeStore e adaptadores da etapa 1. **Produces:** componentes existentes com props/exports preservados, shell responsivo e vocabulário visual compartilhado.

- [ ] Atualizar testes de mode/ui ANTES da mudança para comportamento, acessibilidade e paridade, sem congelar pixel/Doto/classes antigas: oito rotas, parâmetros por slash e colon, desconhecida -> Início, tray/alerta/oculto, foco/rótulos/disabled com motivo.
- [ ] Executar `node web/src/mode.test.mjs` e `node web/src/ui.test.mjs`; observar falha somente quando o novo comportamento exigido ainda faltar, sem apagar prova útil existente.
- [ ] Criar tokens e controles segundo direção aprovada (arcos/tato/ciano-laranja/assimetria); bottom sheet usa fechamento Esc, foco contido e retorno do foco. Manter Signatures Key/Switch/Segmented/Modal, ou adaptar seus consumidores dentro desta mesma etapa sem quebrar telas restantes.
- [ ] Preservar #oculto sem montar home/polls/câmeras; janela alerta exclusiva de ?tray=1&alerta=1; pywebview open_browser só se disponível. Atualizar DESIGN.md para direção aceita e movimento leve, marcando pixel anterior como superado.
- [ ] Reexecutar testes; depois registrar na matriz visual foco, zoom, reduced-motion e navegação nos formatos alvo. Não usar SSR como prova de efeito/unmount/visibilidade.

### Etapa 3 — Luzes e Clima

**Files:** screens/Luzes.jsx, screens/Clima.jsx, screens/Clima/coverage.js, screens/Clima/check.cjs; novo screens/Clima/controls.test.mjs. Sem novo módulo de geometria salvo necessidade no próprio componente.

**Consumes:** useHome/useAction/commandFor; cobertura IR existente. **Produces:** primeira implementação das composições já aprovadas, com controles compartilhados reais.

- [ ] Escrever controls.test.mjs para handlers com mocks: sequência de drag altera rascunho e mantém contagem POST=0; Aplicar emite exatamente1; cobertura esparsa nunca pede temperatura não suportada; ar/key permanece estimado/não confirmado. Usar harness existente esbuild/React com dependências falsas, sem POST real.
- [ ] Executar `node --test web/src/screens/Clima/controls.test.mjs` e `node web/src/screens/Clima/check.cjs` para detectar regressões antes da alteração.
- [ ] Implementar arco/termostato com SVG/CSS leves e alternativa teclado; preservar controles aprendidos, extras, timer, energia, estado desconhecido e 16 cores/atalhos de brilho. Bottom sheet reorganiza modos já existentes, sem criar funcionalidade ou comando ao abrir.
- [ ] Validar erro/preview/unconfigured/offline/partial; usar store único, sem poll local /api/state. Comando não aguarda transição; legenda separa pending, confirmado por campo, estimado e inconclusivo.
- [ ] Reexecutar ambos testes e testes da etapa1. Conferência visual futura compara com as duas composições do artefato, sem exigir nova aprovação da direção já aceita.

### Etapa 4 — Início e Lab

**Files:** screens/Inicio.jsx, screens/Lab.jsx, screens/Lab/GameMode.jsx, screens/Lab/Network.jsx, screens/Lab/Services.jsx, screens/Lab/Stats.jsx; novo screens/Lab/overview.test.mjs.

**Consumes:** store/controles das etapas1–3; APIs Lab existentes. **Produces:** resumo e Lab com composições próprias, sem cards genéricos repetidos.

- [ ] Escrever overview.test.mjs: toggle na home usa a mesma reserva de Luzes; modo partial aponta falhas; métricas nulas aparecem desconhecidas, zero permanece zero; jogo mostra serviços que param/seguem e progresso, sem misturar ação aceita com fim do processo.
- [ ] Executar `node --test web/src/screens/Lab/overview.test.mjs`; implementar apresentação preservando modos reais, presença, movimento, últimas ações, serviços/restart/links, rede/scan/nomes/vigiados e estatísticas.
- [ ] Manter frames wide somente visíveis, sem iniciar vídeo por decoração; resumir conteúdo em tray sem perder acesso aos controles. Retomada não duplica polling.
- [ ] Reexecutar testes base + overview; registrar paridade e custo ocioso/ativo de home/Lab na futura comparação runtime.

### Etapa 5 — Câmeras e ciclo de mídia

**Files:** screens/Cameras.jsx, screens/Cameras/Live.jsx, screens/Cameras/Replay.jsx, screens/Cameras/Motion.jsx, screens/Cameras/AlertDevices.jsx, screens/Cameras/VideoDialog.jsx, screens/Cameras/mse.js, screens/Cameras/replayWindow.js, AlertCard.jsx; novo screens/Cameras/lifecycle.test.mjs.

**Consumes:** shell/store e mídia existente. **Produces:** composição própria de observação/timeline, com recursos sob demanda.

- [ ] Escrever lifecycle.test.mjs com WebSocket/video/MediaSource/URL/timers falsos: abrir/fechar/reabrir, trocar rota/câmera, ocultar e desmontar liberam WS/handlers/buffer/src/timers/objectURLs uma vez, sem request após cleanup e sem feed duplicado.
- [ ] Testar lifecycle real dos helpers/effects via harness; SSR não executa cleanup. Testar live->replay->live e falha MSE->MJPEG sem dois streams ativos; tray abre somente frame/foto, nunca replay/WS; #oculto não inicia mídia.
- [ ] Executar `node --test web/src/screens/Cameras/lifecycle.test.mjs` antes da alteração; adaptar layout/cleanup preservando filtros, frame-age, fotos/eventos, notificações, marcação vistos, alert devices, links camN/replay/avisos, controles ao vivo e timeline.
- [ ] Reexecutar teste e testes base; conferência visual/performance futura deve separar câmera fechada e aberta, custo de vídeo real e custo do redesign.

### Etapa 6 — TV, Local e Central

**Files:** screens/TV.jsx; screens/Local.jsx, screens/Local/Map.jsx, screens/Local/qr.js, screens/Local/qr.test.mjs, screens/Local/screens.test.mjs; screens/Central.jsx e screens/Central/CopyText.jsx, Energy.jsx, Health.jsx, Modes.jsx, Notifications.jsx, Routines.jsx, Shortcuts.jsx, Sound.js; novo screens/Central/parity.test.mjs.

**Consumes:** componentes/store e APIs de domínio preservadas. **Produces:** paridade completa dos fluxos restantes com organização autoral leve.

- [ ] Acrescentar provas focadas aos testes Local existentes e parity.test.mjs: preview impede mutações físicas; TV IR compartilhada respeita reserva cross-route; credencial de localização não aparece antes de ação explícita; erro de formulário preserva rascunho; modos partial/IR esperado usam operation/evidenceSummary; rotação/remoção preservam confirmações existentes.
- [ ] Executar `node web/src/screens/Local/qr.test.mjs`, `node web/src/screens/Local/screens.test.mjs` e `node --test web/src/screens/Central/parity.test.mjs`; corrigir apresentação sem mudar payload/validação.
- [ ] Preservar TV IR/aprender e rede/scan/pair/rename/apps; Local mapa/pessoas/lugares/OwnTracks/histórico; Central saúde/notificações/modos/rotinas/timer/energia/atalhos/som, com carregamento/vazio/stale/erro e feedback de operação.
- [ ] Reexecutar mesmos testes e etapa1; em Local manter QR/link/arquivo compatíveis, em Central não inventar sensores/energia medida. Sem gravar dados privados em artefato, evidências ou testes.

### Etapa 7 — Revisão integrada, visual e desempenho comparável

**Files:** criar web/src/redesign-verification.md; ajustes somente nos arquivos Vitral já atribuídos. Nenhum backend/dist editado à mão.

**Consumes:** entregáveis1–6, spec e baseline. **Produces:** handoff verificável para Maestro/Crivo, com limites e falhas explícitos.

- [ ] Registrar no documento a matriz de oito rotas e TODOS os fluxos de feature-spec §3: cada item existente -> localização nova -> evidência/pendência. Incluir tray, oculto, alerta, links antigos, preview, dados desconhecidos e falhas parciais; nenhum “feito” só por aparência.
- [ ] Executar suíte unitária focada: `node --test web/src/homeStore.test.mjs web/src/polling.test.mjs web/src/api.test.mjs web/src/screens/Clima/controls.test.mjs web/src/screens/Lab/overview.test.mjs web/src/screens/Cameras/lifecycle.test.mjs web/src/screens/Central/parity.test.mjs`; depois `node web/src/mode.test.mjs`, `node web/src/ui.test.mjs`, `node web/src/screens/Clima/check.cjs`, `node web/src/screens/Local/qr.test.mjs`, `node web/src/screens/Local/screens.test.mjs`. Registrar resultado real, não exigir testes de todo trabalho preexistente/backend.
- [ ] Preparar checagem visual para URL/build fornecidos pelo usuário: 390/768/1280/1600 e tray; teclado/foco/Esc, zoom, contraste AA, alvos >=44px, reduced-motion, sheets/arcos, erro e conteúdo longo. Artefato dá direção, não licença para omitir funcionalidades.
- [ ] Preparar comparação antes/depois por rota/dispositivo/rede/browser/cache/build e cenário iguais: bytes JS/CSS/fontes/imagens/recursos; requests/polls e concorrência; CPU/memória ocioso/ativo; toque->pending/request/UI; abrir/fechar mídia e voltar ao repouso. Usar baseline web/manifest para origem e bytes, mas medir runtime anterior comparável com usuário/Maestro; não inventar métricas faltantes.
- [ ] Definir com baseline o que conta como regressão relevante antes do veredito, sem inventar orçamento absoluto/percentual. Separar latência frontend de confirmação física e não acionar aparelhos reais para validar estética; futuras provas físicas somente na janela combinada.
- [ ] Build/servidor: NÃO executar pelo plano nesta fase; usuário executa quando preparado e fornece URL/versão. Sem novo gate de permissão inferido: registrar dependência de evidência, continuar checagens offline autorizadas e reportar o que ainda falta.
- [ ] Maestro/Crivo revisam diff frontend e evidências. Vitral entrega paths alterados, testes/resultados, paridade, métricas/limitações e estado ESCRITOR ENCERRADO via maestri ask Codex; Maestro faz checkpoint Git e decide próxima etapa. Não abrir novo artefato, trocar stack ou iniciar backend.

## Auto-revisão do plano e handoff

- Cobertura: etapas1/3 atendem contrato de comando;2 shell/8rotas/tray;3–6 cobrem todo inventário;5 lifecycle;7 paridade/visual/performance.
- Interfaces: todos os consumidores usam o boundary da etapa1; backend/receipt v0.4 não mudou. Assinaturas legadas têm adaptadores, sem migração paralela conflitante.
- Provas: novos testes são comportamentais para corridas/estado/recursos; atualização de testes antigos remove apenas acoplamento à estética superada, mantendo sua intenção funcional.
- Método/propriedade: Maestro/equipe já definidos; único implementador Vitral nas etapas sequenciais; não há despacho de agentes extra nem commit de especialista.
- Handoff Prumo: plano preparado para revisão do Maestro; ESCRITOR ENCERRADO após salvar/verificar este arquivo e atualizar notas. Só este Markdown foi criado; nenhuma implementação/build/servidor/teste de produto/Git mutável executado.
