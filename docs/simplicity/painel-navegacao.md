# Painel e navegação: auditoria visual

Base: rodada `r0`, commit `44d2935`. Perfis: platform, partner, owner, owner-multi. Moldura conferida também em rep-both e reseller.
Onde o achado vem só do código, sem imagem do estado, está escrito "do código". Não capturados: a busca aberta dentro do painel, a lista do select do celular (lista nativa não sai em screenshot), o diálogo de Take back e o card "Company-owned" com regra "they buy".

## Cobertura

Confirmadas com a imagem à vista no fim do trabalho (57): platform d: today, sidebar-both, palette, handout, os 3 forms, history, returns, orders, overview, chipPending, scannedNotLive; platform p: os 3 forms, handout, returns, orders, chipPending; partner d: handout, history, returns, denied; partner p: handout; owner d: handout, history, returns, denied, overview; owner p: handout, returns; owner-multi d: today, history, returns, denied; owner-multi p: handout, returns; moldura: phone-nav-menu-open, org inventory, panel-stock, org-harbor-settings, org-brightside-settings, settings-administration d/p, settings-profile p, restricted, reseller tags-home d/p, es handout, visits-dashboard d/p, owner tags-home d/p, org team d/p, owner-multi organizations.

**Não reconfirmadas (o leitor retirou as imagens antigas da conversa, e o que está dito delas vem de anotações ou do código):** sidebar-collapsed-default; command-palette rep-both e reseller; today platform p, partner d/p, owner d/p, owner-multi p; overview platform p, partner d/p, owner p, owner-multi d/p; chipPending partner d/p, owner d/p, owner-multi d/p; scannedNotLive platform p, partner d/p, owner d/p, owner-multi d/p; noProduct nos 4 perfis d/p; history platform p, partner p, owner p, owner-multi p; returns partner p; handout owner-multi d. As notas dessas telas na tabela valem como estimativa. Citações delas nos achados precisam de conferência antes de virar PR.

## Notas por tela

| Tela | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| panel-today platform | O que precisa de mim hoje | 4 | Número igual ao da lista que abre (NAV-1); um só "Platform" (NAV-5); falha acima de rotina (NAV-23) |
| panel-today partner | Imprimir o que está pronto | 6 | Painel sem o nome "Production" (NAV-6); sem atalhos repetidos (NAV-23) |
| panel-today owner | Compras e chips da equipe | 6 | Moldura enxuta; atalhos fora; Settings no celular (NAV-7) |
| panel-today owner-multi | Idem, em duas empresas | 5 | Item Team purchases no menu e empresa em cada linha (NAV-15) |
| sidebar-collapsed-default | Achar a tela | 5 | Grupos por tarefa, nomes únicos (seção Navegação final) |
| sidebar-both-sections-open | Achar a tela da plataforma | 4 | Lista que caiba ou mostre rolagem (NAV-25) |
| command-palette | Ir direto a uma tela ou peça | 6 | Nomes sem repetição, entrada do painel visível (NAV-26) |
| panel-kits-handout | Entregar peças a alguém | 4 | Primeiro campo acima da dobra; passos que explicam (NAV-9, NAV-10) |
| handout-form-reseller-picked | Dizer quem paga | 4 | Regra dita uma vez, em palavras comuns (NAV-10) |
| handout-form-codes-checked | Confirmar a entrega | 5 | Erro de custo no campo do custo (NAV-11); lista na ordem de leitura |
| handout-from-batch | Pegar as próximas do lote | 5 | Sem aviso de custo antes de haver peça (NAV-11) |
| panel-kits-history | Ver o que foi entregue | 5 | Empresa no card; "Take back" claro em peça comprada (NAV-4, NAV-13); rótulos no celular (NAV-29) |
| panel-kits-returns | Receber peças de volta | 5 | Título próprio, uma instrução, destino dito (NAV-18) |
| panel-kits-orders | Separar pedido pago | 4 | Um campo, nome de produto, botão em palavras comuns (NAV-19) |
| panel-kits-orders-denied | (só por URL) | 6 | Dizer por que caiu aqui (NAV-30) |
| panel-tags-overview | Minhas peças estão sendo usadas? | 4 | Uma resposta no topo; sem números repetidos; atividade útil (NAV-20, NAV-21, NAV-22) |
| overview-chipPending | Quais chips gravar | 5 | Status no celular; ação na linha; "Chip written" fora de "to write" (NAV-8, NAV-17) |
| overview-scannedNotLive | O que ativar | 3 | Data real da leitura e próximo passo (NAV-2, NAV-17) |
| overview-noProduct | Peças que não vendem | 6 | Nome comum e volta certa (NAV-17) |
| Moldura, modo trabalho | Meu dia | 6 | Porta do painel com cara de porta (NAV-12); sem switch de um item (NAV-27) |
| Moldura, painel | Onde estou | 4 | Tirar faixa, cartão e eyebrow (NAV-5); barra inferior no celular (NAV-7) |
| Moldura, conta (Settings) | Meus dados | 5 | Deixar de ser área; sem porta dupla (NAV-12, NAV-14) |

## D7: decisão recomendada

**Não unificar em uma área. Ficam duas áreas, "Meu trabalho" e "Minha empresa". A conta deixa de ser área e vira um menu do avatar.** O PR 8 da auditoria (tamanho L, risco alto) sai, e entra um PR de moldura de tamanho M e risco baixo.

### O que as telas mostram

| Área | Quem vê | O que é | Entrada hoje | Saída hoje |
|---|---|---|---|---|
| Módulo (Visits, Tags) | Todos | Minhas peças, minha rota | Login | Rodapé: "Platform" ou "My company", "Settings" |
| Painel | platform, partner, owner | Dados da empresa | Rodapé, ou botão cinza no topo do celular, ou Settings › "Open panel", ou busca | Faixa âmbar: "Back to my app" |
| Conta (Settings) | Todos | Meus dados | Rodapé, ícone no celular | Trocar de módulo, seta |

### Por que não juntar módulo e painel

- **Os dados são outros, e isso é real.** Priya vê "67 scans" em Tags › Home e "336" em Pieces results. Vê "3 with you" na Home e 14 peças em Stock. A diferença existe no servidor: `lib/workspace.ts:6-11` manda `X-Xpot-View: rep` ou `manage` conforme a URL. Numa área só, cada tela precisaria de um seletor "minhas / da empresa", e esse seletor é mais uma coisa a entender.
- **A maioria nem tem painel.** Vendedor e revendedor não têm nada a ganhar com a junção.
- **O problema visto não é haver duas áreas. É como elas se anunciam:** nome repetido 6 vezes, três portas de entrada, e no celular a porta parece um campo desabilitado. Isso se resolve sem mexer em rota nem em permissão.

### Por que a conta sai

Em Settings a barra lateral fica com o switch Visits/Tags sem nada selecionado e um único item, "Settings", sob o título "MY WORK". É uma área inteira para uma tela. A tela ainda tem porta para o painel e um formulário de Add person que já está em Team.

### O que muda

| Hoje | Depois |
|---|---|
| Faixa âmbar + cartão + breadcrumb + eyebrow | Um controle de dois lados no topo: `My work` \| `My company` (PT `Meu trabalho` \| `Minha empresa`, ES `Mi trabajo` \| `Mi empresa`). Platform usa `My work` \| `Platform`. Mesmo lugar nas duas áreas e nos dois aparelhos |
| "Back to my app", "Back to app", "Open panel", "Platform" solto no rodapé | Somem. Quem troca é sempre o controle |
| Título "Platform › Today" | Título "Today". A cor âmbar e o controle já dizem a área |
| Settings como área | Avatar e nome no rodapé da barra (celular: em "More" ou no ícone atual) abrem Settings, idioma e Sign out, nas duas áreas |
| Select nativo no celular | Barra inferior também no painel |

