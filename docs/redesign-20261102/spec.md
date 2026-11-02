# CasaLocal — contrato de produto do redesign 20261102

Data: 02/11/2026. Dono deste arquivo: Prumo — ESCRITOR ENCERRADO. Contrato revisado por Root + Crivo, PASS DOCUMENTAL bounded reportado sem lacunas concretas. Não é PASS de referências, protótipo, código ou runtime nem aceite estético. Pedido atual prevalece sobre o redesign de 31/10 e a fila anterior; sem nova rodada documental/gate. UI de produção continua sem writer.

## 1. Intenção e limites

Refazer DO ZERO a interface web da casa + Lab/homelab, com base nas DOZE imagens fornecidas pelo usuário e pesquisa visual inspecionada. A mudança deve ser ampla e coerente em todas as telas, fácil de usar e leve enquanto o PC também serve para jogar. Não é recolorir ou adaptar a interface anterior: componentes visuais, CSS, tema, composição e DOM serão novos, sem importar/copiar componentes ou estilos antigos. Código antigo é somente fonte de inventário e comportamento; contratos de dados, segurança e evidência continuam obrigatórios. React 18/Vite atuais não precisam ser substituídos por motivo visual.

Preservar TODAS as funções, APIs, dados, configurações, credenciais, deep links e modos de uso. Não alterar backend para acomodar estética; não inventar aparelhos, telemetria, pessoas, cômodos, planta física ou automações. Diagrama de rede é abstrato e derivado dos dados disponíveis, não planta real. Usuário deu autorização ampla para direção clara/escura coerente; não precisa escolher tema antes do /design. A estética antiga aprovada não é herdada. Nenhuma proposta de Prumo/Vitral equivale a aprovação estética do usuário.

BG3: usuário confirmou MENU em PT-BR, sem avisos, e está jogando. Jogo, mods, perfil, idioma e runtime ficam INTOCADOS; a confirmação substitui a pendência anterior de menu/avisos, sem afirmar validação de todas as partidas/mods. Crivo reportou PASS OFFLINE do launcher classifier,20/20; fechado nesse âmbito, sem PASS runtime derivado.

DNS: fix a50022b presente no histórico local; Root reporta branch sincronizada com remoto e runtime seguro. O checkpoint DNS antes pendente está concluído; isso não autoriza builds/serviços enquanto usuário joga. Worktree web isolado ainda deve ser identificado pelo Root.

## 2. Momento de execução e ownership

| Fatia | Dono único / arquivos | Entrega e limite atual |
|---|---|---|
| Contrato e inventário | Prumo: docs/redesign-20261102/spec.md; seções atuais de feature-spec/workboard | Este documento e notas consistentes; leitura de fontes, sem escrever UI/backend. |
| Pesquisa e protótipo | Vitral: docs/redesign-20261102/references.md; portais Pinterest, Awwwards e Casa Design | Cobertura visual rastreável; verificar modelo/esforço/comando e continuar UM artefato multipágina no MESMO ID anterior. Prumo não opera esses portais nem escreve references.md. |
| Implementação web, futura | Vitral, exclusivo dos arquivos de UI no worktree isolado que Root estabelecer; manifesto de paths antes da primeira escrita | Agora SEM writer de UI de produção. Após checkpoint DNS commitado pelo Root: frontend integralmente novo no worktree, sem mutações no checkout servido. |
| Isolamento e entrega | Root: checkpoint DNS/Git, criação/identificação do worktree/branch, integração e eventual publicação | Registrar SHA base e caminho do worktree; preservar mudanças concorrentes e rollback. Especialistas não fazem Git mutável concorrente. |
| Verificação | Crivo: leitura/revisão de paridade, segurança e visual; Pulso: leitura e avaliação de desempenho quando couber | Sem fontes concorrentes; sem iniciar benchmarks/serviços enquanto usuário joga. Evidências futuras não são resultados presentes. |

Enquanto o usuário joga: somente documentação, leituras leves e pesquisa REMOTA. Sem builds pesados, benches, instalação de dependências, servidores/preview, reinícios, deploy, scans ou controles físicos. Não ativar modo Jogo/Lab ou modificar DNS/serviços para esta pesquisa. A autorização atual permite preparar o produto; não antecipa a execução pesada ou publicação.

