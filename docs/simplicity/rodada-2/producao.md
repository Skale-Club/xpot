# Rodada 2: Produção (platform e partner)

Auditor: olhar novo. Abri as telas (en-desktop, en-phone, uma amostra de pt e partner). Foco: o que quem opera a impressora faz a seguir em cada estado. Não repito os itens de `pending-r1.md` (PROD-16, 20, 29, 33, 35, 36, 41, 57, 63, 65) a menos que a tela prove que estão pior.

## Notas por tela (0 a 10)

| Tela | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| Produção > Produce (platform) | o que imprimir agora | 6 | grupo "Waiting for the file" mistura "Building" e "Waiting"; peças sem ação; código em toda linha; "Always ready" sem estoque nem alerta |
| Produção > Produce (partner) | baixar e imprimir o que está pronto | 6 | aviso "bench is off" contradiz "making the file now"; mesmo vocabulário técnico |
| Produção > Produce (celular) | falhas primeiro, depois imprimir | 6.5 | idem desktop; primeira dobra só mostra falhas e dois computadores "on" |
| Produção > All orders | achar um pedido e abri-lo | 5.5 | 38 linhas sem busca, "Building" aqui e "Waiting for the file" na vista do quadro, 9 linhas "Print job n of 9" iguais |
| Produção > Models | escolher o que imprimir | 6.5 | "Print" em todo cartão, contagens misturadas ("Company stock: 2" ao lado de "9 open orders"), "Parts with no code" |
| Modelo (detalhe) | versões e Print | 5.5 | notas de engenharia no meio, v1 com texto "v2:", "Pauses at Z 1.8", códigos de pedido no texto |
| Pedido: Waiting for the file / Building | enviar o arquivo ou esperar | 5 | botão "Upload file" principal enquanto o computador faz o arquivo; remédio do aviso escondido; bloco "At the printer" já antes de haver arquivo |
| Pedido: Ready to print | baixar e iniciar | 7.5 | bloco amarelo longo vira ruído; "AMS", "NTAG213", "serial map" |
| Pedido: Printing | marcar impresso | 7.5 | idem |
| Pedido: Printed (peça Stand) | montar | 5.5 | "Mark assembled" aparece também para placa, que não tem base nem token |
| Pedido: Printed, not in stock | pôr em estoque | 6 | "Open the batch" leva a tela sem ação; dois caminhos para contar |
| Pedido: Failed / Cancelled | imprimir de novo | 7.5 | "Failed", "Record a problem", "Already printed" ambíguos em Other actions |
| Lote (batch) de fornecedor | receber peças | 5.5 | texto de ajuda cita rótulos que não existem; "Print" é "enviar ao fornecedor"; 3 vezes o mesmo código |
| Lote de impressão (batch) | ver o que chegou | 5 | três vezes "Printing"/"Print job"; sem ação nenhuma; "Receive" sem botão |
| Assistente Generate / Print | gerar peças | 7 | dois assistentes para a mesma tarefa com nomes diferentes (Generate x Print); "faces", "bed" |
| Pedir a fornecedor | criar lote | 5 | título com duas tarefas; "Batch and product"; "Sales product" |
| Mark printed (diálogos) | contar as boas | 8 | posições "front-left" sem mapa |
| Chip writers | parear computador | 5.5 | texto manda "pedir o instalador ao time"; botão apagado sem motivo; "Revoke" sem aviso |
| History | ver o que aconteceu | 4 | 14.477 px numa só página; mistura peça, kit, plano, hipótese; título repetido três vezes |
| Shop setup / Shop | decidir o que o revendedor vê/compra | 6.5 | ícones sem texto, "Stuscle", dois botões diferentes para a mesma coisa |
| Planejar rota (Visits) | montar a rota | 6.5 | outro estilo de botão e de azul; "Find companies" |
| pt (amostra) | idem | 5.5 | nomes de modelo em inglês; motivos de falha em inglês; "serial" |

## Achados

Imagens abertas: 46 (44 capturas inteiras mais 2 recortes de páginas muito altas, History e o celular do quadro): platform en-desktop 30, platform en-phone 4, partner en-desktop 6, platform pt e es 2, owner en-desktop (planejador de rota) 2. Textos de mais 12 telas (vazios, confirmações, menus "Other actions") lidos em `report.json`, sem abrir imagem. Não abri en-phone das telas de modelo, nem es/pt de lote e de History; ficam sem nota.

