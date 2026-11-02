# Rodada 2: fluxos de ponta a ponta

Servidor localhost:2190, banco lab_r1, driver 9390. Cliques reais pela tela, texto da tela lido e banco conferido depois de cada passo. Imagens abertas: 0 (limite era 40). Chamadas de ferramenta: no teto de 120, por isso "aprovar pessoa" e "vender uma peca pelo Tags" ficaram de fora (ver fim).

Dados que mudei no banco (so este laboratorio): 4 pedidos de impressao novos (1 cancelado), 11 pecas novas, kit K-0011 entregue e 2 pecas recolhidas, pedido de atacado STU-10483 (Kevin, 8 placas pequenas) separado, peca EK5PYZJ4 posta no ar para "R2 Flow Cafe", peca TEHCV4DS no ar em Blue Harbor, visita 69 finalizada (2 vendas), consignacao 6 criada, acertada e encerrada. O teste de acesso, rodado como Priya (dona de Brightside, na propria empresa), assentou as consignacoes 3 e 5, devolveu 1 unidade da 5 e cancelou as vendas 3 e 4. Tudo isso era permitido a ela; deixo registrado porque mudou os numeros do laboratorio.

## Resultado por jornada

| Jornada | Passou? | Clique duplo | Acesso sem permissao |
|---|---|---|---|
| 1 Imprimir e receber: gerar 3 pecas, "algumas ruins" (2 de 3), refazer as ruins, cancelar, "tudo bom" | Passou. Banco bate: 1 `available`, 2 `damaged`; frase "1 piece is in stock. 2 were marked damaged." certa. Mas R2-FLX-1 e R2-FLX-9 | Gerar e marcar impresso (2 cliques com 40 ms): um so efeito | So plataforma entra |
| 2 Entregar a revendedor e recolher: 5 codigos (2 ruins), entregar 3, recolher 2 | Passou. Lista diz "3 ready, 2 can't go", kit K-0011, `rep_id`/`kit_id` certos; recolher zera os dois | Entregar e recolher: um so efeito (1 kit) | Revendedor, vendedor, dono, parceiro: 403 em kits, producao, atacado |
| 3 Atacado com separacao (Kevin, 8 placas pequenas) | Passou so na 4a tentativa: R2-FLX-2 e R2-FLX-3. Depois: "Done: Kevin Brooks has their pieces", fila de 3 para 2, 8 pecas com Kevin | Um so efeito | 403 em `fulfill` para revendedor, vendedor, dono, parceiro |
| 4 Configurar, gravar chip, pôr no ar (Android, EK5PYZJ4) | Passou. Banco: `active`, `social`, link certo; `/q/` e `/n/` redirecionam com utm. Gravar chip: R2-FLX-4 | "Save and go live" 2x: um so cliente criado | Revendedor so ve o que e dele |
| 5 Vender e consignacao (Jessica, visita 69) | Passou. Venda $17.99, deposito de 5, acerto de 3 vendidas = $15 (`consignment_settlement`), recolher 2 fecha. R2-FLX-5 e 7 | Registrar, deixar estoque, cobrar, recolher: um so efeito | Consignacao e venda de outro: 403. Dono: pode na propria empresa |
| 6 Aprovar pessoa | NAO FEITA (teto de chamadas) | - | - |
| 7 Visita: venda, nota, finalizar (deslizar da direita para a esquerda) | Passou: visita 69 `sale_made`, resumo "SALES $32.99 / 2 sales · 4 items". R2-FLX-6 e 8 | - | `/admin/work/dashboard` como vendedor: "Access restricted. This area is for company owners." com botao de volta |

## Achados

