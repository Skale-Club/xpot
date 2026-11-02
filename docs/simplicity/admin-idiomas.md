# Auditoria visual: admin-idiomas

Rodada r0. Prefixos: `AD` para as telas de admin, `ID` para idiomas. Caminhos de código relativos a `client/src`, salvo os que começam com `server/`, `shared/`, `docs/` ou `.lab/`.

Como as imagens foram vistas: as telas de en foram abertas inteiras, em recorte da área de conteúdo ou em folhas com até 5 capturas lado a lado. As folhas cortam em 1950 px no celular e 1300 px no desktop. As páginas longas de pessoa foram abertas à parte, pelo painel. 19 capturas são idênticas, byte a byte, a outras já abertas. As cinco abas `settings-*` do desktop são a mesma imagem em cada perfil, então a captura não mostra as abas separadas. Uma varredura dos dicionários em `i18n/messages` completou a parte de idiomas.

## Telas e notas

Notas das telas `org-*` valem para os quatro perfis, salvo onde a linha diz o contrário.

| Tela | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| people | Aprovar quem espera e achar uma pessoa | 7 | Mostrar a empresa de cada um (AD-07), tirar "Active" repetido (AD-28), celular (AD-29) |
| people-search, people-module-tags | Achar uma pessoa | 7 | Idem |
| people-status-active/pending/blocked/refused | Ver só aquele grupo | 7 | Idem |
| person-new-dialog | Criar acesso | 5 | Um só formulário de pessoa, com a empresa (AD-15) |
| person-owner, -partner, -owner-multi, -rep-both, -omar, -sofia, -nora2 | Acesso, papel e empresa da pessoa | 4 | "Rep" para dono (AD-07), números cortados (AD-08), regra de custo legível (AD-10), Xphere recolhido |
| person-reseller | Pode vender? Quanto vendeu? | 4 | Idem |
| person-platform | Conferir o próprio acesso | 5 | Tirar o que não se aplica ao admin (AD-17) |
| person-pending | Aprovar ou recusar | 3 | Contradição dos módulos (AD-02), só o que serve para decidir (AD-17) |
| person-blocked | Ver por que e desbloquear | 5 | Blocked/Suspended (AD-14), tirar regra de custo (AD-17) |
| person-refused | Confirmar a recusa ou reconsiderar | 4 | Verbo do botão (AD-09), tirar Xphere e custo (AD-17) |
| organizations (platform) | Abrir ou criar uma organização | 5 | Formulário recolhido, Seller/Producer/Partner (AD-13) |
| organizations-new-dialog | Criar parceiro | 6 | Nomes de modelo legíveis (ID-05), busca (AD-33) |
| organizations (owner, partner) | Entrar direto na empresa | 7 | Celular sem Visão geral no menu (AD-06) |
| organizations (owner-multi) | Escolher entre as duas empresas | 6 | Item "Team" abre lista de organizações (AD-06) |
| org-*-overview | Como vai a equipe | 4 | Números errados em multi-empresa (AD-01), "Stock" e zero verde (AD-22) |
| org-*-team | Quem está na equipe | 5 | Lista antes do formulário (AD-12), ações explicadas (AD-14) |
| org-*-inventory | Quanto tenho e em que estado | 4 | Resumo em vez de lista crua (AD-21) |
| org-*-kits | O que foi entregue e a quem | 5 | Nome da aba (AD-06), quantidade de peças (AD-21) |
| org-*-purchases | O que a equipe comprou | 3 | SKU cru (AD-11) |
| org-*-customers | Quais empresas a equipe atende | 5 | Busca e limite (AD-21) |
| org-*-settings (owner) | Nada: só leitura | 2 | Tirar a aba (AD-19) |
| org-harbor-settings (partner) | Ver o que pode imprimir | 3 | Controles falsos e contradição (AD-05) |
| org-*-settings (platform) | Configurar a organização | 6 | Rótulos em português claro (ID-10, ID-13) |
| org-*-person | O que esta pessoa faz | 8 | Pouco: rótulo do nome no topo |
| integrations-services | Ligar um serviço | 6 | Linguagem dos cartões; é tela técnica por natureza |
| integrations-xphere | Conectar uma pessoa ao CRM | 2 | Tabela no lugar de cartões gigantes (AD-04, AD-16) |
| integrations-assistants | Conectar uma IA | 4 | Linguagem (AD-24) |
| brand-identity | Trocar logo e ícone | 6 | Aviso do logo claro (AD-25) |
| brand-installed-app | Cores do app instalado | 7 | Termos mais simples |
| landing-editor | Mudar o texto do site | 4 | Frases em pedaços, prévia do rascunho (AD-18) |
| status | Está tudo funcionando? | 4 | Contradição (AD-03), repetição (AD-23) |
| status-event-1/2/3 | O que houve e o que fazer | 5 | Bloco inútil, sem próximo passo (AD-23) |
| settings-* (desktop, cinco abas idênticas) | Meus dados e idioma | 5 | "Open panel" (AD-20), multi-empresa (AD-30) |
| settings-* (celular) | Idem, por seção | 7 | "My organiza…" cortado (AD-27), tela de um botão só (AD-20) |

Idiomas, nota da tradução, não da tela:

| Tela | pt | es | O que falta para 9 |
|---|---|---|---|
| panel-today | 9 | 9 | Nada relevante |
| panel-stock | 7 | 7 | Coluna cortada (ID-08) |
| piece-popup (live, houseAvailable, withReseller, soldLive, lost) | 6 | 6 | "Em estoque" com revendedor (ID-01), CHAPA (ID-03) |
| production-board, -queue, -job | 5 | 5 | Fatiado (ID-02), texto de pausa (ID-04), cores cruas (ID-06) |
| panel-kits-handout | 8 | 7 | "Devolver" (ID-09), "(regra dele)" (ID-12) |
| tags-home | 8 | 9 | Eixo cortado (ID-18) |
| tags-pieces | 6 | 8 | "Peça peças" (ID-11), rótulo duplo (ID-21) |
| tags-shop | 4 | 4 | Conteúdo só em inglês (ID-07) |
| settings | 6 | 7 | Dica contraditória (ID-14), glossário (ID-15) |

## S1

### AD-01 [S1] Multi-empresa: a Visão geral soma o dono inteiro em cada empresa
Telas: owner-multi/en-desktop/org-lindgren-overview, org-coastline-overview; owner-multi/en-phone/org-lindgren-overview, org-lindgren-person; platform/en-desktop/org-coastline-overview, org-lindgren-overview
Problema: Coastline e Lindgren mostram os mesmos números: "Visits 8 · Finished visits 8 · Sales 1 · $399.00". Conferi no banco do laboratório: as 8 visitas e a venda de $399 do Tomas são de empresas da Coastline (Chelsea Taqueria), e mesmo assim entram na Lindgren. A venda de $149 do Kevin, em Malden Hardware, que é da Lindgren, fica de fora, embora a página do Kevin na mesma empresa diga "4 Visits, 1 Sales". O dono lê um faturamento que não é daquela empresa.
Mudança: filtrar visitas e vendas pela organização da empresa visitada ou vendida (`sales_leads.organization_id`), não pela lista de pessoas. O total passa a bater com as páginas das pessoas.
Arquivos: server/routes/xpot/teamActivity.ts:1-3,28; server/routes/xpot/organizations.ts:223-231
Risco: regra de negócio. Recomendo contar pela organização da empresa. Afeta só quem está em mais de uma organização, ou quem atende empresa de outra. A exclusão do Kevin vem da regra "só quem usa Visits conta"; ele ter visitas sendo só de Tags é coisa do seed, mas a regra esconde vendas reais se isso acontecer em produção.

