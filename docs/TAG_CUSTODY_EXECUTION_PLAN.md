# Plano de execução: custódia de peças no celular

**Status:** fases 0 e 1 implementadas em 26 de outubro de 2026; fases 2 a 4 propostas

> *Nota de implementação (fases 0 e 1):* regras em `shared/tagCustody.ts`, operações em
> `server/tags/custody.ts` e `field.recordPhoneErase`, rotas `POST /api/xpot/tags/:id/receive`,
> `/return-to-house` e `/nfc-erased`. `GET /lookup/:code` devolve `access` e `GET /:id` devolve a
> visão limitada (`TagLimitedView`) ou o detalhe com `custody`. Decisões tomadas na implementação:
> o gestor devolve à casa pelo campo de transferência da Gestão, então o cartão de custódia só
> oferece "Devolver à casa" a quem não é gestor; no iPhone o chip é apagado pelo NFC Tools e a
> pessoa confirma; a migração `0063_tag_chip_erase.sql` aceita o evento `erase_completed`. O Voltar
> do celular fecha as folhas de gravar, lacrar e apagar o chip (`useCloseOnBack`) em vez de sair da
> tela da peça. A fonte e o desenho da peça (fase 4) ficaram para depois.
**Público:** produto, engenharia e operação
**Objetivo:** deixar claro, no app do celular, de quem é cada peça física, permitir receber, devolver e transferir peças entre pessoas da mesma equipe sem confusão, e garantir que testar um chip nunca mexa em estoque.

Complementa [TAG_INVENTORY_EXECUTION_PLAN.md](./TAG_INVENTORY_EXECUTION_PLAN.md) (entrada de peças no lote) e [TAG_SALES_EXECUTION_PLAN.md](./TAG_SALES_EXECUTION_PLAN.md) (venda). Os nomes de tela seguem [UX_OVERHAUL.md](./UX_OVERHAUL.md).

---

## 1. Resultado esperado

Ao final deste trabalho, uma pessoa com o app na mão deverá conseguir:

1. gravar, verificar, travar e **apagar** o chip de uma peça sem que isso mude de quem ela é;
2. **receber** uma peça ainda não recebida (`pending`) no próprio estoque, ou, sendo gestor, na casa;
3. **devolver à casa** uma peça que recebeu e não quer manter (um teste, um engano);
4. ao ler uma peça que está com um colega, ver **com quem ela está** e **pedir a peça**;
5. **passar** uma peça sua para um colega, com o colega confirmando com a peça na mão;
6. ver os pedidos de transferência pendentes e resolvê-los no app;
7. voltar da tela da peça e da tela de gravação sem ficar preso;
8. ver o código da peça com a mesma fonte da plaquinha impressa e um desenho fiel ao modelo (placa quadrada, placa de mesa, cavalete).

O gestor continua vendo tudo em Tags › Gestão, com as transferências pendentes em Distribuição.

---

## 2. Decisões de produto

### 2.1 Testar nunca move estoque

Gravar, verificar, travar, apagar e tocar o chip só mexem no estado do NFC da peça (`nfc_provisioning_status`, datas). Nunca alteram `rep_id`, `custodian_rep_id`, `stock_status` nem `ownership_type`. É assim hoje e continua assim. O dono da empresa testa uma peça pendente e ela segue pendente; testa uma peça da casa e ela segue da casa.

### 2.2 Receber é uma ação explícita

Receber uma peça no estoque é um botão, nunca um efeito colateral de ler ou gravar. Quem recebe escolhe (ou o modo decide) para onde a peça vai:

- um revendedor recebe sempre **no próprio estoque**;
- um gestor em modo gestão recebe por padrão **na casa**, e pode escolher o próprio estoque;
- um gestor em modo revendedor recebe no próprio estoque, como um revendedor.

Isso segue a regra que já decide quem fica com a peça na ativação (`activationCredit` em `shared/tagAccess.ts`).

