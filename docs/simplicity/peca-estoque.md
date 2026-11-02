# Auditoria visual: peça e estoque

Área `PE`. Rodada r0. Perfis: platform (Marcus), partner (Daniela), owner (Priya), owner-multi (Tomas), rep-both (Jessica), reseller (Kevin).

Olhei as imagens, salvo onde está escrito "no código". A causa e o arquivo vêm do código, só leitura. Linhas referem-se ao commit `44d2935`.

Como olhei: telas altas viraram folhas de contato ou recortes, então nem toda captura foi vista até o fim. Vistas inteiras: `piece-page-technical-details`, `piece-page-soldLive`, `piece-page-pendingOldPrint` e `piece-popup-soldNotLive` phone. Das outras `piece-page-*` desktop vi os primeiros 1400 px; das `piece-popup-*` phone, os primeiros 1100 px; do `panel-stock`, o começo e o fim.

## O resumo em quatro frases

1. A mesma peça muda de nome conforme a tela. A 7N7FKFSN é "With a reseller", "In stock" e "No customer yet" (tabela abaixo).
2. O popup melhorou, mas as duas ações principais dele abrem cortadas: "Set up" e "Write chip" (PE-1).
3. Peça vendida que não funciona parece igual a peça vendida que funciona (PE-2). É o pior erro de leitura da área, porque o cliente pagou.
4. O vermelho do estoque não quer dizer nada: cerca de 107 de 112 linhas têm "Chip not written" em vermelho, e as 7 que importam ficam iguais às outras (PE-12).

## A mesma peça em cada superfície

| Peça | Estoque, linha | Popup e tela do revendedor, cabeçalho | "More details" | My pieces | Gestão da página cheia |
|---|---|---|---|---|---|
| 7N7FKFSN (com Jessica, sem cliente) | **With a reseller**, Jessica | **In stock**, With Jessica Alvarez, No customer yet | Digital: No customer yet. Physical stock: **In stock** | **No customer yet** | Held by Jessica. Owned by The reseller (bought) |
| 193J8BAB (no ar, cliente Fenway) | With a reseller · Live | Live, With Jessica Alvarez, Fenway | Digital: Live. Physical stock: **In stock** (85 scans, já no cliente) | Live | Held by Jessica. Owned by The reseller (bought) |
| 0XBAXB57 (vendida, no ar) | **Sold · Live** | **Sold** (não diz que está no ar). Sem linha de localização | Digital: Live. Physical stock: Sold. Chip: Locked. **Sold** de novo | Live + Sold | **Held by Jessica**. Owned by The customer |
| 013VW8NC (vendida, fora do ar, chip não gravado) | **Sold** | **Sold** (igual à de cima) | Digital: Ready, not live. Physical stock: Sold. Chip: Not written. Sold | **Ready, not live + Sold + Chip not written** | Held by Priya. Owned by The customer |
| TCJABA93 (falha ao gravar, cliente Seaport) | In company stock, Write failed | Ready, **chip not written yet** | Chip: **Write failed** | não aparece | Fila "Chips to write" |
| 4BTPFWJR (não entrou) | Not in stock yet, Reseller: **Company stock** | Not in stock yet, "Did this piece arrive?" | Physical stock: Not in stock yet | não aparece | **Held by Company stock** |
| VZGM3T1V (perdida) | Lost, Reseller: **Company stock** | Lost, sem localização | Physical stock: Lost | não aparece | **Held by Company stock** |
| BR1AESKH (desativada) | Deactivated, Reseller: Company stock | Deactivated, sem localização | Physical stock: **In stock** | não aparece | Held by Company stock |

## Notas por tela

Nota de 0 a 10: quanto uma pessoa sem treino usa a tela de primeira.

| Tela | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| `panel-stock` desktop, platform (8268 px) | Saber onde cada peça está | 3 | PE-4, 12, 13, 14, 15, 24, 43 |
| `panel-stock` desktop, owner, partner, owner-multi | Idem | 4 | PE-4, 12, 14, 15, 24, 54 |
| `panel-stock` phone, todos (16176 px em platform) | Achar uma peça | 3 | PE-12, 13, 30 |
| `stock-where-*` desktop e phone, com resultado | Ver um grupo | 5 | PE-4, 12, 24, 26 |
| `stock-where-*`, sem resultado | Entender que não há nada | 5 | PE-38 |
| `stock-more-filters-open` desktop e phone | Filtrar por revendedor ou cliente | 4 | PE-15, 25, 37 |
| `stock-rep-house`, `stock-rep-jessica`, `stock-org-harbor`, `stock-product-large-stand`, `stock-method-nfc`, `stock-search` | Ver o filtro aplicado | 4 | PE-4, 25, 37 |
| `stock-empty-result` | Corrigir a busca | 5 | PE-38 |
| `stock-new-piece-dialog` desktop e phone | Criar peça avulsa | 5 | PE-36 |
| `piece-popup-*` no ar e prontas (live, houseLive, harborLive, configuredChip, paused) | Saber se funciona | 7 | PE-3, 19, 34 |
| `piece-popup-configuredNoChip`, `houseConfigured` | Gravar o chip | 6 | PE-1, 19, 34 |
| `piece-popup-houseAvailable`, `houseSupplierReceived`, `kitUnconfigured`, `withReseller` | Configurar | 5 | PE-1, 3 |
| `piece-popup-soldLive` | Saber que vendeu e funciona | 5 | PE-2, 9 |
| `piece-popup-soldNotLive` | Fazer funcionar | 2 | PE-2, 9 |
| `piece-popup-damaged`, `lost`, `retired`, `reserved`, `internalUse` | Saber o que aconteceu | 3 | PE-17 |
| `piece-popup-pendingBuilding`, `pendingPrinting`, `pendingReady`, `pendingRequested` | Saber quando entra | 7 | PE-18 (fases iguais) |
| `piece-popup-pendingCancelled`, `pendingFailed`, `pendingOldPrint` | Saber que a impressão deu errado | 3 | PE-18 |
| `piece-popup-pendingSupplier` | Confirmar que chegou | 8 | "It's with me" é vago para quem está no escritório |
| `piece-popup-more-details` | Ver o resto | 4 | PE-23, 33 |
| `piece-popup-set-up-editor` desktop | Configurar | 1 | PE-1, 35 |
| `piece-popup-write-chip` desktop | Gravar | 1 | PE-1 |
| `piece-popup-write-chip` phone | Gravar | 1 | PE-6 |
| `piece-popup-*` phone e `piece-page-*` phone (mesma tela, 3300 a 4500 px) | O próximo passo | 2 | PE-5, 6, 23, 30, 32 |
| `piece-page-*` desktop | Trabalhar na peça | 4 | PE-5, 22, 23, 32, 33, 39, 40 |
| `piece-page-technical-details` | Copiar os links | 5 | PE-23, 39 |
| `piece-page-set-up-editor` desktop e phone | Configurar | 6 | PE-35 |
| `piece-popup-brightside-*` owner | Idem, dono | 5 | PE-2, 3, 9, 53 |
| `piece-popup-harbor-*` partner | Idem, parceiro | 5 | PE-1, 3, 53 |
| `piece-popup-company-piece-denied` partner | Entender a recusa | 4 | PE-27 |
| `piece-popup-lindgren-any` owner-multi | Gravar o chip | 6 | PE-1, 34 |
| `tags-piece-*` reseller e rep-both (tela do revendedor) | Próximo passo | 7 | PE-2, 9, 16, 34 |
| `tags-piece-*` platform, owner, owner-multi | Idem, gestor | 7 | PE-2, 9, 16 |
| `tags-piece-not-mine` phone | Ler outra peça | 8 | Nada grave |
| `tags-piece-not-mine`, `tags-piece-unknown` desktop | Ler outra peça | 6 | PE-51 |
| `tags-pieces` reseller, rep-both, owner, owner-multi | Ver o que falta | 6 | PE-28, 42, 49 |
| `tags-pieces` platform, partner (vazio) | Ir para o estoque | 3 | PE-11 |
| `tags-pieces-search` | Achar uma peça | 7 | PE-42 |
| `panel-tags-overview` | Saber o uso das peças | 4 | PE-29, 31, 41 |
| `panel-tags-overview-chipPending` desktop | Gravar o que falta | 4 | PE-8, 20 |
| `panel-tags-overview-chipPending` phone | Idem | 3 | PE-8, 20, 21 |
| `panel-tags-overview-scannedNotLive` | Resolver peça lida e fora do ar | 3 | PE-7, 20 |
| `panel-tags-overview-noProduct` | Corrigir ou ver que está limpo | 6 | PE-38 |

