# Verificação da primeira versão

15/10/2026, Windows, Node 24.19.0/npm 11.17.0 e Python 3.12.14. Nenhum teste acessou aparelhos reais ou contas dos fabricantes.

- TypeScript e build de produção passaram. Vite emitiu avisos sobre `use client` da biblioteca de ícones; a aplicação é renderizada inteiramente no navegador e os fluxos foram verificados.
- Servidor: 25 testes executados, 24 aprovados e um teste de symlink real pulado por falta de privilégio Windows. O mesmo bloqueio passou em teste determinístico. Inclui HTTP real, estado/persistência, DPAPI Windows, Host/Origin/token, validação, arquivos privados, ACK versus estado confirmado e ausência de reenvio de Power IR.
- Navegador Edge/Chromium: desktop 1440 × 1000 e viewport iPhone 13 de 390 × 844. Sem erros JavaScript, respostas HTTP de erro ou rolagem horizontal no fluxo principal. Validados liga/desliga, brilho por teclado, seleção de cor, ajuste do ar, teclas da TV, filtros, cenas, persistência e consulta de preparação.
- Service worker ativo nos dois contextos; carregamento offline mostra indisponibilidade da central e permite reconectar. Não há fila de comandos offline.
- Modo local sem configuração: todos os controles de aparelhos bloqueados, temperatura desconhecida como `—` e cena 3D sem afirmar estado físico.
- Detector Impeccable: nenhum achado nos componentes e CSS inspecionados.
- OSV: nenhum alerta conhecido nas 58 versões npm e dez pins Python finais. Idade de publicação verificada: todas com pelo menos sete dias na data da revisão. Gitleaks não encontrou segredos na fonte e no bundle analisados; `.data`, ambiente e ferramentas de revisão são ignorados pelo Git.

Evidências locais de navegador e scanners estão em `artifacts/`, ignorado pelo Git. O teste mobile emula o viewport e o toque em Chromium; não substitui um teste real no Safari/iPhone. Tailscale Serve, firewall doméstico, pareamento, protocolos, DPs, chaves e códigos IR ainda dependem do teste em casa. A cena é ilustrativa.