### 2.3 Receber no celular não substitui o recebimento do lote

A bancada continua recebendo remessas inteiras por Lotes › Receber. O recebimento no celular é o mesmo movimento `intake`, com a mesma prova (a leitura do QR ou o toque no chip) e as mesmas regras do lote (lote aberto, código emitido para aquele lote). O que muda é quem pode fazer e para onde a peça vai.

### 2.4 Receber dá custódia, não custo

Uma peça recebida pelo revendedor no celular passa a estar **com ele** (`rep_id`, `custodian_rep_id`), mas a posse continua da empresa (`ownership_type = company`) e nenhuma aquisição é registrada. Cobrar, montar kit ou registrar custo continua sendo decisão do gestor, pelos caminhos que já existem (Entregar, Pedidos Stuscle, aquisição). O revendedor não pode criar custo para si mesmo.

### 2.5 Devolver à casa é o desfazer universal

Não existe "desreceber". Os movimentos de estoque são imutáveis. Uma peça recebida por engano ou só para teste volta como **estoque da casa** (`return`), pela mesma operação que a gestão já usa (Recolher ao estoque da casa). Vale enquanto a peça não foi vendida nem configurada e está `available`. O desfazer de 30 minutos da bancada continua existindo só para a bancada.

### 2.6 Transferência exige os dois lados e a peça na mão

Uma transferência entre pessoas é um **pedido** com duas pontas: quem segura e quem vai receber. Qualquer uma pode começar; a outra confirma. O pedido só fecha quando quem recebe leu a peça (QR ou toque) com o próprio celular. Assim ninguém transfere o que não está fisicamente com ele e a peça não fica "com fulano" por engano.

Um Rep Admin da organização, ou um gestor, pode fechar ou cancelar um pedido à força (sem leitura). Isso fica marcado como forçado no histórico.

### 2.7 Pedir da casa é o mesmo pedido

Ler uma peça da casa já recebida (`available`, sem revendedor) mostra "Estoque da casa" e "Pedir esta peça". É o mesmo pedido de transferência, com origem "casa" e aprovação de um gestor (ou de um Rep Admin da organização da peça). Fechado, vira um `transfer` da casa para o revendedor, como Entregar faz hoje, sem kit.

### 2.8 Um pedido aberto por peça

Uma peça tem no máximo um pedido aberto. Enquanto houver pedido aberto, a peça não é vendida, configurada, entregue nem recolhida pela gestão, e vice-versa: peça vendida, configurada ou fora de `available` não aceita pedido.

### 2.9 O app mostra a situação, o servidor decide

As regras ficam em `shared/` (puras), usadas pelo servidor para recusar e pelo app para mostrar. O app nunca "adivinha" se pode receber ou transferir: lê do servidor quais ações a peça permite para quem está olhando.

---

## 3. Fluxos completos

### 3.1 Dono testa uma peça recém-impressa

1. Lê a peça (QR ou toque). A tela mostra Estoque físico: Não recebida, Chip: o estado atual.
2. Grava o chip, verifica, toca. O chip fica Verificado. A peça continua Não recebida, da casa.
3. Quer apagar o chip para gravar de novo ou devolver em branco: Chip › Apagar chip. O chip volta a Não programado.
4. Fecha a tela. Nada mudou de estoque.

### 3.2 Dono recebe uma peça na casa pelo celular

1. Lê a peça pendente em modo gestão. O cabeçalho mostra "Receber" com "Na casa" (padrão) e "No meu estoque".
2. Escolhe "Na casa". A peça vira `available`, da casa, com um movimento `intake` e a linha no journey "recebida no app por ...".
3. A tela passa a mostrar Estoque físico: Em estoque, Casa, e o botão Entregar da gestão já a aceita.

### 3.3 Revendedor recebe no próprio estoque

