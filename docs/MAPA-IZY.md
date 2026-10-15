# Izy Smart: mapa estático para o app da casa

Análise de 15/10/2026. Alvo: `apks/izy-smart-1.3.0-base.apk`, pacote identificado anteriormente como `br.com.intelbras.smart`, versão 1.3.0 (32). SHA-256 do APK: `293576e17a6bd8267e5554d33b5b5a07fa8d5184610c7181260bda65aa1f5f7d`.

Nenhum APK foi executado; nenhuma conta, API de produção ou aparelho foi acessado. O APK Android ajuda a identificar contratos, mas não prova comportamento da versão iOS instalada no iPhone.

## Evidências e limites

- **IZY-DEX-01**: [relatorios/izy-dex-members-20261015.json](../../Meu%20PC/automacao-casa/relatorios/izy-dex-members-20261015.json). Leitura formal das tabelas DEX `class_defs`, `class_data_item`, `method_ids`, `proto_ids`, `type_ids` e `field_ids`, com SHA-256 do APK e de cada DEX, deslocamentos das classes, índices dos métodos, descritores e presença de código. Foram selecionadas 28 classes e todas estavam definidas. São assinaturas e nomes de campos; não se extraíram valores de segredos nem se decompilaram os métodos nesta evidência.
- **IZY-REA-ERRO-01**: [relatorios/izy-IThingUser-20261015.json](../../Meu%20PC/automacao-casa/relatorios/izy-IThingUser-20261015.json). `inspect_android_class` de `com.thingclips.smart.sdk.api.IThingUser` terminou com `provider_timeout`, limite de 120.000 ms. A observação parcial informa JADX 0.7.1, Java 17.0.20.1, heap máximo de 4 GiB e quatro processadores. Não retornou um `ev_...` de análise concluída. O worker isolado foi encerrado após o erro; não se declarou decompilação bem-sucedida nem se repetiu a consulta inalterada.
- [relatorios/izy-dex-parser-20261015.py](../../Meu%20PC/automacao-casa/relatorios/izy-dex-parser-20261015.py) permite reproduzir IZY-DEX-01 sem iniciar o app ou o REA.

Os identificadores `IZY-*` deste documento são referências locais de investigação, não IDs de Evidence emitidos pelo REA. Referências de interface não demonstram que um recurso foi chamado pela interface visual ou suportado pelas lâmpadas do usuário.

## Contratos encontrados

Todos os itens abaixo são observações de **IZY-DEX-01**. Os nomes completos dos namespaces e os descritores de cada sobrecarga estão no JSON.

