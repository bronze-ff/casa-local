# Redesign UI do zero — referências e briefing (02/11/2026, rev. 3)

Dono exclusivo: Vitral (Claude, frontend). Contrato: `docs/redesign-20261102/spec.md` (SHA-256 `ccb3602fa84ed1e18d5330eec30f75c984e93ceddd16712adb9ee1b7342ce9db`, Prumo; revisado Root+Crivo, PASS documental). Este arquivo não é aceite estético, protótipo, código ou runtime. Nenhum código de produto, build, servidor, scan, Git ou serviço foi tocado; BG3/DNS intocados.

## 1. Verificação de modelo, comando e artefato

- **Esta sessão** (Vitral, Claude Code) roda **Sonnet 5.5**. Ela pesquisou e escreveu este arquivo. O protótipo é gerado no Casa Design, não aqui.
- **Casa Design** (portal `claude.ai`), lido do DOM em 02/11/2026: chat "Protótipo de casa inteligente" (`claude.ai/chat/76ffa699-d5c5-43dc-9d18-90ae29eebd4b`); artefato "Casa — painel inteligente", tipo Claude Design, "Apenas você"; UUID `0fd9a3f1-8b32-4656-aa6a-6b4cf64b8ff0`; seletor **"Modelo: Opus 5.5 Médio"**.
- Equivalência de ID: o ID público `2xXAzursABM1bcHqj2Q4oq` do pedido não aparece no DOM. O chat, o título e o conteúdo (Início, TV, Local, Câmeras, Lab, Central, Shell, Sistema; duas rodadas anteriores) coincidem com o artefato multipágina do projeto. É **o mesmo artefato**. A equivalência textual dos IDs não foi provada; a de título/conteúdo/chat foi.
- Comando: digitar `/design` abre o menu com o item **"Design — Criar um novo artefato de Design a partir de um briefing"**. A descrição diz "novo artefato"; isso não prova que haverá um segundo. O envio incluirá a instrução inequívoca de atualizar o artefato atual. Se a interface criar um segundo de fato, eu paro e reporto.
- Esforço: "Médio" no seletor, verificado de novo na hora do envio (seção 9).

## 2. Direção preparada (não herda a estética antiga)

O usuário autorizou direção clara e escura coerentes; não há escolha de tema pendente. **Não herdar Clima+Luzes antiga.** Zero reaproveitamento de frontend, componentes, CSS ou DOM; só lógica, contratos e inventário.

- **Claro quente** (papel, areia) e **escuro carvão** (grafite quente, não preto puro), com os mesmos tokens semânticos.
- **Vidro** só com contraste AA medido sobre o pior fundo e efeito leve (sem desfoque pesado).
- **Acento autoral:** um acento principal quente para ação e estado ativo, mais um frio para estado informativo. Acento nunca é decoração.
- **Tipografia** grotesca; números grandes para estado (temperatura, brilho, idade do quadro, custo).
- **Dados demonstrativos, rotulados "Simulado em protótipo"**, nunca apresentados como a casa real. Sem planta, cômodos, pessoas ou aparelhos inventados como reais. Diagrama de rede é abstrato. O ar IR é sempre **estimado ou desconhecido**; aprender sinal não prova efeito.
- **Movimento:** só `transform` e `opacity`; sem loops; pausa com aba oculta. Com `prefers-reduced-motion`, **remover toda animação não essencial**; nada obriga fade.
- **Semântica de controle atual:** brilho = rascunho + **Aplicar**; cor conforme ação explícita (escolher cor liga a luz só onde o fluxo atual faz isso); não impor "enviar ao soltar" a todos os controles. Comando nunca espera animação; timeout ou animação nunca confirma efeito.
- Alvos de 44 px ou mais, foco visível, teclado e foco de modal preservados.

## 3. Método, limites e evidência

- Plataformas: Pinterest (portal `pinterest`, conta logada) e Awwwards (portal `awwwards`). Data de todas as inspeções: 02/11/2026.
- **Vista I** = imagem de 736 px aberta individualmente (18 refs). **Vista C** = vista só em contact sheet de 10 imagens a cerca de 360 px (76 refs). Texto pequeno nas vistas C não foi transcrito.
- Evidência: o arquivo da imagem baixada (pinimg) e o identificador do pin. A captura de tela do portal só devolve recortes (cerca de 1640×296 px) e não serve como prova; usei DOM, título e texto das páginas.
- O link do pin é a única procedência verificada. Autoria só aparece quando o pin a exibe. Não abri a página de origem externa de cada pin.
- Pesquisa feita em Pinterest e Awwwards. Pinterest repete pins e mistura temas; descartei duplicados e fora de contexto.
- **Pin do usuário** `br.pinterest.com/pin/1058979299867870568/`: reproduzi o vídeo (mp4, 9,9 s) e extraí quadros. O conteúdo é um **catálogo de indicadores de carregamento** pontilhados (Circle, Dots, Fade circles, Ball, Time, Wifi, Icons), em fundo escuro. Útil só para a ideia de indicador estático/discreto; os giros contínuos não entram (contrato: sem loops).
- Esta pesquisa não é prova visual independente do Prumo nem aceite do usuário.

## 4. Leitura individual das 12 imagens do usuário (I01–I12)

Pasta `/tmp/Maestri-drops/`, arquivos lidos individualmente em tamanho cheio.

| ID | Arquivo | Conteúdo observado | Qualidade útil | Limitação |
|---|---|---|---|---|
| I01 | d0001830… | Vidro fosco sobre foto da sala; saudação, câmera ao vivo, clima, aspirador, player e central de avisos | Hierarquia de cards; avisos em cartão branco sobre vidro | Vidro sobre foto prejudica contraste; foto é de uma casa que não existe aqui |
| I02 | 3f101969… | Claro neumórfico; aparelhos com toggle, dial de temperatura, consumo, ocupantes | Dial único; coluna lateral de ajustes | Neumorfismo tem contraste baixo; ocupantes com fotos não existem |
| I03 | ecc13e3e… | Escuro; mosaico retangular de tiles (Home Assistant), relógio, gauges, câmeras | Tiles de tamanhos variados; número grande | Grade densa; sem hierarquia de ação |
| I04 | 02bd1783… | Claro com amarelo-limão; casa 3D, métricas, barras, toggle de modo econômico | Um acento vivo; números enormes | Casa 3D e produção solar não existem |
| I05 | 335f1a5e… | Pontilhado escuro, cartões numerados, acento vermelho-laranja | Rótulos numerados; estado em pontos | Fonte pontilhada reduz legibilidade; pode custar desempenho |
| I06 | 29686648… | Escuro com magenta (Home Assistant); planta isométrica com botões por cômodo; rótulos '7 hours ago' | Planta como navegação; idade do dado visível | Planta não se aplica (não existe planta real aqui) |
| I07 | 30110a47… | Vidro cinza azulado; luz com slider de temperatura de cor e brilho | Slider com gradiente; chips de cômodo | Contraste baixo no vidro |
| I08 | a4b32345… | Vidro cinza sobre foto; termostato circular, fechaduras, energia semanal | Dial grande; abas de cômodo; ícones de navegação em coluna | Fechaduras não existem; vidro sobre foto |
| I09 | 99787964… | Escuro com laranja; câmera ao vivo com barra de controles sobre o vídeo, cartões de luz e ar | Controles sobre o vídeo; toggles; acento único | Sem estados de erro/atraso |
| I10 | e2c36d4c… | Painel de parede com mapa de luzes e avisos coloridos | Planta com ícones ligáveis | Planta não existe; densidade alta |
| I11 | 5b327ee7… | Apartamento 3D translúcido roxo, pinos de estado, cartões à direita | Esquema por cômodo | 3D decorativo proibido pelo contrato de desempenho |
| I12 | a9190b99… | Casa 3D, câmeras e fechaduras à esquerda, linha do tempo à direita | Lista lateral + linha do tempo de atividade | Casa 3D não se aplica |

