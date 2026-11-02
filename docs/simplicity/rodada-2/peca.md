# Rodada 2: peça e estoque

Perfis: platform, partner, owner. Telas de chip e leitura só existem em rep-both (e uma em platform).
Texto em en, com pt e es quando a mudança é de texto. Limites do laboratório (`localhost` na URL, câmera que não abre em `read-piece-qr-camera-live`) não contam.

## Notas

| Tela | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| Estoque, computador (`stock-where-*`) | Saber onde está cada peça e o que falta | 5 | R2-PE-2, 7, 9, 24, 26, 28 |
| Estoque, celular | Ver as peças | 4 | R2-PE-23: a primeira peça começa na metade da tela |
| Estoque sem filtro, plataforma (`stock-more-filters-open`) | Ver tudo, de qual empresa | 4 | R2-PE-9, 24 |
| Nova peça (`stock-new-piece-dialog`) | Criar uma peça avulsa | 5 | R2-PE-21 |
| Popup, sem cliente | Próximo passo | 6 | R2-PE-8, 22 |
| Popup, pronta com chip faltando | Gravar o chip ou pôr no ar | 4 | R2-PE-1 |
| Popup, no ar | Para onde ela abre | 7 | R2-PE-8, 30, 35 |
| Popup, vendida fora do ar | Pôr no ar o que o cliente comprou | 5 | R2-PE-11 |
| Popup, impressão pendente, falha, cancelada | Em que pé está | 6 | R2-PE-12 |
| Popup, perdida, estragada, desativada | O que houve | 6 | R2-PE-13, 27 |
| Página da peça, computador | Estado e ação | 5 | R2-PE-10, 14, 15, 25, 27, 29 |
| Página da peça, celular | Estado e ação | 6 | R2-PE-8, 25, 30, 37 |
| Mais ações e confirmações | Entender o que cada coisa faz | 4 | R2-PE-5, 6, 15 |
| Configurar (`set-up-editor`) | Cliente e destino | 7 | R2-PE-29 |
| Peça em My work (`tags-piece-*`), revendedor e dono | Estado e ação | 7 | R2-PE-1, 8, 11, 30 |
| Peça em My work vista pela plataforma | Ver como o revendedor vê | 4 | R2-PE-20 |
| Minhas peças (`tags-pieces`) | Ver as minhas peças | 6 | R2-PE-31 |
| Gravar chip, Android | Gravar sem erro | 6 | R2-PE-4, 32 |
| Gravar chip, iPhone | Gravar com outro app | 5 | R2-PE-19, 25 |
| Gravar chip, computador | Passar para o celular | 3 | R2-PE-3 |
| Ler peça, folha inicial | Escolher como ler | 7 | R2-PE-16 |
| Ler peça, erros (chip vazio, de outro, ilegível, câmera) | Saber o que fazer | 4 | R2-PE-16, 17, 18 |

## S1

### R2-PE-1 [S1] "Ready, not live" em peça que não está pronta
Telas: platform/en-desktop/piece-popup-configuredNoChip, piece-popup-houseConfigured, tags-piece-configuredNoChip, stock-where-withResellers, stock-rep-jessica; platform/en-phone das mesmas; rep-both/en-android/write-chip-android-piece-page.
Problema: HVGTYEFS diz "Ready, not live" e logo abaixo "The chip isn't written yet." KDF6FC5C diz "Ready, not live" e, em vermelho, "The chip write failed. Try again." O selo diz pronta, a frase diz que falta, e o botão principal é "Write chip". 1M8KZFGE, com chip verificado, tem o mesmo selo e botão "Put live". Dois estados com ações diferentes têm um só nome. No estoque, a linha mostra "Ready, not live" ao lado de "Not written". O glossário manda "Ready, not live", mas a tela prova que saiu ruim.
Mudança: "Ready, not live" fica só com o chip em ordem. Com chip faltando, o selo diz en "Chip to write" / pt "Falta gravar o chip" / es "Falta grabar el chip". Com falha, en "Chip write failed" / pt "Falha ao gravar o chip" / es "Falló la grabación del chip". A frase em âmbar ou vermelho logo abaixo sai, porque repetiria o selo. "Put live" dentro do cartão continua, para quem quer ligar só o QR.
Arquivos: client/src/components/piece/pieceStatus.ts:70; client/src/components/piece/pieceView.ts (`chipNote`, `writeOrGoLive`); client/src/i18n/messages/pieceScreen.ts:126-131; client/src/pages/admin/tags/piece-table.tsx
Risco: muda a palavra do glossário para este caso. Recomendo mudar: filtros e contagens não dependem do texto.
Status: feito (pieceStatus: peça montada com chip a gravar vira "Chip to write", com falha "Chip write failed"; "Ready, not live" só com chip em ordem; frase abaixo some; teste na tabela de casos)

### R2-PE-2 [S1] Coluna "Reseller" diz "Company stock" e discorda do chip ao lado
Telas: platform/en-desktop/stock-where-house, stock-rep-house, stock-org-harbor, stock-more-filters-open; partner/en-desktop/stock-where-house, stock-more-filters-open; platform/pt-desktop/stock-where-house, platform/es-desktop/stock-where-house; platform/en-phone/stock-where-house
Problema:
- "Company stock" não é um revendedor, e está na coluna RESELLER. O filtro da mesma coluna chama o mesmo conjunto de "No reseller".
- A coluna e o chip não contam as mesmas peças. QXSZ56JC (Reserved), J48P99FA e A793EAD2 (Internal use) dizem "Company stock" na coluna, mas não estão no chip "In company stock 17". KDF6FC5C e 95QSZTC7 estão no chip e mostram "—" na coluna (a parte do chip está em PE-26; a dos reservados é nova).
- "No reseller" abre 24 peças, com Damaged, Lost e Deactivated. O chip abre 17. A pessoa pergunta a mesma coisa e recebe dois números.
- Com o chip "In company stock" ativo, 15 linhas repetem "Company stock". A coluna não diz nada nesse filtro.
Mudança: a coluna passa a se chamar en "With" / pt "Com" / es "Con", igual à linha "With" do bloco Management. Some quando o filtro é "In company stock". Reserved e Internal use entram numa regra só: recomendo a coluna dizer "Reserved" ou "Internal use" e não "Company stock", já que o chip não os conta. No filtro, "No reseller" vira "Company stock" e abre as mesmas 17 do chip; peças de fim de vida ficam nos seus próprios filtros.
Arquivos: client/src/pages/admin/tags/piece-table.tsx:127,140-142,216; client/src/pages/admin/tags/PiecesTab.tsx (`repOptions`, `house`); client/src/i18n/messages/manageTags.ts:86,395,691; client/src/i18n/messages/manageTagsPieces.ts:15
Risco: o filtro `house=1` do servidor precisa passar a usar a métrica `house`. Conferir com PE-26, que ainda decide sobre a peça no ar com cliente.
Status: feito (a coluna já era "With" pela rodada anterior; Reserved, Internal use, vendida e peça com cliente não dizem mais "Company stock"; filtro de revendedor "Company stock" abre as mesmas peças do chip: 19=19 na plataforma, 5=5 no parceiro; coluna some com o chip ligado; teste em admin-pieces-where). Peça com cliente em estoque da empresa continua contando no chip e mostrando "—": ver PE-26