---

## S1

### PE-1 [S1] "Set up" e "Write chip" abrem cortados dentro do popup
Telas: platform/en-desktop/piece-popup-set-up-editor, platform/en-desktop/piece-popup-write-chip. O mesmo componente vale para owner, partner e owner-multi, que têm o mesmo botão.
Problema: "Set up this piece" termina em y=628, no meio das abas "Link, Email, Phone, Contact". Não aparecem o campo de destino nem "Save destination". Em "Write chip", "Mark as written" fica colado no topo e o fundo escurece só até y=327, numa linha reta. Abaixo dela tudo segue nítido e clicável: "Expires Nov 2, 2026", "Cancel the write", "Sell this piece". São as duas ações principais do popup e parecem quebradas.
Mudança: renderizar `BottomSheet` em portal no `document.body`. Assim ele usa a tela inteira, como já acontece na página cheia (`piece-page-set-up-editor` está correta). Remover o comentário "Sheets are not portals" e a abertura forçada do "More details" que existe só por causa disso.
Arquivos: client/src/pages/tags/ui.tsx:583 (`fixed` sem portal), client/src/components/xpot/MasterDetail.tsx:96 (`-translate-x-1/2 -translate-y-1/2` no popup: a transformação faz o `fixed` do filho se medir pelo popup, não pela tela), client/src/components/piece/PieceBody.tsx:41-46.
Risco: nenhuma regra. Testar foco e tecla Esc com dois níveis abertos.

### PE-2 [S1] Peça vendida que não funciona parece igual à que funciona
Telas: platform/en-desktop/piece-popup-soldNotLive, piece-popup-soldLive; owner/en-phone/tags-piece-sold-not-live; platform/en-phone/tags-piece-soldNotLive.
Problema: 013VW8NC foi paga ("Sold for $45.00", "Paid"), está fora do ar e com "Chip not written". O popup mostra só "Sold", igual à 0XBAXB57, que está no ar. Não há botão principal. "Put live" é um botão pequeno dentro do card. A lista do estoque distingue "Sold" de "Sold · Live", mas ninguém entende "Sold" sozinho como "está parada". O cliente pagou e a peça não abre nada, sem nenhum aviso.
Mudança: em `pieceSituation`, peça vendida segue a mesma ordem das outras:
- no ar: pill "Sold · Live" / "Vendida · No ar" / "Vendida · Activa", ação "See performance";
- fora do ar: pill âmbar "Sold, not live" / "Vendida, fora do ar" / "Vendida, sin activar", ação principal "Write chip" se o chip falta, senão "Put live";
- linha abaixo da pill: "The customer paid, but this piece isn't live yet." / "O cliente pagou, mas esta peça ainda não está no ar." / "El cliente pagó, pero esta pieza todavía no está activa."
A linha do estoque passa a usar os mesmos dois textos.
Arquivos: client/src/components/piece/pieceView.ts:103, client/src/i18n/messages/pieceScreen.ts:106, client/src/pages/admin/tags/labels.ts:60, tests/piece-view.test.ts.
Risco: nenhuma regra de negócio, só a escolha do que mostrar.

### PE-3 [S1] A mesma peça é "With a reseller", "In stock" e "No customer yet"
Telas: owner/en-desktop/panel-stock e piece-popup-brightside-kit; rep-both/en-phone/tags-pieces e tags-piece-in-kit; partner/en-desktop/piece-popup-harbor-kit; platform/en-desktop/piece-popup-more-details.
Problema: ver a tabela do início. 7N7FKFSN é "With a reseller" na linha que a pessoa clicou e, ao abrir, "In stock" ao lado de "With Jessica Alvarez". Para o dono, "in stock" quer dizer "está comigo". Pior: 193J8BAB, no ar na parede do cliente com 85 scans, aparece como "Physical stock: In stock".
Mudança: a pill "In stock" sai da peça. `situation_inStock` passa a dizer "No customer yet" / "Sem cliente" / "Sin cliente", o termo já fixado no glossário. A localização continua na linha de baixo ("With Jessica Alvarez" ou "Company stock"). Com a pill dizendo isso, a linha "No customer yet" sai do cabeçalho. O rótulo "Physical stock" sai junto (PE-23).
Arquivos: client/src/i18n/messages/pieceScreen.ts:115, client/src/components/piece/PieceHeader.tsx:101, client/src/components/piece/pieceView.ts:128.
Risco: nenhum. Peça com fornecedor ou impressão continua com "Not in stock yet".

### PE-4 [S1] "Not in stock yet" e "Company stock" na mesma linha, e o filtro conta 76 onde o chip conta 19
Telas: platform/en-desktop/panel-stock, stock-where-notReceived, stock-where-lost, stock-where-damaged, stock-rep-house; partner/en-desktop/stock-where-notReceived; platform/en-phone/panel-stock; platform/en-desktop/piece-page-pendingSupplier, piece-page-lost.
Problema: a coluna Where diz "Not in stock yet" e a coluna Reseller, na mesma linha, diz "Company stock". São 58 linhas assim em platform. O mesmo vale para "Lost", "Damaged" e "Deactivated": peça perdida "no estoque da empresa". No filtro "Company stock" aparecem 76 resultados, com o chip "In company stock 19" logo acima. Na página, "Held by: Company stock" para peça que ainda não existe. A causa é uma só: "não tem revendedor" está escrito como "está no estoque".
Mudança: na coluna Reseller, sem revendedor mostra "—" (a coluna Where já diz o resto). Vale também para o card do celular. A opção do filtro passa de "Company stock" para "No reseller" / "Sem revendedor" / "Sin revendedor". Na gestão, a linha "Held by" só aparece quando `pieceHasLocation` for verdadeiro.
Arquivos: client/src/pages/admin/tags/piece-table.tsx:109,128,207; client/src/i18n/messages/manageTagsPieces.ts:17; client/src/components/piece/ManagementSection.tsx:58,90.
Risco: nenhuma regra. Só texto e exibição.

### PE-5 [S1] Botão forte para gravar chip em peça perdida, não impressa ou que nem existe; texto errado em peça danificada
Telas: platform/pt-desktop/piece-page-lost, platform/es-desktop/piece-page-lost, platform/en-desktop/piece-page-pendingOldPrint, piece-page-pendingSupplier; platform/en-phone/piece-popup-pendingRequested, piece-popup-lost, piece-popup-damaged, piece-popup-houseAvailable.
Problema: VZGM3T1V está "Lost" e mostra os botões de gravar e de enviar ao gravador em roxo forte ("Gravar chip", "Enviar ao gravador" em pt). 110HCN7X nem foi impressa e mostra "Write chip" igual. No celular, as duas trazem o passo a passo do NFC Tools. Em 9PJ2DDM9 e 7N7FKFSN, sem cliente, fica aberto um "Waiting for the chip to be read…" com animação, sem ninguém gravando. VN2GMKWM está "Damaged", e a tela diz "Deactivated pieces cannot be written": está errado.
Mudança: chip só aparece como ação se a peça estiver em estoque ou configurada. Para `lost`, `pending`, `damaged` e desativada, a seção mostra só a linha "Chip not written", sem botão, sem gravador e sem passos. Isso também elimina a frase errada.
Arquivos: client/src/components/piece/ChipSection.tsx:47,100; client/src/pages/admin/tags/PieceDetail.tsx:97; client/src/i18n/messages/manageTagsPieces.ts:141.
Risco: **depende do dono** num caso: gravar chip de peça do fornecedor antes de dar entrada. Recomendo bloquear na tela: a entrada leva um toque ("It's in company stock"). Não verifiquei se o servidor recusa; a mudança é só de tela.

### PE-6 [S1] No celular do gestor, "Write chip" não faz nada visível, e a peça tem 4500 px
Telas: platform/en-phone/piece-popup-write-chip, piece-popup-configuredNoChip, piece-popup-soldNotLive, piece-page-*; owner/en-phone/piece-popup-brightside-kit; partner/en-phone/piece-popup-harbor-live.
Problema: depois de tocar "Write chip", a tela é a mesma de antes (B890X9SR, mesmo cabeçalho, mesmo botão). No iPhone os passos ficam 800 px abaixo e nada rola até lá. A causa é maior: o revendedor no celular recebeu o "More details" fechado, e o gestor no celular recebeu tudo aberto, de 3299 a 4579 px.
Mudança: uma linha: `layout={onClose || !isDesktop ? "stack" : "columns"}`. O celular do gestor passa a abrir como o do revendedor, e `reveal(chipRef)` rola até o chip. Depois, na condição de `ChipSection`, os passos só aparecem ao tocar: `manualFlow && manualOpen`, abrindo também quando a URL traz `?write=1`.
Arquivos: client/src/pages/admin/tags/PieceDetail.tsx:91; client/src/components/piece/PieceBody.tsx:74; client/src/components/piece/ChipSection.tsx:62-69,100.
Risco: nenhuma regra. Ajustar testes que esperam os passos abertos.