| Área | Classe e métodos presentes | Consequência para o projeto |
|---|---|---|
| Entrada do SDK | `com.thingclips.smart.home.sdk.ThingHomeSdk.getUserInstance()`, `getHomeManagerInstance()`, `newHomeInstance(long)`, `newDeviceInstance(String)`, `getSceneManagerInstance()`, `newSceneInstance(String)` | O APK inclui uma fachada para usuário, casa, dispositivo e cena. Isso não fornece credenciais para um app novo. |
| Conta | `com.thingclips.smart.sdk.api.IThingUser.loginWithEmail(String,String,String,ILoginCallback)`, `loginWithEmailCode(...)`, `loginWithPhonePassword(...)`, `loginWithTicket(String,ILoginCallback)`, `getRegionListWithCountryCode(...)`, `switchUserRegion(...)`, `logout(ILogoutCallback)` | Existem diferentes fluxos de identidade e região; parâmetros do tipo String não revelam sozinhos sua semântica ou endpoint. Não assumir intercâmbio com a conta Geonav. |
| Resultado de login | `com.thingclips.smart.android.user.api.ILoginCallback.onSuccess(com.thingclips.smart.android.user.bean.User)` e `onError(String,String)` | Separar sessão autenticada de falha de autenticação. Nenhum token foi obtido. |
| Casas e inventário | `com.thingclips.smart.home.sdk.api.IThingHomeManager.queryHomeList(IThingGetHomeListCallback)`; `IThingHome.getHomeDetail(IThingHomeResultCallback)`, `getHomeLocalCache(...)`; `HomeBean.getDeviceList()`, `getRooms()`, `getSharedDeviceList()` | A sequência candidata é autenticar → listar casas → consultar detalhes → ler dispositivos/quartos. Cache e dados atualizados devem ser diferenciados. Essa sequência ainda não foi observada em execução. |
| Modelo do dispositivo | `com.thingclips.smart.sdk.bean.DeviceBean.getDevId()`, `getSchema()`, `getSchemaMap()`, `getDpCodes()`, `getDps()`, `getDpsTime()`, `getSwitchDp()`, `getLocalKey()` | Precisamos do schema e do estado reais de cada lâmpada. A existência de `getLocalKey()` não é a própria chave, não informa autorização de acesso e não prova disponibilidade na nossa integração. |
| Capacidade de rede | `DeviceBean.isHasLanCommunication()`, `getIsLocalOnline()`, `isCloudOnline()`, `getIsOnline()`, `isWifiDevice()` | O SDK possui distinções de LAN, nuvem e estado agregado. Registrar cada uma separadamente até confirmar a semântica em teste. |
| Consulta e comandos | `com.thingclips.smart.sdk.api.IThingDevice.getDp(String,IResultCallback)`, `getDpList(List,IResultCallback)`, `publishCommands(Map,IResultCallback)` e as três sobrecargas `publishDps` abaixo | A camada de comandos precisa de tradução por dispositivo, retorno de erro e confirmação posterior de estado. |
| Atualizações | `IDevListener.onDpUpdate(String,String)`, `onNetworkStatusChanged(String,boolean)`, `onStatusChanged(String,boolean)`, `onDevInfoUpdate(String)`, `onRemoved(String)`; `IThingDevice.registerDevListener(IDevListener)` e `unRegisterDevListener()` | Estado do painel precisa poder mudar por evento, inclusive quando alterado no app original. Os tipos String/boolean não bastam para confirmar todos os significados. |
| Resultado de comando | `com.thingclips.smart.sdk.api.IResultCallback.onSuccess()` e `onError(String,String)` | A assinatura não explica em qual ponto o sucesso é emitido. Não tratar automaticamente como execução física confirmada. |
| Cenas | `IThingHomeSceneManager.getSceneList(long,IThingResultCallback)`, `createDpTask(String,HashMap)`, `createDelayTask(int,int)`; `IThingHomeScene.executeScene(IResultCallback)`, `enableScene(...)`, `disableScene(...)` | Há contratos para listar/executar cenas e compor ações. Não há prova de que uma cena do Izy possa incluir aparelhos da conta Geonav. |

As três assinaturas de publicação observadas são:

```java
// com.thingclips.smart.sdk.api.IThingDevice
void publishDps(String payload, IResultCallback callback);
void publishDps(String payload, ThingDevicePublishModeEnum mode, IResultCallback callback);
void publishDps(String first, String second, IResultCallback callback);
```

Os nomes de parâmetros acima são rótulos ilustrativos do analista; os tipos e assinaturas vêm do DEX. A enumeração `com.thingclips.smart.sdk.enums.ThingDevicePublishModeEnum` declara campos `ThingDevicePublishModeAuto`, `ThingDevicePublishModeHttp`, `ThingDevicePublishModeInternet`, `ThingDevicePublishModeLocal` e `ThingDevicePublishModeMqtt`. Não foram recuperados a seleção efetiva do transporte, prioridades, tentativas ou formato de pacote. Não usar o ordinal da enumeração como valor de protocolo.

No inventário da **interface exata** `IThingDevice` do Izy não existe uma declaração chamada `infraredPublishDps`. Isso não é uma busca por todos os recursos IR do APK, nem prova de ausência de IR em outras classes.