### R2-PE-3 [S1] No computador, o botão principal de gravar chip é "Mark as written"
Telas: platform/en-desktop/piece-popup-write-chip, write-chip-computer-continue-on-phone; platform/pt-desktop e es-desktop/write-chip-computer-continue-on-phone
Problema: a pessoa clica "Write chip" e a folha manda escanear um QR com o celular. O único botão em destaque, grande e roxo, é "Mark as written". Nada foi gravado. Um clique marca o chip como gravado, sem confirmar, e a peça deixa de pedir o chip. No Android, a mesma ação é um link discreto: "I wrote it with another app, mark as written".
Mudança: no computador o botão principal some. Fica um botão "Close" / "Fechar" / "Cerrar" e, abaixo, o mesmo link discreto do Android: en "I wrote it with another app, mark as written" / pt "Gravei com outro app, marcar como gravado" / es "Lo grabé con otra app, marcar como grabado".
Arquivos: client/src/pages/tags/WriteSheet.tsx:254-278; client/src/pages/tags/ContinueOnPhone.tsx
Risco: nenhum na regra. O caminho do iPhone usa o mesmo botão; lá ele é o fim dos passos e pode continuar principal.
Status: feito (computador: botão Close e link com pergunta antes de gravar; verificado em fluxo: perguntar não muda nada, só "Yes" registra)

### R2-PE-4 [S1] O erro manda "Write it again" e o botão principal é "Verify again"
Telas: rep-both/en-android/write-chip-4-other-link-error
Problema: a caixa vermelha diz "The chip holds another link: https://example.com/not-this-one. Write it again." A frase seguinte diz "The write completed, but verification did not. Move the chip away, then try verifying it again." O botão em destaque é "Verify again", e "Rewrite chip" fica abaixo. Verificar de novo vai dar o mesmo erro. Ainda há quatro saídas, e "Skip verifying" e "mark as written" aceitam um chip que abre o link errado.
Mudança: quando o chip tem outro link, sai a frase cinza, o botão principal é "Rewrite chip" e "Verify again" sai. "Skip verifying" também sai neste caso, porque o chip está comprovadamente errado. A frase "The write completed…" fica só quando a leitura falhou, não quando leu outro link.
Arquivos: client/src/pages/tags/WriteSheet.tsx:126,224,236-245; client/src/i18n/messages/tags.ts:390,407
Risco: nenhum.
Status: feito (outro link: só "Rewrite chip", sem Verify again, Skip nem "mark as written"; fluxo verificado)

### R2-PE-5 [S1] "Reason (optional…)" num campo obrigatório
Telas: platform/en-desktop/piece-page-house-available-damage-confirm, platform/en-phone igual, platform/pt-desktop e es-desktop iguais
Problema: o título do campo é "Reason", o texto dentro é "Reason (optional, kept in the activity)" e a linha de baixo é "Write a reason to continue." O botão "Mark damaged" fica apagado até escrever. O campo se contradiz nos três idiomas, numa ação que não pode ser desfeita.
Mudança: texto dentro do campo quando obrigatório: en "What happened to it?" / pt "O que aconteceu com ela?" / es "¿Qué le pasó?". O texto "optional" fica só em Deactivate.
Arquivos: client/src/components/piece/ManagementSection.tsx:378-379; client/src/i18n/messages/manageTagsPieces.ts:99; client/src/components/xpot/ConfirmDialog.tsx:150-162
Risco: nenhum.
Status: feito

### R2-PE-6 [S1] "Mark damaged" apagado manda fazer o que não dá para fazer
Telas: platform/en-desktop/piece-page-sold-live-more-actions, piece-page-live-more-actions; platform/en-phone iguais
Problema: a opção aparece cinza, com o aviso "Only an unassigned piece in company stock can be marked damaged. Take it back first." Na peça vendida, a tela de transferência diz o contrário: "Sold pieces stay with their seller." Na peça no ar, "Take back" nem existe: é preciso tirar o cliente antes ("Remove the customer first to transfer this piece."). Além disso, a regra 2 proíbe opção apagada com aviso.
Mudança: quando não dá, a opção não aparece. Peça estragada na rua continua sem caminho; se o dono quiser um, é outra decisão.
Arquivos: client/src/components/piece/ManagementSection.tsx:309-313; client/src/i18n/messages/pieceScreen.ts:68
Risco: uma peça quebrada que está com cliente não tem como ser marcada. Recomendo deixar registrado como pendência de produto, e usar Deactivate por enquanto.

## S2
Status: feito (a opção não aparece quando não dá). Pendência de produto: peça estragada que já está com cliente ou revendedor continua sem caminho, usar Deactivate

### R2-PE-7 [S2] "No customer yet" em dezenas de linhas, sem dizer nada
Telas: platform/en-desktop/stock-where-house (15 de 17 linhas), stock-where-withResellers (15 de 23), stock-org-harbor, stock-rep-house; partner/en-desktop/stock-where-house (5 de 5); owner/en-desktop/stock-where-withResellers (7 de 12); platform/en-phone/stock-where-house; platform/pt-desktop ("Sem cliente")
Problema: a coluna STATUS repete o mesmo selo, e a coluna CUSTOMER, logo ao lado, mostra "—". A mesma falta aparece duas vezes por linha. A frase diz o que falta, não o estado: numa peça na prateleira, o normal é não ter cliente, e "yet" soa como pendência. Com selo igual em quase todas as linhas, Reserved, Live ou Paused somem no meio. O glossário decidiu a palavra, mas a tela prova que ela não serve como selo de lista.
Mudança: na tabela, sem selo: o texto "No customer yet" passa para a coluna CUSTOMER, em cinza claro, e a coluna STATUS fica vazia para esse estado. Com isso, só o que é diferente aparece em STATUS. No cartão do celular, o selo sai e o texto fica na linha de baixo, antes de "Company stock". Na página e no popup, o selo continua.
Arquivos: client/src/pages/admin/tags/piece-table.tsx:140-142,216; client/src/components/piece/PieceStatusPill.tsx
Risco: nenhuma regra muda. O filtro "No customer yet" de `tags-pieces` continua.
Status: feito (tabela: texto cinza na coluna Customer e Status vazio; celular: texto na linha de baixo)