### PE-7 [S1] "Someone scanned these pieces" e a coluna "Last scan" vazia em todas
Telas: platform/en-desktop/panel-tags-overview-scannedNotLive, owner/en-desktop/panel-tags-overview-scannedNotLive; platform/en-phone/panel-tags-overview-scannedNotLive.
Problema: o texto diz "Someone scanned these pieces in the last 7 days, but they aren't live". As 4 linhas mostram "Last scan: —", e no estoque essas peças mostram "0 / 0". Parece erro do sistema. No celular nem há data. A fila também não diz o que fazer.
Mudança: a coluna passa a mostrar a data do evento que colocou a peça na fila, inclusive no card do celular. Novo texto: "Scanned in the last 7 days, but not live. Set them up or put them live." / "Lidas nos últimos 7 dias, mas fora do ar. Configure ou coloque no ar." / "Leídas en los últimos 7 días, pero sin activar. Configúralas o actívalas."
Arquivos: server/tags/queues.ts:14-20 (a fila conta `inventory_scan`, a coluna mostra outro campo), client/src/pages/admin/tags/OverviewTab.tsx:209, client/src/i18n/messages/adminTagsFlow.ts:131.
Risco: é preciso expor a data desse evento na lista. Sem regra de negócio.

### PE-8 [S1] A fila "Chips to write" lista um chip que diz "Chip written"
Telas: platform/en-desktop/panel-tags-overview-chipPending, owner/en-desktop/panel-tags-overview-chipPending.
Problema: C5BC2H74 está na fila com "Chip written", e tem 21 leituras NFC. O título manda escrever o que a linha diz que já foi escrito. O motivo aparece só no texto pequeno: "isn't written and checked".
Mudança: `chip_programmed` passa a "Written, not tested" / "Gravado, falta testar" / "Grabado, falta probar". Título: "Chips to write or test" / "Chips para gravar ou testar" / "Chips por grabar o probar". Texto: "Pieces with a customer whose chip is missing or was never tested on a phone." / "Peças com cliente cujo chip falta ou nunca foi testado num celular." / "Piezas con cliente cuyo chip falta o nunca se probó en un teléfono."
Arquivos: client/src/i18n/messages/tags.ts:135; client/src/i18n/messages/adminTagsFlow.ts:128-129.
Risco: **pergunta ao dono**: peça com leitura NFC real deveria virar "verificada" sozinha? O popup diz "A real phone NFC scan reached this piece" como etapa. Recomendo sim. Pode ser efeito do seed, que criou leituras sem marcar o chip; confirmar antes de mudar a regra. O mesmo vale para F3G1VTJK, com 2 leituras NFC e "Chip not written".

### PE-9 [S1] "Change customer" ao lado de "Sold pieces keep their customer"
Telas: platform/en-desktop/piece-popup-soldLive, piece-popup-soldNotLive; owner/en-desktop/piece-popup-brightside-sold; rep-both/en-phone/tags-piece-sold-live; platform/en-phone/tags-piece-soldNotLive.
Problema: o botão "Change customer" e, abaixo, "Sold pieces keep their customer: the sale would have to be cancelled first." Na mesma caixa, um manda e o outro proíbe.
Mudança: com venda registrada, "Change customer" sai (o lápis que corrige o nome fica). A frase vira: "To change the customer, cancel the sale first." / "Para trocar o cliente, cancele a venda primeiro." / "Para cambiar el cliente, cancela primero la venta."
Arquivos: client/src/components/piece/CustomerDestinationSection.tsx:281,356; client/src/i18n/messages/manageTagsPieces.ts:73.
Risco: **depende do dono**. Se trocar o cliente de peça vendida for permitido, a frase é que está errada. Recomendo manter a regra da frase. No código, só vi bloqueio quando a peça está no ar (`blockedByLive`, linha 122), então o servidor precisa ser conferido.

### PE-10 [S1] Peça desativada, sem cliente, manda "Remove the customer first"
Telas: platform/en-desktop/piece-page-retired; platform/en-phone/piece-popup-retired.
Problema: BR1AESKH não tem cliente ("No destination yet") e o texto diz "Remove the customer first to transfer this piece." A instrução é impossível de seguir.
Mudança: testar desativada antes: "Deactivated pieces can't be transferred." / "Peças desativadas não podem ser transferidas." / "Las piezas desactivadas no se pueden transferir."
Arquivos: client/src/components/piece/ManagementSection.tsx:175-177; client/src/i18n/messages/manageTagsPieces.ts:105-107.
Risco: nenhum.

---

## S2

### PE-11 [S2] O sistema manda o dono falar com o gestor
Telas: platform/en-desktop/tags-pieces, partner/en-desktop/tags-pieces, os dois em phone; platform/en-desktop/piece-page-pendingSupplier, piece-page-lost; platform/en-phone/piece-popup-damaged.
Problema: Marcus e Daniela leem "No pieces here yet. Ask your manager for pieces." Eles são o gestor. Em peça não recebida: "Ask your manager to scan it into its batch", logo abaixo de "Did this piece arrive?". "Scan into its batch" nem é mais o caminho.
Mudança: quem gerencia não lê essa parte. `stockBlocked_*` termina na primeira frase. My pieces vazia, para gestor: "No pieces with you. The company's pieces are in Stock." / "Nenhuma peça com você. As peças da empresa estão em Estoque." / "Ninguna pieza contigo. Las piezas de la empresa están en Stock.", com botão "Open Stock" / "Abrir estoque" / "Abrir stock". Para o revendedor, trocar "scan it into its batch" por "Ask your manager about this piece." (texto já existente, `hintAskManager`).
Arquivos: client/src/i18n/messages/tags.ts:117,130-132; client/src/pages/tags/PiecesScreen.tsx; client/src/components/piece/SaleSection.tsx:125; client/src/components/piece/CustomerDestinationSection.tsx:319.
Risco: `viewer.canManage` só vale para o admin global (shared/modules.ts:11). Para cobrir dono e parceiro, a condição precisa usar o papel na organização. Ver PE-53.

### PE-12 [S2] Vermelho em quase toda linha: "Chip not written" não é problema na maioria delas
Telas: platform/en-desktop/panel-stock (cerca de 107 de 112 linhas, contagem por cor), partner/en-desktop/panel-stock (16 de 16), owner/en-desktop/panel-stock (10 de 15), stock-where-*; todos em phone no texto do card.
Problema: peça não impressa, na caixa, sem cliente, ainda não precisa de chip. Mesmo assim tem pill vermelha. A pessoa aprende a ignorar o vermelho, e as peças que precisam mesmo (fila com 7, em platform) ficam iguais. "Write failed" também é vermelho e não se distingue. A palavra "Chip" ainda se repete: coluna CHIP, valor "Chip not written".
Mudança: a coluna usa a regra que já existe e que My pieces já usa, `chipNeedsWriting`:
- não precisa ainda: célula vazia ("—");
- precisa: âmbar, "Not written" / "Não gravado" / "Sin grabar";
- falhou: vermelho, "Write failed";
- gravado sem teste: âmbar, "Not tested" / "Falta testar" / "Falta probar";
- verificado e travado: texto discreto, sem pill.
Em platform, sobram cerca de 7 pills em 112 linhas. O card do celular só cita o chip quando precisa.
Arquivos: client/src/pages/admin/tags/piece-table.tsx:133,228; shared/tagApp.ts:235; client/src/components/xpot/StatusPill.tsx:86-92 (não mudar o mapa global, usar um local da lista); client/src/i18n/messages/manageTagsPieces.ts:26.
Risco: nenhum.