### R2-PROD-1 [S1] O quadro põe "Building" dentro de "Waiting for the file"
Telas: platform/en-desktop/production-board, production-queue, production-job-building
Problema: Em Production, o grupo "WAITING FOR THE FILE 14" traz "Large Plate · Google Review · Black · Harbor Print Co. · LPLATE-2026-009" e "Large Plate · Menu · Black · LPLATE-2026-001". Em All orders as mesmas duas linhas dizem "Building", e a página do pedido diz "Making the file" e "Bench PC (Boston shop) is making the file now". O quadro diz que falta o arquivo (a pessoa pensa que precisa enviá-lo), a lista diz que está sendo feito. Essas duas linhas não têm botão, as irmãs do mesmo grupo têm "Upload file". O mesmo estado tem dois nomes em duas telas.
Mudança: Um grupo por situação real. "Waiting for the file" só para quem precisa de upload (tem botão). Um grupo novo "Being made by the computer" (pt "O computador está gerando", es "El computador lo está generando") para Building, com a frase na linha: "Bench PC is making the file. Nothing to do." Em All orders usar os mesmos dois nomes dos grupos.
Arquivos: client/src/pages/admin/tags/production-workflow.ts:107-137 (boardGroupOf, boardGroups), client/src/i18n/messages/production.ts:241 (group_waiting), :69 (jobStatus_requested)
Risco: nenhum de regra; só agrupamento e texto.
Status: feito. Grupo novo "Being made by the computer" (building); "Waiting for the file" so para requested (tem Upload). Mesmo nome na lista e na pagina. Regra: boardGroupOf em production-workflow.ts, com teste

### R2-PROD-2 [S1] "O computador está desligado" e "está fazendo o arquivo agora" para o mesmo pedido
Telas: partner/en-desktop/production-board, production-job-harborReq; platform/en-desktop/production-board, production-job-building-computer-stopped
Problema: No parceiro, o topo diz "Harbor bench is off (last seen Nov 2, 2026, 3:33 AM). Files will wait for it." e LPLATE-2026-009 está em "Waiting for the file". Abrindo o pedido, a tela diz "Building" e "Harbor bench is making the file now." com "Upload file" ao lado. Na plataforma é o inverso: o topo diz "Bench PC (Boston shop) is on." em verde, e a linha SPLATE-2026-004 diz "No news from the print computer for a while" em âmbar; a página diz "is making the file now" e logo abaixo "The print computer has gone quiet". Quem opera não sabe se espera ou age. A data absoluta "Nov 2, 2026, 3:33 AM" também não responde "há quanto tempo".
Mudança: Uma fonte por pedido. Computador desligado: o pedido em geração mostra "Waiting for the computer" e a frase do topo aponta para ele. Computador ligado mas pedido parado: "The computer is on but this file has not moved for 30 min". Trocar a data por "last seen 2 h ago" (pt "visto há 2 h", es "visto hace 2 h"). Nunca "is making the file now" em cima de um aviso de silêncio.
Arquivos: client/src/pages/admin/tags/production-orders.tsx (ToPrintList, linha do topo e aviso de silêncio), production-job.tsx (bloco "Making the file")
Risco: depende de qual sinal o servidor considera verdadeiro; recomendo o último sinal do próprio pedido, não o do computador.
Status: feito. buildState(job, computers) em production-workflow.ts (making | computerOff | quiet), com teste. O topo "off ... Files will wait for it" so aparece se alguma impressao depende do computador (needsPrintComputer). Data absoluta virou "visto ha 4 horas"

### R2-PROD-3 [S2] Computador em silêncio: o remédio está escondido e o botão principal é o errado
Telas: platform/en-desktop/production-job-building-computer-stopped, production-job-building-other-actions-open
Problema: O aviso âmbar diz "If the print computer is off, give the print job back to the queue." mas não tem botão. "Give back to the queue" só existe dentro de "Other actions" (o menu mostra "Give back to the queue", "Cancel this print", "Failed"). O botão grande roxo é "Upload file", o contrário do conselho (quem envia sobrepõe um arquivo que o computador ainda pode estar gerando). "queue" e "print job" são palavras novas nesta frase.
Mudança: No próprio aviso, botão "Try again on the computer" (pt "Tentar de novo no computador", es "Reintentar en el computador"). Quando o aviso aparece, "Upload file" vira link pequeno "Upload the file yourself". Texto: "No news from the computer for 30 minutes. If it is off, try again or upload the file yourself."
Arquivos: client/src/pages/admin/tags/production-job.tsx (aviso e ações), i18n/messages/production.ts:155 (release)
Risco: nenhum.
Status: feito. Botao "Try again on the computer" no cartao quando o computador esta desligado ou mudo; "Upload the file yourself" vira botao pequeno; aviso ambar antigo removido