### R2-PE-8 [S2] "PLATE L" no popup, "Large plate" na lista ao lado; e "Placa" quer dizer duas coisas em pt
Telas: platform/en-desktop/piece-popup-* (todas), piece-page-*; owner/en-desktop/tags-pieces, tags-piece-*; partner/en-phone/piece-popup-harbor-*; platform/pt-desktop/piece-popup-pendingCancelled, piece-popup-pendingSupplier, stock-where-house; platform/es-desktop iguais
Problema: PE-46 trocou os chips por "Large plate" só na lista do estoque. Ao clicar, a mesma peça vira duas etiquetas soltas: "PLATE" e "L". Ninguém lê "L" como tamanho. Em My pieces, a lista ainda usa "STAND L". Em pt, a lista diz "Chapa grande" e o popup "PLACA G". "Display P" e "Display pequeno" idem. E "Placa pequena" é o nome do Sign em pt, enquanto o popup chama a Plate de "Placa": a mesma palavra para dois produtos. A nota da RCP-23 diz que Sign virou "Letreiro", mas o texto da lista não mudou.
Mudança: uma linha de texto no lugar dos dois chips, em toda parte, com o mesmo `modelName_*`: "Large plate" / pt "Placa grande" / es "Placa grande". Plate é "Placa" em pt e es; Sign é "Letreiro" em pt, como RCP-23 decidiu. Stand fica "Display" em pt e "Soporte" em es.
Arquivos: client/src/components/piece/PieceHeader.tsx:142; client/src/components/xpot/TagProductThumbnail.tsx:99,186; client/src/pages/tags/LimitedPiece.tsx:51; client/src/i18n/messages/manageTagsPieces.ts:255-260,461-466; client/src/i18n/messages/tags.ts:643,1111
Risco: `TagModelChips` também serve à produção (production-identity.tsx:72). Lá a mudança é da frente de produção, mas o texto deve ser o mesmo.
Status: feito (uma linha de texto "Large plate" em lista, popup, página e Minhas peças; pt: Sign vira Letreiro, Plate Placa, Stand Display)

### R2-PE-9 [S2] Na plataforma, "Company stock" não diz de qual empresa
Telas: platform/en-desktop/stock-more-filters-open, stock-where-house, stock-org-harbor, piece-page-houseAvailable, piece-popup-houseAvailable
Problema: o estoque mistura todas as organizações, e não há coluna de organização. 472P4PB6 é da Harbor, PMQ2JJC2 não é, e as duas dizem "Company stock". A página diz "Belongs to: The company". O chip "In company stock 17" soma estoques de empresas diferentes. O filtro de organização fica escondido em "More filters", embora o plano combine, para o Today, "todas as organizações, com filtro à vista".
Mudança: só para a plataforma: nova coluna en "Company" / pt "Empresa" / es "Empresa" com o nome da organização, e o filtro de organização fora de "More filters". Na página, "Belongs to: Harbor Print Co." no lugar de "The company". Na coluna With, "Harbor Print Co. stock" fica desnecessário se houver a coluna nova.
Arquivos: client/src/pages/admin/tags/PiecesTab.tsx:258,330; client/src/pages/admin/tags/piece-table.tsx; client/src/components/piece/ManagementSection.tsx:58-100
Risco: a coluna pode exigir o nome da organização no `TagListItem`. Dono e parceiro não mudam.
Status: feito (plataforma: coluna Company, filtro de organização à vista, "Belongs to: <empresa>" na página; TagListItem ganhou organizationId, coberto em organizationFilter.integration)

### R2-PE-10 [S2] Bloco "Reseller" com "Company stock" e botão "Take back" apagado
Telas: platform/en-desktop/piece-page-houseAvailable, piece-page-house-available-piece-settings, piece-page-kitUnconfigured; platform/en-phone/piece-page-house-available-piece-settings
Problema: a peça já está no estoque da empresa, e o bloco oferece "Take back" apagado. Em TEHCV4DS, "Transfer" apagado. Regra 2. Para recolher a peça, é preciso abrir um select chamado "Reseller", escolher "Company stock", e só então o botão muda de nome. "Company stock" aparece três vezes na mesma tela: no topo, na linha "With" e no select. Para entregar uma peça a alguém, ninguém acharia isto.
Mudança: sem select no estado inicial. Na peça da empresa: botão en "Give to a reseller" / pt "Entregar a um revendedor" / es "Entregar a un revendedor", que abre a lista. Na peça com revendedor: dois botões, "Take back" / "Recolher" / "Recoger" e "Move to another reseller" / "Passar para outro revendedor" / "Pasar a otro revendedor". A linha "With" fica; o título "Reseller" sai.
Arquivos: client/src/components/piece/ManagementSection.tsx:176-215; client/src/i18n/messages/pieceScreen.ts
Risco: nenhum na regra, porque os bloqueios (`moveBlocked*`) continuam iguais.
Status: feito (sem select inicial: "Give to a reseller" ou "Take back" e "Move to another reseller")

### R2-PE-11 [S2] "Sold, not live": a frase cobra uma coisa e o botão pede outra
Telas: platform/en-desktop/piece-popup-soldNotLive, owner/en-desktop/tags-piece-sold-not-live, owner/en-phone/tags-piece-sold-not-live, platform/en-phone/piece-popup-soldNotLive, platform/pt-desktop igual
Problema: "The customer paid, but this piece isn't live yet." é o urgente, e o botão principal é "Write chip". "Put live", o que resolve a frase, fica em cinza no cartão de baixo. E o texto afirma "paid" sempre: o selo depende só de existir venda (`saleId`), não do pagamento, e a venda tem estado próprio de pagamento.
Mudança: botão principal "Put live" quando houver destino; "Write chip" vira secundário, com a frase "QR works. The chip isn't written yet." depois de ligar. Texto: en "Sold, but this piece isn't live yet." / pt "Vendida, mas esta peça ainda não está no ar." / es "Vendida, pero esta pieza aún no está activa."
Arquivos: client/src/components/piece/pieceView.ts (`case "soldNotLive"`); client/src/components/piece/pieceStatus.ts:62; client/src/i18n/messages/pieceScreen.ts:115
Risco: se a regra for que peça vendida só liga com chip, o botão não muda. A tela hoje oferece "Put live" sem chip, então não é a regra.
Status: feito ("Put live" principal quando há destino, chip fica secundário; texto sem "paid")

