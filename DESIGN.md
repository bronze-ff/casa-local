---
name: Casa Local
description: Painel pessoal da casa em vidro fosco sobre cinza quente; câmera em destaque, controles a um toque, um único acento claro.
colors:
  bg: "#2E2E2D"
  sf: "#3A3A39"
  sf2: "#454544"
  line: "#5A5A58"
  ctl: "#959592"
  ink: "#F5F5F3"
  mut: "#BCBCB8"
  acc: "#F5F5F3"
  acc-ink: "#262625"
  acc-soft: "#4E4E4C"
  info: "#A6D4EA"
  info-soft: "#22343D"
  ok: "#9FE0B4"
  ok-soft: "#24382B"
  warn: "#EECB7E"
  warn-soft: "#3D3420"
  div: "#D2B8F4"
  div-soft: "#352C45"
  err: "#FFA294"
  err-soft: "#4A2A26"
  sim: "#C8C8C4"
  sim-soft: "#3E3E3C"
  focus: "#B0D8FF"
  glow: "#F3B55A"
  glass: "rgba(255, 255, 255, .075)"
  glass-2: "rgba(255, 255, 255, .13)"
  glass-in: "rgba(0, 0, 0, .16)"
  glass-line: "rgba(255, 255, 255, .13)"
  glass-hi: "rgba(255, 255, 255, .20)"
typography:
  family: "Urbanist (empacotada via @fontsource; fallback ui-sans-serif, system-ui, Segoe UI)"
  headline: { fontSize: "clamp(30px, 3.2vw, 42px)", fontWeight: 600, letterSpacing: "-.025em" }
  title: { fontSize: "18px", fontWeight: 600 }
  body: { fontSize: "15.5px", fontWeight: 450, lineHeight: 1.45 }
  eyebrow: { fontSize: "14px", fontWeight: 500, color: "{colors.mut}" }
  label: { fontSize: "12.5px", fontWeight: 650 }
  number: { fontWeight: 500, letterSpacing: "-.03em", tabular: true }
rounded:
  s: "12px"
  m: "16px"
  l: "24px"
  xl: "30px"
  pill: "999px"
blur: "26px"
---

# Design System: Casa Local

Registro do desenho "Vidro" (novembro de 2026), que substitui a "Sala de Monitores". A referência visual foi um painel de casa inteligente em vidro fosco sobre cinza quente; aqui ele foi aplicado aos itens reais da casa (câmeras do DVR, ar e TV por infravermelho, duas luzes, modos, pessoas, home lab), em português. O escuro é o mundo de referência; o claro ("névoa") usa os mesmos nomes de token.

## Overview

**North Star: "Vidro sobre cinza".** O fundo é um degradê cinza quente com manchas de luz suaves (`--page`), como uma foto desfocada da sala. Sobre ele flutuam painéis de vidro fosco: barra lateral, barra superior em pílula e um painel grande que abraça o conteúdo. Dentro, cartões também de vidro. Um único acento, a tinta clara: o destino atual é uma pílula branca com texto escuro, o botão principal é a pílula branca, o arco do dial é branco.

**Moldura (mesa e tablet).** Barra lateral flutuante com o cartão da casa no topo (círculo branco com a casa, "Casa Local", aparelhos e conexão), grupos "Casa" (Início, Câmeras, Clima, Luzes, TV) e "Mais" (Local, Lab, Central) com legenda em caixa alta, e as pessoas no pé (rostos empilhados e uma frase honesta). Barra superior em pílula: busca (Ctrl K / ⌘K; seções, aparelhos e câmeras), selo de conexão, tema e o avatar. Cada página abre com uma frase pequena (eyebrow) acima do título grande.

**Início.** Data por extenso, saudação ("Bom dia") e uma linha-resumo com contagens; aparelho sem conexão vira link sublinhado em `warn`. Modos em cartões-pílula (ícone em círculo, nome e a descrição do que fazem). Faixa principal: câmera em destaque (o último movimento, foto parada com hora e contagem) com miniaturas de até quatro câmeras e o bloco "Todas"; ao lado, data e hora em dois blocos e o ar num dial de 270°. Por fim, chips de filtro (Tudo, Luzes, Ar, TV, Home lab) sobre a grade de aparelhos. Celular empilha (sem miniaturas); bandeja segue compacta.

**Key Characteristics:**
- Vidro fosco (`backdrop-filter: blur(var(--blur))`, sempre com o par `-webkit-`) com fio claro no topo (`--glass-hi`).
- Controles em pílula; seleção = pílula clara (`--acc`) com texto `--acc-ink`.
- Tipografia Urbanist, empacotada no build (nenhuma fonte remota).
- Números grandes em peso 500, tabulares.
- Alvos de 44 px e estado sempre com palavra junto da cor.

## Colors