1. Lê a peça pendente. Como a peça é da organização dele, a tela abre em modo limitado: código, modelo, Não recebida, e o botão "Receber no meu estoque".
2. Confirma. A peça vira `available`, com ele (`rep_id`, `custodian_rep_id`), posse da empresa, movimento `intake` com referência ao lote.
3. A tela vira a tela normal da peça: ele pode configurar, vender, gravar.

### 3.4 Revendedor recebeu por engano

1. Na peça, Mais › Devolver à casa.
2. O servidor aceita porque a peça está `available`, sem cliente e sem venda. Movimento `return`, `rep_id` nulo, journey "devolvida à casa no app".
3. A peça some de Minhas peças.

### 3.5 Colega pede uma peça que está comigo

1. O colega lê a peça. A tela limitada mostra "Com Vanildo" e "Pedir esta peça". Ele confirma (pode escrever um motivo curto).
2. Pedido criado, origem Vanildo, destino colega, iniciado por quem recebe, com a leitura registrada agora.
3. Eu recebo um push "Fulano pediu a peça 5N3TQV03" e vejo o pedido em Minhas peças › Pedidos.
4. Aceito. Como a leitura do colega já aconteceu, o pedido fecha na hora: movimento `transfer`, peça passa para ele.
5. Recuso: o pedido vira `declined`; o colega é avisado. A peça segue comigo.

### 3.6 Passo uma peça para um colega

1. Na peça, Mais › Passar para... e escolho o colega da minha organização.
2. Pedido criado, iniciado por quem segura. O colega recebe o push.
3. O colega abre o pedido e o app pede que ele leia a peça. Quando lê (QR ou toque), o pedido fecha: `transfer`.
4. Se o colega não leu em 7 dias, o pedido expira e eu sou avisado.

### 3.7 Revendedor pede uma peça da casa

1. Lê uma peça da casa já recebida. A tela limitada mostra "Estoque da casa" e "Pedir esta peça".
2. O pedido chega aos gestores (push para os gestores da organização) e aparece em Gestão › Distribuição › Transferências.
3. Um gestor aprova: `transfer` da casa para o revendedor, sem kit, sem custo. Ou recusa e, se quiser, entrega por kit com custo pelo caminho normal.

### 3.8 Gestor resolve uma confusão

1. Em Gestão › Distribuição › Transferências vê os pedidos abertos, de quem para quem, há quanto tempo.
2. Pode fechar à força (a peça muda de mão sem leitura, marcado como forçado), cancelar, ou abrir a peça e recolher à casa.

---

## 4. Modelo de dados

### 4.1 Nada muda em `tags`

`rep_id`, `custodian_rep_id`, `ownership_type`, `stock_status` e os campos de NFC já dizem tudo. Receber, devolver e transferir só gravam o que já existe.

### 4.2 `tag_stock_movements`

Continua imutável. Novos usos:

| Movimento | Quando | `reference_type` / `reference_id` |
|---|---|---|
| `intake` | receber no celular | `batch` / id do lote (igual à bancada); `metadata.channel = field` |
| `return` | devolver à casa no app | `transfer_request` quando veio de um pedido, senão nulo |
| `transfer` | pedido fechado | `transfer_request` / id do pedido |

Adicionar `metadata jsonb` ao movimento se ainda não houver forma de registrar canal e método de leitura (hoje isso vai para `tags.scanned_payload` só no intake da bancada).

### 4.3 `tag_transfer_requests` (nova)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `tag_id` | uuid | FK `tags` |
| `from_rep_id` | int nulo | nulo = casa |
| `to_rep_id` | int | quem vai receber |
| `initiated_by` | text | `holder` ou `receiver` |
| `requested_by_user_id` | text | |
| `note` | text nulo | motivo curto |
| `status` | text | `pending`, `accepted`, `declined`, `cancelled`, `expired` |
| `receiver_read_at` | timestamptz nulo | a leitura da peça pelo celular de quem recebe |
| `receiver_read_method` | text nulo | `qr`, `nfc` |
| `resolved_at` | timestamptz nulo | |
| `resolved_by_user_id` | text nulo | |
| `forced` | boolean | fechado por gestor sem leitura |
| `expires_at` | timestamptz | criação + 7 dias |
| `created_at` | timestamptz | |

