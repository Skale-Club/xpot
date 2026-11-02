# Auditoria visual: Visitas

Quem usa: vendedor na rua, pelo celular. Perfis abertos: rep-both, platform, owner, partner, em en-phone e en-desktop.
Fora do escopo pedido e não abertos: owner-multi, reseller (`visits-blocked-*`), pt e es.

Abreviações nas telas: `rep` = rep-both, `plat` = platform, `p` = en-phone, `d` = en-desktop.

## Notas por tela

| Tela | A coisa mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| visits-dashboard (rep, plat, owner, partner) | Onde estou na rota e qual a próxima empresa | 6 | Tirar "Ready 100%" (VIS-1), contar certo (VIS-3), mostrar a parada atual e o botão de check-in (VIS-3, VIS-21) |
| visits-route, lista (todos) | Abrir as paradas de hoje e fazer check-in | 4 | Paradas a um toque, com nome no botão; sem lápis como único caminho (VIS-2) |
| visits-route-job, in_progress-1, published-2 | Próxima parada com check-in | 4 | Próxima parada no topo, botões com nome, sem "Open today's visits" (VIS-2, VIS-5, VIS-6) |
| visits-route-completed-3 | Ver o que foi feito | 6 | Mesmo nome da lista (VIS-4), parada abre a visita (VIS-5) |
| visits-checkin-new, checkin-empty | Escolher a empresa e iniciar | 6 | Sugerir a próxima parada, botão normal no desktop (VIS-22) |
| visits-checkin-in-progress | Encerrar a visita ou vender | 5 no celular, 7 no desktop | Telefone e botões sem corte, Finish visit em destaque (VIS-7) |
| visits-history | Achar uma visita | 5 | Linha curta, sem ícones soltos, nome de tela próprio (VIS-12, VIS-23) |
| visits-history-(result) | Ler o que aconteceu | 5 | Resultado não muda com um toque, gravador recolhido, sem repetir a empresa (VIS-9, VIS-24) |
| visits-history-in-progress | Voltar à visita aberta | 3 | Tirar o seletor de resultado, botão Finish visit (VIS-8) |
| visits-leads, panel-work-leads | Achar a empresa e agir | 5 | Filtros que somam, chips visíveis no celular, check-in com nome (VIS-10, VIS-11, VIS-25) |
| visits-leads-search | Entender que a busca não achou | 6 | Texto certo e oferta de criar (VIS-26) |
| visits-lead-(active, customer, inactive, lead, prospect) | Fazer check-in ou vender aqui | 5 | Botão de check-in, ordem para quem está na porta (VIS-9b, VIS-27) |
| visits-sales-overview, panel-work-sales | Quanto vendi e o que falta receber | 4 | Metade dos blocos fora, sem jargão, eixo sem dia repetido (VIS-16, VIS-17) |
| visits-sales-sales | Lista de vendas e nova venda | 7 | "New sale" com nome, períodos iguais à visão geral (VIS-19) |
| visits-sales-sale-detail | Ver e corrigir a venda | 7 no desktop, 6 no celular | O link direto abrir no celular (VIS-15) |
| visits-sales-sale-cancelled | Ver a venda cancelada | 3 | Mostrar a venda em vez de "Try a longer period" (VIS-15) |
| visits-sales-stock | Quem precisa de acerto | 5 | "Left" sem ambiguidade, ícones com nome (VIS-14) |
| visits-sales-stock-detail | Histórico do acordo | 5 | Filtro não contradiz o painel (VIS-15) |
| visits-sales-pipeline, pipeline-detail | Negócios abertos | 2 | Sem GoHighLevel na cara do vendedor, cartão que abre (VIS-13) |
| visits-tasks, panel-work-tasks | O que fazer hoje | 6 | Botões claros, sem "Execution" (VIS-20) |
| panel-team-results (plat) | Como a equipe está indo | 6 | Número igual ao de Sales, sem jargão (VIS-18) |
| panel-team-results, -owner (partner, owner) | Resultado da minha equipe | 1 | Hoje é um bloqueio com texto falso (VIS-28) |
| products, products-new-dialog (plat) | Manter o catálogo | 5 | Ícones com nome, formulário em linguagem comum (VIS-30) |
| check-in-rules (plat) | Definir a regra de local | 5 | Textos sem contradição (VIS-31) |

## O que parece achado e não é (seed do laboratório)

Conferi no código antes de escrever. Corrigir o seed antes da próxima rodada, senão estes voltam.

- **Valores do Pipeline 100 vezes maiores** ("2 large stands + website $64,900.00", "$368,394 open"). O seed grava centavos (`.lab/seed-visits.ts:260-266`), o app grava e lê dólares (`client/src/pages/xpot/hooks/useSales.ts:30`, `XpotSales.tsx:342`).
- **NOTES mostra `completed`, `follow_up`, `no_answer`.** O seed grava o status em `note.outcome` (`.lab/seed-visits.ts:135,220`). No app esse campo é texto livre (`server/routes/xpot/helpers.ts:8,23`).
- **Visita "Sale made" com Sales $0.00.** O seed não liga a venda à visita. O lado real disso está em VIS-24.
- **Rating N/A no check-in e 4.6 (210) na rota.** O seed preenche a parada e não a empresa (`.lab/seed-visits.ts:183`). Não dá para saber se ocorre em produção.

## Lacunas de captura

Nenhuma destas telas existe na rodada 0, então **não têm nota nem achado**. É justamente o "planejar o dia" do vendedor, e li apenas o código (`XpotProspecting.tsx`, 1.953 linhas, inteiro). `visits-route-job` não mostra a busca: `/route?jobId=` redireciona para a rota pronta (`XpotProspecting.tsx:376-383`).

Capturar na próxima rodada:

1. Planejador de 4 passos (`XpotProspecting.tsx:1100-1314`).
2. Busca em andamento, com falha e cancelada (`:1325-1485`). Pontos a olhar: "Quality", "Optimize", "conflicts removed", nota de cada empresa (`:1439`), motivo sem tradução quando não está no mapa (`:755-762`).
3. Janela da parada (`:1819-1941`), inclusive "Prepare demo plaque".
4. Trocar ou adicionar parada (`RouteStopPicker`).
5. Remover parada (`:1804`).
6. Rota em rascunho com "Publish route" (`:1544`).
7. Rota antiga com "Reuse" (`:1532`).
8. Detalhe da venda no celular (`SaleDetailDialog`, `SalesLists.tsx:197`), que só abre tocando no cartão.
9. Tela de encerrar a visita.

---

## S1

### VIS-1 [S1] "Ready 100%" ao lado de "3 of 8 stops done"
Status: feito. A barra de progresso do atalho só existe enquanto a rota é preparada (`persistentProspectingJob`, com teste).
Telas: rep/p+d/visits-dashboard, rep/p+d/visits-route, visits-leads, visits-sales-*, visits-tasks, visits-history*, visits-checkin-*; plat/p+d/as mesmas
Problema: em toda tela de Visitas há uma barra cheia com "Ready", "100%", "Greater Boston, MA" e 4 pontos sem nome. Logo abaixo, "3 of 8 stops done". A barra mede a busca que montou a rota, não o dia de trabalho, mas o vendedor lê "terminei". No celular são 75px que aparecem em toda tela.
Mudança: a barra só existe enquanto a rota está sendo preparada. `persistentProspectingJob` deixa de devolver o job quando a rota já existe ou está pronta: mantém o caso `queued/running` e o caso `completed` com `routePlanningStatus` diferente de `ready`; sai o `if (route) return { job: recentJob, route }`. O ramo `stage === "route"` e o texto "Ready" saem do componente. Enquanto busca, o texto continua "Searching" / "Buscando" / "Buscando" e a linha `foundSoFar`.
Arquivos: client/src/pages/xpot/prospectingUi.ts:152-171; client/src/components/xpot/PersistentRouteProgress.tsx:32-38; client/src/components/xpot/AppLayout.tsx:306; client/src/i18n/messages/prospecting.ts:63
Risco: sem regra de negócio. Ajustar o teste de `persistentProspectingJob`. O atalho para a rota continua no Dashboard e na barra inferior.

