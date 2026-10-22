# Plano de execução: produção das peças impressas dentro do Xpot

**Status:** proposto e aprovado em 2026-10-22 (decisões D1 e D2 da seção 13; D3 e D4 tomadas como recomendadas). Fases 0 a 5
implementadas no mesmo dia (seção 11, "Feito"), Skale-Club/xpot#108 a #113. **Corrigido no mesmo dia (seção 15): nada vai
direto para a impressora.** Um pedido é "N peças de um modelo", dividido em placas; cada placa é baixada, impressa à mão no
Bambu Studio e marcada impressa no Xpot, e o Bench mantém a pasta Print Now organizada. Falta o que só o dono faz: parear o
Bench e escolher a pasta Print Now (seção 15).
**Público:** produto, engenharia e operação
**Objetivo:** pedir, gerar, imprimir e receber qualquer peça do catálogo sem sair do Xpot e sem chamar o Claude, que passa a entrar só para desenhar faces, variantes e versões novas.

Complementa [TAG_INVENTORY_EXECUTION_PLAN.md](TAG_INVENTORY_EXECUTION_PLAN.md) (lotes, códigos emitidos, estoque por leitura) e o
plano de 2026-10-10 do repositório 3D ("Xpot as the record of NFC production"), cujas fases 4, 6 e 7 ficaram abertas e são
absorvidas por este.

---

## 1. Resultado esperado

- **Catálogo:** todo modelo que a casa imprime existe no Xpot, com a versão atual da receita e o estoque em casa. Inclusive modelos
  que ainda não foram desenhados (logo de uma empresa grande, Menu em outra fonte ou cor): ficam cadastrados como "sem desenho"
  até o Claude entregar a versão 1.
- **Fila de impressão:** "Imprimir 4 × Plate Large Menu White" gera o lote com os códigos, constrói o arquivo, fatia, confere os QR
  no G-code e deixa o `.3mf` para baixar (depois: para mandar direto à impressora). Peças sem código (bases, tokens G) são um
  clique: o arquivo fixo da versão.
- **Uma versão por melhoria:** "a Menu branca saiu translúcida" vira uma observação no lote e uma versão 2 do modelo (mais paredes,
  mais shells), com changelog. O próximo pedido já sai na v2. Nenhuma correção fica só num script ou numa nota.
- **Acabou a pasta:** `PRINT NOW/`, `PRINTED - DO NOT REPRINT/`, `SERIAL MAP - *.csv` e o README de instruções deixam de existir.
  O arquivo, o mapa de posições, o relatório de verificação e as instruções de AMS/pausa ficam anexados à ordem, no Xpot.
- **O código sai do Google Drive:** o pipeline Python vira `print-pipeline/` neste repositório, com git, testes e CI. O Drive fica
  com `.f3d`, renders e histórico.

## 2. Diagnóstico (2026-10-22)

| Fato | Evidência |
|---|---|
| O Xpot sabe o estado do lote, mas não conhece o arquivo: o `.3mf` só existe em `NFC Signs/<Plate|Stand>/PRINT NOW/` no Drive, e "o que imprimir agora" é um README reescrito a cada lote | `tags_batches_list` mostra LPLATE-2026-002 `built`; o arquivo é `1 - PLATES GOOGLE LARGE - LPLATE-2026-002 - PLA x4.3mf`, citado só no README |
| Cada modelo tem o próprio script; a ferramenta unificada só conhece 4 | `NFC Signs/tools/nfc_batch.py` (`PRODUCTS`: Stand/Plate × Google/Instagram, Large); Menu, Venmo e Small em `build_menu_plate_batch.py`, `build_venmo_plate_batch.py`, `tile_per_code_google.py --size small` |
| Peças sem código não existem em lugar nenhum | bases, tokens G, arruelas e adesivos NFC só no texto de `PRINT NOW/README.md` (decisão D5 de 10/10: "ainda não") |
| O "como imprimir bem" está espalhado | `wall_loops`/shells nas receitas JSON; profundidade do bolso em `POCKET_Z0_BY_THEME` (Python); pausa Z no README; o porquê no decision log |
| O Drive não serve de repositório de código | letra instável (H:, J:, G:), arquivos "online-only" ilegíveis (`frame-kit-export.py`), sem git; o Bambu Studio salvou um arquivo impresso de volta em `PRINT NOW/` (2026-10-21) |
| O Xpot em produção não roda a geração | `Dockerfile`: `node:24-alpine`; o pipeline precisa de Python (numpy, shapely, manifold3d, trimesh, matplotlib, PyMuPDF, OpenCV) e do `bambu-studio.exe --slice` |
| O que já existe e serve de base | lotes `issued` com peças `pending` e leitura de entrada (`server/tags/repository.ts`); jornada com ações de produção (`shared/tagJourney.ts`); app desktop pareado por token que reclama jobs (`nfc-provisioner/`, `server/tags/provisioning.ts`); armazenamento privado no R2 (`server/lib/files.ts`); MCP (`server/mcp/tools/tagJourney.ts`) |

## 3. Decisões de produto

### 3.1 O Xpot é o catálogo e a fila; a geração roda na bancada

A geração continua em Python e no Bambu Studio, que já funcionam, mas passa a rodar como **agente no PC da impressora** (o
"Bench", seção 7), não numa sessão do Claude nem no servidor. O Xpot cria a ordem, guarda o resultado e mostra o estado.

### 3.2 Modelo, versão e ordem são coisas diferentes

- **Modelo** é o que se vende e se imprime: produto × face × tema (cor). Não muda quando a receita melhora.
- **Versão** é a receita congelada que produziu um lote. Toda ordem aponta para uma versão; uma versão nunca é editada depois de usada.
  Uma melhoria é uma versão nova, com changelog e, quando vier de um problema, o lote que o mostrou.
- **Ordem** é um pedido de impressão de N peças de uma versão. Para um modelo serializado, a ordem cria o lote (códigos); para
  uma peça sem código, a ordem é só o arquivo e a contagem.

### 3.3 O Claude desenha, o Xpot produz

Um modelo novo nasce no catálogo com estado `design_needed`, criado por quem teve a ideia (o dono, no painel). O Claude recebe o
nome do modelo, desenha a face e o builder no `print-pipeline/`, abre o PR, e registra a versão 1 pelo MCP. A partir daí o modelo é
`ready` e nunca mais precisa do Claude para ser impresso.

### 3.4 Peças sem código entram, com contador (D3)

