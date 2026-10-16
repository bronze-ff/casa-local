# Central: saúde, rotinas, movimento, TVs e gasto do ar

Tudo roda no PC de casa, na rede local, sem nuvem. Os dados ficam em `.data` (fora do Git).

## Rotinas (aba Central)

- Horário fixo por dia da semana: "desligar o ar às 6h30 nos dias úteis", "cena Boa noite às 23h".
- Ações disponíveis: ligar ou desligar o ar, acender ou apagar luzes, rodar uma cena. Usam o mesmo
  caminho e a mesma validação dos botões do painel.
- Se o servidor estava parado na hora marcada, a rotina ainda roda se ele voltar em até 5 minutos.
- Nenhuma rotina vem pronta. Arquivo: `.data/rotinas.json`.
- **Desligar em…** (aba Clima ou menu da bandeja): timer de uma vez para desligar o ar em 30 min,
  1, 2 ou 4 h.

## Gasto do ar (aba Central e rodapé do Clima)

Sem tomada medidora: conta as horas em que o painel deixou o ar ligado × potência média
(padrão 900 W, split 9.000 BTU convencional) × tarifa (padrão R$ 0,95/kWh). Ajustável em
**Ajustar**. É uma estimativa: se alguém usar o controle original, a conta erra. Arquivo:
`.data/ar-uso.json` (90 dias).

## Movimento nas câmeras (aba Câmeras › Movimento)

- O DVR Intelbras (base Dahua) avisa movimento pelo canal local `eventManager.cgi`. O servidor usa
  as mesmas credenciais que o go2rtc já usa (lidas do `go2rtc.yaml` deste PC); nada é copiado.
- Disparos seguidos da mesma câmera (até 90 s) viram um evento só, com uma foto do momento.
- Histórico de 48 h em `.data/movimento/`.
- Para receber aviso no Windows, escolha a câmera no filtro e toque em **Avisar**. A bandeja fica
  laranja com o número de eventos novos até você abrir o filtro Movimento.

## Replay das gravações (aba Câmeras)

- Tocar num evento de movimento abre a **gravação do próprio DVR** a partir de 10 s antes dele;
  no ao vivo, **Rever 1 min** volta um minuto. Nada é gravado neste PC.
- O servidor pede ao DVR o RTSP de playback (`/cam/playback?channel=N&starttime=…`) e o registra
  como stream temporário no go2rtc local; a senha do DVR nunca vai para o navegador.
- Controles: voltar e avançar 30 s, pausar e **Ao vivo**. Cada replay dura até 15 min, é apagado
  ao fechar e fica no máximo dois abertos (para não pesar no DVR). Até 30 dias para trás, se o DVR
  ainda tiver a gravação.

## TVs na rede (aba TV)

- O painel encontra TVs Samsung Tizen na rede local e mostra se estão ligadas, sem pedir nada.
- Para controlar: com a TV ligada, toque em **Parear**. A TV pergunta uma vez se permite o
  "Casa Local"; escolha **Permitir**. O token fica em `.data/tvs.dpapi` (DPAPI).
- Depois de pareada: liga/desliga, setas, volume, mudo, YouTube, Netflix, Prime Video e Globoplay.
- Ligar uma TV em Wi-Fi pela rede pode não funcionar (ela desliga a rede no modo de espera); a TV
  do quarto continua também pelo infravermelho.

## Saúde do sistema (aba Central)

Servidor, cada aparelho, go2rtc, eventos do DVR, TVs, backup, vigia e o próprio PC (tempo ligado,
memória, disco). A bandeja avisa quando algo passa a falhar.

- **Vigia**: tarefa `CasaLocal-vigia`, a cada 2 minutos. Se o painel não responder duas vezes
  seguidas, reinicia o servidor (espera 3 min se ele acabou de subir); se o go2rtc não estiver
  rodando, inicia. Registro em `.data/vigia.log`. Instalar no PC de casa:

  ```powershell
  .\scripts\instalar-vigia.ps1
  ```

- **Backup**: uma vez por dia, `.data` (sem as fotos de movimento) vai para
  `%LOCALAPPDATA%\CasaLocal\backups\casa-data-AAAAMMDD.zip`; ficam os 7 últimos. Os arquivos DPAPI
  continuam cifrados para este usuário Windows.