### R2-FLX-1 [S2] "Print the 2 damaged again" continua depois de usado e cria pedido duplicado
Jornada: Production > pedido LPLATE-2026-013 (3 pecas, 2 danificadas).
O que aconteceu: o botao cria LPLATE-2026-014 (2 pecas) e abre o pedido novo. Voltando ao pedido antigo o botao esta la de novo, sem nada que diga que ja foi refeito. Clicar outra vez criou LPLATE-2026-015 e mais 2 pecas `pending` (banco: 3 pedidos novos para os mesmos 2 defeitos). Nenhum dos novos diz que repoe pecas de outro pedido.
Mudanca: depois de refeito, o botao vira link: en "Reprinted as LPLATE-2026-014" / pt "Reimpresso em LPLATE-2026-014" / es "Reimpreso en LPLATE-2026-014". O servidor responde 409 se ja existe reposicao daquele pedido (guardar `redo_of` no pedido novo e procurar antes de criar). No pedido novo, linha: en "Replaces 2 damaged pieces from LPLATE-2026-013."
Arquivos: client/src/pages/admin/tags/production-job.tsx:235 (aparece sempre que `outcome === "damaged"`); rota POST /api/xpot/admin/print-jobs em server/tags.
Risco: nenhum de regra.
Status: feito. POST /api/xpot/admin/print-jobs/:id/reprint-damaged: o servidor conta as pecas danificadas, grava print_requests.replaces_job_id (migracao 0074) e, na transacao, com a impressao original travada, recusa o segundo pedido com 409 print_job_reprinted. A tela vira o link "Reprinted as REV-..." e o pedido novo diz "Replaces 2 damaged pieces from ...". Testes: integracao (dois pedidos ao mesmo tempo: 201 + 409, uma so solicitacao, replaces/reprintedBy, reposicao cancelada libera de novo, sem danificadas = 409) e unidade (damagedToReprint). Visto: duplo clique real deu 409 + 201 e um so pedido no banco

### R2-FLX-2 [S2] Atacado: peca de outro produto aparece "Ready" e so e recusada no fim
Jornada: Hand out > Wholesale orders > Kevin, "Small Plate × 8" (STU-10483).
O que aconteceu: colei 6 placas pequenas, 1 grande e 1 codigo inexistente. A lista mostrou a grande como "LPLATE-2026-003 #4 · Large Plate / Ready" e o rodape "7 of 8 codes". Troquei o inexistente por outra placa grande: 8 de 8 e botao "Give 8 pieces to Kevin" habilitado. Ao clicar, 409 `acquisition_product_mismatch` ("The chosen pieces don't match this order's products."), sem dizer quais. A tela prometeu "Ready" e a acao foi recusada.
Mudanca: comparar cada codigo com as linhas do pedido na propria checagem: en "Not part of this order: this is a Large Plate" / pt "Fora deste pedido: e uma Placa Grande" / es "Fuera de este pedido: es una Placa Grande"; so contar como pronto o que cabe. Mostrar "6 of 8 small plates" por produto quando houver mais de uma linha.
Arquivos: client/src/pages/admin/tags/kits-orders.tsx (contagem "N of M codes" e lista), client/src/pages/admin/tags/code-check-list.tsx; mensagem em client/src/i18n/messages/apiErrors.ts:127.
Risco: nenhum.
Status: feito. A checagem do pedido de atacado (POST tag-acquisitions/:id/check) compara cada código com as linhas do pedido e recusa por nome: "Not in this order: <produto>" ou "The order is already complete for <produto>"; o cartão só conta como pronto o que cabe. Regra em shared/tagAcquisition.ts (matchOrderPieces), usada também por fulfillAcquisition; testes em tests/tags/tagAcquisition.test.ts e tests/tags/wholesale-fulfill.integration.test.ts. Visto em en desktop e phone. Com mais de uma linha o rodapé mostra "Produto 6/8 · Produto 0/2" (só testado no servidor).

### R2-FLX-3 [S3] Tentativa recusada de separar queima numero de kit
Jornada: a mesma, 3 tentativas recusadas (409) antes da certa.
O que aconteceu: o kit entregue na mao foi K-0011 e o do atacado saiu K-0015. K-0012, K-0013 e K-0014 nao existem no banco (`tag_kits` vai de 11 direto a 15): cada tentativa recusada consumiu um numero. Quem confere lista de separacao por numero acha que faltam kits.
Mudanca: validar produto e estoque antes de reservar o numero, ou numerar so na confirmacao, dentro da mesma transacao.
Arquivos: server/tags/acquisitions.ts (fulfill) e a geracao de `kit_number` em server/tags.
Risco: causa inferida pelo banco; nao li a geracao do numero a fundo. Confirmar se e sequencia do Postgres.
Status: feito. kit_number vem de uma sequência do Postgres (default nextval) e o kit era inserido antes de checar o produto; agora a conferência roda antes do insert. Teste de integração confere que a sequência não anda numa recusa e que o kit seguinte recebe o próximo número.

