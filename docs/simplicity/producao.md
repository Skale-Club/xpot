# Produção: achados da auditoria visual

Pessoa em mente: quem opera a impressora e quer três coisas: o que imprimir agora, baixar, marcar como impressa.

Caminhos abaixo são relativos a `client/src`, salvo os que começam com `server/` ou `shared/`. Mensagens estão em `i18n/messages/`.

## Notas por tela

| Tela | A coisa mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| production-board | O que imprimir agora | 4 | "Waiting to print" primeiro, ordenado por ação; Failed com ação; Mark printed só com arquivo; uma frase de introdução |
| production-queue | A lista completa de impressões | 4 | Sem o cabeçalho do quadro, sem "Production" sob "Production", mesma ordem e mesmas ações |
| production-pending-batches | Lotes cujas peças faltam entrar | 2 | Status real da impressão, sem cancelados misturados, nome legível no celular |
| production-models | Achar um modelo e imprimir | 4 | Busca, grupos por produto, "No design yet" recolhido, Print só quando pode |
| production-models-new-dialog | Cadastrar um modelo | 4 | Nomes de campo em linguagem comum; nome curto e prefixo gerados |
| production-generate 1 a 4 | Pedir peças novas | 7 | Tocar no cartão avança; frase repetida sai; quantidade em evidência; um nome só para a peça |
| production-print-dialog-from-model | Imprimir o modelo que cliquei | 4 | Pular a lista de modelos; mesmo título e mesmo fluxo do Generate |
| production-other-ways-dialog | Lote de fornecedor | 4 | Nome do link igual ao título; três nomes de produto viram um |
| production-always-ready-version-picker | Baixar a peça fixa | 6 | Botão diz o que baixa; sem buraco no celular |
| production-job Waiting/Building | Saber por que espero | 4 | Botão de enviar arquivo à vista; computador ligado ou não |
| production-job Ready | Baixar e marcar | 6 | Baixar como principal; pausa antes dos números |
| production-job Printing | Marcar quando terminar | 5 | Texto próprio do estado; como chegar neste estado pela interface |
| production-job Failed | Saber por que e refazer | 5 | Motivo antes do botão; dizer o que acontece com os códigos; etapa correta |
| production-job Cancelled | Saber que parou | 4 | Sem "Next step", sem instruções de impressora |
| production-job Printed | Saber que acabou | 5 | "Mark assembled" explicado; etapas que não contradizem |
| production-job peça sem código | Saber que somou na contagem | 5 | Título sem "Next step"; texto de contagem, não de estoque |
| production-model com versão | Imprimir e ver a receita | 5 | Sem nome de script, código de builder ou log de engenharia à vista |
| production-model sem design | Saber o que falta | 3 | Texto para quem pode resolver; blocos vazios recolhidos |
| production-model desativado | Reativar | 3 | Botão de reativar; sem Print apagado sem motivo |
| production-model peça sem código | Ver e corrigir a contagem | 5 | Contagem no topo; decidir entre Print e download livre |
| production-model comprado | Corrigir a contagem | 3 | Sem Print, sem Ready, sem arquivo de impressão |
| batch impressão | Ver o que há com as peças | 3 | Status vindo da impressão; sem "Open for scanning"; card com a etapa de verdade |
| batch fornecedor, Summary | Saber o que falta | 5 | Sem "Generate print files" como principal; um só "Mark as done" |
| batch fornecedor, Print | Baixar os arquivos do fornecedor | 4 | Arquivos do fornecedor primeiro, em linguagem comum |
| batch fornecedor, Receive | Ler a peça | 5 | Campo de leitura visível sem rolar no celular |
| batch fornecedor recebido | Entregar as peças | 7 | Nota de etapas some quando acabou; um só selo verde |
| batch leitura (KEY) | Ler a primeira peça | 4 | "Every piece is in" com zero peças sai; aba Print sai |
| chip-writers | Saber quais computadores funcionam | 5 | Link de download; computador da impressora identificado; Revoke discreto |
| chip-writers-pairing-code | Parear o computador | 8 | Link de download do app nos passos |
| shop-setup | Manter a vitrine | 5 | Sem SKU na primeira frase; nomes inteiros no celular |
| shop-setup-new-entry | Criar uma entrada | 5 | Save sempre visível; campos explicados |
| history | Achar o que aconteceu com um lote | 4 | Nome em vez de e-mail; etiquetas corretas; filtros recolhidos; Plans alcançável no celular |
| restricted (produção e loja) | Saber para onde ir | 3 | Texto sem "management"; botão de volta |
| part-not-for-partners | Saber que a peça não é sua | 3 | Texto verdadeiro; sem "Try again" |
| peça pendente (popup e página) | Saber em que pé está a impressão | 4 | Status certo por estado; bloco de chip recolhido; texto sem "ask your manager" |

## S1: quebrado, errado ou enganoso

### PROD-1 [S1] Impressão com falha aparece apagada e sem nenhuma ação
Telas: platform/en-desktop/production-board, production-queue; platform/en-phone/production-board, production-queue
Problema: as linhas `Failed` (SPLATE-2026-003 e MENU-2026-002) são as de menor contraste da tela, não têm botão e não dizem o motivo. É o único caso em que o operador precisa decidir algo, e parece um item morto. O motivo e o "Print again" só aparecem ao abrir a linha pela seta. Estão ainda sob o título "Waiting to print", que não é o que está acontecendo.
Mudança: tirar o `opacity-60` das falhas (manter só em tentativa já refeita). Mostrar o motivo na própria linha e um botão "Print again"; o que hoje abre a linha continua abrindo. Ordem e grupo em PROD-9. Linha: selo vermelho `Failed`, motivo em uma linha truncada, botão à direita. Se o motivo não vier na lista, incluir `errorMessage` em `PrintJobItem` da lista.
Arquivos: pages/admin/tags/production-orders.tsx:76, :93-101; pages/admin/tags/production-job.tsx:66, :202
Risco: nenhuma regra muda. Refazer pela lista usa a mesma confirmação de PROD-13.
Status: feito

### PROD-2 [S1] "Mark printed" em impressão sem arquivo põe peças no estoque
Telas: platform/en-desktop/production-board, production-queue, production-model-g-token-large-relief; platform/en-phone/production-queue; comparar com platform/en-desktop/production-job-requested
Problema: `Stand Large · Instagram · White` está `Waiting for the file` e a linha mostra `Mark printed` roxo, igual ao das linhas prontas. Na página da mesma impressão esse botão não existe. Quem clica confirma e as peças entram no estoque ("The good pieces go into stock now, no scanning needed"), sem que exista arquivo para imprimir.
Mudança: na linha, `Mark printed` só para `ready` e `printing`. Em `requested`, a linha mostra "Upload file". A saída manual continua onde já está, em "Other actions" da página, com o rótulo "Printed without a file here" / "Impressa sem arquivo aqui" / "Impresa sin archivo aquí".
Arquivos: pages/admin/tags/production-orders.tsx:95; pages/admin/tags/production-job.tsx:169; shared/printProduction.ts:149
Risco: a saída existe de propósito (impressão à mão sem arquivo). A recomendação preserva a função e só a afasta do caminho comum.
Status: feito (a linha só oferece Upload file; a saída manual fica em Other actions, como "Printed without a file here")

### PROD-3 [S1] A página do lote não sabe o que aconteceu com a impressão
Telas: platform/en-desktop/batch-print-failedQr, batch-print-printing, batch-print-printedOld; platform/en-phone/batch-print-failedQr
Problema: MENU-2026-002 falhou, mas o lote mostra `Codes issued` + `Open for scanning`, zero alerta e `Close batch` ativo. LPLATE-2026-002 está na impressora e mostra o mesmo. SPLATE-2026-002 foi impresso há 34 dias e também. O card se chama "Production stage" e não contém etapa: "This batch comes from a print order: its stage, files and Mark printed live on the order page."
Mudança: quando o lote tem `printJobId`, o selo mostra o status da impressão, com a mesma cor de `JobStatusPill`. Sai o selo `Open for scanning`. O card vira "Print job": selo, motivo se falhou, botão "Open print job". Texto do card some.
Arquivos: pages/admin/tags/BatchDetail.tsx:323-324, :385-390; i18n/messages/adminTagsFlow.ts:171, :190-191
Risco: `BatchDetail` precisa receber `printJobStatus` (a peça já recebe esse campo).
Status: feito

### PROD-4 [S1] "Batches awaiting pieces" mistura cancelado, falho, em impressão e já impresso, todos iguais
Telas: platform/en-desktop/production-pending-batches; platform/en-phone/production-pending-batches; partner/en-desktop/production-pending-batches
Problema: 11 linhas com o mesmo selo `Codes issued`. Entre elas LPLATE-2026-006 (cancelado), MENU-2026-002 e SPLATE-2026-003 (falhos), LPLATE-2026-002 (na impressora), SPLATE-2026-002 (impresso). "Awaiting pieces" é falso para o cancelado: nenhuma peça virá sem nova ação. Um selo igual em todas as linhas não informa nada. No celular o nome corta em `LPLATE-2026-010 · Plat...`, então não se sabe que peça é.
Mudança: o selo passa a ser o status da impressão (ou "From supplier"). Lote de impressão cancelada sai da lista, ou vai para um grupo "Cancelled" recolhido. Linha no celular em duas linhas: código, depois o nome sem corte. Dentro desta rota sai a introdução do quadro.
Arquivos: pages/admin/tags/batches-model.ts:50; pages/admin/tags/production-pending-batches.tsx:18-24
Risco: a contagem de início usa `pendingBatches`; tirar cancelados muda esse número. O número novo é o correto.
Status: feito (o número de Today também deixou de contar lote de impressão cancelada)

### PROD-5 [S1] "Completed" ao lado de "8 pieces are not in stock yet"
Telas: platform/en-desktop/production-job-printedOld; platform/en-phone/production-job-printedOld; platform/en-desktop/batch-print-printedOld
Problema: a etapa acesa é `Completed` e, logo abaixo, o texto é "8 pieces of this print job are not in stock yet". IN STOCK 0/8. E há três ações lado a lado: `Put 8 pieces in stock`, `Mark assembled`, `Check QR codes`. Montar peças que nem entraram desconta material.
Mudança: enquanto houver peça pendente, a terceira etapa fica ativa como "Put in stock" e sem visto. `Mark assembled` só aparece com pendência zero. Texto: "This print is done, but its 8 pieces are not in stock." / "Esta impressão terminou, mas as 8 peças não estão no estoque." / "Esta impresión terminó, pero las 8 piezas no están en el stock."
Arquivos: pages/admin/tags/production-job.tsx:115, :195-197, :207-212; pages/admin/tags/production-workflow.ts:66
Risco: nenhum.
Status: feito