### R2-PE-12 [S2] Impressão velha sem frase, e botão principal em peça que "won't arrive"
Telas: platform/en-desktop/piece-popup-pendingOldPrint, piece-page-pendingOldPrint, piece-popup-pendingCancelled; platform/en-phone/piece-page-pendingOldPrint, piece-popup-pendingCancelled, piece-popup-pendingPrinting
Problema: PROD-36 (pendente) trata os selos. Além dele: 0KHWF0Y6 é "Not in stock yet" com "Go to printing" e nenhuma frase; as irmãs têm uma. A pessoa não sabe que a impressão já acabou e a peça ficou de fora. 2ZJPCXKN diz "This print was cancelled, so this piece won't arrive." e, em destaque, "Go to printing", como se houvesse algo a imprimir.
Mudança: impressão velha: en "This print is done, but the piece never went into stock. Open the print to fix it." / pt "Esta impressão terminou, mas a peça não entrou no estoque. Abra a impressão para resolver." / es "Esta impresión terminó, pero la pieza no entró al stock. Abre la impresión para resolverlo." Cancelada: sem botão em destaque; um link "See the print" / "Ver a impressão" / "Ver la impresión".
Arquivos: client/src/components/piece/pieceView.ts (`case "printCancelled"`, `case "pending"`); client/src/i18n/messages/pieceScreen.ts:121
Risco: coordenar com a frente de produção, dona de PROD-36.
Status: feito (impressão velha ganha frase; impressão cancelada sem botão principal, com link "See the print")

### R2-PE-13 [S2] Desativada não diz quando, quem nem por quê
Telas: platform/en-desktop/piece-popup-retired, piece-page-retired; platform/en-phone iguais; platform/pt-desktop e es-desktop/piece-popup-retired
Problema: PE-17 pôs a linha de último movimento em Lost, Damaged, Reserved e Internal use. CSVVF0KG, Deactivated, não tem linha, embora a atividade da mesma página traga "Cracked while packing". É o único dos cinco estados sem explicação, então o item ficou pior do que PE-17 descreve. A entrada ainda se chama "Tag CSVVF0KG retired", com duas palavras fora do glossário.
Mudança: procurar o motivo também nos eventos do tipo de desativação, não só nos movimentos, e mostrar "Deactivated · Nov 2 · by Marcus Reed" e o motivo, como nos outros.
Arquivos: client/src/components/piece/PieceHeader.tsx (`ENDED_BY`, `LastMovement`); server/tags/repository.ts:533; server/tags/production.ts:1235
Risco: nenhum.
Status: feito (o motivo, a data e o autor vêm do registro de produção, que só o admin global lê; gestor de parceiro vê a linha só quando houver movimento de estoque)

### R2-PE-14 [S2] E-mail técnico voltou na atividade da peça
Telas: platform/en-desktop/piece-page-houseAvailable, piece-page-lost, piece-page-pendingOldPrint, piece-page-configuredChip, piece-page-technical-details
Problema: PE-39 registra "mostra nomes, nunca e-mails". A tela mostra "by marcus.reed@lab.example" em toda linha de lote, intercalada com "by Marcus Reed" para a mesma pessoa. Regra 6.
Mudança: as linhas de lote usam o nome, como as demais. Sem nome conhecido, sem autor.
Arquivos: client/src/components/piece/ActivitySection.tsx; quem monta os eventos de lote no servidor (`server/tags/`)
Risco: nenhum. Conferir os registros antigos, que guardam o e-mail como autor.
Status: feito (autor sem nome fica sem autor, nunca o e-mail)

### R2-PE-15 [S2] Pause, Deactivate e Mark damaged em linguagem de sistema
Telas: platform/en-desktop/piece-page-house-available-more-actions, piece-page-sold-live-more-actions, piece-page-live-retire-confirm, piece-page-house-available-damage-confirm; platform/en-phone iguais; platform/pt-desktop e es-desktop iguais
Problema: "It stops redirecting and leaves use." "stays in the batch activity as a quality-control sample." Ninguém fala assim. Nada explica a diferença entre "Pause" e "Deactivate", que param a mesma coisa. Numa peça vendida, Deactivate tira do ar o que o cliente pagou, e o aviso é o mesmo, com o selo "Can be undone".
Mudança:
- Deactivate: en "The piece stops working when scanned and can't be used until you restore it. To stop it for a while, use Pause instead." / pt "A peça para de funcionar ao ser lida e não pode ser usada até você restaurá-la. Para parar por um tempo, use Pausar." / es "La pieza deja de funcionar al leerla y no se puede usar hasta restaurarla. Para detenerla un tiempo, usa Pausar."
- Mark damaged: en "The piece can no longer be used or sold." / pt "A peça não pode mais ser usada nem vendida." / es "La pieza ya no se puede usar ni vender."; o selo "Cannot be undone" já diz o resto.
- Peça vendida, uma frase a mais: en "The customer paid for this piece: it will stop working for them." / pt "O cliente comprou esta peça: ela vai parar de funcionar para ele." / es "El cliente compró esta pieza: dejará de funcionar para él."
Arquivos: client/src/i18n/messages/manageTagsPieces.ts:91,94,306,309; client/src/components/piece/ManagementSection.tsx:311
Risco: nenhum.
Status: feito (textos novos em en, pt e es; aviso extra em peça vendida)

### R2-PE-16 [S2] Chip vazio: a frase manda uma coisa e o botão faz outra
Telas: rep-both/en-android/read-piece-chip-blank, read-piece-sheet; rep-both/en-phone/read-piece-sheet, read-piece-code-not-found
Problema: "This chip is empty. Open a piece by its code to write it." A folha não tem campo de código. O botão em destaque é "Write without Xpot instead", o contrário do que a frase pede. "Write a chip without Xpot" também aparece como link na folha "Read a piece", onde não tem nada a ver, e não diz para quem serve.
Mudança: folha do chip vazio com título "This chip is empty" / "Este chip está vazio" / "Este chip está vacío", a frase "Type the code printed on the piece to write this chip." / "Digite o código impresso na peça para gravar este chip." / "Escribe el código impreso en la pieza para grabar este chip.", o campo de código e o botão "Open piece" / "Abrir peça" / "Abrir pieza". "Write without Xpot" vira link pequeno aqui e sai de "Read a piece".
Arquivos: client/src/pages/tags/HomeScreen.tsx:363-375; client/src/i18n/messages/tags.ts:96-97
Risco: nenhum. A rota direta segue a existir.
Status: feito (chip vazio: título, frase, campo de código; "Write without Xpot" virou link pequeno e saiu de "Read a piece")

