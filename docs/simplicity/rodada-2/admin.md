# Rodada 2: administração e idiomas

Área: grupos `orgs`, `orgs-open`, `people`, `people-open`, `platform`, `platform-open`, `gap-manage`, mais a leitura de `client/src/i18n/messages/*.ts`.
Imagens abertas: 35 (limite 50), nenhuma repetida. Perfil platform salvo indicação: 22 en-desktop, 8 en-phone, 1 pt-desktop, 1 es-desktop, mais 1 owner en-desktop e 1 owner-multi en-desktop (a página `history`, de 14.477 px, foi vista num recorte de 1500 px do topo). Idiomas: lidos nos arquivos de mensagens (4.640 chaves analisadas) e em `report.json` (`otherLanguage` só trouxe dado do seed, nada de interface).
Não abertas: `org-*-inventory`, `org-*-kits`, `org-*-purchases`, `org-*-customers`, `people-status-*`, `person-omar/sofia/nora2/rep-both/partner/platform/refused`, `people-search`, `people-module-tags`, `products-new-dialog`, `shop-setup-new-entry`, `status-event-1..3`, `integrations-xphere/assistants`, `brand-installed-app`, e a maior parte de pt/es (só uma amostra de cada). Por limite de custo.

Total de achados: 33 (S1: 3, S2: 10, S3: 17, S4: 3).

## Notas por tela

| Tela | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| organizations (lista) | escolher a organização | 7 | tirar o título triplicado, dizer quem é o dono e o que é "All types" (AD-18) |
| organizations-new-dialog | criar organização | 7 | rótulo no tipo, "New partner that prints" mais claro (AD-18) |
| org-*-overview (platform) | ver números da organização | 7 | tiles que levam a algo, subtítulo igual em todas (AD-22) |
| org-*-team | quem está na equipe | 6 | botões lado a lado sem explicação, "Reactivate" para pessoa bloqueada (AD-1) |
| org-*-settings (platform, parceiro) | configurar a impressão própria e quem cuida dos pedidos | 4 | texto que se contradiz, jargão, dois jeitos de salvar (AD-5, AD-6) |
| people (lista) | achar a pessoa e aprovar quem espera | 6 | tirar "Visits · Tags" de toda linha, um nome só para administrador, "Cost rule not set" com sentido (AD-7, AD-8, AD-13) |
| person-owner / person-reseller (painel) | acesso, módulos e organizações da pessoa | 5 | bloco Xphere fora daqui, regra de custo com nome claro, painel curto no celular (AD-8, AD-12) |
| person-pending | aprovar ou recusar | 7 | linguagem do cadastro, botão sem aviso amarelo (AD-17) |
| person-blocked | desbloquear ou excluir | 4 | "No organization" contradiz a lista, data em dois formatos (AD-1, AD-16) |
| person-new-dialog | cadastrar pessoa | 7 | nada grave; abre no topo e empurra a lista |
| products | catálogo que o vendedor vende | 6 | "Consignable" e "SKU" explicados ou fora, botões com texto no celular (AD-10, AD-20) |
| shop-setup | o que o revendedor vê na loja | 6 | "Piece model" e "Ready-made kit" claros, exemplo de SKU de outro negócio (AD-11) |
| integrations-services | ligar serviços | 6 | formulários recolhidos quando "Off" (AD-14) |
| status | saber se algo quebrou | 5 | banner sem tautologia, texto dos problemas em palavras, sem nome de variável (AD-9) |
| history (platform) | o que aconteceu na produção | 5 | página sem fim, códigos fora do texto (AD-15) |
| brand-identity / landing-editor | trocar marca e textos | 8 | rótulo "Dashboard" x "Go to the app", "Using default text" (AD-21) |
| check-in-rules | distância e bloqueio de check-in | 7 | unidade do país, cartões alinhados (AD-21) |
| piece-page-*-more-actions (gap-manage) | desativar ou marcar como danificada | 5 | ação indisponível não aparece (AD-4) |
| piece-page-house-available-damage-confirm | confirmar dano | 4 | motivo obrigatório ou opcional, não os dois (AD-2) |
| piece-page-live-retire-confirm | desativar peça | 7 | dizer o que o cliente passa a ver (AD-19) |
| piece-page-sold-live-piece-settings | ajustes da peça | 6 | números da atividade batendo com o painel (AD-3) |

---

## Administração

### R2-AD-1 [S1] Pessoa bloqueada: "No organization" no topo e organização no painel
Telas: platform/en-desktop/person-blocked, platform/en-desktop/org-company-team, platform/en-desktop/people
Problema: Carl Mendes tem o selo "No organization" na lista e no cabeçalho do painel, mas o bloco "Organizations" do mesmo painel mostra "Skale Club · Employee" com um "x" para remover. Na equipe da Skale Club ele aparece como "Employee · Suspended" com o botão "Reactivate". Bloqueado e suspenso são duas palavras para o mesmo corte de acesso, e "Reactivate" na organização não desbloqueia a pessoa (o servidor recusa, `pending-r1` AD-14 diz que bloqueado não devia mostrar "Suspended").
Mudança: pessoa bloqueada mostra a organização no selo ("Employee · Skale Club") e não oferece "Reactivate", "Make owner" nem "Suspend" na equipe; no lugar, a linha diz "Blocked. Unblock in People" com link. Texto novo: en "Blocked. Unblock in People" / pt "Bloqueado. Desbloqueie em Pessoas" / es "Bloqueado. Desbloquea en Personas".
Arquivos: `client/src/pages/xpot/OrganizationsPage.tsx:388` (selo Suspended), `client/src/pages/admin/PersonDetail.tsx` (selo de organização)
Risco: não é regra de negócio; só mostrar o estado real.
Status: feito. Lista, cabeçalho e painel dizem "Employee · Skale Club"; a equipe da organização mostra "Blocked" e o link "Unblock in People", sem Reactivate/Suspend. Servidor: teamsByRep mantém as organizações de quem está bloqueado; listOrganizationMembers traz personBlockedAt. Visto em en desktop (People e equipe).

