# Fluxos de ponta a ponta: achados

Como foi feito: Playwright (driver proprio em `.lab/flows/driver.mjs`, comandos por HTTP) contra `http://localhost:2110`, clicando como a pessoa, com screenshot e conferencia no banco local (`127.0.0.1:55432`) depois de cada passo. Screenshots em `.lab/shots/flows/` (prefixos p1..p9 = fluxo 1..9). Nada de API direta; as chamadas `/api` citadas sao as que a propria tela disparou.

Seed antes: o do laboratorio. Seed depois: rodado de novo ao fim para limpar.

## Resultado por fluxo

| # | Fluxo | Resultado | Cliques/telas ate concluir | Observacao |
|---|---|---|---|---|
| 1a | Gerar pecas (cor, face, quantidade) | PASSOU | 5 cliques + 1 numero, 4 etapas, 5 decisoes (modelo, cor, face, organizacao, quantidade) | Peca nova entra pendente (`pending`). Depois de gerar, o pedido fica fora da tela (F-8). |
| 1b | Waiting to print, abrir pedido | PASSOU | 1 clique | Pagina do pedido bem clara. |
| 1c | Baixar arquivo | NAO DEU PARA TESTAR de verdade | 1 clique | Lab sem storage: `GET /api/xpot/admin/print-files/:id` devolve 503 `print_storage_unavailable`. O link abre em aba nova (`target=_blank`), entao a pessoa veria JSON cru (F-7). Pedido sem arquivo diz "Waiting for the file ... You can also upload the file here" e mostra "No file yet". |
| 1d | Marcar impressa: tudo bom | PASSOU | 3 cliques a partir da lista (Mark printed > Yes, all good) | 3 pecas `available`. |
| 1e | Marcar impressa: algumas ruins | PASSOU com contradicao | 5 cliques (Mark printed, Some came out bad, 2 caixas, confirmar) | Banco certo (2 `available`, 2 `damaged`), mas a tela diz "All pieces ... received into stock" (F-4). Sem caminho para refazer so as ruins (F-5). |
| 1f | Marcar falhou, refazer, cancelar | PASSOU | falhou: 3 cliques + motivo; "Print again": 1; cancelar: 3 cliques + motivo | Refazer mantem lote e codigos (confirmado no banco). Cancelar deixa as pecas `pending` no estoque. |
| 2a | Criar lote de fornecedor | PASSOU | 9 passos (Other ways to produce, tipo, nome, modelo, face, produto, Continue, quantidade, Continue, Issue) | Cai direto na aba Receive. |
| 2b | Receber na aba do lote | PASSOU | 1 codigo + Enter por peca | Codigo errado: "Piece ZZZZZZZZ was not issued to this batch."; repetido: "Already in"; de outro lote: "already belongs to another batch". Boas. |
| 2c | Receber na peca ("It's in company stock" / "It's with me") | PARCIAL | 3 cliques (Read a piece, codigo, It's with me) | Admin de plataforma na visao de revendedor so ve "It's with me" (`receiveTargets` exige `inManagement`, falso na visao de revendedor, `server/tags/access.ts:37`). "It's in company stock" nao foi visto. Receber com "It's with me" gravou `custodian_rep_id` do Marcus. |
| 3a | Hand out com checagem de codigos | PASSOU | 5 cliques (revendedor, colar codigos, Add, Remove those that can't, Hand out) | Checagem por codigo excelente (unknown, already with X, ready). Gera "Packing list K-0009". |
| 3b | Revendedor ve em My pieces | PASSOU | 2 cliques | 4 viraram 6 pecas. |
| 3c | Take back | PASSOU | 4 cliques | Banco: `rep_id` e `kit_id` zerados. |
| 4a | Celular 390x844: ler peca digitando o codigo | PASSOU | 3 passos (Read a piece, codigo, seta) | Codigo errado: "No piece with code ZZZZZZZZ."; de outro: "This piece is not with you." |
| 4b | Configurar (cliente, link) e colocar no ar | PASSOU, mas pesado | 8 passos desde a home ate a peca no ar | F-9 (chip some do fluxo). |
| 4c | Pular/gravar chip | PASSOU so com Web NFC simulado | Write chip, Write now, Skip verifying | Em celular sem Web NFC aparece o passo a passo do NFC Tools escondido em "More details". Lab sem chip real; usei um `NDEFReader` falso (so no driver). "Skip verifying" grava `programmed` sem verificar. |
| 4d | Pausar, reativar | PASSOU | 1 clique cada | Pausar sem confirmacao (reversivel, ok). Publico recebe 410 pausada, 302 viva. |
| 4e | Trocar destino | PASSOU | 3 cliques | Link sem esquema ("labcoffee.example.com/review") e aceito e salvo. `javascript:` desabilita o botao sem dizer porque (F-10). |
| 4f | Remover cliente | PASSOU | 2 cliques | Dialogo claro. Peca volta a `inventory`. |
| 4g | Vender | PASSOU | 4 cliques | Venda #11 de $17.99, peca `sold`. |
| 5 | Pedido de atacado: separar | FALHOU (S1, bug conhecido confirmado) | 3 passos | `POST .../tag-acquisitions/:id/fulfill` -> 500 "Failed to fulfill acquisition". Qualquer codigo (bom ou ruim) da 500. F-1. |
| 6a | Vendedor: check-in em parada | PASSOU | 5 passos (Route, parada, Check in, deslizar, motivo de geofence, Check in) | Fora do raio (3,9 km): pede motivo, mensagem boa. |
| 6b | Nota da visita | PASSOU so por voz | 2 cliques + gravar + Upload | Nao ha nota por texto (F-15). Toast "Audio uploaded successfully". |
| 6c | Venda na visita | PASSOU | 4 cliques | Venda #12 vinculada a visita. |
| 6d | Finalizar visita | PASSOU | 3 passos (Finish, resultado, deslizar) | Resultado vem em "Visited" mesmo com venda (F-11). |
| 6e | Criar empresa | PASSOU | 4 passos | Botao Save desabilitado sem nome, sem aviso. |
| 6f | Tarefa: criar e concluir | PASSOU | criar 5; concluir 1 toque no circulo | Concluir sem desfazer. |
| 6g | Consignacao e acerto | PASSOU, com armadilha (F-3) | 3 cliques | Acerto grava ($28 com 10 na prateleira). |
| 6h | Rota: planejar | NAO DEU PARA TESTAR; bloqueado (S1 em producao) | - | Sem Google Places: passo 1 sem saida (F-2). Tela cortada no celular (F-13). |
| 6i | Rota: editar | PASSOU parcial | remover parada: 2 cliques | Remover tem confirmacao. Reordenar por arrastar nao testado. Nao existe "publicar" na rota do vendedor; nao testei publicacao. |
| 7a | Admin: aprovar pessoa | PASSOU | 4 cliques (abrir, 2 modulos, Approve) | Toast "Nora Whitfield can sign in now". Entra sem organizacao. |
| 7b | Admin: recusar | NAO DEU PARA TESTAR | - | Gastei a unica pessoa pendente aprovando. Botao Refuse existe. |
| 7c | Admin: bloquear | PASSOU | 3 cliques + motivo | `is_active=false`, motivo gravado. |
| 7d | Admin: mudar modulos | PASSOU | 3 cliques | Salvou `visits,tags`. |
| 7e | Criar organizacao e parceiro | PASSOU | org: 3 passos; parceiro: 6 passos | Parceiro cria pessoa+org+modelos de uma vez. |
| 7f | Pessoa com acesso a organizacao | PASSOU | 3 cliques | Omar entrou como Employee. |
| 8 | Dono da plaquinha `/my` | PASSOU | entrar: codigo + telefone + codigo SMS | Detalhe de plaquinha bom; "Talk to your seller" abre `wa.me`. Login SMS real nao foi concluido (sem SMS no lab); codigo errado responde "This code expired" (F-21). |
| 9 | Estados de erro | PASSOU na maioria | - | Codigo errado, peca de outro, duas abas, voltar no meio, enviar vazio: ver achados F-10, F-16, F-19, F-20. |

Imagens abertas e lidas (Read): 69 screenshots de fluxo (mais o texto da pagina em cada passo).

## Achados

### FLX-1 [S1] Separar pedido de atacado sempre falha com erro 500
Telas: platform/en-desktop/Hand out > Wholesale orders (`p5-01-wholesale`, `p5-03-wholesale-submit`, `p5-04-wholesale-bad`)
Problema: preenchi os 2 codigos exatos do pedido STU-10455 (D4CRNJAA, HX5M5ARZ, pecas de estoque da empresa) e cliquei "Complete separation". Resultado: toast vermelho "Could not complete this order / Failed to fulfill acquisition", que ainda cobre o proprio botao. Com codigos errados (ZZZZZZZZ) a mesma coisa. Nenhum pedido de atacado consegue ser separado. Causa: `POST /api/xpot/admin/tag-acquisitions/:id/fulfill` devolve 500.
Causa no codigo: `lockFulfillmentTags` faz `.from(tags).leftJoin(tagBatches, ...).for("update")`. O PostgreSQL recusa `FOR UPDATE` no lado anulavel de um outer join ("FOR UPDATE cannot be applied to the nullable side of an outer join"). Como a consulta quebra antes das validacoes, ate a mensagem boa `tag_not_house_stock` ("Not in company stock: ...") nunca chega.
Mudanca: em `server/tags/acquisitions.ts` trocar `.for("update")` por `.for("update", { of: tags })` (tranca so as linhas de `tags`; o join com `tag_batches` e so leitura). Alternativa equivalente: tirar o `leftJoin` e buscar `tagBatches.salesProductId` numa segunda consulta. Depois, na tela, trocar o 500 generico: `routes.ts:1079` `fail(res, err, "Failed to fulfill acquisition")` esta ok, mas a tela deveria mostrar o `message` de `TagSaleError` (hoje so mostra o texto fixo para 500). Texto sugerido para erro inesperado: en "We couldn't complete this order. Nothing was moved. Try again, and tell us if it happens again." / pt "Nao foi possivel concluir este pedido. Nada foi movido. Tente de novo e avise se repetir." / es "No se pudo completar este pedido. No se movio nada. Intenta de nuevo y avisanos si se repite."
Arquivos: `server/tags/acquisitions.ts:103-120` (a consulta; `leftJoin` na linha 118, `.for("update")` na 120), `server/tags/acquisitions.ts:138` (chamada), `server/tags/routes.ts:1079`.
Risco: nenhuma regra de negocio; so a trava de linha. Conferir se outras consultas com `.for("update")` tem join: so esta tem (grep feito em `server/`).
Status: feito. `.for("update", { of: tags })` em `lockFulfillmentTags`; teste `tests/tags/wholesale-fulfill.integration.test.ts` (pedido separa, codigo desconhecido da 404, peca fora do estoque da 409) e clique na tela (Pedidos de atacado > Tomas > Give 2 pieces to Tomas: 200, pedido some, 2 pecas com o comprador). Um erro inesperado (500) agora mostra "We couldn't complete this order. Nothing was moved..." na tela.

### FLX-2 [S1] Planejar rota: o texto promete "continuar digitando", mas nao da para continuar
Telas: owner/en-phone/Route > Plan today's route, passo 1 (`p6-37-plan`, `p6-38-plan-city`, `p6-39-plan-city2`)
Problema: quando as sugestoes do Google falham (lab: 503; em producao: chave faltando, cota, rede) aparece "Google suggestions are unavailable. You can continue by typing." e logo acima "Choose a suggestion so the city includes its state." Digitei "Boston, MA" e Enter: o botao Continue continua desabilitado e nada e adicionado. Sem sugestao a pessoa nao consegue planejar rota nenhuma, e o texto afirma o contrario. Alem disso cada letra digitada dispara uma chamada que falha (5 chamadas 503 para "Boston").
Mudanca: ou (a) aceitar a cidade digitada no formato "Cidade, UF" quando as sugestoes estiverem indisponiveis (Enter/Continue adiciona o texto validando `^.+,\s*[A-Z]{2}$`), ou (b) trocar o texto para o que e verdade: en "Google suggestions are unavailable right now. Try again in a few minutes." / pt "As sugestoes do Google estao indisponiveis agora. Tente de novo em alguns minutos." / es "Las sugerencias de Google no estan disponibles ahora. Intenta de nuevo en unos minutos." Recomendo (a): o app promete isso. Em ambos: parar de repetir a chamada depois de uma falha 503 (desligar a consulta por 30 s).
Arquivos: `client/src/pages/xpot/XpotProspecting.tsx:935` (`addCity` so aceita sugestao), `:886` (`canAdvancePlanning`), `:1166` (`errorLabel`), `client/src/i18n/messages/prospecting.ts:56`.
Risco: aceitar texto livre muda a qualidade das buscas; decisao do dono. Recomendo (a) com a validacao "Cidade, UF".

### FLX-3 [S1] Acerto de consignacao cobra tudo como vendido se a pessoa nao contar
Telas: rep-both/en-phone/Sales > Consignments > Settle (`p6-32-settle`)
Problema: abri "Settle" do Copper Kettle Cafe (18 unidades no registro). O campo "Still on the shelf" vem em 0, a tela ja mostra "Sold since last visit 18 / They owe $63.00" e o botao verde "Settle $63.00" ja esta ativo, com pagamento "Paid / Cash". Quem toca em Settle sem contar registra 18 vendidas e $63 pagos. So uma dica cinza "count them" avisa. Digitando 10 na prateleira a conta vira 8 vendidas, $28.00 (certo).
Mudanca: o campo comeca vazio; enquanto vazio, nao mostrar "They owe" (mostrar "Count what is left on the shelf") e manter o botao desabilitado. Texto: en "How many are left on the shelf?" / pt "Quantas sobraram na prateleira?" / es "¿Cuántas quedan en el estante?". Botao: en "Settle" ate haver numero.
Arquivos: `client/src/pages/xpot/components/sales/ConsignmentDialogs.tsx:178` (`useState(0)`), `:186` (reset para 0), `:195` (preview), `:206` (`submit`).
Risco: nenhuma; so exige contar. Servidor ja valida `overCount`.

### FLX-4 [S1] "All pieces ... received into stock" ao lado de "2/4" e "Damaged"
Telas: platform/en-desktop/Production > pedido LPLATE-2026-010 (`p1-18-after-some-bad`, `p1-19-printed-details`) e lote (`p1-20-checkqr`)
Problema: depois de marcar 2 de 4 como ruins, a pagina do pedido diz "All pieces from this print job have been received into stock." e, no cartao ao lado, "IN STOCK 2/4". A tabela mostra 2 "Damaged". No lote: "RECEIVED 4/4 / Every piece is in" e "COMPANY STOCK 2". Quatro numeros dizendo coisas diferentes.
Mudanca: no pedido, quando houver danificadas: en "2 pieces are in stock. 2 were marked damaged." / pt "2 pecas estao no estoque. 2 foram marcadas como danificadas." / es "2 piezas estan en el stock. 2 se marcaron como danadas." No lote: "RECEIVED" deve contar so as boas, ou o subtitulo "Every piece is in" deve virar "2 good, 2 damaged".
Arquivos: `client/src/pages/admin/tags/production-job.tsx:201` (usa `receivedHint` quando `pending == 0`, ignora `damaged`), `client/src/i18n/messages/workspaces.ts:51`, cartao RECEIVED em `client/src/pages/admin/tags/BatchDetail.tsx` (texto "Every piece is in" em `client/src/i18n/messages/adminTagsFlow.ts`).
Risco: nenhum.

### FLX-5 [S2] Depois de "Some came out bad" nao ha como refazer so as ruins
Telas: platform/en-desktop/pedido Printed e peca Damaged (`p1-18`, `p1-33-damaged-piece`)
Problema: o pedido vira "Printed" com "Mark assembled" e "Check QR codes". As 2 ruins ficam so como etiqueta "Damaged"; o cartao da peca danificada nao tem nenhuma acao (nem "Print again"). "Print again" so existe quando NENHUMA peca foi recebida (o dialogo de falha diz isso). A pessoa tem que voltar a Production, escolher modelo, cor, face e quantidade de novo (5 cliques, 4 decisoes) para repor 2 pecas.
Mudanca: no pedido Printed com danificadas, botao "Print the 2 damaged again" (en) / "Imprimir de novo as 2 danificadas" (pt) / "Imprimir otra vez las 2 danadas" (es). Cria novo pedido do mesmo modelo/versao com quantidade = danificadas e abre a pagina dele.
Arquivos: `client/src/pages/admin/tags/production-job.tsx:201-210`, `server` rota `.../print-jobs/:id/redo` (`production.ts`).
Risco: serial novo para as repostas (as ruins ja saiu do estoque); sugestao e manter assim.

### FLX-6 [S2] Pedido que ainda nao tem arquivo pode ser marcado como impresso, e o botao muda de lugar
Telas: platform/en-desktop/Production, pagina do pedido "Waiting for the file" (`p1-08-job-open`, `p1-21-job011-other`, `p1-26-allgood`)
Problema: na lista o cartao "Waiting for the file" tem "Mark printed"; dentro do pedido o botao primario NAO aparece (so em "Other actions > Mark printed", ao lado de "Failed" e "Cancel order"). E nada impede: marquei como impresso e "all good" um pedido sem arquivo e as 3 pecas foram para o estoque (`available`) sem ter sido fatiado/impresso. Quando o arquivo esta pronto o botao primario aparece. Dois caminhos diferentes para a mesma acao.
Mudanca: sem arquivo, esconder "Mark printed" e deixar so "Cancel order". Se for necessario imprimir fora do sistema, texto: en "No file yet. Mark printed only if you printed it another way." com confirmacao. Manter o botao no mesmo lugar nos dois estados.
Arquivos: `client/src/pages/admin/tags/production-job.tsx:171` (menu), `:206` (so `journeyStep === 1`), `client/src/pages/admin/tags/production-orders.tsx` (cartao).
Risco: regra de negocio (impressao manual existe? "builder" bench/hand em `requestedBodyHand`). Recomendo confirmar com o dono e manter a confirmacao.

### FLX-7 [S2] "Download to print" abre aba nova com JSON cru quando falha
Telas: platform/en-desktop/pedido Ready to print (`p1-13-ready-job`, `p1-14-after-download`)
Problema: o botao e um `<a target="_blank">` direto para `/api/xpot/admin/print-files/:id`. No lab o storage nao esta configurado: devolve 503 `{"message":"File storage is not configured","code":"print_storage_unavailable"}` numa aba nova. A tela original nao muda nem avisa. O mesmo vale se o arquivo sumir ou a sessao expirar.
Mudanca: baixar com `fetch` e `blob` (ou testar com HEAD antes) e, em erro, toast: en "We couldn't get the file. Try again; if it keeps failing, upload it again." / pt "Nao foi possivel baixar o arquivo. Tente de novo; se continuar, envie o arquivo outra vez." / es "No se pudo descargar el archivo. Intenta de nuevo; si sigue fallando, sube el archivo otra vez."
Arquivos: `client/src/pages/admin/tags/production-job.tsx:205` e `:303`, `production-orders.tsx:110`.
Risco: nenhum.

### FLX-8 [S2] Gerar pecas: o resultado cai fora da tela
Telas: platform/en-desktop/Production (`p1-07-generated`)
Problema: depois de "Generate 3 pieces" o dialogo fecha e a pessoa continua em cima da pagina com os 4 cartoes grandes de modelo; so um toast de 3 segundos ("3 pieces generated, pending until printed"). O pedido novo esta abaixo da dobra ("Waiting to print"). Para baixar e imprimir, tem que rolar e procurar o codigo do pedido.
Mudanca: depois do 201 abrir direto a pagina do pedido (`/admin/tags/production/jobs/<id>`, o `id` vem na resposta) com o toast. Se preferir ficar na lista, rolar ate o cartao novo e destaca-lo.
Arquivos: `client/src/pages/admin/tags/production-generate.tsx` (onSuccess), `production-board.tsx`.
Risco: nenhum.

### FLX-9 [S2] Colocar uma placa no ar leva 8 passos e o chip some do fluxo
Telas: reseller/en-phone/Read a piece > Set up > pagina da peca (`p4-02` a `p4-08`)
Problema: caminho do dia a dia: Read a piece (1), digitar codigo (2), seta (3), Set up (4), digitar empresa (5), "Create company" (6, sem tocar nele o Save fica desabilitado sem motivo), colar link (7), Save and go live (8). Mais de 3 passos para algo diario. Pior: o resultado "Saved. The piece is live." e o botao grande "See performance" (peca com 0 leituras) nao dizem que o chip NFC esta "Not written"; quem encosta o celular na placa nao abre nada. O aviso "1 piece with its NFC chip not written" so existe na home. Dentro da peca, o passo a passo do NFC Tools fica em "More details". "Skip verifying" e "Lock chip" existem so no Android com Web NFC.
Mudanca: (a) "Read a piece" na home aceitar colar/escanear e ir direto a peca (ja faz), mas depois de "Save and go live" mostrar no topo da peca um cartao primario: en "Now write the chip, so tapping the plate works" + botao "Write chip" (Android) ou "Copy link for NFC Tools" (iPhone/desktop); "See performance" vira secundario enquanto 0 leituras. (b) Digitar nome ja existente/novo: aceitar Enter no campo da empresa para criar sem exigir o toque em "Create company".
Arquivos: `client/src/pages/tags/TagScreen.tsx`, `client/src/components/piece/ChipSection.tsx:9,170`, `client/src/pages/tags/LeadPicker.tsx` (Create company), `client/src/i18n/messages/tags.ts`.
Risco: nenhum.

### FLX-10 [S2] Botoes principais desabilitados sem dizer o motivo
Telas: reseller/en-phone/Set up this piece (`p4-05`), Change destination com `javascript:alert(1)` (`p4-12-bad-url`), rep-both/en-phone/Add company, New task (`p6-26-task-empty`), Read a piece com "abc" (`p9-04-short-code`)
Problema: "Save and go live" fica apagado com a empresa digitada mas nao criada; "Save new destination" apagado com link invalido; "Save company" e "Save task" apagados sem nome/titulo; o botao de abrir fica apagado com codigo curto. Nenhum diz o que falta. Em contraste, o "Create organization" usa o aviso nativo e a "Read a piece" com URL colada diz "Codes have 8 letters and numbers, e.g. A7K3P9X2." (bom).
Mudanca: sob cada botao desabilitado uma linha de ajuda que muda com o estado. Ex.: en "Tap \"Create company\" to use this name." / "That link isn't valid. Start with https://" / "Give the task a title." pt "Toque em \"Create company\" para usar este nome." etc. (3 idiomas em `tags.ts`/`visits.ts`).
Arquivos: `client/src/pages/tags/TagSaleDialog.tsx`/`ContentEditor.tsx` (link), `client/src/pages/xpot/XpotTasks.tsx` (New task), `client/src/pages/xpot/XpotLeads.tsx` (Add company).
Risco: nenhum.

### FLX-11 [S2] Finalizar visita: resultado vem em "Visited" mesmo com venda feita
Telas: rep-both/en-phone/Finish visit (`p6-10-finish`)
Problema: gravei uma venda ($25.98) nesta visita e, ao finalizar, o resultado marcado e "Visited", nao "Sale made". Quem so desliza para sair registra a visita sem resultado de venda (a lista de visitas anteriores mostra "Sale made" so quando escolhido). "Come back l..." aparece cortado.
Mudanca: se a visita tem venda, pre-selecionar "Sale made". Encurtar o rotulo: en "Come back" / pt "Voltar depois" / es "Volver luego".
Arquivos: `client/src/pages/xpot/XpotCheckIn.tsx` (dialogo Finish visit), `client/src/i18n/messages/checkin.ts`.
Risco: nenhum.

### FLX-12 [S2] Resumo da visita: "1 transactions · 0 pieces" com 2 placas vendidas
Telas: rep-both/en-phone/Visit summary (`p6-11-checkedout`)
Problema: vendi 2 "Small Plate" do catalogo e o resumo diz "SALES $25.98 / 1 transactions · 0 pieces". "pieces" conta so pecas com codigo (escaneadas), nao itens vendidos; a pessoa le "0 pecas" para uma venda de 2 placas. Plural errado ("1 transactions").
Mudanca: contar itens vendidos (quantidade das linhas) ou trocar o rotulo para "0 tagged pieces". Plural: en "{n} sale(s) · {m} item(s)". 
Arquivos: `client/src/i18n/messages/visits.ts:41`, `client/src/pages/xpot/components/VisitRow.tsx:180`.
Risco: nenhum.

### FLX-13 [S2] Planejador de rota cortado a direita no celular
Telas: owner/en-phone/Plan today's route (`p6-37-plan`)
Problema: em 390 px o texto "Choose up to five cities. Each city must include its state." termina cortado, o contador "1/4" e "0/5 cities" saem da tela. Medi: o container `flex flex-col p-4` termina em x=411, o resto em 395, em tela de 390.
Mudanca: o Dialog do planejador esta mais largo que a janela; tirar o `min-w` implicito (provavelmente do `<Button>` Continue + input na mesma linha) e usar `min-w-0` no flex pai; conferir `inFieldContinue` empilhado em < 400 px.
Arquivos: `client/src/pages/xpot/XpotProspecting.tsx:1113` (container), `:964` (`inFieldContinue`), `:170-171` (`PLANNER_FIELD`/`PLANNER_INPUT`).
Risco: nenhum.

### FLX-14 [S2] Tres contagens diferentes para o progresso da rota
Telas: rep-both/en-phone/Dashboard, Route, rota aberta (`p6-02-rep-app`, `p6-35-route-home`, `p6-13-route-reload`)
Problema: a mesma rota mostra "3 of 8 stops done" (Dashboard), "4 of 8 stops visited" (Route) e a lista de paradas mostra 2 "Done" + 1 "In visit". Parada pulada conta como feita/visitada.
Mudanca: "done" = concluidas; "skipped" contadas a parte. Textos: en "{n} of {total} stops visited, {k} skipped".
Arquivos: `client/src/pages/xpot/prospectingUi.ts:291-298` (`isStopDone` inclui `skipped`), `client/src/pages/xpot/XpotDashboard.tsx:103-104`, `XpotProspecting.tsx:913-915`, `i18n/messages/dashboard.ts:72`, `prospecting.ts:52`.
Risco: nenhum.

### FLX-15 [S2] Nota da visita so por voz
Telas: rep-both/en-phone/Visit note (`p6-04-note`, `p6-19-voice-stopped`, `p6-20-voice-upload`)
Problema: "Visit note" abre um dialogo que so tem o botao de gravar ("Tap to record voice notes"). Em lugar silencioso, com ruido, ou sem permissao de microfone, nao ha como escrever. Depois de gravar nao ha como ouvir antes de enviar ("Recorded (7s)", "Clear", "Upload"); depois de enviar, o dialogo volta ao estado inicial sem mostrar que ha uma nota salva (so um toast).
Mudanca: campo de texto abaixo do gravador: en "Or type a note" / pt "Ou digite uma nota" / es "O escribe una nota"; listar as notas ja salvas desta visita no dialogo.
Arquivos: `client/src/pages/xpot/components/VoiceRecorder.tsx`, `client/src/i18n/messages/checkin.ts`.
Risco: requer rota de nota por texto (a nota salva ja tem o campo `summary`).

### FLX-16 [S2] Duas abas: o dialogo muda sozinho e mantem o texto digitado
Telas: reseller/en-phone Set up this piece em duas abas (`p9-02-tabA-conflict`)
Problema: na aba B coloquei a peca no ar para "Other Tab Bistro". Na aba A, ainda com "Set up this piece" aberto e "@twintab" digitado, toquei Save: erro 409 `tag_pause_before_move` e o dialogo virou "Change destination" para "Other Tab Bistro" com a mensagem "Pause the piece before giving it to another customer." e "@twintab" ainda no campo. A pessoa nunca escolheu "outro cliente"; se tocar "Save new destination" grava @twintab no cliente da outra aba.
Mudanca: no 409 fechar o dialogo, recarregar a peca e avisar: en "This piece was just set up for Other Tab Bistro on another device. Review it before changing." / pt "Esta peca acabou de ser configurada para Other Tab Bistro em outro aparelho. Confira antes de mudar." / es "Esta pieza se acaba de configurar para Other Tab Bistro en otro dispositivo. Revisala antes de cambiar."
Arquivos: `client/src/pages/tags/TagSaleDialog.tsx`/`LeadPicker` (modo setup), `client/src/pages/tags/lib.ts` (`errorText`).
Risco: nenhum.

### FLX-17 [S2] Nomes internos aparecem para o usuario (slugs e codigo de pedido)
Telas: platform/en-desktop/Hand out > Wholesale orders (`p5-01-wholesale`), "Is this batch assembled?" (`p1-42-assembled`)
Problema: "plate-large · 10", "stand-large · 5", "plate-small · 8", "stand-small · 2" (slug do catalogo) em vez de "Large Plate x 10". O dialogo de montagem diz "These come off the parts' counts: 3 × g-token-flush-20, 3 × nfc-sticker-10x20" (ids de peca interna).
Mudanca: usar o nome do produto/peca ("Large Plate", "Google G token (flush)", "NFC sticker 10 x 20 mm"). Resolver por `sales_products.name` e `print_models.title`/parte.
Arquivos: `client/src/pages/admin/tags/kits-*.tsx` (Wholesale orders), `production-materials.tsx`/`production-job.tsx` (dialogo de montagem).
Risco: nenhum.

### FLX-18 [S3] Assistente "Generate": botao "Continue" morto nos passos 1 e 2
Telas: platform/en-desktop/Generate Large Plate (`p1-04-wizard2`)
Problema: escolher cor ou face avanca sozinho, mas o botao "Continue" fica apagado e visivel. Sao 4 etapas (cor, face, quantidade, revisao) para 3 respostas; o caminho curto e 5 cliques: modelo, cor, face, Continue, Generate. "Pieces: 1 print job: 3" no resumo e confuso.
Mudanca: esconder "Continue" nos passos de escolha unica; unir Quantidade e Revisao em uma tela; resumo: "3 pieces in 1 print".
Arquivos: `client/src/pages/admin/tags/production-wizard.tsx:205`, `production-generate.tsx`.
Risco: nenhum.

### FLX-19 [S3] Rotulos repetidos e ambiguos na tela de pedido
Telas: platform/en-desktop pedido Failed (`p1-24-after-failed`), "Cancel this order?" (`p1-28-cancel`), "Mark printed" (`p1-23-failed`)
Problema: pedido falho mostra "Failed" duas vezes + "Print again" no menu e no corpo (4 botoes iguais na lista de controles). O dialogo "Cancel this order?" tem "Cancel" e "Cancel order". O ultimo botao de "No, it failed" chama-se so "Failed". Botoes do menu "Other actions" ("Failed") sao nome de estado, nao acao.
Mudanca: "Failed" > "Mark as failed"; "Cancel" > "Keep order". Um so "Print again".
Arquivos: `production-job.tsx:171`, `production-printed-dialog.tsx`, `i18n/messages/workspaces.ts`.
Risco: nenhum.

### FLX-20 [S3] Outros achados de linguagem e acabamento (S3/S4)
- "With Kevin Brooks" para o proprio Kevin na peca dele (`p4-03-piece`): usar "With you". `TagScreen.tsx`.
- Linha da empresa cortada "Lowell ..." sobrepondo os chips "Ready, not live / Chip not written" em My pieces no celular (`p3-06`). Quebrar linha dos chips.
- "Your pieces come from Harbor Print Co.." com dois pontos (nome da organizacao ja termina em ponto): `i18n/messages/tags.ts:436`, cortar ponto final do nome.
- `/my` mostra "My plates" com a peca "Google Review · Large Stand" (stand, nao plate); rotulo "ct 3" cortado no eixo do grafico (`p8-02`). `pages/my/*`.
- New partner diz "Pair it ... on Tags › NFC writers" mas o menu chama "Chip writers" (`p7-15`, sidebar). Usar um so nome.
- Sales overview repete "SALES 30D 4 / 6 units" duas vezes (`p6-30`).
- Pessoa pendente: os chips "Visits · Tags" no topo e na lista aparecem mas os modulos estao desmarcados ("Choose at least one module.") (`p7-02-nora`). E o bloco "VISITS · XPHERE CRM" com "Inbound key / Outbound token (xph_...)" aparece para quem acabou de se cadastrar (`p7-03`).
- Dialogo "Read a piece" do revendedor nao aceita link colado ("Codes have 8 letters and numbers"), enquanto "Code or scanned link" do admin aceita.
- Cancelar o pedido deixa as pecas em `pending` para sempre no Stock ("Not in stock yet"); nenhum aviso.
- Voltar do navegador no meio do assistente sai da pagina (nao ha entrada de historico para o dialogo): `p9-06-back`.
- Logado em `/` ve a pagina de marketing com "Dashboard" e "Go to the app" (dois botoes para o mesmo lugar) (`p6-01`).
- Mensagem "This code expired. Ask for a new one." aparece para qualquer codigo errado em `/my` (nao existia codigo) (`p8-05`): "That code didn't work. Check it or ask for a new one."
- `overrideOutside`: "Northside Barbers's address" (`i18n/messages/checkin.ts:184`), "Barbers's".
- Toast de erro cobre o botao "Complete separation" (`p5-04`). Posicionar acima ou como InlineAlert no cartao.

## Notas de laboratorio (nao sao achados)
- Sem storage, sem Google Places/Maps, sem SMS: baixar arquivo, mapa e login por SMS nao foram concluidos.
- A visita seed de Blue Harbor tem `visit_id` nulo na parada da rota; por isso a parada continua "In visit" depois do check-out. Nao conto como bug.
- Geolocalizacao simulada em Boston; por isso o check-in em Cambridge pediu motivo (e funcionou).