### PROD-6 [S1] Falhou na camada 12 e a etapa acesa é "Preparing files"
Telas: platform/en-desktop/production-job-failedManual, production-job-failedQr, production-job-cancelled; platform/en-phone/production-job-failedManual, production-job-cancelled
Problema: "Nozzle clog at layer 12; the plate peeled" foi na impressora, mas a etapa roxa é `Preparing files`. Em cancelada também. `productionJourneyStep` devolve 0 para todo status que não conhece.
Mudança: em `failed` e `cancelled`, as etapas somem; o selo e o motivo bastam.
Arquivos: pages/admin/tags/production-workflow.ts:66-69; pages/admin/tags/production-job.tsx:195-197
Risco: nenhum.
Status: feito

### PROD-7 [S1] Lote da Harbor diz que é da Skale Club
Telas: platform/en-desktop/batch-harbor-printed; partner/en-desktop/batch-harbor-printed; partner/en-phone/batch-harbor-printed
Problema: LPLATE-2026-007 é pedido "Harbor first run" da Harbor Print Co., e a linha do lote diz `Large Plate · Menu · Skale Club`. O parceiro lê o nome de outra empresa como fabricante do que ele imprimiu.
Mudança: no pedido, `vendor` passa a ser o nome da organização que imprime.
Arquivos: server/tags/production.ts:1003
Risco: lotes antigos guardam "Skale Club". Recomendo corrigir na leitura, mostrando a organização quando `printJobId` existe, sem migrar dados.
Status: feito (lote novo guarda o nome de quem imprime; o antigo é corrigido na leitura, sem migrar)

### PROD-8 [S1] "Every piece is in" num lote com zero peças
Telas: platform/en-desktop/batch-scanned-open-summary; platform/en-phone/batch-scanned-open-summary
Problema: KEY-2026-001 mostra `RECEIVED 0/0 · Every piece is in`, `0% of 0 pieces`, `Close batch` ativo e, ao mesmo tempo, a etapa `Receiving · In progress`. Fechar agora encerra um lote vazio.
Mudança: com `tagCount` zero, o card diz "No pieces yet" / "Nenhuma peça ainda" / "Ninguna pieza aún", sem porcentagens, e `Close batch` fica desativado com o motivo "Scan at least one piece first." / "Leia pelo menos uma peça primeiro." / "Lee al menos una pieza primero."
Arquivos: pages/admin/tags/BatchDetail.tsx:340, :399-400; i18n/messages/adminTagsFlow.ts:182
Risco: se um lote vazio precisar ser fechado por engano de cadastro, cancelar é o caminho. Recomendo manter o bloqueio.
Status: feito

## S2: a pessoa não entende ou erra

### PROD-9 [S2] O que imprimir agora é a última coisa da tela
Telas: platform/en-desktop/production-board; platform/en-phone/production-board; partner/en-desktop/production-board; partner/en-phone/production-board
Problema: "Waiting to print" começa em y≈835 no computador e y≈1220 no celular, depois de "Pieces to generate" e "Always ready". A primeira tela do celular mostra só introdução e cartões de criar. A lista vem por data: Ready, Building, Printing, Ready, Building, Waiting, Waiting, Ready, Failed, Failed. Dez linhas com o mesmo peso, e quem precisa de ação fica no fim.
Mudança: ordem da página: 1) lista, 2) "Pieces to generate", 3) "Always ready". Lista dividida em grupos, nesta ordem: "Needs attention" (Failed), "On the printer" (Printing), "Ready to print" (Ready), "Waiting for the file" (Waiting, Building). Grupo vazio some. Título da seção: "To print" / "Para imprimir" / "Para imprimir". Com lista vazia, a seção vira uma linha e os cartões sobem.
Arquivos: pages/admin/tags/production-board.tsx:59-104; pages/admin/tags/production-orders.tsx:37, :44; i18n/messages/productionBoard.ts:25
Risco: nenhum.
Status: feito

### PROD-10 [S2] "Sliced" no botão de baixar
Telas: platform/en-desktop/production-board, production-queue, production-model-base-large; platform/en-phone/production-board, production-queue; partner/en-desktop/production-board
Problema: o verbo da pessoa é baixar, e a palavra na tela é jargão do Bambu Studio. A mesma ação se chama `Download to print` na página da impressão e `Download` em Always ready.
Mudança: `downloadSliced`: "Download file" / "Baixar arquivo" / "Descargar archivo", em toda linha. `Download to print` usa o mesmo texto. Em `fileKind_gcode_3mf`, dentro dos detalhes técnicos, "Sliced, ready to print" vira "Ready to print" / "Pronto para imprimir" / "Listo para imprimir". `downloadProject` ("Project"), quando houver os dois: "Editable file" / "Arquivo editável" / "Archivo editable".
Arquivos: i18n/messages/production.ts:87-88, :207, :345, :594; i18n/messages/workspaces.ts (downloadPrint); pages/admin/tags/production-orders.tsx:93-94
Risco: nenhum. O registro em Histórico (`journeyAction_sliced`) pode seguir o mesmo texto.
Status: feito

### PROD-11 [S2] "v1 · x4 4 pieces asked"
Telas: platform/en-desktop/production-board, production-queue; platform/en-phone/production-queue; platform/en-desktop/production-model-plate-large-menu-white, production-job-requested
Problema: `v1` e `x4` são código para quem cadastrou o modelo. "pieces asked" não é inglês natural. A informação útil está espremida sem separador: `v1 · x4 4 pieces asked Nov 1, 2026`. A mesma quantidade aparece na linha de baixo: `4 pieces`.
Mudança: cabeçalho da linha: organização (se houver mais de uma) e data. Sai `v{version} · {bedLabel}`; a versão vai para os detalhes técnicos. Quantidade uma vez só, na linha de baixo. Em pedido com mais de uma impressão: "8 pieces · 2 print jobs" / "8 peças · 2 impressões" / "8 piezas · 2 impresiones". No cabeçalho da impressão também sai `v1 · x4`.
Arquivos: pages/admin/tags/production-orders.tsx:52-54; pages/admin/tags/production-job.tsx:148; i18n/messages/production.ts:85-86
Risco: o operador precisa saber a versão só se houver duas no ar; a página e o arquivo já são da versão certa.
Status: feito

### PROD-12 [S2] "Mark printed" é o principal antes de baixar
Telas: platform/en-desktop/production-job-ready, production-job-harborReady; platform/en-phone/production-job-ready, production-job-harborReady; partner/en-phone/production-job-harborReady
Problema: em `Ready to print` a ordem real é baixar, imprimir, marcar. O botão roxo é `Mark printed`, e `Download to print` está em cinza. Nada foi impresso ainda, então o destaque está no passo errado.
Mudança: em `ready`, "Download file" é o principal e `Mark printed` é secundário. Em `printing`, inverte: `Mark printed` principal, "Download again" discreto.
Arquivos: pages/admin/tags/production-job.tsx:203-206
Risco: quem pega o arquivo na pasta Print Now não baixa; continua com um clique no secundário.
Status: feito (Download é o principal; Mark printed só aparece depois de "I started printing", ver PROD-18)

### PROD-13 [S2] Falha: o botão vem antes do motivo, e "Print again" age sem perguntar
Telas: platform/en-desktop/production-job-failedQr, production-job-failedManual; platform/en-phone/production-job-failedQr, production-job-failedManual; partner não tem estado de falha na captura
Problema: o card diz `Next step`, o selo diz `Failed` e a frase diz `Failed`. Só depois do botão vêm "Why it failed" e, se for QR, "Print again uses fresh codes". Na falha manual não há palavra sobre o que acontece com os códigos nem com as peças que descolaram. O clique em `Print again` executa direto, e no caso de QR desativa os códigos atuais.
Mudança: título do card "This print failed" / "Esta impressão falhou" / "Esta impresión falló". Corpo: o motivo. Depois, uma frase conforme `planRedoCodes`: `same`: "Printing again uses the same codes." / "Imprimir de novo usa os mesmos códigos." / "Imprimir de nuevo usa los mismos códigos."; `replace`: o texto atual de `qrRedoBody`; `fresh`: "Printing again issues new codes for the pieces that did not come out." / "Imprimir de novo gera códigos novos para as peças que não saíram." / "Imprimir de nuevo genera códigos nuevos para las piezas que no salieron." Em `replace`, pedir confirmação. Secundário: "Cancel this print" visível, hoje dentro de "Other actions".
Arquivos: pages/admin/tags/production-job.tsx:66, :198-203, :216-219; shared/printProduction.ts:166; i18n/messages/production.ts:176, :186
Risco: conferir o texto de `fresh` com o comportamento de `redo` no servidor antes de publicar.
Status: feito

### PROD-14 [S2] Cancelada tem "Next step" e empurra para imprimir de novo
Telas: platform/en-desktop/production-job-cancelled; platform/en-phone/production-job-cancelled
Problema: `Next step` + selo `Cancelled` + frase `Cancelled` + `Print again` roxo. Alguém cancelou de propósito, e a tela trata isso como pendência. Também mostra `IN STOCK 0/4` e o bloco inteiro "At the printer" com a pausa.
Mudança: título "This print was cancelled" / "Esta impressão foi cancelada" / "Esta impresión fue cancelada". `Print again` em secundário. Saem o bloco "At the printer" e "In stock". O mesmo bloco some em `failed` até a pessoa imprimir de novo.
Arquivos: pages/admin/tags/production-job.tsx:198-203, :222-224, :231
Risco: nenhum.
Status: feito

