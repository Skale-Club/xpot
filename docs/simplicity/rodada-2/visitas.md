# Rodada 2: visitas e vendas em campo

Imagens: `.lab/shots/r2`. Código citado a partir de `client/src`, salvo quando começa com `server/`.

Conferido contra o seed antes de virar achado. Três coisas parecem erro na tela e são do seed, então **não** contam: empresa "In talks" ou "Prospect" com venda ou estoque (venda e consignação de verdade promovem para Customer, `server/routes/xpot/sales.ts:161` e `consignments.ts:133`); o `$42` cobrado em Copper Kettle fora de Sales (o seed grava o movimento sem a venda; no fluxo real vira venda); `Customer changed their mind` como motivo de cancelamento.

## Notas

| Tela | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| Dashboard de Visits (`visits-dashboard`) | Começar ou voltar à visita | 8 | "±15 m" sem nome no celular |
| Check-in com empresa escolhida (`visits-checkin-new`) | Deslizar e começar | 8 | Título "Current visit" sem visita (R2-VIS-31) |
| Visita em andamento (`visits-checkin-in-progress`) | Vender ou cobrar nesta empresa | 6 | Sair de "Sales" + "Sell a piece" para ações diretas (R2-VIS-15) |
| Finalizar visita (`visits-finish-visit-form`) | Dizer como foi e sair | 6 | Rótulo cortado e dois nomes para a mesma ação (R2-VIS-18) |
| Lista de empresas no celular (`visits-leads`) | Achar a empresa e fazer check-in | 5 | Check in à vista, cartão mais curto (R2-VIS-16) |
| Lista de empresas no computador | Achar a empresa e fazer check-in | 7 | Check in que não mente com visita aberta (R2-VIS-17) |
| Empresa (`visits-lead-*`) no celular | Check in e vender | 6 | New sale acima da barra (R2-VIS-23) |
| Empresa no computador | Check in e vender | 7 | Tiles zerados, "On shelf" repetido |
| Rota (`visits-route*`) | Próxima parada | 8 | Dois nomes para abrir o mapa (R2-VIS-37) |
| Histórico (`visits-history*`) | Rever o que aconteceu | 7 | VIS-12 pendente, duas palavras para fora do local (R2-VIS-22) |
| Detalhe da visita no celular | Resultado e nota | 6 | 300px de horários antes do resultado (R2-VIS-32) |
| Tarefas (`visits-tasks`, `panel-work-tasks`) | Marcar o que fez | 5 | "Done" em toda tarefa aberta (R2-VIS-19) |
| Sales › Overview para vendedor | Quanto vendi | 7 | Dois totais lado a lado (R2-VIS-24) |
| Sales › Overview no painel (`panel-work-sales`) | Quanto a equipe vendeu | 4 | Número principal é um lucro falso (R2-VIS-5) |
| Sales › Sales | Achar uma venda | 8 | Lista boa; "Sold in: all" confuso (R2-VIS-13) |
| Sales › Consignments no celular | Contar e cobrar | 6 | Vocabulário (R2-VIS-12) |
| Sales › Consignments no computador | Contar e cobrar | 4 | Nome da loja cortado (R2-VIS-8) |
| Sales › Deals | Negócios abertos | 3 | Ganho e perdido sem status, em verde (R2-VIS-6) |
| Contar e cobrar (`stock-settle-dialog*`) | Quanto devem | 4 | Lucro para vendedor, sem loja no título, "Paid" já marcado (R2-VIS-1, 7, 9) |
| Contou a mais (`stock-settle-dialog-over-count`) | Corrigir e seguir | 3 | Beco sem saída em jargão (R2-VIS-10) |
| Recolher (`stock-take-back-dialog`) | Dizer quanto levo | 4 | Um toque recolhe tudo e encerra (R2-VIS-11) |
| Detalhe da venda (`sale-detail-*`) | Situação do pagamento | 7 | Cartões vazando, "Unpaid" em venda cancelada (R2-VIS-30, 33) |
| Team results (`panel-team-results*`) | Como a equipe foi | 4 | Tiles abrem outro número ou tela proibida (R2-VIS-2, 3, 20) |
| Empresas no painel (`panel-work-leads`) | Situação da carteira | 5 | "Last visit" vazio para o dono, "My companies" falso (R2-VIS-4, 14) |

## S1

### R2-VIS-1 [S1] Vendedor vê o lucro ao cobrar a consignação
Telas: rep-both/en-phone/stock-settle-dialog-counted, rep-both/en-desktop/stock-settle-dialog-counted; rep-both/en-phone/sale-detail-cancel-confirm
Problema: a decisão do plano é "Vendedor não vê lucro nem custo". Jessica é vendedora e, ao contar 8, lê "Profit $23.00" logo abaixo de "They owe $35.00". É na frente do cliente, com o celular na mão, e dá para calcular o custo da peça (`$1,20`). Todas as outras telas de venda respeitam `useShowProfit`; este diálogo não. No mesmo tema, o aviso de cancelar venda diz ao vendedor "stops counting toward revenue and profit".
Mudança: mostrar a linha "Profit" só com `useShowProfit()`. Texto de `cancelSaleDesc` para quem não é gestor: en "The sale stays in the history as cancelled and no longer counts as sold. Pieces sold in it are no longer marked as sold." / pt "A venda fica no histórico como cancelada e deixa de contar como vendida. As peças dela deixam de constar como vendidas." / es "La venta queda en el historial como cancelada y deja de contar como vendida. Sus piezas dejan de figurar como vendidas."
Arquivos: pages/xpot/components/sales/ConsignmentDialogs.tsx:262; i18n/messages/salesModule.ts:120, 213. O servidor também devolve `profitCents` do cálculo: conferir `settleCount.ts`, que é local.
Risco: nenhum, é decisão já tomada.
Status: feito (servidor tira custo e lucro das respostas de produtos, vendas e consignações para quem não é dono; diálogo e texto do cancelamento; testes)