### VIS-2 [S1] O caminho para o check-in é um lápis sem nome, e o botão principal leva a outro lugar
Status: feito. Cartão da lista: "Next stop" / "Now", botões "See stops" e "Open navigation". Detalhe: bloco "Check in" + "Navigate" (ou "Back to visit") acima do mapa. No celular o mapa começa recolhido em uma linha "Show map" (em vez de uma faixa de 160px), e "Open today's visits" virou link pequeno no fim da lista.
Telas: rep/p+d/visits-route, rep/p+d/visits-route-job, rep/p+d/visits-route-in_progress-1, plat/p+d/visits-route-published-2
Problema: o vendedor abre Route para trabalhar. O maior botão, "Follow route", sai do app para o Google Maps. A lista de paradas e o check-in só aparecem pelo lápis, sem texto, que parece "editar" (o nome interno é "Open and edit"). Lá dentro, o botão azul "Open today's visits" vai para o histórico (`/dashboard/history?view=day`), que não tem check-in. A próxima parada com check-in fica em cerca de 1.670px no celular (rep/p/visits-route-job), duas telas abaixo. Em 3 segundos ele não acha "fazer check-in".
Mudança:
1. Cartão da lista: linha "Next stop: {name}" com o endereço. Dois botões com texto: primário "See stops" / "Ver paradas" / "Ver paradas" (substitui o lápis) e secundário "Open navigation" / "Abrir navegação" / "Abrir navegación" (substitui "Follow route", mesma URL).
2. Detalhe: bloco fixo acima do mapa com a parada atual e os botões "Check in" e "Navigate" / "Navegar" / "Navegar". Com visita aberta, o bloco vira "Back to visit" (VIS-5).
3. "Open today's visits" sai do topo. Se o dono quiser manter, vira link pequeno no fim da lista: "Today's visits" / "Visitas de hoje" / "Visitas de hoy".
4. No celular o mapa começa recolhido a uma faixa de 160px, abrindo ao tocar.
Arquivos: client/src/pages/xpot/XpotProspecting.tsx:1003-1030, 1549, 1494-1504; client/src/i18n/messages/prospecting.ts:46, 187
Risco: "Follow route" hoje também publica o rascunho sem avisar (`:1010`). Manter esse efeito em "Open navigation" e em "Check in". Sem mudança no servidor.

### VIS-3 [S1] "3 of 8 stops done" conta a parada pulada como feita
Status: feito. `routeVisitProgress`/`routeStopFocus` (função pura, com teste): visitada = check-in concluído; pulada à parte; a parada aberta não conta até o check-out. Dashboard e Route dizem o mesmo.
Telas: rep/p+d/visits-dashboard, rep/p/visits-route, rep/p+d/visits-route-job
Problema: a lista mostra 2 "Done", 1 "In visit" e 1 "Skipped". O Dashboard diz "3 of 8 stops done" (2 feitas + 1 pulada) e o cartão de Route diz "3 of 8 stops visited" (2 feitas + a aberta). É o mesmo 3 por coincidência, com sentidos diferentes, e a barra exagera o avanço. Pior, a linha diz "Next: Northside Barbers" sem citar que ele está agora em Blue Harbor Seafood.
Mudança: uma conta só, "visited" = paradas com check-in concluído (`completed`). Dashboard e Route dizem "2 of 8 visited · 1 skipped" / "2 de 8 visitadas · 1 pulada" / "2 de 8 visitadas · 1 omitida". Com visita aberta, a linha vira "Now: Blue Harbor Seafood" / "Agora: Blue Harbor Seafood" / "Ahora: Blue Harbor Seafood". A parada aberta não conta até o check-out.
Arquivos: client/src/pages/xpot/prospectingUi.ts:291-298; client/src/pages/xpot/XpotDashboard.tsx:103-106, 320-324; client/src/i18n/messages/dashboard.ts:72-73; client/src/i18n/messages/prospecting.ts:51-52; `visitedStopCount` no servidor (rota da lista)
Risco: `isStopDone` também decide o fim da rota? Separar: criar `isStopVisited` para o texto e deixar `isStopDone` só para "acabou".

### VIS-8 [S1] Visita aberta tem seletor de resultado ativo e nenhum botão de encerrar
Status: feito. Visita aberta mostra "Finish visit" e esconde o seletor e o "Delete visit"; o servidor recusa `status` em visita sem check-out (`409 visit_not_finished`, teste de integração).
Telas: rep/p+d/visits-history-in-progress
Problema: a tela diz "In progress", Check-out "—", e mostra 6 botões de resultado ("Sale made", "Visited", "Follow-up"...) que salvam com um toque, além de "Delete visit" solto no fim. Não existe "Finish visit" nem "Back to visit" nesse corpo. No código o toque grava o status direto, sem check-out (`PATCH /visits/:id` só faz `updateSalesVisit`), então a visita pode ganhar resultado sem hora de saída e sem sincronizar. Não testei o efeito em execução, li o código.
Mudança: com a visita aberta, o seletor sai e no lugar entra um botão "Finish visit" / "Finalizar visita" / "Finalizar visita" que leva a `/route/check-in`. "Delete visit" também sai nesse estado, porque "Cancel visit" já existe no check-in. No servidor, recusar `status` em visita sem `checkedOutAt`.
Arquivos: client/src/pages/xpot/components/VisitRow.tsx:40-62, 183-187, 236; server/routes/xpot/visits.ts:228-246
Risco: regra de negócio pequena. Confirmar com o dono que resultado só existe depois do check-out. Recomendo sim.

### VIS-10 [S1] Os filtros de Companies não somam, e "In progress" tem três sentidos
Status: feito. Abas "My companies" e "To visit" acima dos chips; "In progress" virou "In talks"; o selo acompanha o filtro (`companyStateLabel`, teste). Seguida a recomendação do dono; o glossário de 2026-11-01 precisa ser atualizado na varredura final.
Telas: plat/p+d/visits-leads, plat/p+d/panel-work-leads, rep/p+d/visits-leads, owner/p+d/visits-leads, partner/p+d/visits-leads
Problema: Marcus vê "All 4", "Customers 4", "Prospects 2": 6 empresas dentro de "todas as 4". No painel, "All 34", "Prospects 7". Blue Harbor aparece com selo "Prospect", mas conta em "In progress 5", enquanto o filtro "Prospects" lista outro conjunto (`isWorkedLead`). A mesma tela tem "Visit in progress" no topo e "Route in progress" na rota: "In progress" significa três coisas.
Mudança:
1. O conjunto não visitado sai da fila de chips e vira aba separada acima deles: "My companies" / "Minhas empresas" / "Mis empresas" e "To visit" / "A visitar" / "Por visitar". "All" conta só a primeira aba.
2. Filtro "In progress" vira "In talks" / "Em conversa" / "En conversación".
3. O selo acompanha o filtro: empresa trabalhada nunca mostra "Prospect". Lead e prospect trabalhado usam "In talks". Inactive e Customer ficam.
Arquivos: client/src/pages/xpot/XpotLeads.tsx:156-175, 256-257, 356; client/src/pages/xpot/components/leads/LeadStatePill.tsx; client/src/i18n/messages/leads.ts:10, 19-20, 141, 150-151
Risco: depende do dono, porque o glossário de 2026-11-01 (`docs/MODULES.md` §5) fixou "In progress" e "Prospects". Recomendo revisar: ele mesmo apontou esses filtros. Só texto e layout, sem mudar status no banco.

---

## S2