Sem questionários ou gates rotineiros ao usuário. Resolver decisões reversíveis dentro destes requisitos; uma necessidade técnica real (imagens inacessíveis, modelo/comando inexistente ou ID irrecuperável) deve ser condensada em UMA consulta ao Root, com evidência e alternativa, sem substituição silenciosa.

## 3. Inventário atual: oito rotas, componentes e funções

Inventário por leitura de App.jsx, mode.js, api.js, homeStore.js, screens e contratos backend em 02/11; não é teste runtime. Os nomes abaixo descrevem o legado que deve ter paridade, NÃO componentes para reaproveitar.

| Rota e componentes atuais | Funções que a UI nova precisa manter |
|---|---|
| #/ — Inicio; Hero, Ambient, Scenes/SceneKey, DeviceTile/DeviceRow, LastMotion, LabSummary/GameRow, RecentActions, Wide/WideCameras | Data/hora e presença/idade da posição; resumo de aparelhos e confiança; executar modos reais; atalhos e toggle das luzes; movimento/foto/novos eventos; saúde resumida do Lab, modo Jogo e métricas; últimas ações. Wide oferece frames, sem iniciar vídeo contínuo; tray compacto conserva ações alcançáveis. |
| #/luzes[/id] — Luzes | Selecionar quarto-luz/banheiro-luz existentes; power, brilho em rascunho + Aplicar, cinco atalhos e +/-; branco/cor, 16 opções e ligar ao escolher cor; executar modos e mostrar resultado parcial. Motivo de bloqueio por configuração/conexão, sem confundir rascunho com leitura observada. |
| #/clima — Clima, Clima/coverage | Ar IR: power, 17–30°C apenas nas combinações cobertas, modos/fans aprendidos, templess, ligar inicial quando estado desconhecido; desligar aprendido; Turbo/Eco/Brisa/Display conforme suporte. Aprender estado completo/desligar/extras e origem/calibração; timer criar/cancelar, falhas do agendador; custo/horas/kWh estimados hoje/mês. Estado IR sempre estimado/desconhecido; aprender sinal não comprova efeito no aparelho. |
| #/tv[/rede] — TV; Infrared, Remote, Network, NetworkTV | Controle IR Geonav, power/direcional/OK/voltar/início/entrada/volume/mudo, códigos/origens e aprendizagem. Samsung na rede: busca manual, parear/renovar permissão, nome, estado, controle, play/pause e apps YouTube/Netflix/Prime Video/Globoplay existentes. Limite de wake por Wi-Fi, espera/recusa/expiração de pareamento e bloqueios de prévia. |
| #/local[/pessoa] — Local, PhoneSetup, Local/Map, Local/qr | Pessoas/última posição/idade e eventos 24h; selecionar, adicionar/renomear/remover; preparar/consultar/renovar OwnTracks com QR, link, copiar JSON, download e abrir aplicativo. Lugares criar/editar/remover, nome/coordenadas/raio e escolher ponto no mapa; limites backend (até 4 pessoas/8 lugares, raio30–1000m). Sem posição/configuração: estado vazio honesto. Credencial de celular privada; prévia impede mutações. |
| #/cameras[/param] — Cameras; Live/FrameView, Motion, Replay, VideoDialog/Overlay, AlertDevices, useMedia/mse/replayWindow | Grade/filtros todas/internas/externas/movimento; frames com idade e atualização; ao vivo MSE/WS e fallback MJPEG, anterior/próxima, som/fullscreen quando disponíveis. Voltar gravação, replay/timeline/eventos/fotos, retorno ao vivo, DVR offset e encerramento de sessão. Vistos/novos, marcar vistos, selecionar avisos e computadores/pausa/remoção; avisos via deep link. Tray somente foto/frame, sem vídeo/replay. |
| #/lab — Lab; GameCard, ServicesCard/serviceUrl, MachineCard, NetworkCard, Topology | Modo Lab/Jogo manual e automático, motivo/lista de jogos, passo de transição e serviços que param/continuam; estatísticas CPU/RAM/GPU/discos/WSL e histórico realmente disponíveis. Serviços: estado, links privados e restart existente com bloqueios. Inventário de rede, busca MANUAL, detalhes/nome/notas/remoção e topologia abstrata dos dados existentes; não disparar scan ao abrir tela. Não prometer disponibilidade de serviço por intenção de modo. |
| #/central — Central; Health, Notifications, Modes/ModeForm, Routines/RoutineForm/DayLine, Energy/Adjust, Shortcuts, CopyText, SoundCard/Sound | Saúde/conexão/checks/backup; avisos por tópico/câmera, assinatura e teste manual. Modos criar/editar/ordenar/executar/remover com restrição de uso em rotina. Rotinas por horário/dias/local/pessoa/janela de horário, ações existentes, ativar/editar/remover e histórico; timer do ar. Energia estimada, potência/tarifa ajustáveis; atalhos/chave sob demanda/rotação/copiar; som local opcional desligado por padrão. |