Índice único parcial: um pedido `pending` por `tag_id`. Índices por `to_rep_id, status` e `from_rep_id, status`.

### 4.4 Journey

Novas ações de sistema em `shared/tagJourney.ts`: `piece_received_in_field`, `returned_to_house` (já existe), `transfer_requested`, `transfer_accepted`, `transfer_declined`, `transfer_cancelled`, `transfer_expired`, `transfer_completed`, `nfc_erased`. Fonte `field`, com `repId` do ator.

---

## 5. Regras (em `shared/tagCustody.ts`)

Funções puras, testadas por unidade, usadas pelo servidor e pelo app:

- `receiveTargets(actor, tag)`: para onde o ator pode receber. Vazio se a peça não é `pending`, se o lote não é da organização do ator ou se o lote está fechado. `["house","me"]` para gestor em modo gestão (casa primeiro), `["me"]` nos outros casos.
- `returnToHouseBlocker(piece)`: `sold`, `set_up`, `not_in_stock`, `not_with_you`, `open_request`. Reaproveita `takeBackBlocker` de `shared/tagDistribution.ts`.
- `transferRequestBlocker(actor, piece, openRequest)`: `sold`, `set_up`, `not_in_stock`, `pending_piece`, `already_yours`, `open_request`, `other_organization`.
- `requestResolution(request, action, actor)`: o que cada ação faz com o pedido. Aceitar fecha se `receiver_read_at` existe, senão espera leitura. `confirm_read` por quem recebe fecha um pedido aceito. Gestor pode `force`.
- `pieceAccess(actor, tag)`: `full` (regra atual de `canWorkOnTag`), `limited` (mesma organização, mas peça com outra pessoa, pendente ou da casa) ou `none`. Hoje tudo que não é `full` é `none`.

---

## 6. API

Base `/api/xpot/tags` (campo, `requireTagUser`), salvo nota.

| Método e rota | O que faz |
|---|---|
| `GET /lookup/:code` | Passa a devolver `access: full \| limited` e, no limitado, só código, modelo, face, lote, estoque, com quem está (nome), e `actions` (`receive`, `request`). Hoje devolve `not_yours`. |
| `GET /:id` | Idem: `actions` que a peça permite ao ator (`receiveTargets`, `return_to_house`, `transfer_out`, `erase_chip`). |
| `POST /:id/receive` `{ into: "me" \| "house", method: "qr" \| "nfc" \| "code", payload }` | Recebe. `house` só para gestor. Idempotente por peça. |
| `POST /:id/return-to-house` | Devolve à casa. Reaproveita a lógica de `setTagRep(id, null)` com fonte `field`. |
| `POST /:id/nfc-erased` | Chip apagado no celular: volta a `not_programmed`, limpa datas de gravação e verificação. Recusa chip travado. |
| `POST /:id/transfer-requests` `{ toRepId?, note?, read?: { method } }` | Cria pedido. Sem `toRepId` o ator é quem recebe (pedido a quem segura ou à casa) e `read` é obrigatório. Com `toRepId` o ator é quem segura. |
| `GET /transfer-requests` | Pedidos onde o ator é uma das pontas, ou, para gestor, da organização. |
| `POST /transfer-requests/:id/accept` | Quem segura (ou gestor, para a casa) aceita. |
| `POST /transfer-requests/:id/decline` | Idem, recusa. |
| `POST /transfer-requests/:id/cancel` | Quem iniciou cancela. |
| `POST /transfer-requests/:id/confirm-read` `{ method }` | Quem recebe leu a peça; fecha um pedido aceito. |
| `POST /admin/tag-transfer-requests/:id/force` | Gestor fecha sem leitura. `requireTagManager`. |