### PE-13 [S2] Mais da metade do estoque são peças que ainda não entraram, em 8268 px
Telas: platform/en-desktop/panel-stock, stock-search (5911 px), stock-rep-house (5813 px), stock-where-notReceived (4458 px); platform/en-phone/panel-stock (16176 px), stock-where-notReceived (9546 px); partner/en-desktop/panel-stock, partner/en-phone/panel-stock.
Problema: 58 das 112 linhas são peças "Not in stock yet", medidas por cor, em 5 blocos pelo lote: 4, 8, 26, 12 e 8 linhas. Todas iguais: "—", "0 / 0", "—". Em platform e partner, a lista abre com 4 delas. Cada linha tem cerca de 70 px por causa do código em cima e de "PLATE L #1" embaixo. O cabeçalho e os filtros somem ao rolar. O total só aparece no fim: "112 loaded". 112 peças é pouco: o problema não é o volume, é o que entra na lista e a altura.
Mudança:
1. Sem filtro, a lista não traz "Not in stock yet". Elas ficam a um toque, no chip com o número. Com isso, 54 linhas em platform.
2. Linha de uma altura só, 48 px: figura, código e modelo na mesma linha, sem "#1". São cerca de 2900 px em platform.
3. Filtros e cabeçalho da tabela grudados ao rolar (`sticky`).
4. Total no topo: "54 pieces" no lugar de "112 loaded", que é termo técnico.
Arquivos: client/src/pages/admin/tags/PiecesTab.tsx:30-37, 183-195; client/src/pages/admin/tags/where-model.ts; client/src/components/xpot/pagination.tsx:139; client/src/pages/admin/tags/piece-table.tsx:183-197.
Risco: **depende do dono**: esconder por padrão pode surpreender quem procura a peça. Recomendo esconder: o chip mostra "58", e a busca por código continua achando qualquer peça (a busca precisa ignorar esse padrão).

### PE-15 [S2] "Company" quer dizer duas coisas opostas na mesma tela
Telas: todas `panel-stock` e `stock-where-*`; stock-more-filters-open; tags-pieces; piece-popup-*.
Problema: "In company stock" e "Company stock" são a dona das peças. Coluna "COMPANY", "All companies" e "Search code, company, label" são o cliente. Em platform, "All companies" fica ao lado de "All organizations". Ao abrir a peça, a mesma coisa vira "Customer": "No customer yet", "Customer and destination", "Change customer". No menu, Kevin tem "Customers" e Priya tem "Companies", para a mesma lista. Na tabela do estoque, a linha X2ED2GA4 tem "Company stock" e "Company: Harbor Light Nails".
Mudança: "Company stock" fica, por ser decisão do glossário. O cliente é sempre "Customer" / "Cliente" / "Cliente": coluna, filtro "All customers" / "Todos os clientes" / "Todos los clientes", busca "Search code, customer, label or batch" / "Buscar código, cliente, rótulo ou lote" / "Buscar código, cliente, etiqueta o lote". Em My pieces, idem.
Arquivos: client/src/i18n/messages/manageTags.ts:85,160; client/src/i18n/messages/manageTagsPieces.ts:10,13; client/src/i18n/messages/tags.ts:111,461.
Risco: **depende do dono**: o glossário fala em "business/empresa" para o cliente. Recomendo "Customer" nas telas de peça, porque a própria peça já fala assim. Alinhar com RCP-23.

### PE-16 [S2] Kevin vê "With Kevin Brooks" na própria peça, e peça no cliente aparece "com" o revendedor
Telas: reseller/en-phone/tags-piece-in-kit, tags-piece-live, tags-piece-configured-no-chip; reseller/pt-desktop/tags-piece-live ("Com Kevin Brooks"); reseller/es-desktop/tags-piece-in-kit ("Con Kevin Brooks"); rep-both/en-phone/tags-piece-live; owner/en-phone/tags-piece-in-kit ("With Priya Nair"); owner-multi/en-phone/tags-piece-in-kit ("With Tomas Lindgren"); owner/en-desktop/tags-piece-in-kit.
Problema: ninguém diz o próprio nome para falar de si. Em T339MPEV, no ar em Malden Hardware, "With Kevin Brooks" ainda é falso: a peça está no balcão do cliente.
Mudança: em `PieceFacts`, comparar com `viewer.repId` (já disponível em `usePiece`):
- sem cliente, do próprio: "With you · Kit K-0003", com o texto já existente `statInStock`: "With you" / "Com você" / "Contigo";
- sem cliente, de outro: "With Jessica Alvarez", como hoje;
- com cliente, do próprio: esconder a linha, porque a linha do cliente já responde onde está;
- com cliente, de outro: "Reseller: Jessica Alvarez" / "Revendedor: Jessica Alvarez" / "Revendedor: Jessica Alvarez".
Arquivos: client/src/components/piece/PieceHeader.tsx:79-90; client/src/i18n/messages/pieceScreen.ts:19; client/src/i18n/messages/tags.ts:67.
Risco: nenhum. É o mesmo achado de RCP-13: fazer uma vez só. "With me" do glossário continua para o botão de escolha.

### PE-17 [S2] Lost, Damaged, Deactivated, Reserved e Internal use são becos sem saída
Telas: platform/en-desktop/piece-popup-lost, piece-popup-damaged, piece-popup-retired, piece-popup-reserved, piece-popup-internalUse; platform/en-phone das mesmas.
Problema: o popup mostra a pill e "More details". Nada diz quando foi, quem marcou, por quê, ou o que fazer. Em Reserved não se sabe para quem. Em Reserved e Internal use, o popup não mostra ação nenhuma, mas no celular a mesma peça tem "Set up this piece" em destaque: no popup, o botão fica escondido dentro do "More details" fechado.
Mudança: uma linha abaixo da pill, com o último movimento: "Marked lost on Oct 3 by Marcus Reed" / "Marcada como perdida em 3 de out. por Marcus Reed" / "Marcada como perdida el 3 de oct. por Marcus Reed". O motivo, se houver, vem na linha seguinte. Em Reserved e Internal use, decidir uma coisa só: recomendo ação principal "Set up" nos dois lugares, porque a página já oferece. Em Lost e Damaged, trazer para o popup a ação de desfazer que está em "More actions", se ela existir para o estado (não abri esse menu nas capturas).
Arquivos: client/src/components/piece/pieceView.ts:100-102,128-129; client/src/components/piece/PieceBody.tsx:93; client/src/components/piece/PieceHeader.tsx; client/src/components/piece/ManagementSection.tsx.
Risco: a linha exige trazer o último movimento para o revendedor, ou mostrar só para gestão. Recomendo só para gestão.

### PE-18 [S2] Impressão cancelada ou com falha aparece igual a qualquer outra
Telas: platform/en-desktop/piece-popup-pendingCancelled, piece-popup-pendingFailed, piece-popup-pendingOldPrint; os mesmos em phone; piece-page-pendingOldPrint.
Problema: "Not in stock yet" e "Go to printing", sem uma palavra sobre o que houve. A pessoa só descobre ao abrir a impressão. As outras quatro fases ("Waiting to print") também são idênticas entre si, mas ali não atrapalha.
Mudança: `printJobStatus` já vem na peça. Falha: pill vermelha "Print failed" / "Falha na impressão" / "Falló la impresión", com "Open the print to redo it." / "Abra a impressão para refazer." / "Abre la impresión para repetirla." Cancelada: pill cinza "Print cancelled" / "Impressão cancelada" / "Impresión cancelada", com "This print was cancelled, so this piece won't arrive." / "Esta impressão foi cancelada, então esta peça não vai chegar." / "Esta impresión se canceló, así que esta pieza no llegará."
Arquivos: client/src/components/piece/pieceView.ts:105-113; client/src/i18n/messages/pieceScreen.ts:107-109; shared/tagsApi.ts:99.
Risco: nenhum. Confirmar no banco o nome exato dos status.

### PE-19 [S2] Peça no ar sem chip não avisa, e "Write failed" vira "not written yet"
Telas: platform/en-desktop/piece-popup-harborLive, piece-popup-houseLive; partner/en-desktop/piece-popup-harbor-live; platform/en-desktop/piece-popup-houseConfigured e platform/en-phone/piece-popup-houseConfigured.
Problema: F3G1VTJK e X2ED2GA4 estão no ar com chip não gravado. O popup diz "Live", botão "See performance", sem nada sobre o chip: encostar o celular não abre nada. O aviso só aparece em "More details". TCJABA93 mostra "Ready, chip not written yet", mas o chip é "Write failed": o cabeçalho esconde que alguém tentou e deu errado.
Mudança: no ar com `chipNeedsWriting`: pill verde "Live", linha âmbar "QR works. The chip isn't written yet." / "O QR funciona. O chip ainda não foi gravado." / "El QR funciona. El chip aún no está grabado.", ação principal "Write chip". Falha: pill "Chip write failed" / "Falha ao gravar o chip" / "Falló la grabación del chip", ação "Try again" / "Tentar de novo" / "Reintentar".
Arquivos: client/src/components/piece/pieceView.ts:120,124; client/src/i18n/messages/pieceScreen.ts:113.
Risco: nenhum. Peça só com QR e sem NFC por escolha do cliente, se existir, precisaria ficar de fora; não vi esse caso nas capturas.