### R2-FLX-4 [S2] Chip gravado nao e registrado enquanto a pessoa nao confirma ou pula
Jornada: peca EK5PYZJ4 > Write chip > Write now (Android).
O que aconteceu: a tela diz "Written. Move the chip away from the phone, then touch the same chip again to confirm." O banco, nesse momento, ainda diz `nfc_provisioning_status = not_programmed`, sem data. So depois de "Skip verifying" (ou do segundo toque) vira `programmed`. Se a pessoa fechar a folha, ou o celular travar nessa espera, o chip esta gravado mas o sistema continua pedindo "Write chip". O fim de "Skip verifying" diz "Chip marked as written / Not verified." e oferece "Lock chip".
Mudanca: gravar `programmed` logo depois da gravacao e usar a leitura so para subir para `verified`. Texto da espera: en "Written. Touch it again to check it." Se fechar antes, a peca fica "Written, not checked".
Arquivos: client/src/pages/tags/WriteSheet.tsx:113-127 (`report` so depois de `readBack`), client/src/components/piece/ChipSection.tsx:89.
Risco: pequeno; `programmed` hoje significa "gravado sem conferir".
Status: feito (WriteSheet registra a gravação assim que o chip tem o link, antes do segundo toque; verificado: banco fica programmed na espera e depois de fechar; só gravação de peça Xpot, a gravação direta continua um registro só)

### R2-FLX-5 [S1] Vendedor ainda ve "Profit" ao contar e cobrar a consignacao
Jornada: Jessica (vendedora de Brightside) > visita > Sales > Count and bill, 2 sobraram de 5.
O que aconteceu: ao digitar o que sobrou aparece "Sold since last visit 3 / They owe $15.00 / Profit $11.40", na frente do cliente. Da para deduzir o custo ($1,20 por unidade). Regra do plano: vendedor nao ve lucro nem custo. E o R2-VIS-1; confirmo que ainda esta assim neste servidor.
Mudanca: mostrar "Profit" so para quem pode (`useShowProfit()`).
Arquivos: client/src/pages/xpot/components/sales/ConsignmentDialogs.tsx:262.
Risco: nenhum, decisao ja tomada.
Status: feito (= R2-VIS-1)

### R2-FLX-6 [S3] Finalizar visita abriu em "Talked" mesmo com duas vendas feitas na mesma tela
Jornada: Jessica vendeu e deixou estoque pela caixa "Sales" da visita, fechou a caixa e tocou "Finish visit" sem recarregar.
O que aconteceu: o resultado marcado era "Talked", nao "Sale made". Depois de recarregar a pagina o mesmo botao abriu com "Sale made". O padrao so olha `visitSales` do dado em memoria (`visitHasSale`, XpotCheckIn.tsx:392) e esse dado nao estava atualizado depois de gravar a venda. Quem so desliza registra a visita sem resultado de venda. Confianca media: visto uma vez; o recarregamento confirma a diferenca.
Mudanca: refazer a consulta de visitas antes de abrir "Finish visit", ou calcular o padrao no clique contra dado novo.
Arquivos: client/src/pages/xpot/XpotCheckIn.tsx:388, 392, 531; client/src/pages/xpot/visitRules.ts:95; client/src/pages/xpot/components/sales/VisitActions.tsx:88-90.
Risco: nenhum.
Status: feito (causa: vendas e consignações não invalidavam a lista de visitas; agora invalidam)

### R2-FLX-7 [S3] "Method" mostra "—" mas a venda sai como dinheiro
Jornada: nova venda ($17.99, Paid) e acerto ($15.00, Paid), sem escolher o metodo.
O que aconteceu: o campo Method fica em "—". O banco grava `payment_method = cash` nas duas (vendas 23 e 24). Tela e registro dizem coisas diferentes.
Mudanca: pre-selecionar "Cash" ou exigir a escolha quando Paid; se for opcional, gravar nulo e mostrar "Not said".
Arquivos: dialogo de venda e client/src/pages/xpot/components/sales/ConsignmentDialogs.tsx; padrao no servidor em server/routes/xpot/sales.ts.
Risco: regra de negocio leve; recomendo pre-selecionar "Cash".
Status: feito (nada mais vem em dinheiro sem o meio ser escolhido)