### R2-PE-17 [S2] Erros de leitura sem saída
Telas: rep-both/en-android/read-piece-chip-unreadable, read-piece-chip-other-person; rep-both/en-phone/read-piece-code-other-person
Problema: "Could not read the chip. Touch it again." aparece no topo da Home, com a folha já fechada: encostar de novo não faz nada, porque nada está lendo. É preciso abrir "Read a piece" e "Read the chip" de novo. "This piece is not with you." não diz o que fazer, e no chip volta à Home, longe do contexto.
Mudança: chip ilegível: a folha "Hold the piece to the phone" continua aberta e lendo, com o erro dentro dela. Peça de outra pessoa: en "This piece is not with you. Ask your manager who has it." / pt "Esta peça não está com você. Pergunte ao seu gestor com quem está." / es "Esta pieza no está contigo. Pregunta a tu gerente quién la tiene."
Arquivos: client/src/pages/tags/HomeScreen.tsx:79,96,136; client/src/i18n/messages/tags.ts:98,414,587,1055
Risco: confirmar se a leitura Web NFC pode seguir ativa depois do erro. Se não, a folha oferece "Try again".
Status: feito em parte (chip ilegível: o erro aparece dentro da folha com "Try again" em vez de fechar; a leitura Web NFC é de um toque só, então não segue ativa; "not with you" ganhou a saída). Chip de outra pessoa continua voltando à Home com o erro no topo

### R2-PE-18 [S2] Câmera negada não diz por quê nem oferece saída
Telas: rep-both/en-android/read-piece-qr-camera-denied, rep-both/en-phone/read-piece-qr-camera-denied
Problema: fundo preto, "Could not open the camera." e "Back". Nada sobre permissão. O vendedor na rua fica sem saber o que fazer, embora digitar o código resolva.
Mudança: texto en "The camera is blocked. Allow it in your browser settings, or type the code printed on the piece." / pt "A câmera está bloqueada. Libere nas configurações do navegador ou digite o código impresso na peça." / es "La cámara está bloqueada. Permítela en los ajustes del navegador o escribe el código impreso en la pieza." Botão principal "Type the code" / "Digitar o código" / "Escribir el código", que volta com o campo em foco.
Arquivos: client/src/pages/tags/QrScanner.tsx; client/src/i18n/messages/tags.ts:429,903
Risco: nenhum. `read-piece-qr-camera-live` é limite do laboratório.
Status: feito (texto novo e botão "Type the code" que abre o campo de código; câmera ao vivo é limite do laboratório)

### R2-PE-19 [S2] iPhone: "Open NFC Tools" sem dizer que é preciso instalar
Telas: rep-both/en-phone/write-chip-iphone-steps; platform/en-phone/piece-popup-write-chip
Problema: o passo 1 é "Open NFC Tools and go to Write." Quem não tem o app para no primeiro passo. "Choose URL/URI" é jargão. "Waiting for the chip to be read..." pisca antes de qualquer gravação. Os passos ficam dentro de "More details", entre outros blocos, e não numa folha como no Android.
Mudança: o passo 1 vira en "Install NFC Tools (free) from the App Store, then open it and go to Write." / pt "Instale o NFC Tools (grátis) na App Store, abra e vá em Write." / es "Instala NFC Tools (gratis) desde la App Store, ábrelo y ve a Write.", com link para a loja. O botão "Write chip" abre os passos numa folha, igual ao Android. "Waiting…" só depois do toque em "Copy link".
Arquivos: client/src/pages/tags/WriteSheet.tsx (`manualSteps`); client/src/components/piece/ChipSection.tsx
Risco: conferir com PROD-65, que trata do mesmo bloco em peça pendente.
Status: pendente em parte (passo 1 agora manda instalar o NFC Tools; não pus link de loja porque não tenho a URL confirmada; folha no iPhone e "Waiting…" só depois de copiar ficam para junto de PROD-65)

### R2-PE-20 [S2] "See what the reseller sees" leva a controles de verdade
Telas: platform/en-desktop/piece-page-technical-details (botão), tags-piece-configuredNoChip, tags-piece-*; platform/en-phone/tags-piece-*
Problema: o botão promete uma vista. O destino abre Pause, Remove customer e Change destination funcionando, sem aviso, sobre uma lista vazia de "My pieces" do próprio gestor. E não é o que o revendedor vê: diz "Reseller: Jessica Alvarez", linha que Jessica não tem (compare com owner/en-phone/tags-piece-live).
Mudança: renomear para en "Open in My work" / pt "Abrir em Meu trabalho" / es "Abrir en Mi trabajo". Se a ideia for mesmo uma prévia, precisa de faixa "Viewing as Jessica Alvarez" e sem ações.
Arquivos: client/src/i18n/messages/pieceScreen.ts:25; client/src/components/piece/ManagementSection.tsx
Risco: decisão do dono. Recomendo renomear, porque é o menor e já é verdade.
Status: feito (renomeado para "Open in My work")

### R2-PE-21 [S2] "New single piece" tem três perguntas parecidas
Telas: platform/en-desktop/stock-new-piece-dialog, platform/en-phone/stock-new-piece-dialog
Problema: "Kind of piece: Google Review sign", "Product: Choose a product…" e "Printed on the piece: Same as the product". Três campos para descrever a mesma peça, e o nome "Google Review sign" não existe em nenhuma outra tela, onde ela é "Large stand". "Larger runs go through Batches": não há item Batches no menu. "Create piece" fica apagado sem dizer o que falta.
Mudança: uma pergunta só, "Product", da qual saem tipo e preço; "Printed on the piece" recolhido. Texto: en "For a single piece. For several, use Production." / pt "Para uma peça só. Para várias, use Produção." / es "Para una sola pieza. Para varias, usa Producción."
Arquivos: client/src/pages/admin/tags/PiecesTab.tsx:82-130; client/src/i18n/messages/manageTagsPieces.ts:46-52
Risco: se um produto do catálogo puder corresponder a vários tipos, "Kind of piece" continua, depois de "Product" e preenchido sozinho.
Status: feito em parte (Product primeiro, "More details" recolhe o impresso e o rótulo, texto novo). "Kind of piece" fica porque não sei se produto e tipo são 1 para 1

