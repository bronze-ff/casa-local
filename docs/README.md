# Pesquisa anterior à implementação

Estado mais recente das chaves: [RETOMADA-CHAVES-LOCAIS.md](RETOMADA-CHAVES-LOCAIS.md). As três chaves foram recuperadas e protegidas nos dois PCs. A leitura autenticada das lâmpadas passou; o transporte da central Geonav ainda precisa de validação.

Estes documentos são um registro da análise estática dos APKs Izy Smart e Geonav Home em 15/10/2026. Algumas propostas de sessão própria, SDK nativo e transporte cloud antecedem a decisão do proprietário por um painel sem login, restrito à LAN/Tailscale. Não descrevem funcionalidades implementadas nem substituem o contrato atual em [README-backend.md](../README-backend.md).

- [MAPA-DO-APP.md](MAPA-DO-APP.md): evidências e pendências de integração.
- [MAPA-IZY.md](MAPA-IZY.md): assinaturas e DTOs recuperados do Izy.
- [MAPA-KITS-JS.md](MAPA-KITS-JS.md): wrappers JavaScript dos APKs.
- [mapa-fontes-integracao.md](mapa-fontes-integracao.md): fontes oficiais consultadas na pesquisa.
- `contrato-app.json`: proposta histórica; a API atual está em `backend/` e README-backend.md.

APKs, ferramentas REA e evidências completas continuam no projeto vizinho `Meu PC/automacao-casa`, sem duplicação neste repositório. Os links de evidência apontam para essa pasta local e dependem da presença dela. Não há chaves locais da casa nestes estudos.
