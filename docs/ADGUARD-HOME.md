# AdGuard Home

O AdGuard Home v0.107.79 usa a imagem oficial fixada por digest no script. O contêiner `casalocal-adguard` publica DNS TCP/UDP em `127.0.0.1` e no endereço LAN atual `192.168.15.16`; a interface administrativa final fica em `http://127.0.0.1:3080`. A porta inicial 3000 também é restrita ao loopback. DHCP do AdGuard permanece desligado.

O endereço LAN é atribuído por DHCP e pode mudar. Confira o endereço e o bind após mudança de rede; não há garantia de persistência. O PC precisa estar ligado para servir DNS, e o serviço não deve ser exposto fora da rede confiável.

## Estado e evidências

Segundo o Maestro, o serviço foi instalado e configurado; consultas DNS reais por UDP e TCP permitiram `example.com` e bloquearam `doubleclick.net` com `0.0.0.0`. O dashboard foi aberto em navegador e a sessão administrativa autenticada. Essas evidências são do Maestro; não representam um parecer do Crivo.

O primeiro cliente é este PC. No perfil NetworkManager `23d36eac-b531-3dc2-be64-da6efa7b6c3d`, o DNS IPv4 está em `127.0.0.1`, `ignore-auto-dns` está ativo para IPv4 e IPv6, e `dns-search` contém `Home` e `~.`. O Maestro informou que não alterou o symlink de `/etc/resolv.conf`, o stub do resolved ou a configuração do Tailscale. Os encaminhamentos condicionais incluem MagicDNS e o domínio local; Quad9 por HTTPS é o upstream geral. O endereço da LAN não foi tornado estático.

O Maestro executou rollback real com o script privado e parou o contêiner: as oito propriedades do perfil coincidiram com os valores anteriores, `getent` resolveu `example.com` e o serviço do painel permaneceu ativo. Em seguida iniciou novamente o contêiner e reaplicou a configuração NM; verificou bloqueio de `doubleclick.net`, resolução Tailscale pelo MagicDNS e HTTP 200 do painel. O backup anterior de oito propriedades está em `~/.local/state/casalocal/adguard/before-client.json`; o restaurador é `~/.local/state/casalocal/adguard/rollback-client.py`, com permissão 0700.

## Operação e rollback

Os dados e a credencial administrativa ficam em `~/.local/state/casalocal/adguard`, fora do Git. Não compartilhe credenciais, configuração privada, logs ou histórico de consultas. Preserve os diretórios `conf` e `work`. O Compose gerado e as credenciais não devem ser substituídos; não execute `compose up` sobre o contêiner existente sem avaliar a recriação. A interface administrativa não está publicada na LAN.

Para reverter o DNS do PC, use o restaurador privado indicado acima e confira que ele restabeleceu o perfil correto e seus valores anteriores. Valide resolução comum, split DNS do Tailscale, internet, SSH e painel. Após restaurar o cliente, `docker stop casalocal-adguard` interrompe o serviço sem apagar seus dados. Não apague volumes nem reinicie o Docker; outros serviços o utilizam. Um dispositivo configurado manualmente deve voltar aos seus próprios valores anteriores de DNS.

O script [adguard-home.py](../scripts/adguard-home.py) contém os comandos de preparação, configuração e verificação para manutenção. `verify` requer `dig`, que estava ausente quando o Maestro verificou o host; o script informa a dependência antes de consultar a API. Não execute a configuração inicial novamente sobre o serviço existente. Alterações futuras de upstream precisam evitar loops e preservar os encaminhamentos de `tail634fb2.ts.net`, `ts.net` e `Home`; não presumir acesso ao MagicDNS a partir de outro ambiente sem teste. O script rejeita upstreams literais que apontem para os binds DNS do Compose ou loopback; nomes e loops indiretos ainda exigem verificação operacional.

Referências: [Docker oficial](https://github.com/AdguardTeam/AdGuardHome/wiki/Docker), [configuração oficial](https://github.com/AdguardTeam/AdGuardHome/wiki/Configuration), [API v0.107.79](https://github.com/AdguardTeam/AdGuardHome/blob/v0.107.79/openapi/openapi.yaml).

## Notebook Windows e iPhone

Segundo o Maestro, o notebook foi configurado com uma regra NRPT local para o namespace `.` apontando para `100.123.250.126`. As duas regras específicas do Tailscale e os DNS dos adaptadores foram preservados. O Maestro verificou DNS padrão com casos permitido e bloqueado, resolução Tailscale, HTTPS 200 e SSH; também testou remover a regra pelo GUID e adicioná-la novamente. Não há evidência de teste com uma VPN corporativa futura. O funcionamento depende de o PC de casa e o Tailscale estarem ligados.

O estado privado no Windows fica em `%LOCALAPPDATA%\CasaLocal-AdGuard\installed-rule.json` e `before-nrpt.xml`. Para rollback administrativo, conferir o comentário `CasaLocal` e remover somente a regra cujo `Name` está no JSON; nunca remover todas as regras NRPT. Preserve o backup e as regras específicas existentes.

No iPhone conectado ao Wi-Fi de casa, abra as configurações da rede pelo botão **i** e anote o modo DNS atual e a lista completa de servidores antes de alterá-los. Escolha **Configurar DNS → Manual**, remova os servidores anteriores, adicione `192.168.15.16` e salve. Para reverter, escolha **Automático** somente se esse era o modo anterior; se era **Manual**, restaure esse modo e a lista original anotada. O endereço LAN é dinâmico e precisa ser conferido; fora desse Wi-Fi, inclusive 4G, essa configuração não foi testada nem faz parte da entrega.
