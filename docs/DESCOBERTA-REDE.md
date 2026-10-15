# Descoberta na rede da casa

Coleta de 15/10/2026, feita pelo PC de casa (`<PC-DE-CASA>`, <IP_PC_CASA>) via Tailscale + SSH. Nenhum comando foi enviado aos aparelhos. Os dados vieram de ping, tabela ARP, teste de porta TCP 6668 e escuta dos broadcasts UDP de descoberta Tuya (porta 6667), decifrados com a chave pública fixa do protocolo. Uma regra temporária de firewall (UDP 6666/6667/7000, apenas sub-rede local) foi aberta durante a escuta e removida em seguida.

Rede: <REDE_LOCAL>/24, gateway <IP_ROTEADOR>.

## Aparelhos Tuya encontrados

| IP | MAC | ID do aparelho (`gwId`) | Protocolo | `productKey` |
|---|---|---|---|---|
| <IP_CENTRAL_IR> | xx:xx:xx:xx:xx:xx | `<ID_CENTRAL_IR>` | 3.3 | `<PRODUCT_KEY>` |
| <IP_LAMPADA_QUARTO> | xx:xx:xx:xx:xx:xx | `<ID_LAMPADA_QUARTO>` | 3.3 | `<PRODUCT_KEY>` |
| <IP_LAMPADA_BANHEIRO> | xx:xx:xx:xx:xx:xx | `<ID_LAMPADA_BANHEIRO>` | 3.5 | `<PRODUCT_KEY>` |

Os três têm a porta TCP 6668 aberta. Os `productKey` são diferentes entre si, então nenhum par é obrigatoriamente o mesmo modelo.

## Identificação pelos apps

O proprietário enviou as telas de "Informações do dispositivo" dos apps; os IDs virtuais e MACs batem com a tabela acima.

| IP | Aparelho | Origem da identificação |
|---|---|---|
| <IP_CENTRAL_IR> | Central de Infravermelho (Geonav Home) | Tela em PT do mesmo app da central; ID virtual `<ID_CENTRAL_IR>` |
| <IP_LAMPADA_QUARTO> | Lâmpada do quarto (`quarto-luz`, Izy Smart) | ID virtual `<ID_LAMPADA_QUARTO>` |
| <IP_LAMPADA_BANHEIRO> | Lâmpada do banheiro (`banheiro-luz`, Izy Smart) | ID virtual `<ID_LAMPADA_BANHEIRO>`; informado pelo proprietário |

A do quarto foi deduzida por exclusão: o proprietário informou o final do ID da lâmpada do banheiro.

## Outros aparelhos relevantes

- <IP_DVR>: DVR Intelbras (portas 80, 554 RTSP, 37777). Ver [CAMERAS.md](CAMERAS.md).
- PC de casa já tem Python 3.12 e tinytuya 1.20.0 instalados (`%LOCALAPPDATA%\Programs\Python\Python312`) para o `tinytuya wizard`.

## Ainda não confirmado

- `local_key` de cada aparelho: não é transmitida na rede local. Depende do vínculo com a nuvem Tuya ou de outro meio autorizado.
- TV Samsung: não respondeu nas portas 8001/8002/9197 durante a coleta (provavelmente desligada/standby).
- IPs podem mudar via DHCP; reservar no roteador se forem usados na configuração.
