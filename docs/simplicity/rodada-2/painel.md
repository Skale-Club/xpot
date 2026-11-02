# Rodada 2: painel, moldura e navegação

Perfis: platform, partner, owner, owner-multi. Telas olhadas em `en-desktop` e `en-phone`; pt e es só em Today (amostra). 32 imagens abertas. Texto das telas que não abri veio de `report.json` (campo `head`), só para conferir números.

Não auditei, por limite da captura: `shell/phone-nav-menu-open` mostra o celular com o menu FECHADO (a folha "More" nunca foi fotografada) e `shell/sidebar-both-sections-open` mostra o grupo ADMINISTRATION recolhido, igual a `sidebar-collapsed-default`. Então os itens de Administration (Organizations, People, Products, Shop, Integrations, Brand, Status) e o conteúdo da folha "More" estão sem olhar. É falha da captura, não do produto, mas deixa a navegação da plataforma no celular sem prova.

Conferi os números do Today contra a lista que cada linha abre (texto de `report.json`): plataforma 7 e 4 batem com Chips to write or test (7) e Scanned, not live (4); partner 1, owner 3, owner-multi 1 também. Wholesale orders 3 bate com a aba. Nesta rodada não achei número que prometa um e abra outro.

## Notas

| Tela | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| Today, plataforma (desktop e celular) | O que precisa de mim agora | 6 | R2-NAV-3 (duas linhas de produção em blocos diferentes), R2-NAV-9 |
| Today, partner | Produção e chips | 8 | nada de S1/S2 aqui |
| Today, owner | Compras da equipe, chips | 8 | R2-NAV-9 |
| Today, owner-multi | Idem, para várias empresas | 7 | R2-NAV-1 (nome "My companies" com dois sentidos), R2-NAV-8 |
| Barra lateral e alternador "My work / Platform" | Saber onde estou | 7 | R2-NAV-1, R2-NAV-10 (Team três vezes), R2-NAV-12 |
| Barra inferior do celular | Chegar nas 4 telas mais usadas | 6 | R2-NAV-11; a folha "More" não foi fotografada |
| Stock no painel, owner (celular e desktop) | Quantas peças e onde | 5 | R2-NAV-7 |
| Hand out, plataforma (desktop e celular) | Entregar peças a um revendedor | 6 | R2-NAV-6, R2-NAV-13 |
| Hand out, owner e partner (`?view=orders`) | Entregar peças | 7 | R2-NAV-14 |
| Wholesale orders (plataforma) | Quem pediu e o que fazer | 5 | R2-NAV-15 |
| Take back (plataforma, desktop e celular) | Devolver peças ao estoque | 6 | R2-NAV-5, R2-NAV-16 |
| Filas do Today (Chips to write or test, Scanned, not live) | A lista do número | 6 | R2-NAV-4 |
| Chip writers (plataforma) | Parear um computador | 5 | R2-NAV-2 |
| Tela sem permissão (owner, partner) | Entender por que não abre e para onde ir | 5 | R2-NAV-14 |
| Busca (command palette) | Achar tela ou peça | 7 | nada de S1/S2 |
| History (plataforma) | Ver o que aconteceu | não dá nota | tela com 14.477 px; não consegui ler na imagem reduzida; ver R2-NAV-17 |
| pt e es de Today | Mesmo conteúdo, traduzido | 8 | R2-NAV-19 |

Nenhuma tela principal abaixo de 8 por S1. As abaixo de 8 são por S2 listados abaixo.

## S1

Nenhum novo. Os S1 do painel da rodada 1 que continuam em aberto (NAV-3, "MY COMPANY" da plataforma com dados de várias organizações) seguem como estavam, não piores: a linha "Ready to print 3" da plataforma é a mesma ordem da Harbor Print Co. que o partner Daniela vê como "Ready to print 1".

## S2