### AD-02 [S1] Pessoa pendente: o topo diz "Visits · Tags" e os módulos estão desmarcados
Telas: platform/en-desktop/person-pending, platform/en-phone/person-pending
Problema: abaixo do nome aparece "Waiting for approval · Rep · Visits · Tags". Em "Role and modules", as duas caixas estão vazias, com "Choose at least one module." Quem aprova não sabe o que a pessoa terá.
Mudança: na pessoa pendente, tirar os módulos da linha de pills e deixar só as caixas. `PersonPills` não mostra módulos quando `rep.access === "pending"`.
Arquivos: pages/admin/PersonDetail.tsx:154-166
Risco: nenhum.

### AD-03 [S1] Status: alarme vermelho por um serviço que só não foi configurado
Telas: platform/en-desktop/status, platform/en-phone/status, platform/pt-desktop/status, platform/es-desktop/status
Problema: o topo diz "Something is down / Because of: Background prospecting", em vermelho. Na tabela logo abaixo, "Prospecting engine" está "Off, Not set up", em cinza, igual a outros 13 serviços. Mais abaixo o mesmo serviço está "Down", enquanto "Recent searches" diz "100% ok" e a fila diz "Done 24h: 2". Nomes diferentes (engine, background prospecting) e três estados para uma coisa só.
Mudança: `engine_not_configured` deixa de ser `down` e passa a um veredito novo, `off`. Topo em âmbar: en "Prospecting is not set up", pt "A prospecção não está configurada", es "La prospección no está configurada", mantendo o "What to do". Vermelho só para o que estava ligado e parou. Um nome só: en "Prospecting", pt "Prospecção", es "Prospección".
Arquivos: server/observability/health.ts:71; shared/system-health.ts:18; i18n/messages/systemHealth.ts:12,124
Risco: as buscas concluídas podem ser do seed, mas a regra é do produto. Se a prospecção for obrigatória em produção, âmbar ainda avisa; recomendo âmbar.

### AD-04 [S1] "Sync on" ao lado de um interruptor desligado
Telas: platform/en-desktop/integrations-xphere, platform/en-phone/integrations-xphere, platform/en-desktop/person-omar, person-sofia, person-reseller, person-refused e demais person-*; pt e es nas mesmas telas
Problema: em cada cartão Xphere, o rótulo diz "Sync on", pt "Sincronização ligada", es "Sincronización activada", com o interruptor desligado e a pill "No token" ao lado. O texto afirma o contrário do controle.
Mudança: rótulo neutro. en "Sync with Xphere", pt "Sincronizar com o Xphere", es "Sincronizar con Xphere".
Arquivos: i18n/messages/integrations.ts:78,179,276
Risco: nenhum.

### ID-01 [S1] Peça com revendedor aparece como "Em estoque"
Telas: platform/pt-desktop/piece-popup-withReseller, platform/es-desktop/piece-popup-withReseller
Problema: a pill diz "Em estoque" / "En stock" e a linha logo abaixo diz "Com Jessica Alvarez · Kit K-0002". Na tela de Estoque atrás do popup, os chips separam "No estoque da empresa" e "Com um revendedor", e esta peça conta no segundo. O erro nasce no inglês ("In stock"), então vale para os três idiomas.
Mudança: quando a peça está com alguém, a pill usa o texto do chip: en "With a reseller", pt "Com um revendedor", es "Con un revendedor". "In stock" fica só para a peça no estoque da empresa.
Arquivos: components/piece/PieceHeader.tsx:30,63; i18n/messages/manageTags.ts:90,398,693
Risco: nenhum na regra. Quem audita peças pode ter o mesmo achado.

## S2

### AD-05 [S2] Parceiro: configurações só de leitura parecem editáveis e se contradizem
Telas: partner/en-desktop/org-harbor-settings, partner/en-phone/org-harbor-settings
Problema: "Select all" e "Clear" aparecem como links, mas não fazem nada. "Not restricted yet: it can print every model. Choose the ones to release." dá uma ordem a quem não pode cumpri-la. Os dois botões de rádio ficam cinza, e só um fundo sutil indica a escolha. "organizations linked below" não tem nada embaixo. A mesma regra aparece de três jeitos na mesma tela: "Only the platform can edit organization settings", "Only the platform changes this" e "Only an Xpot admin changes this". O texto fala do próprio leitor na terceira pessoa ("This partner").
Mudança: para quem não edita, trocar tudo por um resumo: en "You can print every model" e "You handle your own orders"; pt "Você pode imprimir todos os modelos" e "Você cuida dos seus próprios pedidos"; es "Puedes imprimir todos los modelos" y "Te encargas de tus propios pedidos". Esconder os links quando `disabled`. Frase única: en "Only the Xpot team can change this", pt "Só a equipe do Xpot pode mudar isto", es "Solo el equipo de Xpot puede cambiar esto".
Arquivos: pages/xpot/components/ReleasedModelsField.tsx:32-37; i18n/messages/partnerMaterials.ts:39; i18n/messages/organizations.ts:83,106; i18n/messages/peopleWorkspace.ts:72
Risco: nenhum.

### AD-06 [S2] Área do dono: dois menus para o mesmo lugar, com nomes diferentes
Telas: owner/en-desktop/org-brightside-team, org-brightside-overview; owner-multi/en-desktop/org-lindgren-team, organizations; owner/en-phone/organizations; partner/en-desktop/org-harbor-overview
Problema: a barra lateral tem Team, Stock, Hand out, Team purchases, Companies, Settings, e a página repete Overview, Team, Stock, Kits, Team purchases, Companies, Settings. Clicar em "Team" abre a aba "Overview", com "Team" aceso na lateral. "Hand out" na lateral vira "Kits" na aba; o glossário reserva Kit ao nome do pacote. "Stock" da lateral e "Stock" da aba são telas diferentes. O dono de duas empresas tem outra lateral, sem Team purchases nem Settings, em que "Team" abre "Organizations". O grupo se chama "ORGANIZATION" sob o título "My company". No celular, o menu não tem Overview: Team, Stock, Kits, Team purchases, Companies, Settings.
Mudança: tirar as abas repetidas da página do dono; a lateral manda. Item novo "Overview" no topo do grupo, que passa a se chamar en "My company", pt "Minha empresa", es "Mi empresa". Aba "Kits" passa a en "Hand out", pt "Entregar peças", es "Entregar piezas". Dono de várias empresas: item en "My companies", pt "Minhas empresas", es "Mis empresas". Celular: Overview como primeira linha do menu.
Arquivos: pages/xpot/OrganizationsPage.tsx:123,291-316,340; components/xpot/moduleNav.ts:251,347,360; i18n/messages/organizations.ts:25,142
Risco: muda a navegação. Recomendo manter as abas só para o admin da plataforma, que não tem a lateral da empresa.
Status: pendente (parte). Feito: o menu do dono é só o da lateral (Settings e Back to app saíram), o grupo se chama My company e o dono de várias vê My companies. Pendente: tirar as abas repetidas da OrganizationsPage e trocar Kits por Past hand-outs (arquivo da F4).

### AD-07 [S2] Dono e parceiro aparecem como "Rep" em People
Telas: platform/en-desktop/people, person-owner, person-partner, person-owner-multi; pt "Vendedor" e es "Vendedor" nas mesmas
Problema: Priya é dona, Daniela é parceira, Kevin é revendedor só de Tags: todos têm a pill "Rep". "Owner" só aparece lá embaixo, no bloco Organizations. A lista não mostra a empresa de ninguém, e o papel que importa fica invisível. O campo "Role" só significa "é admin da plataforma ou não".
Mudança: a linha mostra função e empresa: "Owner · Brightside Marketing", "Employee · Lindgren Local Growth", ou "No organization". O seletor passa a se chamar en "Platform access", pt "Acesso à plataforma", es "Acceso a la plataforma", com as opções en "No" / "Yes, administrator", pt "Não" / "Sim, administrador", es "No" / "Sí, administrador".
Arquivos: pages/admin/PersonDetail.tsx:85,159,580-590; pages/admin/AdminReps.tsx
Risco: precisa enviar as organizações da pessoa em `/admin/reps`. Não muda regra.