Componentes transversais atuais: App/Shell/ROUTES, ErrorBoundary, AlertCard; ui.jsx contém Icon, Switch, Segmented, sliders/Dial, gráficos Spark/barras, Key, Lcd/Dot, Card/Tile, Confidence/Status/Badge, Stale, Modal/Sheet, ToastProvider e hooks de ação/confiança; tokens.css define a aparência legada. Todos os equivalentes visuais serão escritos de novo. Preservar a capacidade de teclado, foco/modal, mensagens e acessibilidade, não a implementação/DOM.

Shell obrigatório: oito destinos alcançáveis em mobile/desktop/wide/tray; #/nome/param e links antigos #nome:p1:p2; rota desconhecida cai em Início. ?tray=1, ?tray=1&alerta=1, #oculto dormente sem polls/câmeras, #alerta exclusivo da janela alerta e open_browser somente quando pywebview o expuser. Layout pode mudar, compatibilidade de navegação não.

## 4. Fronteiras de dados e comandos — comportamento congelado

A nova UI pode reorganizar a experiência; a fronteira é a API real. Não criar endpoints, presets ou props entre implementadores: há UM dono do frontend. Os contratos a seguir são compartilhados com o backend e devem permanecer exatos.

- GET /api/bootstrap devolve HomeSnapshot + csrfToken; GET /api/state devolve HomeSnapshot; GET /api/status informa version/mode/configuredCount/build. Snapshot mantém mode, devices, scenes, recentActions, hub e stateVersion={epoch,revision}; conservar campos adicionais existentes, inclusive physicalId, confidence, observedAt, estimatedAt e fieldObservations.
- POST /api/devices/:id/commands: {action:'set',values:{...}} ou {action:'key',key}; sucesso conserva {state,device,command}, incluindo command.receipt. POST /api/devices/:id/learn: {key} ou {state} conforme domínio. Luz aceita power/brightness/colorHex; clima somente valores e cobertura reais. Não alterar faixas/validação backend por desenho.
- Receipt mantém requestId, delivery, stateVersion, outcome, requested, reported, confirmedFields, divergedFields, observedAt e timing={budgetMs,elapsedMs,overrunMs}, inclusive nos erros HTTP com receipt. Só campos realmente observados confirmam; não copiar desired para reported. Enviado, confirmado, divergente, incerto, erro e simulado são estados distintos; timeout ou animação não confirma efeito nem desfaz emissão.
- POST /api/scenes/:id/run {} mantém state, results, status e evidenceSummary; tratar partial e confirmações por aparelho/campo. Completed operacional com IR pode continuar sem confirmação física; não emitir sucesso físico geral por HTTP200 ou status agregado.
- Todos os snapshots e receipts, inclusive 502/erros e resultados de modos, obedecem à MESMA ordenação epoch/revision; resposta antiga não rebaixa dados, confiança nem comando novo. Mudança de epoch exige ressincronização, sem comparar revisões de epochs distintas. Preservar correlação requestId/ação e exclusão por physicalId, incluindo aliases e modos versus comando avulso.
- POST exige X-Casa-Token do bootstrap. Repetir uma única vez somente invalid_token rejeitado antes do efeito; nunca retry automático de comando por erro de transporte/timeout/ACK ambíguo. Preservar guardas host/origin/rate do servidor; sem contornar prévia ou expor chaves em logs/referências.
- Um fluxo compartilhado de /api/state, single-flight e pausa por visibilidade; bootstrap/GET antigos não vencem mutações mais novas; reaproveitar snapshot devolvido pelo POST sem GETs redundantes. Cache offline não guarda APIs nem enfileira POST. Fechar mídia, streams, URLs temporárias, timers e sessões de replay ao ocultar/desmontar/trocar.
- Demais fronteiras: /api/location e setup/phone/people/places; /api/tvs e scan/pair/command/label; /api/homelab; /api/network e scan/atualização/remoção; /api/cameras, frame.jpg, ws, live.mjpeg, replay e /api/replays/:id/close|ws; /api/motion e foto/notify/seen; /api/alert-devices; /api/health; /api/notifications e test; /api/modes e order/remove; /api/routines e timer/remove; /api/energy; /api/shortcuts e rotate. Corpos e respostas integrais continuam os validadores/handlers backend atuais, sem migração de dados.