### R2-VIS-2 [S1] Em Team results, "Active reps" e a linha do vendedor levam dono e parceiro a "Access restricted"
Telas: owner/en-desktop/panel-team-results-owner, owner-multi/en-desktop/panel-team-results-owner, partner/en-desktop/panel-team-results, partner/en-phone/panel-team-results; destino em owner/en-desktop/restricted-people
Problema: o tile "3 ACTIVE REPS" tem seta e cada linha de "By rep" é clicável. Ambos navegam para `/admin/reps`, e a captura dessa rota com o dono mostra "Access restricted. Only the platform can open this screen." É a tabela principal da tela de quem gere a equipe e todas as linhas dão em parede. Li o destino no código e na captura da rota; a captura não clica no tile.
Mudança: fora da plataforma, o tile abre o item Team do menu (`/organizations/<id>?tab=team`; dono de várias empresas, My companies) e a linha abre a pessoa dentro da organização (a tela `org-brightside-person` já existe). Plataforma continua em `/admin/reps`.
Arquivos: pages/admin/AdminOverview.tsx:27, 113, 154, 179
Risco: nenhum de regra. A rota da pessoa pede o id da organização, que o dono de várias precisa escolher pela linha.
Status: feito (tile abre Team da organização; linha abre a pessoa na organização; plataforma segue em /admin/reps)

### R2-VIS-3 [S1] Team results diz 9 tarefas e 36 visitas; o toque abre 2 tarefas e 10 visitas
Telas: owner/en-desktop/panel-team-results-owner contra owner/en-desktop/panel-work-tasks e owner/en-desktop/visits-history; platform/en-desktop/panel-team-results contra platform/en-phone/panel-work-tasks
Problema: é a regra 5 do plano. Dono: "9 PENDING TASKS" abre Tasks com 2 (1 atrasada, 1 de hoje), porque "Whole team" é um botão que nasce desligado, mesmo no painel "My company". Plataforma: "12" abre 2. As outras 7 são da Jessica, e o dono conclui que sumiram. Visitas: "36 VISITS" abre `/admin/work/dashboard/history`, e `GET /visits` sem `repId` devolve só as do próprio dono (10). A plataforma não tem esse problema de visitas, porque o escopo é "everyone". O destino das visitas li no código: não há captura do histórico dentro do painel.
Mudança: dentro do painel, Tasks nasce com a equipe toda e o botão vira "Only mine". No histórico, `/visits` no modo gestão devolve as visitas da organização do dono, com o filtro de vendedor já existente. O tile manda `?team=1`.
Arquivos: pages/xpot/XpotTasks.tsx:206; pages/admin/AdminOverview.tsx:28, 32; server/routes/xpot/visits.ts:31; pages/xpot/XpotVisits.tsx:68
Risco: muda escopo de leitura no servidor. Recomendo fazer: o dono já vê essas visitas pessoa a pessoa.
Status: feito (Tasks do painel nascem com a equipe e 'Only mine'; /visits em modo gestão devolve o histórico da equipe; tiles de dono batem 36/36, 10/10, 14/14). Resíduo: plataforma conta só quem usa Visits (66 contra 70 visitas, 13 contra 14 tarefas, 21 contra 22 vendas); decisão antiga do desenho, mantida

### R2-VIS-4 [S1] Para o dono, empresas que a equipe visitou ontem aparecem sem última visita
Telas: owner/en-desktop/panel-work-leads, owner/en-phone/panel-work-leads, contra rep-both/en-desktop/visits-leads e platform/en-desktop/panel-work-leads
Problema: Maple Street Bakery, Greenline Dental, Harvard Square, Copper Kettle e Northside mostram "—" em LAST VISIT para o dono. A vendedora e a plataforma veem Nov 2, Nov 2, Nov 1, Oct 23 e Oct 26. O dono lê que ninguém foi lá. A coluna é montada com a lista de visitas de quem está olhando (R2-VIS-3). O efeito se estende: ordenar por última visita fica errado e o selo "Follow-up" que depende do último resultado some (Cambridge Pet Spa tem o selo na vendedora e na plataforma, e não no dono).
Mudança: a coluna usa `lead.lastVisitAt`, que já existe na empresa e é o que `OrganizationPerson.tsx:172` usa. O selo de follow-up vem do servidor, ou é resolvido com a correção de R2-VIS-3.
Arquivos: pages/xpot/XpotLeads.tsx:249, 280; pages/xpot/components/leads/LeadsTable.tsx:234; shared/schema/sales.ts:191
Risco: nenhum.
Status: feito (última visita da empresa + histórico da equipe no painel)