## 5. Registro de referências (Rnn)

Todas: plataforma Pinterest, data 02/11/2026, URL `https://br.pinterest.com/pin/<id>/`. Custo/limite padrão: foto de design estático; **não é prova de interface, de API nem de desempenho**; não copiar estilo. Vista I/C conforme a seção 3.

| Rnn | Pin | Vista | O que vi | Padrão útil | Adaptação proposta |
|---|---|---|---|---|---|
| R001 | 389561436542527011 | C | Escuro; foto grande de cômodo com chips de leitura, coluna 'Activity' com horários, tiles de luz, ar e aspirador | Coluna de atividade ao lado de um hero | Últimas ações como linha vertical; sem foto fictícia como casa real |
| R002 | 4597753089226635328 | I | 'Good Morning, Alex'; abajur com escala radial 10–100 %; cartões de ar (22 °C), Wi‑Fi (850 Mbps), lâmpada (65 %); grade de barras de energia (12.8 kWh); faixa 'Smart Family Hub' com avatares | Saudação + cartões compactos + barras de grade | Saudação com presença e idade da posição; barras só com dados reais de energia estimada |
| R003 | 1131459106360804381 | C | Escuro; abas de cômodo, roda de cor, dial de ar, cartão de aspirador, relógio | Faixa de atalhos com controle expressivo | Atalhos das duas luzes e do ar; sem aspirador |
| R004 | 414894184433196910 | C | Planta escura com ícones amarelos por luz; lista de ações à esquerda | Estado por ícone | Não usar planta como real; esquema abstrato rotulado 'Simulado' |
| R005 | 927882329507131646 | C | Moldura de tablet; tiles de aparelho, câmera, anel de temperatura, player | Composição densa em largura | Layout wide com frames, sem vídeo contínuo |
| R006 | 809873945501104804 | I | Três telas escuras 'Dining table': roda de cor com cursor; slider vertical com gradiente 2000 K; slider cinza com luz desligada; rótulos de texto Brightness/Color/Temperature; cinco pontos de predefinição; botão redondo de energia | Um controle por vez, trocado por rótulos de texto | Branco/cor/brilho em abas; brilho segue rascunho + Aplicar, sem enviar no arraste |
| R007 | 1152006779754527854 | C | Cartões de gradiente por luz em grade 2×2 'Overview' | Cartão por luz mostrando a cor atual | Cartão de quarto-luz e banheiro-luz |
| R008 | 547117054746324367 | C | Roda de cor, paleta de pontos, lista de luzes | Paleta rápida | 16 cores como paleta; cor só por ação explícita |
| R009 | 1137088605953479770 | C | Predefinições 'mood' em cartões com chips de brilho | Predefinição como cartão | Atalhos de brilho (5) como chips |
| R010 | 179862578848982316 | C | Roda com botão central de energia; abas Colors/Whites/Themes | Abas branco/cor | Branco/cor; 'ligar ao escolher cor' como opção explícita |
| R011 | 1012817403715638870 | I | Cartão claro 'Air Conditioner': chips de cômodo, arco azul 16–32 °C com − 25 °C +, rótulo 'Cooling', quatro modos (Heating/Cooling/Dry/Air), chips de timer 2H–12H, barra escura 'Turn off' com botão de cancelar timer ao lado | Arco com +/− no centro; modos em ícones; timer em chips | 17–30 °C só nas combinações cobertas; valor mostrado como estimado; timer criar/cancelar |
| R012 | 894175701033911057 | C | Telefone: anel de temperatura, interruptor, modos em círculos, slider de velocidade, 'Schedule Turn Off' em chips | Uma coluna: aparelho > modo > velocidade > agendamento | Ventilador só com os níveis aprendidos |
| R013 | 754564112613871596 | C | Claro; arco azul, +/−, linha de modos, chips de umidade | Arco simples | Dial/teclado com faixa indisponível marcada |
| R014 | 1108941108271226990 | C | Escuro; grade de cômodos com temperatura grande e ponto verde/vermelho | Estado grande por item | Não replicar: sem sensores. Só ideia de tipografia grande |
| R015 | 434738170269567420 | C | Escuro; abas Dry/Cool/Auto/Heat, arco, três ventiladores | Modos como abas | Modo/ventilador em controles separados |
| R016 | 1101693127593163193 | C | Telas iOS: pedido de permissão de TV Samsung; controle com anel direcional | Fluxo de permissão antes do controle | Parear/renovar permissão e espera/recusa/expiração |
| R017 | 526428643960648028 | C | 'Connection': busca de aparelho, lista 'Your connections' em três estados | Busca → lista → seleção | Busca manual de TVs; sem varredura automática |
| R018 | 637822366007449843 | I | Dois controles lado a lado, claro e escuro: ligar (vermelho), início, menu; anel direcional com quatro pontos e OK central; Vol e Ch em pílulas verticais; mudo ao centro; três ícones inferiores com o ativo em azul | Direcional circular, pílulas de volume/canal, ícone ativo em azul | Teclas IR cadastradas; envio marcado como 'enviada', sem afirmar efeito |
| R019 | 912330836983004792 | C | Tablet escuro: barra de volume, direcional, transporte, atalhos de origem | Origem + transporte | Entrada/origem e play/pause da TV na rede |
| R020 | 577375614721225731 | C | Touchpad e botões de Apple TV | Teclas agrupadas | Apps YouTube/Netflix/Prime/Globoplay como atalhos |
| R021 | 48484133483606128 | C | Lista de pessoas com mapa e trajeto | Pessoas + último ponto | Até 4 pessoas; idade da posição |
| R022 | 607141593561597486 | C | Mapa com avatares e aba de estatísticas | Resumo do período | Eventos 24 h |
| R023 | 394979829842264275 | I | Mapa com bolha de foto e bateria, círculo roxo de raio, chip 'here for 13 hr, 43 min'; botões de mapa; chips 'Good Morning!'/'Charge your phone'; folha inferior com nome, ponto de status, 'Near Sea Crest', 'Since Thu 7:51pm' e botão 'Save Place' | Folha inferior com nome, idade e 'Salvar lugar'; raio como círculo | Criar lugar a partir do ponto; raio 30–1000 m; sem bateria (não existe) |
| R024 | 613052568029331465 | C | Telas de família: lista de lugares, linha do tempo por pessoa | Lugares e eventos por pessoa | Lugares até 8 |
| R025 | 1132303531332634329 | C | Mapa com avatares grandes; chips Check in e SOS | Chips de ação sobre o mapa | Sem SOS nem check-in (não existem) |
| R026 | 58054282693577882 | C | Dois passos: mapa colorido por cômodo; 'Edit Map' com Merge/Split/nomear | Editar áreas em sheet | Editar lugar: nome, ponto, raio |
| R027 | 1111474383091859920 | C | Escuro; mural de 4 câmeras, lista de alertas à direita | Mosaico + lista de eventos | Grade com idade do quadro |
| R028 | 569494315385235990 | C | Linha do tempo de alertas em painel escuro | Eventos por câmera | Lista de eventos/fotos |
| R029 | 853221092043520316 | C | Claro; vídeo com cluster de controles | Controles agrupados | Som/tela cheia só quando existirem |
| R030 | 480126010283493195 | I | Visualizador 2×2: cada quadro com nome 'Camera Nº…', IP e hora; um quadro 'No Signal' com ícone de câmera; árvore de câmeras/vistas à esquerda; barra Live/Playback/Replay/Export; abaixo, calendário, cursor de hora, faixa de blocos azuis de eventos, 1x e botão Live | Quadro com nome+hora+estado sem sinal; faixa de eventos em blocos; botão 'Ao vivo' | Frame com idade; replay: dia + faixa de eventos + 'Voltar ao ao vivo'. Sem IP na tela; sem Export |
| R031 | 984529168538633956 | C | Telas móveis com câmera em destaque e lista de cômodos | Layout móvel de câmera | Celular 390 |
| R032 | 1134696068652706378 | C | Claro; diagrama de fluxo com KPIs no topo | Fluxo de dependência | Serviços que param/continuam |
| R033 | 571112796519042930 | I | Painel claro de operações de rede: popover 'Degraded' sobre um nó com texto e botões 'Analyze incident'/'Resolve issue'; medidor 95,8 %; lista de alertas com chips Disconnected/Degraded; contadores; legenda de tipos de conexão; alternador 2D/3D | Nó com estado + popover de ação; legenda de linhas | Topologia abstrata dos dados reais; estado por nó; legenda; sem torre/antena |
| R034 | 588986457574495877 | C | Escuro; KPIs em pílulas, barras, mapa de calor | Estatísticas compactas | CPU/RAM/GPU/discos |
| R035 | 1130825787721309126 | C | Claro; tabela densa com linha em alerta vermelho | Linha com ação | Inventário com nome/notas/remover |
| R036 | 1145181011531902490 | C | Cartões com sparkline e valores; lista de tarefas | Cartão de métrica com tendência | Séries reais; ausência marcada |
| R037 | 1077767754590895895 | C | Cartão 'Server status': estado Running, incidentes, duração, barra de CPU | Cartão de serviço | Estado + link privado + reiniciar |
| R038 | 1040190845210294998 | I | Tabela escura 'Active Services': número, nome com ícone de SO, local, IP, data, barra segmentada de CPU com %, chip de status Active (verde)/Paused (âmbar)/Inactive (vermelho); barras e fundo esmaecem em Paused/Inactive | Chip de status colorido + barra esmaecida quando parado | Serviços: estado, restart com bloqueio; sem IP/local |
| R039 | 1033716920718282222 | C | Telefone: painel de rede com medidores de CPU/memória, linha do roteador com 'Reboot' | Ação 'reiniciar' na linha do aparelho | Reiniciar serviço com confirmação |
| R040 | 474989091969419834 | C | Blocos de tempo em linha vertical com duração | Rotina por horário | Linha do dia |
| R041 | 1124281494485064452 | C | Calendário escuro com popover de evento | Dias + popover | Rotina por dias |
| R042 | 983895849857323852 | C | Construtor de fluxo com nós e regras | Condição → ação | Rotina por local/pessoa/janela |
| R043 | 1151443829799163055 | C | Cartões de horário (7:00am, 10:30am) com seletor | Editar horário em cartão | Horário e janela |
| R044 | 1146869861395635927 | C | Telefone com linha do tempo do dia e ícones por evento | Lista do dia | Histórico de execução |
| R045 | 1111896595528457780 | I | Três telefones escuros: central com cartões coloridos; detalhe de cômodo com slider de brilho 80 %, roda de cor, 12 pontos de cor; 'Automations & Routines' com linha vertical de pontos, cartões com chave e chips Temp/Blinds/Security, 'Away Mode — Not Active' | Rotina como cartão com chave, ações em chips, estado 'inativa' em texto | Modos e rotinas com chave de ativar, ações existentes em chips |
| R046 | 940337597199623390 | C | Plano com marcador 'hoje' e barras horizontais | Marcador de posição atual | Marcador de agora na linha do dia |
| R047 | 89649848827801144 | C | Quatro avisos escuros (info, sucesso, erro, atenção) com botão de ação (Dismiss/Close/Retry/Renew) | Faixa com ação de recuperação | Erro com 'Tentar de novo' só quando seguro |
| R048 | 720083427971649133 | C | Quatro avisos claros: Information, Success, Warning, Error | Faixas por gravidade | Mensagens de estado |
| R049 | 1101341283846623519 | C | Três modais escuros: 'Just a minute…' com barra de progresso, 'uploaded', 'We are so sorry' com Retry/Cancel | Pendente → ok → erro no mesmo molde | Comando pendente/enviado/erro |
| R050 | 860257966364668767 | I | Branco; ilustração de tomada desligada; 'Connection lost…'; subtítulo cinza; botão azul 'Try again' | Estado sem conexão com uma ação | Sem conexão com último dado conhecido e idade |
| R051 | 214272894765987747 | I | Painel escuro 'Notifications': abas Unread/Read/Archived; grupos 'Today 5' e 'Yesterday 8' com 'View All'; ponto azul de não lido; Accept/Decline; 'Mark all as read' | Abas + grupos por dia + marcar tudo | Avisos por tópico/câmera; marcar vistos |
| R052 | 1113303971667450029 | C | Abas All/Mentions/System com linhas e ícone | Filtro por tipo | Filtro de tópico |
| R053 | 890235051351981165 | C | 'Notification center' com Today/This Week/Earlier | Agrupar por período | Histórico de avisos |
| R054 | 1092052609675235904 | I | Escuro: três cartões de barras finas com faixas '52–71', '29–37', '49–85' kWh por mês; tabela semanal Mon–Sun com kWh e dia selecionado em destaque; cartão claro com '5.7' e '47 %' com linha de horas | Faixa de valores grande + barras finas + semana com dia ativo | Energia estimada hoje/mês/semana, rotulada como estimada |
| R055 | 704531935493712782 | C | Cartão claro com anel, números e gráfico de linha | Resumo com anel | Custo estimado |
| R056 | 832321574917309153 | C | Escuro; barra segmentada de consumo por origem | Divisão do consumo | Por aparelho (ar, luzes) |
| R057 | 933089616569599742 | C | Calculadora de ROI: campos de entrada e resultado em blocos | Entrada → resultado | Editar potência e tarifa |
| R058 | 790100328427767299 | C | Tiles de configuração rápida liga/desliga | Tile com estado | Modo como tile |
| R059 | 600526931546291556 | C | Escuro; 'All rooms' e 'Appliances' em tiles | Tile por item | Modos em tiles |
| R060 | 1041176007735839378 | C | Três telefones escuros: lista, ar e análise de consumo | Sequência de telas | Detalhe de modo |
| R061 | 620300548716356262 | C | Modal 'Add Habit': nome, data, chips, frequência, Clear/Add | Formulário curto com chips | Formulário de rotina |
| R062 | 296252481762294293 | C | Variações de bottom sheet | Catálogo de sheets | Sheet no celular |
| R063 | 350577152263557889 | I | Wireframe 'Side Bar', 'Dialog', 'Bottom Sheet' com o mesmo conteúdo; no diálogo, botão × fora do cartão; botão escuro na base | Mesmo conteúdo em três containers por largura | Sheet no celular, diálogo no desktop, painel lateral no wide |
| R064 | 310255861852354738 | C | Formulário em sheet com foto, campos obrigatórios (*) e botão largo | Rótulo de obrigatório | Formulário de lugar/pessoa |
| R065 | 1033646551993677422 | C | Formulário escuro com perfil, preferências, toggles e slider, três passos | Campos agrupados | Configuração de avisos/som |
| R066 | 1136314549759926077 | C | Perfil: lista de opções com toggle | Lista de configuração | Configuração local |
| R067 | 1127307350522255301 | I | Três telas escuras: 'Scan QR code' com moldura de leitura e link 'Type in code manually'; 'Activate Pairing Mode' com ícone e botões 'Continue' e 'LED doesn't blink'; 'Choose Wifi' com lista, cadeado e 'Other…' | Um passo por tela; saída alternativa por texto | Pareamento e OwnTracks: QR + código escrito; 'não funcionou' |
| R068 | 532058143460762230 | C | Carrossel e lista de aparelhos selecionáveis | Lista de encontrados | TVs encontradas |
| R069 | 939282066046029302 | C | Modal '2FA setup': QR, 'Manually enter the code', campo com botão Copy | QR + código copiável | Credencial do celular: QR, link, copiar |
| R070 | 164381455125056410 | I | App Harmony: lista 'Select Command' à esquerda; grade com casas tracejadas '+' e badge × para remover; fileira de teclas coloridas; abas One Touch/Controls/Settings; Cancel/Save no topo | Casas vazias a preencher; remover por ×; Salvar/Cancelar | Aprender tecla IR: casa 'a aprender' → 'aprendida' |
| R071 | 382665299589807802 | C | Tela escura 'Pairing in progress' com ícone central e texto curto | Estado 'aguardando' | Aguardando sinal, sem loop |
| R072 | 760193612144872299 | C | Telefone com sucesso de conexão e aviso de atualização | Estado concluído | Aprendida / pareada |
| R073 | 651473902381924420 | C | Branco; 'Turn on Bluetooth' com um botão central | Instrução única | Passo de pareamento |
| R074 | 958844576926479025 | C | Círculos concêntricos azuis de busca | Busca sem texto | Buscando (estático) |
| R075 | 801570433723977464 | C | Régua de ajuste fino com valor 52 e botão Done | Ajuste de valor | Calibração |
| R076 | 728246202275860991 | I | Régua de edição de vídeo: tempo 00:06:52, 'FPS 25', ticks, trecho selecionado com duas alças azuis, cursor com valor 0.6, botão 1x; barra de ferramentas acima | Régua com cursor e trecho de duas alças | Escolher trecho do replay; é de edição de vídeo, não de eventos |
| R077 | 1083819466610316694 | C | Lista vertical com pontos coloridos e horários | Eventos em lista | Alternativa à faixa |
| R078 | 746401338253452436 | C | Atividade da semana com ícones e texto curto | Feed de eventos | Eventos e fotos |
| R079 | 892064638708705100 | I | Sidebar clara 'VAST DS' expandida e recolhida lado a lado; no rail, tooltip 'Users' ao passar; itens com contador (Tasks 10), pastas aninhadas, alternador Light/Dark e rodapé de usuário; terceiro painel com submenu | Rail com tooltip; mesma lista expandida; alternador de tema no rodapé | Sidebar (desktop) → rail (tablet); oito destinos; tema claro/escuro |
| R080 | 805440714630587860 | C | Sidebar expandida, recolhida e estreita lado a lado | Três larguras | Escalonar rail/sidebar |
| R081 | 527836018842691868 | C | Sidebar escura e versão compacta com ícones | Rail escuro | Rail no escuro carvão |
| R082 | 1148277236263617676 | C | Sidebar clara com seções e contador | Sidebar clara | Sidebar no claro quente |
| R083 | 1090715603530660283 | C | Sidebar e rail com ícones e rótulos | Troca por largura | Breakpoints |
| R084 | 638526053445134985 | C | Cartão 'Status Tracker' com 'No records of statuses yet' | Vazio honesto | Sem registros ainda |
| R085 | 926334217117282279 | C | Cartão 'Solved incident' com linha do tempo e tabela | Incidente resolvido | Backup com falha e recuperação |
| R086 | 866380047090243445 | C | 'No data yet' com ilustração e botão | Vazio com ação | Vazio com ação |
| R087 | 913034524508540508 | C | Escuro; 'Oops! Looks like you're stranded…' | Erro em escuro | Indisponível |
| R088 | 345721708906949739 | C | Ícone de nuvem triste 'No offline messages' | Vazio sem ruído | Sem avisos |
| R089 | 555350197811194045 | C | Grade de 9 cartões de estados vazios | Catálogo | Padrão de vazios |
| R090 | 1074038211112448224 | C | Navegador com esqueleto e barra de progresso no topo | Barra no topo + blocos | Carregando |
| R091 | 449445237836557070 | C | Feed com blocos cinza no lugar das linhas | Esqueleto de lista | Lista |
| R092 | 1107252258367094411 | I | Três cartões: à esquerda esqueleto (círculo de avatar + barra de título + bloco de texto cinza), à direita o conteúdo carregado com o mesmo recorte | Esqueleto com o mesmo recorte do conteúdo | Sem salto de layout; esqueleto estático ou fade (sem brilho em loop) |
| R093 | 813040539016962679 | C | Esqueleto móvel claro e escuro | Esqueleto por tema | Dois temas |
| R094 | 963488914052643191 | C | Cartão 'Skeleton': formas imitam o layout final | Definição | Evitar salto |