### AD-08 [S2] Painel da pessoa: os números têm os títulos cortados
Telas: platform/en-desktop/person-owner ("ACTIV…", "IN STO…", "SCAN…"); platform/pt-desktop/person-owner ("VENDI…", "ATIVA…", "EM ES…", "LEITU…"); platform/es-desktop/person-owner ("VENDI…", "ACTIV…", "EN ST…", "LECTU…"); platform/en-phone/person-owner ("Sale counted in this…", "Pieces put live in thi…")
Problema: quatro colunas num painel de 400 px cortam todo título. A pessoa vê o número sem saber do que é, e em pt e es perde até a palavra. O bloco não tem título, a pill "No wholesale code" fica solta acima do período, e no celular o seletor de datas encosta na borda do cartão.
Mudança: `grid-cols-2` sempre neste componente, porque o `sm:` olha a tela, não o painel. Título do bloco: en "Pieces sold and activity", pt "Peças vendidas e atividade", es "Piezas vendidas y actividad". Tirar as dicas repetidas; deixar só "46 QR · 21 NFC". Seletor de datas em duas linhas.
Arquivos: pages/admin/PersonTagsSales.tsx:66-70; pages/admin/tags/pieces-analytics.tsx:102; i18n/messages/manageTags.ts:149-153
Risco: nenhum.

### AD-09 [S2] Pessoa recusada: o botão é "Unblock"
Telas: platform/en-desktop/person-refused, platform/en-phone/person-refused
Problema: "Their sign-up was refused. Unblocking gives them access with the modules stored on the account." Ela nunca foi bloqueada, e o verbo não diz que o clique libera o acesso.
Mudança: botão en "Approve after all", pt "Aprovar mesmo assim", es "Aprobar de todos modos". Dica: en "Their sign-up was refused. Approving now gives them access.", pt "O cadastro foi recusado. Aprovar agora dá acesso.", es "Se rechazó su registro. Aprobar ahora le da acceso."
Arquivos: i18n/messages/peopleWorkspace.ts:24, i18n/messages/manage.ts:96; pages/admin/PersonDetail.tsx:427
Risco: nenhum.

### AD-10 [S2] "Cost rule for physical Tags": ninguém sabe o que é
Telas: platform/en-desktop/person-owner, person-reseller, person-sofia; platform/pt-desktop/person-owner; platform/es-desktop/person-owner; platform/pt-desktop/handout-form-reseller-picked
Problema: "Cost rule for physical Tags", com as opções "Company stock · cost $0" e "Reseller buys · acquisition cost". A mesma escolha, em Hand out, chama-se "Company-owned (consignment)" e "Reseller purchase". São dois vocabulários para uma decisão só. "Physical Tags" também contraria o glossário: Tags é o módulo, o objeto é peça.
Mudança: rótulo en "Who pays for the pieces this person receives", pt "Quem paga pelas peças que esta pessoa recebe", es "Quién paga las piezas que recibe esta persona". Opções en "The company (they pay for what they sell)" / "They buy them", pt "A empresa (a pessoa paga o que vender)" / "A própria pessoa compra", es "La empresa (paga lo que venda)" / "La persona las compra". Usar os mesmos nomes em Hand out.
Arquivos: i18n/messages/manage.ts:76-77,90,296-297; i18n/messages/adminTagsFlow.ts:63,72-73,278-279; pages/admin/PersonDetail.tsx:783
Risco: confirmar com o dono se "custo $0" é consignação. O texto de Hand out indica que sim: "ele paga o que vender".

### AD-11 [S2] Compras da equipe mostram o código de produto
Telas: platform/en-desktop/org-brightside-purchases; partner/en-desktop/org-harbor-purchases; owner/en-phone/org-brightside-purchases; owner-multi/en-desktop/org-coastline-purchases (vazia)
Problema: "10 x plate-large", "5 x stand-large", "4 x stand-small" e, sem SKU, "2 x Piece". O dono não reconhece o produto, e em pt e es isso continua em inglês. Não há valor. Na tela vazia, a dica "What your team bought" fica logo abaixo de "Your team has not bought pieces yet", e "Stuscle" aparece sem explicação.
Mudança: traduzir o SKU para o nome do produto ("10 Large Plate"), com o mapa de SKU da loja. Sem SKU: en "2 pieces", pt "2 peças", es "2 piezas". Mostrar o total do pedido à direita. Dica: en "You follow the orders here; payment happens in the wholesale store.", pt "Aqui você acompanha os pedidos; o pagamento é feito na loja de atacado.", es "Aquí sigues los pedidos; el pago se hace en la tienda mayorista."
Arquivos: pages/xpot/OrganizationsPage.tsx:91,520-530; i18n/messages/organizations.ts:31
Risco: o valor já vem em `subtotalCents`. Sem regra nova.

### AD-12 [S2] Equipe: o formulário vem antes da equipe
Telas: owner/en-phone/org-brightside-team; owner-multi/en-phone/org-lindgren-team, org-coastline-team; owner/en-desktop/org-brightside-team; platform/en-desktop/org-company-team, org-harbor-team
Problema: na tela Team, o que aparece primeiro é um formulário aberto; no admin são dois, "Add person" e "Add an existing person". No celular, a primeira pessoa só aparece perto de 650 px abaixo do topo, no fim da primeira tela. "Tap a person…" aparece também no desktop.
Mudança: lista primeiro. Botão "Add person" no topo abre o formulário. Dica: en "Open a person to see their companies, visits, tasks and sales.", pt "Abra uma pessoa para ver empresas, visitas, tarefas e vendas.", es "Abre una persona para ver sus empresas, visitas, tareas y ventas."
Arquivos: pages/xpot/OrganizationsPage.tsx:347-349; i18n/messages/organizations.ts:109
Risco: nenhum.

### AD-13 [S2] Tipos de organização com três nomes
Telas: platform/en-desktop/organizations, organizations-new-dialog; platform/en-phone/organizations, organizations-new-dialog
Problema: o botão diz "New partner", o formulário diz "Create organization", e as linhas dizem "Seller" e "Producer". A palavra "companies" na descrição quer dizer clientes. O formulário de criar fica sempre aberto, em cima da lista.
Mudança: botões en "New organization" e "New partner that prints". Pills en "Sells" / "Prints and sells", pt "Vende" / "Imprime e vende", es "Vende" / "Imprime y vende". Formulário recolhido atrás do botão.
Arquivos: i18n/messages/organizations.ts:12,48-49,162-163,272
Risco: nenhum.

### AD-14 [S2] Ações perigosas lado a lado, e botões que o servidor recusa
Telas: platform/en-desktop/org-harbor-team, org-company-team; owner/en-desktop/org-brightside-team; owner-multi/en-desktop/org-lindgren-team; platform/en-desktop/person-blocked
Problema: em cada linha ficam "Suspend from organization", "Make owner" ou "Remove owner", e "Remove". Em People há ainda "Block access". Só a janela de confirmação explica a diferença. Em Harbor, Daniela é a única dona e os três botões aparecem para ela, mas o servidor recusa remover ou suspender o último dono, com "Make someone else org admin before removing or suspending the last one." A pessoa bloqueada mostra "Blocked" no topo e "Suspended" na organização.
Mudança: mover as ações para um menu "⋯" na linha, cada uma com uma frase: en "Suspend: keeps the account, loses this organization's data", "Remove: leaves the organization for good". Esconder "Remove owner", "Suspend" e "Remove" do último dono. Trocar "org admin" na mensagem por "owner".
Arquivos: pages/xpot/OrganizationsPage.tsx:373-375; server/organizations/service.ts:404-405; i18n/messages/organizations.ts:61-74
Risco: nenhum na regra; a tela só passa a obedecer o que o servidor já exige.

