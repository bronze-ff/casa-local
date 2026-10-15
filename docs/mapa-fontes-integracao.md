# Caminhos para um aplicativo próprio de controle da casa

Consulta a documentação primária Tuya em 15/10/2026. Inventário do usuário: duas lâmpadas no Izy Smart; central IR no Geonav Home, com perfis Samsung e Electrolux. O computador está fora da rede doméstica. Esta pesquisa não criou contas/projetos, acessou aparelhos ou executou chamadas de teste. A análise dos APKs ocorre separadamente com REA.

## O que decide a viabilidade

O obstáculo principal é obter uma sessão ou autorização legítima que dê acesso aos aparelhos já vinculados a **dois aplicativos OEM diferentes**. Encontrar o SDK Tuya nos APKs não transfere essa autorização para um app novo. A [Tuya confirma que os sistemas de contas dos aplicativos OEM são independentes](https://support.tuya.com/en/help/_detail/K9tnduhw3xs92). Mesmo e-mail nos dois aplicativos não significa identidade ou lista de aparelhos compartilhada.

A [documentação Link Devices](https://developer.tuya.com/en/docs/iot/link-devices?id=Ka471nu1sfmkl) distingue vincular um aplicativo criado pelo próprio desenvolvedor de vincular uma conta do SmartLife. Um projeto pessoal não recebe automaticamente os aparelhos de qualquer app OEM. Antes de depender desse caminho, é necessário comprovar uma destas possibilidades: vínculo suportado para a conta existente; autorização concedida pelo fornecedor; ou pareamento compatível dos aparelhos em uma conta/app que o projeto possa vincular. Não há nesta pesquisa evidência de que Izy Smart ou Geonav Home exponham essa autorização ao consumidor. Migrar/parear novamente continua sendo uma hipótese a validar e pode afetar configurações existentes.

## Escolhas práticas

| Caminho | Onde fica a integração | O que precisa ser comprovado | Efeito para uso fora de casa |
|---|---|---|---|
| Painel web/PWA com backend e APIs cloud autorizadas | Backend assina solicitações e guarda credenciais do projeto; iPhone/desktop recebe só a sessão do painel | Vínculo dos aparelhos, região, permissões de API, comandos/IR/cenas acessíveis e plano aplicável | Pode funcionar sem computador permanente em casa se os aparelhos mantiverem conexão à nuvem; depende de Internet e serviço do fornecedor |
| Painel próprio sobre central local | Hub permanente em casa executa comandos locais, por exemplo Home Assistant com integração compatível; app acessa API da central | IP, protocolo, `local_key` quando aplicável, DPs e suporte IR do firmware; acesso remoto autenticado | Requer equipamento ligado na casa e um caminho remoto seguro, como VPN ou serviço de acesso da central |
| App iOS nativo com SmartLife App SDK próprio | SDK no iPhone e serviços Tuya associados ao app novo | AppKey/AppSecret próprios, Bundle ID, vínculo/pareamento dos aparelhos, conta do novo app e condições do SDK | O SDK pode usar nuvem quando fora de casa, mas criar o app não importa as contas/aparelhos OEM existentes |

As distinções de arquitetura acima são recomendações de engenharia. Um aplicativo instalado somente no notebook fora de casa não ganha conectividade com os IPs privados domésticos. Um aplicativo iPhone pode ser o cliente do painel/hub; não precisa ser o hub que permanece na casa.

Para este inventário pequeno, a escolha inicial recomendada é um **painel próprio apoiado em integrações comprovadas**, com lâmpadas e central IR em adaptadores separados. Primeiro se comprova uma operação autorizada por adaptador; depois se escolhe hospedagem cloud ou hub local. Evita-se comprometer o projeto com um novo aplicativo Tuya completo antes de saber como os aparelhos atuais poderão ser acessados.

## SDK próprio não equivale a reutilizar as credenciais do OEM

A [preparação oficial do SmartLife App SDK](https://developer.tuya.com/en/docs/app-development/preparation?id=Ka69nt983bhh5) exige criar um aplicativo na plataforma, configurar Bundle ID iOS, pacote Android e schema, obter AppKey/AppSecret e, no Android, registrar hashes SHA-256. Isso é um caminho para um app do próprio desenvolvedor. Identificadores, chaves de aplicativo ou metadados encontrados nos APKs das marcas servem para entender a implementação; não devem ser tratados como credenciais próprias do projeto nem como autorização para reutilizar a identidade do publicador.

Se o caminho escolhido for o SDK nativo, confirmar condições de desenvolvimento, publicação e uso comercial antes de avançar. A [página oficial de preços do SDK](https://developer.tuya.com/en/docs/app-development/app-sdk-price?id=Kbu0tcr2cbx3o), atualizada em 2024, diferencia protótipo pessoal de publicação/comercial e descreve quotas/assinatura. Ela não sustenta promessa de gratuidade permanente em outubro de 2026; planos devem ser confirmados na plataforma quando houver escolha concreta. Esta observação não implica que um painel próprio usando uma central local precise contratar o SDK.

## `local_key`: obtenção autorizada e limites

A [API oficial Get Device List](https://developer.tuya.com/en/docs/cloud/7ccd629a6c?id=Kconjb15xpvd3) inclui `local_key` no exemplo de resposta. O caminho documentado é consultar aparelhos aos quais o projeto já tenha acesso, após o vínculo pertinente. Saber o `device_id` isoladamente não substitui esse vínculo. A presença do campo na documentação também não garante que ele será devolvido para o projeto, plano e aparelho reais.

Para o caso atual, registrar como pendência: **o projeto consegue listar os aparelhos e receber dados locais pelo fluxo autorizado?** Se não, o acesso às APIs do OEM precisa ser esclarecido ou outra forma suportada de integração deve ser escolhida. Não se deve assumir que um APK estático conterá a chave local particular das lâmpadas/central da casa. Senhas e chaves locais são dados operacionais privados e não devem entrar no repositório nem no frontend público.

## Controle IR e cenas

A [IR Control Hub Open Service](https://developer.tuya.com/en/docs/cloud/ir-control-hub-open-service?id=Kb3oe2mk8ya72) documenta catálogo e lista de controles, envio de comandos padrão, envio/aprendizagem de códigos e controle do ar com comando único ou combinação. A aplicação precisaria identificar o aparelho emissor (`infrared_id`) e cada controle (`remote_id`), além de ter o serviço/permissão correspondente habilitado. Para a central Geonav real, existência de SDK/classes IR no APK é evidência de capacidade do software; acesso autorizado aos objetos IR do usuário ainda precisa ser demonstrado.

A [API Scene Automation](https://developer.tuya.com/en/docs/cloud/scene-automation?id=Kaiuogcm9rdyb) lista leitura e disparo de cenas, incluindo `POST /v1.0/homes/{home_id}/scenes/{scene_id}/trigger`. Pode servir como alternativa de escopo menor para cenas predefinidas que o projeto enxergue. Não garante descoberta ou disparo de cenas existentes no Izy/Geonav por uma conta de outro aplicativo.

**Recomendação de engenharia:** o painel deve distinguir “comando enviado”, “estado estimado” e “estado confirmado”. O sucesso HTTP ou estado cloud de um controle virtual IR não comprova que a TV ou o ar receberam o sinal. O uso do controle físico também pode desalinhar o estado. Evitar converter automaticamente um botão Power alternante em comandos determinísticos de ligar/desligar. No ar, verificar se modo, temperatura e ventilação precisam viajar juntos.

## Próxima decisão verificável

Com a evidência estática já em andamento, completar um contrato por adaptador: identidade do app/conta; método autorizado de sessão; inventário que a sessão pode ler; comandos de luz; objetos IR/cenas; retorno de estado; dependência de nuvem/rede local. Depois executar uma leitura de inventário e um comando assistido pelo proprietário, no ambiente de acesso escolhido. Só esse resultado permite estimar esforço e escolher a base do app próprio com confiança.