### R2-NAV-1 [S2] "My companies" quer dizer três coisas
Telas: owner-multi/en-desktop/panel-today, panel-work-leads; platform/en-desktop/panel-work-leads; owner-multi/en-phone/panel-today
Problema: para quem tem várias empresas, "My companies" é o botão do alto (as organizações dele), o item do menu (a lista dessas organizações) e, na tela Companies, a aba "My companies 6" (lojas clientes que ele visita). Na plataforma a aba "My companies 34" lista as lojas de todas as organizações, ao lado do filtro "All organizations": a aba diz "minhas" e o filtro diz "todas". A troca de Team por "My companies" (NAV-15) criou a colisão.
Mudança: renomear a aba para "Mine" / "Minhas" / "Mías" (e "All" já existe como chip); manter "My companies" só para as organizações. Na plataforma, com filtro de organização, a aba "Mine" deve mostrar só as da pessoa, ou sair.
Arquivos: client/src/i18n/messages/leads.ts:10 (`tabMine`), components/xpot/panelNames.ts:11
Risco: nenhum de regra. "Mine" já é o sentido real (lojas atribuídas à pessoa).
Status: feito. A aba da lista de empresas é "Mine" fora do painel e "All companies" no painel; "My companies" só nomeia as organizações do dono. Visto no texto do celular e do desktop (owner-multi e plataforma).

### R2-NAV-2 [S2] Chip writers diz ao Xpot para pedir o instalador ao Xpot
Telas: platform/en-desktop/chip-writers, chip-writers-pairing-code
Problema: o texto "… has no admin access. Ask the Xpot team for the installer." aparece para a plataforma, que é a equipe do Xpot. Quem lê não tem a quem pedir. A página também se chama "Chip writers" mas lista computadores que só "Makes print files" (Harbor bench) e, no menu, "Chip writers" fica ao lado do aviso do Today "Chips to write or test": duas coisas diferentes (computador que grava, peça que precisa de chip) com o mesmo radical.
Mudança: para a plataforma, trocar a frase final por "Installer: <link ou onde baixar>" (ou tirá-la, dizendo "Download the installer here"); para partner manter "Ask the Xpot team". Renomear o item para "Computers" / "Computadores" / "Computadores" com subtítulo "Write chips and print files". Título do bloco já é "Chip writers and print computers", que fica.
Arquivos: client/src/i18n/messages/manageTags.ts:173; components/xpot/moduleNav.ts (rótulo)
Risco: depende de existir o link do instalador (decisão do dono); sem link, só retirar a frase da visão da plataforma.
Status: feito. Item e pagina agora "Computers" (pt Computadores, es Computadoras; glossario atualizado); a frase "Ask the Xpot team for the installer" saiu (a pagina so existe para a plataforma). Pendente: link do instalador, se o dono quiser

### R2-NAV-3 [S2] Today da plataforma separa a produção em dois blocos sem motivo visível
Telas: platform/en-desktop/panel-today, platform/en-phone/panel-today; comparar partner/en-desktop/panel-today
Problema: "Batches awaiting pieces 20" e "Chips to write or test 7" ficam em FOR THE PLATFORM, e "Ready to print 3", "Failed prints 2", "Print files stuck 1" ficam em MY COMPANY. Tudo isso é a mesma tela, Production. O partner vê as quatro juntas sem título. A pessoa não sabe em qual bloco procurar, e o título "MY COMPANY" sugere que as outras linhas não são da empresa dela.
Mudança: um bloco só, "Production" / "Produção" / "Producción", para as linhas de impressão e lotes, e outro "People and orders" / "Pessoas e pedidos" para aprovação e Wholesale orders; os chips e as lidas ficam num terceiro "Pieces" / "Peças". O título "MY COMPANY" sai da plataforma (resolve também o NAV-3 antigo).
Arquivos: client/src/pages/admin/home-model.ts:128-140 (`blocks`), i18n/messages/workspaces.ts
Risco: nenhum de regra; só agrupamento.
Status: feito. Today da plataforma em três blocos: People and orders, Production (inclui lotes à espera de peças), Pieces; o título "My company" saiu. Visto em en desktop; teste em tests/admin-home.test.ts.