### AD-15 [S2] Três formulários diferentes para adicionar pessoa
Telas: platform/en-desktop/person-new-dialog, org-brightside-team, settings-organization; owner/en-phone/settings-organization, org-brightside-team
Problema: People pede "Full name", telefone e módulos, e o botão é "Create access", sem perguntar a organização: a pessoa nasce sem empresa. Team e Settings pedem "First name", "Last name" e telefone, e o botão é "Add person". Settings repete o formulário de Team.
Mudança: usar `AddPersonForm` nos três lugares e tirá-lo de Settings, onde fica só "Open the team". Em People, acrescentar "Organization" e "Módulos". Botão sempre "Add person".
Arquivos: pages/admin/AdminReps.tsx:316,345; pages/xpot/XpotSettings.tsx:447; pages/xpot/components/AddPersonForm.tsx:22
Risco: pessoa sem organização pode ser caso válido (revendedor direto). Recomendo a opção "No organization" como padrão.

### AD-16 [S2] Xphere: uma pilha de cartões técnicos sem dizer o que fazer
Telas: platform/en-desktop/integrations-xphere (2995 px), platform/en-phone/integrations-xphere (3920 px)
Problema: há um cartão completo por pessoa, com "Outbound token (xph_…, from Xphere)", "Inbound key", "API URL" preenchida com "https://xphere.app" ao lado de "Leave empty to use https://xphere.app.", e no topo "Inbound address (give it to Xphere with the person's key)". O mesmo bloco se repete no painel da pessoa. Quem abre não sabe por onde começar.
Mudança: uma tabela: pessoa, "Connected" ou "Not connected", última sincronização, botão "Set up" que abre o painel da pessoa. Campos técnicos só no painel, com "API URL" dentro de "Advanced". Texto no topo: en "Connect a person to send their work to the Xphere CRM.", pt "Conecte uma pessoa para enviar o trabalho dela ao CRM Xphere.", es "Conecta a una persona para enviar su trabajo al CRM Xphere."
Arquivos: pages/admin/AdminXphere.tsx; pages/admin/PersonDetail.tsx:842; i18n/messages/integrations.ts:71,79-83
Risco: nenhum.

### AD-17 [S2] Painel mostra blocos que não se aplicam à situação da pessoa
Telas: platform/en-desktop/person-pending, person-refused, person-blocked, person-platform; platform/en-phone/person-pending, person-blocked, person-refused
Problema: a pessoa pendente ou recusada tem regra de custo, Xphere, "Their visits/pieces/kits" e adicionar a organização, embora ainda não tenha acesso. A bloqueada ainda pode ter a regra de custo editada. Em pendente, "Languages en, es" são códigos e a decisão fica no meio da página. O selo "PLATFORM" ao lado de "Delete account" não informa nada: só o admin da plataforma chega nesta tela.
Mudança: pendente e recusada veem só dados do cadastro, módulos e a decisão. Bloqueada: motivo, desbloquear, histórico e organizações, sem editar custo e Xphere. Idiomas por nome (`LANG_LABELS`). Tirar o selo.
Arquivos: pages/admin/PersonDetail.tsx:224,233,239,286,295,502,797; pages/admin/PersonTagsSales.tsx:19
Risco: nenhum.

### AD-18 [S2] Editor do site: frases em pedaços
Telas: platform/en-desktop/landing-editor, platform/en-phone/landing-editor
Problema: a frase dos termos vem em três campos: "Terms line, before the links" com "By continuing you agree to the", "Terms line, between the links" com "and the", e "Terms line, after the links" com ".". Quem edita não vê a frase. "Button when signed in" e "Main button when signed in" são quase iguais. O "Open landing page" mostra só o que já foi publicado.
Mudança: um campo só, com marcadores: "By continuing you agree to the {terms} and the {privacy}." Prévia do rascunho ao lado do botão de publicar. Rótulos: en "Top menu button, signed in" e "Big button on the page, signed in".
Arquivos: i18n/messages/landingAdmin.ts:44-46; pages/admin/landingFields.ts; pages/admin/AdminLandingContent.tsx
Risco: o leitor do conteúdo salvo precisa aceitar o formato novo, com migração dos textos já publicados.

### AD-20 [S2] Settings: "Open panel" não diz para onde vai
Telas: owner/en-phone/settings-profile, settings-administration; platform/en-desktop/settings-profile; partner/en-phone/settings-administration; platform/pt-desktop/settings-profile
Problema: o bloco muda de título entre Platform, My company e Production, e o botão é sempre "Open panel" / "Abrir painel". "Panel" não aparece em nenhum outro lugar. "The platform, and your own company's production and stock, have their own panel." é difícil até de ler. No celular do dono, "My organiza…" e "My company" ficam em linhas vizinhas e levam a lugares diferentes. Tocar em "My company" abre uma tela inteira só com esse texto e um botão.
Mudança: botão com o destino: en "Open My company", pt "Abrir Minha empresa", es "Abrir Mi empresa" (ou "Open Platform", "Open Production"). Dica única: en "Production, stock and your team are managed there.", pt "A produção, o estoque e a equipe são geridos lá.", es "La producción, el stock y el equipo se gestionan allí." No celular, a linha leva direto à área. A linha "My organization" some ou vira o nome da empresa (ver ID-15).
Arquivos: pages/xpot/XpotSettings.tsx:526; i18n/messages/workspaces.ts:22-23,74-75
Risco: nenhum.
Status: feito. O botão e a seção saíram: a porta é o controle My work | My company, que já nomeia o destino.

### AD-30 [S2] Dono de duas empresas vê só uma em Settings
Telas: owner-multi/en-phone/settings-organization, settings-profile; owner-multi/en-desktop/settings-profile
Problema: "My organization" mostra só "Coastline Reviews", embora Tomas também seja dono da Lindgren. O formulário "Add person" abaixo adiciona na Coastline, sem chance de escolher. O código pega a primeira empresa da lista.
Mudança: listar todas as empresas com o papel em cada uma. Tirar o formulário (AD-15). Na linha do celular: en "2 companies", pt "2 empresas", es "2 empresas".
Arquivos: pages/xpot/XpotSettings.tsx:358-362,447
Risco: nenhum.

### ID-02 [S2] "Fatiado" e "Laminado" no botão de baixar
Telas: platform/pt-desktop/production-queue, production-board; platform/es-desktop/production-queue, production-board
Problema: o botão da fila diz "Fatiado" (pt) e "Laminado" (es), que em espanhol comum é "plastificado". Dentro do pedido, a mesma ação é "Baixar para imprimir". Tradução literal de jargão de impressão 3D, e nome diferente para a mesma coisa.
Mudança: `downloadSliced`: en "Download", pt "Baixar", es "Descargar". O ícone já é de download, e a linha é curta.
Arquivos: i18n/messages/production.ts:88,345,594; pages/admin/tags/production-orders.tsx:94
Risco: nenhum; é o único arquivo oferecido ali.
Status: feito