### PROD-15 [S2] "You can also upload the file here", e não há botão
Telas: platform/en-desktop/production-job-requested, production-job-building, production-job-partTokenL, production-job-harborReq; platform/en-phone/production-job-requested, production-job-building, production-job-partTokenL; partner/en-desktop/production-job-harborReq
Problema: o botão existe, dentro de "Files, positions and technical details", fechado no fim da página. A peça sem gerador diz "This version has no builder: upload the print file here, or ask the Xpot team to build it." `builder` é termo interno, e quem lê na plataforma é a própria equipe do Xpot. `Waiting` e `Building` usam a mesma frase, embora um espere e o outro esteja gerando.
Mudança: botão "Upload file" no card, em `requested` e `building`. Textos: `requested` com gerador: "The print computer makes this file. It starts as soon as the computer is on." / "O computador da impressora gera este arquivo. Começa assim que ele estiver ligado." / "El ordenador de la impresora genera este archivo. Empieza en cuanto esté encendido." `building`: "{device} is making the file now." / "{device} está gerando o arquivo agora." / "{device} está generando el archivo ahora." Sem gerador: "This piece has no automatic file. Upload it to print." / "Esta peça não tem arquivo automático. Envie o arquivo para imprimir." / "Esta pieza no tiene archivo automático. Súbelo para imprimir."
Arquivos: pages/admin/tags/production-job.tsx:201, :258, :289; i18n/messages/production.ts:182-183
Risco: nenhum.
Status: feito

### PROD-16 [S2] Ninguém diz se o computador da impressora está ligado
Telas: platform/en-desktop/production-board, production-job-building; platform/en-desktop/chip-writers; partner/en-desktop/production-board, chip-writers
Problema: o rodapé avisa "The print computer generates the files. While it is off, jobs wait here." e o operador fica sem saber se é o caso agora. `Building` também não diz há quanto tempo. O dado existe: Chip writers mostra "last seen" e o cadastro do aparelho guarda o estado da impressora.
Mudança: trocar o rodapé por uma linha no topo da lista, com a mesma lógica de "stale": "Bench PC is on · printer idle" / "Bench PC está ligado · impressora parada" / "Bench PC está encendido · impresora libre", ou em âmbar "Bench PC has been off since 11:12. Files will wait." / "Bench PC está desligado desde 11:12. Os arquivos vão esperar." / "Bench PC está apagado desde las 11:12. Los archivos esperarán." Com vários computadores, uma linha por computador. Sem computador pareado: "No print computer paired." com link para Chip writers.
Arquivos: pages/admin/tags/production-board.tsx:100-103; i18n/messages/productionBoard.ts:28; pages/admin/tags/ProvisionersTab.tsx:181
Risco: confirmar que `printerStatus` chega à API de quem produz; o texto "printer idle" depende disso. Sem isso, usar só ligado/desligado.
Status: feito em parte. Linha por computador, ligado ou desligado e visto por último, no topo de To print. "Printer idle" pendente: o estado da impressora não chega à API de quem produz.

### PROD-17 [S2] "Preparing files / Print / Completed" parecem botões e não dizem nada a mais
Telas: platform/en-desktop/production-job-ready, production-job-printing, production-job-requested; platform/en-phone/production-job-ready, production-job-printing; partner/en-phone/production-job-harborReady
Problema: três caixas largas, com borda, ocupando a largura inteira, com a aparência dos botões logo abaixo. No celular somam 60px, depois de "Other actions". Repetem o selo. "Completed" não diz que as peças entram no estoque.
Mudança: faixa fina de progresso, sem borda de botão: "File → Print → In stock" / "Arquivo → Impressão → Estoque" / "Archivo → Impresión → Stock". Altura máxima de 28px, texto sem aparência de clicável.
Arquivos: pages/admin/tags/production-job.tsx:195-197; i18n/messages/workspaces.ts:46-49
Risco: `complete` e `prepare` podem ser usados por outra tela de `workspaces.ts`; criar chaves próprias.
Status: feito

### PROD-18 [S2] Ready e Printing dizem a mesma coisa, e não existe como dizer "comecei"
Telas: platform/en-desktop/production-job-printing, production-job-ready; platform/en-phone/production-job-printing, production-job-ready
Problema: na impressora ou não, a frase é "Download the file, print it in Bambu Studio and mark it printed here." O estado `Printing` aparece no quadro, mas nenhum botão da interface leva até ele: a ação `start` existe no servidor e não há chamada no cliente. Duas pessoas na mesma impressora não sabem o que já está rodando.
Mudança: recomendo oferecer em `ready` um secundário "I started printing" / "Comecei a imprimir" / "Empecé a imprimir". Texto de `printing`: "On the printer now. Mark it when it comes off the bed." / "Na impressora agora. Marque quando sair da mesa." / "En la impresora ahora. Márcala cuando salga de la cama."
Arquivos: pages/admin/tags/production-job.tsx:201, :203-206; i18n/messages/workspaces.ts:50; shared/printProduction.ts:122
Risco: depende do dono. Alternativa: retirar `Printing` da interface. Recomendo o botão, porque dá a resposta a "o que está na impressora".
Status: feito (botão "I started printing"; Mark printed só em Printing)

### PROD-19 [S2] A instrução da pausa fala de "serial map" e de chip programado, sem dizer onde estão
Telas: platform/en-desktop/production-job-requested, production-job-harborReq, production-job-ready; platform/en-phone/production-job-ready; compare com production-job-failedManual (blank) e production-job-cancelled (round tag)
Problema: é o momento em que o operador mais pode perder a mesa, e a frase é: "Pauses at Z 1.8 · Peel one programmed 10 × 20 NTAG213 sticker and press it flat, adhesive down, long side left-right, on the floor of each pocket (by the serial map); nothing above the rim; resume." "Programmed" exige gravar antes de imprimir, mas a tela não diz nem linka. O mapa de séries está no bloco fechado. Em outras peças o texto é "blank" e não há como saber se a diferença é proposital. Na página, vem depois de três cartões de números: no celular, em y≈1180.
Mudança: "At the printer" sobe para logo depois do card principal, e os números descem. Bloco da pausa em passos: 1) "Stops at height 1.8 mm." 2) "Put one programmed sticker in each pocket, sticky side down, long side left to right." 3) "Resume." Quando pede programado: link "Serial map" e "Write chips", e a contagem "0 of 4 written". Pt: "Para na altura 1,8 mm." / "Coloque um adesivo gravado em cada bolso, com a cola para baixo e o lado comprido na horizontal." / "Continue." Es: "Se detiene a la altura de 1,8 mm." / "Pon una pegatina grabada en cada hueco, adhesivo hacia abajo y lado largo en horizontal." / "Continúa."
Arquivos: pages/admin/tags/production-job.tsx:222-224, :231-256; textos de pausa em `recipe` de cada versão (dados do catálogo)
Risco: o texto é dado de versão, em inglês só. Reescrever exige nova versão ou campo estruturado; decisão do dono. Recomendo começar pelos links e pela posição, que não dependem disso.
Status: feito (a instrução física continua exata, em inglês porque é dado da versão do modelo, com "(em inglês)"; acrescentado em palavras o que falta: altura da pausa, chips gravados "0 of 4", links Write chips e Serial map; texto estruturado por idioma depende do dono)

### PROD-20 [S2] Sempre pronta "nothing recorded" contra pedido, Print e contagem
Telas: platform/en-desktop/production-board, production-job-partBaseS, production-model-base-large, production-models; platform/en-phone/production-model-base-large
Problema: o quadro diz sobre a base "No serial and nothing recorded: download the file and print it as often as you need." A página da mesma base tem `Print` roxo, pedidos, `Count`, e o movimento `Printed +4`. Na lista "Waiting to print", cujo texto fala em "Generated pieces", há `Stand base · Small`. Quem baixa pelo quadro não soma nada, e a contagem de 42 fica errada sem ninguém perceber.
Mudança: um caminho só. Recomendo: quadro e modelo mostram download, e ao lado "I printed these" / "Imprimi estas" / "Imprimí estas", que pergunta a quantidade e soma na contagem. Sai o `Print` que cria pedido em peça sem código. Texto da seção: "No serial needed. Download the file and add what you printed to the count." / "Não precisa de serial. Baixe o arquivo e some à contagem o que imprimiu." / "No necesita serial. Descarga el archivo y suma al conteo lo que imprimiste."
Arquivos: pages/admin/tags/production-board.tsx:73-87; pages/admin/tags/production-model.tsx:109; i18n/messages/productionBoard.ts:10
Risco: regra de negócio, decisão do dono. Sem mudar a regra, ao menos corrigir a frase: tirar "nothing recorded".
Status: feito em parte. Decidido sem o dono: o modelo sem serial (só a plataforma) ganhou "I printed these" (Imprimi estas) ao lado de Print, que soma à contagem com o motivo "printed"; a frase do quadro diz o mesmo. Não removi o `Print` que cria pedido: ele alimenta a fila e os números de impressão, e tirá-lo muda o fluxo da produção; fica pendente.

### PROD-21 [S2] Print apagado sem dizer por quê; comprado aparece como Ready
Telas: platform/en-desktop/production-models, production-model-nfc-sticker-10x20, production-model-plate-large-venmo-white, production-model-plate-large-venmo-mixed; platform/en-phone, mesmas telas; partner/en-desktop/production-model-plate-large-venmo-white
Problema: `Print` desativado sem motivo em 11 modelos sem design, 3 peças compradas e 1 desativado. A folha `NFC sticker (bought)` mostra `Ready`, `v1 bought · 1 piece`, `New version`, `Upload the print file`. A pessoa procura como imprimir algo que se compra. Nos modelos sem design, o roxo apagado da página de modelo ainda parece um botão principal.
Mudança: esconder `Print` quando não dá para imprimir. Comprado: selo "Bought" / "Comprada" / "Comprada" no lugar de `Ready`, ação principal `Change the count`, sem `New version` nem upload. Sem design: o selo basta. Desativado: ver PROD-23.
Arquivos: pages/admin/tags/ProductionTab.tsx:156; pages/admin/tags/production-model.tsx:109; pages/admin/tags/production-workflow.ts (canPrintModel)
Risco: é preciso um critério para "comprado". Hoje é a etiqueta `bought` na mesa da versão; recomendo um campo no modelo.
Status: feito

### PROD-22 [S2] Sem design: pede à equipe do Xpot para a própria equipe do Xpot
Telas: platform/en-desktop/production-model-plate-large-venmo-white; platform/en-phone/production-model-plate-large-venmo-white; partner/en-desktop/production-model-plate-large-venmo-white
Problema: a plataforma lê "Ask the Xpot team for its design: the model's short name is plate-large-venmo-white", com o botão `First version` ao lado. Depois vêm cinco blocos vazios: três números zero, "No print requests here", "Nothing listed yet", "No version yet."
Mudança: para a plataforma: "This model has no design yet. Add its first version to print it." / "Este modelo ainda não tem desenho. Cadastre a primeira versão para imprimir." / "Este modelo aún no tiene diseño. Añade su primera versión para imprimirlo." Para parceiro, mantém o pedido, sem o nome curto: "This model isn't ready to print yet. Ask the Xpot team." / "Este modelo ainda não está pronto para imprimir. Fale com a equipe do Xpot." / "Este modelo aún no está listo para imprimir. Habla con el equipo de Xpot." Sem versão, saem os números e os blocos Orders e Versions.
Arquivos: pages/admin/tags/production-model.tsx:116-124; i18n/messages/production.ts:96-97
Risco: nenhum.
Status: feito