### Awwwards (A01–A08)

Cada site: página do Awwwards lida (og:image e descrição) e destino real aberto no portal. Onde o destino estava bloqueado ou era marketing, a inspeção de interface **não foi concluída**.

| ID | Site | Página Awwwards | Destino | O que o destino mostrou | Vitrine | Uso |
|---|---|---|---|---|---|---|
| A01 | the-bluejack-group-dashboard | https://www.awwwards.com/sites/the-bluejack-group-dashboard | https://me.thebluejackgroup.com/ | Destino aberto: 'Bluejack Group — Client Dashboard', tela de login com botão 'Try the demo'. A tela de resumo do og:image fica atrás do login/demo; **não inspecionada**. | Vitrine: frase de status + quatro números grandes (og:image) | Só como ideia de faixa de resumo; não confirmada na interface |
| A02 | darkmoon-ai-pentest-platform | https://www.awwwards.com/sites/darkmoon-ai-pentest-platform | https://dark-moon.org/ | Destino aberto: site de marketing com 3 canvas e 101 SVG; texto 'Autonomous, continuous penetration testing'. Não há dashboard navegável na página inicial. | Fundo chapado escuro com mapa de ataque (descrição Awwwards) | Não usar: é marketing, não interface |
| A03 | kaspersky-smart-city-map | https://www.awwwards.com/sites/kaspersky-smart-city-map | https://www.kaspersky.com/int_portfolio/ | Destino aberto: 'Page Not Found | 404'. **Bloqueado**: a vitrine (og:image) mostra mapa isométrico claro com legenda; a interface não existe mais. | Mapa isométrico claro com rótulo | Só a vitrine; sem inspeção de interface |
| A04 | delwp-water-trade-map-app | https://www.awwwards.com/sites/delwp-water-trade-map-app | https://waterregister.vic.gov.au/TradingRules2019/ | Destino redirecionou para 'Victorian Water Register' (página institucional, 187 SVG). O esquema de nós do og:image **não foi encontrado** na página aberta. | Esquema de nós ligados por linhas coloridas e legenda (og:image) | Só a vitrine; interface não confirmada |
| A05 | ayla-interactive-map | https://www.awwwards.com/sites/ayla-interactive-map | https://www.ayla.com.jo/ayla-map/ | Destino aberto: 'Page not found'. **Bloqueado**. | Mapa ilustrado com busca no topo (og:image) | Só a vitrine |
| A06 | real-estate-3d-interactive-map | https://www.awwwards.com/sites/real-estate-3d-interactive-map | https://interactive-map-3d.vercel.app/ | Destino aberto: 'Real Estate Map', 1 canvas, texto 'Browse the map and click on the red dots to find out more'. O recorte de captura do portal mostra mapa claro com vias, parques e sombras suaves. | Mapa claro minimalista; pinos vermelhos que abrem detalhe | Fundo de mapa claro e discreto para Local; sem 3D |
| A07 | algorithmic-trading-dashboard | https://www.awwwards.com/sites/algorithmic-trading-dashboard | https://onlygenius.es/ | Destino aberto: site de marketing em espanhol (menu Servicios/Algoritmos/VPS). O dashboard do og:image é um mockup de laptop; não é interface navegável. | Mockup escuro com área e barras | Descartar como evidência de interface |
| A08 | transxhome | https://www.awwwards.com/sites/transxhome | https://ogud.co.jp/urbanex/next21/ | Destino: **bloqueado**. O portal parou de renderizar (janela minimizada) e o comando expirou. A vitrine mostra fundo areia com desenho de linha. | Fundo areia e linha fina (og:image) | Só como humor de 'claro quente'; sem inspeção |

