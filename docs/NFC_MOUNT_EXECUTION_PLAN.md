# Plano: escolher o tipo de NFC ao criar uma peça

Status em 2026-11-02: código pronto na branch `feat/nfc-mounts`, ainda sem deploy e sem nada registrado em produção.

| Fase | Situação |
|---|---|
| F0. Medidas e peças de teste | Ø 25,4 mm e NTAG215 confirmados. Espessura não medida: assumida como fina, cabendo no bolso de 0,48 mm. 5 peças fatiadas em `PRINT NOW`, aguardando impressão |
| F1. Geradores | Pronta. 78 combinações geram; os meshes que já existiam ficaram byte a byte idênticos |
| F2. Servidor e dados | Pronta, com testes |
| F3. Telas e MCP | Pronta. Testes e `tsc` passam, mas as telas não foram abertas no navegador |
| F4. Catálogo | Falta. `catalog/nfc_versions.py` já escreve as 32 versões; dependem do deploy e da aprovação do teste físico |
| F5. Regras e documentação | README atualizado |
| F6. Backlog | 7 de 11 desenhados: Venmo White e Black, Menu Italic, Menu Metropolis, Zelle, Cash App, PayPal |

Falta decidir:

- **WhatsApp, Facebook, TikTok:** o logo não está em `library/svg`. É preciso autorizar o download, como foi feito com os logos de pagamento.
- **Wi-Fi:** falta definir o texto da face e o que o NFC faz. Hoje toda peça abre o link do Xpot, não a rede.
- **Zelle, Cash App, PayPal:** usam a face `custom`. O diálogo "Gerar peças" mostra um só modelo por face, então esses três só aparecem pelo outro assistente até ganharem face própria.
- **Formas que faltam:** Venmo Small, Stand Venmo e os Pay em Small e em preto ainda não existem como modelo.

## Objetivo

Ao criar plates e stands, o sistema pergunta qual NFC vai dentro da peça. Cada tipo gera um arquivo de impressão
diferente. São três tipos, em todos os produtos, faces e cores. O novo adesivo redondo é o padrão.

| Tipo | `nfc_mount` | Peça comprada | Bolso | Situação |
|---|---|---|---|---|
| **Adesivo redondo de ~1" (padrão)** | `sticker_round_25` (novo) | `nfc-sticker-round-25` (nova) | Ø 28,4 x 0,48 | novo, padrão |
| Adesivo 10 x 20 | `sticker_10x20` | `nfc-sticker-10x20` | 23 x 13 x 0,48 | padrão atual |
| Pastilha de 25 mm | `embedded_round` | `nfc-tag-round-25` | Ø 25,6 x 0,96 | só nos geradores antigos |

O Ø 28,4 segue a folga que já foi aprendida no adesivo retangular: 0,4 mm por lado ficou apertado para colar à mão, e
1,5 mm por lado funcionou (`build_menu_sticker_test.py`).

## Como é hoje

- **Geração:** `print-pipeline/builders/__init__.py` chama um gerador por face. O bolso é definido em
  `nfc/Plate/source/design/tile_per_code*.py`, `build_menu_sticker_test.py`, `build_venmo_plate_batch.py` e
  `nfc/Stand/source/design/card_per_code_*.py`. As medidas estão repetidas nesses arquivos.
- **Onde o tipo fica:** em `params.nfc_mount` da versão do modelo. A pausa fica em `recipe.pause_top_z` e `beds[].pause`,
  e a peça consumida fica em `consumes`. Quem pede a impressão não escolhe nada, e o pedido não registra o tipo.
- **Por onde um pedido nasce:** todos passam por `createJob` (`server/tags/production.ts:1064`).
  - `GenerateDialog` (`production-generate.tsx`), via `generatePieces`
  - `production-wizard.tsx`
  - MCP `print_job_create`
  - branch `codex/customer-orders` (`server/customerOrders/service.ts:733`), ainda fora da main

### O que cada gerador aceita hoje

| Gerador | Pastilha | 10 x 20 | Redondo novo |
|---|---|---|---|
| `plate.instagram`, `plate.google` | sim | sim | falta |
| `plate.menu`, `plate.venmo` | falta | sim (ignoram `nfc_mount`) | falta |
| `stand.google`, `stand.instagram` Large | sim | sim | falta |
| `stand.menu` e todos os Stands Small | falta (recusam) | sim | falta |

### Catálogo atual: 45 modelos

- **25 prontos:** 13 Plates e 12 Stands. 24 usam o 10 x 20. `plate-large-instagram-white` v1 ainda usa pastilha.
- **11 sem desenho (`design_needed`):** Cash App, Facebook, Menu Italic, Menu Metropolis, PayPal, TikTok, Venmo White,
  Venmo Black, WhatsApp, Wi-Fi, Zelle.
- **9 peças avulsas:** bases, tokens, adesivo, pastilha, arruela.
- **Lacunas já existentes:** Venmo só existe como Plate Large misto. Não há Venmo Small nem Stand Venmo.

## O que muda na geometria

Medi as faces reais pelo código. Com Ø 28,4 e 3 mm de margem até a borda, o centro do círculo precisa ficar a pelo
menos 17,2 mm do topo. Por isso ele ocupa de 3,0 a 31,4 mm a partir do topo e desce um pouco em relação à linha do
"Tap here". O QR fica livre nas peças medidas.

O problema está no Google: o bolso do G fica nessa mesma região.

| Peça | G a partir do topo | Sobreposição | Profundidade do bolso do G |
|---|---|---|---|
| Plate Google Large | 21,1 a 41,0 | 10,3 mm | 1,16 |
| Plate Google Small | 18,6 a 31,6 | 12,8 mm | 1,16 |
| Stand Google Large | a partir de 22,9 | 8,5 mm | 1,0 |
| Stand Google Small | a partir de 16,9 | 14,5 mm | 1,0 |