### PE-20 [S2] Da fila, "voltar" leva para onde a fila não está
Telas: panel-tags-overview-* em todos os perfis, desktop e phone; piece-page-*.
Problema: a fila vem de "Today" (no código). O link de volta diz "Overview" e leva a "Pieces results", tela que não lista filas. O nome também não bate: lá em cima está "Pieces results", aqui "Overview". E ao abrir uma peça da fila, ela sai como página cheia, com o link "Stock": depois de resolver a peça, a pessoa cai no estoque e perde a fila. Para resolver 7 chips, refaz o caminho 7 vezes.
Mudança: voltar da fila vai para "Today" ("Today" / "Hoje" / "Hoy"). No computador, a peça da fila abre no mesmo popup do estoque (`?piece=`), sem sair da fila. No celular, o link de volta da peça respeita de onde veio.
Arquivos: client/src/pages/admin/tags/OverviewTab.tsx:198,208; client/src/pages/admin/tags/PieceDetail.tsx:35-36; client/src/i18n/messages/adminTagsFlow.ts:135.
Risco: nenhum.

### PE-21 [S2] A fila "Chips to write" no celular não diz o que há com o chip
Telas: platform/en-phone/panel-tags-overview-chipPending, owner/en-phone/panel-tags-overview-chipPending, partner/en-phone/panel-tags-overview-chipPending.
Problema: o card mostra cliente, código e "Sold" ou "With a reseller". Nada sobre o chip, que é a razão de a peça estar lá. "Write failed" e "Chip written" somem. O computador mostra a coluna.
Mudança: no card, mostrar a pill do chip sempre que a coluna `chip` foi pedida. Hoje ela só aparece dentro de `has("scans")`.
Arquivos: client/src/pages/admin/tags/piece-table.tsx:226-231.
Risco: nenhum.

### PE-22 [S2] "Held by", "Owned by", "The reseller (bought)"
Telas: platform/en-desktop/piece-page-live, piece-page-soldLive, piece-page-lost; platform/en-phone/piece-page-*.
Problema: duas linhas parecidas, com linguagem de contrato. Peça vendida: "Held by Jessica Alvarez" e "Owned by The customer", com o cabeçalho sem localização. A peça está no cliente, e "Sold pieces stay with their seller." confunde mais. O select "Reseller" fica aberto com "Transfer" desativado.
Mudança: "Held by" vira "With" (pt já é "Com quem está"). "Owned by" vira "Belongs to" (pt já é "Pertence a"). "The reseller (bought)" vira "The reseller, who bought it" / "O revendedor, que comprou" / "El revendedor, que la compró". Peça vendida: troca "Held by" por "Sold by" / "Vendida por" / "Vendida por". Sem transferência possível, o bloco "Reseller" some (o texto explica só se a pessoa perguntar, em PE-32).
Arquivos: client/src/i18n/messages/pieceScreen.ts:48-54; client/src/components/piece/ManagementSection.tsx:58,90-91,175-177; client/src/i18n/messages/manageTagsPieces.ts:105.
Risco: nenhum.

### PE-23 [S2] "Digital", "Physical stock" e "Chip" ainda aparecem, e abertos na página
Telas: platform/en-desktop/piece-page-*, piece-popup-more-details; platform/en-phone/piece-popup-*; owner/en-phone/piece-popup-brightside-sold.
Problema: "DIGITAL: No customer yet", "PHYSICAL STOCK: In stock", "CHIP: Not written". O dono não fez essa pergunta. Em peça vendida aparece "PHYSICAL STOCK Sold" e "Sold" de novo, na mesma linha. Em desativada: "PHYSICAL STOCK In stock". É o estado do banco na tela, e foi a primeira queixa da auditoria anterior. Na página e no celular do gestor, fica logo abaixo do botão principal.
Mudança: o bloco sai da peça. Quem precisa dele vê em "Technical details", com rótulos "Link", "Stock" e "Chip", sem "Digital" e sem "Physical". Para o revendedor, sai por completo.
Arquivos: client/src/components/piece/PieceBody.tsx:110,129; client/src/components/piece/PieceHeader.tsx:40-55; client/src/i18n/messages/pieceScreen.ts:8-10.
Risco: testes procuram `piece-status-chips`. Sem regra de negócio.

### PE-24 [S2] A coluna "Where" responde coisa que não é lugar, e a mesma coluna se chama "Status" em My pieces
Telas: panel-stock, stock-where-* em todos os perfis; tags-pieces.
Problema: filtro "Where is it" com as opções "Live", "Sold", "Paused", "Deactivated". Coluna "WHERE" com "Sold" e "Paused". "Where: Paused" não faz sentido. Em My pieces, o mesmo dado é "STATUS".
Mudança: coluna "Status" / "Situação" / "Estado". Filtro "All statuses" / "Todas as situações" / "Todos los estados". Isso resolve também a pergunta do chip "Live" no meio de lugares.
Arquivos: client/src/i18n/messages/manageTags.ts:83,100.
Risco: nenhum.

### PE-25 [S2] Os números dos chips não acompanham os filtros
Telas: platform/en-desktop/stock-rep-jessica, stock-method-nfc, stock-product-large-stand, stock-org-harbor, stock-search.
Problema: com "Jessica Alvarez", a lista tem 6 resultados e os chips continuam "19, 21, 2, 6, 58". Com "Large Stand", 16 resultados e os mesmos números. Só o filtro de organização apaga os números. A pessoa lê "With a reseller 21" com a lista mostrando outra coisa.
Mudança: qualquer filtro além de `where` esconde os números, como já acontece com a organização.
Arquivos: client/src/pages/admin/tags/PiecesTab.tsx:196.
Risco: nenhum.

### PE-26 [S2] "In company stock · Live" com cliente
Telas: platform/en-desktop/stock-where-live, panel-tags-overview-chipPending; platform/en-phone/stock-where-live; platform/en-desktop/piece-popup-houseLive e piece-popup-houseConfigured.
Problema: X2ED2GA4 está em Harbor Light Nails, com 40 leituras, e aparece como "In company stock · Live". O popup diz "Company stock". TCJABA93 idem. A peça saiu da empresa. O dono acha que ela está na prateleira, e o chip "In company stock" pode contar peça que está na rua.
Mudança: peça com cliente não diz que está em estoque. Status: "Live" ou "Ready, not live". No popup, a linha "Company stock" some quando há cliente.
Arquivos: client/src/pages/admin/tags/where-model.ts; client/src/pages/admin/tags/piece-table.tsx:53-57; client/src/components/piece/pieceView.ts (`pieceHasLocation`).
Risco: **depende do dono**: o chip "In company stock" deve deixar de contar essas peças? Recomendo sim. Isso muda a métrica compartilhada em `shared/tagMetrics.ts`.

### PE-27 [S2] A recusa fala de kit para um gestor, com link que não leva a nada
Telas: partner/en-desktop/piece-popup-company-piece-denied.
Problema: "You do not have access to this. This piece is not in your kit." Daniela é gestora: não tem kit, e a peça é de outra organização. "Open full page" continua em cima e leva à mesma recusa.
Mudança: esconder "Open full page" em erro. Para gestor: "This piece belongs to another company." / "Esta peça é de outra empresa." / "Esta pieza es de otra empresa." "Kit" fica só para o revendedor (que já vê "This piece is not with you.").
Arquivos: server/tags/routes.ts:338,473; client/src/pages/admin/tags/PieceDetail.tsx (`top`).
Risco: confirmar que mostrar isso não revela a existência de peça alheia. Recomendo aceitar: é só um código.

### PE-28 [S2] Em My pieces no celular, a pill cobre o texto e o nome vira "Pho Sai..."
Telas: rep-both/en-phone/tags-pieces, reseller/en-phone/tags-pieces, owner/en-phone/tags-pieces.
Problema: "Pho Sai...", "Copper Ket...", "Lowell ...", "Beacon...". O nome do cliente é o que a pessoa procura. "Ready, not live" e "Chip not written" passam por cima do "L" do modelo.
Mudança: pills em linha própria, abaixo do código, em largura total. O nome usa a linha toda. Sai a limitação `max-w-[50%]`.
Arquivos: client/src/pages/tags/PiecesScreen.tsx:285-291.
Risco: nenhum. Ver RCP-9 e RCP-14.