### ID-03 [S2] CHAPA, DISPLAY e SOPORTE: um produto com vários nomes
Telas: platform/pt-desktop/piece-popup-live, panel-stock, production-queue; platform/es-desktop/piece-popup-houseAvailable, panel-stock; reseller/pt-desktop/tags-pieces; reseller/es-desktop/tags-pieces
Problema: a peça "Large Plate" tem o selo "CHAPA", e o texto em volta diz "placas". Em pt, "Placa" no selo quer dizer outro produto (Sign), então a mesma palavra aponta para dois objetos. A "Large Stand" tem o selo "DISPLAY" em pt e "SOPORTE" em es. O glossário diz que Plate e Stand ficam para os produtos.
Mudança: selos iguais aos nomes dos produtos, nos três idiomas: "Plate", "Stand", e "Sign" para o terceiro.
Arquivos: i18n/messages/tags.ts:147-149,610-612,1056-1058
Risco: depende do dono se prefere nomes traduzidos nos produtos também. Recomendo manter em inglês, como os nomes já estão.
Status: feito (selos Plate, Stand e Sign nos três idiomas)

### ID-04 [S2] Instrução física de pausa em inglês
Telas: platform/pt-desktop/production-job-ready, platform/es-desktop/production-job-ready
Problema: a caixa amarela, a mais chamativa da tela, começa em português, "Pausa em Z 1.8", e continua "Peel one programmed 10 × 20 NTAG213 sticker and press it flat, adhesive down, long side left-right…". É o passo em que quem opera a impressora mais pode errar, e está em outro idioma. O report.json marca o mesmo em mais telas de produção.
Mudança: texto de pausa por idioma no modelo, com fallback para inglês e o aviso en "(in English)", pt "(em inglês)", es "(en inglés)".
Arquivos: pages/admin/tags/production-job.tsx:246-250; campo `bed.pause.text` da versão do modelo
Risco: precisa de campo novo no modelo. Alternativa mais barata: traduzir ao salvar, com a tradução revisada por quem cria o modelo.
Status: feito em parte (aviso "(em inglês)" e a instrução continua exata; o texto por idioma é dado da versão do modelo, decisão do dono)

### ID-05 [S2] Nomes de modelo em inglês e na ordem invertida
Telas: platform/pt-desktop/production-queue, production-board, production-job-ready; platform/es-desktop/production-job-ready, org-harbor-settings; platform/en-desktop/organizations-new-dialog
Problema: "Stand Small · Google Review · White" fica logo acima de "Avaliação Google" / "Reseña de Google", e os cartões da mesma página dizem "Small Stand". "White" e "Black" ficam em inglês. "Google G token · Large Stand (rounded relief v2)" e "Stand base · Small" expõem nome interno.
Mudança: montar o nome pelos dados: produto, face e cor traduzidos ("Small Stand · Avaliação Google · Branca"). Modelos sem produto mantêm o título digitado, sem o texto entre parênteses.
Arquivos: pages/admin/tags/production-identity.tsx:31; pages/xpot/components/ReleasedModelsField.tsx:44
Risco: nenhum na regra.
Status: feito (nome montado de produto, face e cor no idioma em uso; ReleasedModelsField, em pages/xpot, não foi tocado)

### ID-06 [S2] Cor aparece como valor cru
Telas: platform/pt-desktop/production-queue, production-job-ready; platform/es-desktop/production-queue, production-job-ready
Problema: o selo mostra "black" e "white", em minúsculas e em inglês, nas telas em pt e es.
Mudança: traduzir o valor: en "Black"/"White", pt "Preta"/"Branca", es "Negra"/"Blanca".
Arquivos: pages/admin/tags/production-identity.tsx:34
Risco: nenhum.

### ID-07 [S2] Loja do revendedor com conteúdo só em inglês
Telas: reseller/pt-desktop/tags-shop, reseller/es-desktop/tags-shop
Problema: a tela está em português, mas o cartão diz "A flat plate that opens the restaurant's menu.", "The counter stand customers tap to leave a Google review…", "QR printed on the face", "Starter kit · 10 plates". O texto vem do laboratório, mas o cadastro só tem um campo por entrada, então qualquer texto real ficaria num idioma só. É a tela em que o revendedor decide comprar.
Mudança: campos opcionais por idioma em título, descrição e itens, com fallback para o idioma principal.
Arquivos: shared/schema (entrada da loja: `description`, `includes`, por volta das linhas 187-189), pages/tags/ShopScreen.tsx:146, pages/admin/tags/ShowcaseTab.tsx
Risco: migração de banco e decisão do dono. Recomendo pt e en primeiro, porque são os mercados ativos.

### ID-08 [S2] Coluna "Revendedor" cortada e última coluna fora da tela
Telas: platform/pt-desktop/panel-stock, platform/es-desktop/panel-stock
Problema: em todas as linhas sem revendedor aparece "Estoque da empr…" / "Stock de la empr…". O inglês "Company stock" cabe. Em es, o título "ÚLTIMA LECTU" é cortado, e a coluna de lote fica fora da área visível nos dois idiomas.
Mudança: aumentar `max-w-[160px]` para `max-w-[190px]`. Reduzir a largura da coluna Código e passar o lote para baixo do código, em texto pequeno.
Arquivos: pages/admin/tags/piece-table.tsx:127
Risco: nenhum.

### ID-09 [S2] Espanhol: "Devolver" diz o contrário
Telas: platform/es-desktop/panel-kits-handout
Problema: a aba em que o gestor pega as peças de volta chama-se "Devolver", que indica o gesto contrário. O pt "Recolher" está certo.
Mudança: es "Recoger" na aba e nos botões ("Recoger {count} pieza").
Arquivos: i18n/messages/adminTagsFlow.ts:460,517 e as demais chaves `takeBack*` em es
Risco: nenhum.

### ID-10 [S2] "Cuida dos próprios" e "se encarga de los suyos": frase sem objeto
Telas: platform/pt-desktop/org-harbor-settings, platform/es-desktop/org-harbor-settings, platform/en-desktop/org-harbor-settings
Problema: "Este parceiro cuida dos próprios" não diz dos próprios o quê. Os idiomas repetem o inglês "handles their own". A dica ainda diz "ele dá kits", e "Stuscle" aparece como se fosse conhecido.
Mudança: en "This partner handles its own orders", pt "Este parceiro cuida dos próprios pedidos", es "Este socio se encarga de sus propios pedidos". Na opção do Xpot: en "Xpot handles the orders", pt "O Xpot cuida dos pedidos", es "Xpot se encarga de los pedidos".
Arquivos: i18n/messages/organizations.ts:81-83,195-197,305-307
Risco: nenhum.

### ID-13 [S2] "Plate" usado para impressão, contra o glossário
Telas: platform/en-desktop/org-brightside-settings, org-coastline-settings; platform/pt-desktop/org-harbor-settings; platform/es-desktop/org-harbor-settings
Problema: "print requests, plates, batches", pt "pedidos de impressão, placas, lotes", es "pedidos de impresión, placas, lotes". O glossário reserva Plate ao produto; aqui quer dizer o que vai para a impressora.
Mudança: en "print requests, print jobs, batches", pt "pedidos de impressão, impressões, lotes", es "pedidos de impresión, impresiones, lotes".
Arquivos: i18n/messages/peopleWorkspace.ts:72,171,265
Risco: nenhum.
Status: feito

### ID-14 [S2] Dica do telefone de acesso diz coisas diferentes por idioma
Telas: platform/en-desktop/settings-signin, reseller/pt-desktop/settings-profile, reseller/es-desktop/settings-profile, platform/pt-desktop/settings-profile
Problema: en "To change it, ask the platform.", es "pídeselo a la plataforma", pt "peça a um gestor". Só o admin da plataforma pode trocar, então o pt manda a pessoa ao lugar errado. "The platform" não quer dizer nada para ela. Marcus, que é o próprio admin, também recebe a frase.
Mudança: en "Only the Xpot team can change it.", pt "Só a equipe do Xpot pode trocar.", es "Solo el equipo de Xpot puede cambiarlo." Para o admin, um link para a própria linha em People.
Arquivos: i18n/messages/navIa.ts:29,55,78; server/routes/xpot/admin.ts:144
Risco: nenhum.