A troca volta à última tela usada de cada área; a volta para o módulo já é assim (`homeForModules`, `ModuleSwitch.tsx:28`). Sem rota nova: as URLs ficam.

**Limpeza no mesmo PR:** só `moduleNav.ts` e os testes usam `repScreenFor`, `accountGroups`, `administrationItems`, `accountSection` e `organizationWideList`. O código ainda descreve Administration e modos que a tela já não tem.

**Risco:** baixo. `tests/module-nav.test.ts` compara os grupos e vai quebrar de propósito. Depende do dono só em aceitar a recomendação.

## Navegação final por perfil

Princípios: nome do painel aparece uma vez; item com um nome só; grupos por tarefa; nenhum item que só leia. URLs não mudam.

### Membro (vendedor, revendedor): sem painel

| Lugar | Itens |
|---|---|
| Topo | Switch Visits \| Tags, só com os dois módulos. Com um módulo, nenhum switch |
| Visits | Dashboard, Route, Companies, Visit history (hoje "Visits"; D1 de `MODULES.md`), Tasks, Sales |
| Tags | Home, Customers (só sem Visits), My pieces, Shop |
| Avatar | Settings, Install app, Sign out |
| Barra do celular | Igual à atual |

### Owner, uma empresa

Meu trabalho: igual ao membro, mais o controle de área.

| Grupo em Minha empresa | Item | De hoje |
|---|---|---|
| | Today | fica; sai o bloco Shortcuts |
| | Team | fica, só com pessoas |
| Pieces | Stock | fica |
| Pieces | Hand out | fica |
| Pieces | Team purchases | fica |
| Pieces | Pieces results | fica |
| Field | Companies, Tasks, Sales | ficam (só com Visits) |
| sai | Settings | só leitura; vira o link "Company details" no cabeçalho de Team (PT "Dados da empresa", ES "Datos de la empresa") |

Barra do celular: Today, Stock, Hand out, Team, More.

### Owner com várias empresas

Igual ao owner, com estas diferenças:

| Item | Mudança |
|---|---|
| Controle de área | `My companies` (PT `Minhas empresas`, ES `Mis empresas`) |
| Team | Fica; abre a lista das empresas, com o título "My companies" no lugar de "Organizations" |
| Team purchases | Entra no menu. Hoje o Today conta 2, mas o menu não tem o item |
| Stock, Hand out, Team purchases, Pieces results | Empresa em cada linha, e filtro "All my companies" (PT "Todas as minhas empresas", ES "Todas mis empresas") |
| Hand out | Mostra de qual empresa sai cada peça |

As abas da organização ficam neste perfil, como decidido no PR 3.

### Partner

| Grupo em Minha empresa | Item | De hoje |
|---|---|---|
| | Today | fica |
| | Team | fica |
| Make | Production, Chip writers | grupo "PRODUCTION" vira "Make" (PT "Produzir", ES "Producir") |
| Pieces | Stock, Hand out, Team purchases, Pieces results | ficam |
| Field | Companies, Tasks, Sales | ficam |
| sai | Settings | igual ao owner |

O nome do painel deixa de ser "Production" e vira "My company". Barra do celular: Today, Production, Stock, Hand out, More.

### Platform

| Grupo em Platform | Item | De hoje |
|---|---|---|
| | Today | fica; contagem corrigida (NAV-1) |
| Make | Production, Chip writers, History | saem de "MY COMPANY" |
| Pieces | Stock, Hand out, Pieces results | idem |
| Field | Companies, Tasks, Sales, Team results | idem |
| Administration (recolhível, lembra o estado) | Organizations, People, Products, Shop setup, Integrations, Brand & public site, Status, Check-in rules | hoje "PLATFORM"; o nome "Administration" já existe em `shell.ts:27` |

O título "MY COMPANY" sai do menu porque as listas mostram todas as organizações (NAV-3). Barra do celular: Today, Production, Stock, Hand out, More.

## Hand out por perfil

O corpo da tela é o mesmo nos quatro perfis. Só o que está em volta muda, e é aí que ela erra.

| | platform | partner | owner | owner-multi |
|---|---|---|---|---|
| Topo | Platform › Hand out | Production › Hand out, com o item no grupo ORGANIZATION | My company › Hand out | My company › Hand out, com duas empresas |
| Abas | Hand out, Wholesale orders, Take back | Hand out, Take back | Hand out, Take back | Hand out, Take back |
| Filtros do histórico | All resellers, All organizations | All resellers (com 1 kit) | All resellers | All resellers |
| Histórico | 8 kits, de várias organizações | 1 kit | 5 kits | 2 kits, de 2 empresas, sem dizer de qual |
| De onde saem as peças | Da Skale Club (do código), sem a tela dizer | Da empresa | Da empresa | Não diz |
| Quem recebe | "Reseller" | "Reseller" | "Reseller", mas Team chama Jessica e Omar de "Employee"; K-0004 é a própria Priya | "Reseller"; K-0006 é o próprio Tomas |

Os textos propostos estão em NAV-10.

## Achados

### NAV-1 [S1] Today da plataforma promete um número e abre outro
Telas: platform/en-desktop/panel-today, platform/en-desktop/panel-tags-overview-chipPending, platform/en-desktop/panel-tags-overview-scannedNotLive
Problema: Today diz "2 Chips to write" e a linha abre "Chips to write (7)". Diz "3 Scanned, not live" e abre "(4)". O Today conta só a Skale Club (`AdminHome.tsx:36-37`), e a lista conta todas as organizações. A tela promete "Each row opens the list behind it". Em owner-multi o Today diz 1 chip; a igualdade nos outros perfis vem das notas (ver Cobertura).
Mudança: a linha do Today leva a empresa no link, e a lista abre filtrada, com a etiqueta "Skale Club" e o link "See all organizations" (PT "Ver todas as organizações", ES "Ver todas las organizaciones"). Não trocar o número do Today.
Arquivos: client/src/pages/admin/AdminHome.tsx:36-37, client/src/pages/admin/home-model.ts:113, client/src/pages/admin/tags/OverviewTab.tsx:187-192, server/tags/routes.ts:502 (já aceita `organizationId`)
Risco: nenhuma regra muda.
Status: feito. Today da plataforma conta o que a lista abre (7 e 7 em Chips, 4 e 4 em Scanned, not live) e a lista abre com "All organizations" à vista (conferido na captura).

### NAV-2 [S1] "Scanned, not live" diz que alguém leu e mostra "Last scan: —"
Telas: platform/en-desktop/panel-tags-overview-scannedNotLive, owner/en-desktop/panel-tags-overview-scannedNotLive, platform/en-phone/panel-tags-overview-scannedNotLive
Problema: o texto é "Someone scanned these pieces in the last 7 days" e a coluna LAST SCAN está vazia nas 4 linhas. A fila conta o evento `inventory_scan`, e a coluna só conta `redirect`. No celular nem a coluna aparece. A pessoa não tem como saber se a leitura é de hoje ou de seis dias atrás.
Mudança: a lista passa a trazer a data do último `inventory_scan` e a mostrar na coluna e no card ("Scanned Oct 30", PT "Lida em 30/10", ES "Leída el 30/10"). `lastInteractionAt` continua igual nas outras telas.
Arquivos: server/tags/queues.ts:14-21, server/tags/repository.ts:70,243-247, client/src/pages/admin/tags/OverviewTab.tsx:209, client/src/pages/admin/tags/piece-table.tsx:142-146
Risco: nenhuma regra muda; só um campo novo na resposta.
Status: feito. A fila "Scanned, not live" traz a coluna "Scanned" com a data da última leitura ("Nov 1") e o cartão do celular a repete.