### R2-NAV-4 [S2] Linha do Today abre uma lista sem organização
Telas: platform/en-desktop/panel-tags-overview-scannedNotLive, platform/en-phone/panel-tags-overview-scannedNotLive
Problema: a plataforma tem o filtro "All organizations" no alto, mas as linhas mostram só "Company stock" ou "Omar Haddad" na coluna Reseller. Três das quatro são "Company stock": de qual empresa? Para quem agir (a regra é "Tap a piece to set it up"), falta saber de quem é. No celular o cartão repete "Scanned, not live (4)" e o filtro, sem coluna de organização.
Mudança: com o filtro em "All organizations", acrescentar a organização como segunda linha da célula Reseller ("Company stock · Harbor Print Co.") ou em chip; sem filtro (uma organização), não mostrar.
Arquivos: pages/admin/tags/OverviewTab.tsx (lista), components/piece/piece-table.tsx
Risco: nenhum.
Status: feito. A lista traz a organização da peça (segunda linha do "With") quando abrange várias organizações; com uma só, não aparece. Visto em en desktop.

### R2-NAV-5 [S2] Take back mostra o código interno do lote e do kit
Telas: platform/en-desktop/returns-2-codes-checked, platform/en-phone/returns-2-codes-checked
Problema: cada linha mostra "REV-2026-002 #1 · Large Stand · Jessica Alvarez · K-0001" e "LPLATE-2026-003 #3 …". REV, LPLATE, K-0001 e "#3" são códigos de lote e de kit, que ninguém usa para devolver uma peça (regra 6 do plano). No celular a linha corta em "Jessic…", justamente o nome de quem entregou.
Mudança: mostrar só "Large stand · Jessica Alvarez" (e a data da entrega, se houver); código do lote e do kit saem da linha e ficam no detalhe da peça. No celular, nome primeiro, tipo depois.
Arquivos: pages/admin/tags/kits-orders.tsx (ou o componente da lista de devolução em KitsTab.tsx)
Risco: nenhum.
Status: feito. Take back mostra "pessoa · produto"; lote, número e kit saíram da linha. Visto em en phone.

### R2-NAV-6 [S2] "Jessica's rule requires a price" sem dizer o que fazer
Telas: platform/en-desktop/handout-form-codes-checked
Problema: o passo 2 "Who pays for them?" mostra "They pay when they sell: Jessica Alvarez's rule requires a price." e, ao lado, "They buy them now · Usual for Jessica Alvarez, The pieces become theirs today." O campo "Price per piece (USD)" vale 0.00 e aparece embaixo das duas opções, sem dizer de qual. "Rule" e "requires" não explicam: preciso preencher? o preço é o que eles pagam a mim? Quem lê não sabe o que é "regra de Jessica".
Mudança: em "They pay when they sell", trocar a linha por "Jessica sells them and pays you after. Set the price she pays you." ; em "They buy them now", "The pieces become hers today. Set the price she pays you." O campo deve se chamar "Price Jessica pays you, per piece (USD)", e ficar dentro da opção escolhida.
Arquivos: i18n/messages/adminTagsFlow.ts:73 (`ownershipCompanyNeedsPrice`) e vizinhas; pages/admin/tags/kits-give-form.tsx
Risco: texto de regra de negócio (quem paga o quê); confirmar o sentido com o dono. Recomendo a redação acima.
Status: feito. Textos como a recomendação, o campo "Price <nome> pays you, per piece" abre dentro da opção escolhida. Sentido de quem paga a quem: confirmar com o dono. Visto em en desktop e es desktop.

### R2-NAV-7 [S2] Stock do owner conta as peças dele como "With a reseller" e "In company stock 0"
Telas: owner/en-phone/panel-stock, owner/en-desktop/panel-stock (texto), owner-multi/en-desktop/panel-stock
Problema: o owner Priya Nair vê "In company stock 0 · With a reseller 12 · Sold 2 · Live 3 · 14 pieces". As linhas mostram o próprio Priya Nair na coluna de revendedor ("Priya Nair" em 4 peças), e o Tomas Lindgren em 4 das 8 peças do owner-multi. O dono não é revendedor dele mesmo: as peças com ele são da empresa. Além disso 0+12+2+3 ≠ 14 (Live é um recorte dentro dos outros), o que o PE-26 já descrevia. Se for efeito do seed (owner com papel de revendedor), a tela ainda deve tratar o owner como estoque da empresa.
Mudança: peça cuja pessoa responsável é o owner ou o partner conta em "In company stock"; só pessoas com o perfil de revendedor contam em "With a reseller". Mostrar "Company stock" na coluna em vez do nome do owner.
Arquivos: client/src/components/piece/where-model.ts; server (métrica `house` / `withResellers`)
Risco: a métrica alimenta consignação (`unsold_count`); alterar só a exibição se a regra for compartilhada.
Status: descartado (a causa é o seed: Priya e Tomas têm peças em mãos, rep_id igual ao dono, então contam como "With a reseller"; a regra de custódia não mudou). A soma dos chips (Live é um recorte) segue como no PE-26.