### PE-29 [S2] Em "Top pieces" no celular, o nome passa por cima dos números
Telas: owner/en-phone/panel-tags-overview, platform/en-phone/panel-tags-overview, partner/en-phone/panel-tags-overview.
Problema: "Maple Street Bakery" e "QR 102 · NFC 54" ocupam o mesmo espaço e se misturam, em quase todas as linhas.
Mudança: números em linha própria abaixo do nome, abaixo de `sm`.
Arquivos: client/src/pages/admin/tags/pieces-analytics.tsx:205-216.
Risco: nenhum.

### PE-30 [S2] No celular, a palavra "Stock" três vezes e a primeira peça na metade da tela
Telas: platform/en-phone/panel-stock, owner/en-phone/panel-stock, stock-more-filters-open; platform/en-phone/piece-popup-* e piece-page-*.
Problema: título "Stock", select "Stock" e, já na peça, "‹ Stock", além da seta "←". A primeira peça da lista surge em cerca de 490 px (owner) e 530 px (platform), de 844. Com "More filters" aberto, em cerca de 770 px. Na peça, o botão principal está em cerca de 490 px. Antes dela há faixa, título, select, busca por código e dois voltar. Os chips ficam cortados em "Sold" sem indicar que rolam.
Mudança: na peça, saem o select e a busca por código, e fica uma só seta de voltar. Na lista, o select "Stock" sai (o menu já leva a ele) e a busca por código entra na busca da página (PE-43). "Where is it" e "All products" vão para "More filters" no celular, já que os chips cobrem o primeiro.
Arquivos: client/src/pages/admin/tags/AdminTags.tsx, client/src/pages/admin/tags/PieceDetail.tsx:35-36, client/src/pages/admin/tags/PiecesTab.tsx:244-280.
Risco: o select é a navegação de "Tags" no celular. Só pode sair se outra navegação cobrir. Recomendo deixá-lo apenas nas telas raiz.

### PE-53 [S2] Dono e parceiro leem "Hand back to the company" na peça de outra pessoa, e não têm gestão
Telas: owner/en-phone/piece-popup-brightside-kit; partner/en-phone/piece-popup-harbor-kit; comparar com platform/en-desktop/piece-page-kitUnconfigured.
Problema: 7N7FKFSN diz "With Jessica Alvarez" e, logo abaixo, Priya, a dona, lê "Hand back to the company". PB0Z4CGV faz o mesmo com Daniela e Sofia Rossi. O botão fala como se a peça estivesse com quem lê, e a confirmação diz "It leaves your stock" (texto visto no código). A causa aparece na comparação entre perfis: na peça, `canManage` só é verdadeiro para o admin global (`user.isAdmin`). Dono e parceiro abrem o estoque da gestão, mas recebem a peça como revendedor: sem "Management" (com quem está, de quem é, custo, QR, transferir) e sem "Activity". Só Marcus vê a peça inteira.
Mudança: quem gerencia a organização da peça recebe o papel de gestor no `PieceViewer`, em `PieceDetail`. Com isso, o botão vira "Take back" / "Receber de volta" / "Devolver al stock", na gestão. O gravador de mesa e as notas de produção continuam só para o admin global.
Arquivos: client/src/pages/admin/tags/PieceDetail.tsx:54-58; shared/modules.ts:11; client/src/components/piece/CustodyCard.tsx:92; client/src/components/piece/pieceView.ts (`pieceSections`); client/src/i18n/messages/pieceCustody.ts:19-21.
Risco: **depende do dono**: o que dono e parceiro podem ver e fazer na peça é regra de negócio, e o servidor precisa aceitar. Recomendo: veem custo, responsável e histórico; transferem entre pessoas da própria organização. O mínimo, se preferir agora: esconder "Hand back" quando a peça estiver com outra pessoa.

---

## S3

### PE-14 [S3] Oito colunas, e a última sai da tela
Telas: panel-stock, stock-where-* em 1440 px, todos os perfis; platform/pt-desktop/panel-stock, platform/es-desktop/panel-stock.
Problema: CODE, WHERE, COMPANY, RESELLER, CHIP, QR / NFC, LAST SCAN, BATCH. "BATCH" é cortado na borda ("SPLATE-2026-00", "LPLATE-2026-00"). Em pt e es, some quase todo; "Estoque da empr…" e "Stock de la empr…" também são cortados. "QR / NFC" não diz nada: "0 / 0" numa peça é ruído.
Mudança: ficam Code, Status, Customer, Reseller, Chip, Scans. "Scans" junta total e data: "67 · Nov 1", com o detalhe QR/NFC no `title`. "Batch" sai da lista: fica na peça, e a busca e o filtro continuam encontrando.
Arquivos: client/src/pages/admin/tags/PiecesTab.tsx:37; client/src/pages/admin/tags/piece-table.tsx:136-158; client/src/i18n/messages/manageTags.ts:86.
Risco: quem produz usa o lote para conferir. Ele continua no filtro "All batches" e no detalhe.

### PE-31 [S3] Mesmos números duas vezes, e "Scans by piece" mostra scans por dia
Telas: panel-tags-overview em todos os perfis, desktop e phone.
Problema: bloco 1 "Scans (QR + NFC)": 49, 166, 415, 393. Bloco 2: 415, 281, 134, 393. Dois dos quatro repetem. O título "Scans by piece" está em cima de um gráfico "Scans by day". O celular tem 2860 a 3421 px, com filtros cortados em "All produ...", "All resell...", "All comp...".
Mudança: um bloco só: período, número grande e divisão QR/NFC. Título "Scans" / "Leituras" / "Lecturas". Filtros atrás de "More filters".
Arquivos: client/src/pages/admin/tags/OverviewTab.tsx:83,97; client/src/i18n/messages/adminTagsFlow.ts:149.
Risco: nenhum.

### PE-32 [S3] Quatro botões fortes na mesma tela, e botões desativados que a regra dizia que não existiriam
Telas: platform/en-desktop/piece-page-houseAvailable, piece-page-kitUnconfigured, piece-page-pendingSupplier, piece-page-lost, piece-page-retired.
Problema: em 9PJ2DDM9: "Set up" (roxo), "Write chip" (roxo), "Send to writer" (roxo), "Sell this piece" (verde). Qual é o próximo passo? O comentário em `pieceSituation` diz que ação recusada "is left out, never shown disabled", mas "Sell this piece", "Transfer" e "Take back" aparecem desativados, com o aviso embaixo. Em peça perdida, a mesma frase aparece duas vezes, em Customer e em Sale.
Mudança: só um botão de marca: o principal. "Write chip" usa `secondary` quando não é o principal. "Sell this piece" fica neutro. Ação impossível some, com o aviso, e o motivo aparece uma vez, no topo.
Arquivos: client/src/components/piece/ChipSection.tsx:133; client/src/components/piece/SaleSection.tsx:119-125; client/src/components/piece/ManagementSection.tsx; client/src/components/piece/CustomerDestinationSection.tsx:319.
Risco: nenhum.

### PE-33 [S3] Dois cartões de chip dentro do mesmo cartão
Telas: platform/en-desktop/piece-page-live, piece-page-configuredChip, piece-page-soldLive; platform/en-phone/piece-popup-*.
Problema: "NFC CHIP / Chip verified / Rewrite chip" e, dentro, "NFC chip · desktop writer [PLATFORM] / Chip verified / Write again". Duas pills iguais e dois botões para o mesmo fim. "The chip must hold exactly http://localhost:2110/n/193J8BAB — never the destination." é conversa de produção no meio da peça, e o selo "PLATFORM" é interno.
Mudança: um cartão só. O gravador de mesa vira opção dentro do fluxo "Write chip". A conferência "Chip ↔ QR check" fica em "Technical details". O selo sai.
Arquivos: client/src/pages/admin/tags/pieces-NfcProvisioningCard.tsx:130; client/src/components/piece/ChipSection.tsx.
Risco: só afeta o admin global, que usa o gravador. Ouvir quem opera a impressora.