Bases, tokens G, arruelas e adesivos NFC são modelos de tipo `part`. A ordem de um `part` soma ao estoque quando marcada impressa;
a montagem de um Stand (jornada `assembled` num lote de Stand) desconta uma base e um token por peça. Sem código, sem leitura: é
uma contagem, ajustável à mão com motivo.

### 3.5 A entrada no estoque continua sendo a leitura

Nada muda na regra do plano de estoque: a peça serializada só vira `available` quando o QR impresso é lido para dentro do lote.
A ordem fecha sozinha quando o lote está todo recebido; "marcar impresso" é um passo anterior e não substitui a leitura.

### 3.6 A área chama-se Produção (D4)

Tags › **Produção**, com as abas Catálogo e Fila. As abas Lotes, Estoque e Jornada continuam onde estão.

## 4. Modelo de dados

Migração `0059_print_production.sql`. Colunas enum-like em `text` com `CHECK`, como nas demais tabelas de Tags; valores permitidos
em `shared/printProduction.ts`.

### 4.1 `print_models`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `slug` | text, único | `plate-large-menu-white`, `base-large`, `g-token-flush-20` |
| `kind` | `serialized` \| `part` | serializado recebe códigos Xpot; part não |
| `title` | text | "Plate Large · Menu · White" |
| `product_type` | `TAG_PRODUCT_TYPES`, nulo em `part` | o tipo que o lote recebe |
| `face` | `TAG_FACES`, nulo em `part` | a face que o lote recebe |
| `theme` | text curto | `white`, `black`, `mixed`; livre, mas estável |
| `sales_product_id` | fk `sales_products`, nulo em `part` | o produto vendido |
| `batch_prefix` | text, nulo em `part` | `LPLATE`, `SPLATE`, `REV`, `IG`: o código do lote vira `<prefix>-<ano>-<nnn>`, sequencial por prefixo e ano, gerado pelo servidor |
| `status` | `design_needed` \| `ready` \| `retired` | `ready` exige uma versão `current` |
| `current_version_id` | fk `print_model_versions`, nulo | |
| `part_on_hand` | int, só `part` | o contador da seção 3.4 |
| `description`, `sort_order`, `created_by_user_id`, `created_at`, `updated_at` | | |

### 4.2 `print_model_versions`

| Coluna | Tipo | Nota |
|---|---|---|
| `id`, `model_id`, `version` (int) | | único por (`model_id`, `version`) |
| `status` | `draft` \| `current` \| `superseded` | uma `current` por modelo; uma versão usada por uma ordem nunca volta a `draft` |
| `builder` | text, nulo em `part` | o id do builder no pipeline (`plate.menu`, `plate.instagram`, `plate.google`, `plate.venmo`, `stand.google`, `stand.instagram`) |
| `params` | jsonb | o que o builder recebe além do código: `{"size":"large","theme":"white","pocket_z0":1.16,"font":"Inria Serif"}` |
| `recipe` | jsonb | a sobreposição de `settings` do `build.json` (paredes, shells, infill, sequência da primeira camada, pausa). O pipeline aplica sobre a receita-base do builder |
| `beds` | jsonb | as disposições de bancada: `[{"label":"x4","copies":4,"positions":["front-left",…],"minutes":273.5,"swaps":3,"grams":{...},"pause":{"z":1.80,"text":"…"},"ams":[{"slot":1,"colour":"White PLA"},…],"file_ref":null}]`. Num `part`, cada bed traz o `file_ref` do `.3mf` fixo (`x4`, `x6 full plate`) |
| `changelog` | text | obrigatório a partir da v2; cita o lote que motivou (`fixes_batch_id`, nulo) |
| `created_by_user_id`, `source` (`admin` \| `mcp` \| `bench`), `created_at` | | |

### 4.3 `print_jobs`

| Coluna | Tipo | Nota |
|---|---|---|
| `id`, `model_id`, `version_id`, `bed_label`, `quantity` | | `quantity` = `copies` do bed × plates |
| `batch_id` | fk `tag_batches`, nulo em `part` | criado junto com a ordem (seção 5.1) |
| `status` | `requested` \| `building` \| `ready` \| `printing` \| `printed` \| `failed` \| `cancelled` | máquina de estados em `shared/printProduction.ts`; a ordem de um lote fecha (`printed`) quando `pendingCount` chega a zero |
| `device_id` | fk `tag_provisioning_devices`, nulo | o Bench que reclamou |
| `report` | jsonb | o que o build mediu: minutos, trocas, gramas, `qr_check` (n/N), avisos do slicer, versão do Bambu Studio |
| `error_code`, `error_message` | | só em `failed`; o `report` fica |
| `requested_by_user_id`, `claimed_at`, `built_at`, `printed_at`, `created_at`, `updated_at` | | |

### 4.4 `print_job_files`

| Coluna | Nota |
|---|---|
| `id`, `job_id`, `kind` | `3mf` (o projeto), `gcode_3mf` (fatiado, o que vai à impressora), `serial_map` (csv), `report` (json), `preview` (png da primeira camada) |
| `file_ref` | chave no R2: `print/<job_id>/<nome>` (`server/lib/files.ts` ganha o prefixo `print/` em `KEY_PATTERN`; acesso só por `requireTagAdmin`, URL assinada de 5 min como hoje) |
| `filename`, `bytes`, `sha256`, `created_at` | |

### 4.5 `print_part_movements`

`model_id`, `delta`, `reason` (`printed` \| `assembled` \| `used` \| `adjustment`), `job_id` (nulo), `batch_id` (nulo), `actor_user_id`,
`note`, `created_at`. `part_on_hand` é a soma; a tabela é o extrato.

### 4.6 O que muda no que existe

- `tag_batches` ganha `print_job_id` (nulo): o lote sabe de que ordem veio. Lotes antigos recebem a ordem retroativa da seção 10.
- `tag_provisioning_devices` ganha `capabilities` jsonb (`["nfc"]`, `["nfc","print"]`): o mesmo pareamento serve aos dois papéis.
- A jornada não muda de forma: o Bench escreve `sliced` (com `file`, `minutes`, `swaps`, `positions`) e "marcar impresso" escreve
  `printed`, com `source: "bench"` e `metadata.job_id`. `batchStage` em `shared/tags.ts` continua derivando o estágio como hoje.

## 5. Fluxos

### 5.1 Pedir uma peça serializada