### R2-PROD-4 [S2] "Mark assembled" e "the bases and tokens come off the count" aparecem para placa, que não tem base nem token
Telas: partner/en-desktop/production-job-harborPrinted (Large Plate · Menu · White), platform/en-desktop/production-job-printedA1
Problema: Um pedido de Large Plate impresso mostra "Done: All 4 pieces are in stock. If you assemble them now, the bases and tokens come off the count." e o botão "Mark assembled". A placa só consome o adesivo NFC; a frase é fixa. O parceiro nem tem bases e tokens na tela. Quem lê procura uma base que não existe. O mesmo cartão tem três rótulos de "pronto": "Printed", "Print job 1 of 2" e o cabeçalho "Done".
Mudança: A frase vem da lista de consumo real: "Mark assembled to take 4 NFC stickers off your count" (pt "Marque como montado para baixar 4 adesivos NFC da sua contagem", es "Marca como armado para descontar 4 adhesivos NFC"). Para Stand: "...the 4 bases and 4 tokens". Cabeçalho do cartão: tirar "Done".
Arquivos: i18n/messages/production.ts (assembleHint), pages/admin/tags/production-job.tsx:121,151 e production-workflow.ts:97 (canAssembleJob)
Risco: nenhum.
Status: feito. assembleHint vem da lista de consumo real ("Mark assembled to take 2 x ... off your count"); cabecalho "Done" virou "In stock" ("Added to the count" para peca sem codigo)

### R2-PROD-5 [S2] Quatro nomes para a mesma coisa: order, print, print job, batch
Telas: platform/en-desktop/production-board, production-queue, production-job-printedA1, batch-print-printing, batch-supplier-open-summary
Problema: Na mesma parte do produto: "All orders", "Cancel this print", "Print job 1 of 9", "Open the batch", "Close batch", "Back to print job", "Open print job", "Production stage". Um pedido de 36 peças é "order" no cartão, "9 print jobs" ao lado e "Print job 1 of 9" na linha. O código `LPLATE-2026-002` identifica pedido, impressão e lote ao mesmo tempo. Quem opera diz "a impressão".
Mudança: Uma regra em todas as telas: pedido = o que se pediu ("order"); impressão = uma rodada na impressora ("print", pt "impressão", es "impresión"); "batch" só para o que vem de fornecedor, e passa a "supplier order". Trocas: "Print job 1 of 9" -> "Print 1 of 9"; "Open the batch" -> "See the pieces"; "Back to print job" e "Open print job" -> "Back to the print"; "Close batch" -> "Close order" só em fornecedor. "Cancel this print" fica.
Arquivos: i18n/messages/production.ts:78 (plateOf), :291 (openBatch); i18n/messages/adminTagsFlow.ts (batch*); unifiedProduction.ts
Risco: é glossário (MODULES §5). Recomendo a regra acima e confirmar com o dono a palavra "supplier order".
Status: feito em parte. "print job" virou "print" em en (pt/es ja diziam impressao/impresion) nas telas de producao e nos erros; "Open the batch" virou "See the pieces" (abre o Stock filtrado); "Back to the print". Glossario atualizado em docs/MODULES.md. Pendente: "batch" -> "supplier order" no fornecedor (o achado pede confirmar a palavra com o dono). pieceScreen.ts "Open print job" e workspaces.ts "A print job failed" ficam para as frentes peca e painel

### R2-PROD-6 [S2] A página "batch" de uma impressão própria é um beco: três vezes "Printing", nenhuma ação, e "0/8 still to receive" sem botão
Telas: platform/en-desktop/batch-print-printing, batch-print-printedOld, production-job-printedOld
Problema: Em "Large Plate · Google Review · White" o cabeçalho diz "Printing", o cartão seguinte se chama "Print job" e repete "Printing", e o botão é "Open print job" (e o topo "Back to print job" volta ao mesmo lugar). Para SPLATE-2026-002 (impressa há mais de um mês) a página diz "RECEIVED 0/8 · 8 pieces still to receive · COMPANY STOCK 0", mas não existe "Receive pieces" (o lote do fornecedor tem). O caminho certo é voltar ao pedido e clicar "Put 8 pieces in stock", que conta sem ler os QR. São dois caminhos para contar a mesma peça, e o da leitura não tem botão.
Mudança: Para impressão própria, não ter página de lote: "See the pieces" abre o Estoque filtrado por este pedido, com "0 of 8 in stock" e o botão "Put 8 pieces in stock". Se a página ficar, tirar o cartão "Print job" e o "Printing" repetido, e mostrar "Receive pieces" quando faltam peças.
Arquivos: pages/admin/tags/BatchDetail (cabeçalho e cartão), production-job.tsx (openBatch)
Risco: pequeno; decide se a leitura do QR continua obrigatória para peça de impressão própria (recomendo não).
Status: feito. A pagina do lote de impressao propria perdeu o cartao "Print job"/"Printing" repetido; so aparece um cartao quando ha acao (falha, ou pecas pendentes com o botao "Put N pieces in stock"). "See the pieces" abre o Stock filtrado (parceiro, sem Stock, segue para a pagina do lote)

