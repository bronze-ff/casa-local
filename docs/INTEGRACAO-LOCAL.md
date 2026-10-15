# Integração local: lâmpadas e central IR

15/10/2026. Continuação de [RETOMADA-CHAVES-LOCAIS.md](RETOMADA-CHAVES-LOCAIS.md). Nenhuma chave aparece aqui, no chat, em logs ou em argumentos de processo: os bundles DPAPI são decifrados só em memória, no PC de casa.

## Comprovado

| Aparelho | Evidência | Resultado |
|---|---|---|
| Luz do quarto (<IP_LAMPADA_QUARTO>, 3.3) | Leitura autenticada pelo servidor de produção | Online; estado reportado: desligada, branco, brilho 87 % |
| Luz do banheiro (<IP_LAMPADA_BANHEIRO>, 3.5) | Leitura autenticada pelo servidor de produção | Online; estado reportado: desligada, branco, brilho 100 % |
| Central Geonav (<IP_CENTRAL_IR>) | Consulta `DP_QUERY` em **3.3**, resposta decifrada com a chave local | Texto `json obj data unvalid` → **chave e transporte LAN 3.3 válidos** |

### Central Geonav: o que os erros anteriores significavam

A central é um emissor IR do tipo "control type 2" do TinyTuya (DPs 1–13) e **não guarda estado**. À consulta de estado ela responde, cifrado com a chave local, o texto `json obj data unvalid`. O TinyTuya tenta interpretar isso como JSON e devolve erro 900 ("Invalid JSON Response"), mas o fato de o texto decifrar corretamente prova a chave e o protocolo 3.3. Uma chave errada não produziria texto legível.

Sem resposta (timeout 902) em 3.3: `DP_QUERY_NEW` (0x10), heartbeat e `UPDATEDPS` (0x12). Em 3.1: `DP_QUERY` também sem resposta. Nenhum comando foi enviado: só consultas.

O `pv=2.2` do SDK não é a versão do protocolo LAN; a versão efetiva é a anunciada no broadcast, **3.3**.

## Implementado

- `backend/tuya_light.py`: lâmpadas com schema v2 real. Branco e cor são modos distintos (DP21). Cor → `colour` + DP24 HSV, com o brilho no V; branco quente/frio da paleta → `white` + DP23 temperatura + DP22 brilho; ajuste de brilho segue o modo reportado. O brilho da cor nunca é inferido do DP22.
- `backend/adapters.py`:
  - adaptador `light`: lê o estado, envia todos os DPs juntos e relê o estado reportado (o ACK sozinho não confirma).
  - `probe_ir`: verificação autenticada da central a cada 60 s, sem enviar comando.
  - `learn`: modo aprender (DP1 `study` → DP2 `study_code` → DP1 `study_exit`), que não emite IR.
  - envio IR por pulsos aprendidos (DP1 `study_key` + DP7), uma vez, sem repetição.
  - o ar usa o código `off` para desligar a partir de qualquer estado.
- `backend/ir_codes.py`: códigos públicos Samsung32 da TV (12 teclas), marcados `samsung-padrao`, `validado: false`.
- `backend/provision.py`: monta `.data/devices.dpapi` a partir de `izy.dpapi` e `geonav.dpapi`, preservando botões já aprendidos. Já executado no PC de casa.
- `POST /api/devices/{tv-quarto|ar-quarto}/learn` grava o botão no cadastro DPAPI. A API expõe só a origem de cada botão (`irKeys`), nunca o código.
- Painel: botão **Aprender** na TV e no ar. Na TV, tocar uma tecla grava o sinal do controle original. No ar, escolhe-se temperatura/modo/ventilação e grava-se "ligar neste estado" e "desligar".
- Servidor: descarta o corpo pendente antes de responder erro (corrige o RST/WinError 10053 intermitente nos testes no Windows).

## Depende de teste físico (com o proprietário observando)

1. **Lâmpadas:** liga/desliga, brilho, uma cor e voltar ao branco quente. O painel mostra o estado reportado após cada comando; confirmar que a luz real corresponde.
2. **TV, códigos Samsung padrão:** testar Power, volume e direcional olhando a TV. O que não funcionar, aprender pelo controle original (Aprender → tocar a tecla → apertar a mesma tecla no controle apontado para a central).
3. **Ar Electrolux:** não há código público confiável para o modelo. Aprender pelo controle original: "Gravar desligar" e "Gravar ligar neste estado" para cada combinação usada (ex.: 23/24 °C, resfriar, auto). Comandos para estados não aprendidos são recusados sem enviar nada.
4. Em todos os casos, envio IR significa "sinal enviado uma vez"; nenhum sensor confirma que a TV ou o ar recebeu.

## Continuação

Perfis Geonav importados e revisão offline: [RECUPERACAO-PERFIS-IR.md](RECUPERACAO-PERFIS-IR.md). Testes físicos a executar em casa: [ROTEIRO-TESTES-FISICOS.md](ROTEIRO-TESTES-FISICOS.md).