### NAV-3 [S1] Grupo "MY COMPANY" da plataforma mostra dados de todas as organizações
Telas: platform/en-desktop/panel-today, platform/en-desktop/panel-kits-history, platform/en-desktop/panel-tags-overview, platform/en-desktop/panel-tags-overview-chipPending
Problema: sob "MY COMPANY", Pieces results soma 415 scans e o Top pieces traz Jessica, Priya, Kevin e Sofia. Past hand-outs traz "Harbor stock to Sofia" e "For the Coastline accounts". O dono acha que olha a Skale Club e está olhando todos os clientes dele.
Mudança: tirar o título "MY COMPANY" do menu e agrupar por tarefa (seção Navegação final). Pieces results e Stock ganham a etiqueta "All organizations" (PT "Todas as organizações", ES "Todas las organizaciones") no filtro, para deixar claro o alcance.
Arquivos: client/src/components/xpot/moduleNav.ts:336-357
Risco: decisão do dono: a plataforma quer abrir na própria empresa ou em todas? Recomendo todas, com o filtro à vista, porque é o que as telas já fazem.
Status: feito. O título "MY COMPANY" saiu do menu (grupos por tarefa: Make, Pieces, Field, Administration); Stock e Pieces results mostram "All organizations" no filtro. O bloco "My company" do Today da plataforma é o que é da Skale Club (impressões), e diz isso no título.

### NAV-4 [S1] Take back não diz para qual estoque vai, e pode mudar a peça de empresa
Telas: platform/en-desktop/panel-kits-returns, platform/en-desktop/panel-kits-history, owner-multi/en-desktop/panel-kits-history
Problema: a tela só diz "company stock". Do código, não visto em tela: quando a plataforma recolhe, a peça sempre vai para a Skale Club, mesmo sendo o kit "Harbor stock to Sofia" (`routes.ts:1022`, `repository.ts:1161,1201`). No dono com duas empresas, a lista inteira vai para a empresa do primeiro código. Peças misturadas de Coastline e Lindgren acabam na mesma. A verificação prévia não barra a mistura (`repository.ts:1130-1133`).
Mudança: devolver cada peça à empresa dona dela, agrupando no servidor. O botão e a confirmação dizem o destino: "Back to Harbor Print Co. stock" (PT "Volta ao estoque de Harbor Print Co.", ES "Vuelve al stock de Harbor Print Co."). Precisa de teste em `tests/tags/custody.integration.test.ts`.
Arquivos: server/tags/routes.ts:1017-1027, server/tags/repository.ts:1152-1205, client/src/pages/admin/tags/returns-station.tsx
Risco: regra de negócio. Recomendo voltar à organização de onde o kit saiu; conferir antes a entrega entre organizações ligadas, em que a organização atual da peça pode não ser a de origem, e se algum fluxo depende de ir para a Skale Club.
Status: feito. `tag_kits.source_organization_id` (migracao 0072, aditiva, preenchida pelo lote das pecas quando nao ha duvida); regra pura `takeBackDestination` com teste de tabela e `tests/tags/takeBackOrigin.integration.test.ts`. A lista de Take back diz "Back to Harbor Print Co. stock" por peca, a confirmacao e o aviso depois dizem para onde foi. Dono de varias empresas: nunca empurra peca para empresa que nao alcanca (fica na empresa que a tem). Kit antigo sem origem mantem o destino antigo.

### NAV-5 [S3] Nome do painel repetido 6 vezes, e a moldura consome a tela
Telas: platform/en-desktop/panel-today, partner/en-desktop/panel-today, owner/en-desktop/panel-today, platform/en-phone/panel-today
Problema: em platform/Today, "Platform" está na faixa, no cartão da barra, no breadcrumb, no eyebrow, na seção e no grupo. "Today" está no menu, no breadcrumb e no título. A primeira linha de dados só começa em y≈277 no desktop. Cartão e faixa dizem a mesma coisa, um ao lado do outro.
Mudança: sai a faixa, o cartão e o eyebrow, e o breadcrumb perde a primeira palavra. Entra o controle `My work | My company` no lugar do cartão. A seção "PLATFORM" do Today vira "For the platform" (PT "Para a plataforma", ES "Para la plataforma"), e "MY COMPANY" vira "Skale Club".
Arquivos: client/src/components/xpot/AdminMode.tsx:27-37, client/src/components/xpot/AppLayout.tsx:126,305,376-384, client/src/pages/admin/AdminHome.tsx:86,121
Risco: D7. Sem isso, ao menos tirar o eyebrow e a primeira palavra do breadcrumb.
Status: feito. Sem faixa, cartão, eyebrow nem breadcrumb no painel; o controle My work | My company vem no lugar; o título é um só (barra do topo no computador, título próprio no celular).

### NAV-6 [S2] Painel inteiro de um parceiro se chama "Production"
Telas: partner/en-desktop/panel-today, partner/en-desktop/panel-kits-handout, partner/en-desktop/panel-tags-overview
Problema: aparece "Production › Hand out" e "Production › Pieces results", com esses itens sob o grupo "ORGANIZATION". Há ainda "Production" como painel, grupo e item. O dono do parceiro vende e tem equipe, e o nome diz que ele só produz. Em Today são 6 vezes.
Mudança: `panelName` usa "My company" (PT "Minha empresa", ES "Mi empresa") para o partner também. O grupo "PRODUCTION" vira "Make" (PT "Produzir", ES "Producir"). O item Production fica.
Arquivos: client/src/components/xpot/panelNames.ts:12, client/src/components/xpot/moduleNav.ts:370
Risco: nenhuma regra muda; ajustar `tests/module-nav.test.ts`.
Status: feito. O painel de quem não é a plataforma se chama My company (My companies para dono de várias); Production fica só como item do grupo Make.

### NAV-7 [S2] No celular, dentro do painel, não há Sign out, Settings nem idioma
Telas: platform/en-phone/panel-today, partner/en-phone/panel-today, owner/en-phone/panel-today, owner-multi/en-phone/panel-today
Problema: o painel no celular só tem a faixa e um select nativo. A captura `platform/en-phone/phone-nav-menu-open` mostra o select em foco, sem a lista aberta, porque lista nativa não aparece em screenshot; o tamanho dela vem do código. Para sair da conta ou trocar o idioma, a pessoa precisa adivinhar que deve tocar em "Back to my app" primeiro. Não há barra inferior, e trocar de tela exige abrir uma lista de até 19 itens (plataforma, do código).
Mudança: barra inferior no painel com 5 itens (seção Navegação final). "More" lista o resto, mais Settings, Language e Sign out. O select sai.
Arquivos: client/src/pages/admin/AdminApp.tsx:68-74, client/src/components/xpot/AppLayout.tsx:323-339,534, client/src/components/xpot/MobileTabBar.tsx
Risco: nenhuma regra muda.
Status: feito. Barra inferior no painel (Today, Production ou Team, Stock, Hand out, More); More lista o resto agrupado; o select saiu; Settings, idioma e Sign out ficam no menu do avatar.