Tokens em `web/src/ui/theme.css`. Os hexadecimais (`bg`, `sf`, `sf2`…) são as superfícies opacas equivalentes ao vidro e é sobre eles que o contraste é conferido em `ui/theme.test.mjs` (texto ≥ 4,5:1, borda de controle e foco ≥ 3:1, `line` < 3:1). O que pinta de fato é o vidro: `--glass` (cartões, barras), `--glass-2` (mais opaco: diálogos, listas suspensas, botão secundário), `--glass-in` (afundado: trilhos, campos, superfície informativa `.sand`), `--glass-line` (bordas) e `--glass-hi` (luz na borda de cima).

### Tema claro "névoa" (mesmos nomes)

| token | claro | token | claro |
|---|---|---|---|
| bg / sf / sf2 | #E4E4E1 / #F0F0EE / #D8D8D4 | info / info-soft | #1C5F7A / #D8E8EF |
| line / ctl | #C4C4C0 / #737370 | ok / ok-soft | #2A6334 / #DDEBDD |
| ink / mut | #1D1D1C / #545451 | warn / warn-soft | #7A4E00 / #F3E5C6 |
| acc / acc-ink / acc-soft | #262625 / #FFFFFF / #CFCFCB | div / div-soft | #63389A / #E9E0F3 |
| focus | #1F5E99 | err / err-soft | #A8231B / #F7DAD6 |

### Named Rules
**Regra do Acento Claro.** Existe um acento, a tinta clara (`--acc`): destino atual, ação principal, ligado, chip escolhido, arco do dial. No tema claro ele vira tinta escura, com o mesmo papel.

**Regra dos Mesmos Nomes.** Os dois temas definem exatamente os mesmos tokens. Cor nova entra nos três blocos de `theme.css` e passa em `theme.test.mjs` antes de ser usada.

**Regra do Vidro.** Superfície é vidro; a intensidade mora num token só (`--blur`). Vidro sobre foto só nos rótulos de câmera (pílula escura translúcida).

## Typography

Uma família, **Urbanist**, de `@fontsource/urbanist` (pesos 400, 500, 600, 700), importada no topo de `theme.css` e empacotada pelo Vite. Hierarquia: título de página `clamp(30px, 3.2vw, 42px)` peso 600; título de cartão 18 px peso 600; corpo 15,5 px peso 450; eyebrow 14 px em `mut`; legenda `.cap` 11,5 px caixa alta só nos grupos da barra lateral e rótulos de medida; números grandes em peso 500, tabulares (data, hora, temperatura, brilho).

**Regra do Número.** Valor medido ou relatado é número grande e tabular; dado ausente é "—", nunca zero.

## Layout

Decidido pela largura em `core/route.js`: celular até 759 px (barra inferior de vidro com cinco destinos e "Mais"), tablet de 760 a 1099 px (trilho de 92 px + barra superior), mesa de 1100 a 1599 px (barra lateral de 264 px), tela larga a partir de 1600 px. Na mesa e no tablet a página tem 16 px de respiro em volta (`--gap`) e o conteúdo mora num painel de vidro com canto de 30 px. A bandeja abre do tamanho de um tablet em pé (880×1000, `tray/casa_janela.py`, fundo `#2E2E2D`, encolhe para caber na área de trabalho) e usa o layout de tablet, com "Abrir no navegador" na barra superior; abaixo de 760 px de largura cai no layout compacto (seis ícones numa pílula de vidro no topo). No celular, o cabeçalho de vidro fica preso no topo ao rolar, a barra inferior é uma pílula flutuante 10 px acima da área segura, e os filtros do Início ficam numa linha que rola de lado.

## Elevation & Depth

Profundidade por vidro: translucidez, desfoque, fio claro em cima e duas sombras suaves (`--sh` repouso, `--sh-up` elevada). Sem 3D (conferido em `ui/css.test.mjs`, que também exige o par `-webkit-backdrop-filter`).

## Shapes

Cantos 12, 16, 24 e 30 px e a pílula. Botões, chips, segmentado, busca, barra superior e itens selecionados são pílulas; cartões 24 px; objetos táteis, painel da página, barra lateral e diálogos 30 px. Ícones de traço 24×24, 2 px, pontas redondas, na cor do texto.

## Components

- **Botão:** pílula de vidro de 44 px, peso 600; principal (`.btn.p`) é a pílula clara com sombra; secundário em `--glass-2`; fantasma sem fundo; perigo em `err`.
- **Botão de ícone:** círculo de vidro de 44 px (64 px no grande); ligado vira círculo claro.
- **Chip:** pílula de vidro; pressionado vira pílula clara.
- **Segmentado e chave:** trilho afundado (`--glass-in`) em pílula; a opção atual e a chave ligada usam o acento claro.
- **Cartão de modo:** pílula larga com ícone num círculo de vidro, nome e a descrição do modo em uma linha.
- **Dial do ar (Início):** arco de 270° com trilho em `--glass-line`, marcas finas, arco e botão em `--acc`; tracejado fino quando não há leitura. No Clima o dial interativo segue o mesmo desenho.
- **Quadro de câmera:** foto parada sem borda; rótulos em pílula de vidro escuro (`rgba(24,24,23,.58)` + desfoque). No Início, legenda sobre um degradê escuro na base e miniaturas com a selecionada contornada em `--acc`.
- **Selos de estado, faixas, rascunho de brilho, resumo fechado:** como antes, com cantos novos.