### R2-AD-2 [S1] Marcar como danificada: "Reason (optional)" e "Write a reason to continue" na mesma janela
Telas: platform/en-desktop/piece-page-house-available-damage-confirm
Problema: o campo diz "Reason (optional, kept in the activity)" e logo abaixo aparece "Write a reason to continue.", com o botão "Mark damaged" apagado. Opcional e obrigatório ao mesmo tempo. Ainda por cima pede digitar "PMQ2JJC2 to confirm" (código de 8 letras) além do motivo: dois obstáculos numa ação que o rótulo já avisa que não se desfaz.
Mudança: se o motivo é obrigatório, rótulo "Reason" e placeholder "What happened to it?" (pt "O que aconteceu com ela?", es "¿Qué le pasó?"); manter só um dos dois obstáculos (recomendo o motivo; tirar a digitação do código, já que há o aviso vermelho "Cannot be undone").
Arquivos: `client/src/i18n/messages/manageTagsPieces.ts:99` (reasonPlaceholder), `client/src/i18n/messages/kit.ts:11` (reasonRequired)
Risco: decisão do dono sobre manter a digitação do código; recomendo tirar.
Status: feito (mesma correção de PE-5; digitar o código foi removido, fica o motivo obrigatório, seguindo a recomendação)

### R2-AD-3 [S1] Atividade diz 160 leituras em 30 dias, o painel da mesma peça diz 145
Telas: platform/en-desktop/piece-page-sold-live-piece-settings
Problema: a primeira linha da atividade é "Maple Street Bakery: 160 scans in 30 days". Acima, "Piece performance" mostra 145 em 30 dias e "All time 102 QR + 54 NFC" (156 no total): o resultado registrado é maior que tudo o que já foi lido. A regra 5 do plano (números batem) falha na mesma tela. Pode ser seed, mas a tela não explica a diferença.
Mudança: a linha de resultado deve ser gerada do mesmo cálculo do painel, ou trazer a data do cálculo ("as of Oct 31"). Se for dado de teste, ajustar o seed.
Arquivos: servidor que grava o item "Result" (`server/tags/`), `.lab/seed-production.ts` se for do seed
Risco: confirmar se o seed é a causa antes de mexer no servidor.
Status: descartado (a linha "160 scans in 30 days" é um registro escrito à mão no seed, .lab/seed-pieces.ts:208; o servidor não gera essa linha e ela já não aparece na atividade, que só mostra criada, ligada e no ar)

### R2-AD-4 [S2] "More actions" mostra "Mark damaged" apagado com um aviso, numa peça no ar
Telas: platform/en-desktop/piece-page-live-more-actions (a versão do celular da peça em estoque, `piece-page-house-available-more-actions`, mostra a ação sem aviso)
Problema: numa peça no ar, a janela lista "Deactivate" e "Mark damaged" (apagado, selo vermelho "Cannot be undone") com a frase "Only an unassigned piece in company stock can be marked damaged. Take it back first." Contraria a regra 2: o que não dá para fazer não aparece. O título "More actions on 2S3HJF64" usa o código da peça. "quality-control sample" é jargão de fábrica.
Mudança: esconder "Mark damaged" quando a peça não está no estoque da empresa; título "More actions"; texto "It leaves usable stock for good. It stays in the batch history." (pt "Sai do estoque utilizável para sempre. Continua no histórico do lote.", es "Sale del stock utilizable para siempre. Sigue en el historial del lote.").
Arquivos: `client/src/i18n/messages/pieceScreen.ts:68` (damageHouseOnly), componente do menu "More actions" em `client/src/components/piece/`
Risco: nenhum.
Status: feito. "Mark damaged" só aparece quando a peça está no estoque da empresa; título "More actions"; texto sem "quality-control sample". Visto em en desktop (peça no ar).

### R2-AD-5 [S2] Configurações da organização: "Not restricted yet" ao lado de "only these models" e todos marcados
Telas: platform/en-desktop/org-harbor-settings, platform/es-desktop/org-harbor-settings
Problema: "Models it may print" diz "Not restricted yet: it can print every model. Choose the ones to release." e, duas linhas abaixo, "It requests, generates and prints only these models. Nothing else shows up on its Production page." com todos os seis modelos marcados. A pessoa não sabe se a lista está valendo. Só aparecem seis de uma lista maior (AD-33 pendente) e os nomes dos modelos estão em inglês no es ("Stand Large · Google Review · White").
Mudança: um estado só: "All models allowed. Untick the ones to hold back." quando nenhum filtro existe; "Only the ticked models" quando há. Texto pt: "Todos os modelos liberados. Desmarque os que quer segurar." es: "Todos los modelos liberados. Desmarca los que quieres retener."
Arquivos: `client/src/pages/xpot/OrganizationSettings.tsx`, `client/src/components/ReleasedModelsField.tsx` (se existir) e `client/src/i18n/messages/organizations.ts`
Risco: nenhum, só texto e estado.
Status: feito. Um estado só: "All models allowed. Untick the ones to hold back."; a frase "only these models" só aparece com restrição. Os nomes dos modelos em inglês no es vêm de print_models.title no banco: não mexi. Visto em en e pt desktop.