1. Catálogo → "Plate Large · Menu · White" (v2) → **Imprimir** → bed `x4` → confirmar.
2. O servidor, numa transação: gera o código do lote (`LPLATE-2026-007`), chama o `createBatch` de hoje com `quantity`, `productType`,
   `face` e `salesProductId` (com `quantity` o lote nasce `issued` e as 4 peças `pending`, como `tags_batch_create` faz), cria a
   ordem `requested` apontando para a versão, e liga `tag_batches.print_job_id`.
3. O Bench reclama a ordem (`building`), constrói, fatia, verifica, sobe os arquivos e completa (`ready`) ou falha (`failed`, com o
   relatório). A jornada do lote recebe `sliced`.
4. Na Fila, a ordem `ready` mostra as instruções da versão (AMS, pausa Z, posições com os códigos) e **Baixar .3mf** (fase 3: **Enviar
   para a impressora**).
5. Depois de imprimir: **Marcar impresso** → `printing → printed` na ordem e `printed` na jornada. Cada peça é lida para o estoque na
   tela do lote (`batch-receive.tsx`, inalterada). A ordem mostra "recebidas 3/4" e fecha em 4/4.

### 5.2 Pedir uma peça sem código

Catálogo → "Base Large" → **Imprimir** → bed `x6 full plate` → a ordem nasce `ready` com o `file_ref` da versão (nada a construir).
**Marcar impresso** soma 6 em `part_on_hand` (`print_part_movements.reason = printed`).

### 5.3 Um modelo que ainda não existe

1. Catálogo → **Novo modelo** → "Plate Large · Menu Playfair · Black", `serialized`, `large_plate`, face `menu`, tema `black`,
   produto de venda, prefixo `LPLATE` → estado `design_needed`. O botão Imprimir fica desligado com "sem desenho".
2. O dono pede ao Claude o desenho. O Claude trabalha em `print-pipeline/` (face, builder, receita, teste com o código de amostra
   `A7K3P9X2`), abre o PR e registra a v1 com `print_model_version_create` (MCP), que leva o modelo a `ready`.
3. A partir daí, 5.1.

### 5.4 Uma peça saiu ruim

1. No lote (ou na ordem): **Registrar problema** → observação na jornada ("saiu translúcida; precisa de mais parede"), `kind:
   observation`, com a ordem e a versão em `metadata`.
2. Catálogo → modelo → **Nova versão** a partir da current: muda `recipe` (`wall_loops: 4`, `top_shell_layers: 6`,
   `bottom_shell_layers: 4`) ou `params`, escreve o changelog, marca `fixes_batch_id`. Vira `current`.
3. A próxima ordem sai na v2. A v1 fica `superseded`, ainda ligada aos lotes que produziu.

Uma mudança que exige geometria nova (outro bolso, outro layout) passa pelo Claude como em 5.3, mas como versão, não como modelo.

### 5.5 Montagem de um Stand

Ao escrever `assembled` na jornada de um lote de Stand (hoje feito pelo MCP ou pelo painel), o servidor desconta `part_on_hand` de
`base-<size>` e `g-token-<...>` conforme a versão do modelo declarar em `params.consumes` (`[{"part":"base-large","per_piece":1},…]`).
Sem `consumes`, nada é descontado.

## 6. O pipeline sai do Drive: `print-pipeline/`

Uma pasta neste repositório, ao lado de `nfc-provisioner/`, com `pyproject`/`requirements.txt` fixados e CI própria. Nada de
estado: entrada é a ordem (JSON), saída é a pasta de artefatos.

```
print-pipeline/
├── README.md                 o contrato: entrada, saída, como rodar sem o Xpot (--sample)
├── requirements.txt          numpy, shapely, manifold3d, trimesh, matplotlib, pymupdf, opencv-python-headless, qrcode
├── bench.py                  CLI: build --job job.json --out DIR | sample <builder> | check DIR | attach (fase 1)
├── builders/                 um módulo por builder id (seção 4.2); registry em builders/__init__.py
│   ├── plate/                tile_per_code.py, tile_per_code_google.py, face_composition_tile.py, g_token_flush.py,
│   │                         menu.py (de build_menu_plate_batch.py + build_menu_sticker_test.py), venmo.py, instagram.py, google.py
│   └── stand/                card_per_code_large*.py, face_art*.py, face_composition*.py, nfc_plaque_body*.py, g_token_relief.py
├── lib/                      build_3mf.py (de build-3mf-from-fusion.py), gcode_verify.py, gcode_qr_check.py, check_piece.py,
│                             bbox.py, three_mf.py (3mf-to-stl)
├── recipes/                  os build-*.json das peças NFC (base de cada builder; a versão do Xpot sobrepõe `settings`)
├── presets/                  só os templates que as receitas NFC citam: a1-pla-wallart-template-6slot.3mf, a1-pla-wallart-template.3mf
│                             (git LFS; os outros 40 MB de templates ficam no Drive)
├── svg/                      os logos e o ícone NFC, com SOURCES.md (licenças)
└── tests/                    build de amostra por builder (A7K3P9X2), geometria watertight, QR decodificado da malha; sem Bambu Studio
```

- **CI** (`.github/workflows/ci.yml`): `python -m py_compile` em tudo + `pytest print-pipeline/tests` no Ubuntu. O fatiamento não roda
  no CI; roda no Bench, que grava o resultado no relatório.
- **Contrato `job.json`** (o que o Xpot entrega ao Bench e o que `bench.py build` lê): a ordem, a versão (`builder`, `params`,
  `recipe`, o bed) e, para serializados, o lote com `serial_number`, `public_code`, `qr_url`, `nfc_url` por peça, exatamente como
  `tags_batch_create` responde hoje.
- **Saída de `build`** em `--out DIR`: `project.3mf`, `plate_1.gcode.3mf` (ou o que o slicer produzir), `serial-map.csv`,
  `report.json`, `layer1.png`, `mesh/<serial>/*.stl`. É o que o Bench anexa à ordem.
- **O que fica no Drive:** `.f3d`, `preview/`, `render/`, `production/<lote>/` e `PRINTED - DO NOT REPRINT/` como histórico, e os
  docs. `NFC Signs/README.md`, `CLAUDE.md` e o doc 16 passam a apontar para `print-pipeline/` e para o Xpot; `PRINT NOW/` é
  esvaziado na fase 1 e apagado na 2.
- **Risco de divergência:** até a fase 2 fechar, o Claude pode gerar com os scripts do Drive. Regra: a partir do PR da fase 2, só
  `print-pipeline/`; nenhum script novo no Drive.

## 7. O Bench: o app de bancada como agente de impressão

