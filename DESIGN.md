---
name: Casa Local
description: Painel pessoal da casa em forma de sala de monitores; a câmera vem primeiro e os controles ficam a um toque.
colors:
  bg: "#0B0D0C"
  sf: "#141817"
  sf2: "#1D2322"
  line: "#2A3230"
  ctl: "#6F7C78"
  ink: "#E8ECEA"
  mut: "#9AA6A2"
  acc: "#39D98A"
  acc-ink: "#06120C"
  acc-soft: "#12382A"
  info: "#7CC3DA"
  info-soft: "#17313A"
  ok: "#8FD19B"
  ok-soft: "#16301F"
  warn: "#E9C26E"
  warn-soft: "#3A3016"
  div: "#C7A6F0"
  div-soft: "#2F2742"
  err: "#FF8A7C"
  err-soft: "#45211D"
  sim: "#AEB6B3"
  sim-soft: "#262C2B"
  focus: "#8EC7FF"
  glow: "#F3B55A"
  quadro: "#101413"
  rotulo-quadro: "rgba(11, 13, 12, .86)"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(72px, 12vw, 128px)"
    fontWeight: 300
    lineHeight: 0.95
    letterSpacing: "-.035em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-.02em"
  title:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.25
  body:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.45
  sub:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
  label:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "12.5px"
    fontWeight: 650
  mono:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, 'DejaVu Sans Mono', monospace"
    fontSize: ".92em"
rounded:
  s: "10px"
  m: "14px"
  l: "22px"
  pill: "999px"
spacing:
  mosaico: "8px"
  pilha: "12px"
  grade: "14px"
  secao: "20px"
  hit: "44px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "{spacing.hit}"
  button-primary:
    backgroundColor: "{colors.acc}"
    textColor: "{colors.acc-ink}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "{spacing.hit}"
  button-secondary:
    backgroundColor: "{colors.sf2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "{spacing.hit}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.err}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "{spacing.hit}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    size: "{spacing.hit}"
  icon-button-on:
    backgroundColor: "{colors.acc}"
    textColor: "{colors.acc-ink}"
    rounded: "{rounded.m}"
    size: "{spacing.hit}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "{spacing.hit}"
  chip-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
  segmented:
    backgroundColor: "{colors.sf2}"
    textColor: "{colors.mut}"
    rounded: "{rounded.m}"
    padding: "3px"
  segmented-checked:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    rounded: "{rounded.s}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "0 12px"
    height: "{spacing.hit}"
  nav-item-current:
    backgroundColor: "{colors.acc}"
    textColor: "{colors.acc-ink}"
    rounded: "{rounded.m}"
  card:
    backgroundColor: "{colors.sf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.l}"
    padding: "20px"
  objeto:
    backgroundColor: "{colors.sf}"
    textColor: "{colors.ink}"
    rounded: "28px"
    padding: "22px"
  plano:
    backgroundColor: "{colors.sf2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.l}"
    padding: "18px"
  input:
    backgroundColor: "{colors.sf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "0 14px"
    height: "{spacing.hit}"
  selo-estado:
    backgroundColor: "{colors.sim-soft}"
    textColor: "{colors.sim}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  quadro-camera:
    backgroundColor: "{colors.quadro}"
    textColor: "#FFFFFF"
    rounded: "{rounded.l}"
  rotulo-quadro:
    backgroundColor: "{colors.rotulo-quadro}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  rotulo-movimento:
    backgroundColor: "{colors.acc}"
    textColor: "{colors.acc-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

# Design System: Casa Local

Registro feito depois da obra, a partir do código publicado em `web/src` (commit `79c8331`, novembro de 2026). Substitui a direção anterior, "Papel e carvão". Os valores do frontmatter são os do tema escuro, que é o mundo de referência; o tema claro usa os mesmos nomes e está na tabela de Colors. Onde o combinado e o código divergem, vale o código, e a divergência está em "Limites conhecidos".

## Overview

**Creative North Star: "Sala de Monitores"**

O painel é uma guarita: parede de monitores e a legenda sobreposta de um DVR. Onde há câmera, a câmera abre a tela; os controles da casa (ar, luzes, TV) ficam a um toque e não pedem leitura. O chão é quase preto com um fio de verde, as superfícies sobem em dois degraus tonais, e um único verde de sinal marca onde você está, a ação principal e o que se moveu. O rótulo é uma pílula escura sobre a imagem, como a legenda de canal de um monitor.