### VIS-4 [S2] A mesma rota tem dois nomes
Status: feito. `routeHeading`: o nome da rota é o título e a cidade da busca a linha de baixo, na lista, no detalhe e no Dashboard (teste).
Telas: rep/p/visits-route ("Greater Boston, MA"), rep/p+d/visits-route-job ("Downtown loop"), rep/p+d/visits-dashboard ("Downtown loop"), plat/p+d/visits-route ("Greater Boston, MA"), plat/p+d/visits-route-published-2 ("Back Bay and Seaport"), rep/p+d/visits-route-completed-3 (lista "Cambridge, MA", detalhe "Cambridge cafes")
Problema: o vendedor toca em "Greater Boston, MA" e abre "Downtown loop". Parece outra rota.
Mudança: uma função só para o título, usada na lista, no detalhe e no Dashboard. O nome da rota é o título; a cidade da busca vira a linha de baixo.
Arquivos: client/src/pages/xpot/XpotProspecting.tsx:660, 911-912, 997, 1078, 1514; client/src/pages/xpot/XpotDashboard.tsx (cartão da rota)
Risco: nenhum. Conferir como `routeDisplayName` se comporta em rota real, sem nome dado à mão.

### VIS-5 [S2] A parada atual não volta à visita, e a parada feita não abre a visita
Status: feito para parada em visita ("Back to visit") e feita ("See visit"). "Visit anyway" para parada pulada: pendente, o servidor recusa mudar parada pulada (`prospecting.ts:841`) e isso é regra de rota, que esta frente não mexe.
Telas: rep/p+d/visits-route-job, rep/p+d/visits-route-in_progress-1, rep/p+d/visits-route-completed-3
Problema: Blue Harbor está "In visit", em azul, e o único botão é navegar até lá, onde ele já está. Paradas "Done" também só têm navegar, embora `stop.visitId` exista. A janela da parada também não tem essas saídas (`:1904-1908`).
Mudança: por estado. `checked_in`: botão com texto "Back to visit" / "Voltar à visita" / "Volver a la visita", leva a `/route/check-in`. `completed`: "See visit" / "Ver visita" / "Ver visita", leva ao detalhe; navegar sai. `skipped`: navegar sai e entra "Visit anyway" / "Visitar mesmo assim" / "Visitar igualmente", se o servidor permitir.
Arquivos: client/src/pages/xpot/XpotProspecting.tsx:1698-1765, 1903-1916; client/src/i18n/messages/prospecting.ts
Risco: reabrir parada pulada é regra de negócio: hoje o servidor recusa mudar parada `skipped` (`server/routes/xpot/prospecting.ts:841`). Se o dono não quiser, a parada pulada fica sem botão.

### VIS-6 [S2] Até 4 ícones sem nome em cada parada, para quem está na rua
Status: feito. A parada só mostra nome, chegada, estado e seta; check-in, navegar, trocar e remover (agora "Remove stop") ficam na janela da parada. Texto da alça trocado.
Telas: rep/p+d/visits-route-job, plat/p+d/visits-route-published-2
Problema: alfinete azul, seta, setas cruzadas e lixeira, repetidos em cada parada, mais a alça. Só o aria-label diz o que são; no celular não há hover. A lixeira fica a um dedo do check-in. "Drag the top-right handle and drop before or after a stop. You can also focus it and use ↑/↓." fala de teclado com quem usa o polegar.
Mudança: a parada atual mostra só os botões do bloco de VIS-2. As demais mostram nome, chegada, estado e uma seta "abre": tocar abre a janela da parada, que já tem check-in, navegar e trocar. A remoção vai para essa janela: "Remove stop" / "Remover parada" / "Quitar parada". Alça continua. Texto novo: "Hold the handle and drag to change the order." / "Segure a alça e arraste para mudar a ordem." / "Mantén pulsada el asa y arrastra para cambiar el orden." "8 stops" repetido sai, já está em "8 stops · about 2 h 45 min".
Arquivos: client/src/pages/xpot/XpotProspecting.tsx:1564-1566, 1698-1765, 1917-1934; client/src/i18n/messages/prospecting.ts:120
Risco: nenhum. Os testes do teclado (setas) continuam valendo, só some a menção no texto.

### VIS-7 [S2] Telefone e botões cortados na visita aberta, no celular
Status: feito. Telefone em linha inteira, tiles sem segunda linha no celular, "Sell a piece", "Finish visit" largo e cheio, faixa do topo no celular só com o nome da empresa (mexe em `AppLayout.tsx`, que é da F1: edição de duas linhas).
Telas: rep/p/visits-checkin-in-progress, rep/p/visits-checkin-new, rep/p+d/visits-dashboard (faixa do topo)
Problema: "+1 (617) 555-1..." é cortado com metade da linha vazia ao lado. "Order, payment ...", "Record what ha...", "Set up a pi...", "QR or NFC for t...", "Result and chec...". "Finish visit", a saída da tela, tem o mesmo peso dos outros três. Na faixa do topo, "Visit in progress ..." perde o nome da empresa, que é a informação útil.
Mudança: telefone ocupa a linha inteira. Quadros perdem a segunda linha no celular. "Set up a piece" vira "Sell a piece" / "Vender peça" / "Vender pieza", como o resto do app. "Finish visit" vira botão largo e cheio abaixo dos outros três. Faixa no celular: nome da empresa e tempo, sem "Visit in progress": "Blue Harbor Seafood · 12h 18m", e "Open visit" fica.
Arquivos: client/src/pages/xpot/XpotCheckIn.tsx:164, 475-497; client/src/components/xpot/AppLayout.tsx:412; client/src/i18n/messages/checkin.ts:63-70; client/src/i18n/messages/shell.ts:51
Risco: nenhum. "Set up a piece" hoje abre Tags com a empresa escolhida, e o nome novo descreve bem isso.

### VIS-9 [S2] Resultado de visita antiga muda com um toque, sem aviso
Status: feito. Resultado como selo e "Change result", que abre os botões e só grava em "Save result".
Telas: rep/p+d/visits-history-completed, -follow_up, -sale_made; owner/p+d/visits-history-*; plat/p+d/visits-history-*
Problema: em visita de semanas atrás, os 6 botões de resultado estão ativos e salvam na hora. O toque também reenvia ao CRM (`syncVisitToGhl`, `syncVisitToXphere`, e o Xphere automatiza em cima desse status). Um dedo errado rolando a tela muda o histórico.
Mudança: fora da edição, mostrar só o selo do resultado e um link "Change result" / "Alterar resultado" / "Cambiar resultado", que abre os 6 botões e salva ao confirmar.
Arquivos: client/src/pages/xpot/components/VisitRow.tsx:40-62, 183-187; client/src/i18n/messages/visits.ts
Risco: nenhum na regra.

### VIS-9b [S2] A empresa não tem botão de check-in, e o texto do app diz que tem
Status: feito. "Check in" / "Back to visit" no topo da empresa; com visita aberta em outra empresa, a linha "Finish your visit at {name} first." no lugar do botão (sem botão desabilitado, regra 2 do plano). "Convert to customer" desceu perto de "Delete company".
Telas: rep/p+d/visits-lead-active, -customer, -inactive, -lead, -prospect; plat e owner/p+d/visits-lead-*; partner/p+d/visits-history (vazio)
Problema: o vendedor chega, abre a empresa e encontra "Directions", "New task", "New sale", "Leave stock", "Convert to customer". Check-in não há. O histórico vazio manda: "Start your first visit from Route or Companies". Só a lista tem check-in: ícone sem nome no desktop e dentro do menu de 3 pontos no celular.
Mudança: botão primário "Check in" no topo da empresa. Com visita aberta aqui, "Back to visit"; com visita aberta em outra empresa, botão desabilitado com a linha "Finish your visit at {name} first." / "Finalize antes a visita em {name}." / "Finaliza antes la visita en {name}.". "Directions" fica secundário. "Convert to customer" desce para perto de "Delete".
Arquivos: client/src/pages/xpot/components/leads/LeadDetailPane.tsx:176-190; client/src/pages/xpot/XpotLeads.tsx (onCheckIn); client/src/pages/xpot/components/leads/LeadsTable.tsx:212; client/src/i18n/messages/leads.ts; client/src/i18n/messages/visits.ts:27
Risco: nenhum. Usa a mesma navegação da lista.