O `nfc-provisioner/` (Electron, Windows/macOS) já faz pareamento com código de uso único, token por dispositivo, `claim` de job,
eventos e `complete`. Ele ganha o segundo papel e o nome **Xpot Bench** (o gravador NFC continua dentro dele).

### 7.1 Protocolo (mesmo estilo de `/api/provisioner/*`)

| Endpoint | Quem | O quê |
|---|---|---|
| `POST /api/provisioner/pair` | existente | `capabilities` passa a vir no corpo; o Bench declara `["nfc","print"]` quando encontra Python e o Bambu Studio |
| `POST /api/provisioner/print-jobs/claim` | Bench | a ordem `requested` mais antiga → `building`, com `job.json` (seção 6) |
| `POST /api/provisioner/print-jobs/:id/events` | Bench | `build_started`, `meshes_built`, `sliced`, `qr_checked`, `upload`, com `detail` saneado como hoje |
| `POST /api/provisioner/print-jobs/:id/files` | Bench | um arquivo por chamada (`kind`, bytes, sha256); limite 64 MB; o servidor grava no R2 |
| `POST /api/provisioner/print-jobs/:id/complete` | Bench | `{status: "ready" \| "failed", report, errorCode?}`; escreve `sliced` na jornada |
| `POST /api/provisioner/print-jobs/:id/release` | admin | devolve uma ordem presa em `building` (Bench morreu) a `requested` |

Uma ordem `building` sem evento há 30 min aparece na Fila como "sem resposta", com o botão de liberar; não expira sozinha.

### 7.2 Dentro do Bench

- **Configuração:** pasta do checkout de `print-pipeline/` (ou o pipeline embutido no instalador, fase 2b), caminho do
  `bambu-studio.exe`, pasta curta de trabalho (`%LOCALAPPDATA%\XpotBench\work`, por causa do limite de 260 caracteres do slicer),
  venv do Python criada pelo próprio Bench (`python -m venv` + `pip install -r requirements.txt`, versões fixadas).
- **Loop:** a cada 20 s, `claim`; com ordem: `bench.py build --job job.json --out work/<id>`; lê `report.json`; sobe os arquivos;
  `complete`. Um build de Plate x4 leva ~2 min + o fatiamento.
- **Fatiamento:** `bambu-studio.exe --datadir <vazio> --slice 0 --outputdir <dir> project.3mf`, via `Start-Process`/spawn com
  espera explícita (o exe é GUI e não bloqueia), sucesso lido de `result.json` (`error_string == "Success."`), nunca do exit code
  (`.claude/docs/02-tooling.md` do repositório 3D, que vira `print-pipeline/README.md` §Slicing).
- **Verificação obrigatória antes de `ready`:** malhas watertight, `gcode_qr_check` decodificando todos os QR da camada 1 para o
  código certo, zero avisos do slicer. Qualquer falha é `failed` com o relatório; a ordem nunca fica `ready` com um QR errado.
- **Tela:** a aba "Impressão" lista as ordens reclamadas, o progresso e os erros; a aba "NFC" é a de hoje.

### 7.3 Fase 3: a impressora

> **Revogada em 2026-10-22 (seção 15).** O dono não quer que o sistema mande arquivos para a impressora: o envio por FTPS/MQTT,
> o estado da impressora e o `bench.py printer` saíram. O texto abaixo fica como registro.

O Bench fala com a A1 em modo LAN, sem conta (a conta do dono é Google SSO e nunca é usada): upload do `gcode.3mf` por FTPS
(`<ip>:990`, usuário `bblp`, senha = código de acesso) e comando de impressão e estado por MQTT (`mqtts://<ip>:8883`). IP, serial
e código de acesso ficam no Bench, nunca no Xpot. **O comando de iniciar impressão por MQTT em modo LAN na A1 não foi confirmado
na prática** (seção 12); o fallback é o upload por FTPS e iniciar pela tela da impressora, que já é melhor do que copiar o arquivo
à mão. Estado reportado: `printing` quando o Bench confirma o início; `printed` continua sendo o clique do dono, até o estado da
impressora se mostrar confiável.

## 8. MCP

Mesmo escopo `xpot:journey` (admin de Tags); registradas em `server/mcp/tools/printProduction.ts`:

| Ferramenta | Para quê |
|---|---|
| `print_models_list` | o catálogo com versão atual, estado, estoque de parts |
| `print_model_create` | um modelo `design_needed` ou `ready` (com a v1 junto) |
| `print_model_version_create` | a receita de uma versão (`builder`, `params`, `recipe`, `beds`, `changelog`, `fixes_batch_id`); vira `current` e leva o modelo a `ready` |
| `print_requests_list` | os pedidos com as placas (seção 15) |
| `print_jobs_list`, `print_job_get` | as placas uma a uma, e uma placa com relatório e arquivos (URLs assinadas) |
| `print_job_create` | um pedido por quantidade (seção 15): "uma placa com 6 do stand X"; cada placa cria seu lote; substitui o uso de `tags_batch_create` para produção própria, que continua existindo para fornecedores |
| `print_job_update` | `printed`, `failed`, `cancelled`, com motivo |

O upload de arquivos não passa pelo MCP: na fase 1 é `bench.py attach --job <id> <dir>` com o token do dispositivo, ou o
arrastar-e-soltar no painel.

## 9. Experiência de uso

### 9.1 Tags › Produção › Catálogo

Cards por modelo: título, face e tema como ícone, versão atual (`v2 · 2026-10-23`), estoque ("em casa 7 · com revendedores 2" para
serializados, "em casa 14" para parts), estado. Botões: **Imprimir** (abre o pop-up de bed + quantidade de bancadas), **Versões**
(a lista com changelog e os lotes de cada uma; **Nova versão** a partir da current), **Editar**. Filtro por tipo e por estado;
`design_needed` em destaque, com "pedir ao Claude" como texto de ajuda (o nome exato do modelo para colar no chat).

### 9.2 Tags › Produção › Fila

Lista das ordens por estado, a mais nova primeiro. A ordem `ready` abre em página inteira (é uma área de trabalho, como o lote):
instruções (AMS por slot, pausa Z com o texto da versão, posições com serial e código como na bancada), **Baixar .3mf**, **Baixar
fatiado**, mapa de posições, relatório (minutos, trocas, gramas, QR n/N), prévia da camada 1, e os botões **Marcar impresso**,
**Falhou** (com motivo; a ordem pode ser refeita: nova ordem na mesma versão, mesmo lote, se nenhuma peça foi recebida) e
**Cancelar**. Fase 3: **Enviar para a impressora** e o estado dela.

