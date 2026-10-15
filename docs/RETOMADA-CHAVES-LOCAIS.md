# Retomada das chaves locais

15/10/2026. Continuação da sessão local do Claude `6523be82-b35b-4469-b53c-f5519907b81a`, cujo histórico foi localizado em `.claude/projects/C--Users-adm-Documents-Repo-Pessoal-Meu-PC/`.

**Recuperação concluída: as três chaves estão criptografadas nos dois PCs.** As duas lâmpadas tiveram leitura autenticada aprovada. A chave da central Geonav foi recuperada de dois objetos independentes da sessão recém-autenticada; sua operação LAN ainda não foi validada. Nenhum comando IR foi emitido.

## Lâmpadas: recuperação e leitura autenticada concluídas

O script anterior procurava JSON com `localKey` próximo ao ID no arquivo de memória. Isso não associa corretamente campos de objetos Java separados. A leitura estrutural HPROF em `backend/heap_local_keys.py` resolve as referências do mesmo objeto `DeviceBean`/`DeviceRespBean`, confere o ID exato entre os três aparelhos já identificados e recusa chaves conflitantes.

As duas chaves Izy apareceram em duas classes independentes por lâmpada e foram validadas com `tinytuya.Device.status()` executado **no PC de casa**, via SSH/Tailscale. As duas consultas retornaram DPs autenticados. Não foi enviado comando de liga/desliga, brilho, cor, estudo IR ou reset.

| Aparelho | IP identificado | Protocolo | Chave | Consulta de estado |
|---|---|---|---|---|
| Luz do quarto | <IP_LAMPADA_QUARTO> | 3.3 | Recuperada, criptografada | Aprovada |
| Luz do banheiro | <IP_LAMPADA_BANHEIRO> | 3.5 | Recuperada, criptografada | Aprovada |
| Central Geonav IR | <IP_CENTRAL_IR> | 3.3 anunciado; SDK `pv=2.2` | Recuperada, criptografada | Transporte pendente |

## Onde os dados estão

No notebook, sob a raiz deste repositório:

- `.data/key-recovery/izy.dpapi`: bundle de chaves criptografado com DPAPI do usuário Windows. Estrutura em memória após decifrar: `provider`, `keys` (ID físico → chave) e `heapSha256`.
- `.data/key-recovery/izy-status.json`: IDs, classes, offsets e presença das chaves; sem valores secretos.
- `.data/key-recovery/izy-validation.json`: resultado das consultas reais e DPs retornados; sem chaves.
- `.data/key-recovery/izy-schemas.json`: schemas extraídos dos objetos das duas lâmpadas, com tipos, limites e modos declarados.
- `.data/key-recovery/home-transfer-status.json`: confirmação da gravação criptografada no PC de casa.

No PC de casa, a raiz é `%USERPROFILE%\CasaLocal`. O bundle foi transferido **por stdin no SSH criptografado**, cifrado novamente pelo DPAPI daquele Windows e conferido por leitura/decifragem local. O arquivo fica em `.data/key-recovery/izy.dpapi`. Não copie o bundle DPAPI do notebook esperando abri-lo em outro computador: o vínculo DPAPI é por usuário/máquina.

Para a central Geonav, nos dois PCs, a mesma pasta contém:

- `geonav.dpapi`: bundle protegido, formato `provider`, `keys` (somente o ID `<ID_CENTRAL_IR>`) e `heapSha256`; cifrado e verificado separadamente em cada Windows.
- `geonav-status.json`: confirmação da recuperação em `DeviceBean` e `DeviceRespBean`, tamanho da chave e offsets, sem valores secretos.
- `geonav-schemas.json`: schema completo da central, incluindo permissões de leitura/escrita.
- `geonav-protocol-metadata.json`: `pv=2.2`, `bv=5.57`, `hasLanCommunication=true` observados no objeto SDK.
- `geonav-validation.json`: consultas realizadas e falhas, sem payloads brutos ou chaves.

No notebook, `geonav-home-transfer-status.json` confirma a gravação protegida no PC de casa. Os arquivos `*.dpapi` são bundles de recuperação; não substituem automaticamente `.data/devices.dpapi` usado pelo servidor de produção.

Não foi gravado texto aberto com chaves, colocado segredo em argumento de processo, devolvido segredo pela API ou alterado o cadastro de produção `devices.dpapi`. As chaves não aparecem neste documento, no chat ou nos testes.

A cópia temporária original `izy.hprof` foi removida após conferir seu SHA-256, as duas consultas autenticadas e os bundles criptografados nos dois computadores. O histórico do Claude foi preservado. Não é necessário repetir a extração Izy; use o bundle protegido.

## O que o próximo agente precisa fazer

1. Ler o bundle **no backend/localmente**, usando `backend.config.dpapi(..., decrypt=True)`, e mantê-lo em memória. Não imprimir o resultado nem colocá-lo em comando de shell ou arquivo JSON aberto.
2. Usar os schemas reais de cada lâmpada. Foram declarados DP20 `switch_led`, DP21 `work_mode` (`white`, `colour`, `scene`, `music`), DP22 brilho 10–1000, DP23 temperatura de branco 0–1000 e DP24 `colour_data` como string. A forma exata de codificar e alternar cor/branco exige o adaptador considerar o modo DP21; o backend inicial ainda não faz essa sequência.
3. Não inferir o brilho de cor a partir do DP22: ele pode representar apenas o modo branco. Conferir o estado atual DP21/DP24. O comprimento observado de DP24 é evidência útil, mas não substitui a validação física da cor.
4. Integrar ao cadastro DPAPI do **PC de casa**, preservar as câmeras/go2rtc, a bandeja e o acesso Tailscale já preparados. Fazer teste físico reversível quando o proprietário puder observar.
5. Para TV/ar, consumir `geonav.dpapi` no PC de casa e validar o transporte da central antes de integrar comandos. A chave do emissor não fornece automaticamente os códigos IR dos controles. Não enviar códigos adivinhados nem repetir Power alternante.