### NAV-8 [S2] Fila de chips no celular não mostra o estado do chip
Telas: platform/en-phone/panel-tags-overview-chipPending, partner/en-phone/panel-tags-overview-chipPending, owner/en-phone/panel-tags-overview-chipPending
Problema: a tela é "Chips to write" e nenhum card diz se o chip não foi gravado, falhou ou falta conferir. No desktop há a coluna CHIP. No celular o texto só aparece quando a tabela tem a coluna `scans`, que esta fila não tem. Quem grava chip costuma estar com o celular na mão.
Mudança: o card mostra a etiqueta do chip sempre que a coluna `chip` estiver ativa. Falha sobe para o topo da lista.
Arquivos: client/src/pages/admin/tags/piece-table.tsx:207,226-230, client/src/pages/admin/tags/OverviewTab.tsx:209
Risco: nenhum.
Status: feito. O cartão do celular mostra a etiqueta do chip ("Not written", "Write failed", "Not tested") e a falha sobe para o topo.

### NAV-9 [S2] Hand out no celular: 500px de moldura antes do primeiro campo
Telas: platform/en-phone/panel-kits-handout, partner/en-phone/panel-kits-handout, owner/en-phone/panel-kits-handout, owner-multi/en-phone/panel-kits-handout
Problema: "Hand out" aparece no título, no select, no subtítulo e na aba. O campo fica em y≈518 de 844 (y≈534 na plataforma). No meio há um campo "Code or scanned link" e 3 linhas de explicação com "hand-over" e "kit", termos que o glossário tirou (D3). Os passos 2, 3 e 4 são caixas vazias que não dizem por quê.
Mudança: sai o subtítulo repetido e a seta. O texto vira "Give pieces to someone and take them back." (PT "Entregue peças a alguém e receba de volta.", ES "Entrega piezas a alguien y recíbelas de vuelta."), escondido depois da primeira entrega. Passos futuros viram uma só linha: "Next: who pays, pieces, confirm" (PT "Depois: quem paga, peças, confirmar", ES "Después: quién paga, piezas, confirmar").
Arquivos: client/src/pages/admin/tags/KitsTab.tsx:257-260, client/src/pages/admin/tags/kits-give-form.tsx:213-262, client/src/i18n/messages/adminTagsFlow.ts:50-51, client/src/pages/admin/AdminApp.tsx:68
Risco: nenhum.
Status: feito. A introdução não fala mais de kit nem de lista de separação. Os passos 2 a 4 continuam à vista, apagados, como roteiro do que vem depois do passo 1.

### NAV-10 [S2] "Reseller / Reseller" e "Ownership and cost": a mesma regra dita três vezes em jargão
Telas: platform/en-desktop/handout-form-reseller-picked, platform/en-desktop/handout-form-codes-checked, platform/en-phone/handout-form-reseller-picked
Problema: o título do passo e o rótulo do campo dizem "Reseller". "Cost rule: consignment", a frase abaixo e o card "Company-owned (consignment) (their rule)" dizem a mesma coisa. "Ownership and cost" não pergunta nada. "Can receive pieces" ocupa lugar para informar o caso normal. No celular, "(their rule)" quebra em duas linhas numa coluna à direita. O campo muda entre "Cost per piece (optional) (USD)" e "Reseller cost per piece (USD)". Placeholder e dica da nota repetem "WhatsApp order #12".

Mudança:

| Hoje | EN | PT | ES |
|---|---|---|---|
| Passo "Reseller" | Who gets the pieces? | Quem recebe as peças? | ¿Quién recibe las piezas? |
| Rótulo "Reseller" | sai (fica só para leitor de tela) | | |
| Passo "Ownership and cost" | Who pays for them? | Quem paga por elas? | ¿Quién las paga? |
| "Company-owned (consignment)" | They pay when they sell | Paga quando vender | Paga cuando venda |
| Dica | The pieces stay yours until sold. | As peças continuam suas até a venda. | Las piezas siguen siendo tuyas hasta la venta. |
| "Reseller purchase" | They buy them now | Compra agora | Compra ahora |
| Dica | The pieces become theirs today. | As peças passam a ser dele hoje. | Las piezas pasan a ser suyas hoy. |
| "(their rule)" | Usual for Kevin | O normal para Kevin | Lo habitual para Kevin |
| "Reseller cost per piece (USD)" | Price per piece (USD) | Preço por peça (USD) | Precio por pieza (USD) |

Saem as pílulas "Cost rule" e "Can receive pieces" e a frase. Os avisos de bloqueio ficam. O campo de preço só aparece em "They buy them now" ou quando a regra exige (NAV-16). A nota vai para o passo de confirmar, recolhida.
Arquivos: client/src/pages/admin/tags/kits-give-form.tsx:90-99,213-262, client/src/i18n/messages/adminTagsFlow.ts:59-78 (e blocos PT, ES), client/src/i18n/messages/manageTagsBatches.ts:116-117
Risco: `consignment` sai da tela, não do banco. "Price" no lugar de "cost" é escolha de texto: confirme com o dono.
Status: feito. "Who gets the pieces?" / "Who pays for them?", "They pay when they sell" / "They buy them now", "Usual for {name}", preco por peca; saem as pilulas e a frase de regra; nota recolhida no passo de confirmar. Dicas de "dele" trocadas por texto neutro em pt.

### NAV-11 [S2] Falta de custo só aparece no passo 4, longe do campo
Telas: platform/en-desktop/handout-form-codes-checked, platform/en-desktop/handout-from-batch, platform/en-phone/handout-form-codes-checked, platform/en-phone/handout-from-batch
Problema: "Enter the cost per piece to continue." aparece em amarelo pequeno, ao lado de um botão apagado, a cerca de 600 a 670px do campo no desktop e 1070px no celular. O passo 2 não tem marca alguma além da bolinha cinza. O cursor fica no campo de códigos. Em `handout-from-batch` o aviso já aparece sem peça nenhuma, antes de a pessoa terminar.
Mudança: erro abaixo do próprio campo do preço, com borda. No botão apagado, o texto diz o que falta e leva ao campo: "Enter the price to continue" (PT "Informe o preço para continuar", ES "Indica el precio para continuar"). O aviso só aparece com peças na lista.
Arquivos: client/src/pages/admin/tags/kits-give-form.tsx:238-246,374
Risco: nenhum.
Status: feito. Erro sob o proprio campo de preco (borda vermelha) so com pecas na lista; o botao diz "Enter the price to continue" e leva o foco ao campo.

### NAV-12 [S2] Porta do painel parece campo desabilitado, e há portas demais
Telas: owner/en-phone/tags-home, platform/en-phone/visits-dashboard, platform/en-phone/settings-profile, platform/en-phone/settings-administration, platform/en-desktop/settings-administration
Problema: no celular, a entrada é uma caixa cinza, escura e sem seta escrita "My company". Quem é dono não tem pista de que ali mora o trabalho de gestão. Em Settings há duas portas na mesma tela (rodapé e seção, ou botão no topo e linha "Platform / Open panel"), e a linha ainda abre uma subtela com mais um botão. Três toques e dois botões iguais para chegar ao mesmo lugar. "Open panel" não diz nada. "The platform, and your own company's production and stock, have their own panel." descreve a organização do software. A saída tem outro nome: "Back to my app", ou "Back to app" na tela de acesso restrito.
Mudança: o controle de D7. Sai a seção em Settings, a linha do celular e a subtela. Se D7 for adiada: texto "Manage my company" (PT "Gerenciar minha empresa", ES "Gestionar mi empresa") com seta e fundo âmbar no topo.
Arquivos: client/src/components/xpot/AdminMode.tsx:14-23, client/src/components/xpot/AppLayout.tsx:325,528, client/src/pages/xpot/XpotSettings.tsx:523-528,572, client/src/i18n/messages/workspaces.ts:19-24, client/src/i18n/messages/manage.ts:14
Risco: D7.
Status: feito. Uma só porta: o controle de área. Sai a seção Administration de Settings, a linha do celular, a subtela e o botão Open panel; ?tab=administration abre a lista (RCP-20).

