# Localização pelo OwnTracks

A quarta bandeja (alfinete rosa) mostra no PC a localização que ela compartilha pelo app
[OwnTracks](https://owntracks.org). O celular envia a posição direto para o PC de casa, pela tailnet:
nada passa por nuvem de terceiros. O compartilhamento depende dela: ela instala o app, pode pausar
ou desligar quando quiser, e o painel mostra quando a posição está velha.

## Como funciona

- O iPhone dela roda **Tailscale** (conta dela) e **OwnTracks** em modo HTTP.
- O OwnTracks faz `POST https://<pc-de-casa>.ts.net/owntracks` com usuário e senha (HTTP Basic). A
  senha é gerada pelo painel, guardada com DPAPI e só aparece no QR de configuração.
- Pelo endereço `.ts.net`, o Tailscale Serve informa quem está acessando (`Tailscale-User-Login`, que
  ele mesmo preenche e não aceita do cliente). Depois de preparar a localização, **só o dono da
  tailnet vê o painel**; as outras pessoas só conseguem enviar a posição. No PC de casa, `localhost`
  continua livre.
- Lugares ("Casa", "Ponto") viram regiões no app pelo comando `setWaypoints`, enviado na resposta do
  próximo envio. O app avisa a entrada e a saída na hora exata, sem GPS contínuo.
- Histórico de 48 h (`.data/localizacao-historico.dpapi`); a configuração fica em
  `.data/localizacao.dpapi`. Os dois arquivos ficam fora do Git.
- O mapa usa os tiles públicos do OpenStreetMap, escurecidos por CSS. O OSM recebe só os pedidos de
  mapa da área que estiver na tela.

## Instalação (com ela, no celular dela)

1. **Painel (PC):** abra a bandeja Localização, digite o nome dela e toque em *Preparar o celular dela*.
   Aparece um QR.
2. **Tailscale (celular dela):** ela instala o Tailscale e entra com a conta dela.
3. **Compartilhar só o PC de casa (você, no navegador):**
   [login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines) → máquina do PC de
   casa → **Share** → e-mail dela. Ela aceita o convite no celular. Ela passa a enxergar apenas
   essa máquina.
4. **Restringir as portas (você, no navegador):** em *Access controls*, deixe o acesso dela só no
   painel (porta 443). Sem isso, ela alcançaria também SSH, Área de Trabalho Remota e
   compartilhamento de arquivos do PC (ainda protegidos por senha). Exemplo de política:

   ```json
   {
     "hosts": { "pc-de-casa": "<IP Tailscale do PC de casa>" },
     "acls": [
       { "action": "accept", "src": ["autogroup:member"], "dst": ["*:*"] },
       { "action": "accept", "src": ["<e-mail dela>"], "dst": ["pc-de-casa:443"] }
     ]
   }
   ```

   `autogroup:member` são só as contas da sua tailnet; quem recebeu compartilhamento fica de fora e
   ganha apenas a segunda regra. Se a sua política já tiver outras regras, mantenha-as e só troque
   `"*"` por `"autogroup:member"` no `src`.
5. **OwnTracks (celular dela):** instale o app. Se houver a opção *Allow external config* (ou
   parecida) em Settings, ative. Aponte a câmera para o QR e abra no OwnTracks. Permita localização
   **Sempre** e **Precisa**.
   Sem QR: *Settings → Mode: HTTP*, URL, UserID e Password aparecem em *Preencher à mão*.
6. **Primeiro envio (celular dela):** toque na seta do OwnTracks. O painel mostra a posição em
   segundos.
7. **Lugares (painel):** em *Adicionar*, toque no mapa onde fica a casa dela e depois no ponto, dê os
   nomes e escolha o raio (50 m para o ponto, 100 m para a casa).

## Modos de envio do OwnTracks

- **Significant** (padrão do QR): envia ao se deslocar ~500 m ou a cada poucos minutos em movimento,
  mais as entradas e saídas dos lugares. Gasta pouca bateria.
- **Move**: envia o tempo todo com GPS. Bom para acompanhar o trajeto, mas gasta bateria; ela pode
  ligar só quando quiser.

## Problemas comuns

- *"Aguardando o primeiro envio"*: o Tailscale do celular dela está desligado, ou o app ainda não
  enviou. Os envios ficam na fila do app e chegam quando a conexão voltar.
- *O QR não abre o app*: ative a configuração externa no OwnTracks, ou preencha à mão.
- *Senha trocada*: *Celular → Gerar senha nova* invalida a anterior; o celular precisa ler o QR de novo.
- *Remover um lugar no painel não apaga a região no app.* Apague-a também em *Regions* no OwnTracks.