### VIS-11 [S2] "Follow-up due" conta o que não venceu e o que não tem selo
Status: feito. Filtro "Follow-up"; selo sempre presente (vermelho vencido, âmbar hoje ou depois, cinza sem data).
Telas: rep/p+d/visits-leads (9 no filtro, 8 selos), plat/p+d/visits-leads ("Follow-up Nov 5" com 3 no filtro, hoje é 1 de novembro), plat/d/panel-work-leads ("Follow-up due 24")
Problema: "due" sugere vencido, mas inclui datas futuras. Empresa cuja última visita terminou em Follow-up entra na contagem sem selo nenhum (Cambridge Pet Spa). A pessoa conta 8 e o filtro diz 9.
Mudança: filtro "Follow-up" / "Retorno" / "Seguimiento", sem "due". Selo sempre presente: vermelho se vencido, âmbar se hoje ou futuro, cinza "Follow-up" sem data. Na lista, vencidos primeiro.
Arquivos: client/src/pages/xpot/visitRules.ts:53-65; client/src/pages/xpot/components/leads/LeadStatePill.tsx; client/src/i18n/messages/leads.ts:19, 150
Risco: nenhum.

### VIS-12 [S2] A tela de histórico se chama como o módulo, e o celular não tem aba para ela
Status: pendente (F1): item, título e migalha estão em `moduleNav.ts` e no dicionário `shell`, arquivos da F1 no plano.
Telas: rep/p+d/visits-history, rep/p+d/visits-history-*, rep/d/visits-checkin-empty, rep/d/visits-checkin-new, plat/p/visits-history
Problema: módulo "Visits", item "Visits", título "Visits", migalha só "Visits". No celular a barra inferior não tem essa tela e destaca "Dashboard" enquanto ele lê o histórico. Na tela de check-in a migalha é "Visits › Visit" e o item ativo é o histórico, que não é onde ele está.
Mudança: o item e o título viram "History" / "Histórico" / "Historial" (a Rev. 2 de `docs/MODULES.md` já decidiu por isso, D1; a tela em inglês não acompanhou, e pt e es precisam ser conferidos). Migalha da tela de check-in: "Visits › Check-in". Nela nenhum item fica ativo, ou fica Route. No celular, sem destaque falso: o histórico fica sob Route, com o botão de voltar.
Arquivos: client/src/components/xpot/moduleNav.ts; client/src/i18n/messages/shell.ts:9, 86, 153; client/src/pages/xpot/XpotVisits.tsx
Risco: nenhum. Os links e a URL não mudam.
Status: feito. History / Histórico / Historial no item e no título; a tela da visita se chama Current visit e não acende nenhum item; no celular o histórico e a visita não acendem aba alguma.

### VIS-13 [S2] A aba Pipeline apresenta o GoHighLevel a quem não sabe o que é, e se contradiz
Status: feito. Aba "Deals": sem aviso do GoHighLevel, sem "Synced" nem "default ·", cartão abre para editar valor, situação e etapa, "Follow-up tasks" saiu, "Open opportunities" saiu de "Needs attention" e virou link em "More details". A aba some só quando o GoHighLevel está desligado e não há nenhum negócio. O aviso em Plataforma › Integrações: pendente (tela da F7).
Telas: rep/p+d/visits-sales-pipeline, -pipeline-detail; plat, owner, partner/p+d/visits-sales-pipeline
Problema: "GoHighLevel is not connected. This tab is the legacy GoHighLevel pipeline..." e, no mesmo cartão, cada negócio diz "Synced". "default · closed" e "default · proposal" são chaves internas. "tap + to create one" aparece no desktop. O cartão não abre (`pipeline-detail` é igual à lista; o código é um `div` sem clique), então não dá para mudar etapa nem valor. "Follow-up tasks" repete Tasks sem dizer a empresa. O Dashboard ainda lista "Open opportunities" como "Needs attention".
Mudança: com o GoHighLevel desligado, a aba vira "Deals" / "Negócios" / "Negocios", sem o aviso, sem "Synced", sem "default ·". O bloco "Follow-up tasks" sai dessa aba e fica em Tasks. O aviso vai para Plataforma › Integrações. O cartão abre para editar valor, etapa e fechar. "Open opportunities" sai de "Needs attention" e vira link em "More details".
Arquivos: client/src/pages/xpot/XpotSales.tsx:173, 246-254, 327-343; client/src/i18n/messages/sales.ts:24-25, 72-73; client/src/pages/xpot/XpotDashboard.tsx (Needs attention); client/src/i18n/messages/dashboard.ts:81, 88
Risco: depende do dono. A auditoria antiga sugere sumir a aba quando desligada, mas há negócios guardados só no Xpot. Recomendo manter como "Deals" e sumir só quando não houver nenhum.

### VIS-14 [S2] Consignação: "Left 30" e "18 on shelf" na mesma linha
Status: feito. Delivered, Leave stock, Count and bill, History, shops; Restock e Take back com texto. `statLeft` ficou só na lista de ações de voz, onde quer dizer "sobrou".
Telas: rep/p+d/visits-sales-stock, rep/p+d/visits-sales-stock-detail, rep/p+d/visits-lead-customer, owner/p+d/visits-sales-stock, plat/d/visits-sales-stock-detail
Problema: "Left 30" quer dizer "deixei 30 lá", mas se lê "restam 30", ao lado de "18 on shelf". O botão "Leave" não diz o quê. "Settle" e "Ledger" são termos de contabilidade. No desktop, Restock e Take back são dois ícones sem nome. "2 agreements" e "2 shops" contam a mesma coisa com nomes diferentes.
Mudança:
- "Left" → "Delivered" / "Entregues" / "Entregadas".
- "Leave" → "Leave stock" / "Deixar estoque" / "Dejar stock", igual à empresa.
- "Settle" → "Count and bill" / "Contar e cobrar" / "Contar y cobrar".
- "Ledger" → "History" / "Histórico" / "Historial".
- Desktop: ícones ganham o texto "Restock" e "Take back" ("Receber de volta" / "Devolver al stock", como no glossário).
- "agreements" → "shops" / "lojas" / "tiendas".
Arquivos: client/src/i18n/messages/salesModule.ts:63-67, 92, 193-197, 205; client/src/pages/xpot/components/sales/cards.tsx; client/src/pages/xpot/components/sales/tables.tsx
Risco: conferir os demais textos que usam "settle" (`salesModule.ts:32-35, 109, 125-126, 282`), para não ficar meio trocado.

### VIS-15 [S2] Link de venda ou consignação: mensagem falsa e painel que contradiz o filtro
Status: feito. Venda e consignação abrem pelo id (`GET /sales/:id`), a venda cancelada abre com o selo, a lista ganhou o filtro "Cancelled", a consignação encerrada troca o filtro para "Closed" e no celular o id abre a mesma janela do toque.
Telas: plat/d/visits-sales-sale-cancelled, plat/p/visits-sales-sale-cancelled, rep/p/visits-sales-sale-cancelled, plat/d/visits-sales-stock-detail, plat/p/visits-sales-stock-detail, */p/visits-sales-sale-detail, */p/visits-sales-stock-detail
Problema: venda cancelada no desktop: "This sale is not in the list. Try a longer period." Aumentar o período não ajuda, ela está cancelada. Não há como ver canceladas na lista. Consignação encerrada: à esquerda "No stock out on consignment." no filtro Active, à direita o painel do chaveiro "Closed". No celular as mesmas URLs (`/sales/sales/5`, `/sales/stock/4`) ignoram o id e mostram só a lista.
Mudança: buscar o item pelo id, não pela lista carregada. Venda cancelada abre o painel com selo "Cancelled" / "Cancelada" / "Cancelada", sem botões de alterar. Filtro novo na lista: "Cancelled". Ao abrir consignação encerrada, o filtro muda sozinho para "Closed". No celular, id na URL abre a mesma janela do toque.
Arquivos: client/src/pages/xpot/components/sales/SalesLists.tsx:114-115, 172-178, 197, 302-309, 379; client/src/pages/xpot/salesPath.ts; client/src/i18n/messages/salesModule.ts:186
Risco: nenhum. O servidor já tem `GET` por id (`server/routes/xpot/sales.ts:60`).