## 6. Cobertura por tela (5 referências distintas)

| Tela | Rnn |
|---|---|
| Início #/ | R001, R002, R003, R004, R005 |
| Luzes #/luzes | R006, R007, R008, R009, R010 |
| Clima #/clima | R011, R012, R013, R014, R015 |
| TV #/tv | R016, R017, R018, R019, R020 |
| Local #/local | R021, R022, R023, R024, R025 |
| Câmeras #/cameras | R027, R028, R029, R030, R031 |
| Lab #/lab | R032, R033, R034, R035, R036 |
| Central #/central | R040, R041, R042, R043, R044 |

## 7. Cobertura por família funcional F01–F19

Agrupamento anterior (17 famílias) → F01–F19: Início(F1)→F02/F10/F13 (resumo e saúde) e telas; Luzes→F03; Clima→F04/F16; TV→F05; Pareamento/aprender→F05 e F04; Local→F06/F18/F19; Câmeras→F07; Replay→F08; Rede/serviços→F10–F12; Modos/rotinas→F14/F15; Notificações→F09; Energia→F17; Sheets/forms→F19; Vazio/erro/offline e Loading→F02 e a tabela de estados abaixo; Navegação→F01. Nenhuma família do contrato ficou sem linha própria.

| ID | Família | Cinco referências | Detalhes cobertos | Lacunas e decisão |
|---|---|---|---|---|
| F01 | Navegação e shell | R079, R080, R081, R082, R083 | Sidebar→rail, tooltip, contador, alternador de tema, rodapé; larguras desktop/tablet | Lacunas: tabbar do celular, janela de bandeja, subabas, deep links e alertas. Desenho original, apoiado em I08/I09 e R das telas. |
| F02 | Comandos e evidência | R047, R048, R049, R050, R030 | Pendente→ok→erro no mesmo molde; faixas por gravidade; sem conexão com ação; quadro 'sem sinal' com hora | Lacunas: 'divergente', 'incerto' e 'simulado' não aparecem em nenhuma ref; desenho original, com rótulos próprios e sem confundir enviado com confirmado. |
| F03 | Luz/brilho/cor | R006, R007, R008, R009, R010 | Roda/slider por abas de texto, paleta, pontos de predefinição, botão de energia, cartão por luz | Rascunho+Aplicar para brilho não aparece nas refs (todas aplicam ao arrastar); desenho original conforme o contrato. |
| F04 | Clima/IR | R011, R012, R013, R015, R070 | Arco com +/−, modos em ícones/abas, ventilador, timer, casas a aprender (R de aprendizagem) | Lacunas: faixas não cobertas/indisponíveis e 'estimado/desconhecido' não aparecem; desenho original. A aprendizagem de estado completo é adaptada de R070. |
| F05 | TV/pareamento | R018, R019, R016, R017, R068 | Direcional + pílulas Vol/Ch, origem/transporte, permissão antes do controle, busca→lista→seleção | Lacuna: expirar/renovar permissão e renomear; IR versus rede lado a lado. Desenho original. |
| F06 | Local/OwnTracks | R023, R021, R024, R026, R069 | Folha com nome/idade/'Salvar lugar', raio em círculo, lista de lugares, edição em sheet, QR + código copiável | Lacunas: baixar arquivo, abrir app, renovar credencial e 'sem posição'. Desenho original. |
| F07 | Grade/ao vivo | R027, R030, R029, R031, R028 | Mosaico com nome+hora, 'sem sinal', controles agrupados, móvel | Lacunas: fallback MSE→MJPEG, som/tela cheia por suporte, anterior/próxima. Desenho original. O mosaico do usuário (I03, I09) também apoia. |
| F08 | Replay/movimento | R030, R076, R028, R077, R078 | Dia + faixa de blocos + botão 'Ao vivo'; régua com trecho; eventos em lista/feed | Lacunas: visto/novo, encerramento de sessão. R076 é régua de edição de vídeo, não de eventos; adaptar só o gesto. |
| F09 | Avisos/computadores | R051, R052, R053, R048, R039 | Abas, grupos por dia, marcar tudo, filtro por tipo, ação 'reiniciar' na linha do aparelho | Lacunas: teste explícito, seleção/pausa/remoção de computador. Desenho original. |
| F10 | Métricas/histórico Lab | R034, R036, R054, R055, R056 | KPIs em pílulas, sparkline, faixa de valores + barras, semana com dia ativo, divisão por origem | Lacunas: WSL/discos, 'sem leitura' e idade da leitura. Desenho original; nenhuma série fictícia. |
| F11 | Modo Jogo/serviços | R038, R037, R039, R032, R035 | Chip de status + barra esmaecida quando parado, cartão de serviço, 'reiniciar' na linha, fluxo do que para/continua, linha em alerta | Lacunas: manual/auto, motivo e passo de transição. Desenho original. |
| F12 | Inventário/topologia | R033, R035, R032, A06, A04 | Nó com popover de ação e legenda, tabela com ação, esquema de nós ligados (Awwwards) | Awwwards A04 é só vitrine (og:image); A06 é mapa, não rede. Topologia abstrata é desenho original; sem scan ao abrir. |
| F13 | Saúde/backup | R085, R084, R048, R037, A01 | Incidente resolvido, vazio honesto, faixas por gravidade, cartão de estado, resumo com números grandes | A01: o destino real é uma tela de login; só a vitrine (og:image) foi vista. Lacuna: idade real do backup. Desenho original. |
| F14 | Modos da casa | R045, R058, R059, R060, R061 | Cartão com chave e ações em chips, tiles com estado, formulário curto com chips | Lacunas: ordenar por alça, proteção de uso em rotina, resultado parcial. Desenho original. |
| F15 | Rotinas | R040, R041, R042, R046, R044 | Blocos de tempo, dias com popover, condição→ação, marcador de agora, lista do dia | Lacuna: histórico de execução. Desenho original. |
| F16 | Timers | R011, R043, R076, R075, R012 | Chips 2H–12H + cancelar, cartões de horário, régua, ajuste fino, agendamento | Lacuna: falha/tentativas do agendador. Desenho original. |
| F17 | Energia | R054, R055, R056, R057, R036 | Faixa de valores, anel, divisão por origem, calculadora de entrada/resultado, tendência | Telemetria elétrica não existe: tudo rotulado 'estimado'. Lacuna: hoje/mês/semana reais. |
| F18 | Chaves/configuração | R069, R065, R067, R066, R061 | QR + código copiável, campos agrupados com toggle, 'digitar o código', lista de configuração | Lacunas: revelar sob demanda, rotacionar e confirmar. Desenho original; segredo mascarado por padrão. |
| F19 | Formulários/overlays | R062, R063, R061, R064, R065 | Sheet/diálogo/painel pelo mesmo conteúdo, campos obrigatórios, formulário curto | Lacunas: validação, confirmação de remoção, foco/teclado. Desenho original. |

