# Direção visual

Popup de bandeja no idioma dos painéis do Windows 11 e da Central de Controle do iOS, a partir da referência do YuriRDev escolhida pelo proprietário. É a mesma tela no popup da bandeja (400 × 720), no iPhone (tela cheia, áreas seguras) e no navegador grande (cartão flutuante centralizado, máx. 420 px). O redesenho de 15/10/2026 substituiu o painel largo em colunas.

## Estrutura

- Topo compacto: marca "Casa", pílula de status (Rede local / Prévia / Sem conexão), botão da folha "Sua central" (modo, aparelhos configurados, endereço, últimas ações).
- Corpo rolável com um cartão por aba; abas inferiores fixas: **Luzes, Clima, TV, Câmeras**. A aba fica no hash (`#luzes`, `#clima`, `#tv`, `#cameras`); `?tray=1` remove a moldura para a janela da bandeja.
- Luzes: cena 3D ilustrativa no topo, seletor Quarto/Banheiro + interruptor, paleta 8 × 2, brilho em 5 barras com −/+, cenas.
- Clima: aparelho desenhado em CSS com fluxo de ar animado quando ligado (momento de movimento da interface), temperatura grande, trilho 17–30 °C, blocos Modo e Ventilação que alternam ao toque.
- TV: direcional circular, Voltar/Início/Entrada, volume e mudo.
- Câmeras: grade 2 colunas 4:3 com número do canal, filtro Todas/Externas/Internas, ao vivo em diálogo de tela cheia.
- Cada cartão termina com um rodapé de status honesto (prévia, aguardando configuração, sem conexão, IR sem confirmação).

Regras mantidas: alvos de toque ≥ 44 px, texto em PT-BR, números tabulares nos ajustes, foco de teclado visível, estados de prévia/erro/carregamento/desconexão sempre visíveis, cena 3D ilustrativa.

## Tokens

- Fundo `#08080a`, popup `#161618`, cartão `#1f1f22`, elevados `#2a2a2e` / `#343439`, linhas brancas a 7,5 % e 13 %.
- Texto `#f3f3f5`, secundário `#c9c9cf`, apagado `#9d9da6`.
- Azul `#3d8bff` → `#6cc4ff` (ação, ligado, trilho), violeta `#8f7bff` (câmeras, prévia), verde `#3ad37a` (ok), âmbar `#ffb547` (aguardando), vermelho `#ff6159` (erro, ao vivo).
- Raios 22 (popup/cartões), 16 (blocos), 12–14 (controles).
- Tipografia do sistema: Segoe UI Variable (Windows) / SF (iOS).
- Movimento: entrada do popup e troca de aba com ease-out exponencial; fluxo de ar do ar-condicionado; `prefers-reduced-motion` desliga tudo.