### R2-FLX-8 [S3] "Delete visit" nao diz o que acontece com as vendas da visita
Jornada: visita 69 finalizada, com 2 vendas ($32.99) > Delete visit.
O que aconteceu: "This will permanently delete this visit record and cannot be undone." Nao fala das vendas. O banco tem `ON DELETE SET NULL` em vendas, entao elas ficam sem visita e a empresa perde o historico de que foram vendidas ali. O botao fica a vista de qualquer vendedor logo apos finalizar.
Mudanca: com vendas, texto: en "The 2 sales ($32.99) stay in Sales but are no longer linked to a visit." / pt "As 2 vendas ($32,99) ficam em Vendas, mas deixam de estar ligadas a uma visita." / es "Las 2 ventas ($32,99) quedan en Ventas, pero ya no se ligan a una visita." Esconder o botao em um menu "More" quando ha venda.
Arquivos: pagina de detalhe da visita (client/src/pages/xpot/XpotVisits.tsx), deleteSalesVisit em server/storage.ts:756.
Risco: nenhum.
Status: feito em parte (texto diz o que acontece com as vendas); PENDENTE: esconder o botão num menu quando há venda

### R2-FLX-9 [S3] Cancelar impressao: dois botoes "Cancel" e pecas ficam em "Not in stock yet"
Jornada: pedido LPLATE-2026-015 > Other actions > Cancel this print.
O que aconteceu: o dialogo tem "Cancel" (fecha) e "Cancel this print" (cancela), lado a lado. Depois de cancelar, as 2 pecas continuam `pending` no banco e entram no contador "Not in stock yet" do Stock. A pagina do pedido cancelado diz "Nobody will print this. Print it again if you still need it."
Mudanca: botoes en "Keep it" / "Cancel this print". No Stock, pecas de pedido cancelado aparecem como "Cancelled print" (pt "Impressao cancelada"), fora de "Not in stock yet".
Arquivos: client/src/pages/admin/tags/production-job.tsx (dialogo de cancelar), client/src/pages/admin/tags/where-model.ts (contagem de `pending`).
Risco: nenhum.
Status: feito em parte. O dialogo ja tinha "Keep the print" / "Cancel this print" (mantido: mais claro que "Keep it"). Pendente: pecas de impressao cancelada continuam em "Not in stock yet" no Stock (contagem `pending` em shared/tagMetrics e where-model, da frente de estoque); decisao do dono: virar "Cancelled print" ou aposentar os codigos

### R2-FLX-10 [S4] Nome do modelo muda entre API e tela
O modelo vem da API como "Plate Large · Instagram · White" e a tela mostra "Large Plate · Instagram · White". Quem procura pelo nome do servidor (log, mensagem) nao acha o da tela. Arquivos: `print_models.title` (seed) contra o rotulo montado em client/src/pages/admin/tags/production-model.tsx.

## Notas

| Tela/passo | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| Pedido de impressao depois de "algumas ruins" | Saber o que foi para o estoque e refazer | 7 | R2-FLX-1, 9 |
| Hand out > Wholesale orders | Separar o pedido certo | 6 | R2-FLX-2, 3 |
| Gravar chip (Android) | Chip gravado e sistema sabendo | 6 | R2-FLX-4 |
| Count and bill (vendedor) | Quanto o cliente deve | 5 | R2-FLX-5, 7 |
| Finish visit | Dizer como foi e sair | 7 | R2-FLX-6 |
| Delete visit | Nao perder dado por engano | 6 | R2-FLX-8 |

## O que passou, sem achado
Gerar pecas (abre direto a pagina do pedido), "Some came out bad" com contagem certa, Hand out com checagem por codigo, Take back com confirmacao e banco zerado, Set up com cliente novo digitado e Enter, redirecionamento `/q/` e `/n/` com utm, venda ligada a visita, deposito de consignacao, acerto com campo vazio ate contar, recolher e encerrar, deslizar para sair.

Clique duplo em 8 acoes de dinheiro e estoque: todas tiveram um unico efeito (o botao desabilita no primeiro clique). A unica duplicacao e a de R2-FLX-1, que acontece voltando ao pedido.

Acesso pela URL (via `fetch` com a sessao de cada perfil): revendedor (so Tags) recebeu 403 `module_off` em consignacao e venda e 403 em toda rota de administracao; vendedor (Jessica) 403 em consignacao e venda de colega e em administracao; dono (Priya) so mexe na propria empresa (403 em consignacao de outra empresa); parceiro 403 em empresa alheia. Nenhum furo encontrado.

## Nao feito (limite de chamadas)
Aprovar pessoa (jornada 6), vender uma peca pelo Tags (dialogo de venda do revendedor) e recusar pessoa. Na rodada 1 as duas primeiras passavam.