Rastreabilidade das famílias que o contrato exige: **comandos** (F02), **confiança** (F02, F04: estimado/desconhecido), **saúde** (F13, F10, F11) e **segredos** (F06, F18). Nenhuma foi fundida a outra.

### Estados transversais

| Estado | Rnn |
|---|---|
| Vazio / erro / sem conexão | R086, R050, R087, R088, R089 |
| Carregando (esqueleto) | R090, R091, R092, R093, R094 |
| Pareamento e aprender (passos) | R071, R072, R073, R074, R067 |

Lacuna: "último dado conhecido com idade" não tem pin dedicado; apoio em I06 ('7 hours ago') e R030 (hora em cada quadro). Desenho original.

## 8. Observações

- Itens das referências que **não** entram: login diário, cômodos/dispositivos fictícios como reais, assistente de voz, SOS, firmware, Export, fotos de pessoas, planta real.
- Uma referência usada em mais de uma família tem análise específica na coluna de detalhes; não multiplica prova.
- Lacunas de padrão são desenho original fundamentado em referências adjacentes; não travam o envio.

## 9. Brief para o `/design` (texto enviado)

Condição de envio: seletor Opus 5.5 Médio; o artefato aberto é "Casa — painel inteligente". O texto abaixo é o conteúdo do arquivo anexo `brief.md`; a mensagem do chat contém a instrução inequívoca (primeiro parágrafo) e remete aos anexos.