### PE-34 [S3] O nome do cliente se repete, cortado, e são quatro ações iguais
Telas: platform/en-phone/tags-piece-*, reseller/en-phone/tags-piece-live, rep-both/en-phone/tags-piece-live, piece-popup-live.
Problema: "Fenway Fitness Club" no cabeçalho e, logo abaixo, "Fenway Fit…" no card, ao lado de um lápis sem rótulo e de "Change customer". "Change destination", lápis, "Change customer", "Remove customer" e "Pause" têm o mesmo peso. "Remove customer" é largo e fica a um toque do "Pause".
Mudança: a linha do nome no card sai. "Remove customer" e o lápis vão para "More details". Ficam "Change destination", "Pause" e "Change customer" (texto simples).
Arquivos: client/src/components/piece/CustomerDestinationSection.tsx:270-285,330-350.
Risco: nenhum. O pedido de confirmação de "Remove customer" continua.

### PE-35 [S3] Formulário de configurar: "Destination" duas vezes e "UTM"
Telas: platform/en-desktop/piece-page-set-up-editor, platform/en-phone/piece-popup-set-up-editor.
Problema: rótulo "Destination" nas abas e de novo no campo. "Add tracking parameters (UTM) · utm_medium=qr or nfc" é código na tela de quem está configurando uma peça. "Save destination" salva também o cliente.
Mudança: segundo rótulo vira o tipo escolhido ("Link", "Email"). UTM vai para "Technical details", desligado. Botão: "Save" / "Salvar" / "Guardar".
Arquivos: client/src/components/piece/CustomerDestinationSection.tsx:367-455.
Risco: não confirmei se o revendedor vê o UTM (as capturas abertas são de gestor). Se vê, a gravidade sobe.

### PE-36 [S3] "New single piece" fala como o sistema
Telas: platform/en-desktop/stock-new-piece-dialog, platform/en-phone/stock-new-piece-dialog.
Problema: "Provides the price and financial identity used when these pieces are sold." "Piece type" e "Sales catalog product" parecem a mesma pergunta. "Printed on the piece: From the product (Google sign: Google)". "Create piece" fica apagado, sem dizer o que falta.
Mudança: "Sets the price when this piece is sold." / "Define o preço quando esta peça for vendida." / "Define el precio cuando se venda esta pieza." Rótulo "Product" / "Produto" / "Producto". Opção "Same as the product" / "Igual ao produto" / "Igual al producto".
Arquivos: client/src/i18n/messages/manageTagsBatches.ts:18; client/src/i18n/messages/manageTagsPieces.ts:33-36; client/src/pages/admin/tags/PiecesTab.tsx:100-135.
Risco: nenhum. Só o admin global vê.

### PE-37 [S3] "More filters" com filtros que ninguém pediu
Telas: stock-more-filters-open em todos os perfis, stock-method-nfc.
Problema: "Any method", com "Has NFC scans". "All organizations" ao lado de "All companies". Cinco caixas iguais; no celular, empilhadas.
Mudança: "Any method" sai. Ficam revendedor, cliente e lote. O filtro de organização fica só para o admin global, como já é, e passa para o começo.
Arquivos: client/src/pages/admin/tags/PiecesTab.tsx:40-44,275; client/src/i18n/messages/manageTagsPieces.ts:9,15.
Risco: o link `?method=` deve continuar funcionando por compatibilidade.

### PE-38 [S3] Lista vazia sem saída, e "fila" na conversa
Telas: stock-where-* sem resultado (owner, partner, owner-multi), platform/en-desktop/stock-empty-result, panel-tags-overview-noProduct.
Problema: "No pieces match these filters." quando o único filtro é um chip que já diz 0. "Clear filters" fica longe, acima. "Nothing here: this queue is clear.": "queue" é termo interno. "No catalog product" também.
Mudança: dizer qual e dar a saída: "Nothing in company stock." / "Nada no estoque da empresa." / "Nada en el stock de la empresa.", com botão "See all pieces" / "Ver todas as peças" / "Ver todas las piezas". Fila limpa: "All good." / "Tudo certo." / "Todo en orden." Título: "Pieces without a product" / "Peças sem produto" / "Piezas sin producto".
Arquivos: client/src/pages/admin/tags/PiecesTab.tsx:226; client/src/i18n/messages/adminTagsFlow.ts:132-134,337,534.
Risco: nenhum.

### PE-39 [S3] Atividade em linguagem de log, com "Tag" e email
Telas: platform/en-desktop/piece-page-soldLive, piece-page-live, piece-page-technical-details.
Problema: "Tag 0XBAXB57 activated", "Tag 0XBAXB57 assigned to Maple Street Bakery". O glossário proíbe "tag" para o objeto. "by jessica.alvarez@lab.example" e "by Jessica Alvarez" aparecem na mesma lista. Notas de produção ("White body is translucent…") ficam misturadas na história da peça. "Production log: record entries and plans" não se explica.
Mudança: "Put live" / "Colocada no ar" / "Activada" e "Linked to Maple Street Bakery" / "Vinculada a Maple Street Bakery" / "Vinculada a Maple Street Bakery". Sempre o nome, nunca o email. Notas de produção só atrás de "Production log", que passa a "Production notes" / "Notas de produção" / "Notas de producción".
Arquivos: server/tags/field.ts:125 e demais títulos em `server/tags`; client/src/components/piece/ActivitySection.tsx.
Risco: entradas antigas já estão gravadas com o texto velho. Traduzir pela ação, não pelo título.

### PE-40 [S3] Desempenho completo em peça que nunca esteve no ar
Telas: platform/en-desktop/piece-page-houseAvailable, piece-page-pendingOldPrint, piece-page-lost, piece-page-retired; platform/en-phone/piece-popup-soldNotLive.
Problema: quatro atalhos de período, duas datas, "0 scans", "0 est. visitors", "No scans in this period", "QR 0 NFC 0" e "All time 0". Cerca de 400 px de zeros.
Mudança: sem nenhuma leitura em toda a vida da peça, a seção vira uma linha: "No scans yet." / "Nenhuma leitura ainda." / "Sin lecturas todavía." O período personalizado fica atrás de "Custom" / "Personalizado" / "Personalizado".
Arquivos: client/src/components/piece/PerformanceSection.tsx.
Risco: nenhum.

### PE-41 [S3] A atividade de "Pieces results" repete a mesma peça com dois títulos
Telas: panel-tags-overview em platform, owner, partner, owner-multi.
Problema: "East Boston Bike Works: Went live" e, logo abaixo, "F3G1VTJK: Destination", na mesma hora. Ora o título é o cliente, ora é o código. Em partner, as 10 linhas seguintes são todas "East Boston Bike Works: Opened destination". Leituras não são novidade, e já estão no gráfico. "Devices" ocupa um cartão alto, com três linhas e muito vazio.
Mudança: uma linha por acontecimento, sempre cliente e código. A aba "All" não inclui leituras, que ficam só em "Scans". "Devices" vira uma linha, como na peça: "Mobile 95 · Tablet 31 · Desktop 30".
Arquivos: client/src/pages/admin/tags/OverviewTab.tsx; client/src/pages/admin/tags/pieces-analytics.tsx:197.
Risco: nenhum.

### PE-42 [S3] My pieces: "No customer yet" duas vezes por linha, e ícone sem rótulo
Telas: tags-pieces, tags-pieces-search em owner, owner-multi, reseller, rep-both, desktop; reseller/pt-desktop/tags-pieces.
Problema: coluna COMPANY "No customer yet" e STATUS "No customer yet". Em pt, até diferem: "Sem cliente ainda" e "Sem cliente". Ao lado, um ícone colorido pequeno, sem texto, significa o estado do chip.
Mudança: célula do cliente vazia ("—") nessa situação. Ícone só aparece se houver problema, e já há pill para isso (`ChipMark`), então o ícone sai. Unificar pt em "Sem cliente" e es em "Sin cliente".
Arquivos: client/src/pages/tags/ui.tsx:186-200; client/src/i18n/messages/tags.ts:218,678,1124.
Risco: nenhum.

### PE-43 [S3] Três caixas de busca na mesma tela
Telas: panel-stock e stock-* no computador, em todos os perfis.
Problema: "Code or scanned link" com "Open", "Search Ctrl K" e "Search code, company, label or batch". Qual uso para achar uma peça?
Mudança: no estoque, a busca da página aceita código ou link lido; código exato abre a peça ao apertar Enter. "Code or scanned link" sai desta tela. "Search Ctrl K" fica, por ser global.
Arquivos: client/src/pages/admin/tags/AdminTags.tsx; client/src/pages/admin/tags/PiecesTab.tsx:256.
Risco: quem usa leitor de código de barras precisa continuar sem tirar a mão: testar com o leitor.