### R2-PE-22 [S2] "Set up" é a ação principal para quem não vai configurar
Telas: platform/en-desktop/piece-popup-houseAvailable, piece-popup-kitUnconfigured, piece-popup-withReseller; partner/en-desktop/piece-popup-harbor-house, piece-popup-harbor-kit; owner/en-desktop/piece-popup-brightside-kit; en-phone iguais
Problema: "Set up" não diz o que faz, e a folha só revela depois: escolher cliente e destino. Em TEHCV4DS, "With Jessica Alvarez", o gestor recebe em destaque um trabalho que é de Jessica. Na peça do estoque da empresa, o caminho comum é entregar a um revendedor, e isso nem aparece no popup.
Mudança: botão en "Add customer" / pt "Adicionar cliente" / es "Agregar cliente", com o mesmo editor. Para o gestor, na peça do estoque da empresa, um segundo botão "Hand out" / "Entregar" / "Entregar". Na peça com revendedor, o gestor vê sem destaque, e a frase "Waiting for Jessica Alvarez to add a customer." / "Aguardando Jessica Alvarez adicionar um cliente." / "Esperando que Jessica Alvarez agregue un cliente."
Arquivos: client/src/components/piece/pieceView.ts (`case "noCustomer"`); client/src/components/piece/PieceBody.tsx
Risco: decisão do dono sobre o gestor configurar peça de revendedor. A ação continua disponível em "More details".
Status: feito em parte (botão "Add customer"). "Hand out" para o gestor e a frase "Waiting for <revendedor>" dependem da decisão do dono sobre o gestor configurar peça de revendedor

### R2-PE-23 [S2] Estoque no celular: a primeira peça começa na metade da tela
Telas: platform/en-phone/stock-where-house, stock-where-sold, stock-more-filters-open, stock-org-harbor; partner/en-phone/stock-where-house; owner/en-phone/stock-where-sold
Problema: chips, contador, busca, "New piece", dois selects, "More filters", "17 results" e "Clear filters" vêm antes da primeira peça, em 477 dos 844 px. Com "More filters" aberto, a primeira peça fica em 640. Os selects cortam ("In company…", "With a resel…", "Not in stock…"), e dizem o mesmo que o chip logo acima.
Mudança: no celular, só busca e chips na tela. O select de status sai. "All products", "New piece" e os demais filtros vão para uma folha aberta por "Filters" / "Filtros" / "Filtros". O contador fica um só, e "Clear filters" só com filtro além do chip.
Arquivos: client/src/pages/admin/tags/PiecesTab.tsx:296-340
Risco: o select dá acesso a Damaged, Lost, Paused e Deactivated, que não têm chip. Eles vão para a folha.
Status: feito (celular: busca e chips; um botão "Filters" abre os selects e "New piece" no próprio painel, não numa folha)

### R2-PE-24 [S2] Os chips parecem abas, mas não somam
Telas: platform/en-desktop/stock-more-filters-open, stock-where-live, stock-where-sold; owner/en-desktop/stock-where-live
Problema: sem filtro, a lista diz "54 pieces". Os chips dizem 17, 23, 2, 6 e 98. "Live 6" repete peças de outros chips: SXZAH7PT está em Sold e em Live. "Not in stock yet 98" fica fora dos 54. As 12 peças que faltam nos três primeiros (Damaged, Lost, Reserved e outras) não têm chip. Regra 5.
Mudança: chips de lugar separados, que somam o total: "In company stock", "With a reseller", "Sold", e um último "Other" / "Outras" / "Otras" com o resto. "Live" fica à parte, depois de um divisor, porque é outra pergunta. "Not in stock yet" também à parte, já que o padrão o esconde.
Arquivos: client/src/pages/admin/tags/where-model.ts:12-15; client/src/pages/admin/tags/PiecesTab.tsx:227,303; shared/tagMetrics.ts
Risco: depende da decisão aberta em PE-26. Sem mudar métrica, dá para fazer o divisor e o chip "Other".
Status: pendente (não alterei nenhuma contagem: os chips só somam se a regra "In company stock" parar de contar peça com cliente, o que mexe na consignação e é decisão do dono; depois disso entram o divisor e o chip "Other")

### R2-PE-25 [S2] "Desk writer" e "Chip writers" são a mesma coisa; e bloco técnico cortado
Telas: platform/en-desktop/piece-page-*, platform/en-phone/piece-popup-write-chip, piece-page-house-available-piece-settings
Problema: o menu diz "Chip writers", a peça diz "Desk writer", e o bloco diz "Waiting for the desktop NFC writer…", com o selo vazando do cartão no celular. Abaixo, "CHIP <-> QR CHECK", título em linguagem de programador. Com "Waiting for the chip to be read..." e esse, a mesma folha mostra duas esperas ao mesmo tempo.
Mudança: en "Use a chip writer" / pt "Usar um gravador de chip" / es "Usar un grabador de chip". Selo "Waiting for the chip writer" / "Aguardando o gravador" / "Esperando el grabador", com quebra de linha. "Chip <-> QR check" vira "Check that chip and QR match" / "Conferir se chip e QR batem" / "Comprobar que el chip y el QR coinciden".
Arquivos: client/src/i18n/messages/manageTagsPieces.ts:142; client/src/pages/admin/tags/pieces-NfcProvisioningCard.tsx
Risco: nenhum.

## S3
Status: feito ("Use a chip writer", selo "Waiting for the chip writer" com quebra de linha, "Check that chip and QR match")

### R2-PE-26 [S3] Âmbar em 98 linhas de "Not in stock yet"
Telas: platform/en-desktop/stock-where-notReceived, stock-search; platform/en-phone/stock-where-notReceived; partner/en-desktop/stock-where-notReceived
Problema: 98 selos âmbar, um por peça, para algo que não pede ação agora. Regra 3. A tela tem 5.995 px, e essas peças são lotes em andamento.
Mudança: selo cinza. Quando o filtro é este, agrupar por lote: "SPLATE-2026-002 · 8 pieces · On the printer", com link para a impressão. Âmbar só em Print failed e equivalentes.
Arquivos: client/src/components/piece/pieceStatus.ts:66; client/src/pages/admin/tags/piece-table.tsx
Risco: nenhum.
Status: pendente (a regra house conta peça com cliente e no ar como "In company stock", ligada à consignação; não mexi. Frase para o dono: uma peça já com cliente, ainda do estoque da empresa, deve contar como estoque da empresa ou como "com cliente"?). Fora do escopo desta rodada o resto (âmbar e agrupar por lote)

