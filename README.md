# Casa Local

Painel pessoal para as duas lâmpadas Intelbras, a TV Samsung e o ar Electrolux controlados pela central Geonav. Interface para notebook e iPhone, com os controles em destaque e um quarto 3D ilustrativo menor.

**Estado atual:** painel e servidor funcionando em prévia. A compatibilidade física ainda não foi validada porque o notebook está fora de casa. Não houve acesso às contas nem envio de comandos aos aparelhos. Os adaptadores locais estão preparados para receber configuração comprovada.

## Abrir agora

Neste notebook, o ambiente Python, as dependências e a compilação já estão preparados. Execute `Iniciar Casa Local.cmd` ou, no PowerShell nesta pasta:

```powershell
.\scripts\iniciar.ps1
```

Abra [Casa Local](http://127.0.0.1:8787). Mantenha o terminal aberto; Ctrl+C encerra a central. A prévia permite testar liga/desliga, brilho, cinco cores, temperatura, modo, ventilação, teclas da TV e cenas. Os valores são simulados e persistidos separadamente em `.data/preview-state.json`.

Nesta preparação a prévia foi deixada em segundo plano no notebook. Para encerrá-la e iniciar em LAN/modo local, execute `.\scripts\parar.ps1`. O script confere o executável e o comando do processo registrado antes de encerrá-lo. O atalho informa quando a central já está aberta. Não foi instalado serviço nem inicialização automática do Windows.

Para preparar uma nova instalação com Node.js 22.12+ (ou 24+) e Python 3.11+:

```powershell
npm ci
npm run build
.\scripts\configurar.ps1
.\scripts\iniciar.ps1
```

O `.npmrc` bloqueia scripts automáticos de dependências e define janela de sete dias. O npm 11.10+ é necessário para aplicar essa janela em novas resoluções. O lockfile fixa o conjunto revisado. `npm ci` preserva esse conjunto.

## Testar no iPhone em casa

Conecte o notebook e o iPhone à mesma rede e execute:

```powershell
.\scripts\iniciar.ps1 -Lan
```

No Safari, abra `http://IP-PRIVADO-DO-NOTEBOOK:8787`. Use o IPv4 da interface Wi-Fi, visível em `ipconfig`. O endereço 127.0.0.1 só abre no próprio notebook. O script não modifica o firewall; se o Windows pedir acesso à rede, mantenha o escopo da rede doméstica privada.

O modo LAN continua sendo **prévia** até iniciar explicitamente com `-Modo local`. Em HTTP local o painel funciona no navegador. A instalação com suporte offline usa HTTPS; veja Tailscale abaixo. Nenhum comando é colocado em fila para ser enviado depois de uma desconexão.

## Conectar os aparelhos reais

O painel não pede login Intelbras ou Geonav. Para operação local, precisamos configurar uma vez os IPs privados, IDs físicos, chaves locais, protocolo e mapa de funções de cada aparelho. Esses dados não podem ser deduzidos apenas dos prints ou dos APKs. A obtenção das chaves pode exigir um procedimento inicial específico do fabricante; ainda não há garantia de um caminho sem conta em nenhuma etapa.

1. Identificar as duas lâmpadas na rede e confirmar qual ID pertence a cada cômodo.
2. Validar chave/protocolo, ler os DPs e testar uma ação reversível com observação física.
3. Validar se a central Geonav aceita envio IR pela LAN; registrar os códigos e o tipo de controle comprovados.
4. Cadastrar pelo terminal e iniciar `scripts\iniciar.ps1 -Modo local -Lan`.

### Dados da sua casa ficam fora do Git

IDs físicos, IPs e controles virtuais da central IR ficam em `.data/site.json`, que só existe na máquina (a pasta `.data/` é ignorada pelo Git). Copie o modelo e preencha com os dados da sua casa:

```powershell
Copy-Item site.example.json .data\site.json
```

Só as ferramentas de instalação (`backend.provision`, `backend.import_ir_profiles`, `backend.heap_local_keys`) leem esse arquivo. Nos documentos, valores reais aparecem mascarados (`<ID_CENTRAL_IR>`, `<IP_LAMPADA_QUARTO>`, `<PC-DE-CASA>.<TAILNET>.ts.net`…).

O cadastro completo está em [README-backend.md](README-backend.md). Chaves ficam criptografadas por usuário Windows com DPAPI, em `.data/devices.dpapi`, fora do Git e da API. Não foi adivinhado DP ou código IR. Aparelhos sem configuração ficam bloqueados; recursos sem mapa retornam erro explícito.

O ar por IR precisa de códigos para cada combinação completa de potência, temperatura, modo e ventilação. A primeira seleção no painel propõe explicitamente ligar em 24°C, resfriar, ventilação auto; só será enviada se houver código aprendido correspondente. IR indica envio e estado estimado, sem comprovar o recebimento físico. A tecla Power da TV alterna o estado e não é repetida automaticamente.

## Ícone na bandeja

`tray/casa_tray.py` coloca a Casa na bandeja do Windows: clique abre o popup acima do relógio (fecha ao clicar fora), o ponto no ícone mostra o status (verde: painel e câmeras; âmbar: câmeras paradas; vermelho: central fora) e o botão direito oferece Câmeras, Abrir no navegador, Reiniciar serviços (só no PC de casa), Iniciar com o Windows e Sair. Instalado em `%LOCALAPPDATA%\CasaLocalBandeja` no PC de casa e no notebook:

```powershell
# PC de casa
.\tray\instalar-bandeja.ps1 -Url http://127.0.0.1:8787 -Servicos %USERPROFILE%\CasaLocal
# Notebook (pelo Tailscale)
.\tray\instalar-bandeja.ps1 -Url https://<PC-DE-CASA>.<TAILNET>.ts.net
```

## Instalação atual no PC de casa

Desde 15/10/2026 o painel roda no PC de casa (`<PC-DE-CASA>`), em `%USERPROFILE%\CasaLocal`, iniciando sozinho no logon automático junto com o go2rtc das câmeras. Acesse por **https://<PC-DE-CASA>.<TAILNET>.ts.net** em qualquer aparelho da sua tailnet. Detalhes das câmeras, tarefas agendadas e como reiniciar em [docs/CAMERAS.md](docs/CAMERAS.md). Os aparelhos (luzes, ar, TV) seguem bloqueados até a configuração das chaves locais.

## Acesso privado pelo Tailscale

O computador que executa a central precisa permanecer **ligado em casa, conectado à rede dos aparelhos**. Tailscale no notebook levado para fora não cria acesso automático aos aparelhos que ficaram em casa.

Com Tailscale configurado nos seus dispositivos, use o hostname exato mostrado pelo Tailscale antes de iniciar o servidor. Em um terminal:

```powershell
$env:CASA_ALLOWED_HOSTS = 'NOME-DO-PC.NOME-DA-TAILNET.ts.net'
.\scripts\iniciar.ps1 -Modo local
```

Em outro terminal, após conferir o hostname e as permissões da sua tailnet:

```powershell
tailscale serve --bg http://127.0.0.1:8787
tailscale serve status
```

Abra no Safari o endereço HTTPS retornado. Escolha Compartilhar → Adicionar à Tela de Início. Para testar só a interface, mantenha o servidor em prévia. O Serve encaminha o serviço local por HTTPS à tailnet, conforme a [documentação oficial](https://tailscale.com/docs/reference/tailscale-cli/serve). A integração com sua instalação de Tailscale ainda precisa de teste real; Host e Origin devem corresponder ao hostname autorizado.

O projeto não executa esses comandos automaticamente, não ativa Funnel e não abre porta no roteador. O acesso sem login é intencional: dispositivos autorizados na LAN/tailnet podem controlar a casa. Use a tailnet somente com os dispositivos/pessoas que devem ter esse acesso. O token interno protege contra requisições cruzadas; não é uma senha da rede.

## Desenvolvimento e verificação

```powershell
# Terminal 1: servidor local
.\scripts\iniciar.ps1
# Terminal 2: frontend com proxy para a API
npm run dev
# Compilação e testes do servidor
npm run build
.\.venv\Scripts\python.exe -m unittest discover -s tests/backend -v
```

Não há banco, hospedagem ou serviço de contas externo. React/TypeScript/Vite no navegador, Python no servidor e TinyTuya somente nos adaptadores locais. Fontes, ícones e a cena estão incluídos na compilação, sem CDN. O service worker armazena apenas a interface; APIs e comandos não são armazenados.

A pesquisa histórica dos APKs está em [docs/README.md](docs/README.md). O contrato implementado é o descrito em README-backend.md; os estudos anteriores discutem alternativas que não fazem parte desta versão local.