### R2-PROD-7 [S2] Código de pedido em toda linha, e nove linhas iguais "Print job n of 9" com nove botões "Upload file"
Telas: platform/en-desktop/production-board, production-queue, en-phone/production-board
Problema: A regra 6 do plano diz "nada de código de pedido". No quadro cada linha traz `MENU-2026-002`, `SPLATE-2026-003`, `LPLATE-2026-002`, `REV-2026-001`; All orders também. O pedido "Large Stand · Google Review · Black · 36 pieces · 9 print jobs" abre 9 linhas idênticas ("Print job 1 of 9 · 4 pieces · REV-2026-005 · Upload file") em 400 px; ninguém sabe qual arquivo vai em qual. No celular são 9 botões "Upload file" empilhados.
Mudança: O código só aparece dentro da página do pedido e na busca. No quadro, uma linha por pedido de várias impressões: "9 prints · 4 pieces each · 0 files sent", com um botão "Upload files" que abre a lista.
Arquivos: pages/admin/tags/production-orders.tsx (RequestHeader, PlateRow), production-workflow.ts (latestPlates)
Risco: o código serve para conferir com a mensagem do computador; deixar copiar na página do pedido.
Status: feito. Codigo fora das linhas do quadro (fica em All orders e na pagina do pedido). Pedido com 3 ou mais impressoes no mesmo grupo vira uma linha "9 prints · 4 pieces each · 0 files sent" com "Upload files". Contagem uma vez e data so se nao for hoje (PROD-24)

### R2-PROD-8 [S2] Parte de baixo da tela: "Pieces to generate" e "Always ready" não dizem quanto há, e a frase não se entende
Telas: platform/en-desktop/production-board (fim), en-phone/production-board, production-always-ready-version-picker
Problema: "Always ready: No serial needed. Downloading does not change the count: to count what you print, open the piece and use Print." "serial", "the count" e "open the piece" (qual?) não significam nada para quem imprime. Os cartões "Stand base · 2 options" e "Google G token · 4 options" não mostram quantas existem. Em Models, "Google G token · Large Stand" mostra "Low: reorder below 20 · Company stock: 14", mas no quadro que decide o que imprimir hoje o alerta não existe. O seletor ("Stand base: Which one do you want to print?") tem "Download 4 pieces · 3 h 54": baixa, imprime e nada registra (PROD-20, já pendente, mas agora o texto afirma que se conta em outro lugar). "Order from a supplier or add pieces with codes" é um link sublinhado pequeno no fim, para uma tarefa principal. Os quatro cartões "Pieces to generate" mostram só a arte do Google, sem dizer que Instagram e Menu são escolhidos no passo seguinte.
Mudança: Cartão: "Stand base · 42 in stock", e quando baixo âmbar "Low: 14 left, order below 20". Subtítulo: "Parts without a code (bases, tokens). Download the file, print, then add them to the count on the part's page." (pt "Peças sem código (bases e tokens). Baixe o arquivo, imprima e depois some na contagem na página da peça."). Trocar o link por botão secundário "Order from a supplier".
Arquivos: i18n/messages/productionBoard.ts:8-16, pages/admin/tags/ProductionBoard (cartões)
Risco: o botão "I printed these" no seletor depende da decisão PROD-20.
Status: feito em parte. "Always ready" mostra "N in stock" (ambar "Low: 14 left, order below 20"); subtitulo sem "serial"; "Order from a supplier" virou botao secundario. Nao feito: dizer nos cartoes de "Make pieces" que Instagram/Menu se escolhem no passo seguinte

### R2-PROD-9 [S2] "Order from a supplier or add pieces with codes": duas tarefas num título, e campos de sistema
Telas: platform/en-desktop/production-other-ways-dialog
Problema: Título duplo. Primeiro campo "How will these pieces be made? A supplier makes them: Xpot creates the codes"; depois "Batch and product", "Physical model", "Printed on the pieces" (valor "Not set"), "Sales product *: Choose a product…". Quem pede ao fornecedor não sabe que "Sales product" é o preço de venda. Três passos "Product, Codes, Review" para o que o dono pensa como "pedi 10 placas ao fornecedor".
Mudança: Título "Order from a supplier"; o segundo caminho (já tem peças com código) vira opção "I already have codes" no select. Rótulos: "What is it?", "What is printed on it?", "Sold as (sets the price)". Exemplo do campo Name: "Google Review stands, first order".
Arquivos: componentes do diálogo em pages/admin/tags (other-ways), i18n/messages/unifiedProduction.ts
Risco: nenhum.
Status: feito. Titulo "Order from a supplier"; "What is it?", "What is printed on it?", "Sold as (sets the price)"; exemplo de nome sem travessao; opcao "I already have codes"; cabecalho "Batch and product" saiu