### R2-NAV-8 [S2] Owner com várias empresas: nada diz qual empresa é cada peça
Telas: owner-multi/en-desktop/panel-stock, panel-today, owner-multi/en-phone/panel-today
Problema: o Stock soma as duas empresas (8 pieces) sem coluna de empresa nem filtro; o Today diz "Team purchases 1" e leva à lista de empresas, que não mostra a conta. Já estava no NAV-15 (pendente); mostro aqui porque a tela continua assim e o alternador agora diz "My companies", o que promete "tudo das minhas empresas" sem dizer de quem é cada linha.
Mudança: filtro "All my companies" e coluna "Company" em Stock, Hand out e Pieces results quando a pessoa tem mais de uma; Today com "Team purchases · Coastline 1".
Arquivos: pages/admin/tags/PiecesTab.tsx, home-model.ts
Risco: nenhum.
Status: feito em parte. Quem tem várias organizações (e a plataforma em "All organizations") ganha o filtro de organização e a organização de cada peça no Stock. Pendente: "Team purchases · <empresa>" no Today. Visto em en phone (owner-multi).

### R2-NAV-9 [S2] Pieces results aberto pelo Today tem barra de código no alto e título de outro item
Telas: partner/en-desktop/panel-tags-overview-chipPending, platform/en-phone/panel-tags-overview-scannedNotLive
Problema: a linha clicada se chama "Chips to write or test" e a página se chama "Pieces results", com o item "Pieces results" aceso no menu. No alto aparecem "Code or scanned link" e um botão roxo "Open" só nesta tela e em Chip writers, não em Stock nem Today. No celular essa barra ocupa uma linha inteira antes da lista. "Open" não diz abrir o quê.
Mudança: o título da página é o da linha que levou até ela ("Chips to write or test"); o menu continua em Today. A barra de código aparece em todas as telas de Pieces (Stock, Hand out, Pieces results) com o rótulo "Open a piece" e placeholder "Type or scan the code", ou em nenhuma.
Arquivos: components/xpot/AppLayout (barra), pages/admin/tags/OverviewTab.tsx
Risco: nenhum. É a mesma raiz do NAV-20 / PROD-57 já pendentes; contei porque o título e o botão ainda aparecem iguais.

## S3
Status: feito. O título da fila já vinha da fila (r2-leftovers); agora a caixa de código não aparece nas filas abertas pelo Today e o botão das outras telas diz "Open piece". Visto em en desktop.

### R2-NAV-10 [S3] Três itens "Team" com sentidos diferentes no menu do owner e do partner
Telas: owner/en-desktop/panel-today (menu), partner/en-desktop/panel-today
Problema: "Team" (pessoas), "Team purchases" (pedidos) e "Team results" (visitas) estão no mesmo menu. As três começam igual, e a pessoa tem de ler a palavra seguinte para distinguir. "Team purchases" aparece entre Hand out e Pieces results, longe de Team.
Mudança: "Team" vira "People" / "Pessoas" / "Personas" (como na plataforma, "People"); "Team results" vira "Visits results" / "Resultado das visitas"; "Team purchases" fica. O Today "Team purchases" já usa esse nome.
Arquivos: components/xpot/moduleNav.ts (rótulos), i18n/messages/shell
Risco: depende do dono se "Team" é a palavra que ele usa em voz alta. Recomendo "People".

### R2-NAV-11 [S3] Barra inferior do celular muda de tela entre perfis, e ler uma peça não está nela
Telas: platform/en-phone/panel-today (Today, Production, Stock, Hand out, More), owner/en-phone/panel-stock (Today, Stock, Hand out, Team, More), owner-multi/en-phone/panel-today (My companies em duas linhas), partner/en-phone/panel-today
Problema: cada perfil tem uma barra diferente, e nenhuma tem ler uma peça: no modo "My work" o celular tem o botão grande "Read a piece" (owner/en-phone/tags-home), no painel o único caminho é digitar na barra "Code or scanned link", que só aparece em Pieces results e Chip writers. Para a pessoa na rua, a ação mais comum (abrir uma peça pelo código) some quando troca de modo.
Mudança: no celular, o botão central da barra é "Read a piece" (câmera) nos dois modos; Stock mantém a busca por código. O item que cai no "More" no celular é Team purchases.
Arquivos: components/xpot/moduleNav.ts:`panelPhoneTabs`; AppLayout
Risco: decisão de produto (a barra tem 5 lugares). Recomendo trocar Hand out por Read a piece no celular, deixando Hand out em More.

