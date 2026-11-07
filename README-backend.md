# Servidor privado Casa Local

O servidor exige Python 3.11 ou superior, Windows e TinyTuya 1.20.0. Usa a biblioteca padrão para HTTP e serve somente os arquivos compilados em `dist/`. O uso diário dispensa contas na nuvem e login das marcas. A máquina em casa precisa permanecer ligada para executar os comandos.

## Iniciar a prévia

Na pasta do projeto:

```powershell
.\scripts\configurar.ps1
npm ci
npm run build
.\scripts\iniciar.ps1
```

Abra `http://localhost:8787`. A prévia simula os quatro aparelhos e grava somente valores simulados em `.data/preview-state.json`. Ela nunca instancia adaptador de hardware, consulta aparelho nem executa descoberta na rede. As cenas também são simuladas. A indicação `confidence: preview` acompanha todos os estados.

Para o iPhone na mesma rede, execute `.\scripts\iniciar.ps1 -Lan` e abra `http://IP-PRIVADO-DO-PC:8787`. O script não altera firewall nem roteador. O modo padrão aceita somente conexões deste computador. `-Lan` aceita somente RFC1918, loopback, Tailscale `100.64.0.0/10` e IPv6 ULA; o endereço remoto vem diretamente da conexão TCP.

## Configurar aparelhos reais

Ainda faltam IPs privados, chaves locais, protocolos, esquemas DP e códigos IR dos aparelhos reais. A associação dos IDs físicos das lâmpadas aos cômodos deve ser confirmada pelo proprietário. Nenhum DP ou código IR foi adivinhado.

1. Obtenha esses dados por um caminho autorizado, mantendo os pareamentos atuais.
2. Crie um JSON com o esquema comprovado. `backend/schema-light.template.json` é um formulário incompleto: seu marcador deve ser substituído pelo DP verdadeiro antes do cadastro. Não coloque a chave local no JSON.
3. Execute o cadastro no terminal. O IP e o ID físico são solicitados separadamente; a chave usa `getpass`, sem aparecer na tela:

```powershell
.venv\Scripts\python.exe -m backend.configure device quarto-luz --adapter dp --schema C:\caminho\esquema-validado.json
.venv\Scripts\python.exe -m backend.configure device banheiro-luz --adapter dp --schema C:\caminho\outro-esquema-validado.json
.venv\Scripts\python.exe -m backend.configure list
.\scripts\iniciar.ps1 -Modo local -Lan
```

O arquivo `.data/devices.dpapi` contém a configuração inteira criptografada com Windows DPAPI, vinculada ao usuário Windows que executou o cadastro. A API não retorna IPs ou IDs físicos do cadastro, chaves, esquemas nem códigos IR. O arquivo não pode ser transferido para outro usuário ou computador. Em plataformas sem DPAPI o cadastro falha, sem alternativa em texto aberto. Após cadastrar ou remover um aparelho, reinicie o servidor local. Para remover: `.venv\Scripts\python.exe -m backend.configure remove quarto-luz`.

Campos DP aceitos: lâmpada `power`, `brightness`, `colorHex`; ar `power`, `temperature`, `mode`, `fan`. Cada entrada declara `dp` como texto numérico e `encoding`. Use `bool` para potência; `integer` com `min` e `max` comprovados para brilho/temperatura; `enum` com `values` relacionando as opções do painel aos valores reais para modo/ventilação; `rgbhex` ou `hsvhex` para cor, somente quando comprovado no firmware. A codificação HSV usa 12 caracteres hexadecimais, H 0–360, S/V 0–1000. Ajustes sem mapa explícito são recusados antes de abrir conexão. Firmwares que exigem sequências adicionais ou outra codificação precisam de extensão validada do adaptador; este cadastro não comprova compatibilidade do produto.

O servidor consulta somente os endereços configurados a cada 10 segundos, serializando acesso por aparelho físico. Não faz descoberta automática. Respostas DP podem marcar estado como `reported`; simples reconhecimento do comando (`acknowledged`) não muda um estado físico desconhecido para confirmado. Antes da primeira consulta, campos reais são `null`.

## Central IR: TV e ar

Cadastre cada aparelho lógico usando o ID/IP/chave do mesmo emissor comprovado. O bloqueio por ID físico serializa TV e ar. É obrigatório informar o `control_type` comprovado, 1 ou 2; a autodetecção da biblioteca foi desativada porque ela envia comandos de estudo. Exemplo de cadastro:

```powershell
.venv\Scripts\python.exe -m backend.configure device tv-quarto --adapter ir --control-type 1 --schema C:\caminho\teclas-aprendidas.json
```

O JSON da TV relaciona cada tecla permitida a um código de pulsos aprendido em base64. Teclas: `power`, `volume_up`, `volume_down`, `mute`, `up`, `down`, `left`, `right`, `ok`, `home`, `back`, `source`. Não há códigos embutidos nem acesso a catálogo cloud.

O JSON do ar relaciona uma **chave de estado completo** a um código aprendido para aquela combinação. Gere a chave com:

```powershell
.venv\Scripts\python.exe -m backend.configure climate-key --power on --temperature 24 --mode cool --fan auto
```

O resultado tem formato `{"fan":"auto","mode":"cool","power":true,"temperature":24}`. Use esse texto como chave do JSON e o código base64 aprendido como valor. Cadastre o ar com `device ar-quarto --adapter ir --control-type TIPO_COMPROVADO --schema ARQUIVO`. A primeira seleção exige os quatro campos, pois não há estado inicial físico conhecido. Depois, ajustes parciais só funcionam se a combinação completa já tiver código aprendido. Códigos ausentes são recusados. Uma configuração DP comprovada do ar também é possível com `--adapter dp`.

O adaptador IR retorna `sent` após enviar o código. O estado físico permanece sem confirmação: o ar usa `estimated` para a combinação solicitada, e as teclas da TV mantêm `unknown`. O valor `online` indica que a porta do emissor está acessível; TV e ar podem continuar desligados. O envio não é repetido automaticamente, inclusive diante de falha ambígua. Cenas não incluem a tecla alternante Power da TV. `boa-noite` só desliga o ar quando há código completo correspondente; falhas aparecem por etapa e a cena retorna `partial`.

## Descoberta explícita

`.\scripts\descobrir.ps1` escuta anúncios locais por até 15 segundos; não faz varredura forçada nem consulta DPs. Só retorna aparelhos cujo ID físico já foi cadastrado. Os campos retornados são `id` lógico, `ip` privado e `protocol`. Não retorna chaves, identificadores desconhecidos, DPS nem payloads. A descoberta não altera o cadastro e não roda ao iniciar. Pelo painel, `POST /api/discovery` só acessa rede no modo local; na prévia retorna lista vazia.

## API

| Método e rota | Resposta |
| --- | --- |
| `GET /api/bootstrap` | `csrfToken`, `mode`, `devices`, `scenes`, `recentActions`, `hub` |
| `GET /api/state` | Mesmo estado, sem `csrfToken`; consulta em cache, sem scan |
| `GET /api/status` | `version`, `mode`, `configuredCount` |
| `POST /api/devices/{id}/commands` | `state` completo, `device`, `command: {status, confidence, message}` |
| `POST /api/scenes/{id}/run` | `state`, `results` por etapa e `status` (`preview`, `completed`, `partial`) |
| `POST /api/discovery` | `mode`, `devices: [{id, ip, protocol}]`, `message` |

IDs de aparelho: `quarto-luz`, `banheiro-luz`, `ar-quarto`, `tv-quarto`. Modos (`scenes` no estado): editáveis em `POST /api/modes`, `/api/modes/{id}/remove` e `/api/modes/order`; os iniciais são `cinema`, `boa-noite` e `cheguei`. Todos os POST exigem `Content-Type: application/json`, corpo de até 16 KiB e `X-Casa-Token` recebido no bootstrap. O token muda ao reiniciar o servidor. Exemplo local PowerShell:

```powershell
$baseUrl = 'http://localhost:8787'
$bootstrap = Invoke-RestMethod "$baseUrl/api/bootstrap"
$headers = @{ 'X-Casa-Token' = $bootstrap.csrfToken }
Invoke-RestMethod "$baseUrl/api/devices/quarto-luz/commands" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"action":"set","values":{"power":true,"brightness":42}}'
Invoke-RestMethod "$baseUrl/api/devices/tv-quarto/commands" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"action":"key","key":"volume_up"}'
Invoke-RestMethod "$baseUrl/api/scenes/cinema/run" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}'
```

## Acesso privado pelo Tailscale

Use exclusivamente a rede privada do Tailscale. Se usar um proxy privado/Tailscale Serve, informe o hostname exato em `CASA_ALLOWED_HOSTS` antes de iniciar, por exemplo `$env:CASA_ALLOWED_HOSTS='NOME-EXATO-DO-PC.NOME-DA-REDE.ts.net'`. O proxy deve preservar Host e Origin compatíveis; não há wildcard nem confiança em `X-Forwarded-For`. A validação do par aceita o proxy local/Tailscale. Tailscale deve ter acesso limitado aos seus dispositivos. Nenhum comando de Serve, Funnel, publicação, roteador ou firewall é executado por estes scripts.

O serviço não é adequado à Internet pública. O acesso sem login é intencional dentro da fronteira privada solicitada. Host exato, bloqueio de origem, token por processo, allowlists de recursos e CSP reduzem chamadas indevidas de outras páginas. O token de prévia é proteção contra requisições cruzadas, não uma senha de acesso à LAN.

## Verificação

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests/backend -v
```

A suíte usa servidor HTTP real em porta efêmera, prévia persistida em diretório temporário, DPAPI Windows e adaptadores isolados com mocks. Ela não descobre rede nem acessa aparelhos reais. Verifica origem, Host, CSRF, corpos inválidos, recurso conhecido, paths, arquivos privados, diferença entre envio/ACK/estado reportado, serialização por aparelho e ausência de repetição de Power IR. O teste com symlink real requer privilégio Windows/Developer Mode; a recusa de symlink também tem teste determinístico sem esse privilégio.
