# Câmeras: plano para o Casa Local

Pedido do proprietário em 15/10/2026: incluir as câmeras no painel, no estilo da grade mostrada por YuriRDev. Hoje elas são vistas pelo app Intelbras Guardian. Isso altera a decisão anterior de DESIGN.md, que excluía câmeras do inventário.

## O que foi encontrado na rede

| IP | Aparelho | Portas abertas |
|---|---|---|
| <IP_DVR> | DVR Intelbras (interface web padrão Dahua, firmware ~2016), MAC xx:xx:xx:xx:xx:xx | 80 (web), 554 (RTSP), 37777 (SDK Intelbras/Dahua) |

Não foi feito login no DVR. O número de canais e quais câmeras estão ligadas ainda não foram verificados.

## Arquitetura proposta

```
câmeras -> DVR (<IP_DVR>, RTSP) -> go2rtc no PC de casa -> WebRTC/MSE -> painel Casa Local (Tailscale)
```

- **go2rtc** roda no PC de casa (`<PC-DE-CASA>`), lê o RTSP do DVR e entrega vídeo ao navegador com baixa latência e sem plugin.
- Grade usa o **substream** (`subtype=1`, leve); ao tocar numa câmera abre o stream principal (`subtype=0`).
- URL padrão Intelbras/Dahua: `rtsp://<usuario>:<senha>@<IP_DVR>:554/cam/realmonitor?channel=<N>&subtype=<0|1>`.
- Credenciais ficam somente na configuração do go2rtc no PC de casa, nunca no frontend nem no repositório.
- Acesso externo apenas pelo Tailscale; nada de porta aberta no roteador.
- O Guardian continua funcionando em paralelo (usa a nuvem da Intelbras, não é afetado).

## Estado em 15/10/2026 (implantado)

- Painel: aba **Câmeras** (`/#cameras`) com grade de fotos atualizada a cada 10 s e visualização ao vivo em MJPEG ao tocar. Implementado em `backend/cameras.py` e `src/components/Cameras.tsx`.
- O navegador fala só com o servidor Casa Local; o servidor repassa para o go2rtc em loopback. Rotas: `GET /api/cameras`, `/api/cameras/<id>/frame.jpg`, `/api/cameras/<id>/live.mjpeg` (máx. 3 ao vivo simultâneos, 10 min cada). O go2rtc nunca é exposto e as credenciais do DVR não passam pela API.
- go2rtc v1.9.14 em `%LOCALAPPDATA%\go2rtc` no PC de casa, API só em `127.0.0.1:1984`. `go2rtc.yaml` tem `cam1`…`cam16` (RTSP substream), `camN_live: ffmpeg:camN#video=mjpeg` para o ao vivo e `ffmpeg.bin` apontando para o ffmpeg do winget (Gyan.FFmpeg.Essentials). O arquivo contém a senha do DVR e não é versionado.
- O ao vivo leva ~8–10 s para começar (o ffmpeg inicia e espera um quadro-chave).
- "Save & Restart" da interface do go2rtc não reinicia o processo no Windows; use `scripts\reiniciar-inicio.ps1 -Qual go2rtc`.

## Inicialização automática no PC de casa

O PC faz logon automático no usuário `adm`. `scripts\instalar-inicio.ps1 -HostTailscale <PC-DE-CASA>.<TAILNET>.ts.net` registra duas tarefas de logon, ocultas e com reinício em caso de falha:

- `CasaLocal-go2rtc`: go2rtc com o `go2rtc.yaml` acima.
- `CasaLocal-servidor`: painel em `127.0.0.1:8787`, modo `local`, via `pythonw`.

O Tailscale Serve publica `https://<PC-DE-CASA>.<TAILNET>.ts.net` → `http://127.0.0.1:8787`, apenas na tailnet (configuração persistente do Tailscale). Projeto implantado em `%USERPROFILE%\CasaLocal`.

## Canais e nomes

Nomes sugeridos a partir das imagens de 15/10/2026 (o proprietário pediu sugestão; pode renomear). O ID do stream no go2rtc continua `camN`; o nome é só de exibição.

| Stream | Nome | Grupo |
|---|---|---|
| cam1 | Rua · muro | Externa |
| cam2 | Calçada · portão | Externa |
| cam3 | Calçada lateral | Externa |
| cam4 | Jardim da frente | Externa |
| cam5 | Entrada | Interna |
| cam6 | Garagem | Externa |
| cam7 | Jardim lateral | Externa |
| cam8 | Rua · vista alta | Externa |
| cam9 | Palmeiras | Externa |
| cam10 | — sem imagem (ocultar) | — |
| cam11 | Varanda | Interna |
| cam12 | Área coberta | Interna |
| cam13 | Corredor lateral | Interna |
| cam14 | Sala de jantar | Interna |
| cam15 | Cozinha | Interna |
| cam16 | Lavanderia | Interna |

15 câmeras com imagem; cam10 entrega vídeo preto.

## Pendências do proprietário

1. Criar no DVR um usuário só de visualização (ex.: `casalocal`) com permissão de "Visualizar ao vivo", pela interface web do DVR ou pelo Guardian. Evita usar o `admin`.
2. Digitar esse usuário e senha na configuração do go2rtc no PC de casa (o agente não digita senhas).
3. Dizer quais canais devem aparecer e com quais nomes.