### VIS-16 [S2] Visão de vendas com rótulos de contabilidade, para quem está na rua
Status: feito. Seguida a recomendação: vendedor (perfil member) vê só vendido e a receber; lucro, custo e margem só para dono, parceiro e plataforma (`useShowProfit`, na visão geral, na empresa, na nova venda e no detalhe da venda; só interface, o servidor ainda devolve esses campos). Blocos duplicados e subtítulo saíram, "Revenue breakdown" virou "More details", vazio é uma mensagem com "New sale".
Telas: rep/p+d/visits-sales-overview, owner/p+d/visits-sales-overview, partner/p+d/visits-sales-overview, plat/p+d/visits-sales-overview, plat/d/panel-work-sales
Problema: "Revenue operations", "A clear view of what was sold, your profit...", "Gross revenue", "Acquisition costs", "Revenue breakdown". O mesmo valor em até 3 lugares: "$3,632.00 billed", "Gross revenue $3,632.00" no quadro e de novo no detalhamento. "Sales · 30d 9" aparece duas vezes. "$773.00 outstanding" duas vezes no painel. No celular são 2.065px (owner) antes de chegar a "By product". Zerado (partner) são 8 blocos de "$0.00", e a única instrução útil está no fim: "Sell from a company card or during a check-in."
Mudança:
- Fica: valor principal com período, "To collect" / "A receber", gráfico e "By product".
- Sai: "Revenue breakdown" (recolhido em "More details"), os quadros "Sales · 30d" e "Gross revenue" duplicados e o subtítulo.
- Título: "Sales" / "Vendas" / "Ventas", sem o eyebrow.
- "Outstanding" → "To collect" / "A receber" / "Por cobrar".
- "Acquisition costs" → "Product cost" / "Custo dos produtos" / "Costo de productos".
- Vazio: só a mensagem com o botão "New sale".
Arquivos: client/src/pages/xpot/components/sales/SalesOverview.tsx:99-232; client/src/i18n/messages/sales.ts:49-51; client/src/i18n/messages/salesModule.ts:157, 223
Risco: depende do dono: vendedor deve ver lucro e custo? Hoje vê "Profit" em primeiro lugar e "after production cost" na empresa. Recomendo que vendedor veja só vendido e a receber, e lucro só no painel.

### VIS-17 [S2] Gráfico mostra "Nov 1" duas vezes
Status: feito. Causa confirmada no servidor: a série diária somava 24h ao início da janela; na noite do fim do horário de verão o dia dura 25h e repete a data. Agora passa por data de calendário (`shared/dayKeys.ts`, teste em America/New_York). "This month" no dia 1 vira "Nov 1 so far".
Telas: rep/d/visits-sales-overview, partner/d/visits-sales-overview, plat/d/visits-sales-overview, plat/d/panel-work-sales
Problema: o eixo termina em "Oct 31, Nov 1, Nov 1". Em 2026-11-01 os EUA saem do horário de verão, e a conta por dias parece gerar um dia de 25 horas. Um dia em duplicidade: o valor pode cair numa barra errada. Também "Profit · this month $0.00" ao lado de "$3,584.00" no dia 1º parece erro, embora esteja certo.
Mudança: gerar os dias por data local (ano, mês, dia), sem somar 24 horas. "This month" só aparece a partir do dia 2 ou mostra "Nov 1 so far" / "1º nov até agora" / "1 nov hasta ahora".
Arquivos: client/src/pages/xpot/components/sales/SalesOverview.tsx:193 e a série do gráfico no servidor (não localizei a função, procurar em `salesStorage`)
Risco: causa provável, não confirmada em execução. Testar com data de mudança de horário.

### VIS-18 [S2] Team results e Sales discordam no mesmo período
Status: parcial. Feito: "Checked in away" com o subtítulo novo, sem "Sync problems". Pendente: a linha "+ $149 de revendedores" (precisa de um total novo no servidor).
Telas: plat/d/panel-team-results ("$3,483.00", "8 sales"), plat/d/panel-work-sales ("$3,632.00", "9"), plat/p/ as mesmas
Problema: mesmo dono, mesmos 30 dias, duas somas. A diferença de $149 bate com a venda da revendedora em Malden Hardware (conferi no seed e na lista do painel, não na consulta do servidor): fora de Team results, dentro de Sales. Team results avisa "Tags-only resellers are left out", mas Sales não diz nada. Também "7 active reps" com 8 linhas (Daniela com 0), "Location exceptions: outside the business area, or let through" e "Sync problems → Status".
Mudança: linha abaixo do quadro em Team results: "+ $149.00 from resellers, not listed here" / "+ $149,00 de revendedores, fora desta lista" / "+ $149,00 de revendedores, fuera de esta lista". "Location exceptions" → "Checked in away" / "Check-in fora do local" / "Check-in fuera del lugar", subtítulo "outside the company's area or without a location". "Sync problems → Status" sai: fica em Plataforma.
Arquivos: client/src/pages/admin/AdminOverview.tsx; server/routes/xpot/teamActivity.ts:50-58; client/src/i18n/messages/manage.ts
Risco: nenhum.

### VIS-20 [S2] Tarefa: círculo sem nome, "Start" e "Cancel" sem dizer o que fazem
Status: feito. "Done" com texto, "Start" saiu (o MCP continua usando o estado), "Cancel" e "Edit" no menu, "Pending" não aparece, empresa é link, vazio com "New task".
Telas: rep/p+d/visits-tasks, plat/p+d/visits-tasks, plat/p/panel-work-tasks, owner/p+d/visits-tasks, partner/p+d/visits-tasks
Problema: cada tarefa tem círculo (concluir?), lápis, "Start" e "Cancel". "Pending" repete o óbvio. "Start" muda só um status interno. "Execution" e "Manual, voice and AI follow-ups in one queue." não dizem nada para quem está na rua. O vazio "No tasks in this queue" usa um círculo que parece carregando e não oferece próximo passo.
Mudança: círculo vira botão com texto "Done" / "Concluir" / "Hecha". "Start" sai (se o dono quiser manter o estado, vai para o menu). "Cancel" e o lápis vão para um menu de 3 pontos. "Pending" sai; só "In progress" aparece. Eyebrow e subtítulo saem. Empresa vira link. Vazio: "Nothing to do here." / "Nada para fazer aqui." / "Nada que hacer aquí." com o botão "New task".
Arquivos: client/src/pages/xpot/XpotTasks.tsx; client/src/i18n/messages/tasks.ts:4, 6, 16
Risco: o MCP do Xpot usa `tasks_start`. Manter o estado no banco; só some o botão.

### VIS-24 [S2] "Visited" é resultado sem sentido, e "Sale made" não pede a venda
Status: parcial. Feito: "Talked", "Closed or no one there", "Come back". Pendente: abrir a janela de venda ao escolher "Sale made" sem venda ligada, que o próprio achado pede para confirmar com o dono por ser mudança de fluxo.
Telas: rep/p+d/visits-history-sale_made, plat/p+d/visits-history-completed, plat/p+d/visits-history-no_answer, owner/p+d/visits-history-no_answer
Problema: toda visita foi visitada, então "Visited" não informa nada, e o filtro lista "Visited 3" junto de "Not interested". "No answer" também é o nome para "Closed when we arrived". Marcar "Sale made" não registra venda: no seletor nada pede valor, e a tela pode dizer "Sale made" e "Sales $0.00 · 0 transactions". (O caso da captura vem do seed; a possibilidade é do app.)
Mudança: "Visited" → "Talked" / "Conversamos" / "Conversamos". "No answer" → "Closed or no one there" / "Fechado ou sem ninguém" / "Cerrado o sin nadie". "Sale made" sem venda ligada abre a janela de venda ao ser escolhido; com venda registrada na visita, vem marcado sozinho.
Arquivos: client/src/i18n/messages/checkin.ts:102 e os demais `status_*`; client/src/pages/xpot/components/VisitStatus.tsx; client/src/pages/xpot/components/VisitRow.tsx:40-62
Risco: só texto na troca de nomes; o Xphere usa a chave, não o rótulo (`server/routes/xpot/helpers.ts:507`). Abrir a venda é mudança de fluxo: confirmar com o dono.

