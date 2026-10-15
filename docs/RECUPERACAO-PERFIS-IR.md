# Perfis Geonav recuperados — 15/10/2026

Os perfis já cadastrados no Geonav Home foram recuperados do cache local do aplicativo Android. A captura foi feita no emulador autenticado pelo proprietário, abrindo as telas de Air e TV sem pressionar teclas de controle. Nenhum sinal IR foi enviado nesta recuperação.

## Ponto em que a sessão anterior parou

A sessão Claude `627ee749-f5d2-4110-a10c-3f7540c4eb50` já havia integrado as lâmpadas e confirmado a resposta local da central Geonav, mas interrompeu a análise da memória do painel de ar. Os códigos Samsung existentes eram candidatos genéricos; o ar ainda não tinha sinais configurados.

A continuação identificou que os dados úteis estavam no SQLite `RKStorage`, tabela `catalystLocalStorage`, em `remoteSubDevList` e `remoteDeviceKeys`. A memória Java mostrou os metadados, mas não foi necessária para recuperar os sinais. Não é preciso capturar memória nativa ou recuperar dados da conta novamente.

## Resultado

| Controle | Perfil selecionado | Entradas recuperadas | Disponíveis no painel |
| --- | --- | --- | --- |
| Electrolux | índice 2132 | 246 | 280 estados completos e `off` |
| Samsung | índice 112034017 | 45 | 10 teclas do perfil e 2 candidatos anteriores |

Cada associação foi conferida pelo ID do controle virtual, ID da central, marca, categoria e índice do perfil. O arquivo privado contém somente os campos necessários aos sinais IR; não contém senha, token de sessão, UID da conta ou chave local da central.

Os 291 registros foram convertidos offline por `IRRemoteControlDevice.head_key_to_pulses` e `pulses_to_base64`, do TinyTuya já instalado. Todos passaram pelas verificações de formato, portadora próxima de 38 kHz e limites dos pulsos. Cada código do ar tem 140 durações; cada código da TV tem 68.

