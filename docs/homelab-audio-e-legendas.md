# Áudio e legendas do Home Lab

Configuração aplicada em 18/10/2026 para permitir que duas pessoas escolham entre áudio original e dublagem em português do Brasil no mesmo filme ou episódio.

## Pedidos e downloads

O perfil padrão do Seerr, no Radarr e no Sonarr, é **Original + Dublado PT-BR + Legenda** (ID 10). Ele também é o padrão para animes. Os perfis **Dublado PT-BR** (8) e **Original + Legenda PT-BR** (9) continuam disponíveis para pedidos específicos.

O perfil novo prefere edições com os dois áudios. Se não houver uma edição identificada como original + PT-BR, aceita o original e mantém as atualizações habilitadas. Uma edição com os dois áudios pode substituir a anterior quando os indexadores a apresentarem e ela atender às regras de qualidade. Os serviços mantêm uma edição por filme ou episódio; não são dois downloads independentes por perfil.

As edições WEB e Blu-ray em 1080p pertencem ao mesmo grupo de qualidade nesse perfil. Assim, uma edição WEB com os dois áudios pode superar uma Blu-ray que tenha apenas o original. O bônus de idioma não anula os bloqueios de executáveis nos casos verificados. A exclusão de executáveis no qBittorrent foi preservada.

Os formatos usam os idiomas identificados pelos serviços e indicações explícitas de PT-BR em edições dual/multi. A palavra `DUAL`, sozinha, não comprova que exista dublagem brasileira. Antes do download, a análise depende dos dados fornecidos pelos indexadores e do nome da edição; esses dados podem estar errados. A configuração não cria uma faixa dublada que não exista na fonte.

Uma edição com original e português identificados, sem variante, recebe preferência menor que uma indicação explícita de PT-BR. Uma marcação explícita de Portugal não recebe esse bônus. No Sonarr, uma indicação dual com português no nome também auxilia a escolha antes do download; as faixas identificadas no arquivo podem confirmar os idiomas após a importação. A pontuação de corte de atualização é 2000. Isso permite considerar os anúncios genéricos de português sem tratá-los como confirmação de dublagem brasileira.

A definição do Catálogo BeTor filtra os resultados pelo IMDb solicitado quando a consulta contém esse identificador. O filtro foi verificado no Prowlarr para impedir que cartões de recomendações da página entrem nos resultados de outro filme.

## Legendas e sincronização

- O Bazarr solicita PT-BR mesmo quando encontra uma faixa de áudio em português. Isso permite assistir ao áudio original de uma edição dual com a legenda correspondente.
- O mínimo de correspondência é 70% para filmes e 90% para episódios. Essa nota mede a correspondência com a edição, não a qualidade da tradução.
- A sincronização automática usa o áudio original informado pelo Radarr/Sonarr e as faixas identificadas no arquivo. Não fixa inglês como referência para todas as obras.
- A correção de diferenças de velocidade está habilitada. O limite mínimo de qualidade da sincronização é 0,6; o limite de deslocamento e os demais parâmetros já existentes foram mantidos.
- A sincronização automática continua sujeita ao limite de pontuação de 95% configurado no Bazarr. Edições com correspondência alta podem dispensar esse processamento.
- O Bazarr avisa o Jellyfin após mudanças nas legendas, por meio da integração nativa, no modo `async`. A integração abrange Filmes, Séries e Animes.
- A busca de pendências e a melhoria de legendas continuam nas tarefas nativas do Bazarr. Uma legenda ainda não publicada, um provedor indisponível ou uma tradução inadequada não podem ser corrigidos apenas por configuração.

Uma legenda precisa constar no histórico como baixada e estar disponível no Jellyfin. Uma tarefa apenas iniciada, ou a presença de uma página de download na internet, não comprova que a legenda foi instalada.

No teste com O Poderoso Chefão, o Bazarr selecionou a legenda sem escolha manual de um resultado, baixou-a com correspondência de 74,44% e concluiu a sincronização com deslocamento de 25,06 segundos. O histórico registrou o download automático e a sincronização. Um novo arquivo de A Sociedade do Anel também disparou a busca e a sincronização após a importação. Na verificação final, o Bazarr não listava filmes com legenda PT-BR pendente nem tarefas de legenda em execução.

## Reprodução no Jellyfin

A conta existente usa `AudioLanguagePreference=OriginalLanguage`, ignora a marcação de áudio padrão da edição e prefere legendas PT-BR. A seleção automática foi verificada na API de reprodução com inglês e japonês.

As opções de lembrar seleções anteriores foram desativadas para impedir que uma escolha antiga em espanhol sobreponha esse padrão. Durante a reprodução, é possível escolher outra faixa de áudio ou desligar a legenda. Para manter preferências diferentes entre as duas pessoas, contas separadas no Jellyfin são uma alternativa; nenhuma conta adicional foi criada nesta alteração.

As faixas já precisam existir na edição baixada para aparecerem no seletor do Jellyfin. Trocar o perfil de um filme já importado habilita a preferência para futuras atualizações; isso não acrescenta imediatamente uma dublagem ao arquivo atual.

## Evidências e recuperação

No WSL `homelab`, o diretório `~/homelab/.codex-maintenance/media-automation-20261018/` contém os backups anteriores e relatórios sanitizados. Os backups de configuração incluem credenciais e devem permanecer privados. Os relatórios registram os testes de classificação e a verificação das configurações.

Foram usados os conectores e as APIs nativas. Não foi criado um serviço de monitoramento dependente de o Codex permanecer aberto. A alteração não garante disponibilidade de todas as dublagens ou legendas nem substitui a conferência de uma edição anunciada incorretamente.