### PROD-23 [S2] Modelo desativado sem caminho de volta à vista
Telas: platform/en-desktop/production-model-plate-large-venmo-mixed; platform/en-phone/production-model-plate-large-venmo-mixed; partner/en-desktop/production-models
Problema: selo `Deactivated`, versão `In use`, `New version` ativo, `Print` apagado. Nenhum botão "Reactivate" no cabeçalho, embora o servidor aceite a volta. O parceiro vê a seção DEACTIVATED, sobre a qual não pode fazer nada.
Mudança: cabeçalho com "Reactivate" / "Reativar" / "Reactivar" como único botão; `New version` sai. A versão muda de `In use` para "Last used" / "Última usada" / "Última usada". Parceiro não vê desativados.
Arquivos: pages/admin/tags/production-model.tsx:100-112; pages/admin/tags/ProductionTab.tsx; server/tags/production.ts:358
Risco: nenhum, se o parceiro não tiver pedido aberto do modelo. Nesse caso, mantê-lo só na tela do pedido.
Status: feito

### PROD-24 [S2] Lista de modelos sem busca: 45 cartões, 8480 px no celular
Telas: platform/en-desktop/production-models; platform/en-phone/production-models; partner/en-desktop/production-models; partner/en-phone/production-models
Problema: para achar `Stand Small · Menu · White` é preciso ler. A ordem mistura Stand e Plate, Large e Small, e os `No design yet` ficam intercalados na mesma grade. `Company stock: 0` se repete em quase todos, e a página tem duas introduções antes da lista.
Mudança: busca no topo, filtro de produto em chips (Large Stand, Small Stand, Large Plate, Small Plate, Parts). Grupos por produto. "No design yet (11)" e "Deactivated" recolhidos, e invisíveis para parceiro. No celular, linha compacta com miniatura, nome e botão. Estoque só quando maior que zero.
Arquivos: pages/admin/tags/ProductionTab.tsx:56-62, :130-165, :195-205
Risco: nenhum.
Status: feito

### PROD-25 [S2] Print em um modelo abre "New production" e pergunta qual modelo
Telas: platform/en-desktop/production-print-dialog-from-model; platform/en-phone/production-print-dialog-from-model
Problema: cliquei `Print` num modelo e abre uma lista de rádios com todos os modelos, título "New production", "Choose a saved model. Its design, colours and sales product are already configured." A mesma ação no quadro se chama "Generate Large Stand" e tem outra cara.
Mudança: vindo de um modelo, pula o passo 1 e abre em quantidade. Título "Print {model}" / "Imprimir {model}" / "Imprimir {model}", com passos Quantity e Review, os mesmos do Generate. Sai a frase de introdução.
Arquivos: pages/admin/tags/production-orders.tsx:24-26; pages/admin/tags/production-wizard.tsx:52-54, :132-147
Risco: nenhum.
Status: feito

### PROD-26 [S2] Dois nomes para a mesma peça, às vezes no mesmo diálogo
Telas: platform/en-desktop/production-generate-step4-review; platform/en-phone/production-generate-step4-review; platform/en-desktop/production-board, shop-setup; partner/en-desktop/production-generate-step4-review
Problema: no Review, `Stand Large · Google Review · White` no cartão e `Large Stand · Google Review · White` em Piece, com o título "Generate Large Stand" acima. O quadro usa os dois na mesma tela: cartão "Large Stand", linha "Stand Small · Google Review · White". O cabeçalho do lote repete o par na mesma linha.
Mudança: uma forma só em toda a interface: "Large Stand · Google Review · White". Montar o título a partir de produto, face e cor quando o modelo tem esses campos, e renomear os títulos do catálogo. Peças sem código mantêm o título próprio.
Arquivos: pages/admin/tags/production-identity.tsx:21-34; pages/admin/tags/production-model.tsx:83; pages/admin/tags/BatchDetail.tsx:328-330; server/tags/production.ts:991-999
Risco: títulos são dados do catálogo e nomes de lote já gravados; usar a montagem na leitura evita migração.
Status: feito (nome montado na leitura a partir de produto, face e cor; títulos de catálogo e nomes de lote já gravados não migram)

### PROD-27 [S2] Order, print order, print request, print job, plate: cinco nomes para duas coisas
Telas: platform/en-desktop/production-board ("All orders"), production-queue, production-job-*, production-model-plate-large-menu-white ("ORDERS", "No print requests here", "Print job 1 of 2"), batch-print-printedA-1 ("Back to order", "Open print order", "plate 1/2"), production-generate-step3-quantity ("The plates, their batches and pieces belong to it.")
Problema: o glossário fechou "Print job" para a mesa, mas `plate` continua em texto e no nome do lote. `Back to order` leva a uma impressão, não ao pedido. A pessoa não sabe se são coisas diferentes.
Mudança: dois nomes. Order / Pedido / Pedido: o que foi pedido. Print job / Impressão / Impresión: cada mesa. `Back to order` e `Open print order` viram "Back to print job" e "Open print job". `queueEmpty`: "No orders here" / "Nenhum pedido aqui" / "Ningún pedido aquí". `organizationHint`: "The pieces and their batches belong to it." / "As peças e os lotes pertencem a ela." / "Las piezas y sus lotes le pertenecen." Nome do lote: "print job 1/2" no lugar de "plate 1/2".
Arquivos: i18n/messages/production.ts:36, :70; i18n/messages/productionBoard.ts:29; i18n/messages/unifiedProduction.ts:9; i18n/messages/adminTagsFlow.ts:190-191; server/tags/production.ts:991
Risco: nomes de lote já gravados continuam com "plate" até a correção de PROD-26.
Status: feito

### PROD-28 [S2] "What you need" lista só o adesivo, e duas vezes
Telas: platform/en-desktop/production-generate-step3-quantity, production-generate-step4-review, production-model-stand-large-google-white; platform/en-phone/production-generate-step3-quantity, production-generate-step4-review
Problema: `NFC sticker · 10 × 20 mm` e, embaixo, `NFC sticker`. O texto é "Have these ready before you print. Use exactly what is listed here." Mas o filamento aparece só na versão (`1: White PLA · 2: Black PLA · 3: Yellow PLA`), e a seção vazia promete "which sticker or filament to buy". Quem confia na lista compra errado.
Mudança: "What you need" lista o filamento da versão junto dos materiais. A segunda linha do material só aparece se for diferente da primeira. No Stand, se a montagem usa base e token, incluir: "Also for assembly: 1 Stand base · Large, 1 Google G token".
Arquivos: pages/admin/tags/production-materials.tsx
Risco: a lista de montagem depende de `consumes`, que já existe na versão.
Status: feito

### PROD-29 [S2] Texto interno à vista, também para parceiro
Telas: platform/en-desktop/production-model-plate-large-menu-white, production-model-stand-large-google-white, production-model-base-large; platform/en-phone, mesmas telas; partner/en-desktop/production-model-plate-large-menu-white, production-model-stand-large-google-white; partner/en-phone/production-model-plate-small-instagram-black
Problema: "Made by print-pipeline/preview.py, then uploaded here (.glb).", `Upload .glb`, `plate.menu`, `panel`, "v1: the fixed files of the 3D repo's PRINT NOW (uploaded with bench.py attach-bed)", "(doc 16 s5)", "Sample A7K3P9X2: x4: clean slice, 4/4 QR, pause 1.8, 310.0 min, 25 swaps", "(user, 2026-11-01, every black piece)", e descrições como "Production plate, batch REV-2026-003, serials 001-002-003-004: one Google card per Smart Tags code, PLA". O parceiro lê tudo isso.
Mudança: sai `previewEmptyHint`. Sem 3D, parceiro não vê o card; plataforma vê só "No 3D view yet" e `Upload`. `builder` e `panel` saem da linha da versão. Para parceiro, a lista de versões mostra só a versão em uso, sem nota; a nota fica para a plataforma. Reescrever as descrições do catálogo como frase para quem imprime.
Arquivos: pages/admin/tags/production-preview.tsx:42-58; pages/admin/tags/production-model.tsx:130, :229; i18n/messages/production.ts:255
Risco: confirmar se o parceiro pode de fato enviar `.glb` no servidor; a captura mostra o botão para ele. Recomendo bloquear.
Status: feito em parte. O parceiro não vê builder, painel, notas nem receita. A descrição dos modelos do catálogo é dado do banco, não código: reescrever é feito no catálogo (Production > modelo > Edit), não nesta rodada.

### PROD-30 [S2] Cabeçalho do modelo corta a cor, que é o que diferencia
Telas: platform/en-phone/production-model-plate-large-menu-white, production-model-plate-large-venmo-white, production-model-stand-large-google-white, production-model-plate-small-instagram-black; partner/en-phone/production-model-plate-small-instagram-black
Problema: `Plate Large · Menu · W...`, `Stand Large · Google R...`, `Plate Small · Instagram ...`. Modelos branco e preto ficam com o mesmo título. Ao lado, sobra espaço para `plate-large-menu-white Large Plate white LPLATE-...`, que repete o título, o nome interno e um prefixo cortado.
Mudança: título quebra em até 2 linhas, sem truncar. Saem da linha de metadados o nome curto, o produto e o prefixo: vão para `Edit`.
Arquivos: pages/admin/tags/production-model.tsx:83-98
Risco: nenhum.
Status: feito

### PROD-31 [S2] Lote de fornecedor empurra "Generate print files" como ação principal
Telas: platform/en-desktop/batch-supplier-open-summary, batch-supplier-open-print, batch-supplier-open-receive; platform/en-phone, mesmas telas
Problema: SUP-2026-001 é acrílico da Tagworks Shenzhen, com frete aéreo a caminho. O botão roxo em todas as abas é `Generate print files`, que manda a impressora da casa imprimir o mesmo lote. Na aba Print ele aparece duas vezes. O que importa neste lote é receber.
Mudança: sai do cabeçalho. Fica só na aba Print, em secundário, abaixo dos arquivos do fornecedor, com o nome "Print here instead" / "Imprimir aqui em vez disso" / "Imprimir aquí en su lugar". O texto `reuseCodesHint` vira "Uses the same codes. No new pieces are created." / "Usa os mesmos códigos. Nenhuma peça nova é criada." / "Usa los mismos códigos. No se crean piezas nuevas." O principal do cabeçalho passa a ser "Receive pieces".
Arquivos: pages/admin/tags/BatchDetail.tsx:288, :337, :413; i18n/messages/unifiedProduction.ts:28, :32
Risco: nenhum.
Status: feito