Estados obrigatórios em cada fluxo: carregando, vazio, não configurado, indisponível, prévia, sem conexão, último dado conhecido com idade, ação pendente, resultado parcial/erro e recuperação. Não substituir desconhecido por zero/desligado. IR e energia estimados continuam explicitamente estimados. Textos de usuário em PT-BR e sem jargão interno desnecessário.

## 5. Pesquisa visual e ferramenta exata

Vitral é o único dono de docs/redesign-20261102/references.md e dos portais. Prumo NÃO viu as doze imagens nesta mensagem, NÃO inspecionou referências web nem confirmou diretamente o ID/modelo. Leu o briefing inicial references.md: Vitral relata leitura I01–I12, inspeções em contact sheets, seletor Opus5.5 Médio visível; /design não reverificado e equivalência do ID do artefato pendente. Esses relatos não são prova visual independente de Prumo nem PASS da cobertura. Vitral continua completando cinco referências por família e o detalhamento; o briefing inicial não fecha a pesquisa.

Insumos do usuário: doze imagens já fornecidas e referência histórica Pinterest pin1058979299867870568. Vitral deve localizar/inspecionar as imagens originais e registrar leitura individual I01–I12 (conteúdo observado, qualidades úteis, limitações), sem inferir a aparência pelo nome nem pedir reenvio ao usuário antes de consultar Root.

Pesquisar CINCO referências adicionais INSPECIONADAS para cada uma das oito telas E para as famílias funcionais abaixo, usando Pinterest + Awwwards. Não basta resultado de busca/título/thumbnail. Uma referência pode servir a mais de uma unidade somente com análise específica de cada cobertura; cinco distintas por unidade, sem multiplicar o mesmo pin em cinco provas.

Famílias de interação para Vitral mapear explicitamente; cada linha exige cinco referências inspecionadas e cobertura dos detalhes indicados. Ligar cada detalhe aos IDs úteis ou marcar lacuna real, sem chamar cinco imagens genéricas de prova de todos os subfluxos.

| ID / família | Detalhes a cobrir nas referências / rotas |
|---|---|
| F01 Navegação e shell | Navegação mobile/desktop/wide/tray, subabas, deep links, retorno e alertas; todas as rotas. |
| F02 Comandos e evidência | Pending/busy, enviado/confirmado/parcial/divergente/incerto, prévia, erro, idade e recuperação; Início/Luzes/Clima/TV/modos. |
| F03 Luz/brilho/cor | Toggle, arrastar rascunho+Aplicar, atalhos e +/-; branco/cor/paleta e seleção de aparelho. |
| F04 Clima/IR | Dial/teclado, faixas cobertas/indisponíveis, modo/fan, extras, estado estimado/desconhecido e aprendizagem. |
| F05 TV/pareamento | Direcional/teclas/volume/apps, IR versus rede, busca manual, aceitar/recusar/expirar/renovar permissão e nome. |
| F06 Local/OwnTracks | Mapa/pessoa, idade, lugares/raio/ponto, eventos; QR/link/copiar/download/renovar credencial e estado sem posição. |
| F07 Grade/ao vivo | Filtros/frames/idade, abrir/trocar/fechar câmera, controles de som/fullscreen e indisponibilidade/fallback. |
| F08 Replay/movimento | Timeline/eventos/fotos, buscar trecho, voltar gravação/ao vivo, visto/novo e encerramento da sessão. |
| F09 Avisos/computadores | Tópicos/câmeras/assinatura, teste explícito, seleção/pausa/remoção de computador. |
| F10 Métricas/histórico Lab | CPU/RAM/GPU/discos/WSL, séries/tendências, ausência/idade da leitura, detalhe sem números inventados. |
| F11 Modo Jogo/serviços | Manual/auto/motivo/lista, passo de transição, o que para/continua, estado/links/restart dos serviços. |
| F12 Inventário/topologia | Lista/detalhe, nome/notas/remoção, scan manual, topologia abstrata sem inventar conectividade. |
| F13 Saúde/backup | Resumo/checks, falhas/avisos, conexão e informação de backup com idade real. |
| F14 Modos da casa | Criar/editar etapas, ordenar, executar/parcial e remover com proteção de uso em rotina. |
| F15 Rotinas | Horário/dias e local/pessoa/janela, ações existentes, criar/editar/ativar/remover e histórico de execução. |
| F16 Timers | Programar/cancelar, horário alvo, indisponibilidade e falha/tentativas do agendador; Clima/Central. |
| F17 Energia | Hoje/mês/semana, horas/kWh/custo estimados e editar potência/tarifa, sem telemetria elétrica fictícia. |
| F18 Chaves/configuração | Revelação sob demanda/cópia/rotação, segredo e confirmação; OwnTracks/atalhos/avisos/som local. |
| F19 Formulários/overlays | Seleção/rascunho/validação, salvar/cancelar, confirmação de remoção, foco/teclado e feedback; transversal. |