### R2-AD-6 [S2] "Who handles its orders": parágrafo de jargão, dois jeitos de salvar
Telas: platform/en-desktop/org-harbor-settings
Problema: "With Xpot, kits are bought in the wholesale store and sent from the company's stock. If the partner handles its own orders, there is no wholesale store: they hand kits from their own stock to the organizations linked below." Quem lê não sabe o que muda para ele. As opções são "Xpot handles the orders" e "This partner handles its own orders", com a segunda marcada, e "Prints its own pieces" explica com "print requests, print jobs, batches". Em "Linked organizations", "Unlink" e "Link" parecem agir na hora, mas há um "Save" no fim: não dá para saber o que já foi gravado.
Mudança: duas frases curtas, uma por opção: "Xpot sends the pieces. Orders are paid in the wholesale store." / "This partner sends pieces from its own stock." Mostrar "Linked organizations" só quando a segunda opção está marcada. "Unlink" abre confirmação e grava ao confirmar; "Save" só para os campos de cima.
Arquivos: `client/src/i18n/messages/organizations.ts` (distributionHint, linksHint), `client/src/pages/xpot/OrganizationSettings.tsx`
Risco: depende do dono confirmar o significado exato da segunda opção.
Status: feito. Uma frase por opção; Unlink pede confirmação e vale na hora (o texto diz que não depende do Save). O sentido da segunda opção ("sends pieces from its own stock") a confirmar com o dono. Visto em en e pt desktop; clique em Unlink conferido (nada apagado antes de confirmar).

### R2-AD-7 [S2] O administrador da plataforma tem quatro nomes
Telas: platform/en-desktop/people, person-owner
Problema: filtro "Admin: All", seção "Modules & platform access" com campo "Platform access" (No / "Yes, administrator"), selo amarelo "Platform" na lista, e o botão de alternância "Platform" no topo. A mesma coisa chamada Admin, Platform access, administrator e Platform.
Mudança: um nome: "Platform team". Filtro "Platform team: All", campo "Is on the Platform team" (Yes/No), selo "Platform team". pt "Equipe da plataforma", es "Equipo de la plataforma".
Arquivos: `client/src/i18n/messages/peopleWorkspace.ts` (platformAccessFilter, platformAccess, platformAccessYes)
Risco: nenhum.
Status: feito. "Platform team" no filtro, no campo (Yes/No), no selo e nos avisos; o botão do alto segue "Platform" (é o lugar, não as pessoas). Visto em en desktop.

### R2-AD-8 [S2] "Cost rule not set" na lista, "Who pays for the pieces this person receives" no painel
Telas: platform/en-desktop/people (Rafael Costa), person-owner, person-reseller
Problema: o selo amarelo "Cost rule not set" nomeia a mesma configuração que o painel chama de "Who pays for the pieces this person receives". As opções são "The company (they pay for what they sell)" e "They buy them", e a dica "The company: the pieces stay yours until sold. They buy them: every hand-out needs a price." mistura as duas e fala "yours" a quem é da plataforma. "(they pay for what they sell)" contradiz "The company" (quem paga?). No pt, a mensagem ao revendedor manda ir a "Administração › Pessoas › Regra de custo", rótulo que não existe.
Mudança: selo "Not set up to receive pieces" com o mesmo texto do campo; campo "Do they pay for the pieces?" com "No, they sell on consignment: the pieces stay with the company until sold" e "Yes, they buy them: each hand-out gets a price". pt: "Elas pagam pelas peças?" "Não, vendem em consignação: as peças ficam da empresa até serem vendidas" / "Sim, elas compram: cada entrega tem um preço". es: "¿Pagan las piezas?" "No, venden en consignación: las piezas son de la empresa hasta que se venden" / "Sí, las compran: cada entrega tiene un precio".
Arquivos: `client/src/i18n/messages/manage.ts` (costPolicyTitle, costPolicyZero, costPolicyAcquisition, costPolicyHint), `client/src/i18n/messages/adminTagsFlow.ts:64,173`, `client/src/i18n/messages/tags.ts` (unconfiguredCostPolicy)
Risco: confirmar que consignação é mesmo o que o "zero" significa; os testes de servidor usam "zero | acquisition".
Status: feito. A pergunta é "Do they pay for the pieces?" na pessoa e "Payment for pieces not set" na lista e no Hand out; opções curtas para caber no campo. Evitei a palavra consignação (já tem outro sentido em Visits). Visto em en desktop.

### R2-AD-9 [S2] Status: banner que se repete, nome de variável, texto cru do sistema
Telas: platform/en-desktop/status, platform/pt-desktop/status-event-3
Problema: (1) o banner âmbar "Prospecting is not set up / Because of: Prospecting" diz a mesma coisa duas vezes e usa âmbar para algo que ainda não foi ligado, no mesmo nível de um erro. (2) "What to do: Ask whoever runs the server to set the search engine address (PROSPECTING_ENGINE_URL) and restart it" põe nome de variável de ambiente na tela, contra a regra 6 e contra a decisão do dono de que credenciais ficam em Admin › Integrações. (3) "Problems (7 days)" lista "GET /api/xpot/leads/987 failed: relation "lead extras" does not exist", "TypeError: Cannot read properties of undefined (reading 'map')", "ResizeObserver loop completed with undelivered notifications", "(410 Gone)", "OSRM timeout", "heuristic_v1", "rep 5". Nenhum deles diz o que fazer. (4) "Errors" (1 e 2) e "Problems (7 days)" repetem a mesma lista; "CRM sync problems" ocupa 200 px para dizer "Every record reached the CRM" num sistema em que o Xphere nem está ligado. O `pending-r1` ID-17 só cobre traduzir.
Mudança: banner só com o título e um link "Open Integrations"; trocar a frase da variável por "Not connected yet. Set it up in Integrations." (pt "Ainda não conectado. Configure em Integrações.", es "Aún no conectado. Configúralo en Integraciones."); mostrar uma frase humana por tipo de problema e o texto técnico atrás de "Details"; esconder ruído do navegador (ResizeObserver, TypeError) em "Browser"; juntar "Errors" e "Problems" numa lista com filtro; esconder "CRM sync problems" quando não há CRM ligado.
Arquivos: `client/src/i18n/messages/systemHealth.ts:129,141` (reason_engine_not_configured, todo_engine_not_configured), `client/src/pages/` da Status
Risco: nenhum; os textos técnicos continuam no detalhe.
Status: feito em parte. "Not set up" deixa de ser âmbar, o banner não repete a causa, a frase com PROSPECTING_ENGINE_URL virou "Set it up in Integrations.", Errors e Problems viraram um cartão, o ruído do navegador fica atrás de "Reported by the browser (n)", e "CRM sync problems" vira uma linha quando não há nada. Pendente: uma frase humana por tipo de problema (o texto técnico continua na linha) e o Integrations não configura o motor de prospecção hoje, só mostra o estado (variável do servidor): o dono deve decidir se vira campo em Integrations. Visto em en desktop.