### NAV-13 [S2] "Take back unsold" em peça comprada não fala de dinheiro
Telas: platform/en-desktop/panel-kits-history, owner/en-phone/panel-kits-history, owner-multi/en-desktop/panel-kits-history
Problema: 7 de 8 kits são "Reseller purchase", e a tela disse antes que "the pieces become theirs". O botão é igual ao da consignação. O servidor devolve a posse à empresa (`repository.ts:1190-1205`) sem tratar dinheiro, e a confirmação só fala em voltar ao estoque (do código; o diálogo não foi capturado).
Mudança: em kit comprado, a confirmação acrescenta: "Jessica bought these pieces. Xpot does not refund: settle the money with them." (PT "Jessica comprou estas peças. O Xpot não faz reembolso: acerte o valor com ela.", ES "Jessica compró estas piezas. Xpot no hace reembolsos: arregla el importe con ella.")
Arquivos: client/src/pages/admin/tags/kits-list.tsx:283-296, client/src/i18n/messages/manageTagsBatches.ts:153-157
Risco: regra de negócio. O dono precisa confirmar que o dinheiro é mesmo acertado fora do sistema; recomendo o aviso até haver um fluxo de reembolso.
Status: feito. Em kit comprado (Take back unsold, pecas marcadas e a tela Take back), a confirmacao acrescenta o aviso de que o Xpot nao reembolsa.

### NAV-14 [S2] Settings: "My organization", Add person repetido e "ask the platform" para o dono da plataforma
Telas: platform/en-desktop/settings-administration, platform/en-phone/settings-profile
Problema: o glossário fechou "My company" para o dono, e a seção diz "My organization". O formulário Add person é o mesmo de Team. "To change it, ask the platform." é mostrado a Marcus, que é a plataforma.
Mudança: título "My company" (PT "Minha empresa", ES "Mi empresa"). Sai o formulário, e fica o link "Manage team" (PT "Gerenciar equipe", ES "Gestionar equipo"). Para o admin, o telefone abre o editor de People. Se isso não existir, o texto vira "Change it in People" (PT "Altere em Pessoas", ES "Cámbialo en Personas").
Arquivos: client/src/i18n/messages/addPerson.ts:22,49,73, client/src/pages/xpot/XpotSettings.tsx:437-458, client/src/i18n/messages/navIa.ts:29
Risco: conferir se quem vende sozinho, sem painel, usa esse Add person para convidar o primeiro colega (`profiles.ts:6-7`). Se usa, mantenha o formulário só para ele.
Status: feito. Seção My company; o formulário Add person só aparece para quem vende sozinho (para quem tem equipe, o link Manage team); o admin da plataforma vê o link Change it in People em vez de ask the platform.

### NAV-15 [S2] Dono com várias empresas: menu não bate com o Today, e nada diz qual é a empresa
Telas: owner-multi/en-desktop/panel-today, owner-multi/en-desktop/organizations, owner-multi/en-desktop/panel-kits-handout, owner-multi/en-desktop/panel-kits-history, owner-multi/en-desktop/panel-tags-overview-chipPending
Problema: Today mostra "2 Team purchases" e o menu não tem esse item. "Team" acende numa tela chamada "Organizations", sob "My company" no singular, com duas empresas. Em Hand out, K-0006 e K-0003 aparecem sem empresa, e só há o filtro All resellers. A plataforma tem All organizations.
Mudança: ver a seção Navegação final, "Owner com várias empresas". O filtro de organização passa a valer para quem administra mais de uma.
Arquivos: client/src/components/xpot/moduleNav.ts:351-366, client/src/pages/admin/tags/KitsTab.tsx:155-158,189-197, client/src/pages/admin/tags/kits-list.tsx:248
Risco: nenhuma regra muda; o servidor já limita ao que a pessoa administra.
Status: feito (nomes) | pendente (listas). O item Team vira My companies e abre a lista; o painel se chama My companies. Pendente: o item Team purchases (não existe lista entre empresas) e a empresa em cada linha com filtro "All my companies": precisa do nome da organização na lista de peças (campo novo do servidor).

### NAV-16 [S2] "A cost here is for reference" é falso quando a regra é "they buy"
Telas: platform/en-desktop/handout-form-codes-checked, platform/en-phone/handout-form-codes-checked
Problema: com Jessica, o card "Company-owned" diz que o custo é só referência. Ao escolhê-lo, o custo continua obrigatório (`shared/tagKits.ts:26`). "Required for a purchase, or under this reseller's cost rule." explica a regra em tom de contrato. Do código; este estado não foi capturado.
Mudança: quando a regra exigir, o card diz "Jessica's rule requires a price." (PT "A regra de Jessica exige um preço.", ES "La regla de Jessica exige un precio."), usando o nome da pessoa. Sem outra dica no campo.
Arquivos: client/src/pages/admin/tags/kits-give-form.tsx:142,233,240, client/src/i18n/messages/adminTagsFlow.ts:75,77
Risco: regra de negócio mantida; só o texto muda.
Status: feito. O card da regra diz "{name}'s rule requires a price." e o campo nao repete dica.

### NAV-17 [S2] Filas: nome antigo, sem ação e sem saber o que fazer
Telas: platform/en-desktop/panel-tags-overview-chipPending, platform/en-desktop/panel-tags-overview-scannedNotLive, platform/en-desktop/panel-tags-overview-noProduct, owner/en-phone/panel-tags-overview-scannedNotLive
Problema: a volta é "‹ Overview", mas a tela se chama "Pieces results". Quem veio do Today cai em outro lugar. O título no topo é "Pieces results", e o título real fica só no card. No celular há duas voltas seguidas (seta e "Overview"). Nenhuma fila diz o que fazer. "C5BC2H74" está em "Chips to write" com "Chip written" em amarelo. "live" e "catalog product" são jargão.

Mudança: a volta vai ao Today e se chama "Today". O título é o nome da fila. Cada fila ganha uma frase de ação.

| Fila | EN | PT | ES |
|---|---|---|---|
| Chips to write | Tap a piece to write or check its chip. | Toque na peça para gravar ou conferir o chip. | Toca la pieza para grabar o comprobar el chip. |
| Scanned, not live → Scanned but not working | Someone tried these. Set them up so they open a page. | Alguém tentou usar. Configure para abrirem uma página. | Alguien intentó usarlas. Configúralas para que abran una página. |
| No catalog product → Missing a product | Choose a product for these pieces so they can be sold. | Escolha um produto para poder vender estas peças. | Elige un producto para poder vender estas piezas. |
| "Chip written" nesta fila | Written, not checked | Gravado, falta conferir | Grabado, falta comprobar |

Arquivos: client/src/pages/admin/tags/OverviewTab.tsx:196-199, client/src/i18n/messages/adminTagsFlow.ts:128-135, client/src/i18n/messages/tags.ts:135, client/src/pages/admin/AdminApp.tsx:64
Risco: `tags.ts:135` é usado em outras telas; mudar só na fila ou conferir as demais.
Status: feito. A volta se chama "Today", o título da tela é o nome da fila, cada fila tem sua frase de ação e o chip da fila diz "Not written" / "Not tested". Os nomes "Scanned but not working" e "Missing a product" não foram aplicados: o Today usa os nomes antigos e os dois precisam bater.