### PROD-32 [S2] Aba Print do fornecedor em linguagem de planilha
Telas: platform/en-desktop/batch-supplier-open-print; platform/en-phone/batch-supplier-open-print
Problema: "The CSV maps serial → code → QR/NFC link → QR file. The ZIP holds the CSV plus one SVG (optionally a 1200px PNG) per piece. Write each NFC chip with its row's nfc_url and lock it only after its QR and NFC both pass a phone test." Botões `CSV`, `QR ZIP (SVG)`, `QR ZIP (SVG + PNG)`. O ícone do card é de gráfico.
Mudança: título "Files for the supplier" / "Arquivos para o fornecedor" / "Archivos para el proveedor". Botões: "List of codes (CSV)", "QR images (SVG)", "QR images (SVG + PNG)". Texto: "Send these to the supplier. Each piece has its own code." Regra do chip recolhida em "How to write the chips". Pt: "Lista de códigos (CSV)", "Imagens de QR (SVG)", "Imagens de QR (SVG + PNG)", "Envie ao fornecedor. Cada peça tem seu código.", "Como gravar os chips". Es: "Lista de códigos (CSV)", "Imágenes QR (SVG)", "Imágenes QR (SVG + PNG)", "Envíalos al proveedor. Cada pieza tiene su código.", "Cómo grabar los chips". Ícone de arquivo.
Arquivos: pages/admin/tags/BatchDetail.tsx:413-425
Risco: nenhum.
Status: feito

### PROD-33 [S2] Receber: o campo de leitura fica abaixo da dobra no celular
Telas: platform/en-phone/batch-supplier-open-receive, batch-scanned-open-receive; platform/en-desktop/batch-supplier-open-receive
Problema: quem recebe está com as peças na mão. No celular, o campo aparece em y≈947, depois do cabeçalho do lote, abas e um cartão de produto de 160 px que repete o cabeçalho. O placeholder corta em `Scan or type the Xpot QR/NFC li`. O botão de tela cheia é um ícone sem nome, e `Close batch` aparece duas vezes. `Use camera`, o principal no celular, tem a aparência mais fraca.
Mudança: na aba Receive sai o cartão de produto; no celular o cabeçalho recolhe para código e contagem. `Use camera` em primário no celular. Placeholder "Scan or type the code" / "Leia ou digite o código" / "Escanea o escribe el código". Ícone com rótulo "Full screen" / "Tela cheia" / "Pantalla completa". `Close batch` só no rodapé desta aba.
Arquivos: pages/admin/tags/BatchDetail.tsx:426; pages/admin/tags/batch-receive.tsx:168-231
Risco: nenhum.
Status: feito. No celular "Use camera" é o botão principal, em largura total, acima do campo; a introdução fica escondida no celular; sem cartão do produto, placeholder curto, tela cheia com rótulo e Close batch só no rodapé. Visto no celular (en, pt, es).

### PROD-34 [S2] Lote de impressão com "Open for scanning" e "Close batch"
Telas: platform/en-desktop/batch-print-printedA-1, batch-print-printing, batch-harbor-printed; partner/en-desktop/batch-harbor-printed; partner/en-phone/batch-harbor-printed
Problema: desde que "Mark printed" põe no estoque, ninguém lê essas peças para dar entrada ("no scanning needed"). Mesmo assim a tela diz `Open for scanning`, com 4/4 recebidas, e oferece `Close batch`. O parceiro vê o selo sem poder fechar. Fechar um lote em impressão, como em LPLATE-2026-002, é possível.
Mudança: lote com `printJobId` não mostra selo de aberto/fechado nem `Close batch`.
Arquivos: pages/admin/tags/BatchDetail.tsx:324, :340
Risco: se fechar impede algo que a impressão precise, confirmar antes. Recomendo o sistema fechar sozinho ao terminar.
Status: feito

### PROD-35 [S2] Números do lote que parecem não bater
Telas: platform/en-desktop/batch-print-printedA-1, batch-harbor-printed; platform/en-phone/batch-print-printedA-1; partner/en-desktop/batch-harbor-printed
Problema: REV-2026-002: selo `In stock`, `COMPANY STOCK 0`, e 0 + 2 + 1 = 3 de 4 recebidas. A quarta é de uso interno, e não há card para isso. LPLATE-2026-007: `SOLD 0 · 1 live`, que parece contradição, já que ao vivo não é vendida. `DAMAGED 0 · Quality-control sample` descreve um caso que não é o da tela. `0% of chips` é ruído.
Mudança: o selo de etapa em lote de impressão vira "All received" / "Tudo recebido" / "Todo recibido". Card novo "Other" / "Outras" / "Otras" quando houver, com a soma fechando no total. "Live" sai de Sold e vira card próprio, ou dica "1 live, not sold". Sai o texto de Damaged.
Arquivos: pages/admin/tags/BatchDetail.tsx:275-281, :398-405; shared/tagMetrics.ts:26-42; i18n/messages/manageTagsBatches.ts:14, :71-72
Risco: "Other" precisa somar uso interno, reservada, perdida e desativada. Validar contra `TAG_STOCK_METRICS`.
Status: feito. Selo vem da impressão, Damaged só se maior que zero, "1 live, not sold", e um cartão "Other" (Outras) junta uso interno, reservadas, perdidas e desativadas, para os cartões fecharem com o total do lote.

### PROD-36 [S2] Peça pendente não diz em que pé está a impressão
Telas: platform/en-phone/piece-popup-pendingFailed, piece-popup-pendingCancelled, piece-popup-pendingPrinting, piece-popup-pendingBuilding, piece-popup-pendingOldPrint; platform/en-desktop/piece-popup-pendingFailed
Problema: a peça cuja impressão está na impressora mostra `Waiting to print`. A de impressão falha ou cancelada mostra `Not in stock yet` e `Go to printing`, sem dizer que falhou. Se os códigos forem substituídos, esta peça nunca existirá. Mais abaixo: "This piece isn't in stock yet, so it can't be set up or sold. Ask your manager to scan it into its batch.", o oposto de "no scanning needed", e dito a quem é o gerente. `Held by Company stock` aparece com `Not in stock yet`.
Mudança: selo pelo status da impressão: "Print failed" / "Impressão falhou" / "Impresión falló", "Print cancelled", "On the printer", "Waiting for the file", "Ready to print". Botão: "Open print job". Dica de falha: "It will not exist until it is printed again." / "Ela só vai existir quando for impressa de novo." / "Solo existirá cuando se imprima de nuevo." Sem impressão: `stockBlocked` diz "It goes into stock when its print job is marked printed." `Held by` fica vazio enquanto pendente.
Arquivos: components/piece/pieceView.ts:105-116; components/piece/PieceBody.tsx:90; i18n/messages/pieceScreen.ts:109, :116; i18n/messages/tags.ts:130
Risco: `stockBlocked_pending` também serve a lote de fornecedor, onde "scan" é correto. Separar pelas duas origens.
Status: feito. A peça pendente diz "Print failed" / "Print cancelled" / "Waiting to print", o botão é "Open print job" (Abrir a impressão) e a dica da falha diz que a peça só existe quando for impressa de novo. Visto no popup.

### PROD-37 [S2] Chip writers lista o computador da impressora sem dizer que ele imprime
Telas: platform/en-desktop/chip-writers; platform/en-phone/chip-writers; partner/en-desktop/chip-writers; partner/en-phone/chip-writers
Problema: `Bench PC` e `Harbor bench` geram os arquivos de impressão, e a tela só fala de chips: "The app gets a token that can only receive the chips to write and report the result". Quem procura por que o arquivo não sai não vem aqui, e não há sinal de capacidade. `darwin`, `win32`, `v0.9.4`, `token bench_hrb...`.
Mudança: selo por capacidade: "Writes chips" e "Makes print files". Linha: "Mac · last seen 11:12 PM". Sai o token. Nome da seção no menu: "Computers" / "Computadores" / "Ordenadores", com o título "Chip writers and print computers". Texto: "Install the Xpot app on the computer connected to the NFC reader or the printer, then pair it with a one-time code. The app can only do this work and has no admin access."
Arquivos: pages/admin/tags/ProvisionersTab.tsx:74, :172-186; i18n/messages/manageTags.ts:193
Risco: o nome "Chip writers" está no glossário de simplicidade. Mudar pede o dono; recomendo manter o item no menu e ajustar só selo e texto, se preferir o menor passo.
Status: feito

### PROD-38 [S2] Parear um computador sem saber de onde baixar o app
Telas: platform/en-desktop/chip-writers, chip-writers-pairing-code; platform/en-phone, mesmas telas; partner/en-phone/chip-writers-pairing-code
Problema: "Install the Xpot NFC Writer desktop app" e nenhum link na página. O passo a passo do código parte do princípio de que o app já está instalado.
Mudança: botão "Download the app" ao lado do texto de introdução e no primeiro passo. Se o download for só por contato: "Ask the Xpot team for the installer."
Arquivos: pages/admin/tags/ProvisionersTab.tsx:140-150
Risco: depende de existir um endereço público do instalador; decisão do dono.
Status: feito em parte (a introdução manda pedir o instalador à equipe; o botão de download depende de um endereço público, decisão do dono)

### PROD-39 [S2] Campos do novo modelo em idioma de banco de dados
Telas: platform/en-desktop/production-models-new-dialog; platform/en-phone/production-models-new-dialog
Problema: `Kind: With codes`, `Short name` ("Lowercase words joined by dashes."), `Product`, `Printed on the pieces`, `Sales catalog product`, `Batch prefix` ("Each order's batch is named PREFIX-year-number."). `Save` apagado sem dizer o que falta. O diálogo do fornecedor chama as mesmas coisas de `Physical model` e `Sales product`.
Mudança: ordem: Type of piece (Large Stand…, Part), Printed on the piece, Colour; o Name se preenche. `Short name` e `Batch prefix` gerados e recolhidos em "Advanced". `Sales catalog product` vira "Sold as" / "Vendida como" / "Vendida como", com a dica "Sets the price when sold." `Kind` some: escolher "Part" já diz. `Save` diz o que falta: "Fill in: Colour, Name".
Arquivos: pages/admin/tags/production-model.tsx:425-470; pages/admin/tags/production-wizard.tsx:132-147
Risco: nome curto e prefixo gerados podem colidir; validar no servidor e, se colidir, abrir "Advanced".
Status: feito