### R2-AD-10 [S2] Produtos: "Consignable", "company margin", "resale ≈", "SKU"
Telas: platform/en-desktop/products, platform/en-phone/products
Problema: a primeira linha traz "3D Printed Keychain · physical · Consignable · 1 volume price" e abaixo "$5.00 / unit · cost $1.20 · company margin $3.80 · resale ≈ $10.00". Quem vende não sabe o que é consignável, a margem é da empresa e o "≈" parece erro. A busca diz "Search by name, SKU or category". "physical" e "digital" em minúscula parecem rótulo técnico. No celular, "Volume pricing", "Edit" e "Archive" viram três ícones sem texto, e "Archive" fica ao lado de "Edit".
Mudança: selo "Consignment" com dica "The rep takes it and pays after selling" (pt "O vendedor leva e paga depois de vender", es "El vendedor lo lleva y paga después de vender"); "Search by name or category"; tipos "Physical" / "Digital" ("Físico", "Digital"); no celular, menu "⋯" com texto.
Arquivos: `client/src/pages/admin/AdminProducts.tsx`, `client/src/i18n/messages/manage.ts`
Risco: nenhum.

## S3 e S4 da administração
Status: feito. "Physical/Digital", "Consignment" (a dica diz que é deixar na empresa e ela pagar o vendido, não o que a recomendação escreveu), "margin" e "suggested resale", busca sem SKU. O menu "..." do celular já existia. Visto em en phone.

### R2-AD-11 [S3] Shop setup: "Piece model", "Ready-made kit", exemplo de outro negócio
Telas: platform/en-desktop/shop-setup, platform/en-phone/shop-setup
Problema: os selos "Piece model" e "Ready-made kit" usam "model" e "kit" em sentidos novos (kit é a entrega K-0001 no glossário). Cada linha repete "Opens the store" e o nome Stuscle; o topo ainda tem a barra "Code or scanned link" com botão roxo, e o botão "New entry" é roxo enquanto "Add person" e "New product" são azuis. A ajuda do formulário mostra "KIT-POKEMON-48-STARTER:1" e "PLATE-GOOGLE-SMALL-BLACK:1" (código de produto e exemplo de outro negócio).
Mudança: selos "One piece" / "Bundle" (pt "Uma peça" / "Pacote", es "Una pieza" / "Paquete"); exemplo "ex.: PLATE-GOOGLE-SMALL-BLACK:1" sem Pokémon; botão "New entry" azul como o resto.
Arquivos: `client/src/i18n/messages/manageTags.ts` (shopKindKit, shopFieldItemsHint, shopNoSku)
Risco: nenhum.

### R2-AD-12 [S3] Bloco Xphere dentro da pessoa
Telas: platform/en-desktop/person-owner, platform/en-phone/person-owner
Problema: para quem tem Visits, o painel traz "Visits · Xphere CRM": "No token", "Sync with Xphere", "Inbound key", "Inbound address (give it to Xphere with the inbound key)" com uma URL, "Outbound token (xph_..., from Xphere)", "Advanced", "Last sync". São 400 px de configuração técnica repetidos em cada pessoa, e a página já tem "All connections in Integrations". No celular a ficha vai a 2.653 px.
Mudança: deixar só "Sends to Xphere: On/Off" e um link "Set up in Integrations"; as chaves e endereços ficam em Integrações › Xphere (já existe).
Arquivos: `client/src/pages/admin/PersonDetail.tsx`
Risco: depende do dono quanto a configurar o Xphere por pessoa; recomendo tirar daqui.

### R2-AD-13 [S3] Lista de pessoas: "Visits · Tags" em toda linha, e o revendedor aparece como "Employee"
Telas: platform/en-desktop/people, platform/en-phone/people, person-reseller
Problema: 10 linhas repetem "Visits · Tags", que não ajuda a separar ninguém; o selo âmbar "Platform" tem a mesma cor de "Waiting for approval" e "Cost rule not set". Kevin Brooks é revendedor (só Tags), mas o selo diz "Employee · Lindgren Local Growth": a lista nunca usa "reseller" nem "rep", que são os nomes do glossário. No celular o campo de busca corta ("Search by name, phone or e").
Mudança: mostrar o módulo só quando falta um dos dois ("Tags only" / "Visits only"); selo de função "Reseller" quando a pessoa só tem Tags, "Rep" quando só tem Visits; placeholder "Search people".
Arquivos: `client/src/pages/admin/AdminReps.tsx`, `client/src/i18n/messages/peopleWorkspace.ts`
Risco: recomendo manter o cadastro igual e só mudar o texto do selo.