### R2-PROD-10 [S2] Dois assistentes para a mesma tarefa, com nomes diferentes: "Generate" (4 passos) e "Print" (2 passos)
Telas: platform/en-desktop/production-generate-step1-colour, production-generate-step4-review, production-print-dialog-from-model, production-models
Problema: Do quadro: o cartão "Large Stand · 2 colours · 3 faces" abre "Generate Large Stand", passos Colour, Face, Quantity, Review, botão "Generate 4 pieces". De Models: o botão "Print" abre "Print Large Stand · Google Review · White", passos Quantity, Review, e o resultado é o mesmo. Um chama de gerar, o outro de imprimir, e "Print" também nomeia a aba do lote, "Print again" e "Mark printed". "faces" ("3 faces") é palavra interna para "desenhos".
Mudança: Um verbo, "Make pieces", no cartão, no botão de Models e no botão final ("Make 4 pieces"); título do diálogo "Make Large Stand · Google Review · White". "3 faces" -> "3 designs" (pt "3 desenhos", es "3 diseños"). "Print" só para o que acontece na impressora.
Arquivos: i18n/messages/productionBoard.ts:16 e as chaves generate*, i18n/messages/production.ts, botões "Print" de production-models
Risco: nenhum.
Status: feito. Um verbo, "Make pieces": cartao, botao dos modelos, titulo e botao final ("Make 4 pieces"); "faces" virou "designs" (pt desenhos, es diseños)

### R2-PROD-11 [S2] Bloco "At the printer" aparece antes de haver arquivo, em âmbar, com texto de máquina
Telas: platform/en-desktop/production-job-requested, production-job-ready, production-job-printing; partner/en-desktop/production-job-harborReq
Problema: No pedido "Waiting for the file" (nada a fazer ainda) já aparece o aviso âmbar "The printer stops at height 1.8 mm. Peel one programmed 10 × 20 NTAG213 sticker and press it flat, adhesive down, long side left-right, on the floor of each pocket (by the serial map); nothing above the rim; resume." com "Chips written: 0 of 4 · Write chips · Serial map" e "AMS · Slot 1 White PLA…". Âmbar é para o que exige ação agora; isto é instrução de rotina que só importa durante a impressão. "NTAG213", "AMS", "serial map", "nothing above the rim" não são palavras de quem opera sem treino. O bloco ocupa mais da metade da tela do celular antes de "Files and positions".
Mudança: Mostrar só em "Ready to print" e "Printing", em cinza (não âmbar). Texto: "At 1.8 mm the printer pauses. Press one written chip sticker flat into each pocket, then resume. Chips written: 0 of 4 · Write chips". "Colors to load: White, Black, Yellow" (AMS e "Slot" só dentro de "Files and positions"). Frase traduzida em pt e es (ver R2-PROD-15).
Arquivos: pages/admin/tags/production-job.tsx (bloco "atPrinter"), i18n/messages/production.ts (pauseStops, :292)
Risco: nenhum.
Status: feito. Bloco "At the printer" so em ready e printing, cinza; "At 1.8 mm the printer pauses"; frase fixa em en/pt/es no lugar do texto do banco quando fala de adesivo; "Colours to load"; AMS e slot so em "Files and positions"; "Serial map" virou "Where each piece goes"

### R2-PROD-12 [S2] "Other actions": cinco rótulos que não se distinguem
Telas: platform/en-desktop/production-job-ready-other-actions-open, production-job-requested-other-actions-open, production-job-printing-other-actions-open
Problema: Um botão "Other actions" abre uma fileira "Cancel this print | Failed | Already printed | Record a problem" (e "Printed without a file here" no pedido sem arquivo). "Failed" e "Record a problem" parecem a mesma coisa; "Already printed" não diz impresso onde nem se conta no estoque. É o único lugar para marcar falha com a máquina parada.
Mudança: Botão "More"; itens com frase: "It failed (choose why)", "Report a problem with the design (does not stop the print)", "I printed it somewhere else", "Cancel this print". Pt: "Falhou (escolher o motivo)", "Avisar de um problema no desenho", "Imprimi em outro lugar", "Cancelar esta impressão". Es: "Falló (elegir el motivo)", "Avisar de un problema en el diseño", "Lo imprimí en otro lugar", "Cancelar esta impresión".
Arquivos: i18n/messages/production.ts:257 e vizinhos; production-job.tsx (menu)
Risco: nenhum.
Status: feito. Botao "More"; "It failed (choose why)", "Report a problem with the design (does not stop the print)", "I printed it somewhere else", "Cancel this print" (pt e es traduzidos)