### PROD-40 [S2] "Other ways to produce" abre "New production", com o fornecedor como padrão
Telas: platform/en-desktop/production-board, production-other-ways-dialog; platform/en-phone, mesmas telas
Problema: link de texto de 12 px no fim da página, com nome vago. Abre um diálogo com outro nome, "Define the pieces and choose how their codes will be added." Termos como "issue codes" e "Order from a supplier · issue codes".
Mudança: link "Order from a supplier or add pieces with codes" / "Pedir a um fornecedor ou adicionar peças com código" / "Pedir a un proveedor o añadir piezas con código". Título igual ao link. `How will these pieces be made?` em dois cartões grandes: "A supplier makes them: Xpot creates the codes" e "They already have codes: scan them in".
Arquivos: pages/admin/tags/production-board.tsx:107-111; i18n/messages/unifiedProduction.ts:14-15
Risco: nenhum.
Status: feito

### PROD-41 [S2] Autor em e-mail, e etiquetas erradas no Histórico
Telas: platform/en-desktop/history; platform/en-phone/history
Problema: a mesma pessoa aparece como `Jessica Alvarez (app)` e `jessica.alvarez@lab.example (app)`; a maioria dos autores é e-mail. "Hypothesis planned", "Task planned" e "Experiment planned" têm a etiqueta `Decision` e repetem o nome do plano no rodapé. "Tag 0XBAXB57" contraria o glossário ("nunca tag para o objeto"). `AI (MCP)` e `Approve` soltos, sem dizer o que se aprova.
Mudança: sempre o nome. "Piece 0XBAXB57". Item de plano: etiqueta "Plan" / "Plano" / "Plan", sem rodapé repetido. `AI (MCP)` vira "AI assistant" / "Assistente de IA" / "Asistente de IA". `Approve` vira "Approve this note" / "Aprovar esta nota" / "Aprobar esta nota".
Arquivos: pages/admin/tags/JourneyTab.tsx; pages/admin/tags/JourneyPanel.tsx; pages/admin/tags/journey-shared.tsx; títulos gravados pelo servidor em server/tags
Risco: títulos antigos já gravados com "Tag" ficam até serem traduzidos na leitura.
Status: feito em parte. Nome em vez de e-mail, "Piece", "AI assistant", "Approve this note", e a etiqueta dos itens de plano é "Plan" (Plano). Pendente: o rodapé que repete o nome do plano.

### PROD-42 [S2] Histórico sem foco e sem fim, com Plans inalcançável no celular
Telas: platform/en-desktop/history; platform/en-phone/history
Problema: 14.564 px no computador e 19.556 no celular. No celular são cerca de 500 px de título, seletor, busca, introdução e filtros antes do primeiro evento. Plans fica depois de toda a lista. Eventos automáticos e decisões têm o mesmo peso. No computador o placeholder corta em `Search the log (code, customer, tex`.
Mudança: filtros recolhidos em um botão no celular. Plans em aba: History | Plans. Padrão: só "o que a equipe registrou", com interruptor "Show automatic events". Cada dia recolhe sequências iguais ("5 kits delivered"). Placeholder "Search" / "Buscar" / "Buscar".
Arquivos: pages/admin/tags/JourneyTab.tsx:39-42; i18n/messages/manageTags.ts:236, :253
Risco: mudar o padrão esconde eventos automáticos de quem costuma lê-los; decisão do dono. Recomendo o padrão com tudo no computador e recolhido no celular.
Status: feito em parte (link Plans no topo no celular, busca curta, introdução curta; filtros recolhidos e interruptor de eventos automáticos dependem do dono)

## S3: carregado

### PROD-43 [S3] A mesma frase três vezes, e uma delas falsa para o parceiro
Telas: platform/en-desktop/production-board, production-models, production-queue, production-pending-batches; partner/en-desktop/production-board; partner/en-phone/production-board
Problema: "each one gets its own serial and stays pending until it is printed." / "Every piece gets a new serial and enters stock as pending until it is marked printed." / "Generated pieces stay pending until they are marked printed." E no diálogo, de novo. O parceiro lê "Download the always-ready pieces", seção que ele não tem. Esse texto ainda fica no topo de Models, da fila e dos lotes.
Mudança: sai a introdução da página, em todas as rotas. "Pieces to generate": "New pieces get their own serial and go into stock once printed." / "Peças novas ganham serial próprio e entram no estoque depois de impressas." / "Las piezas nuevas reciben su propio serial y entran al stock después de imprimirse." "To print" sem texto.
Arquivos: pages/admin/tags/ProductionTab.tsx:61; i18n/messages/productionBoard.ts:8, :19, :26
Risco: nenhum.
Status: feito

### PROD-44 [S3] Fila: título, introdução, abas, voltar e outra introdução antes da lista
Telas: platform/en-desktop/production-queue; platform/en-phone/production-queue; partner/en-desktop/production-queue; partner/en-phone/production-queue
Problema: `Production` em h1, depois `‹ Production` e nova frase. A lista começa em y≈430 no computador e ≈570 no celular, com as mesmas linhas do quadro. O parceiro tem duas linhas e vê a mesma coisa nas duas telas.
Mudança: em /queue sai o cabeçalho e as abas; título "All orders" / "Todos os pedidos" / "Todos los pedidos", voltar "Production". Frase sai. Seletor de organização só com mais de uma. Depois de PROD-9, o quadro mostra o que está aberto e esta tela serve para `Done` e `All`.
Arquivos: pages/admin/tags/ProductionTab.tsx:56-70; i18n/messages/unifiedProduction.ts:36
Risco: nenhum.
Status: feito

### PROD-45 [S3] Status três vezes, quantidade três vezes, código duas vezes na página da impressão
Telas: platform/en-desktop/production-job-ready, production-job-requested; platform/en-phone/production-job-ready; partner/en-desktop/production-job-harborReq
Problema: selo no cabeçalho, etapa e selo no card. `4 pieces` no card e em `PIECES 4`. Código no cabeçalho e no card. O cartão `IN STOCK 0/4` em impressão que nem saiu é ruído. No computador a grade de 4 colunas deixa uma vaga. No celular, 3 cartões empilhados usam 260 px antes da pausa. A nota ("For the Brightside launch") flutua entre cartões, sem rótulo.
Mudança: card principal sem a linha de selo. Grade vira linha compacta única: "4 pieces · 3 h 01 · 6 colour swaps", e "In stock" só depois de impressa. Nota dentro do card: "Note: For the Brightside launch".
Arquivos: pages/admin/tags/production-job.tsx:199, :220, :222-227
Risco: nenhum.
Status: feito

### PROD-46 [S3] Impressa: "Mark assembled" sem explicação, em primário
Telas: platform/en-desktop/production-job-printedA1, production-job-harborPrinted; platform/en-phone/production-job-printedA1, production-job-harborPrinted; partner/en-desktop/production-job-harborPrinted
Problema: card `Next step` com "All pieces from this print job have been received into stock." e um botão roxo que não diz o que é montar, nem que desconta material. `Check QR codes` leva à aba Receive do lote, sem aviso de que não precisa dar entrada de novo.
Mudança: frase: "All 4 pieces are in stock. If you assemble them now, the bases and tokens come off the count." / "As 4 peças estão no estoque. Se montar agora, as bases e os tokens saem da contagem." / "Las 4 piezas están en stock. Si las montas ahora, las bases y los tokens salen del conteo." Botão em secundário.
Arquivos: pages/admin/tags/production-job.tsx:208-212; i18n/messages/workspaces.ts:51; i18n/messages/production.ts:243-245
Risco: nenhum. Confirmar a montagem em lote parcial.
Status: feito

### PROD-47 [S3] Peça sem código: "Next step" sem passo, e "received into stock"
Telas: platform/en-desktop/production-job-partBaseL; platform/en-phone/production-job-partBaseL
Problema: card `Next step` vazio de ação. A frase fala em "received into stock", e a peça não tem estoque, tem contagem.
Mudança: título "Done" / "Pronto" / "Listo". Texto: "4 pieces added to the count. On hand: 42." / "4 peças somadas à contagem. Em mãos: 42." / "4 piezas sumadas al conteo. Disponibles: 42." Também vale para qualquer impressa sem pendência.
Arquivos: pages/admin/tags/production-job.tsx:198, :201; i18n/messages/workspaces.ts:51
Risco: nenhum.
Status: feito

### PROD-48 [S3] Na página do modelo, cada pedido repete o modelo
Telas: platform/en-desktop/production-model-plate-large-menu-white, production-model-stand-large-google-white; platform/en-phone, mesmas telas; partner/en-desktop/production-model-plate-large-menu-white
Problema: miniatura, título e chips iguais ao cabeçalho, em cada pedido. No celular, cada pedido tem 200 px. `Print job 1 of 2` quebra em duas linhas.
Mudança: `RequestList` com `model` definido não mostra identidade. Linha: organização, data e status.
Arquivos: pages/admin/tags/production-orders.tsx:48-50
Risco: nenhum.
Status: feito

### PROD-49 [S3] Página do modelo no celular: três números empilhados antes de tudo
Telas: platform/en-phone/production-model-plate-large-menu-white, production-model-plate-large-venmo-white, production-model-stand-large-google-white, production-model-base-large; partner/en-phone/production-model-plate-small-instagram-black
Problema: `COMPANY STOCK`, `WITH RESELLERS`, `OPEN ORDERS` em cartões de largura total somam 250 px. Depois vem "3D view" vazio, antes dos pedidos.
Mudança: grade de 3 colunas também no celular, com rótulo curto. Sem preview: sem card. Materiais antes de versões.
Arquivos: pages/admin/tags/production-model.tsx:119-123, :130
Risco: nenhum.
Status: feito