### R2-AD-14 [S3] Integrações: todo formulário aberto, mesmo desligado
Telas: platform/en-desktop/integrations-services, platform/en-phone/integrations-services
Problema: 3.420 px no computador e 5.614 px no celular. Twilio, Google Places, Groq, OpenAI, OpenRouter e Gemini aparecem com campos, "Test" e "Save" mesmo estando "Off" e "Not set up". "Route optimisation (Google)" usa grafia britânica numa interface en-US. "AI assistants" aparece de novo como bloco, depois de já ser uma aba.
Mudança: cada serviço recolhido numa linha (nome, estado, "Set up"); abrir só o que está com erro ou o que a pessoa tocou; "Route optimization".
Arquivos: `client/src/pages/admin/` Integrações, `client/src/i18n/messages/integrations.ts`
Risco: nenhum.

### R2-AD-15 [S3] História da plataforma: página sem fim e códigos no texto
Telas: platform/en-desktop/history
Problema: 14.477 px sem paginação. Cada linha termina em "REV-2026-002 · SXZAH7PT #1 · Kit K-0001 · LPLATE-2026-007", contra a regra 6. O título "History" aparece três vezes (barra do topo, cartão, menu). "Decision" marca "Hypothesis planned", "Task planned" e "Target planned", e planos viram "Experiment", "Hypothesis", "Target" (PROD-41 deixou a etiqueta "Decision" pendente). "Piece FGSY2YPZ activated" usa "activated" enquanto a peça diz "Put live".
Mudança: mostrar 20 itens e "Show more"; códigos só no detalhe; "Piece FGSY2YPZ put live".
Arquivos: `client/src/pages/` do histórico (frente de produção), `client/src/i18n/messages/productionBoard.ts`
Risco: nenhum.

### R2-AD-16 [S3] Pessoa bloqueada: datas em dois formatos
Telas: platform/en-desktop/person-blocked
Problema: "Blocked on Oct 14, 2026 · Partnership ended on 2026-10-12". O mesmo parágrafo mistura "Oct 14, 2026" e "2026-10-12", e a frase "Partnership ended" não existe no resto do sistema.
Mudança: usar a mesma função de data nas duas e escrever "Blocked on Oct 14, 2026. Stopped being a reseller on Oct 12, 2026."
Arquivos: `client/src/pages/admin/PersonDetail.tsx`
Risco: nenhum.

### R2-AD-17 [S3] Cadastro pendente: "Kit investment", "Own vehicle", Approve apagado com aviso amarelo
Telas: platform/en-desktop/person-pending
Problema: a ficha de quem espera aprovação mostra "In-person selling: Ready", "Own vehicle: Yes", "Kit investment and active seller terms acknowledged" (kit no sentido de compra, não de entrega) e, ao lado das caixas "Visits" e "Tags", o aviso amarelo "Choose at least one module." enquanto "Approve" fica apagado. É o padrão proibido (botão apagado com aviso).
Mudança: "Approve" sempre ativo, com "Tags" marcado por padrão; se nenhuma estiver marcada, o clique foca as caixas. "Kit investment…" vira "Agreed to the starter pack terms" (pt "Aceitou os termos do pacote inicial", es "Aceptó los términos del paquete inicial").
Arquivos: `client/src/pages/admin/PersonDetail.tsx`, `client/src/i18n/messages/manage.ts` (applicationTermsAcknowledged)
Risco: padrão "Tags marcado" depende do dono.

### R2-AD-18 [S3] Lista de organizações: título triplicado, "All types" sem rótulo
Telas: platform/en-desktop/organizations, organizations-new-dialog, owner-multi/en-desktop/organizations
Problema: "Organizations" aparece na barra do topo, no título da página e no menu. O seletor "All types" não tem rótulo e as opções são "Sells" / "Prints and sells". Os cartões dizem só "Active · 3 members", sem o dono. "New partner that prints" não diz o que é parceiro. A descrição fala em "customers" enquanto a aba da organização se chama "Companies". Para o dono de várias organizações a página se chama "Organizations" e o menu "My companies" (AD-06, pendente).
Mudança: tirar o título de dentro da página; seletor "Type: All"; cartão com o nome do dono ("Owner: Priya Nair"); botão "New printing partner" (pt "Novo parceiro de impressão", es "Nuevo socio de impresión"); descrição "Teams that share companies, stock and results".
Arquivos: `client/src/pages/xpot/OrganizationsPage.tsx`, `client/src/i18n/messages/organizations.ts` (intro)
Risco: OrganizationsPage é da frente F4; coordenar.

### R2-AD-19 [S3] Desativar peça: "stops redirecting", "optional" duas vezes, sem dizer o que o cliente vê
Telas: platform/en-desktop/piece-page-live-retire-confirm
Problema: "Deactivate this piece? It stops redirecting and leaves use." Quem tem a peça no ar quer saber o que o cliente vê ao ler o QR. O rótulo "Reason (optional)" e o placeholder "Reason (optional, kept in the activity)" repetem "optional".
Mudança: "Deactivate this piece? Anyone who scans it will no longer reach the link. You can restore it later." (pt "Quem ler esta peça deixa de chegar ao link. Você pode restaurar depois.", es "Quien la lea dejará de llegar al enlace. Puedes restaurarla después.") e placeholder "Why? (saved in the history)".
Arquivos: `client/src/i18n/messages/pieceScreen.ts`, `client/src/i18n/messages/manageTagsPieces.ts:99`
Risco: nenhum.