### ID-15 [S2] "My organization" contra o glossário
Telas: reseller/pt-desktop/settings-profile, reseller/es-desktop/settings-profile, platform/pt-desktop/settings-profile, platform/es-desktop/settings-profile, owner/en-phone/settings-profile
Problema: o glossário troca "My organization" por "My company", e a barra lateral já diz "Minha empresa". Settings continua com "Minha organização" e "Mi organización".
Mudança: en "My company", pt "Minha empresa", es "Mi empresa"; o texto abaixo troca "organização" por "empresa". Para quem é dono de várias: "My companies", "Minhas empresas", "Mis empresas".
Arquivos: i18n/messages/addPerson.ts:22,49,73
Risco: nenhum. Ver AD-26 sobre a palavra "empresa".
Status: feito. My company / Minha empresa / Mi empresa em Settings; My companies para quem tem várias fica no controle de área.

## S3

### AD-19 [S3] Aba de configurações que o dono não pode usar
Telas: owner/en-desktop/org-brightside-settings, owner/en-phone/org-brightside-settings; owner-multi/en-desktop/org-coastline-settings, org-lindgren-settings
Problema: a aba tem um nome e um interruptor, ambos travados, e "Only the platform can edit organization settings." Mais nada.
Mudança: esconder a aba e o item "Settings" da barra lateral para quem não edita. O parceiro mantém o resumo de AD-05.
Arquivos: pages/xpot/OrganizationsPage.tsx:291-316,650
Risco: nenhum.

### AD-21 [S3] Listas da organização sem resumo e sem busca
Telas: platform/en-desktop/org-company-inventory (3844 px), org-harbor-inventory; owner/en-desktop/org-brightside-inventory, org-brightside-kits, org-brightside-customers; platform/en-desktop/org-brightside-customers; owner-multi/en-desktop/org-lindgren-inventory
Problema: Stock é uma lista de códigos, com produto e estado em cinza à direita. Não diz quantas de cada, nem com quem está: 76 linhas na Skale Club. Kits não diz quantas peças. Companies tem 19 linhas sem busca. "See all in…" só existe para o admin. O ícone de Companies é de pessoas na aba e de prédio na lateral.
Mudança: Stock vira contagem por estado ("Live 3 · Ready, not live 3 · No customer yet 7"), cada uma levando ao Estoque já filtrado. Kits ganha "{n} pieces". Companies e Kits mostram 10 linhas e "See all" para todos os perfis. Ícone de prédio nas duas.
Arquivos: pages/xpot/OrganizationsPage.tsx:386-398
Risco: conferir se o dono pode abrir o Estoque filtrado por organização.

### AD-22 [S3] Visão geral: número mal nomeado e cor de boa notícia no zero
Telas: platform/en-desktop/org-brightside-overview, org-harbor-overview; owner/en-phone/org-brightside-overview; partner/en-desktop/org-harbor-overview; owner-multi/en-desktop/org-lindgren-overview
Problema: "Stock 14" conta todas as peças da organização; a lista por trás inclui Live, Paused e Deactivated, que não são estoque. "Sales total $0.00" fica verde, como se fosse bom. Os quatro blocos de cima são clicáveis e levam à aba, mas nada indica isso. Os quatro de baixo não levam a lugar nenhum.
Mudança: "Stock" passa a en "Pieces", pt "Peças", es "Piezas". Valor zero em cor neutra. Seta ou sublinhado nos clicáveis. Blocos de baixo levam a Tasks e Sales filtrados. Seletor de período junto de "Team activity, last 30 days".
Arquivos: pages/xpot/OrganizationsPage.tsx:481-482,505-506
Risco: nenhum.

### AD-23 [S3] Status repete o log e mostra mensagem técnica
Telas: platform/en-desktop/status, status-event-1, status-event-2, status-event-3; platform/en-phone/status, status-event-1, status-event-2
Problema: "Problems (7 days)" e "Event log" mostram os mesmos eventos. Serviços não configurados ocupam 13 linhas iguais. "AI assistants / AI assistants" repete título e subtítulo. Os eventos abrem com texto de servidor, como "connect ETIMEDOUT 10.0.0.12:5432", sem o "What to do" que o topo tem. No detalhe, o bloco "Search: This event is not about a prospecting search." não informa nada, e "Status" aparece no topo e de novo solto no rodapé. Em event-2, "5×" tem a lista de ocorrências da mais antiga para a mais nova, numa caixa de 160 px: a aberta (Nov 1) fica fora da vista, sem destaque.
Mudança: agrupar "Not set up ({count})" recolhido. Manter só Problems, com "Event log" recolhido e na largura toda. No detalhe, frase simples antes do técnico; esconder "Search" sem busca; tirar o "Status" do rodapé. Ocorrências da mais nova para a mais antiga.
Arquivos: pages/admin/AdminSystemHealth.tsx:327,346; pages/admin/AdminSystemEventDetail.tsx:120-122; i18n/messages/systemHealth.ts
Risco: nenhum. Os textos de evento vêm do seed, mas o formato é o do log real.

### AD-24 [S3] Assistentes de IA em linguagem de desenvolvedor
Telas: platform/en-desktop/integrations-assistants, platform/en-phone/integrations-assistants
Problema: "AI access (MCP)", "Connector URL", "For clients that take a header instead of signing in, such as Claude Code." "Tags production log" contraria o glossário, que manda "History".
Mudança: título en "Connect an AI assistant", pt "Conectar um assistente de IA", es "Conectar un asistente de IA". Fluxo normal: "Copy this address into your assistant." Tokens ficam em "Advanced". "Tags production log" passa a "History".
Arquivos: i18n/messages/integrations.ts (`mcpIntro`, `scope_journey`); pages/admin/AdminIntegrations.tsx
Risco: nenhum.

### AD-25 [S3] Prévia mostra o logo sumindo, sem avisar
Telas: platform/en-desktop/brand-identity, platform/en-phone/brand-identity
Problema: em "On light", aparece só o X: o resto do logo, branco, some no fundo branco. "As a round icon" mostra um quadrado arredondado. "Favicon" e "PWA" são termos técnicos.
Mudança: aviso sob a prévia: en "This logo is hard to see on light backgrounds. Add a dark version.", pt "Este logo fica difícil de ver em fundo claro. Envie uma versão escura.", es "Este logo se ve mal sobre fondo claro. Sube una versión oscura." Prévia realmente redonda. "Favicon & app icon" passa a "Browser tab and app icon".
Arquivos: i18n/messages/platformAdmin.ts:167-168; i18n/messages/manage.ts:210; pages/admin/AdminBranding.tsx
Risco: detectar logo claro exige analisar a imagem; alternativa é o aviso fixo ao lado da prévia.