### R2-NAV-12 [S3] Landing de cada módulo tem um nome: Today, Dashboard, Home
Telas: platform/en-desktop/panel-today, platform/en-desktop/visits-dashboard, owner/en-desktop/tags-home; palette em platform/en-desktop/command-palette
Problema: a primeira tela de cada espaço é "Today" (painel), "Dashboard" (Visits) e "Home" (Tags). Na busca aparecem os três. A primeira vez que alguém alterna "My work / Platform" não sabe qual deles é "o início".
Mudança: "Today" para os três espaços; no Tags, "Home" vira "Today" e no Visits o Dashboard vira "Today". Se o dono quiser manter Dashboard, só no Visits e documentar.
Arquivos: components/xpot/moduleNav.ts (labels), i18n/messages/shell
Risco: depende do dono; recomendo "Today".

### R2-NAV-13 [S3] Botão "Hand out" desabilitado com aviso, e três passos vazios ao abrir
Telas: platform/en-desktop/handout-form-codes-checked, panel-kits-handout; platform/en-phone/panel-kits-handout
Problema: no passo 4 "No pieces ready yet · They buy them now" e o botão "Hand out" apagado. Regra 2 do plano: botão desabilitado com aviso. Ao abrir, os passos 2, 3 e 4 são caixas cinzas só com título, sem dizer o que vem. O texto de cima diz "kit with its own code and packing list" (palavras que o plano pediu para sair do uso diário).
Mudança: passo 4 só aparece depois que há ao menos uma peça; o botão vira "Hand out 3 pieces to Jessica". A frase de cima: "Give pieces from your stock to a reseller, or take them back."
Arquivos: pages/admin/tags/kits-give-form.tsx; i18n/messages/adminTagsFlow.ts:88 (`confirmNothing`)
Risco: nenhum.

### R2-NAV-14 [S3] Tela sem permissão e aviso de Wholesale orders são becos sem saída
Telas: owner/en-desktop/restricted-people, partner/en-desktop/restricted-shop, owner/en-desktop/panel-kits-orders-denied
Problema: o cartão diz "Access restricted · Only the platform can open this screen." com o botão "Today". O título da página é "My company", não o da tela pedida. "The platform" é nome interno, o botão não diz que volta, e nada indica quem pedir. No Hand out, ao abrir `?view=orders`, o owner vê a faixa azul "Wholesale orders are handled by the platform. Yours are in Team purchases." em texto, sem link, sobre a tela de entregar peças.
Mudança: "You don't have access to this screen. Ask your Skale Club contact." (ou o nome do gestor) com o botão "Back to Today". A faixa do Hand out vira link: "Your orders are in <Team purchases>", clicável.
Arquivos: i18n/messages/manage.ts:12 (`noAdminPermission`); i18n/messages/adminTagsFlow.ts:122; o componente do cartão de acesso
Risco: nenhum.

### R2-NAV-15 [S3] Wholesale orders: linhas sem estado nem data
Telas: platform/en-desktop/panel-kits-orders
Problema: o Today diz "Paid, waiting for their pieces to be separated" e a lista mostra só "Jessica Alvarez · Large Plate × 10 · $100.00", com uma seta. Não diz se está pago, desde quando espera, nem o que fazer ao abrir. Três linhas iguais, sem ordem de urgência.
Mudança: segunda linha "Paid Oct 30 · waiting 3 days", botão visível "Separate pieces" na linha; mais antigo primeiro.
Arquivos: pages/admin/tags/kits-orders.tsx
Risco: nenhum.