### PROD-50 [S3] Passo de quantidade com a pergunta no fim, e dica cortada
Telas: platform/en-desktop/production-generate-step3-quantity; platform/en-phone/production-generate-step3-quantity; partner/en-phone/production-generate-step3-quantity
Problema: "How many pieces?" no topo, depois peça, material e organização. O campo vem em y≈715. No celular a dica corta em `(up to`. Abaixo da dobra há mais conteúdo sem indicação de rolagem.
Mudança: o campo logo depois da pergunta, com botões − e +, e peça em uma linha pequena. Material vai para o Review. Dica: "4 fit on one print job. Up to 80." / "Cabem 4 em uma impressão. Até 80." / "Caben 4 en una impresión. Hasta 80."
Arquivos: pages/admin/tags/production-generate.tsx; pages/admin/tags/production-wizard.tsx:163-166; i18n/messages/production.ts:55
Risco: nenhum.
Status: feito

### PROD-51 [S3] Assistente: cor e face pedem dois toques, e o foco parece escolha
Telas: platform/en-desktop/production-generate-step1-colour, production-generate-step2-face; platform/en-phone, mesmas telas; partner/en-desktop/production-generate-step2-face
Problema: escolher e depois apertar `Continue` não acrescenta nada quando a decisão é de um toque. No passo 2 o primeiro cartão aparece realçado pelo foco, com `Continue` ainda apagado: parece escolhido e não está.
Mudança: tocar no cartão avança. `Continue` some nesses dois passos, e `Back` fica. Foco sem o mesmo realce de selecionado.
Arquivos: pages/admin/tags/production-generate.tsx
Risco: nenhum.
Status: feito

### PROD-52 [S3] Review: "pending" quatro vezes, e o botão não diz o que vem depois
Telas: platform/en-desktop/production-generate-step4-review; platform/en-phone/production-generate-step4-review; partner/en-desktop/production-generate-step4-review
Problema: subtítulo, `4 new serials, pending until printed`, "Each print job gets its own batch of new serials, pending in stock until it is marked printed." `Pieces: 1 print job: 4` é difícil de ler. Nada diz o que acontece ao clicar.
Mudança: resumo: "4 pieces · 1 print job · Skale Club". Sai o subtítulo e a nota. Abaixo do botão: "The print file appears in To print as soon as the print computer makes it." / "O arquivo aparece em Para imprimir assim que o computador da impressora o gerar." / "El archivo aparece en Para imprimir en cuanto el ordenador de la impresora lo genere."
Arquivos: pages/admin/tags/production-generate.tsx; i18n/messages/productionBoard.ts
Risco: nenhum.
Status: feito

### PROD-53 [S3] Sempre pronta: dois "Download" iguais, e buraco no celular
Telas: platform/en-desktop/production-always-ready-version-picker; platform/en-phone/production-always-ready-version-picker
Problema: `4 pieces · 3 h 54` e `Download` duas vezes em cada cartão. No leitor de tela há rótulo, mas na tela não. No celular, cada cartão fica com cerca de 190 px vazios, porque a lista estica as linhas até o fim do diálogo.
Mudança: botão de linha inteira: "Download 4 pieces · 3 h 54". `grid-rows` por conteúdo na lista (`content-start`).
Arquivos: pages/admin/tags/production-board.tsx:210, :251-263
Risco: nenhum.
Status: feito

### PROD-54 [S3] Etapas do fornecedor: dois "Mark as done" e nota que não some
Telas: platform/en-desktop/batch-supplier-open-summary, batch-supplier-received-summary; platform/en-phone, mesmas telas
Problema: `Mark as done` em `Print file ready` (próxima) e em `Printed` (depois), ao mesmo tempo. Com tudo `Done`, a nota "Mark Print file ready and Printed when they happen" continua lá. "Print file ready" e "Printed" são etapas do fornecedor, escritas como se fossem daqui.
Mudança: só a etapa atual tem botão. Nomes: "Supplier has the files", "Supplier made them". Nota some quando acabou.
Arquivos: pages/admin/tags/BatchDetail.tsx:148-191, :394; i18n/messages/adminTagsFlow.ts:172
Risco: pular etapa é útil se o fornecedor avisar tudo de uma vez; ao marcar "made them", marcar a anterior junto.
Status: feito

### PROD-55 [S3] Lote de leitura com aba Print e "Print not recorded"
Telas: platform/en-desktop/batch-scanned-open-summary, batch-scanned-open-receive; platform/en-phone, mesmas telas
Problema: `Print not recorded` é o rótulo de face vazia, e parece falar de impressão não registrada. Peças que já têm código não têm nada a imprimir, e a aba Print existe. O contador muda de nome e de lugar: `0 registered` à direita, `0 of 10 received` abaixo no fornecedor. "Intake by scanning" é uma nota da captura; ignorar.
Mudança: face vazia: "Not set" / "Não definido" / "No definido", igual ao diálogo. Lote `scanned` sem aba Print. Mesmo contador: "0 received" / "0 recebidas" / "0 recibidas", no mesmo lugar.
Arquivos: pages/admin/tags/BatchDetail.tsx:329, :373; pages/admin/tags/batch-receive.tsx:183-187
Risco: nenhum.
Status: feito

### PROD-56 [S3] Revoke vermelho cheio em cada linha
Telas: platform/en-desktop/chip-writers; platform/en-phone/chip-writers; partner/en-desktop/chip-writers
Problema: o que mais chama atenção na tela é a ação mais perigosa, repetida em cada linha, com cor de problema, e nenhum computador tem problema. `waiting for code` e `active` em minúsculas, e "waiting for code" é enganoso: o código já existe, falta usar. `Create pairing code` apagado parece ativo.
Mudança: `Revoke` e `Cancel code` em texto discreto ou menu; o vermelho só no diálogo de confirmação. Selos: "Code not used" / "Código não usado" / "Código sin usar" e "Active" / "Ativo" / "Activo".
Arquivos: pages/admin/tags/ProvisionersTab.tsx:191; i18n/messages/manageTags.ts
Risco: nenhum. A confirmação já existe.
Status: feito

### PROD-57 [S3] Barra "Code or scanned link" aparece em algumas telas e some em Produção
Telas: platform/en-desktop/chip-writers, shop-setup, history (têm); production-board, batch-* (não têm); partner/en-desktop/restricted-shop (tem, em página de acesso negado); owner/en-desktop/restricted-shop (tem), owner/en-desktop/restricted-production (não tem)
Problema: quem está com a peça impressa na mão, em Produção, é quem mais precisa abrir por código. E em página de acesso negado ela sobra. No celular, Shop setup e History também mostram título, seletor e barra: 170 px antes do conteúdo, e o mesmo nome duas vezes.
Mudança: a barra aparece em todas as telas de Tags com acesso, e não em acesso negado. No celular, ícone que abre o campo. Título ou seletor: só um.
Arquivos: pages/admin/tags/AdminTags.tsx:75; pages/admin/tags/ProductionTab.tsx:56-62; pages/admin/AdminApp.tsx:59
Risco: nenhum.
Status: feito. "Code or scanned link" aparece em todas as telas de Tags a que a pessoa tem acesso, inclusive Production e os lotes (menos Hand out e Take back, que têm o campo deles, e menos Stock e a página da peça, que têm a busca), e não aparece em página de acesso negado.

### PROD-58 [S3] Acesso negado: palavra que ninguém usa e nenhuma saída
Telas: partner/en-desktop/restricted-shop; owner/en-desktop/restricted-production, restricted-shop; owner-multi/en-desktop/restricted-production, restricted-shop
Problema: "Access restricted / You don't have access to management." Card vermelho enorme, como se fosse erro grave, e a pessoa é gestora da própria empresa. Sem botão.
Mudança: tom neutro. "This page is only for the Xpot team." / "Esta página é só para a equipe do Xpot." / "Esta página es solo para el equipo de Xpot." Botão "Go to Today" / "Ir para Hoje" / "Ir a Hoy".
Arquivos: pages/admin/tags/AdminTags.tsx:113; i18n/messages/manage.ts:12
Risco: `noAdminPermission` também serve em AdminApp.tsx:59; ver se a frase vale lá. Se não, criar chave própria.
Status: feito

### PROD-59 [S3] Peça "não é para parceiros" responde que não existe
Telas: partner/en-desktop/production-model-part-not-for-partners
Problema: "Could not load the model. / No print model with that name." e `Try again`, que nunca vai funcionar. É um link direto, então é raro, mas mente: o modelo existe. Volta a "Catalog", aba que se chama "Models".
Mudança: 404 sem cara de erro: "This model isn't available to you." / "Este modelo não está disponível para você." / "Este modelo no está disponible para ti." Sem `Try again`. `tabCatalog` vira "Models" / "Modelos" / "Modelos".
Arquivos: pages/admin/tags/production-model.tsx:73-74; i18n/messages/production.ts:9; i18n/messages/apiErrors.ts:60
Risco: nenhum.
Status: feito

### PROD-60 [S3] "Production" seis vezes na tela do parceiro
Telas: partner/en-desktop/production-board; partner/en-desktop/production-model-part-not-for-partners; partner/en-phone/production-board
Problema: faixa do topo, nome do espaço, grupo do menu, item do menu, título da barra e h1 dizem `Production`. No celular, seletor e h1 seguidos. A pessoa não distingue "onde estou" de "o que faço".
Mudança: sai o h1 quando o título da barra diz o mesmo. Grupo "PRODUCTION" do menu sai enquanto tiver esse único par de itens. Nome do espaço, para parceiro: o nome da empresa, como "Harbor Print Co."
Arquivos: pages/admin/tags/ProductionTab.tsx:60; components/xpot/AppLayout.tsx; components/xpot/moduleNav.ts
Risco: o nome do espaço é decisão que afeta outros perfis. Recomendo só tirar o h1 e o grupo, já.
Status: feito em parte (h1 repetido removido; grupo do menu e nome do espaço são da frente F1)

### PROD-61 [S3] Cabeçalho do lote com quatro linhas e seis cartões
Telas: platform/en-desktop/batch-print-printedA-1, batch-supplier-open-summary; platform/en-phone/batch-print-printedA-1, batch-supplier-open-summary; partner/en-phone/batch-harbor-printed
Problema: código enorme em fonte monoespaçada, 2 selos e 2 chips, depois `Stand Large · Google Review · White · v1 · plate 1/2 · 4 of x4`, depois `Large Stand · Google Review · Skale Club · 4 of 4 pieces received · created Oct 11, 2026`. Seis cartões. No celular, `Edit` sozinho em uma linha e a primeira ação vem em y≈430.
Mudança: título é o nome da peça; o código fica em cinza, ao lado. Uma linha: "Skale Club · created Oct 11". Quatro cartões: Received, Company stock, With resellers, Sold. Damaged e NFC só se maior que zero. `Edit` em menu.
Arquivos: pages/admin/tags/BatchDetail.tsx:317-345, :398-405
Risco: quem procura pelo código continua achando; a busca não muda.
Status: feito