Celular e popup da bandeja do Windows (440×760 em `tray/casa_janela.py`) pesam o mesmo que o navegador de mesa: a bandeja tem o mesmo ao vivo e o mesmo replay. Os destinos do dia a dia são cinco, na mesma ordem em todo layout: Início, Câmeras, Clima, Luzes, TV. Local, Lab e Central ficam atrás de "Mais" (celular e bandeja) ou num grupo menor no fim da barra lateral. O que é raro (aprender código infravermelho, cadastro, explicações) fica fechado atrás de um resumo: "Aprender e detalhes" no Clima, "Aprender e códigos" na TV.

Início é um resumo da casa. No celular, tablet, mesa e bandeja, o último movimento das câmeras vem logo depois do cabeçalho; na tela larga os quadros das câmeras ocupam a terceira coluna em altura dupla. O Lab mostra modo do PC, máquina e serviços, e não lista mais os aparelhos da rede.

**Key Characteristics:**
- Câmera primeiro: uma em destaque 16:9, as outras em grade densa.
- Um só acento, verde de sinal; seleção entre pares é inversão de tinta, não acento.
- Rótulos em pílula sobre o quadro: nome, idade do quadro, "Movimento".
- Tipografia do sistema, números grandes, leves e tabulares; nenhuma fonte remota.
- Profundidade por degrau tonal e duas sombras suaves; sem desfoque e sem 3D.
- Alvos de 44 px e estado sempre com palavra junto da cor.

## Colors

Escuro quase preto de guarita com matiz verde; claro cinza frio com os mesmos nomes semânticos (`web/src/ui/theme.css`). O tema segue o sistema e pode ser fixado em claro ou escuro; a bandeja é sempre escura.

### Primary
- **Verde de sinal** (`acc`): destino atual na navegação, botão principal, chave e botão de ícone ligados, pílula "Movimento", trechos de movimento na faixa da última hora e na linha do tempo do replay, arco do dial de temperatura, seleção de texto e cursor. Texto sobre ele usa `acc-ink`. `acc-soft` é o brilho suave no topo do objeto de ar e do objeto de luz acesa.

