# Direção visual: linguagem ambiente

Aprovada pelo usuário em 31/10/2026 a partir das páginas Clima, Luzes e Lab do protótipo (Casa Design, artefato único). Substitui a direção anterior (pixel/Doto, painel escuro de cartões iguais).

## Princípios
- **Cada função tem composição própria**, sem a mesma grade de cartões: dial de temperatura no Clima, cena com halo e controle vertical nas Luzes, mapa de topologia no Lab, mosaico assimétrico e linha do tempo nas Câmeras, mapa protagonista no Local, linha do dia nas rotinas.
- **Claro quente e Noite**, ambos autorais: papel creme e tinta quente; Noite marrom profundo com laranja e ciano. Tokens em `web/src/tokens.css` (`--warm`/`--cool` para calor e frio; `--sinal` para ação).
- **Tipografia**: sans do sistema com números grandes e tabulares; mono (JetBrains Mono) só em valores secundários. Sem fonte de pixel e sem fonte remota.
- **Profundidade**: sombras suaves (`--sh-1`, `--sh-2`), superfícies arredondadas (22–28 px), teclas táteis que afundam no toque. Sem blur pesado e sem 3D decorativo.

## Movimento
Só `transform` e `opacity`, curto (140–240 ms, `--ease`). Sem loops contínuos. O arco do dial muda na hora; só o polegar anima. `prefers-reduced-motion` troca tudo por fade de ~0 ms. Nenhum comando espera animação; slider e dial só atualizam a tela durante o arraste e o comando sai ao soltar. Animações pausam com a aba oculta.

## Acessibilidade
Alvos de toque de 44 px ou mais, foco visível (anel ciano), contraste AA, texto junto da cor de status, teclado em todos os controles (setas, Home/End), sheets fecham com Esc e devolvem o foco.

## Estados honestos
Pendente, confirmado (só com receipt por campo), enviado sem confirmação, divergente, erro, prévia (simulado), estimado (IR) e desconhecido têm texto próprio em português; nunca se mostra código HTTP, epoch ou jargão técnico. Dados antigos mostram a idade real.