### AD-26 [S3] "Company" e "empresa" com sentidos demais
Telas: owner/en-desktop/org-brightside-team, platform/en-desktop/organizations, platform/pt-desktop/panel-stock, reseller/pt-desktop/tags-pieces, tags-home, platform/pt-desktop/piece-popup-live
Problema: "My company" é a área do dono, "Companies" são os clientes, "Organizations" é o grupo. Na tela de Estoque, "No estoque da empresa" é do dono e a coluna "EMPRESA", ao lado, é do cliente. O revendedor vê "Clientes" na lateral, a coluna "EMPRESA" com "Sem cliente ainda" dentro, e "CLIENTE E DESTINO" no popup.
Mudança: "Companies" para os clientes na lista do admin; "My company" para a área do dono; "Organizations" só para o admin da plataforma. Na coluna de peças e no popup, um único nome. Recomendo en "Customer", pt "Cliente", es "Cliente", porque "company stock" já ocupa a outra palavra.
Arquivos: docs/MODULES.md §5; i18n/messages/shell.ts, manageTagsPieces.ts, tags.ts
Risco: decisão do dono, porque a D6 do plano foi descartada. Recomendo mudar só a coluna e o popup.

### AD-28 [S3] People repete o estado em cada linha
Telas: platform/en-desktop/people, people-status-active, people-status-blocked, people-status-pending; platform/pt-desktop/people; platform/es-desktop/people; platform/en-phone/people
Problema: dentro de "Active (9)", todas as linhas têm a pill "Active". Em "Waiting for approval", "Blocked" e "Refused" é igual.
Mudança: esconder a pill quando o grupo já diz o estado.
Arquivos: pages/admin/AdminReps.tsx; pages/admin/PersonDetail.tsx:162
Risco: nenhum.

### AD-29 [S3] People no celular: a primeira pessoa fica no meio da tela
Telas: platform/en-phone/people, people-status-active
Problema: a barra "Platform / Back to my app", o título "People" e o seletor "People" repetem o nome. Depois vêm "New person", a busca e três filtros. Nora, que espera aprovação, só aparece perto de 500 px abaixo do topo.
Mudança: tirar o título quando o seletor de seção já mostra o nome. Recolher os três filtros em um botão "Filters".
Arquivos: pages/admin/AdminApp.tsx:59-66; pages/admin/AdminReps.tsx
Risco: nenhum.

### AD-31 [S3] Três campos de nome e código de atacado no perfil
Telas: platform/en-desktop/settings-profile, owner/en-desktop/settings-profile, partner/en-desktop/settings-profile; reseller/es-desktop/settings-profile; platform/pt-desktop/settings-profile
Problema: "First name", "Last name" e "Display name" para o mesmo nome. "Your wholesale code" aparece sem explicação no meio do perfil, até para o admin, e já existe no cartão de atacado em Minhas peças.
Mudança: esconder "Display name", derivado dos outros dois. Tirar o código do perfil; ou deixá-lo só com um link en "Open the wholesale store".
Arquivos: pages/xpot/XpotSettings.tsx:416-424; pages/tags/WholesaleCard.tsx:55
Risco: revendedor ligado a parceiro não vê o cartão ("Suas peças vêm de…"), mas o perfil mostra o código dele. Conferir com o dono se ele deveria ter código.

### ID-11 [S3] "Peça peças", e o admin mandado falar com o gestor
Telas: platform/pt-desktop/tags-pieces
Problema: "Nenhuma peça ainda. Peça peças ao seu gestor." e "Peça placas, chaveiros e mais…": o verbo e o substantivo se confundem. O leitor desta captura é Marcus, o administrador, que não tem gestor. O inglês "Ask your manager for pieces" tem o mesmo problema de público.
Mudança: "Você ainda não tem peças. Solicite ao seu gestor." e "Compre placas, chaveiros e mais na loja Stuscle com preço de revendedor. O seu código libera." Para quem administra: en "You have no pieces with you. Hand them out in Stock.", pt "Você não tem peças consigo. Entregue pelo Estoque.", es "No tienes piezas contigo. Entrégalas desde Stock."
Arquivos: i18n/messages/tags.ts:117,582,882,1028; pages/tags/PiecesScreen.tsx
Risco: nenhum.

### ID-12 [S3] "(regra dele)"
Telas: platform/pt-desktop/handout-form-reseller-picked, platform/es-desktop/handout-form-reseller-picked
Problema: "Da empresa (consignação) (regra dele)", es "(su regla)". Quer dizer que é a opção padrão daquele revendedor.
Mudança: en "(their default)", pt "(padrão dele)", es "(su opción habitual)".
Arquivos: i18n/messages/adminTagsFlow.ts:74,280,477
Risco: nenhum.

### ID-16 [S3] Espanhol: "ordenador" e "computadora" misturados
Telas: platform/es-desktop/org-harbor-settings ("su propio ordenador de la impresora")
Problema: o glossário manda "Ordenador", mas a varredura dos textos acha "computadora" em 9 chaves de `manage`, `manageTags` e `apiErrors`. O locale é es-US, em que "computadora" é o normal. A varredura acha ainda "Orden de impresión" em apiErrors, contra "Impresión" no glossário.
Mudança: corrigir o glossário para "Computadora de la impresora" e trocar `ordenador` nas chaves.
Arquivos: docs/MODULES.md §5; i18n/messages/partnerMaterials.ts, apiErrors.ts, peopleWorkspace.ts:265
Risco: decisão do dono. Recomendo "computadora".

### ID-17 [S3] Texto de log em inglês nas telas pt e es
Telas: platform/pt-desktop/status; platform/es-desktop/status (tabela)
Problema: "Google Maps engine answered 429; retrying in 60s", "Xphere push failed for sale 4: 401 invalid API key" e "Run 12 stuck in starting…" aparecem na tela traduzida, e são o título do evento. O report.json não pega.
Mudança: traduzir os erros por código, quando existir `reasonCode`, e mostrar o texto original só em "Technical details". Os textos em si são do seed.
Arquivos: pages/admin/AdminSystemHealth.tsx; pages/admin/systemHealthUi.tsx
Risco: exige código em cada erro conhecido; os demais continuam em inglês, atrás de um título genérico.

### AD-33 [S3] 35 modelos numa caixa de seis linhas, sem busca
Telas: platform/en-desktop/organizations-new-dialog, org-harbor-settings; platform/en-phone/organizations-new-dialog; partner/en-desktop/org-harbor-settings
Problema: "Models it may print" é uma lista com rolagem própria, de 256 px. O laboratório tem 35 modelos com código e só aparecem seis, todos "Stand Large". Quem abre acha que só existem stands, e na fila a Harbor imprime "Plate Large". Não há sinal de que a lista continua.
Mudança: busca no topo e grupos por produto recolhidos ("Large Plate (6)"), com "Select all" por grupo.
Arquivos: pages/xpot/components/ReleasedModelsField.tsx:18,43-44
Risco: nenhum.

## S4

### AD-27 [S4] Rótulos cortados e títulos fracos
Telas: owner/en-phone/settings-profile; platform/en-phone/brand-identity; platform/en-desktop/org-harbor-overview; owner/en-desktop/org-brightside-overview
Problema: "My organiza…" na linha do celular. "Landing p…" na aba. "Owner" e "Platform management" como subtítulo solto, sem dizer de quê.
Mudança: deixar o nome da empresa quebrar para a segunda linha. Abas em rolagem com recuo no fim. Subtítulo en "Your role: Owner"; tirar "Platform management".
Arquivos: pages/xpot/XpotSettings.tsx; pages/xpot/OrganizationsPage.tsx:335
Risco: nenhum.

### AD-32 [S4] "blocked Oct 13, 2026" em minúscula
Telas: platform/en-desktop/person-blocked, person-refused, person-pending
Problema: "blocked …", "refused …" e "signed up …" começam em minúscula, soltos.
Mudança: en "Blocked on {date}", "Refused on {date}"; em pt e es, igual, com maiúscula.
Arquivos: i18n/messages/manage.ts:95,128,315
Risco: nenhum.