### R2-AD-20 [S3] Celular: botões só com ícone para excluir e arquivar
Telas: platform/en-phone/shop-setup, platform/en-phone/products
Problema: em "Shop setup" cada entrada tem um lápis e uma lixeira sem texto; a lixeira apaga uma entrada publicada. Em "Products", "Volume pricing", "Edit" e "Archive" são três ícones lado a lado. No computador os botões têm texto, no celular não.
Mudança: no celular, um "⋯" por linha que abre "Edit", "Volume pricing", "Delete entry" com texto, e a ação de apagar pede confirmação.
Arquivos: `client/src/pages/admin/AdminProducts.tsx`, `client/src/pages/admin/` de Shop setup
Risco: nenhum.

### R2-AD-21 [S4] Acabamento de marca, landing e regras de check-in
Telas: platform/en-desktop/landing-editor, check-in-rules
Problema: o botão do menu logado diz "Dashboard" e o botão grande logado diz "Go to the app", mesmo destino. O rodapé do editor diz "Using default text", sem dizer o que fazer. Em "Check-in rules" a distância está em "metres" para uma interface em dólar e telefone +1, e os três cartões têm alturas diferentes e ficam desalinhados.
Mudança: os dois botões "Go to the app"; "Using default text" vira "No changes yet"; "feet" com conversão ou "meters" sem o hábito britânico, a escolher pelo país da plataforma; cartões com a mesma altura.
Arquivos: `client/src/i18n/messages/landingAdmin.ts`, `client/src/i18n/messages/manage.ts` (checkInRulesHint)
Risco: unidade é decisão do dono (a distância é guardada em metros).

### R2-AD-22 [S4] Subtítulo e título da organização mudam de lugar
Telas: platform/en-desktop/org-brightside-overview, org-company-team, platform/en-phone/org-brightside-overview
Problema: nas organizações do cliente o subtítulo é "Platform management"; na da própria Skale Club é "Owner" (a função do usuário). No celular o título é a aba ("Overview", "Team") e o nome da organização vira uma legenda pequena em maiúsculas, o contrário do computador.
Mudança: o nome da organização sempre no título, a aba no subtítulo; subtítulo "You are the owner" só para o dono.
Arquivos: `client/src/pages/xpot/OrganizationsPage.tsx:350`
Risco: nenhum.

---

## Idiomas

### R2-ID-1 [S2] Textos mandam a pessoa para menus que não existem mais
Telas: mensagens mostradas em venda, entrega e estoque nos três idiomas (qualquer perfil)
Problema: "Mark one as consignable in Manage › Products" (`salesModule.ts:98`), "Turn it on in Visits › Manage › Products" (`apiErrors.ts`, srv_product_not_consignable), "Map its batch to a product in Tags › Manage › Batches" e "In Tags › Manage › Hand out › Wholesale orders" (`tags.ts`), "in Administration › People › Cost rule" (`tags.ts`), "Pair it … on Tags › NFC writers" (`partnerMaterials.ts:60`). Hoje o menu é "Platform › Products", "Platform › People", "Chip writers" e "Hand out"; não existe "Manage", "Administration ›" nem "NFC writers". O pt diz "Gestão › Produtos" e "Tags › Gravadores NFC", o es "Gestión" e "Grabadores NFC".
Mudança: escrever o caminho do menu atual: en "Platform › Products", "Platform › People", "Chip writers", "Hand out › Wholesale orders"; pt "Plataforma › Produtos", "Plataforma › Pessoas", "Gravadores de chip", "Entregar peças › Pedidos de atacado"; es "Plataforma › Productos", "Plataforma › Personas", "Grabadores de chip", "Entregar piezas › Pedidos mayoristas". Melhor ainda: um link no lugar do caminho.
Arquivos: `client/src/i18n/messages/salesModule.ts:98`, `apiErrors.ts` (srv_product_not_consignable), `tags.ts` (missingProductMappingAdmin_*, missingAcquisitionCostManager_*, unconfiguredCostPolicy*), `partnerMaterials.ts:60`
Risco: confirmar os nomes de menu em `shell.ts`/`workspaces.ts`; o "Batches" hoje fica em Production.
Status: feito. Todo caminho de menu das mensagens aponta para telas que existem, nos três idiomas (Plataforma › Administração › Produtos, Plataforma › Produção, Plataforma › Gravadores de chip, Entregar peças › Pedidos de atacado); o teste tests/i18n-menu-paths.test.ts falha se um passo não for um rótulo existente ou for um menu antigo. Mensagens da senha/Twilio e do NFC Tools são caminhos de fora e ficam de fora do teste.

### R2-ID-2 [S2] "Peça peças ao seu gestor", e "gestor" não é um papel do sistema
Telas: reseller/pt-desktop tags-pieces (estado vazio), nas telas de Tags em pt e es
Problema: pt `tags.ts:613` "Nenhuma peça ainda. Peça peças ao seu gestor." (o `pending-r1` ID-11 conta como corrigido, mas a chave `piecesEmpty` continua assim; a frase nova só entrou em `todoEmpty`). es `tags.ts:1081` "Pídele piezas a tu gestor." en `tags.ts:125` "Ask your manager for pieces." Em todas as telas de pessoa os papéis são Owner / Employee ("Dono" / "Funcionário"); "manager" e "gestor" (15 vezes em `tags.ts`, 6 em `apiErrors.ts`) não aparecem em nenhuma lista. O es também usa "gerente" (2 vezes).
Mudança: en "No pieces yet. Ask the owner of your organization." pt "Nenhuma peça ainda. Fale com o dono da sua organização." es "Todavía no tienes piezas. Habla con el dueño de tu organización." E trocar "manager/gestor/gerente" por "owner/dono/dueño" nas demais chaves.
Arquivos: `client/src/i18n/messages/tags.ts:125,613,1081` e as chaves `missingProductMapping_*`, `stockBlockedAsk`, `unconfiguredCostPolicy`; `pieceScreen.ts` (hintAskManager)
Risco: nenhum; "dono" já é o papel dito em `apiErrors.ts` (srv_lead_other_organization).
Status: feito. "manager/gestor/gerente" saiu de tags, pieceScreen, pieceCustody, checkin e da regra de custo; quem se procura é o dono da organização. Restam só chaves internas com "Manager" no nome.