### R2-PROD-13 [S2] Pedido de fornecedor: o texto de ajuda cita rótulos que não existem, e "Print" quer dizer "enviar ao fornecedor"
Telas: platform/en-desktop/batch-supplier-open-summary, batch-supplier-open-print, batch-supplier-open-receive
Problema: Sob os cinco passos: "Mark Print file ready and Printed when they happen; Receiving and In stock follow from scanning the pieces." Os passos na tela são "Codes issued · Supplier has the files · Supplier made them · Receiving · In stock"; "Print file ready" e "Printed" não existem. O botão "Mark as done" não diz de quê. A aba "Print" é "Codes and QR images for the supplier" (baixar CSV, SVG), com um bloco "Print here instead" cujo título e botão são iguais. O nome "Acrylic Large Plate · Menu · supplier run" repete "SUP-2026-001" três vezes (título, "Receive SUP-2026-001", cabeçalho). "Close batch" fica ao lado de "Receive pieces" no topo, sem aviso de que faltam 10 peças.
Mudança: "Mark each step when it happens. Receiving and In stock fill in as you scan the pieces." Botão "Supplier has the files". Aba "Print" -> "Send to supplier" (pt "Enviar ao fornecedor"). Bloco "Print here instead": título "Make it yourself", botão "Print it here". Código só no cabeçalho.
Arquivos: i18n/messages/adminTagsFlow.ts:181 (stageIssuedHint), tabPrint; unifiedProduction.ts:37
Risco: nenhum.
Status: feito em parte. Ajuda dos passos, botao do passo com o proprio nome ("Supplier has the files"), aba "Send to supplier", bloco "Make it yourself" / "Print it here", codigo nao repetido no cartao de receber. Nao feito: aviso de pecas faltando ao lado de "Close batch" no topo (o dialogo de fechar ja avisa)

### R2-PROD-14 [S2] History: 14.477 px numa página, sem fim, e mistura tudo
Telas: platform/en-desktop/history (recorte do topo e página inteira)
Problema: "History" aparece na barra lateral, no título e de novo no cabeçalho da coluna. A lista mistura nota do dono ("Maple Street Bakery: 160 scans in 30 days"), nota da IA ("Supplier lead time is 18 days · Approve this note") e dezenas de linhas de sistema como "Piece FGSY2YPZ activated", "Destination of … changed", "Batch REV-2026-009 created 4 × Large Stand". Não há paginação nem "Show more". Cinco filtros ("Search", "All batches", "All resellers", "All kinds", "Show archived") acima de uma coluna com "Plans" ao lado sem relação. Quem opera a impressora procura "o que aconteceu com a minha produção", não a ativação de peças.
Mudança: 20 itens com "Show more". Filtro inicial "Notes and decisions", com "Everything" como segunda opção. Tirar o cabeçalho "History" repetido. Em celular, "Plans" abaixo e recolhido.
Arquivos: pages/admin/tags/History* e filters.tsx
Risco: o dono usa como log; manter "Everything".
Status: feito. O servidor ja paginava (limit/offset); a tela agora pede 20 por vez com "Show more", filtro inicial "Notes and decisions" (kind=notes no servidor, teste de integracao) e "Everything" como opcao; coluna "What happened"

### R2-PROD-15 [S2] Idioma: a instrução que o operador segue fica em inglês em es e pt; nome do modelo mistura línguas
Telas: platform/es-desktop/production-job-ready, platform/pt-desktop/production-board
Problema: Em es, o título do aviso está traduzido ("La impresora se detiene a la altura de 1.8 mm") e a instrução vem em inglês, com "(en inglés)" ao lado: "Peel one programmed 10 × 20 NTAG213 sticker and press it flat…", mais "White PLA" nos slots. Em pt, o quadro mostra "Small Stand · Cardápio · Preta", "Large Plate · Avaliação Google · Branca", "2 cores · 3 faces" e os motivos de falha em inglês ("QR on layer 1 of position 3 did not decode to its own code", "Nozzle clog at layer 12; the plate peeled") junto de "Imprimir de novo". "serial" ("ganham serial próprio") sem tradução.
Mudança: Traduzir a instrução da pausa (frase fixa, 3 línguas) e o tipo do modelo ("Placa grande", "Suporte grande"; ver RCP-23). Motivo de falha: código de motivo no servidor e tradução; até lá, "Motivo:" e o texto bruto atrás de "Ver detalhe". "serial" -> "número".
Arquivos: i18n/messages/production.ts (pauseStops e a frase longa), lista de tipos de modelo
Risco: depende do código por tipo de erro (pending ID-17).
Status: feito em parte. Instrucao da pausa traduzida; "serial" virou "number/numero" nas telas de producao; "Colours to load" traduz White/Black. Pendente: motivos de falha em ingles (precisam de codigo de erro no servidor, ID-17) e o nome do tipo do modelo ("Large Plate"), que depende de RCP-23

### R2-PROD-16 [S3] Linhas do quadro sem nada a fazer pesam como as que pedem ação
Telas: platform/en-desktop/production-board
Problema: "Waiting for the file 14" são 1.100 px; as sem botão (LPLATE-2026-009, LPLATE-2026-001) parecem as com "Upload file" e só têm uma seta. "Ready to print" e "On the printer" precisam de ação; o resto não. Falta uma frase por grupo ("Needs attention: print again or cancel").
Mudança: Grupos que não pedem ação ficam recolhidos por padrão com uma linha de resumo ("14 waiting for a file, 2 need an upload").
Arquivos: production-orders.tsx (ToPrintList)
Risco: nenhum.