````text
Atualize o conteúdo **dentro do artefato atual "Casa — painel inteligente", neste mesmo chat. Não crie um segundo artefato e não abra outro nó.** Mantenha somente o contêiner multipágina. Descarte todo o conteúdo, CSS, DOM e componentes existentes (inclusive "Linguagem ambiente", a direção Clima+Luzes e as artboards v1/legado) e escreva a UI inteira DO ZERO. Se a interface só permitir criar outro artefato, pare e diga isso; não crie.

Anexos: 12 imagens do usuário (I01–I12) e dois arquivos: este brief e a pesquisa (references.md).

Entregue um protótipo multipágina das oito rotas (Início, Luzes, Clima, TV, Local, Câmeras, Lab, Central), do Shell (celular 390 com tabbar, tablet 768 com rail, desktop 1280 com sidebar, wide 1600, janela compacta de bandeja `?tray=1` e alerta `?tray=1&alerta=1`) e da página Sistema (tokens, componentes, estados). Tudo em português do Brasil, sem códigos HTTP nem jargão interno.

DADOS: use dados **demonstrativos, rotulados "Simulado em protótipo"**. Nunca os apresente como a casa real. Não invente aparelhos, pessoas, cômodos, planta física, telemetria, sensores ou automações. A topologia de rede é um diagrama abstrato. O ar (IR) é sempre "estimado" ou "desconhecido"; aprender um sinal não prova efeito no aparelho.