### R2-ID-3 [S2] Espanhol: "negocio" quer dizer duas coisas, e a empresa tem quatro nomes
Telas: es-desktop em Companies (Visits) e em check-in
Problema: "{count} negocio abierto" (`dashboard.ts`, openDealsLink: um deal) e "Tipo de negocio", "negocios cercanos" (`checkin.ts`: um comércio) usam a mesma palavra. A empresa cliente aparece como "empresa" (160 vezes), "negocio" (34), "comercio" (landing) e "tienda" ("{count} tienda para contar y cobrar"). O glossário manda "empresa".
Mudança: deal vira "oportunidad" ("{count} oportunidad abierta"); "negocio" e "tienda" para a empresa viram "empresa" ("{count} empresa para contar y cobrar", "Tipo de empresa", "empresas cercanas"). Na landing pública, "comercio" pode ficar.
Arquivos: `client/src/i18n/messages/dashboard.ts` (openDealsLink_*, settlementsDueTitle_*), `checkin.ts` (fieldIndustry, nearbyQuery), `integrations.ts` (descGooglePlaces)
Risco: nenhum.
Status: feito com uma decisão: "negocio" fica como o Deal (o glossário em docs/MODULES.md diz Negocios) e a empresa cliente vira "empresa" (tipo de empresa, empresas cercanas, tiendas para contar, prospecção). A recomendação de trocar o Deal por "oportunidad" contradiz o glossário e não foi aplicada. A landing e as telas para o cliente final seguem com "comercio"/"negocio".

### R2-ID-4 [S3] Para o cliente, quem entrega a placa é "seu vendedor"
Telas: customer/pt-desktop e es-desktop (`my-plates`, tela de entrada do cliente)
Problema: `myPlates.ts`: en "Plates your seller sets up for your business", pt "Peça ao seu vendedor para cadastrar o seu celular". Quem monta a placa para o cliente é o revendedor, não o vendedor de rua (glossário: rep = vendedor, reseller = revendedor). O pt usa "negócio" ("nenhum negócio") onde o resto do sistema diz "empresa". Outros textos: `systemHealth.ts:293` "Peça ao vendedor para montar a rota" (aí vendedor está certo).
Mudança: en "your reseller", pt "seu revendedor", es "tu revendedor"; "empresa" no lugar de "negócio" no pt.
Arquivos: `client/src/i18n/messages/myPlates.ts:46,106,112,118,131,160`
Risco: se o dono do cliente comprou direto do vendedor da Skale Club, "seu contato" seria mais seguro; recomendo "o seu contato".

### R2-ID-5 [S3] "Loja", "shop" e "store" para três coisas
Telas: pt-desktop e en-desktop de Shop setup, Stock (acerto de consignação) e Dashboard
Problema: pt "{count} loja para contar e cobrar" (uma empresa cliente), "loja Stuscle" e "loja de atacado" (onde se compra), "loja do revendedor" (catálogo no sistema). No en o mesmo: "shop" para o cliente, "store" para a Stuscle, "shop" de novo para o catálogo. Em es: "tienda" e "tienda mayorista".
Mudança: cliente é sempre "empresa/company/empresa"; "loja de atacado / wholesale store / tienda mayorista" só para a Stuscle; o catálogo do revendedor continua "Shop setup / Configurar loja / Configurar tienda".
Arquivos: `client/src/i18n/messages/dashboard.ts` (settlementsDueTitle_*), `manage.ts` (wholesaleConfirm, fieldWholesale), `manageTags.ts` (shopAdminIntro)
Risco: nenhum.

### R2-ID-6 [S3] "Kit" com quatro sentidos
Telas: platform/en-desktop/org-*-overview (tile "Kits"), shop-setup, person-pending, person-owner
Problema: kit é a entrega K-0001 (aba "Kits", tile "KITS 5", botão "Their kits"), o item de loja "Ready-made kit" / "Starter kit · 10 plates", a taxa "Kit investment" do cadastro e "Tags kits" em "Lets them buy Tags kits at the wholesale price" (aí "Tags" é o módulo, não uma etiqueta). O glossário diz que kit fica só para a entrega.
Mudança: aba e tile viram "Hand-outs" (pt "Entregas", es "Entregas", já em AD-06 como pendente); pacote da loja "Bundle" (R2-AD-11); "Wholesale code … lets them buy pieces at the wholesale price" sem "Tags kits".
Arquivos: `client/src/i18n/messages/organizations.ts` (tabKits, cardKits), `manage.ts` (wholesaleHint, applicationTermsAcknowledged), `peopleWorkspace.ts` (theirKits), `manageTags.ts` (shopKindKit)
Risco: nenhum.

