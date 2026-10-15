# Roteiro de testes físicos

Para executar com o proprietário em casa, olhando os aparelhos. Use o painel (bandeja, navegador ou iPhone). Envie **um comando por vez** e espere a reação antes do próximo; nunca repita um comando que "não fez nada" sem antes conferir o aparelho. Não execute cenas durante os testes.

Anote em cada linha: ✅ funcionou · ❌ nada aconteceu · ⚠️ fez outra coisa.

## 1. Lâmpadas (estado reportado pela própria lâmpada)

| # | Ação no painel | Esperado |
|---|---|---|
| 1.1 | Quarto: ligar | Luz acende; o painel mostra "Disponível" e o estado ligado |
| 1.2 | Brilho: tocar a 2ª barra (40 %) | Luz fica mais fraca |
| 1.3 | Cor: Azul | Luz azul; o brilho se mantém |
| 1.4 | Cor: Branco quente | Volta ao branco amarelado |
| 1.5 | Desligar | Apaga |
| 1.6 | Repetir 1.1 e 1.5 no banheiro | Idem (protocolo 3.5) |

## 2. TV Samsung (IR, sem confirmação de estado)

| # | Tecla | Origem do código | Esperado |
|---|---|---|---|
| 2.1 | Liga/desliga | perfil Geonav | TV liga (alterna; não apertar de novo até ver o efeito) |
| 2.2 | Volume + e Volume − | perfil Geonav | Volume muda |
| 2.3 | Setas e OK | perfil Geonav | Menu navega |
| 2.4 | Voltar e Entrada | perfil Geonav | Voltam / abrem as fontes |
| 2.5 | Início e Mudo (pontinho âmbar) | Samsung genérico | Se ❌, gravar com Aprender |
| 2.6 | Liga/desliga | perfil Geonav | TV desliga |

## 3. Ar Electrolux (IR, estado apenas estimado)

| # | Ação | Esperado |
|---|---|---|
| 3.1 | Com o ar desligado: "Ligar em 24 °C · resfriar · auto" | Ar liga em 24 °C, resfriando |
| 3.2 | Temperatura + (25 °C) | Visor do ar vai para 25 |
| 3.3 | Ventilação → Baixa | Ventilação muda |
| 3.4 | Modo → Automático | Ar entra no automático; o painel mostra "Auto" e bloqueia a temperatura |
| 3.5 | Modo → Resfriar | Volta a resfriar com a temperatura anterior |
| 3.6 | Desligar | Ar desliga |

Se o ar não reagir em 3.1, pare: o perfil pode precisar de ajuste de enquadramento (o código compacto tinha prefixo de repetição; hoje é enviado um único quadro). Teste então pelo controle original com Aprender › Gravar ligar neste estado, e compare.

## 4. Depois dos testes

- Para cada ❌ da TV: Aprender › tocar a tecla › apertar a mesma tecla no controle apontado para a central.
- Para o ar: se só alguns estados falharem, gravar esses estados; se nenhum funcionar, gravar "desligar" e "24 °C · resfriar · auto" e retomar a análise de enquadramento.
- Registrar os resultados em `docs/RECUPERACAO-PERFIS-IR.md` (seção de validação física). Marcar entradas como validadas só depois de confirmadas olhando o aparelho.