### VIS-28 [S2] Dono e parceiro recebem "You don't have access to management"
Status: feito. Seguida a recomendação: `GET /team-results` com escopo da organização (teste de integração: dono vê o próprio time e nunca o de outra organização, membro recebe 403), item "Team results" no menu do dono e do parceiro, texto do bloqueio corrigido. Toca `moduleNav.ts` (F1): uma linha.
Telas: owner/d/panel-team-results-owner, partner/p+d/panel-team-results
Problema: tela solta, sem menu, com "Access restricted / You don't have access to management." e "Back to app". É falso: os dois têm painel, com Companies, Sales e Tasks da equipe ("Whole team"). Só não têm Team results. O dono não tem como ver o resultado por vendedor.
Mudança: duas opções. Recomendada: liberar Team results com escopo da própria organização. A outra: redirecionar `/admin/overview` para o painel da pessoa. Em todo caso, o texto de bloqueio vira "This page is only for the Xpot team." / "Esta página é só da equipe do Xpot." / "Esta página es solo del equipo de Xpot." e aparece dentro do menu normal.
Arquivos: client/src/pages/admin/AdminApp.tsx:59; client/src/i18n/messages/manage.ts:11-12; client/src/components/xpot/moduleNav.ts:204, 342; client/src/pages/admin/AdminOverview.tsx
Risco: depende do dono. Liberar exige filtrar `teamActivity` por organização.

### VIS-29 [S2] O painel do parceiro se chama "Production" e guarda Companies e Sales
Status: pendente (F1): faixa e migalha vêm de `moduleNav.ts` e do dicionário `shell`.
Telas: partner/p+d/panel-work-leads, partner/p+d/panel-work-sales, partner/p+d/panel-work-tasks, partner/p+d/visits-dashboard
Problema: faixa "Production", migalha "Production › Companies", grupo "Production" e item "Production". Quatro vezes a mesma palavra para algo que inclui vendas. O dono vê "My company" no mesmo lugar.
Mudança: faixa e migalha usam "My company" / "Minha empresa" / "Mi empresa", como o glossário. O grupo e o item "Production" continuam dentro.
Arquivos: client/src/components/xpot/moduleNav.ts:283, 309, 369-371; client/src/i18n/messages/shell.ts:37
Risco: nenhum.
Status: feito. O painel do parceiro é My company; o grupo e o item Production continuam dentro.

### VIS-31 [S2] Regras de check-in: "never blocked" e "also allows" na mesma tela
Status: feito. Rótulo e dica novos conferidos com `check-in-geofence.ts`: sem localização nunca bloqueia no servidor; a exceção manual libera check-in longe ou sem localização escrevendo o motivo.
Telas: plat/p+d/check-in-rules
Problema: "A check-in without a location fix is never blocked." e, ao lado, "On a computer it also allows a check-in without a location." Se nunca bloqueia, o que o segundo libera? "Default geofence radius" é jargão. A unidade está no rodapé: "metres, between 10 and 5000". Essa regra vale para todas as organizações e só a plataforma vê, mas o texto não diz o que muda para o vendedor.
Mudança:
- Campo: "How close to the company a rep must be" / "A que distância da empresa o vendedor deve estar" / "A qué distancia de la empresa debe estar el vendedor", sufixo "m".
- Dica: "Used for new companies. Existing ones keep their own." / "Vale para empresas novas. As atuais mantêm a sua." / "Vale para empresas nuevas. Las actuales mantienen la suya."
- Regra 1 e regra 2: reescrever depois de conferir `server/check-in-geofence.ts`, dizendo em uma frase só o que ocorre com GPS sem sinal.
Arquivos: client/src/i18n/messages/manage.ts:193-198 e equivalentes pt e es; client/src/pages/admin/AdminSettings.tsx:78-100
Risco: é regra de negócio: o texto novo depende de confirmar o comportamento real no servidor.

---

## S3

### VIS-19 [S3] "New" sem objeto e períodos diferentes em cada aba
Status: feito. "New sale" na cor dos outros, "Sold in: all", períodos 7/30/90 (+ All), padrão 30, vazio com botão.
Telas: rep/p+d/visits-sales-sales, plat/p+d/visits-sales-sales, partner/p+d/visits-sales-sales
Problema: "New" em verde, enquanto Tasks e Companies têm "New task" e "New company" em azul. "All origins" não diz nada. "30d, 90d, All" com 90 de padrão aqui e "7 days, 30 days, 90 days" com 30 na aba ao lado. No celular "New" fica em cima do filtro, ocupando uma linha inteira. Vazio: "No sales recorded yet." sem caminho.
Mudança: "New sale" / "Nova venda" / "Nueva venta", mesma cor dos outros. "All origins" → "Sold in: all" / "Vendido em: todos" / "Vendido en: todos", ou sai para quem só tem uma origem. Períodos iguais em todas as abas: 7, 30, 90 dias, padrão 30.
Arquivos: client/src/i18n/messages/salesModule.ts:179, 183; client/src/pages/xpot/components/sales/SalesLists.tsx:134
Risco: nenhum.

### VIS-21 [S3] Dashboard: dois atalhos iguais e "Needs attention" com o que não é problema
Status: parcial. Feito: "View route" saiu, botão "Check in at {name}", eyebrows saíram, "2 shops to count and bill", "Nothing scheduled for today", botão "Build today's route". Pendente (F1): o ponto âmbar em Route, em `moduleNav.ts`.
Telas: rep/p+d/visits-dashboard, owner/p+d/visits-dashboard, partner/p+d/visits-dashboard, plat/p+d/visits-dashboard
Problema: "View route" e o cartão inteiro levam ao mesmo lugar. "OVERDUE / Overdue tasks" e "ON CONSIGNMENT / Settlements overdue" repetem o título em eyebrow. "2 consignments need review" não diz o que fazer. Sem tarefas, "Nothing else scheduled for today" tem "else" sem nada antes. O ponto âmbar em Route, sem explicação, aparece só no desktop e até sem rota (partner). Sem rota, "No route created" não oferece botão.
Mudança: "View route" sai. O cartão ganha, quando há rota aberta, o botão "Check in at {name}" / "Fazer check-in em {name}" / "Hacer check-in en {name}". Eyebrows saem. "Settlements overdue" → "2 shops to count and bill" / "2 lojas para contar e cobrar" / "2 tiendas para contar y cobrar". "Nothing else" → "Nothing scheduled for today" / "Nada marcado para hoje" / "Nada previsto para hoy". O ponto sai. Sem rota: botão "Build today's route", texto que já existe.
Arquivos: client/src/pages/xpot/XpotDashboard.tsx:175-330; client/src/i18n/messages/dashboard.ts:39, 79, 81, 95; client/src/components/xpot/moduleNav.ts
Risco: nenhum.

