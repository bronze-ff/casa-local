# Direção visual: Papel e carvão

Interface refeita do zero em novembro de 2026 (frontend novo em `web/src/{core,ui,shell,routes}`). Substitui a "linguagem ambiente" anterior. A forma nasceu de um protótipo no Casa Design (Claude Opus 5.5, esforço médio) e foi implementada à mão por Claude Sonnet 5.5; nenhum componente, CSS ou DOM veio do painel antigo.

## Princípios
- **Cada função tem a composição própria**: a luz é um objeto com brilho em rascunho; o clima é um dial de 270°; a TV tem controle e rede lado a lado; o Local tem o mapa como protagonista; as câmeras têm grade, ao vivo e linha do tempo; o Lab tem modo do PC, máquina, serviços e rede; a Central reúne saúde, avisos, modos, rotinas, energia, atalhos e som.
- **Claro quente e carvão escuro**, com os mesmos nomes semânticos (`web/src/ui/theme.css`). Acento único em goiaba (`--acc`). O tema segue o sistema e pode ser fixado; a bandeja é sempre escura.
- **Superfícies por função**: `.obj` (objeto tátil), `.card` (neutro), `.sand` (informativo, plano), `.tl` (linha do tempo). Sem vidro sobre foto, sem 3D, sem blur.
- **Tipografia do sistema**, números grandes e tabulares; nenhuma fonte remota.

## Movimento
Só `transform` e `opacity`. Sem `@keyframes`. Com "reduzir movimento" nada anima. Comando nunca espera animação; slider só atualiza a tela durante o arraste e o comando sai ao soltar. O dial de temperatura envia UM comando ao soltar; só o brilho usa rascunho + Aplicar.

## Acessibilidade
Alvos de 44 px (`--hit`), foco visível, texto ≥ 4,5:1 e borda de controle `--ctl` ≥ 3:1 (conferidos em `theme.test.mjs`, calculados, não medidos em tela), estado sempre com texto junto da cor, teclado em todos os controles, diálogos nativos `<dialog>` que prendem o Tab, fecham com Esc e devolvem o foco.

## Estados honestos
Pendente, confirmado (só com recibo por campo), enviado sem confirmação, divergente, erro, simulado (prévia), estimado (infravermelho) e desconhecido têm texto próprio em português. Código HTTP, epoch e jargão nunca aparecem. Dado antigo mostra a idade real. Dado ausente é "—", nunca zero. Nada de "simulado" fora da prévia; histórico só do que o servidor guardou.

## Regras de comportamento (contrato)
- Abrir uma tela só LÊ (GET). Varredura, busca de TV, teste de aviso e leitura de chave só por toque do usuário.
- Comando por aparelho físico é exclusivo; modo reserva todos os aparelhos que usa; a resposta tardia de uma sessão encerrada é descartada.
- Mídia (ao vivo, replay, quadros) abre só com a aba visível e fecha ao ocultar, trocar de câmera ou sair da rota. Todo stream nasce mudo.
- Segredo (credencial do OwnTracks, chave dos atalhos) só existe na tela enquanto o diálogo ou o painel está aberto; fora disso não vai ao DOM, ao log nem ao armazenamento.

## Arquivos
`web/src/main.jsx` (entrada), `boot/` (App e preparação), `shell/` (navegação, bandeja, alerta, tema), `routes/registry.js` (as oito rotas, lazy), `routes/*/**.css` (um CSS por rota), `ui/` (tokens, base, kit, Overlay).