As DTOs da ponte também estão definidas: `com.thingclips.smart.plugin.tunidevicecontrolmanager.bean.DpsPublish` tem campos `deviceId: String`, `dps: Map`, `mode: Integer`, `options: Map` e `pipelines: List`; `QueryDps`, no mesmo pacote, tem `deviceId: String`, `dpIds: List` e `queryType: Integer`. Ambas têm construtor vazio. Isso corrobora o vocabulário de publicação/consulta encontrado nos componentes JavaScript, sem definir o significado dos inteiros, autenticação, serialização completa ou endpoint de rede.

## Schema das lâmpadas: o que já podemos desenhar

`com.thingclips.smart.android.device.bean.SchemaBean` expõe `getId()`, `getCode()`, `getMode()`, `getType()`, `getProperty()`, `getSchemaType()` e `getPassive()`. `ValueSchemaBean` expõe `getMin()`, `getMax()`, `getStep()`, `getScale()` e `getUnit()`; `EnumSchemaBean` expõe `getRange()`. Também estão definidas `BoolSchemaBean`, `StringSchemaBean` e `BitmapSchemaBean`.

**Inferência de implementação:** o nosso adaptador deve transformar esse schema em capacidades como liga/desliga, brilho, temperatura de branco e cor, quando presentes. IDs numéricos, códigos de função, faixas e codificação de cor devem vir do produto real. Os screenshots indicam controles de brilho, mas não revelam qual DP nem sua escala. Não há evidência para fixar uma lâmpada no DP 1 ou assumir brilho 0–100/0–1000.

Um cadastro interno adequado contém `provider`, referência da conta/casa, ID do dispositivo, capacidades, schema original, conversões, estado confirmado e data de atualização. Segredos devem ficar em armazenamento local protegido, fora do inventário compartilhável. O identificador mostrado pelo app não substitui uma chave de sessão ou chave local.

## O que precisamos antes de conectar nosso app

1. Escolher um caminho autorizado de acesso aos aparelhos existentes: integração já compatível, API/SDK disponibilizado para a nossa conta/projeto ou protocolo local comprovado. Importar o SDK ou reutilizar nomes de métodos não vincula automaticamente as contas Intelbras e Geonav.
2. Obter, com a conta do usuário, lista real de dispositivos, produto, schema e estado inicial. Esses dados não estão dentro de um APK genérico.
3. Confirmar se cada lâmpada anuncia protocolo local e se a chave necessária pode ser obtida pelo caminho escolhido. O app deve conseguir trocar o provedor sem alterar os controles visuais.
4. Implementar normalização de comandos, eventos e erros. Manter estados de comando pendente, falha, estado antigo e estado confirmado. Retorno bem-sucedido e atualização recebida são eventos diferentes.
5. Compor cenas no nosso controlador para unir marcas, salvo se uma integração unificada comprovar que já oferece isso. A execução de uma cena exige resultados por aparelho, porque uma ação pode falhar e outras funcionar.

Podemos preparar esses contratos, telas e testes simulados fora de casa. Não podemos validar ligação, cor, brilho, transporte local nem o comportamento físico das lâmpadas usando apenas os APKs.

## Roteiro mínimo ao voltar à rede doméstica

- Relacionar anúncios de rede com os IDs/MACs já fornecidos pelo usuário; não confundir IP público oculto do print com IP LAN.
- Consultar esquema e estado da primeira lâmpada e registrar versão de protocolo/capacidades. Não enviar DP adivinhado.
- Ler o estado, executar um liga/desliga, comparar callback, atualização e resposta visual. Registrar o comportamento se a lâmpada estiver sem energia.
- Testar um valor de brilho dentro do intervalo do schema e confirmar a conversão. Testar branco/cor somente quando o schema declarar suporte.
- Alterar a lâmpada pelo Izy e conferir atualização no nosso controlador, evitando que cache seja mostrado como estado recente.
- Depois do funcionamento básico, testar LAN sem internet e recuperação da conexão, sem restaurar fábrica ou trocar firmware.
- Repetir a identificação na segunda lâmpada: aparência semelhante não garante schema igual.

Não houve comando enviado, login ou alteração nos dispositivos nesta etapa.