### VIS-22 [S3] Check-in: "SLIDE TO CHECK IN" com mouse, e nenhuma sugestão da rota
Status: feito. "Next stop" acima da busca (um toque seleciona), botão normal "Check in at {name}" no computador, deslizar só no celular e só com empresa escolhida, "Location OK" no lugar de "LIVE ±15 m".
Telas: owner/p+d/visits-checkin-new, plat/p+d/visits-checkin-new, partner/d/visits-checkin-empty, rep/d/visits-checkin-empty, owner/d/visits-checkin-empty, plat/d/visits-checkin-empty
Problema: "CHOOSE A COMPANY FIRST" parece um botão apagado em fonte diferente. O deslizar é pedido também no desktop, com mouse. "LIVE ±15 m" é jargão de GPS. Quem tem rota aberta precisa buscar a empresa à mão: a próxima parada não aparece.
Mudança: acima da busca, com rota aberta: "Next stop: Northside Barbers" / "Próxima parada: Northside Barbers" / "Próxima parada: Northside Barbers", um toque seleciona. Desktop: botão comum "Check in". "LIVE ±15 m" → "Location OK" / "Localização OK" / "Ubicación OK", detalhes no toque. Sem empresa: só a dica, sem o falso botão.
Arquivos: client/src/pages/xpot/XpotCheckIn.tsx; client/src/pages/xpot/ConfirmSlider.tsx; client/src/pages/xpot/components/QuickCheckIn.tsx; client/src/i18n/messages/checkin.ts:90, 283, 463
Risco: o deslizar evita check-in sem querer. Manter no celular, onde o toque acidental existe.

### VIS-23 [S3] Lista de histórico: 4.252px para 24 visitas, e o nome é que se corta
Status: feito. Linha com nome (2 linhas), resultado e "data · hora · cidade"; brilho saiu; "All visits" saiu (ficou "By day"). Sombra de rolagem nos chips: pendente, o componente é compartilhado (`filters.tsx`).
Telas: rep/p/visits-history, plat/p/visits-history, owner/p/visits-history, rep/p+d/visits-history
Problema: cada linha tem endereço, telefone, site, ramo, data, ícone de prédio, seta e brilho, 5 linhas. O nome, que é o que ele procura, fica "Union Square T...", "Cambridge Pl...", "Copper Kettle C...". O ícone de brilho, sem nome, aparece em toda linha nos dois tamanhos. "All visits 24" e "All 24" lado a lado. Os chips de resultado cortam na borda.
Mudança: linha com nome (até 2 linhas), resultado, e abaixo "Oct 31 · 9:58 AM · Cambridge". O resto fica no detalhe. Ícone de brilho sai (ou vira "has summary" / "tem resumo" / "tiene resumen"). Tela e filtros: "All visits" sai, ficam "By day" e os chips. Chips com rolagem visível (sombra na borda).
Arquivos: client/src/pages/xpot/components/VisitsTable.tsx; client/src/pages/xpot/XpotVisits.tsx:118-121, 231
Risco: nenhum.

### VIS-25 [S3] Lista de empresas: chips escondidos, lixeira em toda linha, ícones sem nome
Status: parcial. Feito: no computador "Check in" com texto e "$" e lixeira num menu de 3 pontos, "Delete company", "Check in" primeiro na folha do celular. Pendente: "Date" como ícone e a sombra de rolagem dos chips (`filters.tsx` é compartilhado).
Telas: rep/p+d/visits-leads, plat/p+d/visits-leads, owner/p+d/visits-leads, plat/d/panel-work-leads, partner/p/visits-leads
Problema: no celular "Customers" e "Prospects" ficam fora da tela, sem indicação de rolagem. "Date" ocupa uma linha inteira, e o selo vermelho de follow-up quebra o layout dos cartões. No desktop cada linha tem $, seta entrando e lixeira sem texto, 34 vezes no painel. A lixeira ao lado do check-in é convite ao erro. O cartão tem endereço, telefone, site e ramo antes do que importa.
Mudança: chips em 2 linhas no celular ou com sombra indicando rolagem. "Date" vai para ícone ao lado do +. Desktop: "Check in" com texto; "$" e lixeira no menu de 3 pontos. Cartão: nome, selo, follow-up, "Last visit".
Arquivos: client/src/pages/xpot/components/leads/LeadsTable.tsx:57-58, 209-216; client/src/pages/xpot/components/LeadCardBody.tsx; client/src/pages/xpot/XpotLeads.tsx
Risco: `canDelete` segue valendo no menu.

### VIS-26 [S3] Busca sem resultado fala de filtro, e o vazio fala difícil
Status: feito. Busca sem resultado diz "Check the spelling or add this company." e oferece "Add \"{query}\"" (cria já com o nome); sem empresas e sem visitas, só a mensagem, sem filtros.
Telas: rep/d/visits-leads-search, owner/d/visits-leads-search, partner/d/visits-leads-search, plat/d/visits-leads-search, partner/p+d/visits-leads, partner/p+d/visits-history
Problema: 'No results for "cafe"' com "Choose another filter to see your companies." O problema é a busca. Sem empresas: "You can also add an unplanned encounter", com "New company" e "Add company" na mesma tela. Histórico vazio: chip "All 0" sozinho e abas "All visits" e "By day" sem nada.
Mudança: "Check the spelling or add this company." / "Confira a grafia ou adicione esta empresa." / "Revisa la ortografía o añade esta empresa." com botão "Add '{query}'". `noLeadsHint`: "Companies appear here after a check-in, or add one now." / "As empresas aparecem aqui depois do check-in, ou adicione agora." / "Las empresas aparecen aquí tras el check-in, o añade una ahora." Sem dados, filtros e o segundo botão somem.
Arquivos: client/src/i18n/messages/leads.ts:16, 26-27; client/src/pages/xpot/XpotLeads.tsx:424; client/src/pages/xpot/XpotVisits.tsx:143-152, 231
Risco: nenhum.

### VIS-27 [S3] Empresa no celular: 11 campos antes de vender
Status: parcial. Feito: ordem no celular (vender, peças, visitas, contatos, detalhes recolhido), telefone no topo, tiles "Sold" e "Recent visits" saíram, "Delete company". Pendente: o texto no chip do Google.
Telas: rep/p/visits-lead-*, plat/p/visits-lead-active, -customer, -prospect, owner/p/visits-lead-*
Problema: a ordem é quadros, Details (11 campos), Contacts, Sales and consignment, Recent visits, o que põe "New sale" em cerca de 1.800px. "Sold" e "Sold here" repetem o mesmo valor. "Recent visits 3" é um quadro que repete a lista. As linhas de "Recent visits" não abrem. "COMPANY PROFILE" é rótulo sem uso. O chip Google + corrente não tem nome. "Delete" não diz o quê.
Mudança: ordem no celular: botões (VIS-9b), Sales and consignment, Recent visits, Contacts, Details recolhido com telefone e endereço visíveis. Quadros "Sold" e "Recent visits" saem; ficam "On shelf" e "Pieces". Linha da visita abre a visita. "Delete" → "Delete company" / "Excluir empresa" / "Eliminar empresa". Chip Google ganha o texto "Google profile" / "Perfil Google" / "Perfil de Google".
Arquivos: client/src/pages/xpot/components/leads/LeadDetailPane.tsx; client/src/pages/xpot/components/leads/CompanyGoogleProfileButton.tsx; client/src/pages/xpot/components/sales/LeadSalesPanel.tsx; client/src/i18n/messages/leads.ts:96
Risco: nenhum.

### VIS-30 [S3] Catálogo: promessa que a própria lista desmente e formulário técnico
Status: parcial. Feito: título "Products" e subtítulo, código fora da lista, ícones com texto no computador, "Price to the shop", sem "they pay", placeholder, "volume price", serviço digital sem custo nem margem. Pendente: rodapé fixo do diálogo e o menu com texto no celular.
Telas: plat/p+d/products, plat/p+d/products-new-dialog
Problema: "Tags pieces are managed in Tags" acima de "Large Stand", "Small Plate", com o código `stand-large`. Título "Catalog", menu e migalha "Products". Três ícones sem nome em cada linha (camadas, lápis, arquivo). "1 tier", "company margin $3.80", "resale ≈ $10.00". No formulário: "Price (B2B)", "they pay", placeholder "3d_print, website…", "Cost to make" também em serviço digital. O diálogo corta em "Can be left on consignment", sem sinal de que continua e sem botão salvar à vista.
Mudança: título "Products" / "Produtos" / "Productos"; subtítulo "What reps can sell during a visit." / "O que o vendedor pode vender na visita." / "Lo que el vendedor puede vender en la visita." Códigos só na edição. Ícones com tooltip e, no celular, menu com texto. "Price (B2B)" → "Price to the shop" / "Preço para a loja" / "Precio a la tienda"; "they pay" sai. Placeholder: "Signs, websites..." / "Placas, sites..." / "Placas, sitios web...". "Cost to make" some em tipo digital. Rodapé do diálogo fixo com o botão de salvar. "tier" → "volume price" / "preço por quantidade" / "precio por cantidad".
Arquivos: client/src/pages/admin/AdminProducts.tsx:182, 288; client/src/i18n/messages/manage.ts:142, 150-155, 165-174, 181-184, 383, 594
Risco: esconder custo em digital muda o cálculo de margem: confirmar com o dono. Recomendo custo 0 implícito.