### R2-VIS-5 [S1] O número principal do painel é um "lucro" com 100% de margem, e não bate com Team results
Telas: owner/en-desktop/panel-work-sales, platform/en-desktop/panel-work-sales, partner/en-desktop/panel-work-sales, partner/en-phone/panel-work-sales; owner-multi/en-desktop/panel-work-sales
Problema: Team results diz "$6,823.00 SALES". O toque abre "PROFIT · 30D $6,775.00 … 99% margin"; na plataforma, "$10,712 … 100% margin"; no parceiro, "$1,296 … 100% margin". Não é lucro: serviço digital não tem custo (VIS-30 tirou o campo), então só o `Large Stand` desconta alguma coisa. O dono acredita que ganha 100%. O gráfico "Profit per day" é o mesmo do faturado, e cada produto repete o valor em verde ("$5,988.00" / "$5,988.00 profit"). A mesma venda se chama Sold para o vendedor, Sales em Team results, billed e Profit no painel.
Mudança: o número principal é igual para todos e igual a Team results: en "Sold · 30 days" / pt "Vendido · 30 dias" / es "Vendido · 30 días", `$6,823.00`, "12 sales · 19 units". "Sold per day" no gráfico. O segundo tile vira "Sold · this month". Lucro fica só em "More details", e só onde há custo: en "Profit on products with a cost: $42 of $90" / pt "Lucro nos produtos com custo: $42 de $90" / es "Ganancia en productos con costo: $42 de $90". A linha verde por produto só aparece quando o produto tem custo.
Arquivos: pages/xpot/components/sales/SalesOverview.tsx:97-103, 142-154, 164, 179-186, 284; i18n/messages/salesModule.ts:219-239
Risco: é mudança de produto, mas o número atual é errado. Recomendo fazer sem esperar. A diferença de `$149` na plataforma (19 vendas contra 20) já é a pendência VIS-18 e não está contada aqui.
Status: feito (número principal é vendido, igual a Team results; lucro só em More details e só em produtos com custo; sem custo, diz que falta). Cálculo do lucro NÃO mudou: 100% de margem vinha de custo não informado

### R2-VIS-6 [S1] Deals lista negócio ganho e perdido sem status, com o valor em verde
Telas: rep-both/en-phone/visits-sales-pipeline, platform/en-phone/visits-sales-pipeline, owner/en-desktop/visits-sales-pipeline
Problema: a vendedora vê "Deals 3" e soma `$3,576`. Um deles, "Business website, Maple Street Bakery $1,299", já foi ganho e virou a venda de Nov 2. Na plataforma, "Stand + GBP setup $199" está perdido e aparece igual, em verde. Nenhum cartão diz a etapa ou a situação. Conta certa só por acaso: Team results diz "3 open, $3,576" para a equipe do dono, com outros três negócios. Além disso, Team results chama de "OPEN OPPORTUNITIES" o que a aba chama de "Deals". E `/sales/pipeline/:id` não abre nada: `visits-sales-pipeline-detail` é byte a byte igual à lista, enquanto sale-detail e stock-detail abrem.
Mudança: lista nasce só com os abertos e título "Open deals {n}" / "Negócios abertos {n}" / "Negocios abiertos {n}", com chips Open, Won, Lost. Cartão mostra a etapa; perdido em cinza, ganho com selo. Em Team results, "Open deals" / "Negócios abertos" / "Negocios abiertos" no lugar de "Open opportunities". A rota com id abre o diálogo.
Arquivos: pages/xpot/XpotSales.tsx:195, 223, 293; i18n/messages/sales.ts:34, 52; i18n/messages/manage.ts:29, 245, 451
Risco: nenhum.

## S2
Status: feito (abertos por padrão, chips Open/Won/Lost com contagem, status no cartão, perdido em cinza, /sales/pipeline/:id abre o diálogo)

### R2-VIS-7 [S2] Contar, cobrar e recolher não dizem em qual loja
Telas: rep-both/en-phone/stock-settle-dialog, stock-settle-dialog-counted, stock-take-back-dialog
Problema: o título é "Count and bill: 3D Printed Keychain". Na lista há duas lojas com o mesmo produto, e o vendedor com pressa vai cobrar ou recolher na errada sem nada que o avise. O recolher diz "18 on record here": "here" onde? Esse é um registro de dinheiro que não se cancela (`settlement_sale_not_cancellable`).
Mudança: título com a loja e o produto embaixo: "Copper Kettle Cafe" / "Count and bill · 3D Printed Keychain" (pt "Contar e cobrar · …", es "Contar y cobrar · …"). O mesmo em Take back e Correct stock. "Leave stock — {name}" já faz isso.
Arquivos: pages/xpot/components/sales/ConsignmentDialogs.tsx:226, 337, 384; i18n/messages/salesModule.ts:111, 129, 136
Risco: nenhum.
Status: feito (empresa no título, ação e produto embaixo)

### R2-VIS-8 [S2] Em tela de 1440px, a tabela de consignação corta o nome da loja
Telas: rep-both/en-desktop/visits-sales-stock, owner/en-desktop/visits-sales-stock-detail
Problema: a coluna SHOP mostra "Copper ...", "Pho Saig...", "Beacon...", e o produto "3D Printed K...". É a informação que identifica a linha. A página ainda reserva 420px para um quadro vazio "Pick a consignment".
Mudança: sem linha escolhida, a tabela ocupa a largura toda e o quadro não existe. Na linha: "Count and bill" e um menu de três pontos com Restock e Take back; nome em até duas linhas, nunca cortado.
Arquivos: pages/xpot/components/sales/tables.tsx:100-110, 139-149; pages/xpot/components/sales/SalesLists.tsx
Risco: nenhum.
Status: feito (tabela em largura total sem linha escolhida, nome em duas linhas, menu com Leave stock e Take back)