### NAV-18 [S3] Take back tem título de outra tela e três instruções iguais
Telas: platform/en-desktop/panel-kits-returns, partner/en-desktop/panel-kits-returns, owner/en-phone/panel-kits-returns, platform/en-phone/panel-kits-returns
Problema: título e select dizem "Hand out", com a aba Take back ligada. A intro geral, a frase da aba e o vazio dizem quase o mesmo. O botão aparece apagado sem explicar, e há um retângulo escuro atrás dele, visível no desktop e no celular.
Mudança: título "Take back" nesta aba. Fica só "Scan each piece they hand back. Pieces already sold or set up for a customer can't come back." (PT "Leia cada peça devolvida. Peças vendidas ou configuradas para um cliente não voltam.", ES "Lee cada pieza devuelta. Las piezas vendidas o configuradas para un cliente no vuelven."). O botão só aparece com peça na lista. O fundo do `sticky` sai no desktop.
Arquivos: client/src/pages/admin/tags/returns-station.tsx:69,90, client/src/pages/admin/tags/KitsTab.tsx:257-260, client/src/i18n/messages/adminTagsFlow.ts:19,115
Risco: nenhum.
Status: feito. O título é o do frame; fica só a frase Scan each piece they hand back...; o botão só existe com peça na lista; sem fundo atrás dele no computador.

### NAV-19 [S2] Wholesale orders: dois campos para a mesma lista, SKU cru e "Complete separation"
Telas: platform/en-desktop/panel-kits-orders, platform/en-phone/panel-kits-orders
Problema: cada pedido tem um campo com Add, Use camera e uma caixa de texto para os mesmos códigos. "plate-large · 10" é um código interno. "Complete separation" não diz que as peças passam para a pessoa. "10 pieces expected" em âmbar em todos os cards parece problema, e é o normal. São 2118px no celular para 4 pedidos.
Mudança: cards recolhidos, abre um por vez. Um só campo, com a lista abaixo, como em Hand out. "Large Plate × 10" no lugar do SKU. Botão "Give 10 pieces to Jessica" (PT "Entregar 10 peças a Jessica", ES "Entregar 10 piezas a Jessica"). Etiqueta neutra.
Arquivos: client/src/pages/admin/tags/KitsTab.tsx:112-145, client/src/i18n/messages/manageTagsBatches.ts:98-103
Risco: o SKU precisa de mapeamento para nome de produto; sem ele, manter o SKU como fallback.
Status: feito. Cartoes recolhidos (um aberto por vez; pedido unico abre sozinho), um campo so com a lista conferida como em Hand out, "Large Plate × 10" no lugar do SKU (nome do produto vem do servidor), botao "Give 10 pieces to Jessica", etiqueta ambar removida.

### NAV-20 [S2] "Pieces results" só mostra leituras, e números se repetem
Telas: platform/en-desktop/panel-tags-overview, owner/en-desktop/panel-tags-overview, partner/en-desktop/panel-tags-overview, owner-multi/en-desktop/panel-tags-overview
Problema: 415 e 393 aparecem duas vezes em dois blocos seguidos (336/316, 17/17, 22/22 nos outros perfis). O bloco "Scans by piece" mostra totais, não peças. Não há venda nem peça ativa no que se chama "results". "Est. visitors" vem com "Per piece, per day; not people", e o nome diz pessoas. Há duas notas de definição. "5 scans while not live" é um número solto sem link.
Mudança: fica um bloco só, com período e filtros: Scans, QR, NFC. Sai "Est. visitors" da linha principal. O título vira "Scans" e o Top pieces sobe para logo abaixo do gráfico. Uma só nota: "A scan is someone opening the page of a piece. Bots are left out." (PT "Leitura é alguém abrindo a página de uma peça. Robôs ficam de fora.", ES "Una lectura es alguien abriendo la página de una pieza. Los robots quedan fuera."). "5 scans while not live" vira link para a fila. Filtros recolhidos atrás de "Filter" (PT "Filtrar", ES "Filtrar"), e somem os filtros com uma opção só.
Arquivos: client/src/pages/admin/tags/OverviewTab.tsx:51-67,83, client/src/pages/admin/tags/pieces-analytics.tsx, client/src/i18n/messages/adminTagsFlow.ts:148-149, client/src/i18n/messages/manageTags.ts:141-142
Risco: decisão do dono: incluir vendas e peças ativas aqui? Recomendo renomear para "Scans" (o glossário fechou "Pieces results": precisa reabrir) até haver dado de venda nesta tela.
Status: feito. Um bloco de leituras com uma só nota; os filtros ficam atrás de "Filter" e só aparecem os que têm mais de uma opção; "5 scans while not live" leva à fila. O título continua "Pieces results" (o glossário fechou esse nome); incluir vendas e peças ativas ficou sem decisão.

### NAV-21 [S3] Atividade: mesma peça com dois títulos, e lista tomada por repetição
Telas: platform/en-desktop/panel-tags-overview, owner/en-desktop/panel-tags-overview, partner/en-desktop/panel-tags-overview, owner-multi/en-desktop/panel-tags-overview
Problema: "East Boston Bike Works" e "F3G1VTJK" são a mesma peça, em duas linhas seguidas. Na plataforma, 12 de 12 linhas são configuração, e nenhuma das 49 leituras de hoje aparece. No parceiro e no dono com várias empresas, são 9 a 10 linhas iguais de "Opened destination". URL crua com `placeid`.
Mudança: sempre o nome da empresa como título, código como detalhe. Agrupar: "East Boston Bike Works: 10 scans, last Nov 1" (PT "10 leituras, última em 1/11", ES "10 lecturas, última el 1/11"). A URL fica recolhida na peça. Limite de 5 linhas, com "See all" (PT "Ver tudo", ES "Ver todo").
Arquivos: client/src/pages/admin/tags/OverviewTab.tsx:106-183
Risco: nenhum.
Status: feito. Mudança de destino traz o nome do cliente como título (o mesmo da linha "Went live"), leituras de uma peça são uma linha e são 5 linhas antes de "See all". A URL nova continua na linha da mudança de destino, porque é o que mudou.

### NAV-22 [S3] Top pieces: texto sobreposto no celular, e formato desperdiçado no desktop
Telas: platform/en-phone/panel-tags-overview, partner/en-phone/panel-tags-overview, owner/en-phone/panel-tags-overview, platform/en-desktop/panel-tags-overview
Problema: no celular, o nome da peça passa por cima de "QR 102 · NFC 54". Datas e "Apply" encostam na borda do card. No desktop, Devices ocupa de 300px (owner) a 470px (platform) de altura com 3 linhas.
Mudança: no celular, o "QR · NFC" vai para a linha de baixo, com o nome truncado. Datas ficam em linha própria, e Apply só aparece com datas preenchidas. Devices usa altura própria (`items-start`).
Arquivos: client/src/pages/admin/tags/pieces-analytics.tsx:179,205-219, client/src/components/xpot/TagProductThumbnail.tsx:180-184
Risco: nenhum.
Status: feito. O código e o QR/NFC não se sobrepõem no celular, Apply só aparece com data inicial, Devices tem altura própria. Resta o detalhe 3 scans cortado em Activity quando a linha é estreita.