DIREÇÃO VISUAL: dois temas coerentes — claro quente e escuro carvão (grafite quente, não preto puro). Vidro só com contraste AA e efeito leve. Um acento autoral. Tipografia grotesca com números grandes. Nada herdado da estética antiga.

COMPORTAMENTO: brilho = rascunho + botão Aplicar; cor por ação explícita; não imponha "enviar ao soltar" a todos os controles. O comando nunca espera a animação; animação e timeout nunca confirmam efeito. Distinga enviado, confirmado, parcial, divergente, incerto, erro e simulado.

ESTADOS em cada fluxo: carregando (esqueleto), vazio, não configurado, indisponível, prévia, sem conexão, último dado conhecido com idade, ação pendente, resultado parcial/erro e recuperação.

MOVIMENTO: só transform e opacity; sem loops; pausa com aba oculta; com prefers-reduced-motion, remova toda animação não essencial. Alvos de 44 px ou mais, foco visível, teclado e foco de modal.

REFERÊNCIAS: use references.md (anexo). A coluna "Adaptação proposta" diz o que aproveitar. Não copie estilo de nenhuma referência.

RASTREABILIDADE: ao final, liste para cada rota e família F01–F19 qual referência (Rnn/Inn) orientou a decisão e o que ficou como desenho original. Diga também o que não foi feito e se o sistema criou algum segundo artefato.

PARIDADE OBRIGATÓRIA — inventário integral e fronteiras de dados (contrato do projeto):

### Inventário (spec.md §3)
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

### Fronteiras de dados e comandos (spec.md §4)
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
````

## 10. Registro do envio ao `/design` (02/11/2026)

- **Enviado:** `/design` escolhido no menu, no chat "Protótipo de casa inteligente", com o seletor em **Opus 5.5 Médio** (lido do DOM antes de clicar em Enviar). Anexos conferidos no DOM: `I01.png`–`I12.png`, `brief.md` (com spec.md §3 e §4 integrais) e `references.md`.
- **Artefato:** a URL do chat e o parâmetro `artifact=0fd9a3f1-8b32-4656-aa6a-6b4cf64b8ff0` não mudaram depois da geração; o título continua "Casa — painel inteligente". O modelo informa que não criou segundo artefato. Eu **não** confirmei isso pela galeria de artefatos.
- **Duração:** cerca de 25 min de geração. O modelo informa "Conversa compactada" ao final.
- **O que o modelo relatou como não feito:** celular/tablet só no Início; sem prendedor de foco em janelas; reordenar modos por botões, não por arrasto; contraste AA não medido; links do menu abrem pranchas, não `#/`; só I06 e I09 orientaram decisões.
- **Rastreabilidade a corrigir:** o resumo do modelo usa rótulos de família que **não** batem com o contrato (por exemplo, F09 como "confiança do dado", F14 como "notificações", F17 como "modo Lab/Jogo", F19 como "modos e rotinas"). A tabela da seção 7 deste arquivo é a correta. Não use o resumo do modelo como mapa de cobertura.
- **Não verificado por mim:** a aparência do protótipo. As capturas do portal só devolvem recortes. Este registro **não** é aceite visual nem prova de que o protótipo atende ao contrato.

## 11. Revisão da aparência real e correção consolidada (02/11/2026)

**Como revisei.** O canvas do Casa Design é um iframe de outra origem. O portal só devolve a captura do canvas a 28% de zoom (borrada) e não aceita cliques dentro dele; isso é um limite real. Por isso li os arquivos publicados do artefato (leitura pelo endereço `claude.ai/artifact/2xXAzursABM1bcHqj2Q4oq`) e renderizei cada prancha em escala 1:1 com o navegador headless local, com o `dc-runtime.js` do próprio artefato e as fontes reais (Archivo e IBM Plex Mono). Não rodei servidor, build nem nenhum serviço. Isso **não é** captura do canvas real: é o meu renderizador; pode diferir em alguns pixels.

**Identidade.** Ler o UUID `0fd9a3f1-8b32-4656-aa6a-6b4cf64b8ff0` devolve o artefato cujo endereço publicável é `2xXAzursABM1bcHqj2Q4oq`. Os dois IDs são o **mesmo artefato**. Título "Casa — painel inteligente", Claude Design, "Apenas você". Antes da correção: versão `1793648907-e857`, 15 pranchas. Depois: versão `1793650404-f523`, 31 pranchas, mesmo endereço. Nenhum segundo artefato foi criado.

**Capturas (minhas, locais).** Rodada 1 (antes): `/tmp/claude-1000/gen/render/shots/` (30 PNG, claro e escuro). Rodada 2 (depois): `/tmp/claude-1000/gen/render2/shots/` (62 PNG, 31 pranchas em claro e escuro). Revisei uma a uma, na rodada 2: Início 1280, Local 1280, Câmeras 1600, Luzes 390, Alerta, Lab 768, TV 390 e Sistema. As demais foram renderizadas, mas **não revisadas uma a uma**.

### Matriz (feito / parcial / ausente)

Evidência: **R** = renderização que eu vi; **C** = código que eu li; **T** = só texto do Claude, não verificado por mim.