### R2-VIS-9 [S2] Cobrança já vem marcada como "Paid" em "Cash"
Telas: rep-both/en-phone/stock-settle-dialog-counted
Problema: a tela diz "They owe $35.00", com Payment já em "Paid" e Method em "Cash", e o botão "Bill $35.00". Quem tem pressa aperta e registra dinheiro que não recebeu. Depois, "To collect" fica sem esses `$35` e a venda de acerto não pode ser cancelada. "Bill" e "Paid" também se contradizem.
Mudança: trocar select e botão por duas ações. en "They paid $35.00" / "They'll pay later"; pt "Pagaram $35,00" / "Vão pagar depois"; es "Pagaron $35.00" / "Pagarán después". "Pagaram" pede o meio em chips (Cash, Card, Other) e "Part of it" fica num link.
Arquivos: pages/xpot/components/sales/ConsignmentDialogs.tsx:182-183, 281-296
Risco: regra de negócio pequena, recomendo fazer. A nova venda (`SaleDialog`) deve seguir o mesmo; não há captura dela, veja "Fora das imagens".
Status: feito na tela e no novo diálogo de venda (nada vem pago; 'They paid' pede o meio, 'They'll pay later' não registra nada recebido). PENDENTE para o dono: a API ainda trata cobrança sem paymentStatus como paga; decidir se passa a exigir o campo

### R2-VIS-10 [S2] Contou a mais: mensagem técnica e beco sem saída
Telas: rep-both/en-phone/stock-settle-dialog-over-count
Problema: "You counted more than the 18 on record. Record an adjustment first so the ledger matches the shelf, then settle." "adjustment", "ledger" e "settle" não aparecem em nenhum botão. Não há ação nem mesmo Bill: a pessoa precisa fechar, abrir o cartão e achar "Correct stock". Em pt, "acerto" e "histórico".
Mudança: en "The shelf has more than the 18 we have on record. Correct the count first." / pt "Na prateleira há mais que as 18 do nosso registro. Corrija a contagem primeiro." / es "En el estante hay más que las 18 registradas. Corrige el conteo primero." Abaixo, botão "Correct stock" que abre a correção já com a diferença preenchida.
Arquivos: i18n/messages/salesModule.ts:117, 400, 675; pages/xpot/components/sales/ConsignmentDialogs.tsx:248, 384
Risco: nenhum.
Status: feito (texto novo e botão Correct stock com a diferença preenchida)

### R2-VIS-11 [S2] "Take back" recolhe tudo e encerra com um toque, sem cobrar
Telas: rep-both/en-phone/stock-take-back-dialog
Problema: abre com "18" preenchido, "Close this consignment" marcado e o botão "Take back 18". Se 6 foram vendidas, um toque apaga a dívida: as unidades voltam como recolhidas e ninguém cobra. O botão fica ao lado de "Count and bill" em cada cartão. "Consignment" é palavra que o vendedor não diz.
Mudança: campo começa vazio, com a pergunta en "How many are you taking back?" / pt "Quantas você está levando?" / es "¿Cuántas te llevas?". Aviso fixo: en "Anything sold since the last count is not billed here. Use Count and bill for that." / pt "O que foi vendido desde a última contagem não é cobrado aqui. Para isso, use Contar e cobrar." / es "Lo vendido desde el último conteo no se cobra aquí. Para eso usa Contar y cobrar." A opção de encerrar só aparece quando a quantidade é tudo o que está lá: en "Nothing stays here. Stop leaving stock at this company" / pt "Não fica nada. Parar de deixar estoque nesta empresa" / es "No queda nada. Dejar de dejar stock en esta empresa". Fora do cartão, Take back vai para o menu.
Arquivos: pages/xpot/components/sales/ConsignmentDialogs.tsx:333, 341-344; pages/xpot/components/sales/cards.tsx:166; i18n/messages/salesModule.ts:129-134
Risco: nenhum.
Status: feito (campo vazio, aviso fixo, encerrar só quando é tudo, Take back no menu)

### R2-VIS-12 [S2] Consignação: cada ação tem três nomes
Telas: rep-both/en-phone/visits-sales-stock, visits-sales-stock-detail, stock-settle-dialog-counted, visits-sales-overview, visits-dashboard; platform/es-desktop/visits-sales-stock-detail
Problema: a mesma coisa aparece assim, às vezes na mesma tela:
- Deixar peças: "Leave stock", "Restock", "Leaving more today", "Left stock".
- Contar: "Count and bill", "Settled", "SETTLEMENT OVERDUE", "2 settlements overdue", "2 shops to count and bill", "Next count". Em pt: "Contar e cobrar", "acerto"; em es: "Contar y cobrar", "Liquidación", "liquida".
- Quantidade: "on shelf", "On record", "Units on consignment", "shelf 30 → 18".
- Resultado: "Sold", "Billed", "Sold since last visit" (a última visita pode não ter tido contagem).
Mudança: en "Leave stock" é um só; "Restock" sai do cartão, e "Leaving more today" vira "Leave more today". "Count and bill" é a ação; "Counted and billed" no histórico; "SETTLEMENT OVERDUE" vira "Late to count"; "2 settlements overdue" vira "2 companies late to count". "On record" vira "Last count"; "Sold since last visit" vira "Sold since last count". pt: "Deixar estoque", "Deixar mais hoje", "Contar e cobrar", "Contado e cobrado", "Contagem atrasada", "Última contagem", sem "acerto". es: "Dejar stock", "Dejar más hoy", "Contar y cobrar", "Contado y cobrado", "Conteo atrasado", "Último conteo", sem "liquidación". Glossário §5 ganha essas linhas.
Arquivos: i18n/messages/salesModule.ts:68-70, 94, 113, 117-122, 201, 245, 256; i18n/messages/dashboard.ts:79
Risco: nenhum, só texto. A API e o banco seguem como estão.
Status: feito nos textos (en, pt, es). PENDENTE: linhas novas no glossário docs/MODULES.md §5

### R2-VIS-13 [S2] Company, Customer e Shop para o mesmo lugar
Telas: rep-both/en-desktop/visits-leads, visits-sales-stock; rep-both/en-phone/visits-lead-lead, visits-lead-prospect, visits-sales-sales; rep-both/en-desktop/visits-dashboard
Problema: a decisão é "Companies" em Visits e "cliente" em Tags, e isso se sustenta: empresa é o registro, Customer é o estado dela. O que a tela prova que saiu mal é uma terceira palavra e o estado mal nomeado:
- "Shop": a coluna SHOP, "2 shops", "2 shops to count and bill". Enquanto isso, Sales diz COMPANY e Tags tem um menu "Shop" que é a loja de compra de peças. Para quem tem os dois módulos, "Shop" são duas coisas.
- "Prospect" no cabeçalho da empresa, que a aba da mesma lista chama de "To visit".
- "Convert to customer" soa como operação de sistema, e a venda já faz isso sozinha.
- "Sold in: all" é um filtro que ninguém entende sem abrir.
Mudança: "Shop" sai de Visits: en "Company" / "2 companies" / "2 companies to count and bill"; pt "Empresa" / "2 empresas"; es "Empresa" / "2 empresas". Estado Prospect: en "To visit" / pt "A visitar" / es "Por visitar". Botão: en "Mark as customer" / pt "Marcar como cliente" / es "Marcar como cliente". Filtro: en "Where: all" ou, melhor, en "Sold by: visits and pieces" com rótulo explícito por opção.
Arquivos: i18n/messages/salesModule.ts:89, 180, 196-197, 244; i18n/messages/dashboard.ts:79; i18n/messages/leads.ts:44, 119, 179, 250, 307, 378
Risco: nenhum. Não reabre a decisão Company/Cliente.
Status: feito (Shop sai, Prospect vira To visit, Mark as customer, 'Sold in: all' vira 'All sales'); decisão Company/Cliente não foi reaberta

### R2-VIS-14 [S2] "My companies" no painel é falso
Telas: platform/en-desktop/panel-work-leads, owner/en-desktop/panel-work-leads, owner/en-phone/panel-work-leads
Problema: "My companies 34" ao lado de "All organizations", e o dono vê "My companies 15" quando as suas são 4 (`visits-leads-search` diz "Showing 0 of 4"). No mesmo menu existe um item "My companies" do dono de várias, que quer dizer organizações. Três sentidos para o mesmo texto.
Mudança: no painel a aba é "Worked" / "Trabalhadas" / "Trabajadas" ao lado de "To visit". "My companies" fica só em My work.
Arquivos: pages/xpot/XpotLeads.tsx:368; i18n/messages/leads.ts:10, 146, 274
Risco: nenhum.
Status: feito ('Worked' no painel)

### R2-VIS-15 [S2] Na visita, vender tem duas portas e nenhuma diz vender direito
Telas: rep-both/en-phone/visits-checkin-in-progress, rep-both/en-desktop/visits-checkin-in-progress
Problema: o vendedor chega, desliza e vê "Sales" e "Sell a piece". "Sales" é substantivo e abre um segundo diálogo, de onde sai "New sale": são dois toques antes de escolher o produto. "Sell a piece" sai da visita e vai para Tags (`navigate("/tags")`). No celular as dicas não aparecem, e são elas que explicam ("Order, payment and consignment", "QR or NFC for this company"). Numa empresa com estoque na prateleira, o principal é contar e cobrar, e a tela só dá o número "ON SHELF" sem ação. Um espaço vazio fica à direita de "Sell a piece".
Mudança: três ações com verbo. Se há estoque: "Count and bill · 18 on shelf" no topo em toda a largura. Depois "New sale" (abre direto) e "Leave stock". "Sell a piece" só com Tags, com a dica visível também no celular. pt "Contar e cobrar", "Nova venda", "Deixar estoque", "Vender peça"; es "Contar y cobrar", "Nueva venta", "Dejar stock", "Vender pieza". Ao voltar de Tags, o aviso de visita em andamento já leva de volta.
Arquivos: pages/xpot/XpotCheckIn.tsx:508-522, 572; i18n/messages/checkin.ts:62-63, 72-73
Risco: reordena o fluxo, sem regra nova. Sem captura da janela "Sales" da visita (veja "Fora das imagens").
Status: feito (Count and bill com a prateleira, New sale e Leave stock abrem direto; dica de Sell a piece também no celular)

### R2-VIS-16 [S2] No celular, o cartão da empresa não tem Check in
Telas: rep-both/en-phone/visits-leads, owner/en-phone/panel-work-leads, partner/en-phone/visits-leads
Problema: no computador cada linha tem "Check in". No celular, onde o vendedor está, há um ícone de seta sem nome (Directions) e três pontos, e o Check in está dentro dos três pontos (VIS-25). Cartões de sete linhas: 11 empresas ocupam 2.595px. O site cortado ("www.maplestreetbakery…") não serve a ninguém na rua.
Mudança: botão "Check in" azul no cartão, ao lado de "Directions" com texto. Cartão com nome, cidade, estado e o que está vendido; telefone e site só dentro da empresa.
Arquivos: pages/xpot/XpotLeads.tsx:75-110; pages/xpot/components/leads/LeadsTable.tsx:35
Risco: nenhum.
Status: feito (Check in e Directions com texto no cartão; telefone e site só na empresa)

### R2-VIS-17 [S2] Com visita aberta, a lista oferece Check in que a empresa recusa
Telas: rep-both/en-desktop/visits-leads, contra rep-both/en-desktop/visits-lead-active e rep-both/en-phone/visits-lead-lead
Problema: a faixa diz "Visit in progress at Blue Harbor Seafood" e toda linha mostra "Check in", até a própria Blue Harbor. Dentro da empresa o mesmo botão não existe e aparece "Finish your visit at Blue Harbor Seafood first." O botão da lista manda para `/route/check-in?leadId=…`, que não pode começar outra visita. A frase âmbar também não leva a lugar nenhum.
Mudança: com visita aberta, a linha da empresa da visita mostra "Back to visit" e as outras não mostram Check in. Na empresa, a frase vira link: en "Finish your visit at Blue Harbor Seafood first →".
Arquivos: pages/xpot/components/leads/LeadsTable.tsx:244; pages/xpot/XpotLeads.tsx:501, 534; pages/xpot/components/leads/LeadDetailPane.tsx:206
Risco: nenhum.
Status: feito (Back to visit na empresa aberta, sem Check in nas outras; frase vira link)

### R2-VIS-18 [S2] Finalizar visita: resultado cortado e dois nomes para sair
Telas: rep-both/en-phone/visits-finish-visit-form
Problema: o rótulo novo de VIS-24 não cabe: "Closed or n...". É o caso mais comum na rua, e está ilegível. A ação se chama "Finish visit" no botão e "SLIDE TO CHECK OUT" um toque depois. "Talked" vem marcado, e quem não muda registra que falou com alguém numa loja fechada.
Mudança: grade de duas colunas com seis opções, sem corte, ou o rótulo curto en "No one there" / pt "Sem ninguém" / es "Sin nadie", cobrindo também o fechado. Controle: en "SLIDE TO FINISH" / pt "DESLIZE PARA FINALIZAR" / es "DESLIZA PARA FINALIZAR". Sem resultado marcado, o controle só aparece depois da escolha (um toque a mais, dado certo).
Arquivos: i18n/messages/checkin.ts:80, 110, 279, 305; pages/xpot/XpotCheckIn.tsx:592; pages/xpot/visitRules.ts:95
Risco: tirar a marcação padrão é decisão do dono. Recomendo tirar: o número de "Talked" hoje não prova nada.
Status: feito (rótulo curto, grade de duas colunas, 'SLIDE TO FINISH', nenhum resultado marcado até escolher; decisão do dono seguida a recomendação)

### R2-VIS-19 [S2] Toda tarefa aberta diz "✓ Done"
Telas: rep-both/en-phone/visits-tasks, owner/en-desktop/panel-work-tasks, platform/en-phone/panel-work-tasks
Problema: o botão à esquerda do título tem o tique verde e o texto "Done", como um selo. Na seção OVERDUE, parece que a tarefa atrasada está feita. O Dashboard usa um círculo vazio para a mesma ação.
Mudança: o mesmo círculo vazio do Dashboard, com nome acessível; ou o texto en "Mark done" / es "Marcar hecha", sem verde e sem tique. O pt "Concluir" já é verbo.
Arquivos: pages/xpot/XpotTasks.tsx:248; i18n/messages/tasks.ts:36, 147; pages/xpot/XpotDashboard.tsx
Risco: nenhum.
Status: feito (círculo vazio com nome acessível)

### R2-VIS-20 [S2] "Active reps" não bate com a tabela logo abaixo
Telas: platform/en-desktop/panel-team-results, partner/en-desktop/panel-team-results
Problema: plataforma: "7 ACTIVE REPS" com 8 linhas; Marcus Reed tem 7 visitas e não conta porque o papel dele não é `rep`. Parceiro: "2 ACTIVE REPS" com Daniela Okafor em 0 visitas. "with Visits" quer dizer "tem o módulo", e qualquer um lê "fez visitas".
Mudança: contar quem visitou no período: en "Reps who visited" / pt "Vendedores que visitaram" / es "Vendedores que visitaron", sem subtítulo. Parceiro passa a mostrar 1, e plataforma, 7 de 8 linhas com o 8.º sem visita abaixo.
Arquivos: server/routes/xpot/teamActivity.ts:121; i18n/messages/manage.ts:26, 242, 448; i18n/messages/peopleWorkspace.ts:101, 213
Risco: nenhum.
Status: feito (Reps who visited; contagem de quem visitou)

### R2-VIS-21 [S2] Team results em "Today" abre Sales em 7 dias
Telas: platform/en-desktop/panel-team-results, platform/en-desktop/panel-work-sales
Problema: Team results tem Today, 7, 30 e 90 dias; Sales tem 7, 30 e 90. Com Today, o tile de vendas manda `range=7`: número do dia abre número da semana. Li no código; a captura está em 30 dias, em que os dois batem.
Mudança: Sales ganha Today (en) / Hoje / Hoy e o link passa o período certo.
Arquivos: pages/admin/AdminOverview.tsx:25; pages/xpot/components/sales/SalesOverview.tsx
Risco: nenhum.
Status: feito (Sales ganha Today = 1 dia; o link passa o período certo)

### R2-VIS-22 [S2] "Outside area" e "Checked in away" são a mesma coisa
Telas: rep-both/en-phone/visits-history, platform/en-desktop/panel-team-results, platform/pt-desktop/visits-checkin-new, platform/pt-desktop/panel-team-results
Problema: o selo âmbar na visita diz "Outside area"; a coluna do gestor, "Checked in away". Em pt: "Exceção: fora da área" contra "Check-in fora do local". O VIS-18 mudou só um lado. "Exceção" é jargão. Em en, o subtítulo do tile está cortado no computador: "outside the company's area or without a loc...".
Mudança: selo igual à coluna: en "Checked in away" / pt "Check-in fora do local" / es "Check-in fuera del lugar". Subtítulo: en "away from the company, or no location".
Arquivos: pages/xpot/components/VisitStatus.tsx:69; i18n/messages/checkin.ts:116; i18n/messages/peopleWorkspace.ts:96-97
Risco: nenhum.
Status: feito (selo igual à coluna; subtítulo novo)

### R2-VIS-23 [S2] No celular, "New sale" fica atrás da barra inferior
Telas: rep-both/en-phone/visits-lead-lead, visits-lead-customer, visits-lead-active
Problema: VIS-27 reordenou, mas em 844px o botão verde está em y≈803 e a barra começa em y≈786: na primeira tela só aparece cortado. Antes dele vêm New task, nota do Google, Directions e o quadro "ON SHELF 0 | PIECES 1". Em Blue Harbor, "Back to visit" empurra mais 20px.
Mudança: primeira tela: nome, estado, telefone, botão principal (Check in ou Back to visit) e "New sale". New task e o chip do Google descem para Details. O quadro On shelf/Pieces some quando os dois são zero; com estoque, vira a linha do cartão de consignação, sem repetir.
Arquivos: pages/xpot/components/leads/LeadDetailPane.tsx; pages/xpot/components/sales/LeadSalesPanel.tsx
Risco: nenhum.

## S3
Status: feito (New sale visível na primeira tela; New task e Google descem para Details; quadro zerado some)

### R2-VIS-24 [S3] Overview: dois totais lado a lado e um período que só vale para um
Telas: rep-both/en-desktop/visits-sales-overview, rep-both/en-phone/visits-sales-overview
Problema: "SOLD · 30D $3,836" ao lado de "SOLD · THIS MONTH $1,299". Em 2 de novembro, o segundo tem dois dias e parece uma queda. Os botões 7, 30 e 90 só mudam o primeiro. "30D" é abreviação. "On consignment" tem quatro números sem ação direta, e o parceiro vê "0 / $0.00 / 0".
Mudança: sai "this month". Fica "Sold · 30 days" e "To collect". "On consignment" some quando vazio.
Arquivos: pages/xpot/components/sales/SalesOverview.tsx:102-103, 164; i18n/messages/salesModule.ts:219-221
Risco: nenhum.
Status: descartado (conflita com R2-VIS-5, que pede 'Sold · this month' como segundo tile)

### R2-VIS-25 [S3] Consignments: botão solto num cartão de filtro
Telas: rep-both/en-desktop/visits-sales-stock, rep-both/en-phone/visits-sales-stock
Problema: "Leave stock" fica num cartão com Active e Closed, e abaixo vêm dois tiles grandes antes da primeira loja. No celular, a primeira loja a cobrar aparece a partir de y≈550.
Mudança: uma linha só: "43 units · 2 companies · $150.50 if all sells"; Leave stock à direita; Closed como filtro discreto.
Arquivos: pages/xpot/components/sales/SalesLists.tsx:376
Risco: nenhum.

### R2-VIS-26 [S3] Histórico da consignação em linguagem de sistema
Telas: rep-both/en-phone/visits-sales-stock-detail, owner/en-desktop/visits-sales-stock-detail
Problema: "Settled −12 · shelf 30 → 18 · counted 18 · $42.00" e "Left stock +30 · shelf 0 → 30". O menos em verde confunde.
Mudança: en "Oct 18 · Counted 18 on the shelf · 12 sold · $42.00 billed" e "Sep 18 · Left 30". Equivalentes em pt e es.
Arquivos: pages/xpot/components/sales/cards.tsx:201; i18n/messages/salesModule.ts
Risco: nenhum.

### R2-VIS-27 [S3] "Correct stock" em consignação encerrada
Telas: platform/es-desktop/visits-sales-stock-detail
Problema: consignação "Cerrada", com 0 no estante, oferece "Corregir stock" como botão principal.
Mudança: encerrada não mostra a ação; fica o histórico.
Arquivos: pages/xpot/components/sales/SalesLists.tsx:503
Risco: conferir se o servidor aceita correção em encerrada; não deve.

### R2-VIS-28 [S3] No painel, a ação de cada linha é fazer check-in
Telas: owner/en-desktop/panel-work-leads, platform/en-desktop/panel-work-leads
Problema: na área de gestão, cada linha tem "Check in" em destaque, inclusive nas empresas de outro vendedor. O dono está olhando, não visitando, e fazer check-in ali mexe na carteira de outra pessoa (o próprio `server/routes/xpot/visits.ts:79` avisa). A coluna que falta ao gestor é quem cuida da empresa.
Mudança: no painel, sai "Check in" e entra a coluna "Rep" / "Vendedor" / "Vendedor". Quem quer visitar vai por My work.
Arquivos: pages/xpot/components/leads/LeadsTable.tsx:244
Risco: dono que também vende perde um atalho; My work continua com ele.

### R2-VIS-29 [S3] Chips de empresa não somam, e Inactive não tem filtro
Telas: rep-both/en-desktop/visits-leads
Problema: "All 11, Follow-up 9, In talks 5, Customers 4". O comentário no código diz que somam; 9+5+4 = 18. Duas empresas "Inactive" não têm chip. Follow-up cruza com os outros, e Follow-up vencido só se distingue pela cor: "Follow-up Oct 30" em vermelho, sem dizer que venceu.
Mudança: separar: linha de estado (In talks, Customers, Inactive, que somam 11) e um filtro à parte "Follow-up". Vencido: en "Follow-up late · Oct 30" / pt "Retorno atrasado · 30 de out." / es "Seguimiento atrasado · 30 oct".
Arquivos: pages/xpot/XpotLeads.tsx:159, 368; pages/xpot/components/leads/LeadsTable.tsx:35
Risco: nenhum.

### R2-VIS-30 [S3] Venda cancelada ainda diz "Unpaid" em âmbar
Telas: rep-both/en-phone/visits-sales-sale-cancelled
Problema: nada a cobrar, mas há um selo âmbar, que pela regra 3 só serve para ação agora.
Mudança: venda cancelada não mostra Payment nem Method. O bloco "Cancelled Oct 25" fica sem vermelho, em cinza.
Arquivos: pages/xpot/components/sales/cards.tsx:227-282
Risco: nenhum.

### R2-VIS-31 [S3] "Current visit" sem visita nenhuma
Telas: owner/en-desktop/visits-checkin-new, owner/en-desktop/visits-checkin-empty, owner/en-phone/visits-checkin-new
Problema: migalha "Visits > Current visit" e, abaixo, "CHECK-IN", antes de haver visita. O Dashboard chama o mesmo passo de "Start a visit". "Confirm visit start for…" é um terceiro nome. No celular, o selo "±15 m" não diz o que é (no computador em pt: "Localização precisa · ±15 m").
Mudança: sem visita aberta, título "Start a visit" / "Iniciar visita" / "Iniciar visita"; sai "CHECK-IN" e a frase de confirmação. No celular, o selo vira en "GPS ±15 m".
Arquivos: pages/xpot/XpotCheckIn.tsx; i18n/messages/checkin.ts
Risco: nenhum.

### R2-VIS-32 [S3] Detalhe da visita no celular: 300px de horários antes do resultado
Telas: rep-both/en-phone/visits-history-sale_made, visits-history-completed, visits-history-follow_up
Problema: Check-in, Check-out e Duration são três cartões de largura toda. O selo do resultado aparece no topo e de novo abaixo. No computador é uma linha só.
Mudança: uma linha: "9:10 – 9:24 AM · 14 min". O resultado fica uma vez, com "Change result" ao lado. Em Sales, uma linha "$1,299.00".
Arquivos: pages/xpot/components/VisitRow.tsx
Risco: nenhum.

### R2-VIS-33 [S3] Detalhe da venda: cartões vazam à direita
Telas: rep-both/en-phone/sale-detail-sheet, sale-detail-update-payment, visits-sales-sale-detail
Problema: com nome longo ("Business Website (up to 5 pages)"), os cartões encostam na borda direita do diálogo: 24px à esquerda, 2px à direita.
Mudança: nome quebra linha; `min-w-0` no bloco do nome.
Arquivos: pages/xpot/components/sales/cards.tsx:238
Risco: nenhum.

### R2-VIS-34 [S3] "Follow-up" e "Come back" não se distinguem
Telas: rep-both/en-phone/visits-finish-visit-form, visits-history; platform/pt-desktop/visits-checkin-new
Problema: os dois são âmbar, os dois querem dizer "voltar". A pessoa com pressa escolhe qualquer um, e o número deixa de valer. Em pt: "Retorno" e "Voltar depois".
Mudança: juntar em um só, en "Come back" / pt "Voltar" / es "Volver", com data opcional.
Arquivos: i18n/messages/checkin.ts:108-109; pages/xpot/visitRules.ts
Risco: decisão do dono, porque muda os dados (status gravados). Recomendo juntar só na tela, mantendo os dois no banco.

## S4

### R2-VIS-35 [S4] Anel de foco no X e título encostado
Telas: rep-both/en-phone/visits-sales-stock-detail, visits-sales-sale-cancelled, owner/en-phone/visits-sales-stock-detail
Problema: ao abrir, o X ganha um anel azul grande que corta o título ("Copper Kettle" encosta nele). O travessão no título também foge do padrão da tela.
Mudança: foco visível só por teclado; `pr-12` no título; título como em R2-VIS-7.
Arquivos: pages/xpot/components/sales/ui.tsx (`SheetDialog`)
Risco: nenhum.
Status: feito em parte (título com pr-10; anel de foco do X é do kit de diálogo, não mexido)

### R2-VIS-36 [S4] "More details" em dois estilos
Telas: rep-both/en-desktop/visits-dashboard, platform/en-desktop/panel-work-sales
Problema: no Dashboard é texto simples; em Sales é um cartão inteiro em caixa alta.
Mudança: um componente só, o simples.
Arquivos: pages/xpot/components/sales/SalesOverview.tsx:306; pages/xpot/XpotDashboard.tsx
Risco: nenhum.

### R2-VIS-37 [S4] Dois nomes para abrir o mapa da rota
Telas: rep-both/en-phone/visits-route, visits-route-in_progress-1
Problema: "Open navigation" na lista de rotas e "Open route in Google Maps" dentro da rota, para o mesmo destino.
Mudança: "Open in Google Maps" / "Abrir no Google Maps" / "Abrir en Google Maps" nos dois, que já existe em `checkin.ts:130`.
Arquivos: i18n/messages/prospecting.ts:46
Risco: nenhum.

### R2-VIS-38 [S4] Selo do resultado solto no meio da página
Telas: rep-both/en-desktop/visits-history-sale_made
Problema: "Sale made" flutua a x≈725 no cabeçalho, sem alinhar ao nome nem ao botão.
Mudança: colar ao nome, como no celular.
Arquivos: pages/xpot/components/VisitRow.tsx
Risco: nenhum.

### R2-VIS-39 [S4] "My companies" quebra em duas linhas na troca do painel
Telas: owner-multi/en-desktop/panel-team-results-owner
Problema: o botão do alternador fica mais alto que "My work" e o conjunto desalinha.
Mudança: largura proporcional no alternador ou fonte menor só nesse caso.
Arquivos: components/xpot/AppLayout.tsx
Risco: nenhum.

## Fora das imagens

A área principal do pedido não tem captura. Julguei a contagem de toques pelo código e não pude avaliar estas telas:
- diálogo **New sale** (`SaleDialog.tsx`), inclusive no celular;
- diálogo **Leave stock** e **Correct stock**;
- janela **Sales** de dentro da visita (`XpotCheckIn.tsx:572`) e **Visit note**;
- **histórico no painel** (`/admin/work/dashboard/history`), o destino dos tiles de visitas de Team results;
- Team results em **Today**;
- pt e es no celular: só existem capturas `pt-desktop` e `es-desktop`, então não dá para ver corte de "DESLIZE PARA FAZER CHECK-OUT" nem dos resultados.

Toques hoje, pelo código, de chegar até escolher o produto: buscar empresa, tocar nela, deslizar, "Sales", "New sale" = 5, mais digitar a busca. Com R2-VIS-15, 4.