### 9.3 Lote e peça

A página do lote ganha a linha "Ordem de impressão: #… · v2 · ready" com link; a peça mostra a versão com que foi impressa
(`tags → batch → print_job → version`). Nada mais muda nas telas de estoque, kits e vendas.

### 9.4 Idiomas

Chaves novas em `client/src/i18n/messages/production.ts` (EN/PT/ES), checadas por `tests/i18n-messages.test.ts`.

## 10. Migração e cadastro inicial

Feita pelo MCP depois do deploy, não por migração nem por script com acesso ao banco: receitas são dados e passam pela mesma
validação do painel. `print_model_create` (com a v1 junto), `print_job_create` com `existingBatch` para cada lote de hoje, e
`bench.py attach` para os arquivos de `PRINT NOW/`. Idempotente por `slug` (um slug repetido é recusado) e por lote (um lote já
ligado é recusado).

**Modelos serializados** (um por combinação que já foi impressa ou construída):

| slug | produto | face | tema | prefixo | lotes de hoje |
|---|---|---|---|---|---|
| `stand-large-google-white` | large_stand | google_review | white | REV | REV-2026-002, REV-2026-003 |
| `stand-large-google-black` | large_stand | google_review | black | REV | REV-2026-004 |
| `stand-large-instagram-white` | large_stand | instagram | white | IG | IG-2026-001, IG-2026-002 |
| `stand-large-instagram-black` | large_stand | instagram | black | IG | IG-2026-003 |
| `stand-small-google-white` | small_stand | google_review | white | REV | REV-2026-001 (legado, `retired`) |
| `plate-large-instagram-white` | large_plate | instagram | white | LPLATE | LPLATE-2026-001 |
| `plate-large-instagram-black` | large_plate | instagram | black | LPLATE | LPLATE-2026-003 |
| `plate-large-google-white` | large_plate | google_review | white | LPLATE | LPLATE-2026-002 |
| `plate-large-menu-black` | large_plate | menu | black | LPLATE | LPLATE-2026-004 |
| `plate-large-menu-white` | large_plate | menu | white | LPLATE | LPLATE-2026-005 |
| `plate-large-venmo-mixed` | large_plate | venmo | mixed | LPLATE | LPLATE-2026-006 (2 brancas + 2 pretas numa bancada; os temas puros `-white` e `-black` nascem `design_needed` até alguém pedir) |
| `plate-small-instagram-black` | small_plate | instagram | black | SPLATE | SPLATE-2026-001 |
| `plate-small-google-white` | small_plate | google_review | white | SPLATE | SPLATE-2026-002 |

**Parts:** `base-large`, `base-small`, `g-token-large-relief-v2`, `g-token-flush-20`, `g-token-flush-13-small`, `nfc-sticker-10x20`
(comprado, não impresso: só o contador), `washer-m8` (idem). Beds a partir dos arquivos fixos de `PRINT NOW/` (`x4`, `x6 full
plate`, `x36`, …). Contagem inicial informada pelo dono.

**Versão 1 de cada modelo** = a receita que produziu o último lote (`production/<lote>/build-*.json` + os parâmetros do script),
registrada com `source: "mcp"` e `changelog: "v1: receita de <lote>"`. **Ordens retroativas**, uma por lote, com o estado derivado
de `batchStage`: `received`/`receiving`/`printed` → `printed` (`printed_at` = a entrada `printed` da jornada); `built` e `issued` →
`requested`, e `built` passa a `ready` quando o `.3mf` e o serial map de `PRINT NOW/` são anexados (`bench.py attach`).

Depois da carga, `PRINT NOW/` está vazio e cada lote de hoje responde "qual arquivo, qual versão, impresso ou não" no Xpot.

## 11. Fases de execução

### Fase 0 — Preparação (1 dia)

**Entrega:** `shared/printProduction.ts` com os valores permitidos e a máquina de estados da ordem; `print-pipeline/` criado com
`README.md`, `requirements.txt`, CI de `py_compile`; este plano referenciado no `README.md` (feito junto com o plano).
**Aceite:** CI verde com a pasta vazia de builders.

### Fase 1 — Catálogo, versões, fila e arquivos (≈1 semana)

**Entrega:** migração `0059`; serviço `server/tags/production.ts` (modelos, versões, ordens com criação do lote em transação,
arquivos no R2, contador de parts); rotas admin; MCP da seção 8; tela Produção (Catálogo e Fila) com download e marcar impresso;
`bench.py attach`; `scripts/seed-print-models.ts`; carga dos modelos, versões e ordens retroativas da seção 10; testes de integração
(`tests/tags/production.integration.test.ts`: criar ordem cria lote `issued` com N `pending`; ordem de part nasce `ready`; marcar
impresso soma o contador; a ordem fecha quando o lote é todo recebido; uma versão usada não volta a `draft`; arquivo só com
`requireTagAdmin`).
**Aceite:** `PRINT NOW/` vazio; os 15 lotes têm ordem, versão e (onde construído) arquivo baixável; o Claude registra uma versão
pelo MCP e o catálogo a mostra; a Menu branca v2 (paredes) existe como versão com changelog, ainda sem build.

**Feito (2026-10-22):**

- Migração `0059_print_production.sql`; tabelas no schema Drizzle (`shared/schema/tags.ts`); regras e tipos em
  `shared/printProduction.ts`; serviço `server/tags/production.ts`; rotas `server/tags/productionRoutes.ts`; MCP
  `server/mcp/tools/printProduction.ts` (`print_models_list`, `print_model_get`, `print_model_create`, `print_model_update`,
  `print_model_version_create`, `print_jobs_list`, `print_job_get`, `print_job_create`, `print_job_update`).
- O lado da bancada no servidor já está pronto para a fase 2 (`/api/provisioner/print-jobs/claim | :id/events | :id/files |
  :id/complete`, só para dispositivo com a capacidade `print`); `print-pipeline/bench.py` usa esse protocolo (`pair`, `ticket`,
  `attach`, `fail`), só com a biblioteca padrão.
- Tela Tags › Manage › Produção (Catálogo, Fila, página do modelo com versões e contagem, página da ordem com instruções, arquivos
  e passos) em EN/PT/ES; link "Abrir a ordem de impressão" na página do lote; os códigos de erro novos traduzidos.