### ID-18 [S4] Primeiro dia do gráfico cortado em português
Telas: platform/pt-desktop/tags-home, reseller/pt-desktop/tags-home
Problema: "3 de out." tem o começo cortado na borda do gráfico. O espanhol "3 oct" cabe.
Mudança: em pt, formatar "3 out", sem "de" e sem ponto.
Arquivos: pages/tags/charts.ts:26; pages/tags/TagsDashboard.tsx:178
Risco: nenhum.

### ID-19 [S4] Três palavras para "status" em português
Telas: platform/pt-desktop/status, people, tags-pieces
Problema: a tela chama-se "Status", a coluna "ESTADO", o filtro "Situação" e, em Tags, a coluna "STATUS". O espanhol usa "Estado" em tudo.
Mudança: pt "Status" nas três chaves.
Arquivos: i18n/messages/manage.ts:349; i18n/messages/platformAdmin.ts:281
Risco: nenhum.

### ID-20 [S4] Espanhol: dois nomes no mesmo cartão e "mayoreo"
Telas: platform/es-desktop/integrations-services, platform/es-desktop/tags-pieces, platform/es-desktop/person-owner
Problema: o cartão tem a pill "Apagada" e o rótulo do interruptor "Desactivada". "Desactivada" é o termo de peça no glossário. O atacado aparece como "Mayoreo Stuscle", "Código de mayorista", "Código mayorista" e "al por mayor".
Mudança: "Apagada" nos dois. Sempre "mayorista": "Mayorista Stuscle", "Código mayorista".
Arquivos: i18n/messages/manage.ts:454; i18n/messages/integrations.ts:216; i18n/messages/platformAdmin.ts:428; i18n/messages/tags.ts:1329
Risco: conferir se `manage.disabled` é usado em outro lugar antes de trocar.

### ID-21 [S4] "Sem cliente" e "Sem cliente ainda" na mesma linha
Telas: reseller/pt-desktop/tags-pieces, reseller/es-desktop/tags-pieces, platform/pt-desktop/piece-popup-houseAvailable, platform/es-desktop/piece-popup-houseAvailable
Problema: a coluna diz "Sem cliente ainda" / "Aún sin cliente" e a pill diz "Sem cliente" / "Sin cliente", repetindo. O glossário traz só "Sem cliente"/"Sin cliente".
Mudança: "—" na coluna, quando a pill já diz. No popup, "Sem cliente" e "Sin cliente".
Arquivos: pages/tags/PiecesScreen.tsx; i18n/messages/tags.ts
Risco: nenhum.

### ID-22 [S4] Ponto duplo depois do nome da empresa
Telas: reseller/pt-desktop/tags-pieces, tags-shop; reseller/es-desktop/tags-pieces, tags-shop
Problema: "Suas peças vêm de Harbor Print Co.." e "Tus piezas vienen de Harbor Print Co.." Acontece com todo nome terminado em ponto (Co., Inc.).
Mudança: tirar o ponto final da frase nos três idiomas.
Arquivos: i18n/messages/tags.ts:436,885 e a chave em es
Risco: nenhum.

### ID-23 [S4] "With you" contra "With me" e verbos soltos no popup
Telas: reseller/pt-desktop/tags-home, reseller/es-desktop/tags-home, platform/pt-desktop/piece-popup-live
Problema: a home diz "Com você" / "Contigo", e o glossário manda "Comigo" / "Conmigo". No popup pt há "Alterar destino" ao lado de "Trocar cliente", e es usa "Cambiar" nos dois.
Mudança: tile "Comigo"/"Conmigo"/"With me". pt "Trocar destino".
Arquivos: i18n/messages/tags.ts:67,533,979
Risco: nenhum.

### ID-24 [S4] Frases literais em português
Telas: platform/pt-desktop/integrations-services, platform/pt-desktop/people
Problema: "Ao que o Xpot se conecta, agrupado pelo trabalho que faz." e "Papel" para role.
Mudança: "O que está ligado ao Xpot, por tipo de trabalho." e "Função" em filtros e no painel.
Arquivos: i18n/messages/platformAdmin.ts:187; i18n/messages/manage.ts
Risco: nenhum.

### ID-25 [S4] Chave crua nas notas da visita, causada pelo seed
Telas: owner/en-desktop/visits-history-came_back_later, visits-history-follow_up; owner/en-phone/visits-history-came_back_later
Problema: "NOTES: came_back_later" e "NOTES: follow_up". A causa é o seed, que grava o status no campo de texto (`.lab/seed-visits.ts:135`, `outcome: status`). O status da visita em si aparece certo ("Come back later"), e na vida real o campo é texto livre. Não é falta de tradução: `status_came_back_later` existe nos três idiomas.
Mudança: corrigir o seed. Opcional: em `VisitRow`, não mostrar o valor se ele for igual a um status conhecido.
Arquivos: .lab/seed-visits.ts:135; pages/xpot/components/VisitRow.tsx:198; pages/xpot/XpotDashboard.tsx:459
Risco: nenhum.

## O que o report.json acusou

61 capturas têm `otherLanguage`. Classificação:

| Texto | Telas | Veredito |
|---|---|---|
| Instruções de pausa ("Peel one…", "Insert one…") | production-job-* em pt/es | Achado real, ID-04. Abri job-ready em pt e es; os demais job-* só pelo report.json |
| Descrição da loja ("A flat plate…") | tags-shop em pt/es, platform e reseller | Achado real, ID-07 |
| Descrição e notas de versão de modelo ("Weighted base…", "v2: the QR inverted…", "uploaded with bench.py attach-bed") | production-model-*, always-ready-version-picker | Não abri estas imagens, são da área de produção. Mesma causa de ID-04. "bench.py" em tela merece olhar de quem audita produção |
| "Keychains from the old supplier", "Not found in the Oct 28 stock count", "Already has a printed QR sign…", "Counted the shelf…" | batch-*, history, piece-*-lost, visits-history-not_interested | Texto digitado pelo usuário. Não é achado |
| "Menu: …→ … “New menu PDF”" marcado como pt | piece-*-live em en e es | Falso positivo. A mudança registrada ali é legítima |
| landing-pt/es, privacy-pt, terms-es | public | Falso positivo: páginas nesse idioma de propósito |

O detector não pega texto curto: não acusou "black", "white", "Fatiado", "Run 12 stuck…", "QR printed on the face", "Stand Large…". A regra de chave crua (`RAW_A` em `.lab/capture.mjs:81`) exige dois sublinhados, então só `came_back_later` apareceu, e `follow_up`, `sale_made`, `no_answer` e `not_interested` passam.

## O que ficou bom nos idiomas

Nenhum inglês sobrando na interface de Hoje, Estoque, Entregar peças, Tags e Settings; os problemas de idioma vêm de conteúdo, modelos e valores crus. Os termos do glossário estão aplicados na navegação e nos chips (Estoque, Entregar peças, Pedidos de atacado, Resultado das peças, Gravadores de chip, Ainda fora do estoque, Pronta fora do ar). "Tags" está igual nos três idiomas. Admin traduzido por inteiro em People, Status, Integrações e Configurações da organização.

## Problema do laboratório (não é achado do produto)

**Códigos de atacado inválidos no seed.** `.lab/seed-people.ts` usa códigos com letras fora do alfabeto (O, I, L, U), como `XP-OH08-TEAM`. `formatWholesaleCode` devolve vazio para eles. Por isso, em People e no painel, 6 pessoas ativas aparecem com a pill âmbar "No wholesale code" e o botão "Issue a code", enquanto o Settings da mesma pessoa mostra o código. Entre quem tem Tags, só `XP-MR01-ADMN` e `XP-SR09-TEAM` são válidos, e Marcus e Sofia são justamente os sem a pill. Em produção o servidor gera códigos válidos sozinho. Corrigir o seed para a próxima rodada; não registrei como contradição do produto.