### Neutral
- **Chão da guarita** (`bg`): fundo da página, sob um degradê vertical discreto (`--wash`).
- **Bancada** (`sf`): cartões, objetos, barra lateral, barra inferior, diálogos e campos.
- **Recuo** (`sf2`): superfície informativa plana, trilho do segmentado, botão secundário, esqueleto estático.
- **Fio** (`line`): só separa (bordas de cartão, divisores). Fica abaixo de 3:1 de propósito e nunca é borda de controle.
- **Borda de controle** (`ctl`): contorno de botão, chip, campo, chave e segmentado; pelo menos 3:1 sobre as três superfícies.
- **Tinta** (`ink`) e **tinta apagada** (`mut`): texto principal e texto de apoio.
- **Quadro** (`quadro`) e **rótulo do quadro** (`rotulo-quadro`): fundo do quadro de câmera sem imagem e pílula sobre a imagem. Valem iguais nos dois temas, porque ficam sobre vídeo. A moldura do vídeo é preta (#000).

### Estados (cor sempre com palavra)
- **Informação** (`info`): enviando, enviado sem retorno, rascunho ainda não enviado, traços do mapa.
- **Confirmado** (`ok`), **estimado ou parcial** (`warn`), **divergente** (`div`), **erro** (`err`), **simulado ou desconhecido** (`sim`). Cada um tem o par `-soft` para o fundo do selo.
- **Foco** (`focus`): contorno de 3 px. **Brilho de lâmpada** (`glow`): só o objeto de luz, quando a lâmpada não informa cor.

### Tema claro (mesmos nomes)

| token | claro | token | claro |
|---|---|---|---|
| bg | #ECEFED | info / info-soft | #1D6A85 / #DCEBF0 |
| sf | #F8FAF9 | ok / ok-soft | #2D6A36 / #E1EEDD |
| sf2 | #E1E6E3 | warn / warn-soft | #845400 / #F6E8C9 |
| line | #CBD3CF | div / div-soft | #6B3FA0 / #ECE3F5 |
| ctl | #73807B | err / err-soft | #B3261E / #FADCD8 |
| ink | #141A18 | sim / sim-soft | #56605C / #E3E8E5 |
| mut | #55615C | focus | #155E9E |
| acc / acc-ink / acc-soft | #0B6B40 / #FFFFFF / #D5EFE2 | glow | #F3B55A |

### Named Rules
**Regra do Sinal Único.** Existe um acento, o verde de sinal, e ele diz três coisas: onde você está, qual é a ação principal ou o que está ligado, e o que se moveu. Escolher entre pares (chip pressionado, opção do segmentado) inverte tinta e fundo; não gasta o acento.

**Regra dos Mesmos Nomes.** Os dois temas definem exatamente os mesmos tokens. Cor nova entra nos três blocos de `theme.css` e passa em `theme.test.mjs` antes de ser usada.

**Regra do Fio.** `line` só separa. Tudo que se toca tem contorno em `ctl`.

## Typography

**Display Font:** pilha sans do sistema (`ui-sans-serif, system-ui, "Segoe UI", Roboto, ...`)
**Body Font:** a mesma pilha
**Label/Mono Font:** pilha mono do sistema (`ui-monospace, "SF Mono", "Cascadia Mono", Consolas, ...`) para hora e medidas

**Character:** uma só família, a do aparelho, porque o painel roda na rede local e não busca fonte remota. O contraste vem do peso e do tamanho: número enorme e leve contra texto pequeno e firme.

### Hierarchy
- **Display** (300, `clamp(72px, 12vw, 128px)`, 0.95, tabular, `font-stretch: 112%`): o número do aparelho (temperatura, brilho). Degraus menores no mesmo desenho: `clamp(48px, 7vw, 80px)`, 40 px e 28 px. A unidade vai a 0,38 em, peso 500.
- **Headline** (700, 30 px, 1.1, -0.02 em): título da página na mesa e saudação do Início.
- **Title** (650, 18 px, 1.25): título de cartão e título da página no celular.
- **Body** (400, 15,5 px, 1.45): texto corrente e rótulo de controle (os botões usam peso 600).
- **Sub** (400, 13,5 px, tinta apagada): frase de apoio e idade do dado. Dica curta em 12,5 px.
- **Label** (650, 12,5 px): selos de estado e pílulas sobre o quadro de câmera. Na grade densa a pílula cai para 11,5 px.

### Named Rules
**Regra do Número.** Valor medido ou relatado é número grande, leve e tabular; dado ausente é "—", nunca zero.

## Layout

O layout é decidido pela largura em `core/route.js` e vira classe no contêiner: celular até 759 px (barra inferior de 64 px com cinco destinos e "Mais"), tablet de 760 a 1099 px (trilho lateral de 92 px), mesa de 1100 a 1599 px (barra lateral de 248 px), tela larga a partir de 1600 px. A bandeja tem layout próprio: seis ícones no topo, sem barra lateral. A página tem no máximo 1560 px (1840 px na tela larga) e margem lateral `clamp(16px, 3vw, 40px)`.

Ritmo observado: 8 px entre quadros da grade de câmeras, 12 px em pilhas e linhas, 14 px em grades, 20 px entre seções e dentro do cartão. Não há tokens de espaçamento; os valores estão escritos nas regras.

**Câmeras.** Filtro segmentado, uma câmera em destaque 16:9 (a que tem movimento agora; senão a do último movimento), linha "Rever" com quatro chips (1, 5, 10 e 30 min), faixa da última hora e, por fim, a grade das outras câmeras (colunas de no mínimo 150 px, quadros 16:10). A partir de 1100 px o destaque fica à esquerda, fixo ao rolar, e a grade à direita (1,5 para 1). No celular e na bandeja o cartão em volta some e os quadros vão até a margem.

**Início.** Uma coluna que se abre em duas a partir de 1000 px (1,25 para 1) e em três na tela larga. Os objetos de luz e ar entram numa grade por largura real (mínimo 240 px), com o primeiro objeto ocupando a linha inteira; cada objeto responde à própria largura (container query), não à da janela.

**Clima e TV.** Duas colunas a partir de 1000 px: o objeto principal de um lado, opções do outro. No celular a TV troca entre "Controle IR" e "Samsung · rede" por segmentado; na mesa mostra os dois.

## Elevation & Depth

Híbrido contido. A profundidade vem primeiro do degrau tonal (`bg`, `sf`, `sf2`) e do fio; duas sombras suaves separam o que se toca do que só informa. Não há desfoque, vidro nem 3D (conferido em `ui/css.test.mjs`).

### Shadow Vocabulary
- **Repouso** (`--sh`: `0 1px 2px rgba(0,0,0,.40), 0 8px 24px rgba(0,0,0,.35)` no escuro): cartão neutro.
- **Elevada** (`--sh-up`: `0 2px 4px rgba(0,0,0,.45), 0 16px 40px rgba(0,0,0,.50)` no escuro): objeto tátil, diálogo e aviso flutuante.

### Named Rules
**Regra da Superfície por Função.** Objeto tátil (elevado, canto de 28 px) é o que se opera; cartão neutro agrupa; superfície plana em `sf2` só informa; linha do tempo é um fio à esquerda. Quadro de câmera não tem sombra nem borda: é a imagem.

## Shapes

Cantos arredondados em três passos (10, 14 e 22 px) e a pílula. Controles usam 14 px; cartões, quadro em destaque e diálogos usam 22 px; o objeto tátil usa 28 px; quadros da grade densa usam 14 px. Pílula para chips, selos, rótulos sobre o quadro e a chave. Contorno de controle de 1,5 px em `ctl`; tracejado significa provisório ou simulado (rascunho, prévia, vazio). Ícones são traço de 24×24, 2 px, pontas redondas, na cor do texto. O vídeo do DVR chega em 960×1080 anamórfico e é esticado para preencher a moldura 16:9, porque a imagem real é 16:9.

## Components

### Buttons
- **Shape:** canto de 14 px, altura mínima de 44 px, contorno de 1,5 px, peso 600.
- **Primary:** fundo verde de sinal, texto `acc-ink`. Um por contexto.
- **Secondary / Ghost / Danger:** secundário em `sf2` sem contorno; fantasma sem contorno nem fundo; perigo com contorno e texto em `err`. O padrão, sem variante, é só contorno.
- **Estados:** ao pressionar encolhe para 0,98 (120 ms); desabilitado a 50 % com o motivo lido pelo leitor de tela; ocupado não repete o clique.
- **Botão de ícone:** 44×44 px (64 px no grande), com rótulo acessível; ligado ganha fundo de acento.

### Chips
- **Style:** pílula de 44 px com contorno de controle e fundo transparente.
- **State:** pressionado inverte para fundo `ink` e texto `bg`. Tracejado para ação opcional. Os chips de "Rever" são ação, não seleção: nunca ficam pressionados.

### Segmentado e chave
- Segmentado: trilho em `sf2` com contorno, opções de 44 px; a opção atual inverte para `ink`. Só a opção atual entra no Tab; setas movem.
- Chave: trilho de 52×30 px; ligada, o trilho vai para o acento e o botão desliza 22 px (150 ms). O texto faz parte do alvo.

### Cards / Containers
- **Corner Style:** 22 px (cartão, superfície plana, vazio) e 28 px (objeto tátil).
- **Background:** `sf` para cartão e objeto, `sf2` para a superfície plana.
- **Shadow Strategy:** ver Elevation & Depth.
- **Border:** 1 px em `line` no cartão e no objeto; nenhuma na superfície plana; tracejada em `ctl` no estado vazio.
- **Internal Padding:** 20 px (cartão), 22 px (objeto), 18 px (plana).
- **Resumo fechado:** `<details>` com fio em cima e resumo de 44 px em tinta apagada, para o que é raro.

### Inputs / Fields
- **Style:** 44 px, canto de 14 px, contorno de 1,5 px em `ctl`, fundo `sf`; rótulo acima em 13,5 px, peso 600.
- **Focus:** contorno de 3 px em `focus`, afastado 2 px (vale para todo controle).
- **Error:** contorno em `err` e mensagem em `err` abaixo.
- **Régua:** nativa, na cor do acento, 44 px de altura.

### Navigation
- Item de 44 px com ícone e texto, canto de 14 px, peso 600. O destino atual tem fundo verde de sinal e texto `acc-ink`, em todo layout.
- Mesa e tela larga: barra lateral em `sf` com fio à direita; grupo menor (Local, Lab, Central) separado por fio, em peso 500 e tinta apagada; selo de conexão e botão de tema no pé.
- Tablet: trilho com ícone sobre o texto (80×60 px, 12 px).
- Celular: barra inferior fixa de seis colunas (cinco destinos e "Mais"), itens de 56 px, respeitando a área segura.
- Bandeja: seis botões de ícone no topo e "Abrir no navegador". "Mais" abre uma folha com os três destinos restantes.

### Selos de estado e faixas
- Selo: pílula de 12,5 px com ponto e palavra, na cor do estado sobre o próprio fundo suave. Simulado é tracejado e sem fundo.
- Faixa de aviso: bloco em fundo suave do estado, canto de 14 px, com ícone, título e ação opcional.
- Aviso flutuante: fundo `ink`, texto `bg`, centrado no pé.

### Quadro de câmera (assinatura)
Foto parada que ocupa o quadro inteiro, sem borda nem sombra, fundo `quadro` enquanto não há imagem. Sobre ela, pílulas nos cantos a 10 px da borda (6 px na grade densa): nome e idade do quadro embaixo à esquerda, sino de aviso em cima à direita, "Movimento" em cima à esquerda na cor do acento. O quadro inteiro é o botão que abre o ao vivo. Vídeo só existe depois do toque.

### Faixa da última hora (assinatura)
Trilho de 44 px em `sf2` que representa os últimos 60 minutos. Cada movimento é um trecho verde com o comprimento da sua duração (mínimo de 6 px) e é um botão que abre o replay daquele momento. Marcas verticais em 30, 10 e 5 min; a escala embaixo diz "1 h", "30 min", "10 min" e "agora". Uma frase conta os movimentos.

### Moldura de vídeo e linha do tempo
Diálogo nativo de até 1000 px com moldura preta 16:9 (no máximo 54 % da altura), "Voltar" à esquerda, selo de estado e atalho ("Rever 1 min" no ao vivo, "Ao vivo" no replay). Som e tela cheia ficam abaixo do vídeo e entram juntos na tela cheia. A linha do tempo do replay é um trilho de 8 px com trechos de movimento em acento e um cursor em `ink` com a hora.

### Dial de temperatura e rascunho de brilho
Dial de 270° com trilho fino em `ctl`, arco de valor de 14 px em acento e número Display no centro; envia um comando ao soltar. O brilho mostra lado a lado o que a luz relatou e o rascunho ainda não enviado (caixa tracejada em `info`), com "Aplicar".

## Do's and Don'ts

### Do:
- **Do** abrir a tela com a câmera quando ela existe: destaque 16:9 primeiro, grade densa depois.
- **Do** usar o verde de sinal só para destino atual, ação principal ou ligado, e marca de movimento.
- **Do** rotular quadro de câmera com pílula sobre a imagem (12,5 px, peso 650, fundo `rotulo-quadro`).
- **Do** manter 44 px em todo alvo de toque e contorno em `ctl` em todo controle.
- **Do** pôr palavra junto de toda cor de estado.
- **Do** esconder o que é raro atrás de um resumo fechado, com o controle do dia a dia visível acima.
- **Do** criar cor nova nos dois temas com o mesmo nome e passar em `theme.test.mjs`.

### Don't:
- **Don't** usar `line` como borda de algo que se toca.
- **Don't** marcar seleção entre pares com o acento; inverta tinta e fundo.
- **Don't** animar outra coisa além de `transform` e `opacity`, nem criar `@keyframes`.
- **Don't** usar desfoque, vidro sobre foto ou 3D.
- **Don't** carregar fonte remota.
- **Don't** pôr legenda em caixa alta acima de título em tela nova; veja "Limites conhecidos".
- **Don't** abrir vídeo sem toque, nem deixar stream nascer com som.

## Movimento

Só `transform` e `opacity` animam, entre 80 e 200 ms, com a curva `--ease` (`cubic-bezier(.2, .7, .2, 1)`). Não há `@keyframes` em nenhum CSS de `web/src`; esqueleto é estático. Com "reduzir movimento" nada anima. Comando nunca espera animação; a régua só atualiza a tela durante o arraste e o comando sai ao soltar. O dial de temperatura envia UM comando ao soltar; só o brilho usa rascunho + Aplicar. A janela de alerta da bandeja não anima.

## Acessibilidade

Alvos de 44 px (`--hit`), foco visível de 3 px, texto ≥ 4,5:1 sobre as três superfícies, selo de estado ≥ 4,5:1 sobre o próprio fundo suave, borda de controle `--ctl` e foco ≥ 3:1 (conferidos em `ui/theme.test.mjs` nos dois temas; calculados, não medidos em tela). Estado sempre com texto junto da cor, teclado em todos os controles, link "Pular para o conteúdo", diálogos nativos `<dialog>` que prendem o Tab, fecham com Esc e devolvem o foco a quem abriu. Na tela cheia do vídeo os controles continuam alcançáveis.

## Estados honestos

Enviando, confirmado (só com recibo do aparelho), enviado sem confirmação, sem resposta, divergente, não enviado, simulado (prévia), estimado (infravermelho) e desconhecido têm texto próprio em português (`ui/confidence.js`). Código HTTP, epoch e jargão nunca aparecem. Dado antigo mostra a idade real. Dado ausente é "—", nunca zero. Nada de "simulado" fora da prévia; histórico só do que o servidor guardou. Quadro de câmera diz que é foto, não vídeo, e de quando.

## Regras de comportamento (contrato)

- Abrir uma tela só LÊ (GET). Varredura, busca de TV, teste de aviso e leitura de chave só por toque do usuário.
- Comando por aparelho físico é exclusivo; modo reserva todos os aparelhos que usa; a resposta tardia de uma sessão encerrada é descartada.
- Mídia (ao vivo, replay, quadros) abre só com a aba visível e fecha ao ocultar, trocar de câmera ou sair da rota. Todo stream nasce mudo.
- Segredo (credencial do OwnTracks, chave dos atalhos) só existe na tela enquanto o diálogo ou o painel está aberto; fora disso não vai ao DOM, ao log nem ao armazenamento.
- O popup da bandeja dormente (`#oculto`) não monta nada: nenhum poll, nenhuma câmera.

## Limites conhecidos

- **Só por tokens:** Luzes, Local, Lab e Central receberam o mundo novo apenas pelas cores e pelo kit; a composição dessas telas não foi redesenhada.
- **Tema claro sem revisão visual:** o contraste é calculado em `ui/theme.test.mjs`; ninguém olhou o tema claro tela por tela.
- **Legendas em caixa alta:** a classe `.cap` (12 px, caixa alta) continua acima de títulos e valores em vários cartões. É defeito herdado, não regra; não entra na escala de tipografia e tela nova não a usa acima de título.
- **Ícones do app e manifesto:** `web/public` ainda traz os ícones PNG e SVG do mundo anterior (casa creme com porta goiaba) e o `manifest.webmanifest` com as cores antigas (#151513, #1C1B18). A origem desses PNG não está registrada.
- **Tema da bandeja antes da primeira pintura:** `boot/start.js` grava `data-theme="noite"`, nome que `theme.css` não conhece; o escuro só entra quando o React aplica `escuro`.
- **Mapa do Local:** os blocos do OpenStreetMap ainda levam o filtro sépia do mundo anterior e o rótulo usa cores fixas.
- **Sobra no Lab:** `routes/Lab/Topology.jsx` e as regras `.topo` e `.lab-dev` ficaram no código sem uso.

## Arquivos

`web/src/main.jsx` (entrada e ordem dos CSS), `boot/` (App e preparação), `core/` (rota, layout por largura, store, poll), `shell/` (navegação, bandeja, alerta, tema), `routes/registry.js` (as oito rotas, lazy), `routes/routes.css` e `routes/*/*.css` (um CSS por rota), `ui/` (tokens em `theme.css`, base, kit, ícones, Overlay). Janela da bandeja em `tray/casa_janela.py`. Extensões deste documento em `.impeccable/design.json`.