### R2-PE-27 [S3] Peça perdida ainda tem chip, QR e desempenho
Telas: platform/en-desktop/piece-page-lost, piece-page-retired, piece-page-pendingOldPrint, piece-page-pendingSupplier
Problema: T1EYJ7HR, Lost, mostra "No destination yet", um aviso âmbar, "Chip not written", QR para baixar em SVG e PNG, e "No scans yet". Os "yet" prometem um futuro que não existe. O QR permite imprimir uma peça perdida.
Mudança: em Lost, Damaged e Deactivated: só cabeçalho, Management (sem QR), "More actions" e Activity. O aviso âmbar sai, porque o selo já diz. Em peça ainda não impressa, o QR fica em "Technical details".
Arquivos: client/src/components/piece/PieceBody.tsx; client/src/components/piece/ManagementSection.tsx
Risco: Deactivated pode voltar; ao restaurar, os blocos reaparecem. Quem reimprime QR de peça pendente usa a tela de impressão.

### R2-PE-28 [S3] Dois controles e dois contadores para a mesma coisa
Telas: platform/en-desktop/stock-where-*, stock-org-harbor, stock-rep-jessica, stock-product-large-stand; owner e partner iguais
Problema: o chip "With a reseller" e o select "With a reseller" mudam juntos. "23 pieces" no canto e "23 results" na linha de baixo. "Clear filters" e, no vazio, "See all pieces". Com um filtro de "More filters", os chips perdem os números.
Mudança: no computador, o select fica só com os estados sem chip, com o nome "More statuses" / "Mais situações" / "Más estados". Um contador só, no canto. Chips com número sempre, contando o recorte, ou sem número em nenhum momento.
Arquivos: client/src/pages/admin/tags/PiecesTab.tsx:227,303-338
Risco: contar por recorte exige consulta nova. Recomendo o contador simples primeiro.
Status: feito em parte (o select ficou só com os estados sem chip, "More statuses"; um contador só; "Clear filters" só com filtro além do chip). Chips com número sob filtro não mudaram

### R2-PE-29 [S3] "Piece settings" deixa mudar o que já está impresso; e "Label" tem dois nomes
Telas: platform/en-desktop/piece-page-house-available-piece-settings, piece-page-sold-live-piece-settings, piece-popup-set-up-editor; platform/en-phone/piece-page-live-piece-settings
Problema: numa peça vendida e no ar, "Kind of piece: Large Stand" e "Printed on the piece: Same as the batch" continuam editáveis, embora o objeto já exista. "Internal label" aqui e "Label (optional)" no editor parecem campos diferentes.
Mudança: peça impressa, vendida ou com cliente: tipo e impresso viram texto. Um nome só, "Label" / "Rótulo" / "Etiqueta", com a dica "Only your team sees it." / "Só sua equipe vê." / "Solo tu equipo lo ve."
Arquivos: client/src/components/piece/ManagementSection.tsx:259; client/src/i18n/messages/manageTagsPieces.ts:52,109
Risco: corrigir cadastro errado depois de impresso continua possível para a plataforma, se o dono quiser.

### R2-PE-30 [S3] Endereço quebrado no meio da palavra
Telas: platform/en-phone/piece-popup-houseLive, piece-popup-live, piece-popup-harborLive; platform/en-phone/tags-piece-*; platform/en-desktop/piece-popup-soldLive, piece-popup-configuredChip
Problema: "fenwayfitness.exam / ple.com/menu?v=2", "instagram.com/beac / onhillbooks", "search.google.com/l / ocal/writereview?p…". O que a pessoa quer conferir é o site, e ele é o que quebra. O maior texto do cartão é uma URL.
Mudança: linha 1, em destaque, só o site ("fenwayfitness.example.com"), sem quebrar. Linha 2, menor e cortada no fim, o caminho ("/menu?v=2"). Para Google Review, o título em destaque é "Google Review", e o endereço fica menor.
Arquivos: client/src/components/piece/CustomerDestinationSection.tsx
Risco: nenhum.

### R2-PE-31 [S3] A mesma peça tem duas caras para a mesma pessoa
Telas: owner/en-desktop/tags-pieces comparada com owner/en-desktop/stock-where-withResellers; owner/en-phone/tags-pieces comparada com owner/en-phone/stock-where-sold
Problema: Priya vê M11PKG8A nas duas áreas. Em Stock: "Large stand", colunas STATUS, CUSTOMER, RESELLER, CHIP, SCANS, "67 · Nov 2". Em My pieces: "STAND L", colunas CUSTOMER, DESTINATION, STATUS, SCANS, dois selos empilhados, "67 scans / QR 46 · NFC 21". No celular, numa o título é o código e na outra o cliente. Os filtros são chips de lugar numa e "To finish / No customer yet / Live" na outra.
Mudança: mesmo componente de linha, com colunas diferentes por área. Ordem: código e modelo, status, cliente, resto. Chip sempre em coluna própria.
Arquivos: client/src/pages/tags/PiecesScreen.tsx; client/src/pages/admin/tags/piece-table.tsx
Risco: RCP-14, ainda sem status, trata dos nomes; juntar com ela.

### R2-PE-32 [S3] Folha de gravar: endereço cru, "Copy link" em primeiro e "Lock chip" sem explicação
Telas: rep-both/en-android/write-chip-1-sheet, write-chip-2-hold-the-chip, write-chip-7-saved; platform/en-phone/piece-page-live-piece-settings
Problema: "CONTENT TO WRITE" e o link vêm antes de tudo, e "Copy link" antes de "Write now", em toda etapa, mesmo com o chip na mão. Ao terminar, logo abaixo de "Done", está "Lock chip", sem dizer que é para sempre. Na página, o mesmo vira só um cadeado, sem texto, ao lado de "Chip verified".
Mudança: link e "Copy link" recolhidos em "Write with another app" / "Gravar com outro app" / "Grabar con otra app". Em "Chip written and verified", "Lock chip" vira link menor com a frase "Stops anyone from rewriting this chip. It can't be undone." / "Impede regravar este chip. Não dá para desfazer." / "Impide regrabar este chip. No se puede deshacer." O cadeado da página ganha o texto.
Arquivos: client/src/pages/tags/WriteSheet.tsx:158,200; client/src/components/piece/ChipSection.tsx:99-105
Risco: nenhum.