- Testes: `tests/tags/production.integration.test.ts` (PGlite, rotas HTTP de ponta a ponta) e `tests/tags/printProduction.test.ts`.

**Diferenças em relação ao texto acima:**

- Sem `scripts/seed-print-models.ts`: a carga é pelo MCP (seção 10).
- Uma ordem `failed`/`cancelled` libera o lote: o índice único de `print_jobs.batch_id` vale só para ordens vivas, e "Imprimir de
  novo" (`/print-jobs/:id/redo`, MCP `print_job_update` com `redo`) reusa o mesmo lote enquanto nenhuma peça foi recebida (D5).
- Uma ordem impressa não fecha sozinha quando o lote é todo recebido: a ordem mostra "recebidas n/N" e o lote continua sendo o
  lugar da leitura. Fechar automaticamente fica para quando houver motivo.
- O arquivo fixo de uma bancada de peça sem código só trava quando uma ordem chegou a `ready` com ele (não com qualquer ordem).
- `source` da versão: `admin`, `mcp` ou `bench` (sem `seed`).
- `consumes` é guardado na versão; o desconto na montagem (5.5) continua na fase 4.

### Fase 2 — Pipeline em git e o Bench construindo (≈2 semanas)

**Entrega:** `print-pipeline/` completo (seção 6) com os seis builders e os testes de amostra; o Bench com a aba Impressão, venv,
claim/build/upload/complete (seção 7); `tag_provisioning_devices.capabilities`; `PRINT NOW/` apagado e o repositório 3D apontando
para cá.
**Aceite:** `Imprimir 4 × Plate Large Menu White` chega a `ready` sem o Claude; LPLATE-2026-006 e SPLATE-2026-002 reconstruídos
pelo Bench dão malhas byte-idênticas às de `production/` e o mesmo tempo de fatiamento (311.4 e 334.7 min); a Menu branca v2 sai
só da mudança de `recipe`, sem tocar em Python; uma ordem com QR errado no G-code termina `failed`, nunca `ready`.

**Feito (2026-10-22):**

- O pipeline saiu do Drive: `print-pipeline/nfc/` traz os geradores do repositório 3D (`NFC Signs/*/source/`) com as malhas de
  amostra, `library/` o montador de 3MF, as checagens de G-code, os dois modelos de projeto da A1 e os SVG. A única mudança no
  código copiado são os caminhos.
- `builders/`: os seis ids (`plate.instagram`, `plate.google`, `plate.menu`, `plate.venmo`, `stand.google`, `stand.instagram`).
- `pipeline.py`: ordem → malhas por código → `.3mf` por bancada (receita da versão + slots) → fatiamento offline (Bambu Studio com
  datadir vazio, sem conta) e export do `.gcode.3mf` → `gcode-qr-check` (todo QR da camada 1 lê o próprio código) e
  `gcode-verify` (pausa antes da primeira ponte quando a bancada tem pausa) → `serial-map.csv` e `report.json`.
- `bench.py run` é o Bench: pega a ordem mais antiga com gerador, gera, anexa e marca `ready`, ou `failed` com o motivo.
  `build`, `doctor`, `ticket`, `attach`, `attach-bed`, `fail` e `pair` completam.
- `catalog/catalog.json` (13 modelos com v1, 11 sem desenho, 9 peças sem código) e o script que o escreveu a partir dos lotes.
- `requirements.txt` com as versões exatas; o CI compila tudo e roda `tests/test_pipeline.py`.

**Aceite medido (2026-10-22, `tests/rebuild.py`):**

| Lote | Malhas | Fatiamento |
|---|---|---|
| LPLATE-2026-006 (Venmo, misto) | 12/12 idênticas | 311,4 min, 25 trocas, 56,9 + 52,38 + 2,73 g, 4/4 QR, pausa Z 1,80: igual ao lote |
| SPLATE-2026-002 (Google Small) | 24/24 idênticas | 334,6 min (o lote anotou 334,7), 6 trocas, mesmas gramas, 8/8 QR, pausa Z 2,76 |
| LPLATE-2026-002, -003, -005, SPLATE-2026-001, REV-2026-003, -004, IG-2026-003 | todas idênticas | — |
| LPLATE-2026-005 com `wall_loops 4`, `top_shell_layers 6` (a Menu branca v2) | 8/8 idênticas | 283,5 min, +8,7 g de branco, 4/4 QR: só receita, nenhum Python |
| LPLATE-2026-004 (Menu preto) | arte idêntica, corpo diferente | o lote imprimiu o bolso antigo (pausa Z 1,16); a v1 do catálogo usa o bolso padrão de hoje (pausa Z 1,32): 275,3 min, 4/4 QR |

**Diferenças em relação ao texto acima:**

- O Bench é o `bench.py run` (Python), não uma aba no app Electron: o pipeline já é Python, e o Electron só lançaria esse
  processo. Para rodar com o Windows, um atalho para `pythonw print-pipelineench.py run` em `shell:startup`. O app de NFC
  continua igual.
- Sem venv automática: `pip install -r print-pipeline/requirements.txt` uma vez e `bench.py doctor` confere tudo.
- Os modelos `.3mf` são só dois e pequenos (15 KB): no git direto, sem LFS.
- `PRINT NOW/` só é esvaziado depois da carga (os arquivos das peças sem código sobem com `bench.py attach-bed`).
- "Imprimir 4 × Plate Large Menu White chega a ready sem o Claude" depende de a bancada estar pareada e rodando: confere-se
  na primeira ordem real.

### Fase 3 — A impressora (3–5 dias)

**Entrega:** Bench com IP, serial e código de acesso da A1; upload por FTPS; início por MQTT se confirmado; estado da impressora na
ordem; **Enviar para a impressora** na Fila.
**Aceite:** uma ordem `ready` vai à impressora a partir do Xpot e aparece `printing`; sem MQTT, o arquivo está na impressora e o
dono só confirma na tela dela.

**Feito (2026-10-22):**

- Migração `0060`: `print_jobs.send_requested_at/_by`, `send_claimed_at`, `send_device_id`, `sent_at`;
  `tag_provisioning_devices.printer_status/_at`.
- No painel: **Enviar para a impressora** numa ordem `ready` com `.gcode.3mf`, com confirmação (AMS, pausa, tempo); a ordem
  mostra "esperando a bancada" / "enviando" e o motivo quando a impressora recusa; a Fila e a ordem mostram o estado de cada
  impressora (estado, %, tempo restante, trabalho na mesa).