Proposta de altura, supondo um adesivo fino e bolso de 0,48 mm:

| Faces | Cor | Bolso (z de impressão) | Pausa |
|---|---|---|---|
| Sem G (Instagram, Menu, Venmo) | branca | 1,16 a 1,64 | 1,80 |
| Sem G (Instagram, Menu, Venmo) | preta | 0,68 a 1,16 | 1,32 |
| Google | ambas | 1,64 a 2,12, passando por baixo do G | 2,28 |

Em 1,64 sobram 0,48 mm entre o bolso do G e o adesivo, a mesma espessura usada pela pastilha embaixo do G. Os valores
caem na grade de camadas (0,20 + n x 0,16). Venmo misto tem uma só pausa, então usa a profundidade da branca, como hoje.

## Riscos a testar antes do catálogo

1. **Teto do bolso:** o retângulo tem vão de 13 mm, e o círculo tem 28,4 mm, mais que o dobro. O teto é impresso em
   ponte sobre o adesivo. É o maior risco técnico deste plano.
2. **Pastilha:** o lote LPLATE-2026-004 foi perdido com pastilhas nessa cavidade de 0,96 mm
   (`build_menu_sticker_test.py`). Ela continua como opção, mas Menu, Venmo e Small nunca foram impressos com ela.
3. **Leitura no Google:** o adesivo fica mais fundo, a 1,64 mm da face. Falta confirmar a distância de leitura no celular.

## Decisão de arquitetura

**Um modelo, com o NFC escolhido no pedido.** Não criar um modelo por tipo de NFC: isso transformaria 25 modelos em 75 e
quebraria a escolha por produto, cor e face em `printGenerateOptions`.

- Cada versão guarda `nfc_variants`, com os dados de cada tipo que foi construído e verificado: `params`, pausa, texto da
  pausa, `consumes`, materiais e números do fatiamento.
- O pedido e cada placa guardam `nfc_mount`. Pedido antigo fica com `null` e continua usando a versão como está.
- `jobTicket` aplica a variante e entrega ao bench a receita já resolvida, então o fluxo do bench não muda.
- A tela só oferece tipos que existem na versão, seguindo a regra atual de mostrar só o que a casa consegue fazer.
- Como o NFC fica selado por dentro, o 3D é um por versão. Se a aparência externa mudar em algum tipo, ele ganha o seu.

## Fases

### F0. Medidas e peças de teste (depende de você)

1. Você passa as medidas do adesivo (ver "O que preciso de você").
2. Eu gero as peças de teste, sem registrar no catálogo: Plate Instagram Large branca e preta, Plate Google Small branca
   e preta, Stand Google Small branco.
3. Você imprime à mão e testa colagem, teto do bolso e leitura.

**Só seguimos para o catálogo depois dessa aprovação.**

### F1. Geradores (`print-pipeline`)

- Criar `nfc_mounts.py` como fonte única: formato, medidas, altura por face e cor, pausa e texto da pausa.
- Fazer os 7 geradores aceitarem os 3 tipos em todos os tamanhos e cores. Hoje vários recusam ou ignoram `nfc_mount`.
- Validar no build: margem até a borda, distância do bolso do G, área do bolso e pausa.
- Testes em `tests/test_pipeline.py`. `tests/rebuild.py` tem de continuar byte a byte idêntico nos lotes já impressos.
- Os modos `rear_sticker_10x20*` ficam como estão: não viram opção, só permitem reconstruir lotes antigos.

### F2. Servidor e dados

- Registro compartilhado dos tipos em `shared/printProduction.ts` e schema de `nfc_variants`.
- Migração `0072`: `nfc_mount` em `print_requests` e `print_jobs`, e `nfc_variants` em `print_model_versions`.
- `createJob` e `generatePieces`: `nfcMount` obrigatório em peça serializada, com erro claro listando as opções.
- Variante aplicada também em `jobTicket`, baixa de peças consumidas (`production.ts:1700`), materiais e `redoJob`, que
  repete o tipo da placa original.
- Testes de integração em `tests/tags/production.integration.test.ts`.

### F3. Telas e MCP

- `GenerateDialog`: novo passo "Qual NFC?" entre face e quantidade, com o redondo já selecionado. O passo aparece sempre.
- `production-wizard.tsx`: o mesmo campo.
- Revisão, detalhe da placa e pedido mostram o tipo. A instrução da pausa acompanha o tipo escolhido.
- Print Now: o tipo entra no nome da pasta do pedido.
- MCP `print_job_create` e `print_model_version_create`: novo campo e descrições.
- Textos em inglês, português e espanhol.

### F4. Catálogo

- Criar a peça `nfc-sticker-round-25`, com link de compra e estoque informados por você.
- Registrar uma nova versão nos 25 modelos prontos, com as 3 variantes e o redondo como padrão.
- Gerar as 75 combinações e fatiar ao menos uma por família, com QR e pausa conferidos.
- Anexar o 3D de cada nova versão (`xpot-print-preview`) e conferir `currentVersion.preview`.

### F5. Regras e documentação

- Trocar no `print-pipeline/README.md` a regra "todo modelo novo usa 10 x 20" por: perguntar o tipo, padrão redondo, todo
  modelo novo nasce com os 3 tipos.
- Atualizar `docs/PRINT_EXECUTION_PLAN.md`.

### F6. Depois deste plano

- Passar `nfcMount` em `codex/customer-orders` quando esse branch for integrado.
- Os 11 modelos do backlog e as lacunas do Venmo nascem com os 3 tipos quando forem desenhados.