### R2-PE-33 [S3] Bloco de desempenho com texto de analista
Telas: platform/en-desktop/piece-page-technical-details
Problema: "Est. visitors", "Per piece, per day estimate", "SCANS (QR + NFC)", "7 automated hits excluded". E "A scan is a QR scan or NFC tap that reached the destination. It is not a review, a customer or a sale." é explicação longa, sempre à vista.
Mudança: "Scans" e "People (estimate)" / "Pessoas (estimativa)" / "Personas (estimación)". O parágrafo vai para um ícone de ajuda. "automated hits" some.
Arquivos: client/src/i18n/messages/manageTagsPieces.ts:207-212; client/src/components/piece/PerformanceSection.tsx
Risco: nenhum.

### R2-PE-34 [S3] Lista diz "—" onde a peça diz "Chip locked"
Telas: platform/en-desktop/stock-where-disabled, stock-rep-jessica comparadas com piece-page-paused
Problema: 2FD7X6N5, Paused, tem "—" na coluna CHIP, e a página diz "Chip locked". Quem pausa e confere o chip pensa que ele sumiu.
Mudança: peça pausada mostra o estado do chip na lista, igual às configuradas.
Arquivos: client/src/components/piece/pieceStatus.ts:42-43
Risco: `pieceChipState` alimenta também o status principal. Abrir o `none` só para a coluna.

### R2-PE-35 [S3] "Live: scanning the piece opens its destination" com chip não gravado
Telas: platform/en-desktop/piece-popup-houseLive, piece-popup-harborLive; platform/en-phone iguais; partner/en-desktop/piece-popup-harbor-live
Problema: logo acima, "QR works. The chip isn't written yet."; no cartão, a frase verde diz que ler a peça funciona. Encostar o telefone não faz nada. E a frase verde repete o selo "Live" em toda peça no ar.
Mudança: sai a frase verde. O que vale é o selo e, se for o caso, a nota do chip.
Arquivos: client/src/i18n/messages/manageTagsPieces.ts:103; client/src/components/piece/CustomerDestinationSection.tsx
Risco: nenhum.

## S4

### R2-PE-36 [S4] Empty states diferentes para o mesmo caso
Telas: owner/en-desktop/stock-where-damaged, stock-where-house; partner/en-desktop/stock-where-sold, stock-where-lost; partner/en-desktop/tags-pieces
Problema: "No piece sold yet.", "Nothing in company stock." e "Every piece has arrived." são bons. Damaged, Lost, Paused e Deactivated caem em "No pieces match these filters", e um filtro de um clique não é erro de filtro. O ícone é de NFC no estoque e de caixa em My pieces.
Mudança: frases próprias: "Nothing marked damaged." / "Nada marcado como estragado." / "Nada marcado como dañado."; "Nothing lost." / "Nada perdido." / "Nada perdido."; "Nothing paused." / "Nada pausado." / "Nada pausado."; "Nothing deactivated." / "Nada desativado." / "Nada desactivado." Ícone de caixa nos dois.
Arquivos: client/src/i18n/messages/manageTagsPieces.ts:20,33
Risco: nenhum.

### R2-PE-37 [S4] Kit quebra no hífen, e diz "Kit" duas vezes
Telas: platform/en-phone/piece-popup-kitUnconfigured, piece-popup-withReseller, piece-popup-harborLive; partner/en-phone/piece-popup-harbor-live; platform/en-desktop/piece-page-houseAvailable
Problema: "Kit K-" numa linha e "0002" na outra. No Management, o rótulo é "Kit" e o valor "Kit K-0002".
Mudança: `whitespace-nowrap` no código do kit. No Management, o valor é "K-0002".
Arquivos: client/src/components/piece/PieceHeader.tsx:106; client/src/components/piece/ManagementSection.tsx
Risco: nenhum.

### R2-PE-38 [S4] Faixa escura atrás dos filtros, e linhas de altura diferente
Telas: platform/en-desktop/stock-where-house, stock-where-withResellers, stock-org-harbor; owner e partner iguais
Problema: chips e filtros ficam numa faixa quase preta, com borda reta, sobre a página carvão: parece um erro de fundo. As linhas têm 51 px em plate e 64 px em stand, e a lista fica em degraus.
Mudança: fundo da faixa igual ao da página (o `#05080f` só serve ao tema de My work). Miniatura de altura fixa, para a mesma altura de linha.
Arquivos: client/src/pages/admin/tags/PiecesTab.tsx:296; client/src/components/xpot/TagProductThumbnail.tsx
Risco: nenhum.

### R2-PE-39 [S4] Pequenos deslizes de texto e contraste
Telas: platform/en-desktop/stock-where-retired, stock-product-large-stand, piece-popup-internalUse, piece-popup-retired; platform/es-desktop/stock-where-house; partner/es-desktop/stock-where-house; platform/pt-desktop/stock-more-filters-open; partner/pt-desktop/stock-more-filters-open
Problema:
- "Deactivated" e "Print cancelled" em cinza sobre cinza, quase ilegíveis.
- "Large stand" na lista e "Large Stand" no filtro e nas configurações.
- "Put to internal use" é inglês estranho.
- es: o select corta "En el stock de la empre…", com o chip inteiro logo acima.
- pt: a coluna é "STATUS" e o filtro "Todas as situações".
Mudança: selo muted com contraste de pelo menos 4,5:1. Filtro com a mesma caixa da lista. en "Set to internal use". es: o select muda com R2-PE-28. pt: "Todos os status".
Arquivos: client/src/components/piece/PieceStatusPill.tsx; client/src/i18n/messages/manageTags.ts:410; client/src/i18n/messages/pieceScreen.ts (`movement_internal_use`)
Risco: nenhum.

## Vistos e já em `pending-r1.md`, não contados

Continuam na tela como descrito: PE-8 ("Not tested" em M11PKG8A, com 21 leituras NFC), PE-17 (Reserved, Internal use e Lost sem ação no popup), PE-26 (peça com cliente no chip "In company stock"), PE-30 (seta dupla e busca por código na peça), PE-34 (lápis ao lado de "Change destination"), PE-35 ("Destination" duas vezes), PE-39 ("Tag … assigned", nota de produção na atividade), ID-01 ("Stock: In stock" em Technical details, numa peça em cliente), RCP-18 (botão principal da peça no ar).