### NAV-23 [S3] Today: tudo com o mesmo peso, e atalhos que repetem o menu
Telas: platform/en-desktop/panel-today, partner/en-desktop/panel-today, owner/en-phone/panel-today
Problema: "2 Failed prints" e "3 Ready to print" têm o mesmo número âmbar. A falha vem depois da rotina. SHORTCUTS leva a Team, Stock e Hand out, que estão a 300px no menu, com a frase "Manage the people and operations you are authorized to access.". Stock tem ícone de caixa no atalho e de ondas no menu.
Mudança: falhas no topo, em vermelho (Failed prints, Print files stuck, Write failed); rotina em branco. Sai o bloco Shortcuts no desktop. No celular, a barra inferior cobre os atalhos.
Arquivos: client/src/pages/admin/AdminHome.tsx:92,123-129, client/src/pages/admin/home-model.ts:97-105
Risco: nenhum.
Status: feito. Falhas (Print files stuck, Failed prints) primeiro e em vermelho, a rotina em branco; o bloco Shortcuts saiu (a barra inferior e o menu cobrem). Write failed não existe como fila no servidor.

### NAV-24 [S2] "Company" significa duas empresas na mesma linha
Telas: platform/en-desktop/panel-tags-overview-chipPending, owner/en-desktop/panel-tags-overview-scannedNotLive, platform/en-desktop/panel-tags-overview
Problema: na coluna COMPANY está "Seaport Coworking", que é o cliente. Ao lado, na coluna RESELLER, está "Company stock", que é a empresa do usuário. Em cima, "My company". O filtro "All companies" fala do cliente. Além disso, a D4 fechou "Clientes" em Tags. "In company stock" e "Company stock" repetem a mesma informação na linha.
Mudança: nas telas de Tags do painel, coluna "Customer" (PT "Cliente", ES "Cliente"), filtro "All customers" (PT "Todos os clientes", ES "Todos los clientes"). A coluna RESELLER fica vazia quando a peça está no estoque. "Companies" fica só para a tela de Visits.
Arquivos: client/src/i18n/messages/manageTags.ts:85,160, client/src/i18n/messages/manageTagsPieces.ts:13,16-17, client/src/pages/admin/tags/piece-table.tsx:115,207
Risco: confirme com quem audita Estoque; a mudança atinge a mesma tabela.
Status: feito. Coluna "Customer" e filtro "All customers"; a coluna de quem guarda a peça se chama "With" e diz "Company stock" quando é do estoque da empresa.

### NAV-25 [S3] Barra lateral da plataforma: item cortado e ícones que confundem
Telas: platform/en-desktop/sidebar-both-sections-open, platform/en-desktop/sidebar-collapsed-default
Problema: com PLATFORM aberto a 900px, só "Organizations" aparece, cortado pelo rodapé, sem sinal de que há mais 7 itens. PLATFORM começa fechado, embora seja o nome do painel. Team results tem o ícone de Today. Chip writers tem o escudo do painel. History tem o ícone de rota. Stock tem ondas de NFC, e o atalho e a aba usam caixa.
Mudança: grupos da Navegação final, com o estado lembrado. Sombra no fim da lista quando houver rolagem. Ícones únicos: Team results `BarChart3`, Chip writers `Nfc`, History `History`, Stock `Package`.
Arquivos: client/src/components/xpot/moduleNav.ts:236-241,322,342-346, client/src/components/xpot/AppLayout.tsx:309
Risco: nenhum.
Status: feito. Grupos por tarefa, Administration recolhida e lembrada, sombra no fim da lista quando há mais abaixo, ícones únicos (Package, Nfc, History, TrendingUp, Network).

### NAV-26 [S3] Busca: "Visits" ao lado de "Visit", e entrada do painel escondida
Telas: platform/en-desktop/command-palette, rep-both/en-desktop/command-palette, reseller/en-desktop/command-palette
Problema: "Visits" e "Visit" aparecem um depois do outro. "Shop" fica cortado. O grupo SETTINGS tem um item, Settings. O rodapé diz "Shortcuts: / search", sem explicar. No modo trabalho, a entrada do painel fica no fim, abaixo da dobra. Do código: dentro do painel, a busca de peças continua usando `?mine=1`, e só acha as peças da própria pessoa. Na barra do topo do painel há ainda o campo "Code or scanned link" ao lado de "Search".
Mudança: "Visit" vira "Current visit" (PT "Visita atual", ES "Visita actual"). Sem título para grupo de um item. Sem o trecho "Shortcuts". Painel listado primeiro. No painel, a busca consulta todas as peças da empresa, e "Code or scanned link" passa a ser parte dela.
Arquivos: client/src/components/xpot/CommandPalette.tsx:72-77,217, client/src/components/xpot/moduleNav.ts:383-387, client/src/components/xpot/AppLayout.tsx:122-124, client/src/pages/admin/AdminApp.tsx:67,73
Risco: a busca na empresa pode precisar de limite por tamanho da lista.
Status: feito (quase tudo). Current visit, grupos de um item sem título, atalhos só quando há mais que a busca, entrada do painel em primeiro lugar, e a busca de peças no painel pesquisa as da empresa. Pendente: o campo Code or scanned link continua separado da busca (saiu de Hand out e Take back; fica em Stock).

### NAV-27 [S4] Moldura do trabalho: switch de um item e logo solto
Telas: reseller/en-desktop/tags-home, reseller/en-phone/tags-home, platform/en-desktop/settings-administration
Problema: revendedor no desktop vê um botão grande "Tags" que não troca nada. No celular, o logo fica solto entre a saudação e o botão, e só esse perfil tem logo. Em Settings o switch aparece sem nada selecionado, sob "MY WORK".
Mudança: `SidebarModuleSwitch` não aparece com um módulo. Sai o logo do `mobileHeader`. Em Settings, a barra lista só o módulo em que a pessoa estava.
Arquivos: client/src/components/xpot/AppLayout.tsx:177,304-305, client/src/pages/tags/TagsApp.tsx:65-69
Risco: nenhum.
Status: feito. O seletor de módulos só aparece com dois módulos, o logo saiu do celular, e Settings lista o módulo em que a pessoa estava.

### NAV-28 [S3] Página da empresa repete o menu e abre destinos diferentes com o mesmo nome
Telas: owner/en-desktop/org-brightside-team, owner/en-desktop/org-brightside-inventory, owner/en-desktop/org-brightside-settings, owner/en-phone/org-brightside-team, partner/en-desktop/org-harbor-settings
Problema: abas Overview, Team, Stock, Kits, Team purchases, Companies e Settings repetem o menu ao lado. "Stock" no menu abre uma tela com filtros. A aba abre uma lista simples, sem filtros, e nenhum item do menu fica aceso nela. As duas ainda se contradizem: 013VW8NC é "Sold" no menu e "Ready, not live" na aba; 0XBAXB57 é "Sold · Live" no menu e "Live" na aba. Em `partner/org-harbor-settings`, a tela só de leitura ainda mostra os links "Select all" e "Clear", cita "Stuscle" e diz "Only the platform changes this." e "Only an Xpot admin changes this.": dois nomes para quem decide. "Kits" contraria D3, e o menu diz "Hand out". O item Settings abre uma tela só de leitura ("Only the platform can edit organization settings."). O breadcrumb diz o nome da empresa, não Team. No celular, a tela não tem select nem abas: a única saída é a seta.
Mudança: dono de uma empresa só: Team abre só a equipe, sem abas, com o link "Company details". As abas ficam para a plataforma e para quem tem várias empresas, como o PR 3 decidiu, com "Kits" trocado por "Past hand-outs" (PT e ES "Entregas anteriores"). No celular, a barra inferior vale aqui também.
Arquivos: client/src/pages/xpot/OrganizationsPage.tsx:292-300,316,328-340, client/src/i18n/messages/organizations.ts:25,55, client/src/components/xpot/moduleNav.ts:361-366
Risco: confirmar o caso do PR 3, "dono só com Tags vê as empresas": ele precisa manter a aba Companies, pois o menu dele não tem o item.
Status: feito. Dono de uma empresa só: sem abas (Team, Team purchases e Company details), "Kits" virou "Past hand-outs"; a aba Settings só existe para quem edita ou para parceiro que imprime. A plataforma e o dono de várias empresas mantêm as abas, como o PR 3 decidiu.