O ar possui combinações de resfriar, aquecer, automático, ventilar e desumidificar, com ventilação automática, baixa, média e alta. São capacidades do perfil cadastrado; a presença de um modo no perfil ainda não comprova que o aparelho físico o suporta. A correspondência dos índices segue a [documentação de IR da Tuya](https://developer.tuya.com/en/docs/cloud/universal-infrared?id=K9jgsgd7buln4).

O perfil tem temperaturas de 16 a 30 °C, mas o painel mantém o intervalo existente de 17 a 30 °C. No automático, as entradas `M2_S0` a `M2_S3` não codificam temperatura. Os 14 valores de temperatura da interface apontam para o mesmo sinal por velocidade nesse modo; não foram inventados sinais adicionais.

Na TV, o mapeamento cobre liga/desliga, volume +/−, quatro direções, confirmar, voltar e entrada. Início e Mudo continuam como `samsung-padrao`, porque o perfil recuperado não contém teclas com essas funções. As outras 35 teclas ficaram no arquivo privado para eventual ampliação do painel.

## Arquivos e aplicação

- `backend/import_ir_profiles.py`: extrai, converte e importa sem rede ou envio IR.
- `.data/ir-recovery/profiles.dpapi`: arquivo privado de perfis, protegido pelo usuário Windows em cada máquina. Não é portátil entre máquinas.
- `.data/ir-recovery/profile-status.json`: evidência resumida, sem códigos ou credenciais.
- `.data/devices.dpapi`: configuração de produção; as chaves locais existentes são preservadas.

O comando `python -m backend.import_ir_profiles --apply` importa o arquivo protegido na máquina que executa o servidor. Ele exige que a central conhecida já esteja provisionada. A importação preserva sinais aprendidos manualmente e entradas marcadas como fisicamente validadas. Os perfis têm origem `geonav-perfil` e `validado: false`. A API expõe apenas a origem dos códigos.

O notebook continua com sua configuração anterior de acesso ao servidor de casa. Não foi criado um segundo controlador local no notebook. O uso diário do painel permanece local, com acesso remoto pelo Tailscale; os perfis importados não exigem sessão do Geonav no servidor.

A atualização foi instalada em `%USERPROFILE%\CasaLocal`, com os perfis novamente protegidos pelo DPAPI do usuário do PC de casa. Antes da importação, foi salva uma cópia da configuração em `.data/ir-recovery/before-profiles-20261015`. Após reiniciar apenas o servidor, `/api/state` confirmou 281 entradas `geonav-perfil` no ar e 10 na TV, mais os dois candidatos Samsung preservados. As tarefas do servidor e do go2rtc permaneceram em execução. O notebook recebeu a mesma compilação do painel.

O prefixo de repetição dos códigos compactos foi preservado como evidência, mas a conversão produz um único quadro. O envio existente continua com uma tentativa, sem repetição automática. Alguns botões podem precisar de ajuste de enquadramento após o teste físico; liga/desliga da TV alterna o estado.

## Validação e próximo passo

Os sete testes novos usam apenas sinais sintéticos e verificam conversão, ausência de rede, tratamento de repetição, automático sem temperatura, preservação do aprendizado, vínculo dos perfis e exclusão de dados de sessão. A suíte completa passou: 69 testes, um ignorado. A compilação de produção também passou.

Ainda falta testar os sinais diante dos aparelhos. Com alguém em casa, testar uma tecla da TV e um estado conhecido do ar, aguardando a resposta física antes de repetir. A confirmação da central comprova transporte; não confirma o estado físico da TV ou do ar. Não executar cenas ou percorrer toda a tabela de sinais como teste automático.

Para continuar no Claude: ler este documento e `docs/INTEGRACAO-LOCAL.md`; usar os arquivos DPAPI já instalados; não refazer a recuperação de chaves nem extrair dados de conta. O trabalho restante é a validação física dos códigos, eventual ajuste de enquadramento e melhoria da interface para modos sem temperatura.

## Revisão offline — 15/10/2026 (tarde, Claude)

Feita fora de casa, sem enviar comandos, entrar em Aprender, executar cenas ou varrer sinais. Testes com mocks e dados sintéticos; leitura do estado real só pela API do servidor (sem códigos).

**Comprovado com o cadastro real do PC de casa (via `/api/state`, sem códigos):**
- Cobertura completa: 5 modos × 4 ventilações × 17–30 °C (280 estados) e `off`, todos `geonav-perfil`.
- Só o **automático** não codifica temperatura (as 14 temperaturas usam o mesmo sinal, nas 4 ventilações). Resfriar, aquecer, ventilar e desumidificar têm sinal distinto por temperatura.
- TV: 10 teclas `geonav-perfil`; Início e Mudo `samsung-padrao`.

**Problemas corrigidos:**
- O estado enviado ao painel listava as 281 chaves do ar a cada consulta de 5 s (~27 KB). Agora o ar recebe um resumo (`irClimate`: cobertura, origens, `off` e pares sem temperatura) — 3,5 KB no total. Nenhum código sai do servidor.
- Mudar só a temperatura num modo em que o sinal resultante é idêntico ao atual é recusado no servidor (`409 temperature_not_encoded`) sem enviar nada. A detecção compara os próprios códigos, então vale também para sinais aprendidos.
- Mensagens de erro específicas: tecla sem código, desligar não cadastrado e estado ausente com a combinação em português.

**Interface:**
- No automático, o número vira "Auto", a temperatura fica desativada e uma nota explica que o ar decide; o ajuste não é apresentado como efetivo.
- Trocar modo/ventilação só passa por combinações cadastradas, ajustando a temperatura para a mais próxima disponível; os limites do ajuste seguem a cobertura do par atual.
- Rodapé do ar separa "do perfil Geonav", "aprendidos" e o desligar.
- TV: tecla sem código fica desativada fora do Aprender; teclas no código Samsung genérico têm um ponto âmbar e dica.
- O modo Aprender não mudou e continua tendo precedência sobre o perfil.

**Testes:** `tests/backend/test_climate_profile.py` (11 novos). Suíte completa: 80 testes, um ignorado, em três execuções seguidas; compilação e detector de design limpos. Instalado no PC de casa (servidor reiniciado; go2rtc e bandeja intactos; a bandeja recarrega o painel novo ao fechar o popup).

**Não verificado:** a tela do automático com estado real (depende de um comando enviado para haver estado estimado). Pendências físicas: [ROTEIRO-TESTES-FISICOS.md](ROTEIRO-TESTES-FISICOS.md).

## Validação física e diagnóstico da ventilação — 15/10/2026 (noite)

**Comprovado pelo proprietário em casa:** o ar ligou e respondeu pelo painel (resfriar, mudança de temperatura e ventilação alta). Liga/desliga e ventilação **alta** e **baixa** fazem o ar apitar (sinal recebido).

**Problema relatado:** ventilação **média** e **automática** às vezes não fazem o ar apitar nem mudar.

**Análise offline dos sinais do perfil (sem envio):** quadro de 9,1/4,55 ms, 35 bits + pausa + 32 bits (formato do tipo Gree). Entre S0–S3 mudam só os bits 4–5 do primeiro byte (0 automática, 1 baixa, 2 média, 3 alta), igual em todos os modos e temperaturas; o verificador desse formato não usa esses bits. Estruturalmente, os quatro sinais são consistentes — a análise offline não aponta código corrompido.

**Hipóteses e próximo teste:** (1) o modelo pode não ter média/automática no mesmo formato — conferir no controle original; (2) o controle original pode enviar esses estados com outro bit. Teste: Aprender › "24 °C · Resfriar · Média" pelo controle original; comparar bit a bit o sinal aprendido com o do perfil e, se a diferença for sistemática, corrigir todas as temperaturas de média/automática de uma vez. O sinal aprendido já tem precedência para o estado gravado.

**Turbo:** o perfil recuperado não tem tecla de turbo (246 entradas: estados, `power_on`, `power_off`). Só é possível adicioná-lo aprendendo do controle original, o que exige suporte a uma tecla extra no painel.

**Interface:** a animação do vento acompanha a ventilação (baixa 7 fios lentos, média 11, alta 14 rápidos e longos, automática "respirando") e a cor acompanha o modo.

## Calibração dos quadros do ar com o controle original (15/10/2026)

Gravações feitas com Aprender: 22 °C resfriar auto, 22 °C resfriar auto com turbo, 24 °C resfriar média.
A comparação bit a bit com o perfil Geonav mostrou que:

- o perfil difere do controle original em **3 bits fixos** em todos os estados (seg0[22]=1, seg1[1]=0, seg1[8]=1).
  É a causa provável de a ventilação média e a automática não serem aceitas pelo ar;
- o **turbo é um único bit** (seg0[20]) sobre o mesmo estado; o checksum não muda;
- o "33º bit" do perfil era só a pausa final do quadro (1 ms no perfil, ~52 ms no controle), não um dado.

Aplicando a correção aos quadros do perfil, as três gravações são reproduzidas bit a bit, e a correção
vale para todos os 244 quadros do perfil. Ela fica no cadastro DPAPI como `frameFix` do `ar-quarto`
e é aplicada no envio (`backend/ac_frames.py`). Para recalibrar depois de novas gravações:

    .venv\Scripts\python.exe -m backend.calibrar_ar          (mostra)
    .venv\Scripts\python.exe -m backend.calibrar_ar --apply  (salva; depois reinicie o servidor)

No painel, o botão Turbo passa a ligar e desligar de verdade (estado estimado; desligar o ar zera o turbo).
Falta o teste físico: média, automática e turbo ligado/desligado.