### VIS-32 [S3] Painel com quatro títulos iguais antes do conteúdo
Status: parcial. Feito em Sales e Tasks (sem cabeçalho dentro do painel; fora dele, só o título). Pendente (F1): "Platform" repetido na moldura do painel.
Telas: plat/p/panel-work-tasks, plat/p/panel-work-sales, plat/p/panel-work-leads, owner/p/panel-work-*, partner/p/panel-work-*; plat/d/check-in-rules
Problema: "Tasks" (título), "Tasks" (seletor), "EXECUTION", "Tasks" (título da tela). Em Sales: "Sales", "Sales", "REVENUE OPERATIONS", "Sales center". Em Plataforma, "Platform" na faixa, na barra lateral, na migalha e no grupo.
Mudança: dentro do painel, a tela não desenha seu cabeçalho: seta + seletor bastam. "Sales center" e o eyebrow saem também fora do painel (VIS-16). No topo da Plataforma fica só a faixa com "Back to my app".
Arquivos: client/src/pages/admin/AdminWork.tsx; client/src/pages/xpot/XpotSales.tsx; client/src/pages/xpot/XpotTasks.tsx
Risco: nenhum.

### VIS-33 [S3] Cabeçalho do celular come um terço da tela
Status: pendente (F1): `AppLayout.tsx` e o cabeçalho do celular.
Telas: rep/p/todas as telas de Visitas, plat/p/todas, partner/p/todas
Problema: faixa da visita ou do painel (60px), avatar com "GOOD EVENING / Jessica 👋 / Sunday, November 1" (90px), Visits/Tags (60px) e Ready (75px): 300px de 844 antes de qualquer conteúdo, em toda tela. Na tela de rota, a primeira parada útil fica ainda mais longe.
Mudança: saudação só no Dashboard. Nas demais, barra de uma linha com avatar pequeno e o seletor Visits/Tags. Configurações e sair vão para Settings. Com VIS-1 somam cerca de 160px recuperados.
Arquivos: client/src/components/xpot/AppLayout.tsx:451-464, 521-529; `App.tsx` (mobileHeader)
Risco: sair fica a dois toques. Aceitável para quem usa o dia inteiro.

### VIS-34 [S3] Avisos de limite no meio do trabalho
Status: feito. O aviso de limite só aparece quando se vai criar outra rota; "Used" saiu e ficou "Not visited" nas rotas sem visita.
Telas: rep/p+d/visits-route
Problema: com a rota em andamento, o cartão diz "1 of 3 routes used today. A cancelled route or a failed search also counts." Não há nada a decidir agora. Em rotas passadas, "Used" em verde e "Route completed · 3 of 3 stops visited" dizem o mesmo.
Mudança: o aviso só aparece quando for criar outra rota. "Used / Not used" sai quando há contagem; fica só "Not visited" / "Não visitada" / "Sin visitar" para as de 0 paradas.
Arquivos: client/src/pages/xpot/XpotProspecting.tsx:344-346, 1032, 1079; client/src/i18n/messages/prospecting.ts
Risco: nenhum.

### VIS-35 [S3] Detalhe da visita repete a empresa e oferece gravar visita antiga
Status: parcial. Feito: bloco "Company" saiu (telefone no topo), eyebrow duplicado saiu, gravador recolhido em "Add voice note" (com a nota digitada), quadro de vendas só com venda. Pendente: "Create task" ao lado de "Next step".
Telas: rep/p+d/visits-history-completed, -follow_up, plat/p+d/visits-history-*, owner/p+d/visits-history-*
Problema: "VISIT SUMMARY" duas vezes, no topo e na seção. Bloco "Company" com 11 campos, "Add social network" e "Add photo", igual à tela da empresa, que está a um botão ("Open company"). "Record what happened / Tap to record voice notes" em visita de semanas atrás, com "Tap" no desktop. "Next step: Send the proposal" é texto morto: não vira tarefa. "Sales $0.00 · 0 transactions · 0 pieces" aparece sempre, até sem venda. "Delete visit" sem contexto.
Mudança: tirar o bloco "Company" (fica telefone e endereço no topo). Gravador recolhido: "Add voice note" / "Adicionar nota de voz" / "Añadir nota de voz". Quadro de vendas só com venda. Ao lado de "Next step": "Create task" / "Criar tarefa" / "Crear tarea". O primeiro eyebrow sai.
Arquivos: client/src/pages/xpot/components/VisitRow.tsx:155-235; client/src/i18n/messages/visits.ts:42-52
Risco: nenhum. Editar a empresa continua em "Open company".

---

## S4

### VIS-36 [S4] E-mail e site quebrados no meio da palavra
Status: feito. O e-mail e o site partidos estavam no bloco "Company" da visita, que saiu.
Telas: plat/d/visits-history-completed ("hello@harborlight / nails.com"), plat/d/visits-history-follow_up ("hello@seaportcow / orking.com"), rep/d/visits-history-in-progress ("hello@blueharbor / seafood.com")
Problema: a coluna estreita corta o e-mail ao meio, com a largura sobrando na coluna ao lado.
Mudança: e-mail e site em linha inteira, com reticências no fim e o valor completo ao tocar.
Arquivos: client/src/pages/xpot/components/VisitRow.tsx; client/src/pages/xpot/components/InlineField.tsx
Risco: nenhum.

### VIS-37 [S4] Cartão de consignação esticado e vazio
Status: feito. Cartão com a altura do conteúdo; só a linha de acertos atrasados é vermelha.
Telas: plat/d/panel-work-sales, rep/d/visits-sales-overview
Problema: "On consignment" acompanha a altura de "By product": no painel, um quadro vermelho com mais de 200px vazios. O vermelho em bloco chama mais atenção que o lucro por algo que é só um acerto a fazer.
Mudança: altura do conteúdo (`self-start`). Só a linha "3 settlements overdue" fica vermelha, não o cartão.
Arquivos: client/src/pages/xpot/components/sales/SalesOverview.tsx:221-232
Risco: nenhum.

### VIS-38 [S4] Nome de produto cortado com espaço sobrando
Status: feito. Nome em até 2 linhas; por unidade só com 2 ou mais vendidos.
Telas: plat/p/visits-sales-overview ("Google Busi..."), rep/p/visits-sales-overview, owner/p/visits-sales-overview ("Landing Pag...")
Problema: o valor e a linha "$149.00 profit · $149.00/unit" empurram o nome. "· $149.00/unit" repete o total quando foi 1 vendido.
Mudança: nome em até 2 linhas. Por unidade só com 2 ou mais vendidos.
Arquivos: client/src/pages/xpot/components/sales/SalesOverview.tsx
Risco: nenhum.

### VIS-39 [S4] Rota no desktop: parada atual cortada no painel com rolagem
Status: feito. Ao abrir a rota no computador, a lista rola até a parada atual.
Telas: rep/d/visits-route-job, rep/d/visits-route-in_progress-1
Problema: a lista rola dentro de um painel de altura fixa, e a parada atual (nº 3) aparece cortada na dobra, depois de duas paradas feitas.
Mudança: ao abrir, rolar o painel até a parada atual.
Arquivos: client/src/pages/xpot/XpotProspecting.tsx:1492, 1511, 1568
Risco: nenhum.