### NAV-29 [S2] Histórico no celular: botões sem nome, nota cortada
Telas: platform/en-phone/panel-kits-history, partner/en-phone/panel-kits-history, owner/en-phone/panel-kits-history, owner-multi/en-phone/panel-kits-history
Problema: "Packing list" e "Take back unsold" viram dois ícones sem texto. Um deles tira peças do revendedor. "$8.00 eac..." corta o preço e esconde a nota. "All organiza..." corta o filtro. Com um kit só, há um filtro para uma pessoa.
Mudança: texto nos botões, em linha própria, ou um menu "⋯" com nomes. Preço e nota em linhas separadas. Filtro só com mais de um revendedor.
Arquivos: client/src/pages/admin/tags/kits-list.tsx:248-277, client/src/pages/admin/tags/KitsTab.tsx:178-197
Risco: nenhum.
Status: feito. "Packing list" e "Take back unsold" têm texto, em linha própria; preço e nota quebram linha; o filtro de revendedor só aparece com mais de um. Visto no celular.

### NAV-30 [S4] Sem acesso a Wholesale orders: cai em Hand out sem dizer nada
Telas: partner/en-desktop/panel-kits-orders-denied, owner/en-desktop/panel-kits-orders-denied, owner-multi/en-desktop/panel-kits-orders-denied
Problema: a URL de pedidos abre Hand out em silêncio. Só acontece por link direto.
Mudança: manter o redirecionamento e mostrar um aviso curto: "Wholesale orders are handled by the platform. Yours are in Team purchases." (PT "Os pedidos de atacado ficam com a plataforma. Os seus estão em Compras da equipe.", ES "Los pedidos mayoristas los gestiona la plataforma. Los tuyos están en Compras del equipo.").
Arquivos: client/src/pages/admin/tags/KitsTab.tsx:250
Risco: nenhum.
Status: feito. Avisa com Wholesale orders are handled by the platform. Yours are in Team purchases.

### NAV-31 [S3] Acesso restrito diz ao dono que ele não tem acesso à gestão
Telas: owner/en-desktop/panel-team-results-owner
Problema: dono em `/admin/overview` lê "You don't have access to management." e "Back to app". Ele tem painel, só não tem esta tela. A moldura some, e seta e botão fazem o mesmo. Só por URL.
Mudança: dentro do painel, com moldura, o texto vira "Only the platform can open this screen." (PT "Só a plataforma abre esta tela.", ES "Solo la plataforma abre esta pantalla."), com o botão "Today" (PT "Hoje", ES "Hoy"). Para quem não tem painel, o texto vira "This area is for company owners." (PT "Esta área é para donos de empresa.", ES "Esta área es para dueños de empresa.").
Arquivos: client/src/pages/admin/AdminApp.tsx:56-60, client/src/i18n/messages/manage.ts:11-14
Risco: nenhum.
Status: feito. Dentro do painel o texto é Only the platform can open this screen. com o botão Today; para quem não tem painel, This area is for company owners.

### NAV-32 [S3] Dois campos de código na mesma tela
Telas: platform/en-desktop/panel-kits-returns, partner/en-phone/panel-kits-returns, platform/en-phone/handout-form-codes-checked
Problema: em Hand out e Take back há "Code or scanned link" no topo e "Scan, type or paste codes" na tarefa. Quem lê a peça no campo de cima abre a peça e perde a lista. No celular, isso ainda empurra o trabalho 56px para baixo.
Mudança: "Code or scanned link" sai de Hand out e Take back. Fica em Stock e na busca (NAV-26). Em Hand out, a aba "Type or paste" sai, pois o campo de "Scan" já aceita os três modos; ficam "Scan" e "Next from a batch".
Arquivos: client/src/pages/admin/AdminApp.tsx:65-67,73, client/src/pages/admin/tags/kits-give-form.tsx:262-280
Risco: nenhum; conferir se a aba Type tem cola de várias linhas que o campo único não aceita.
Status: feito. A aba "Type or paste" saiu de Hand out: o campo de Scan aceita digitar e colar várias linhas (separadas por linha, vírgula ou ponto e vírgula), então ficam "Scan" e "Next from a batch".

### NAV-33 [S3] "Take back" tem sentido oposto em espanhol
Telas: platform/es-desktop/panel-kits-handout
Problema: EN "Take back" e PT "Recolher" (do dicionário) são ações de quem recebe. ES "Devolver" é ação de quem entrega. A aba na tela de quem recolhe diz o contrário.
Mudança: ES "Recoger".
Arquivos: client/src/i18n/messages/adminTagsFlow.ts:460
Risco: nenhum.
Status: feito. ES Recoger, também no botão Recoger N piezas.

### NAV-34 [S4] Pílula azul cortada no topo do celular
Telas: platform/en-phone/handout-form-codes-checked, platform/en-phone/handout-from-batch
Problema: há um retângulo azul cortado acima da faixa. Coincide com o link "Skip to content" em transição (`-translate-y-24` com `transition-transform`), e não aparece nas capturas sem interação. Pode ser artefato da captura. Para quem usa teclado físico, ele pode aparecer de verdade.
Mudança: conferir no aparelho. Se ocorrer, usar `-translate-y-full` e sem transição fora do foco.
Arquivos: client/src/components/xpot/AppLayout.tsx:505-510
Risco: nenhum.
Status: feito. O link Skip to content usa sr-only e só aparece no foco; o retângulo não foi reproduzido nas capturas.

### NAV-35 [S1] A mesma peça tem status diferente nas duas telas chamadas Stock
Telas: owner/en-desktop/panel-stock, owner/en-desktop/org-brightside-inventory
Problema: 013VW8NC é "Sold" no menu Stock e "Ready, not live" na aba Stock. 0XBAXB57 é "Sold · Live" e "Live". B890X9SR é "With a reseller" e "Ready, not live". H6B5V7G6 é "With a reseller" e "No customer yet". A aba mostra o estado do cadastro, e o menu mostra onde a peça está. O dono vê duas respostas para a mesma pergunta, com o mesmo título.
Mudança: a aba Stock da organização usa a mesma etiqueta do menu (`WherePill`), ou some para quem tem uma empresa só (NAV-28).
Arquivos: client/src/pages/xpot/OrganizationsPage.tsx:294, client/src/pages/admin/tags/piece-table.tsx
Risco: nenhuma regra muda.
Status: feito. A aba Stock da organização usa a mesma etiqueta de status do menu (`PieceStatusPill`), com a contagem por status no topo.

## Plano sugerido

| PR | Conteúdo | Tam. | Risco |
|---|---|---|---|
| A | Dados: NAV-1, NAV-2, NAV-4, NAV-35 | M | Médio, NAV-4 é regra |
| B | Moldura D7: NAV-5, 6, 7, 12, 14, 25, 27, 28, 31 e limpeza de `moduleNav.ts` | M | Baixo |
| C | Hand out: NAV-9, 10, 11, 13, 15, 16, 18, 19, 29, 30, 32, 33 | M | Baixo |
| D | Resultados e filas: NAV-3, 8, 17, 20, 21, 22, 23, 24, 26 | M | Baixo |
