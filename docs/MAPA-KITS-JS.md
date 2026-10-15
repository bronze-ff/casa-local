# Mapa estático dos kits JavaScript dos APKs

15/10/2026. Foram extraídos somente os nove arquivos `assets/kit_js/miniapp_*.js` selecionados dos APKs base já adquiridos. Todos são minificados em **uma linha**; as referências abaixo são linha **1–1** e intervalos de caracteres **zero-based, fim exclusivo**, para localizar precisamente a função sem alterar o original.

**Resultado:** estes kits fornecem wrappers para DPs, informação de dispositivo, callbacks e configuração de cenas. Não foi encontrada neles API específica para transmitir/aprender IR, enumerar controles IR ou combinar temperatura/modo/ventilação do ar. Isso limita a conclusão aos kits selecionados; não demonstra ausência dessas funções no código nativo, painéis baixados ou restante do APK.

## Artefatos e método

APK Izy `izy-smart-1.3.0-base.apk`: SHA-256 `293576e17a6bd8267e5554d33b5b5a07fa8d5184610c7181260bda65aa1f5f7d`. APK Geonav `geonav-home-2.0.0-base.apk`: `147383eb09edc63ae5429f7896ddd4986f19b120b05c9bc48695a6bc3d93c835`.

Os arquivos originais estão em `analise/kit-izy/` e `analise/kit-geonav/`. SHA-256 de cada membro extraído:

| App | Arquivo | SHA-256 |
|---|---|---|
| Izy | miniapp_DeviceKit.js | `edec7e1511ef48747fbe61879179f5ad5885bc7bf6e6c2f2b164d6fc49a93840` |
| Izy | miniapp_BizKit.js | `b1a8101c31397b6f11ad3558485b611263cc08ac042bf06d7707b3c546ffe941` |
| Izy | miniapp_HomeKit.js | `090e4d0425168fedd9392a78ba6ed1672c217493d2976d286a025262958761dd` |
| Izy | miniapp_CategoryCommonBizKit.js | `99f39781bb6c080f89118343727bd1b98ccbcb8058903dea1725edcb1f7e550e` |
| Geonav | miniapp_DeviceKit.js | `c3c31f07c2ac38621e624cf1b13ca7cbcd30352fcafa80d4ee5920cbcd95e0e8` |
| Geonav | miniapp_BizKit.js | `1c5ef01265471da259ca53eb812d4700081adfbf4bc73d5bc9cce5ed06f24873` |
| Geonav | miniapp_HomeKit.js | `4b33d0747f4bd5cccb62c5be353d3d1a27565ca0d7b00a570c33e16ad0557e8a` |
| Geonav | miniapp_CategoryCommonBizKit.js | `8b2cafd73c46317f020dce93e90b0f2fcc3adbcd7890d85a92b0f7ca5125b4e3` |
| Geonav | miniapp_LightKit.js | `61ac10cd04d8ee02c3d9d04fe0f9bbe3c616a8d929dd5df77b8003d856bd4fe3` |

`analise/inspect-kits-static.cjs` usa Babel Parser sobre texto, sem importar/avaliar os alvos. Inventários reproduzíveis: `analise/kit-izy-wrappers.json` e `analise/kit-geonav-wrappers.json`, com hashes, membros ZIP, trechos integrais de wrappers, parâmetros e offsets. Uma chamada de bridge é distinguida de `Globals` exigindo duas strings literais: nome `TUNI...` e nome do método.

REA CLI também analisou a árvore Geonav como JavaScript inerte: `analise/kit-geonav-rea.json`, Evidence `ev_9a4b76f58789ebf6e54493010fd0175fa474bab2d43a710f6b042f0320082db2`. O registro declara que bootstrap nunca foi executado, relações são estáticas e cobertura incompleta. Nenhuma chamada ao servidor MCP compartilhado, instalação ou execução de alvo foi feita.

## Controle de DPs e leitura

No `miniapp_DeviceKit.js` de ambos, a variável do invocador vem de `window.nativeRequest()`. As funções abaixo repassam **um único parâmetro JS `e`**, integralmente, como terceiro argumento da bridge, seguido por metadados. Não há validação, desestruturação ou lista de campos de `e` nesses wrappers. Logo não é possível afirmar aqui nomes como `devId`, `dps` ou `pipeType` como contrato exato; é necessário ler os DTOs nativos indicados.

| Função JS | Bridge e método | Izy: caracteres | Geonav: caracteres | DTO Android em `com.thingclips.smart.plugin...` |
|---|---|---|---|---|
| getDeviceInfo(e) | `TUNIDeviceControlManager.getDeviceInfo` | 28903–29195 | 88673–88965 | `tunidevicecontrolmanager.bean.Device` |
| publishDps(e) | `TUNIDeviceControlManager.publishDps` | 30441–30735 | 90534–90828 | `tunidevicecontrolmanager.bean.DpsPublish` |
| publishDpsWithPipeType(e) | `TUNIDeviceControlManager.publishDpsWithPipeType` | 31041–31359 | 91134–91452 | `tunidevicecontrolmanager.bean.DpsPublish` |
| queryDps(e) | `TUNIDeviceControlManager.queryDps` | 31360–31646 | 91453–91739 | `tunidevicecontrolmanager.bean.QueryDps` |
| registerDeviceListListener(e) | `TUNIDeviceControlManager.registerDeviceListListener` | 36025–36379 | 96118–96472 | `tunidevicecontrolmanager.bean.DeviceListListenerParams` |

