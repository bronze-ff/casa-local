# Descoberta na rede da casa

Coleta de 15/10/2026, feita pelo PC de casa (`desktop-daa9sqh`, 192.168.15.16) via Tailscale + SSH. Nenhum comando foi enviado aos aparelhos. Os dados vieram de ping, tabela ARP, teste de porta TCP 6668 e escuta dos broadcasts UDP de descoberta Tuya (porta 6667), decifrados com a chave pública fixa do protocolo. Uma regra temporária de firewall (UDP 6666/6667/7000, apenas sub-rede local) foi aberta durante a escuta e removida em seguida.

Rede: 192.168.15.0/24, gateway 192.168.15.1.

## Aparelhos Tuya encontrados

| IP | MAC | ID do aparelho (`gwId`) | Protocolo | `productKey` |
|---|---|---|---|---|
| 192.168.15.65 | 40-f5-20-1f-9a-6e | `8700404140f5201f9a6e` | 3.3 | `keyf9fsmuufeywsr` |
| 192.168.15.73 | d4-a6-51-1a-05-82 | `ebd9c6883884764e02jsy1` | 3.3 | `keytg5kq8gvkv9dh` |
| 192.168.15.74 | 3c-0b-59-87-5c-97 | `eb4d662a5214d8f5c66afu` | 3.5 | `key8u54q9dtru5jw` |

Os três têm a porta TCP 6668 aberta. Os `productKey` são diferentes entre si, então nenhum par é obrigatoriamente o mesmo modelo.

## Identificação pelos apps

O proprietário enviou as telas de "Informações do dispositivo" dos apps; os IDs virtuais e MACs batem com a tabela acima.

| IP | Aparelho | Origem da identificação |
|---|---|---|
| 192.168.15.65 | Central de Infravermelho (Geonav Home) | Tela em PT do mesmo app da central; ID virtual `8700404140f5201f9a6e` |
| 192.168.15.73 | Lâmpada do quarto (`quarto-luz`, Izy Smart) | ID virtual `ebd9c6883884764e02jsy1` |
| 192.168.15.74 | Lâmpada do banheiro (`banheiro-luz`, Izy Smart) | ID virtual `eb4d662a5214d8f5c66afu`; informado pelo proprietário |

A do quarto foi deduzida por exclusão: o proprietário informou que a do banheiro termina em `6afu`.

## Outros aparelhos relevantes

- 192.168.15.9: DVR Intelbras (portas 80, 554 RTSP, 37777). Ver [CAMERAS.md](CAMERAS.md).
- PC de casa já tem Python 3.12 e tinytuya 1.20.0 instalados (`%LOCALAPPDATA%\Programs\Python\Python312`) para o `tinytuya wizard`.

## Ainda não confirmado

- `local_key` de cada aparelho: não é transmitida na rede local. Depende do vínculo com a nuvem Tuya ou de outro meio autorizado.
- TV Samsung: não respondeu nas portas 8001/8002/9197 durante a coleta (provavelmente desligada/standby).
- IPs podem mudar via DHCP; reservar no roteador se forem usados na configuração.