### R2-PROD-17 [S3] Chip writers: nome da tela, botão apagado, instrução de beco
Telas: platform/en-desktop/chip-writers, en-phone/chip-writers
Problema: A página se chama "Chip writers" e a lista "Chip writers and print computers". "Pair a computer" manda "Ask the Xpot team for the installer", mas quem vê isso é a própria equipe da plataforma. "Create pairing code" está apagado (roxo claro) sem dizer por quê (falta o nome). "Skale Club" é um select sem rótulo. "Code not used", "Revoke" e "Cancel code" sem frase do que acontece. No celular "expires Nov 2, 2026, 3:4…" aparece cortado.
Mudança: Título "Computers" com "The computers that write chips and make print files". Botão sempre ativo, e ao tocar sem nome: "Give the computer a name". Rótulo "Company" acima do select. "Revoke" -> "Disconnect this computer". Validade como "expires in 20 min".
Arquivos: pages/admin/tags/ChipWriters*, i18n
Risco: nenhum.

### R2-PROD-18 [S3] Página do modelo: notas de engenharia e texto de versão trocado
Telas: platform/en-desktop/production-model-plate-large-menu-white
Problema: Sob o título: "Four white 103 × 103 × 3.56 Menu plates; Inria Serif Bold; normal 31 mm QR straight on the white body". Versões: "v1 Replaced · 0 print jobs" traz a nota "v2: the white Menu plate of LPLATE-2026-005 came out slightly translucent… Walls 3 → 4 and top shell layers 5 → 6… slice 283.5 min (+10)… Print one sample and check against light b" cortada no fim, e começando por "v2:" dentro da v1. Linhas: "x4 · 4 pieces · 4 h 44 · 3 colour swaps · Pauses at Z 1.8 · 1: White PLA · 2: Black PLA". "COMPANY STOCK 6 · WITH RESELLERS 5 · OPEN ORDERS 0" convive com a lista "ORDERS" que mostra "Print job 1 of 2".
Mudança: Descrição do construtor para dentro de "Recipe and parameters" (fechado). Nota da versão: primeira frase e "Read more". Linha: "4 pieces · 4 h 44 · 3 colour changes". "Company stock" -> "In stock" (R2-PROD-19).
Arquivos: pages/admin/tags/production-model*, i18n/messages/production.ts:113-114
Risco: nenhum.

### R2-PROD-19 [S3] Lista de modelos: três números sem rótulo e "Print" em todo cartão
Telas: platform/en-desktop/production-models, partner/en-desktop/production-models
Problema: Cartões com "Company stock: 6", "1 open order", "Company stock: 1 · 1 open order", "Low: reorder below 20 · Company stock: 14 · 1 open order", ou nada. Quase todo cartão tem "Print". "Parts with no code" é título interno (bases, tokens e adesivos). "NO DESIGN YET (11)" recolhido esconde onze modelos. "Bought" no cartão de adesivo. No parceiro, "Company stock: 5" fica.
Mudança: Linha única "6 in stock · 1 open order". "Print" -> "Make pieces" (R2-PROD-10), só em modelo pronto. "Parts with no code" -> "Bases, tokens and stickers" (pt "Bases, tokens e adesivos"). "No design yet (11)" com "Waiting for a design file".
Arquivos: pages/admin/tags/production-models*, i18n
Risco: nenhum.

### R2-PROD-20 [S3] Todos os pedidos: 38 linhas, chip de organização repetido, sem busca
Telas: platform/en-desktop/production-queue
Problema: Lista em 4.350 px com "Skale Club" em cada linha, o filtro "All organizations" sem rótulo, "All · Open · Done" onde Cancelado e Falhou não têm lugar claro, e o pedido de 9 linhas repetido. Sem busca por peça ou cor.
Mudança: Chip de organização só quando há mais de uma no filtro; busca; "Open · Done · Cancelled".
Arquivos: production-orders.tsx (AllOrders)
Risco: nenhum.

### R2-PROD-21 [S3] Revisão do "Generate": o mesmo adesivo duas vezes, o nome da peça três vezes
Telas: platform/en-desktop/production-generate-step4-review
Problema: "What you need: NFC sticker · 10 × 20 mm" e abaixo "Also for assembly: … 1 NFC sticker 10 × 20 NTAG213". O nome da peça se repete no cartão ("Large Stand · Google Review · White"), em "Printed on the piece · Google Review" e em "Piece Large Stand · Google Review · White".
Mudança: Tirar o grid "Piece / Pieces / Organization" (levar "4 pieces · 1 print" para o botão); adesivo uma vez só.
Arquivos: passo Review em production-generate*
Risco: nenhum.