Metadados comuns de `publishDps`, `publishDpsWithPipeType` e `queryDps`: `available:"1.0.0"`, `platform:"all"`, `container:"all"`, `hasSync:"false"`. São declarações do wrapper, não teste de disponibilidade no telefone ou confirmação do transporte local/cloud.

`unregisterDeviceListListener(e)` chama método homônimo e repassa uma cópia de `e` acrescida de `noParams:!0`; offsets Izy 36380–36639, Geonav 96473–96732. O DTO declarado é `null`.

`onDpDataChange(e)` **não chama diretamente `nativeRequest`**. Adiciona o callback `e` ao registro `Globals` de `TUNIDeviceControlManager.onDpDataChange` via `addLister` (grafia original). Offsets Izy 38226–38545, Geonav 104536–104855. `offDpDataChange(e)` remove o listener correspondente; offsets Izy 38546–38799, Geonav 104856–105107. O payload do callback não é definido neste código.

Também existem publicação de DPs de grupo, códigos DP e DPs Mesh, mas não estabelecem os DPs específicos das lâmpadas do usuário. Nenhum esquema de produto das lâmpadas ou da central IR foi encontrado nos kits selecionados. Geonav possui callback `onBLECommRodSchemaUpload(e)` → registro `Globals` `TUNIBluetoothManager.onBLECommRodSchemaUpload`, DeviceKit 42031–42390; é um evento BLE, não prova de consulta de schema da central Wi-Fi.

## Cenas

DeviceKit de ambos repassa `e` sem explicitar campos:

| Função | Bridge | Izy: caracteres | Geonav: caracteres |
|---|---|---|---|
| openRecommendSceneDetail(e) | `TUNIDeviceSceneManager.openRecommendSceneDetail` | 59521–59857 | 14891–15227 |
| openDeviceExecutionAndAnutomation(e) | `TUNIDeviceSceneManager.openDeviceExecutionAndAnutomation` | 59858–60250 | 15228–15620 |
| saveSceneAction(e) | `TUNIDeviceSceneManager.saveSceneAction` | 60251–60571 | 15621–15941 |
| showSceneDialog(e) | `TUNIDeviceSceneManager.showSceneDialog` | 61170–61482 | 16540–16852 |

O método `saveSceneAction` declara DTO Android `com.thingclips.smart.plugin.tunidevicescenemanager.bean.SaveSceneActionParams`. Os nomes sugerem composição/edição de ações e abertura de telas; **nenhum wrapper de disparo direto de uma cena foi identificado nesses kits**. Não interpretar `openDeviceExecutionAndAnutomation` como execução real comprovada.

HomeKit também define `openRecommendSceneDetail` e `openDeviceExecutionAndAnutomation` em `TUNISceneManager`, marcados `deprecated:"true"`. Offsets Izy 10789–11111 e 11112–11490; Geonav 25312–25634 e 25635–26013.

## IR, ar e LightKit: resultado negativo delimitado

A inspeção da AST de todos os nove arquivos não encontrou wrappers com nomes correspondentes a `infrared`, `learn`, `aircondition`, `temperature`, `fanmode`, `remotes` ou `ircode`. O nome `getRemoteRebootTimers` existe nos dois DeviceKits, porém invoca `TUNIDeviceDetailManager.getRemoteRebootTimers` com DTO `GetRemoteRebootTimersParams`: trata de temporizadores de reinicialização, não demonstra controle remoto IR. Não há nestes artefatos um contrato de envio/aprendizagem IR ou combinação temperatura/modo/ventilação a registrar.

O LightKit Geonav contém apenas dois wrappers de bridge identificados: `onLocalMeshSupportSwitchChanged(t)` → `TUNILightManager.onLocalMeshSupportSwitchChanged`, DTO `tunilightmanager.bean.SwitchParams`, caracteres 5995–6311; e `getLocalMeshSupportSwitchStatus(t)` → método homônimo, cópia de `t` com `noParams:!0`, DTO `null`, caracteres 6312–6569. Isso não fornece os comandos concretos de brilho/cor nem prova suporte das lâmpadas Izy pelo app Geonav.

## Próximas leituras úteis

1. DTOs `DpsPublish`, `QueryDps`, `Device` e `DeviceListListenerParams` e implementação de `TUNIDeviceControlManager`: recuperar campos, serialização e retorno.
2. Implementação nativa IR e sua chamada no painel, fora dos nove kits: recuperar identificadores de central/controle e payloads de envio/aprendizagem/ar.
3. `SaveSceneActionParams` e implementação nativa de cenas: separar editar ação, abrir tela e efetivamente disparar cena.
4. Leitura autorizada do inventário/esquema real para mapear DPs das duas lâmpadas e os controles cadastrados. Nada na leitura estática já realizada confirma autorização de conta ou comando físico recebido.