Erros com código estável (`tag_pending_only`, `tag_batch_closed`, `tag_open_request`, `transfer_not_party`, `transfer_read_required`, `nfc_locked_cannot_erase`...), traduzidos em `client/src/lib/apiErrors.ts`.

Push: `sendPushNotification(repId, ...)` para a outra ponta em cada mudança de status; para pedidos à casa, para os gestores da organização. O href aponta para a peça com o pedido aberto.

---

## 7. Experiência de uso

### 7.1 Tela da peça (campo)

- **Cabeçalho:** abaixo dos chips de estado, a linha "com quem está" ganha o botão da ação principal quando houver uma: "Receber" (com escolha Casa / Meu estoque para gestor), "Pedir esta peça", "Confirmar recebimento" (pedido aceito aguardando leitura), ou o aviso "Pedido pendente para Fulano" com Cancelar.
- **Tela limitada:** quando `access = limited`, só cabeçalho, com quem está e a ação. Sem cliente, chip, venda nem desempenho.
- **Mais:** "Devolver à casa" e "Passar para..." entram no menu de ações da peça, cinza quando bloqueadas, com o motivo.
- **Chip:** "Apagar chip" ao lado de Regravar; escondido quando travado, com a nota "Chip travado não pode ser apagado". Mesma opção na tela Direto.
- **Voltar:** a tela da peça sempre tem seta. Com histórico dentro do app volta; sem histórico (aberta por toque ou QR) vai para Minhas peças. A tela de gravação (folha) mantém Cancelar durante a gravação e ganha "Voltar" no estado de erro, em vez de só Tentar de novo.

### 7.2 Minhas peças

- Cartão "Pedidos" no topo quando houver pedido onde o ator é uma ponta: "2 pedidos para você, 1 seu aguardando". Abre a lista com Aceitar, Recusar, Cancelar e, para quem recebe, "Ler a peça para confirmar" (abre o leitor).
- Filtro de situação ganha "Pedido pendente".

### 7.3 Gestão

- Gestão › Distribuição › **Transferências:** lista dos pedidos da organização, com de, para, iniciado por, há quanto tempo, e ações Forçar e Cancelar.
- Na peça, a seção de gestão mostra o pedido aberto e os movimentos de campo com o canal (celular, bancada).
- Relatório de estoque: nada muda nas regras de `shared/tagMetrics.ts`; uma peça com pedido aberto continua contada com quem a segura.

### 7.4 Fonte e desenho da peça

- Carregar **Inria Serif** (já usada na impressão, `docs/PRINT_EXECUTION_PLAN.md` §params) pelo Google Fonts e expor como `--font-code`. `CODE_HEADING`, `CODE_HEADING_TOPBAR`, `LIST_CODE` e `LIST_SUBCODE` em `client/src/components/xpot/TagProductThumbnail.tsx` passam a usá-la. Códigos no painel e no app ficam iguais à plaquinha.
- O desenho (`TagProductThumbnail`) passa a ter um layout por modelo: placa quadrada (`*_plate`), placa de mesa (`*_stand`) e cavalete (`*_sign`), reproduzindo a arte impressa de cada um (posição do NFC, do QR, do ícone e do código). Depende de uma foto frontal ou do arquivo da arte de cada modelo; sem isso, o desenho atual continua.

---

## 8. Fases de execução

### Fase 0 — Regras e acesso

- `shared/tagCustody.ts` com as funções de §5 e testes unitários.
- `pieceAccess` no servidor: `lookup/:code` e `GET /:id` devolvem a visão limitada e as `actions`.
- Tela limitada no app, ainda só informativa (com quem está).

### Fase 1 — Receber, devolver, apagar, voltar