### R2-PROD-22 [S3] Diálogo "Print": "bed" e uma caixa que parece campo mas não é
Telas: platform/en-desktop/production-print-dialog-from-model
Problema: "One bed holds 4; the rest goes on a partial print job. Up to 80." e abaixo uma caixa roxa "1 print job: 4" que parece editável. "The pieces and their batches belong to it." (campo Organization) usa "batches".
Mudança: "4 fit on one print. More go on extra prints (up to 80 pieces)." e "Prints: 1 × 4 pieces" em texto, sem caixa. "Organization: the company that will own these pieces."
Arquivos: i18n/messages/production.ts (chaves de quantidade)
Risco: nenhum.

### R2-PROD-23 [S3] Shop setup: ícones sem texto, "Stuscle", rótulos internos
Telas: platform/en-desktop/shop-setup, tags-shop
Problema: Cada linha tem lápis e lixeira sem nome. A frase "The buttons open the Stuscle store." usa nome de sistema; chips "Piece model" e "Ready-made kit". Na vitrine do revendedor, "See it in the store" (abre fora) e "Add to cart" (kit) têm a mesma cor e peso, e o rodapé "Open the wholesale store" repete.
Mudança: "Edit" e "Remove" em texto no computador; "What resellers see in their shop. Each button opens the store." sem o nome. Chips "Piece" e "Kit". Vitrine: um só estilo para a ação principal.
Arquivos: pages/admin/tags/ShopSetup*, i18n
Risco: o nome "Stuscle" pode ficar se o dono quiser.

### R2-PROD-24 [S3] A contagem de peças aparece duas vezes por cartão do quadro
Telas: platform/en-desktop/production-board, en-phone/production-board
Problema: Cada cartão mostra "4 pieces Oct 27, 2026" no topo à direita e, abaixo, "4 pieces MENU-2026-002". A data repete a de quase todos ("Nov 2, 2026"). O chip "Skale Club" aparece em todos.
Mudança: Contagem e data uma vez; data só quando não é hoje.
Arquivos: production-orders.tsx (RequestHeader, PlateRow)
Risco: nenhum.

### R2-PROD-25 [S4] "Did it come off the bed well?" lista "front-left" sem mapa
Telas: platform/en-desktop/production-mark-printed-3-some-bad-picked
Problema: "front-left 1 MF4HJFSB · front-right 2 · back-left 3 · back-right 4" pede para lembrar a posição; o código de 8 letras é a única pista, impresso na peça.
Mudança: Miniatura 2 × 2 da mesa com as posições. "bed" -> "plate" (pt "mesa").
Arquivos: diálogo markPrinted em production-job.tsx
Risco: nenhum.

### R2-PROD-26 [S4] Planejar a rota: outro estilo de botão e rótulos soltos
Telas: owner/en-desktop/route-planner-0-before, route-planner-4-review
Problema: O banner "Build today's route" e o botão "Find companies" são azuis com degradê; o resto do produto usa roxo. "Past routes" é título sobre "Routes you plan will appear here." Na revisão, "restaurants, coffee shops" em minúsculas ao lado de "Boston, MA". O botão do último passo é "Find companies" mas o título pede "Review today's plan".
Mudança: Mesma cor e tipo do botão principal; esconder "Past routes" enquanto vazio; capitalizar; botão "Plan my route".
Arquivos: pages/xpot route-planner*
Risco: nenhum.

### R2-PROD-27 [S4] Parceiro: "No design yet" e "isn't available to you" sem saída
Telas: partner/en-desktop/production-model-plate-large-venmo-white, production-model-part-not-for-partners
Problema: A lista do parceiro não mostra esses modelos, mas o endereço abre "No design yet" em âmbar com "This model isn't ready to print yet. Ask the Xpot team." (sem botão para falar com o time), ou "This model isn't available to you." num vazio.
Mudança: Botão "Back to models"; na primeira, o contato do time.
Arquivos: pages/admin/tags/production-model*
Risco: nenhum.

### R2-PROD-28 [S4] No celular, "Cancel code" e "Revoke" parecem rótulo
Telas: platform/en-phone/chip-writers
Problema: As ações dos computadores ficam à esquerda, em texto cinza, abaixo das etiquetas; não parecem botões (no computador estão à direita).
Mudança: Botão com contorno, à direita como no computador.
Arquivos: pages/admin/tags/ChipWriters*
Risco: nenhum.

## Resumo
Total 28 achados. S1: 2 (1, 2). S2: 13 (3 a 15). S3: 9 (16 a 24). S4: 4 (25 a 28).
Telas principais abaixo de 8: Produção (quadro, todas as ordens, modelos), pedido em Waiting/Building, pedido Printed, lote de impressão e de fornecedor, History, Chip writers, assistentes Generate/Print, Order from a supplier, as telas em es e pt.