## Central IR: recuperação concluída, transporte pendente

O proprietário definiu a senha da conta existente no iPhone e entrou por e-mail no Geonav do emulador. A central apareceu, e a chave foi recuperada da memória do processo `com.hismile.smart`, sempre associada ao seu ID físico. O bundle foi validado por cifragem/decifragem DPAPI no notebook e no PC de casa.

A captura temporária Geonav foi removida do emulador após a transferência, e a cópia do notebook foi removida após conferir o hash e os bundles protegidos. SHA-256 da captura analisada: `bb7ae59748bf1f7d9e8e8147623f9629f98b8b17e1b5ae30e003e74d113aab90`. O emulador permaneceu com a sessão autenticada para a continuação do proprietário; nenhuma senha ou sessão foi exportada.

O schema declara DP1 `control` (leitura/escrita; valores `send_ir`, `study`, `study_exit`, `study_key`), DP2 `study_code` (somente leitura), DP3 `ir_code` (escrita), DPs4/5/6/11 `key_code*` (escrita), DPs7/8/9/12 `key_study*` (escrita), DP10 `delay_time` (escrita) e DP13 `type` (leitura/escrita). Esses nomes não comprovam os códigos nem as sequências necessárias para TV/ar.

A consulta TinyTuya padrão em 3.3 retornou erro 900 (`Invalid JSON Response from Device`). A consulta `device22`, com valores nulos, retornou timeout 902; uma consulta limitada ao DP1 também não respondeu. Como o SDK informa `pv=2.2`, foi feita uma consulta de estado legada em 3.1, também com timeout. **Nenhuma dessas tentativas confirmou leitura autenticada da central.** Não concluir chave inválida nem integração pronta a partir desses erros. O transporte/protocolo efetivo requer investigação posterior. `validatedProtocol` permanece `null` no relatório; 3.1 não deve virar configuração de produção por ter sido tentado.

Foram usadas somente consultas de estado, sem comando `send_ir`, estudo, códigos aprendidos ou alteração de DP. Nenhum teste ligou/desligou TV/ar. O servidor, câmeras, bandeja e pareamentos existentes foram preservados.

## Histórico: login Google incompatível; acesso por e-mail concluído

O botão foi testado por toque direto ADB. A atividade `com.thingclips.smart.social.google_login.ThingGoogleLoginActivity` abre e volta imediatamente para `LoginActivity`. O emulador tem Google Play Services 20.18.17. O Izy usa Google com sucesso nesse mesmo emulador; não se concluiu falha geral do Google.

A leitura REA da classe Geonav identificou uso de `androidx.credentials.CredentialManager` e `GetSignInWithGoogleOption`. O método `CredentialProviderPlayServicesImpl.isAvailableOnDevice()` verifica `MIN_GMS_APK_VERSION`. A leitura do campo estático no DEX deste APK confirmou o valor **230815045** (23.08.15); o emulador tem **20.18.17**, portanto não satisfaz esse pré-requisito. Essa incompatibilidade é confirmada; não foi alterado o app, trocado client ID OAuth nem desabilitada verificação de autenticação. O login Google continua pendente. Evidência do método: `ev_e31d3c355d15c8a77e4c507c2cb34cb9bb14bdf0a9fe892dae0678ad699c6247`.

A rotina `invokeSuspend` do login Geonav, decompilada integralmente, solicita a credencial Google quando há configuração de client ID e encerra a atividade ao receber `GetCredentialException`. Há também saída para configuração vazia. Isso explica duas causas possíveis de retorno silencioso; não se deve inventar nem substituir a identidade OAuth do fabricante. Evidência `ev_5fa32c3d6d3a2341eefb86837063ca0eca885f9bfa7e1bfd33a9489a8aac5326`.

Alternativa oficial para contas criadas por login social: no app já conectado do iPhone, vincular e-mail em Conta e segurança e definir a senha inicial **do app**. Isso deve ser feito na conta existente, sem criar outra conta esperando importar os aparelhos. [Orientação oficial Tuya](https://support.tuya.com/en/help/_detail/Kavcbyqeyom56).

O proprietário seguiu essa alternativa e entrou na conta existente. A recuperação com `--provider geonav` foi concluída. A incompatibilidade do botão Google não bloqueia mais esta tarefa; não foi preciso atualizar os serviços Google ou modificar o APK. O controle físico de TV/ar permanece para a próxima etapa.

## Verificação e fontes

Seis testes com HPROF sintético passaram: referências distantes, exclusão de aparelho fora do escopo, chave de tamanho inválido, duas cópias iguais, conflito e arquivo truncado. Não há dump do usuário ou chave real em fixtures. A estrutura de Strings do HPROF Android foi conferida no [gerador oficial AOSP](https://android.googlesource.com/platform/art/+/refs/heads/main/runtime/hprof/hprof.cc): o dump exporta comprimento e array de caracteres, diferentes da representação interna comprimida do ART.

Evidência REA da classe de login Geonav: `ev_9d830aeb20f1a7e7c463b20712c085e440777cba0b65649c97508cea49b7d040`; APK SHA-256 `147383eb09edc63ae5429f7896ddd4986f19b120b05c9bc48695a6bc3d93c835`. As evidências de decompilação são estáticas, não comprovam por si só a causa em execução.