| Item | Situação | Evidência |
|---|---|---|
| Início: "Desligada" vazava do cartão | Feito | R (antes e depois) |
| Local: rótulos da linha de 24 h saíam do cartão | Feito: agora pontos + lista de eventos | R |
| Local: "posição há 4 min" cortado | Feito: quebra de linha | R |
| Shell-Wide: rótulos sobrepostos | Prancha removida; Câmeras 1600 sem sobreposição | R (Câmeras 1600) |
| Alerta: botão cortado | Feito (altura 450) | R |
| Pranchas curtas cortando conteúdo (Sistema, Central, Desktop) | Feito: alturas 3520, 2380, 1060 | C (canvas.json), R (Sistema) |
| Lab: hosts e portas | Feito: "endereço de exemplo omitido" | R, C (sem `lab.casa`) |
| Responsivo: 8 rotas em 390 e 768 e 1280 | Feito em arquivo: 24 pranchas existem | C (canvas.json); R só TV 390, Luzes 390, Lab 768 |
| 1600 para Início, Câmeras e Lab | Feito em arquivo | C; R só Câmeras 1600 |
| 1600 é só alargamento | Parcial | T e R (Câmeras 1600: grade em 3 colunas) |
| Painéis e diálogos no celular abrem no topo da prancha longa | Parcial | T |
| Bandeja `?tray=1` e alerta | Feito | R (Alerta), C |
| Prendedor de foco | **Código presente**: tratamento de Tab e Shift+Tab, chamadas a `.focus()`, diálogos fechados com `visibility:hidden` | C. **Não executei** o teste de teclado; o teste de 14 Tabs é relato do Claude (T) |
| Foco: 3 diálogos sem teste | Parcial | T (Lab folha de rede, Local lugar, Sistema) |
| Contraste de texto (tokens) | Feito (AA) | Calculei: todos os pares ≥ 4,77 nos dois temas |
| Borda de controle `--ctl` ≥ 3:1 | Feito | Calculei: claro 3,37–4,06; escuro 3,44–4,18 (sobre sf, bg, sf2) |
| Contraste de etiquetas de estado | Feito (relatado, 4,98–9,46) | T. Mostrado na página Sistema (R); não recalculei |
| Contraste sobre vidro e sobre fotos | Ausente | T |
| Rótulos F01–F19 do contrato | Feito: nomes exatos | T; o conjunto de referências por família é igual ao da seção 7 (comparei por script) |
| Navegação: testador e links da sidebar | Parcial | C: `localStorage` por 15 s leva o parâmetro entre pranchas; depende do navegador permitir |
| `#alerta` e `#oculto` no testador | Feito | C |
| Rastreabilidade das 12 imagens | Feito no texto do Claude; só I03, I06, I07, I08, I09, I12, I01 e I04 citadas como orientadoras | T. Eu não verifiquei se o desenho reflete cada uma |
| Reordenar modos por botões acessíveis (44 px) | Feito (alternativa válida) | T |
| Reordenar por arrasto | Ausente (aceito) | T |
| Verificação no canvas real | Ausente | Limite do portal (seção acima) |
| Lab: topologia no estado padrão | Parcial: "Rede de casa" mostra só o vazio até a busca manual | R (Lab 768) |
| Lab: botão × dentro do chip de jogo com borda dupla | Defeito pequeno restante | R (Lab 768) |
| Pranchas 390 muito longas | Observação: o tabbar fica no fim da prancha, não fixo na tela | R (Luzes 390) |

**O que continua sem prova minha:** comportamento de teclado e foco, as transições, as animações, o contraste sobre vidro/foto e o fluxo de links entre pranchas. Nada disso está aceito. Aceite estético é do usuário.

## 12. Fechamento do escritor e inventário de arquivos (02/11/2026)

**Estado.** Este arquivo está fechado para o checkpoint do Root. Não há nova geração no `/design` nem código de produto enquanto a revisão do Crivo ocorre.

**Observação do Root, registrada como insumo (não é correção aplicada).** O desenho é limpo, mas plano e administrativo frente às referências: o relógio grande e as listas em tabela dominam, há pouca composição espacial e tátil, e quase não há hierarquia visual entre dispositivos. A maioria das 31 pranchas ainda não foi revisada uma a uma por mim (seção 11). Esta observação orienta uma rodada futura, se o Root a autorizar.

**Fora de escopo.** Prendedor de foco e AA reais serão tratados na implementação, não nas 31 pranchas do protótipo.

**Arquivos em `docs/redesign-20261102/`:** somente `spec.md` (Prumo) e `references.md` (este). O brief enviado ao `/design` **não** é um arquivo do repositório: seu texto está na seção 9; a cópia anexada ficou em `/tmp/claude-1000/gen/brief.md`.

**Anexos enviados ao `/design` (cópias em `/tmp/claude-1000/gen/att/`):** `I01.png` a `I12.png`, `brief.md` e uma versão anterior deste `references.md` (rev. 3, antes das seções 10 a 12).

**Fonte do artefato lida para a inspeção** (endereço `claude.ai/artifact/2xXAzursABM1bcHqj2Q4oq`, versão `1793650404-f523`; cópias em `/tmp/claude-1000/gen/art2/`):
- `project/canvas.json`
- `project/Main.dc.html` (Sistema), `Shell-Desktop`, `Shell-Bandeja`, `Shell-Alerta`
- 8 rotas em 1280: `Inicio`, `Luzes`, `Clima`, `TV`, `Local`, `Cameras`, `Lab`, `Central`
- 390 e 768 de cada rota: `Inicio`, `Luzes`, `Clima`, `TV`, `Local`, `Cameras`, `Lab`, `Central` (16 arquivos)
- 1600: `Inicio-1600`, `Cameras-1600`, `Lab-1600`
- CSS de tokens: asset `cc143ebdfa01e1a95a7c395203c6c8ac`
- Versão anterior (`1793648907-e857`), usada na rodada 1: cópias em `/tmp/claude-1000/gen/art/` (15 arquivos de `project/`, CSS `823fb5b8f24b43233783a2107a4cd72f`)
- Runtime usado para renderizar: `artifact-type/dc-runtime.js` (cópia em `/tmp/claude-1000/gen/art/artifact-type/`)

**Renderizações:** `/tmp/claude-1000/gen/render/shots/` (rodada 1, 30 PNG) e `/tmp/claude-1000/gen/render2/shots/` (rodada 2, 62 PNG: 31 pranchas, claro e escuro). Scripts de apoio: `/tmp/claude-1000/gen/render/shim.js`, `render/ch.txt` e `gen/make.py`/`refs_data.py` (geradores deste documento). Nada disso está no repositório.

**Fora do repositório e sem commit:** tudo em `/tmp/claude-1000/gen/`. O Root decide se copia alguma captura para o repositório; eu não adicionei nada além deste arquivo.