### PROD-62 [S3] Vários rótulos para "voltar" e destinos pouco claros
Telas: platform/en-desktop/production-queue, production-job-ready, batch-print-printing, batch-supplier-open-summary, production-model-plate-large-menu-white, production-pending-batches
Problema: fila: `‹ Production`. Impressão: `‹ Print queue`. Lote de impressão: `‹ Back to order`. Lote de fornecedor: `‹ Production`. Modelo: `‹ Catalog`. Lista de lotes: sem voltar, embora seja rota filha.
Mudança: um padrão, o nome da tela de destino: "All orders", "Production", "Print job", "Models". Lista de lotes ganha voltar.
Arquivos: pages/admin/tags/production-job.tsx:111; pages/admin/tags/BatchDetail.tsx:256; pages/admin/tags/production-model.tsx:73; pages/admin/tags/production-pending-batches.tsx:18
Risco: nenhum.
Status: feito

### PROD-63 [S3] Vitrine: a primeira frase explica o Stuscle, e o celular corta o nome
Telas: platform/en-desktop/shop-setup; platform/en-phone/shop-setup
Problema: "What resellers see in Tags › Shop. Xpot sells nothing: every button opens the Stuscle store with the reseller's own wholesale code, and an entry with Stuscle SKUs goes straight into the cart." `No SKU: opens the store`, `1 Stuscle SKUs` (plural errado), preço sem dizer de quê. No celular, `Large Stand · Googl...` e `Counter pack · 5 sta...`, com dois ícones sem rótulo reservando 110 px e selos empilhados.
Mudança: frase: "What resellers see in their shop. Buttons open the Stuscle store." / "O que os revendedores veem na loja. Os botões abrem a loja Stuscle." / "Lo que ven los revendedores en su tienda. Los botones abren la tienda Stuscle." Linha: "Opens the store" ou "Goes to the cart (1 item)". Preço com "Wholesale: $50.00". No celular, nome em 2 linhas, ações em menu.
Arquivos: i18n/messages/manageTags.ts:20, :37, :52; pages/admin/tags/ShowcaseTab.tsx:197, :224-235
Risco: confirmar que o preço é de atacado antes de escrever "Wholesale". Plural exige `t.plural`.
Status: feito. Frase, linhas e preço como "Reference price", nome em até duas linhas e as ações num menu "⋯" com Edit e Delete (texto, em vez de dois ícones). Visto no celular.

### PROD-64 [S3] Nova entrada da vitrine: Save fora da tela e campos sem explicação
Telas: platform/en-desktop/shop-setup-new-entry; platform/en-phone/shop-setup-new-entry
Problema: o diálogo corta em `Stuscle SKUs`, sem indicar que há mais e sem `Save` à vista. A introdução fala de SKU antes de qualquer campo. "A link to a picture (https). Uploading files comes later." é promessa. O placeholder `KIT-POKEMON-48-STARTER:1` não diz que `:1` é quantidade. `Order 0` não diz de quê.
Mudança: rodapé fixo com `Save`, como nos assistentes. Introdução sai. `Stuscle SKUs` com a dica "One per line: SKU:quantity". `Order` vira "Position in the shop". Sai "Uploading files comes later." `Picture address` vira "Picture link" / "Link da imagem" / "Enlace de la imagen".
Arquivos: pages/admin/tags/ShowcaseTab.tsx:105-168; i18n/messages/manageTags.ts:47-48
Risco: nenhum.
Status: feito

### PROD-65 [S3] Bloco de chip longo em peça que ainda nem existe
Telas: platform/en-phone/piece-popup-pendingFailed, piece-popup-pendingCancelled, piece-popup-pendingPrinting, piece-popup-pendingBuilding, piece-popup-pendingSupplier
Problema: seis passos de NFC Tools, `Send to writer`, "Waiting for the chip to be read...", vários selos vermelhos `Not written`. Tudo isso em peça cuja impressão falhou. `Sell this piece` apagado, QR, painel de desempenho com tudo zero. Ocupa 3650 px no celular. Para impressão que usa chip programado o bloco é necessário, então não pode simplesmente sumir.
Mudança: `Not written` em cinza enquanto a peça está pendente. Bloco de chip recolhido com o título "Write chip". Falha ou cancelada: sem bloco. Venda e desempenho somem enquanto pendente. "Waiting for the chip to be read..." só depois de começar a gravar.
Arquivos: components/piece/PieceBody.tsx; components/piece/pieceView.ts:105-116
Risco: o caminho "gravar antes de imprimir" depende deste bloco; conferir com PROD-19.
Status: feito. Conferido nas telas: a peça pendente (impressão falhou, cancelada ou na impressora) mostra só o chip como "Chip not written" cinza e, sem venda nem desempenho, o bloco de passos do NFC só abre depois de "Write chip".

## S4: acabamento

### PROD-66 [S4] Foto do Stand vaza do card, do quadro, do lote e do modelo
Telas: platform/en-desktop/production-board; platform/en-phone/production-board; partner/en-desktop/production-board; partner/en-phone/production-board; platform/en-desktop/batch-print-failedQr, production-model-stand-large-google-white, production-print-dialog-from-model; platform/en-phone/production-model-stand-large-google-white, piece-popup-pendingFailed
Problema: no quadro, a peça sai pelo topo do card e passa do fundo cinza, e o pé preto encosta no nome `Large Stand`. Causa: o fundo tem `h-28` (112 px) e o desenho `lg` tem 140 px (corpo `h-32` + base `h-3`), sem limite. No cabeçalho do lote e do modelo, o pé é mais largo que a miniatura. O pé preto também quase some no fundo escuro. O dono já tinha visto este; é S4 pela definição, mas é o primeiro defeito que se vê na tela, então vale tratar logo.
Mudança: fundo do cartão com `h-40`, ou desenho `md` no cartão. Pé com a largura do corpo (`w-24` em `lg`, proporcional nos demais) e `ring-1 ring-white/20`, igual ao corpo preto.
Arquivos: pages/admin/tags/production-board.tsx:139; components/xpot/TagProductThumbnail.tsx:45-55, :237-240, :319
Risco: nenhum.
Status: feito

### PROD-67 [S4] Título do token encosta na borda; batch code quebra no meio
Telas: platform/en-phone/production-job-partTokenL, production-board, production-queue, production-model-g-token-large-relief
Problema: `Google G token · Large Stand (rounded relief v2)` termina colado na borda de 390 px. Em lista corta sem reticências: `(rounded reli`. `LPLATE-2026-\n002` quebra. `Failed` e `Print job 1\nof 2` também quebram mal.
Mudança: título em até 2 linhas, com `pr-4`. Código sem quebra (`whitespace-nowrap`) e em linha própria, se precisar.
Arquivos: pages/admin/tags/production-orders.tsx:48, :84-92; pages/admin/tags/production-job.tsx:143-145
Risco: nenhum.
Status: feito

### PROD-68 [S4] "Custom" em Zelle, Cash App, PayPal e Wi-Fi
Telas: platform/en-desktop/production-models; platform/en-phone/production-models; partner/en-desktop/production-models
Problema: o cartão diz `Pay here Zelle` e o chip de face diz `Custom`, com ícone azul igual para os quatro.
Mudança: quando a face é `custom`, omitir o chip de nome; o título já diz.
Arquivos: pages/admin/tags/production-identity.tsx:30-33; i18n/messages/tags.ts:173
Risco: nenhum.
Status: feito

### PROD-69 [S4] Dois selos verdes e ícone de gráfico
Telas: platform/en-desktop/batch-supplier-received-summary, batch-print-printedA-1, batch-supplier-open-print
Problema: `In stock` e `Closed` lado a lado, ambos verdes, sem hierarquia. O ícone de "Production stage" e de "Codes and QR images" é de gráfico, sem relação com o conteúdo.
Mudança: fechado em cinza. Ícones de etapas e de arquivo.
Arquivos: pages/admin/tags/BatchDetail.tsx:323-324, :385; pages/admin/tags/batches-shared.tsx
Risco: nenhum.
Status: feito

### PROD-70 [S4] `Below 20` sem dizer de quê
Telas: platform/en-desktop/production-models, production-model-g-token-large-relief; platform/en-phone, mesmas telas
Problema: a etiqueta âmbar é útil, mas `Below 20` não diz "repor". Só token tem o aviso; o sticker com limite 100 tem 241 e por isso não mostra, o que é correto.
Mudança: "Low: reorder below 20" / "Baixo: repor abaixo de 20" / "Bajo: reponer por debajo de 20".
Arquivos: i18n/messages/production.ts; pages/admin/tags/ProductionTab.tsx:130-150
Risco: nenhum.
Status: feito

## O que não é achado

- Efeito dos dados do laboratório, não da interface: notas de versão cortadas (`check against light b`, `x4: clean`) e `v2:`/`v3:` sob `v1` vêm cortadas em `.lab/fixtures/catalog.json`; pedido `Printed 1 piece` com `Sliced` no adesivo comprado e `Printed +1` foram criados direto pelo seed; `Waiting for the file` no token com arquivos no modelo vem da ordem do seed (`attachPartFiles` roda depois do pedido). `Showroom laptop` em Chip writers é resto da captura de pareamento. O texto `by the serial map` é real, mas o conteúdo da pausa é dado do catálogo.
- Pílula azul cortada no topo do celular em Receive (`batch-supplier-open-receive`, `batch-scanned-open-receive`): é o link "Skip to main content" (`components/xpot/AppLayout.tsx:507`) saindo de cena quando o campo recebe foco automático. A captura pegou a transição. Só vira achado se aparecer ao abrir a tela em aparelho real.
- `http://localhost:2110` nos links de chip e no servidor de pareamento: é o laboratório.
- Sem previews 3D, fotos ou mapa: limitações já previstas.

## Telas que faltam capturar

Estados que importam para o operador e que não têm imagem: diálogo `Mark printed` ("Did it come off the bed well?", com a lista de peças ruins), `Other actions` aberto, `Files, positions and technical details` aberto, diálogo de falha e de cancelar, confirmação de montagem, quadro vazio (nada a imprimir, peça sem modelo), impressão com aviso de computador parado (`stale`) e pedido com muitas linhas. Vale incluir na próxima rodada de `.lab/screens.mjs`. Os fluxos em `.lab/findings/fluxos.md` passam por alguns deles.