- `POST /:id/receive` reaproveitando o núcleo de `scanTagIntoBatch` (extrair a parte transacional para uma função com `tx`).
- `POST /:id/return-to-house` reaproveitando `setTagRep`.
- `POST /:id/nfc-erased` e `eraseChip` em `client/src/pages/tags/webNfc.ts` (registro NDEF vazio).
- Botões Receber, Devolver à casa e Apagar chip na tela da peça e na tela Direto.
- Seta de voltar sempre presente; Voltar na folha de gravação em erro.
- Entregável: o dono testa e recebe peças pelo celular; o revendedor recebe no próprio estoque e devolve.

### Fase 2 — Pedidos de transferência

- Migração `tag_transfer_requests`, rotas de §6, push para a outra ponta, expiração por tarefa agendada (ou na leitura: um pedido vencido é marcado `expired` quando alguém o consulta).
- Pedir esta peça, Passar para..., Confirmar recebimento, cartão Pedidos em Minhas peças.
- Bloqueios cruzados: venda, configuração, Entregar e Recolher recusam peça com pedido aberto.

### Fase 3 — Gestão e histórico

- Gestão › Distribuição › Transferências com Forçar e Cancelar.
- Pedido aberto e canal dos movimentos na seção de gestão da peça.
- Linhas do journey e do MCP (`tags_journey_get` mostra pedidos e recebimentos de campo).

### Fase 4 — Fonte e desenho

- Inria Serif nos códigos.
- Layout por modelo no desenho da peça, a partir das artes.

Fases 1 e 4 não dependem uma da outra e podem andar em paralelo. A fase 2 depende da 0 e da 1.

---

## 9. Plano de testes

### Unitários (`tests/tags/tagCustody.test.ts`)

- `receiveTargets`: pendente na própria organização dá `me`; gestor em modo gestão dá `house, me`; lote fechado, outra organização ou peça já recebida dão vazio.
- `returnToHouseBlocker`: vendida, configurada, `internal_use`, com pedido aberto, de outra pessoa.
- `transferRequestBlocker`: pendente, já sua, com pedido aberto, outra organização.
- `requestResolution`: aceitar com leitura fecha; sem leitura espera; `confirm_read` fecha aceito; recusar e cancelar por quem pode; forçar só gestor.
- `pieceAccess`: `full`, `limited`, `none` nos casos de hoje mais os novos.

### Integração

- Receber no celular: pendente vira `available` com `intake` referenciando o lote; `me` e `house`; repetido é idempotente; lote fechado recusa; revendedor de outra organização recusa.
- Gravar, verificar, travar e apagar chip não mudam `rep_id`, `custodian_rep_id` nem `stock_status` (regressão de §2.1).
- Apagar chip travado recusa; apagar volta a `not_programmed` e registra journey.
- Devolver à casa: `return`, `rep_id` nulo; recusa vendida, configurada, de outra pessoa.
- Pedido completo nos dois sentidos (§3.5 e §3.6), recusa, cancelamento, expiração, forçar por gestor, pedido à casa aprovado por gestor.
- Um pedido aberto por peça; venda e Entregar recusam com pedido aberto.
- Guards: revendedor não força, não recebe na casa, não vê pedidos de outra organização.
- `lookup/:code` limitado não vaza cliente, destino nem venda.

### Tela

- `pieceScreen.integration.test.ts`: cabeçalho com Receber para gestor e revendedor; tela limitada; Devolver à casa bloqueado com motivo; Apagar chip escondido em chip travado.

---

## 10. Em aberto

- **Custo ao pedir da casa:** o pedido aprovado transfere sem custo. Se o gestor quiser cobrar, usa Entregar. Decidir depois se Transferências ganha um campo de custo opcional.
- **Expiração:** 7 dias é chute. Ajustar depois de uso.
- **Arte das peças:** a fase 4 depende das fotos ou arquivos de arte de cada modelo.
- **Tela de gravação:** confirmar com o Vanildo qual tela ficou sem voltar (a folha de gravação ou a peça aberta por toque) antes de fechar §7.1.