### R2-NAV-16 [S3] Take back: botão longe da lista e frase de confirmação no plural para uma peça
Telas: platform/en-desktop/returns-2-codes-checked, returns-4-confirm
Problema: o botão "Take back 1 piece" flutua no canto inferior direito, longe da lista no desktop. A confirmação diz "They leave whichever reseller holds them and go back to company stock." para 1 peça, e a frase amarela "Xpot does not refund: settle the money with them." não diz o que fazer com a peça já paga.
Mudança: botão logo abaixo da lista; "It leaves Jessica and goes back to company stock." com concordância pelo número; a frase amarela vira "Jessica paid for this piece. Xpot does not refund her: settle it with her."
Arquivos: i18n/messages/adminTagsFlow.ts:124 (`takeBackDesc`); pages/admin/tags/kits-orders.tsx
Risco: nenhum.

### R2-NAV-17 [S3] "History" é o nome de duas telas
Telas: platform/en-desktop/history, platform/en-desktop/command-palette (Visits > History)
Problema: a plataforma tem "History" em Make (eventos de peças e lotes, uma página única de 14.477 px) e "History" em Visits (visitas). A busca mostra os dois. Não consegui ler a página de eventos na imagem reduzida; a altura indica uma lista inteira sem recorte.
Mudança: o da plataforma vira "Activity log" / "Registro de atividade" / "Registro de actividad", com filtro e 50 linhas por vez.
Arquivos: components/xpot/moduleNav.ts (`/admin/tags/journey`), pages/admin/tags/JourneyTab.tsx
Risco: nenhum.

### R2-NAV-18 [S3] "hand over", "Hand out" e "kit" para a mesma ação
Telas: owner/en-desktop/tags-home ("1 piece isn't ready to hand over"), platform/en-desktop/panel-kits-handout (título "Hand out" e frase "Every hand-over is a kit")
Problema: três nomes: hand out (menu), hand-over (frase), kit (frase). Já constava em NAV-9/NAV-10; ainda está igual.
Mudança: só "hand out" e "Past hand-outs"; a palavra kit sai das frases visíveis.
Arquivos: i18n/messages/adminTagsFlow.ts, i18n/messages/tags.ts
Risco: nenhum.

## S4

### R2-NAV-19 [S4] Acabamento
- owner-multi: o alternador do alto quebra "My companies" em duas linhas e o botão fica mais alto que "My work" (desktop e es "Mis empresas"); no celular a barra inferior também quebra a legenda em duas linhas e a altura das outras fica diferente. Mudança: legenda "Companies" na barra e no alternador "My companies" com largura fixa.
- platform/en-phone/panel-kits-handout: a aba "Wholesale orders 3" quebra em duas linhas dentro da faixa de abas.
- owner/en-phone/panel-stock: a faixa de chips de situação corta em "Sold 2" sem sombra que indique que rola.
- Cor: as abas e botões do painel (Hand out, Take back, Open, Create pairing code) são roxos enquanto o painel e o alternador são âmbar; o roxo é a cor do módulo Tags no modo My work (owner/en-desktop/tags-home). Mudança: botões do painel na cor CTA e o roxo só no módulo Tags.
- pt: "Lidas, fora do ar" (Scanned, not live) fica sem substantivo; "Peças lidas, fora do ar".
- platform/en-desktop/sidebar-both-sections-open mostra o grupo ADMINISTRATION fechado: a captura não abre o que o nome diz.

## Perguntas do dono: o que muda ao trocar "My work | Platform"
- Muda o menu inteiro (de Visits / Tags para as listas de tudo) e a cor do alto (azul Visits, roxo Tags, âmbar painel). O que a pessoa vê na primeira tela do painel é a soma do que precisa de ação em todas as empresas dela; no My work é o que é dela.
- A mesma peça aparece com números diferentes nos dois lados por desenho: owner `tags-home` diz "1 piece isn't ready to hand over", Today diz "Chips to write or test 3". São perguntas diferentes (minhas peças, peças da empresa), mas as palavras não indicam isso. Recomendo no My work: "Your pieces: 1 isn't ready" e no painel "Company pieces: 3 chips to write".
- O botão "Platform" leva o nome da plataforma e o das outras três pessoas é "My company". A plataforma tem dois blocos no Today (FOR THE PLATFORM e MY COMPANY), a pessoa lê "My company" como a empresa que ela possui, não como "linhas de produção" (R2-NAV-3).