### R2-ID-7 [S3] Pt: "chapa", "placa", "plaquinha" e "mesa" para a mesma coisa e para coisas diferentes
Telas: pt-desktop de Stock, Production e landing
Problema: o produto "Plate" aparece como "Chapa pequena/grande" (`manageTagsPieces.ts`, modelName_Plate_*), como "placas" (landing, My plates, 16 usos) e como "plaquinhas" (`production.ts` catalogEmptyHint, landing mockQuote). "mesa" é a mesa da impressora ("Uma mesa leva {copies}"), a mesa do restaurante ("Mesa 4", "placas de mesa") e a mesa de trabalho ("Gravador de mesa"). Em en a mesa da impressora é "bed" e o glossário chama de "Print job" / "Impressão".
Mudança: "placa" em todo lugar; "plaquinha" sai; "mesa da impressora" vira "bandeja" ("Uma bandeja leva {copies}") ou "impressão"; "Gravador de mesa" vira "Gravador do computador".
Arquivos: `client/src/i18n/messages/manageTagsPieces.ts` (modelName_Plate_*, nfcCardTitle), `production.ts` (catalogEmptyHint, fieldQuantityHint*, willPrint_*, printingNow)
Risco: confirmar com o dono se o operador de impressora diz "mesa"; o tradutor de PE-46 já cobre "chapa".

### R2-ID-8 [S3] "Activated", "Went live" e "Put live"
Telas: platform/en-desktop/person-owner (tile "ACTIVATED" e linha "Live: 1"), manage tags da equipe
Problema: o painel da pessoa tem o tile "ACTIVATED 1" e logo abaixo "Live: 1". A atividade da peça diz "Put live" e o histórico de produção "Piece FGSY2YPZ activated". No pt o tile é "Ativadas" e a linha "No ar". `manageTags:teamColActivated` e `adminTagsFlow:activityActivated` usam "Activated"/"Went live".
Mudança: "Put live" em todos (pt "Colocada no ar", es "Activada en vivo" ou "Puesta en línea"), e o tile vira "Put live".
Arquivos: `client/src/i18n/messages/manageTags.ts` (teamColActivated), `adminTagsFlow.ts` (activityActivated, activityWentLive), `peopleWorkspace.ts`
Risco: nenhum.

### R2-ID-9 [S3] Texto técnico em inglês nas telas pt e es de Status
Telas: platform/pt-desktop/status-event-3, platform/es-desktop/status, platform/es-desktop/history
Problema: em pt e es, o evento aparece como "Erro / Prospecção #3 / Run 12 stuck in starting for 20 minutes; marked failed". A mensagem do servidor não passa pela tradução. `pending-r1` ID-17 deixou pendente; a tela de Status em pt ainda é metade em inglês. Os "Problems" listados (GET /api…, TypeError…) também.
Mudança: guardar um código por tipo de evento no servidor ("run_stuck_starting") e traduzir no cliente com `{minutes}`; o texto cru fica atrás de "Details".
Arquivos: `server/` onde se gravam os eventos, `client/src/i18n/messages/systemHealth.ts`
Risco: precisa de código por evento no servidor (já indicado no `pending-r1`).

### R2-ID-10 [S3] "Tag" e "etiqueta" ainda aparecem para a peça e para a etiqueta de texto
Telas: platform/en-desktop/piece-page-sold-live-piece-settings (atividade), es-desktop de peça e chip
Problema: a atividade mostra "Tag SXZAH7PT assigned to Maple Street Bakery" (título gravado pelo servidor, antigo: `server/tags/field.ts:125`, `repository.ts:647,736`), apesar de o glossário dizer "nunca tag para o objeto". O es mistura "etiqueta" para o chip ("Toca Bloquear etiqueta"), para o campo interno ("Etiqueta interna"), para produtos ("Etiqueta de menú") e para as etiquetas de setor da prospecção. Em pt o mesmo campo é "Rótulo".
Mudança: servidor passa a gravar "Piece X assigned to …" (PE-39 já cobre o novo, falta o antigo); es "chip" no lugar de "etiqueta" para o chip, "Nombre interno" no campo.
Arquivos: `server/tags/field.ts:125`, `server/tags/repository.ts:647,736`, `client/src/i18n/messages/tags.ts` (lockIphone2, labelField), `manageTagsPieces.ts` (internalLabel)
Risco: itens antigos já gravados continuam com o título antigo.

### R2-ID-11 [S4] "Da pessoa", "Their" e grafia britânica
Telas: platform/pt-desktop/person-owner, platform/en-desktop/integrations-services, check-in-rules
Problema: pt "Visitas da pessoa", "Peças da pessoa", "Kits da pessoa" soam como tradução palavra por palavra de "Their visits". en "Route optimisation (Google)" e "(metres)" são grafia britânica numa interface em dólar. As datas "mm/dd/yyyy" nos campos do painel seguem o navegador, não o idioma da tela.
Mudança: pt "Visitas dela/dele" não funciona sem gênero; usar "Visitas", "Peças", "Entregas" como abas dentro do painel dele. en "optimization", "meters" ou "feet".
Arquivos: `client/src/i18n/messages/peopleWorkspace.ts` (theirVisits, theirPieces, theirKits), `integrations.ts`, `manage.ts`
Risco: nenhum.

---

## Resumo por gravidade

- S1 (3): AD-1, AD-2, AD-3
- S2 (10): AD-4, AD-5, AD-6, AD-7, AD-8, AD-9, AD-10, ID-1, ID-2, ID-3
- S3 (17): AD-11 a AD-20 (10) e ID-4 a ID-10 (7)
- S4 (3): AD-21, AD-22, ID-11

## Termos do glossário: contagens nas mensagens (para quem for corrigir)

pt: peça 469, empresa 219, estoque 145, cliente 121, lote 97, kit 49, revendedor 48, vendedor 25, placa 34, gestor 6, plaquinha 2, chapa 2, mesa 9.
es: pieza 678, empresa 211, stock 157, cliente 121, negocio 34, comercio 3, tienda 46, etiqueta 13, kit 49, revendedor 48, vendedor 25, gerente 2.
en: piece 443, company 201, customer 119, store 36, shop 20, seller 14, rep 16, manager 8, label 11, tag 6.