Formato mínimo por entrada Rnn: URL direta + plataforma, data, tela/família coberta, o que foi realmente aberto/visto, evidência da inspeção (captura/identificador do portal quando disponível), padrão útil, limite/custo e adaptação proposta. Tabela de cobertura liga cada tela/família a cinco IDs e marca pendentes/bloqueados honestamente. Usar as duas plataformas na pesquisa; login/bloqueio não é inspeção concluída. Não expor dados/segredos da casa nas referências.

Ferramenta solicitada EXATAMENTE: Claude Opus5.5, esforço MEDIUM, /design. Vitral verifica disponibilidade REAL de cada elemento e registra evidência antes de afirmar uso; não trocar por outro modelo/esforço silenciosamente. Continuar UM único artefato multipágina no MESMO ID anterior, verificando ID/possibilidade de edição antes de enviar. Se inviável, reportar tecnicamente ao Root; não criar segundo artefato por conveniência.

O protótipo cobre oito páginas e subfluxos, estados e tamanhos principais; não é frontend implementado, prova de API ou aceite estético. A direção visual sai das imagens/pesquisa; não impor a estética Clima+Luzes antiga, tema, componentes, plantas ou dados fictícios como se aprovados.

## 6. Sequência e critérios de conclusão

1. AGORA: Prumo entrega este inventário/contrato; Vitral pode pesquisar remotamente e registrar referências/modelo/ID, sem fontes de produção ou carga pesada. Checkpoint DNS a50022b concluído conforme estado acima; Root identifica o worktree sem antecipar carga pesada.
2. Vitral organiza a proposta integral no artefato existente, com rastreabilidade imagens→referências→decisões e matriz de paridade das oito rotas/subfunções. Comunicar progresso sem pedir novamente autorização para o que já foi solicitado. Propostas continuam propostas até reação/aceite visual real do usuário.
3. Com checkpoint DNS a50022b concluído, Root identifica worktree/branch isolados. Vitral registra ali os paths da UI nova sob seu ownership antes de implementar; sem importar/copiar frontend visual legado, sem editar backend nem checkout publicado. Nenhum arquivo de UI tem dois escritores.
4. No momento compatível com a restrição de jogo, comprovar: oito rotas + deep links/tray; fluxos e limites do inventário; teclado/foco/contraste/reduced motion; ausência de regressões em receipt/IR/ordenação/busy/retry; nenhum scan/efeito físico por navegação. Crivo revisa o conjunto, sem inventar evidência que não executou.
5. Pulso compara baseline/candidato sob mesmo ambiente/carga/rota/viewport quando medições estiverem permitidas. Registrar requests/polls, bytes transferidos e descompactados, tarefas renderer, DOM/heap e ciclo de mídia. Sem metas numéricas inventadas, repetição custosa ou chamar renderer de CPU global/FPS. Regressão material exige decisão técnica Root com evidência.
6. Root integra/publica somente após prova pertinente, backup/rollback e Git; commit/push das alterações delimitadas. Resultado final distingue contrato, protótipo, código, revisão, runtime e aceite visual; nenhum deles é substituto dos demais.

Não iniciar builds/benchmarks/serviços/scans agora. Este contrato não muda jogo, DNS, backend ou UI publicada. Não abrir novas rodadas documentais sem necessidade técnica concreta.