- Na bancada: `print-pipeline/printer.py` (só biblioteca padrão): FTPS implícito na 990 e um cliente MQTT mínimo na 8883;
  `bench.py printer setup` pede o código de acesso sem mostrar e grava só em `%LOCALAPPDATA%\XpotBench\printer.json`;
  `bench.py run` envia o que o admin mandou (baixa o arquivo pelo link assinado, confere o sha256, recusa se a impressora não
  está livre, sobe por FTPS, começa por MQTT, confere que começou) e informa o estado da impressora a cada minuto.
- API do Bench: `POST /api/provisioner/print-sends/claim`, `POST /api/provisioner/print-jobs/:id/sent`,
  `POST /api/provisioner/printer-status`; do admin: `POST /print-jobs/:id/send`, `/send/cancel`, `GET /print-printers`.

**Diferenças e o que falta conferir:**

- Mandar para a impressora é só pelo painel (um clique humano), não pelo MCP: move a máquina.
- "Impressa" continua sendo o clique do dono; o estado `FINISH` da impressora aparece no cartão, mas não fecha a ordem.
- **Não testado com a impressora:** o código de acesso não está nesta máquina (o `bambu-cli` só tem IP e serial). As portas
  990 e 8883 da A1 respondem na rede. O formato do comando de início (`project_file`, `url file:///sdcard/<arquivo>`) é o que a
  comunidade usa com a série A/P; se a A1 recusar, `url_template` em `printer.json` troca o formato sem mudar código.

### Fase 4 — Versões por feedback e parts (3–5 dias)

**Entrega:** **Registrar problema** no lote/ordem ligado a **Nova versão**; `consumes` na montagem (5.5); extrato de parts com ajuste
manual; alerta de estoque baixo de parts no Catálogo.
**Aceite:** a sequência 5.4 inteira acontece no painel; montar um lote de 4 Stands desconta 4 bases e 4 tokens; o extrato explica
cada número.

**Feito (2026-10-22):**

- **Registrar problema** na ordem (pronta, imprimindo, impressa ou falhou): uma observação `print_problem` no diário do lote,
  com a ordem e a versão; em seguida a página do modelo abre **Nova versão** com o problema no changelog e o lote em "corrige".
- **Marcar montado** numa ordem impressa: escreve `assembled` no diário do lote e tira das contagens as peças que a versão consome
  (`consumes`), multiplicadas pelas peças recebidas. Vale também para `assembled` escrito pelo diário ou pelo MCP; acontece uma vez
  por lote. A contagem pode ficar negativa (é uma recontagem a fazer, não um motivo para recusar a montagem).
- **Ponto de reposição** nas peças sem código (`print_models.part_reorder_at`, migração `0061`): abaixo dele o catálogo e a página
  do modelo mostram "Abaixo de N".
- MCP: `print_job_update` ganhou `assembled` e `problem`; `print_model_update` aceita `partReorderAt`.

**Aceite:** coberto por `tests/tags/production.integration.test.ts` (problema no diário do lote; montar desconta 3 bases para 3
peças recebidas, uma vez só, mesmo com um segundo `assembled` pelo diário; extrato `-3 assembled`, `+10 printed`; alerta abaixo do
ponto de reposição). A tela não foi conferida no navegador (falta sessão de admin local).

### Fase 5 — Fechamento (1 dia)

Decision log do repositório 3D, `docs/HANDOFF.md`, `docs/MODULES.md` e o `README.md` do `nfc-provisioner/` (renomeado nos textos
para Xpot Bench) atualizados; este plano marcado implementado.

**Feito (2026-10-22):**

- Repositório 3D (Drive): aviso no topo de `NFC Signs/README.md` e do doc 16, item em "Open items" do `CLAUDE.md`, entrada no
  decision log de 2026-10-22 e o plano de 2026-10-10 marcado como substituído. Nenhum arquivo do Drive foi apagado.
- Xpot: `docs/HANDOFF.md` (seção Tags › Production), `nfc-provisioner/README.md` (o mesmo pareamento serve à bancada),
  `README.md` (o `print-pipeline/README.md` na tabela de documentos). `docs/MODULES.md` não muda: Produção é uma aba de
  Tags › Gestão, como Lotes. O app de NFC não foi renomeado: a bancada é o `bench.py` (fase 2).
- Catálogo: as v1 declaram o que cada peça consome na montagem (base, token G, adesivo ou tag redonda) e as peças sem código
  têm ponto de reposição.

**Para o dono (uma vez, nesta ordem):**

1. Reconectar o servidor MCP `xpot` (as ferramentas `print_*` só aparecem numa conexão nova) e pedir ao Claude a carga do
   catálogo (`print-pipeline/catalog/catalog.json`: modelos, v1, peças sem código e uma ordem por lote de hoje com
   `existingBatch`).
2. Parear a bancada: Tags › NFC writers → código → `python print-pipeline/bench.py pair <código>`;
   `pip install -r print-pipeline/requirements.txt`; `python print-pipeline/bench.py doctor`.
3. `python print-pipeline/bench.py printer setup` (digita o código de acesso da A1; fica só nesse computador).
4. Subir os arquivos fixos das peças sem código (`bench.py attach-bed <modelo> <bancada> <arquivo de PRINT NOW>`) e os dos
   lotes já fatiados (`bench.py attach <ordem> <pasta>`); depois disso `PRINT NOW/` pode ser esvaziado.
5. Deixar `pythonw print-pipeline\bench.py run` iniciando com o Windows (`shell:startup`).

## 12. Riscos

| Risco | Tratamento |
|---|---|
| Iniciar impressão por MQTT em modo LAN não funcionar na A1 | fase 3 começa pelo FTPS; o início pela tela da impressora é aceitável; validar o comando numa ordem de teste antes de prometer `printing` automático |
| O PC da bancada desligado | ordens ficam `requested` e nada quebra; o Bench inicia com o Windows e fica na bandeja; o Catálogo mostra "Bench offline desde …" |
| Ambiente Python no PC (versões de manifold3d/shapely) | venv criada pelo Bench com `requirements.txt` fixado; `bench.py sample` roda no primeiro start e bloqueia `capabilities: print` se falhar |
| Malhas diferentes entre Drive e git (porte dos scripts) | aceite da fase 2 exige reconstrução byte-idêntica de dois lotes recentes; qualquer diferença é investigada antes do merge |
| Templates `.3mf` grandes no git | só os dois usados, em LFS; o resto fica no Drive |
| Bancada mista (dois temas numa ordem) | tratada como um modelo `mixed` (LPLATE-2026-006); ordens compostas de dois modelos ficam fora deste plano |
| Arquivos no R2 e acesso | chaves `print/<job_id>/…` só por admin com URL assinada; upload só por dispositivo pareado; `sha256` conferido no servidor |
| O Claude gerar fora do pipeline durante a transição | regra da seção 6: depois do PR da fase 2, nenhum script novo no Drive; `nfc_batch.py` apagado no mesmo PR |
| A migração `0059` tocar lotes vivos | só adiciona colunas nulas e tabelas novas; a carga da seção 10 é um script que roda depois e pode ser repetido |