### PE-44 [S3] Regra explicada em vez de estado
Telas: platform/en-desktop/piece-page-*, platform/en-phone/piece-popup-*.
Problema: "No sale recorded. Going live is not a sale." é uma defesa do sistema, e aparece em toda peça sem venda. Quem nunca pensou nisso fica em dúvida.
Mudança: "Not sold yet." / "Ainda não vendida." / "Aún sin vender." A explicação fica só no diálogo de "Put live", onde já existe.
Arquivos: client/src/i18n/messages/pieceScreen.ts:26,145.
Risco: nenhum.

### PE-45 [S3] A mesma palavra, duas cores, na mesma tela
Telas: platform/en-desktop/piece-page-paused, piece-page-configuredChip, stock-where-disabled; platform/en-phone/piece-popup-paused, piece-popup-configuredChip; rep-both/en-phone/tags-pieces.
Problema: "Paused" é âmbar no cabeçalho e vermelho logo abaixo, e vermelho na lista. "Ready, not live" é azul no cabeçalho e âmbar na linha "Digital" e em My pieces. Pausar é uma escolha, não um problema.
Mudança: uma cor por estado: Paused âmbar em todo lugar; Ready, not live azul em todo lugar.
Arquivos: client/src/pages/admin/tags/piece-table.tsx:44; client/src/components/xpot/StatusPill.tsx:60-66; client/src/components/piece/pieceView.ts:124-127.
Risco: nenhum.

### PE-46 [S3] "PLATE L #1": três etiquetas sem legenda, e a base do stand some no fundo
Telas: panel-stock em todos os perfis; platform/en-desktop/piece-popup-soldLive; platform/pt-desktop/panel-stock, platform/es-desktop/panel-stock.
Problema: "S" e "L" não dizem que são tamanho, e em pt e es viram "P" e "G", com "Display" e "Soporte" no lugar de "Stand". "#1" é a posição no lote e não serve na lista. A base preta do stand quase some sobre o fundo escuro.
Mudança: texto único "Large plate" / "Chapa grande" / "Placa grande", sem "#n" na lista. A base preta do stand ganha um contorno claro.
Arquivos: client/src/components/xpot/TagProductThumbnail.tsx:86; client/src/pages/admin/tags/piece-table.tsx:183-197.
Risco: nenhum. Ver RCP-23 para "Chapa" e "placa".

### PE-54 [S3] Para o parceiro, o estoque fica dentro de "Production"
Telas: partner/en-desktop/panel-stock, partner/en-phone/panel-stock, partner/en-desktop/stock-where-*, partner/en-phone/tags-pieces.
Problema: a área de Daniela se chama "Production", com o caminho "Production › Stock". O dono lê "My company › Stock", e o glossário fechou "My company" para a área do dono. Quem abre o estoque para ver o que há com a revendedora não está produzindo nada.
Mudança: usar "My company" / "Minha empresa" / "Mi empresa" para o parceiro também. Dentro dela, um item "Production" fica só para a impressão.
Arquivos: client/src/i18n/messages/shell.ts; client/src/i18n/messages/workspaces.ts.
Risco: pode ser escolha deliberada para separar parceiro de dono. Recomendo unificar. Verificar com a área de navegação, que pode ter o mesmo achado.

---

## S4

### PE-47 [S4] O link "Open as reseller view" não diz o que faz
Telas: platform/en-desktop/piece-page-live, piece-page-soldLive.
Problema: "Open as reseller view" não diz o que acontece ao clicar.
Mudança: "See what the reseller sees" / "Ver como o revendedor vê" / "Ver lo que ve el revendedor".
Arquivos: client/src/i18n/messages/pieceScreen.ts:22.
Risco: nenhum.

### PE-48 [S4] "Kit" cortado no cabeçalho do celular
Telas: platform/en-phone/piece-popup-configuredChip, piece-popup-withReseller, owner/en-phone/piece-popup-brightside-kit, owner-multi/en-phone/piece-popup-lindgren-any.
Problema: "With Jessica Alvarez · Kit ..." ao lado da figura.
Mudança: permitir duas linhas na localização: tirar `truncate` e pôr o kit na linha de baixo.
Arquivos: client/src/components/piece/PieceHeader.tsx:90.
Risco: nenhum.

### PE-49 [S4] "Harbor Print Co.." com dois pontos
Telas: reseller/en-phone/tags-pieces, reseller/pt-desktop/tags-pieces, owner-multi/en-phone/tags-pieces.
Problema: "Your pieces come from Harbor Print Co.." Acontece com qualquer nome terminado em ponto (Inc., Ltda.).
Mudança: tirar o ponto final do texto: "Your pieces come from {name}" (pt e es idem). Ver RCP-33, que questiona o próprio bloco.
Arquivos: client/src/i18n/messages/tags.ts:436,885,1331.
Risco: nenhum.

### PE-50 [S4] Texto de exemplo cortado no celular
Telas: platform/en-phone/piece-popup-set-up-editor, platform/en-phone/piece-page-set-up-editor, platform/en-phone/stock-new-piece-dialog.
Problema: "Search companies or type a new nam", "https://customer.com/mer", "From the product (Google si".
Mudança: encurtar: "Search or type a new name" / "Busque ou digite um nome novo" / "Busca o escribe un nombre nuevo"; "customer.com/menu"; "Same as the product" (PE-36).
Arquivos: client/src/components/piece/CustomerDestinationSection.tsx; client/src/i18n/messages/manageTagsPieces.ts:35.
Risco: nenhum.

### PE-51 [S4] Sem "Read another piece" no computador
Telas: rep-both/en-desktop/tags-piece-not-mine, reseller/en-desktop/tags-piece-unknown, rep-both/en-desktop/tags-piece-unknown.
Problema: o telefone tem o botão; o computador só tem o X. "No piece with code ZZZZZZZZ." também não diz o que fazer.
Mudança: adicionar "Check the code and try again." / "Confira o código e tente de novo." / "Revisa el código e inténtalo de nuevo."
Arquivos: client/src/pages/tags/TagScreen.tsx; client/src/i18n/messages/tags.ts:93.
Risco: nenhum.

### PE-52 [S4] "Recolher" fora do glossário em pt
Telas: platform/pt-desktop/piece-page-lost.
Problema: o glossário fechou "Take back" como "Receber de volta". A tela diz "Recolher".
Mudança: "Receber de volta".
Arquivos: client/src/i18n/messages/pieceScreen.ts (chave `takeBack`).
Risco: nenhum.

---

## O que está bom e deve ficar

- "Did this piece arrive?", com "It's in company stock" e "It's with me": pergunta clara, duas respostas (`piece-popup-pendingSupplier`).
- O popup de peça pronta cabe sem rolar a 1440x900 (`piece-popup-configuredChip`, `piece-popup-live`).
- `tags-piece-not-mine` no telefone: frase curta e saída.
- Filtros na URL e "Clear filters".

## Observações que não são achados

- **Código de atacado vazio** (rep-both e owner em `tags-pieces`, "YOUR WHOLESALE CODE" sem nada ao lado do copiar): é do seed, não do app. `XP-JA05-BOTH` e `XP-PN03-OWNR` têm a letra O, que o alfabeto proíbe, e `formatWholesaleCode` devolve vazio (shared/wholesale.ts). Corrigir `.lab/seed-people.ts:32,34`. O código `XP-MR01-ADMN` aparece normalmente.
- `piece-popup-brightside-live` e `piece-popup-brightside-sold` são a mesma peça (0XBAXB57), e `kitUnconfigured` e `withReseller` também (7N7FKFSN). O estado "peça no ar sem venda" do owner fica sem captura própria nesses dois casos.
- No telefone não existe popup: as capturas `piece-popup-*` e `piece-page-*` de phone são pixel a pixel iguais nos 10 pares comparados.
- A captura `piece-popup-write-chip` clica no primeiro botão que casa com /write|chip/. O que aparece atrás ("Cancel the write") pode vir desse clique ou do seed. O corte da folha (PE-1) independe disso.
- Datas iguais na atividade ("Nov 1, 11:12 PM") vêm do seed.
- Não vi o menu "More actions" nem "Piece settings": as capturas não os abrem.
- No código, sem captura: `viewerPrints` exige `canManage`, então parceiro que imprime as próprias peças nunca recebe "Go to printing" na peça pendente, apesar do comentário dizer que sim (client/src/components/piece/pieceView.ts:77). Conferir junto com PE-53.
- Figura da peça: `Plate Large · Black` aparece com figura branca. Não registrei como achado: figura 2D é limitação do laboratório.
