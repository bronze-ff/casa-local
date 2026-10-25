# Casa Local

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Escolha de implementação do agente: React, TypeScript e Vite para o painel; servidor Python local com adaptadores TinyTuya. Sem hospedagem pública. A escolha pode ser trocada sem alterar o requisito de acesso local.

## Users

Uso pessoal do proprietário da casa, pelo iPhone e por um notebook Windows.

## Product Purpose

Controlar duas lâmpadas Intelbras, uma TV Samsung e um ar Electrolux com central IR Geonav a partir de um painel próprio.

## Operating Context

O proprietário está fora da rede doméstica durante o desenvolvimento. O app deverá funcionar na LAN e ser acessado de fora pelo Tailscale. Uma central/computador precisará permanecer ligado em casa para executar comandos locais. Nenhuma chave local ou esquema DP dos aparelhos foi obtido ainda.

## Capabilities and Constraints

Sem tela de login e sem login das marcas no uso diário. A configuração inicial poderá exigir chaves locais e identificação dos protocolos. Não prometer compatibilidade ainda não comprovada. Modo de prévia deve ser visível e não enviar comandos físicos. Os controles reais só devem funcionar com adaptadores configurados. Não abrir serviço público, ativar Funnel nem alterar roteador/firewall sem solicitação.

## Brand Commitments

Referência visual fornecida pelo usuário: painel pessoal escuro mostrado por YuriRDev, com controles de luz, ar e ambiente 3D. Preferência confirmada: os controles têm prioridade e o ambiente 3D é menor. Nome Casa Local escolhido para este primeiro repositório; não foi fornecido um nome de marca definitivo.

## Evidence on Hand

Pesquisa copiada em docs/. As duas lâmpadas estão no Izy Smart, e a central está no Geonav Home, com perfis TV Samsung e Air Electrolux. Não há modelo 3D fiel do quarto nem foto do ambiente neste pedido; a cena será ilustrativa. As contas OEM são independentes. Os schemas DP, chaves locais e códigos IR reais continuam pendentes.

## Product Principles

- Dar prioridade a ajustes rápidos e controles fáceis de tocar.
- Manter aparelhos, chaves e comandos dentro da rede privada.
- Distinguir prévia, comando enviado e estado confirmado.
- Preservar o funcionamento dos apps e pareamentos atuais durante a preparação.