## 13. Decisões

| # | Pergunta | Decisão |
|---|---|---|
| **D1** | A geração roda no PC da bancada (Bench) ou num worker no servidor? | **Bench no PC** (dono, 2026-10-22). Um worker Linux fica como evolução se um dia for preciso pedir impressão com o PC desligado |
| **D2** | O pipeline sai do Drive para git? | **Sim**, `print-pipeline/` neste repositório (dono, 2026-10-22) |
| **D3** | Parts (bases, tokens, arruelas, adesivos) ganham contador? | **Sim**, tomada como recomendada: contador com extrato e desconto na montagem (seção 3.4). Revoga o D5 de 2026-10-10 |
| **D4** | Nome da área | **Produção**, tomada como recomendada |
| **D5** | Uma ordem reprovada (fase 2) pode reaproveitar o lote? | Sim, enquanto nenhuma peça do lote foi recebida: nova ordem na mesma versão e no mesmo lote; os códigos não mudam |

## 14. Fora de escopo

- Portar a geração para Node ou rodá-la dentro do contêiner do Xpot.
- Pedidos compostos (dois modelos numa bancada) e otimização automática de bancada.
- Vender peças (Stuscle) e o Shop do Xpot: nada muda.
- Travar chips, gravar NFC: continuam como estão (Bench › NFC e o celular).
- Modelos não NFC do repositório 3D (chaveiros, wall art, expositores): o pipeline é deles também, mas o catálogo do Xpot só
  recebe o que o Xpot vende ou usa.

## 15. Correção de 2026-10-22: pedido por quantidade, impressão à mão

O dono corrigiu o fluxo no mesmo dia: **o sistema não envia nada para a impressora.** O que ele quer é organização dos
arquivos e dos pedidos:

- escolher o modelo e a **quantidade**; o sistema gera as placas prontas para imprimir;
- **baixar** a placa, abrir no Bambu Studio, configurar e imprimir à mão;
- **marcar impressa** no Xpot, para controle de produção e estoque;
- a pasta **Print Now** só com as placas que importam, organizadas por pedido, item e estado (sem arquivos soltos e testes);
- pedir pela IA ("crie uma placa com 6 do stand Y") e baixar itens avulsos, sempre registrando o que foi impresso.

### 15.1 Pedido e placas

- `print_requests` (migração 0062): modelo, versão, mesa, **quantidade de peças**, notas, origem (painel ou MCP).
- O pedido vira **placas** de no máximo uma mesa: 10 Stands numa mesa de 4 = placas de 4 + 4 + 2. A última é **parcial**: o
  gerador já usava só as primeiras posições da mesa (`pipeline.bed_recipe`). Até 20 placas por pedido.
- Cada placa é uma linha de `print_jobs` (a "ordem" da API) com `request_id` e `plate_number`, **seu próprio lote** (os
  códigos da placa, numerados 1..n, nas posições da mesa), seus arquivos e seu estado: aguardando arquivo → gerando → pronta
  para imprimir → impressa (ou falhou / cancelada). "Imprimir de novo" refaz a placa no mesmo lugar do pedido.
- Uma peça sem código (base, token) imprime o arquivo fixo da mesa: a quantidade sobe para mesas inteiras (8 bases numa mesa
  de 6 = 2 placas, 12 bases).
- Item avulso = um pedido de 1 peça (uma placa com uma peça). O arquivo fixo de uma peça sem código também se baixa no catálogo.
- As ordens criadas antes viraram pedidos de uma placa (o pedido tem o id da ordem).

### 15.2 O painel

- **Fila**: um cartão por pedido (modelo, versão, peças pedidas, data, notas) com as placas: "Placa 2 de 3", peças, lote,
  estado, **baixar Projeto (.3mf)** e **Fatiado (.gcode.3mf)**, e **Marcar impressa**. Filtros: abertos, concluídos, todos.
- **Imprimir** (catálogo e página do modelo): quantidade de peças, com a divisão em placas antes de confirmar.
- **Página da placa**: o que carregar no AMS, a pausa, o mapa de posições e códigos, os arquivos. Sem "Enviar para a
  impressora" nem "Imprimindo agora".
- A página do lote e a entrada no estoque por leitura do QR não mudam.

### 15.3 O Bench e a pasta Print Now

O Bench (no PC com o Bambu Studio) continua **gerando** as placas: meshes por código, `.3mf`, fatiamento offline, conferência
dos QR e da pausa, e sobe os arquivos. Ele **não fala mais com a impressora** (`printer.py` saiu). Ele também mantém a pasta:

```
python print-pipeline/bench.py folder "<caminho>/Print Now"

Print Now/
  Para imprimir/2026-10-22 15h53 - Stand Large - Instagram - Black - 10 un/
    IG-2026-004 - placa 1 de 3 - 4 un.3mf          projeto do Bambu Studio
    IG-2026-004 - placa 1 de 3 - 4 un.gcode.3mf    fatiado e conferido
  Impressos/...                                    placas marcadas impressas nos últimos 14 dias
```

- O Xpot diz o que pertence à pasta (`GET /api/provisioner/print-now`, links assinados); `bench.py run` sincroniza a cada
  minuto e `bench.py sync` sincroniza uma vez.
- Placa marcada impressa vai para `Impressos/`; cancelada, falha ou impressa há mais de 14 dias sai da pasta (continua no Xpot).
- O Bench só move ou apaga arquivos que ele mesmo escreveu (`.xpot-print-now.json`); o resto da pasta nunca é tocado. Os
  arquivos antigos da Print Now do Drive ficam onde estão até o dono decidir (sugestão: mover para um arquivo morto).

### 15.4 IA

`print_job_create { model, quantity }` cria o pedido e devolve as placas; `print_requests_list` mostra os pedidos e o que falta
imprimir; `print_job_update printed` marca uma placa impressa, sempre depois de o dono confirmar.