## Do's and Don'ts

- **Do** usar o acento claro só para destino atual, ação principal, ligado e escolha.
- **Do** manter 44 px em todo alvo de toque e palavra junto de toda cor de estado.
- **Do** declarar `backdrop-filter` sempre com `-webkit-backdrop-filter` igual.
- **Don't** animar outra coisa além de `transform` e `opacity`, nem criar `@keyframes`.
- **Don't** carregar fonte remota (a Urbanist vem no build).
- **Don't** abrir vídeo sem toque, nem deixar stream nascer com som.

## Movimento

Só `transform` e `opacity` animam, entre 80 e 200 ms, com a curva `--ease` (`cubic-bezier(.2, .7, .2, 1)`). Não há `@keyframes`; esqueleto é estático. Com "reduzir movimento" nada anima. Comando nunca espera animação. O dial de temperatura envia UM comando ao soltar; só o brilho usa rascunho + Aplicar.

## Acessibilidade

Alvos de 44 px (`--hit`), foco visível de 3 px, texto ≥ 4,5:1 sobre as superfícies opacas equivalentes, selo de estado ≥ 4,5:1 sobre o próprio fundo suave, `--ctl` e foco ≥ 3:1 (calculados em `ui/theme.test.mjs`, não medidos sobre o vidro). Busca com `role="combobox"`, setas e Enter. Estado sempre com texto, teclado em todos os controles, "Pular para o conteúdo", diálogos nativos `<dialog>`.

## Estados honestos

Enviando, confirmado (só com recibo do aparelho), enviado sem confirmação, sem resposta, divergente, não enviado, simulado (prévia), estimado (infravermelho) e desconhecido têm texto próprio em português (`ui/confidence.js`). Dado antigo mostra a idade real. Dado ausente é "—". Quadro de câmera diz que é foto, não vídeo, e de quando. Pessoa sem posição aparece como "sem posição".

## Regras de comportamento (contrato)

- Abrir uma tela só LÊ (GET). A lista de câmeras da busca só é lida quando a busca recebe foco.
- Comando por aparelho físico é exclusivo; modo reserva os aparelhos que usa; resposta tardia de sessão encerrada é descartada.
- Mídia abre só com a aba visível e fecha ao ocultar ou sair da rota. Miniaturas do Início são quadros parados (ciclo de 4 s, 3 pedidos por vez, parado com a aba oculta).
- Segredo só existe na tela enquanto o diálogo está aberto.
- O popup da bandeja dormente (`#oculto`) não monta nada.

## Limites conhecidos

- **Contraste sobre o vidro:** os testes calculam contraste sobre as superfícies opacas equivalentes; sobre o vidro real depende do fundo (`--page`). Conferido a olho nos dois temas, não medido.
- **Bordas de controle:** botões e chips usam o fio do vidro (`--glass-line`), abaixo de 3:1; são identificáveis pelo texto e pelo fundo. `--ctl` continua nos tracejados (vazio, simulado).
- **Ícones do app (resolvido em 14/11/2026):** círculo claro (`--acc`) com a casa do ícone `home` em `--acc-ink`, sobre cinza quente com um brilho fraco de `--glow`; é a mesma marca da barra lateral. `web/public/icon.svg` e `favicon.svg` à mão; os PNG saem de `scripts/gerar-icones.py`. Na bandeja do Windows a casa é cheia, com a porta vazada, porque o contorno some a 16 px (`glyph_house` em `tray/casa_tray.py`).
- **Testes que já falhavam:** no Linux (Docker `node:24-slim`) passam 350 de 356; 5 testes de renderização do Início e do Shell (presença, movimento, Lab, objetos protagonistas, `#alerta`) falham desde o commit do desenho Vidro (`a5c2010`).
- **Testes de renderização (SSR):** com `CASA_WEB_ROOT` apontando para `web/`, 77 testes de SSR falham neste ambiente também no código anterior ao redesign (ex.: "Missing getServerSnapshot"); não são regressão deste desenho.

## Arquivos

`web/src/ui/theme.css` (fonte e tokens), `ui/base.css`, `ui/kit.css` (vidro e controles), `shell/shell.css` e `shell/Shell.jsx` (barra lateral, barra superior, busca, pessoas, cabeçalho de página), `shell/nav.js` (destinos, frases e busca), `routes/Inicio/*` (Início), `routes/*/*.css` (um CSS por rota). Janela da bandeja em `tray/casa_janela.py`.
