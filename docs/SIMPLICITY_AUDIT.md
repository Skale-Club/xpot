# Auditoria de simplicidade do Xpot

**Data:** 2026-11-01 · **Base:** `c2d1e39` (main) · **Rev. 2**, revisada por inteiro · **Tipo:** só leitura, nenhuma tela alterada.

## Resumo

O Xpot não está carregado por excesso de funções. Está carregado porque mostra o funcionamento interno no lugar da
tarefa de quem está usando. Quatro causas explicam quase tudo:

1. **Um nome para várias coisas, várias coisas com o mesmo nome.** "Plate" é o produto e a mesa de impressão.
   "Prospects" é um status e também um filtro que lista outra coisa. A mesma tela se chama "Distribution" num painel e
   "Kits" no outro.
2. **A tela mostra o estado do banco, não o próximo passo.** A peça exibe três status lado a lado, e a pessoa precisa
   deduzir o que fazer. Isso vale para o revendedor também, porque o cabeçalho é o mesmo.
3. **Caminhos paralelos.** Quatro jeitos de colocar peça em estoque, três listas de "o que precisa de mim", três áreas
   de navegação e várias entradas para a mesma tela.
4. **Texto da plataforma vazado para o cliente.** "Skale Club" está escrito 36 vezes nos textos, num sistema que hoje
   tem várias organizações produzindo as próprias peças.

A boa notícia: o app do dono da plaquinha (`/my`) já fala a língua certa ("Your plates", "See my plates") e serve de
referência de tom para o resto.

Comece pelo glossário (PR 0) e pelo popup da peça (PR 1). O popup é a tela que mais aparece e vira o modelo das outras.

## Como foi feita e o que não cobre

- Leitura de `client/src/components/xpot/moduleNav.ts` (a navegação), dos 46 dicionários em `client/src/i18n/messages/`
  e da estrutura das 142 telas em `client/src/pages`. Toda afirmação cita arquivo e linha, conferidos no commit base.
- **Não foi usada no navegador**, porque o painel exige login. O peso visual de cada tela precisa ser conferido em uso;
  o que está aqui é o que o código obriga a aparecer.
- Lidas a fundo: peça, navegação, custódia, produção, estoque, revendedor, Leads, Sales, Dashboard, `/my`. Vistas só
  pela estrutura: Route (`pages/xpot/XpotProspecting.tsx`, 1.953 linhas), Person, Status, Integrations.
- Contagens de termos são linhas em inglês que contêm a palavra; servem para dimensionar, não para medir.

## Os 12 problemas que mais pesam

| # | Problema | Evidência | Quem sofre | Impacto | Esforço |
|---|---|---|---|---|---|
| 1 | Peça com três status, botão desabilitado com aviso e seis seções abertas | `components/piece/pieceView.ts:28-33,81-86`, `components/piece/PieceBody.tsx:30-38`, `components/piece/CustomerDestinationSection.tsx:309-316` | Todos | Alto | Médio |
| 2 | "Skale Club" fixo em 36 textos, inclusive "Ask Skale Club for a kit" | `i18n/messages/tags.ts:117,130-132,302-306`; não existe nome da casa no cliente | Revendedor de parceiro | Alto | Médio |
| 3 | "House stock", "The house", "my stock" | `i18n/messages/pieceCustody.ts:12-13`, `i18n/messages/pieceScreen.ts:52`; ~61 linhas em 10 dicionários | Todos | Alto | Baixo |
| 4 | "Plate" é produto e mesa de impressão | `i18n/messages/workspaces.ts:32`, `components/xpot/TagProductThumbnail.tsx:13` | Quem produz | Alto | Baixo |
| 5 | Mesma tela com dois nomes: Inventory/Stock, Distribution/Kits | `i18n/messages/shell.ts:34-35`, `i18n/messages/workspaces.ts:14-15` | Gestão | Alto | Baixo |
| 6 | Mesmo status com dois nomes: "Sold" na lista, "With the customer" na peça; "Not set up" em EN, "Sem cliente" em PT | `i18n/messages/manageTags.ts:93`, `i18n/messages/pieceScreen.ts:16`, `i18n/messages/tags.ts:121,585` | Todos | Médio | Baixo |
| 7 | Três listas de "o que precisa de mim": Today, Needs action, Needs attention | `pages/admin/home-model.ts:100-131`, `pages/admin/tags/OverviewTab.tsx:71-74`, `pages/xpot/XpotDashboard.tsx:387` | Gestão | Médio | Médio |
| 8 | Quatro caminhos para colocar peça em estoque, o menos comum aparecendo primeiro | seção "Estoque" | Gestão | Alto | Alto |
| 9 | Painel da plataforma com cerca de 20 itens, Visits e Tags misturados | `components/xpot/moduleNav.ts:341-362` | Plataforma | Médio | Médio |
| 10 | Filtro "Leads" inclui prospects; filtro "Prospects" lista outro conjunto | `pages/xpot/XpotLeads.tsx:156-175` | Vendedor | Médio | Baixo |
| 11 | "My pieces" do revendedor com 8 controles de filtro | `pages/tags/PiecesScreen.tsx:25-31,59` | Revendedor | Médio | Baixo |
| 12 | Comando de terminal e "Claude" na tela de Produção | `i18n/messages/productionBoard.ts:28`, `i18n/messages/production.ts:42` | Quem produz | Médio | Baixo |

## Glossário

Um nome por conceito, em toda a interface. Só texto: código, banco e URLs não mudam. Respeita o que o
`docs/MODULES.md` §5 já fechou (piece/peça, rep/vendedor, reseller/revendedor, batch/lote) e só acrescenta.
**D** marca decisão sua, no fim.

| Hoje | Inglês | Português | Espanhol | Nota |
|---|---|---|---|---|
| House stock, The house | Company stock | Estoque da empresa | Stock de la empresa | "Company" aqui é a organização dona das peças |
| My stock | With me | Comigo | Conmigo | Só quando há escolha |
| Skale Club (nos textos) | {organization} | {organização} | {organización} | Variável; ver PR 2b |
| Plate (mesa de impressão) | Print job | Impressão | Impresión | **D1**. "Plate" fica só para o produto |
| Bench | Print computer | Computador da impressora | Ordenador de la impresora | Só quando for preciso citar |
| Batch | Batch | Lote | Lote | Mantido no MODULES §5; sai das telas do dia a dia |
| Inventory, Stock | Stock | Estoque | Stock | **D2** |
| Distribution, Kits | Hand out | Entregar peças | Entregar piezas | **D3**. "Kit" segue como nome do pacote, conforme MODULES §5 |
| Take back | Take back | Receber de volta | Devolver al stock | |
| Stuscle orders | Wholesale orders | Pedidos de atacado | Pedidos mayoristas | Stuscle é nome interno |
| Companies, Customers | ver D4 | | | |
| Organization, My company, My workspace | ver D5 | | | |
| Overview (Visits), Overview (Tags), Tags overview | Team results, Pieces results | Resultado da equipe, Resultado das peças | Resultados del equipo, Resultados de piezas | |
| Dashboard (Tags) | Home | Início | Inicio | MODULES já chama de Início |
| Production log | History | Histórico | Historial | |
| NFC writers | Chip writers | Gravadores de chip | Grabadores de chip | |
| Not received | Not in stock yet | Ainda fora do estoque | Aún fuera del stock | |
| Not set up | No customer yet | Sem cliente | Sin cliente | Alinha EN ao que PT e ES já dizem |
| Set up, not live | Ready, not live | Pronta, fora do ar | Lista, sin activar | |
| With the customer | Sold | Vendida | Vendida | Um nome para o status `sold` |
| Retired | Deactivated | Desativada | Desactivada | |
| Leads (filtro que inclui prospects) | In progress | Em andamento | En curso | Prospects continua como o conjunto não visitado |

Mantidos: Piece, Plate, Stand, Live, Paused, Reseller, Route, Visit, Task, Consignment, Kit.

## Achados por área

### A peça (popup, página e tela do revendedor)

É a mesma tela para todo mundo (`components/piece/pieceView.ts:81-86`), então cada problema aqui aparece para o revendedor
também.

- **Três status onde cabe um.** Digital, Physical stock e Chip, lado a lado (`pieceView.ts:28-33`,
  `PieceHeader.tsx:35`). Ninguém pergunta "qual o status digital"; pergunta "está pronta?".
- **Botão que não funciona.** "Set up this piece" desabilitado, com aviso mandando fazer outra coisa antes
  (`CustomerDestinationSection.tsx:309-316`).
- **Regra interna na tela.** "Testing the chip doesn't move it" (`i18n/messages/pieceCustody.ts:10-11`).
- **Seis seções abertas.** Custódia, cliente, chip, venda, desempenho, gestão e atividade, sem recolher nada
  (`PieceBody.tsx:30-38`).
- **Bastidor no mesmo nível do essencial.** Kit, Held by, Owned by, Acquisition cost
  (`ManagementSection.tsx:89-92`), e o campo de transferir mostra o seletor mesmo quando a regra bloqueia
  (`ManagementSection.tsx:175-177`).
- **Dois modos da mesma peça.** "Open in management" e "Open as reseller view" (`i18n/messages/pieceScreen.ts:21-22`).

**Proposta (vira o PR 1):** um status derivado dos três, uma ação principal por situação, o resto em "Mais detalhes".

| Situação (status · estoque · chip · venda) | Status na tela | Ação principal |
|---|---|---|
| estoque `pending` | Ainda fora do estoque | Quem produz: abrir a impressão. Revendedor: Receber, só se puder |
| `inventory` · `available` | Em estoque, sem cliente | Configurar |
| `assigned` · chip não gravado | Pronta, falta gravar o chip | Gravar chip |
| `assigned` · chip gravado | Pronta, fora do ar | Colocar no ar |
| `active` | No ar | Ver desempenho |
| `disabled` | Pausada | Reativar |
| venda registrada | Vendida | Nenhuma; mostra o cliente |
| `damaged`, `lost`, `retired` | Estragada, Perdida, Desativada | Nenhuma |

### Estoque: quatro caminhos para o mesmo resultado

1. Marcar a impressão como feita; as peças boas entram em estoque (`i18n/messages/production.ts:214,218`).
2. "Put N pieces in stock", para impressões antigas (`i18n/messages/production.ts:220-222`).
3. Aba Receive do lote, por leitura (`pages/admin/tags/BatchDetail.tsx:138`).
4. Botões Receive na própria peça (`components/piece/CustodyCard.tsx:20-78`, rota em `server/tags/routes.ts:689`).

O caminho 4 não é sobra: aplica as regras da estação de entrada e deixa um revendedor receber peças da própria
organização (`shared/tagCustody.ts:36-62`). O problema é a ordem: para peça impressa pela casa, ele aparece antes do
caminho normal, que é o 1. **D6** decide quando cada um aparece.

### Navegação

- **Três áreas paralelas.** Módulo com grupo Manage (`moduleNav.ts:183-247`), painel por perfil
  (`moduleNav.ts:318-375`) e conta (`moduleNav.ts:272-278`). "Back to my app" e "Open panel"
  (`i18n/messages/workspaces.ts:20-21`) existem porque a pessoa precisa saber em qual área está.
- **Painel da plataforma com cerca de 20 itens.** Today, mais My company com produção, estoque, entrega, resultado,
  histórico, gravadores, leads, tarefas, vendas e equipe, mais Platform com 8 itens (`moduleNav.ts:341-362`).
- **Duas entradas para uma tela.** Distribution e Stuscle orders abrem a mesma rota com `?view=`
  (`moduleNav.ts:340`, `pages/admin/tags/KitsTab.tsx:219`).
- **Mesmo nome, telas diferentes.** Shop do revendedor e Shop do admin (`moduleNav.ts:222,240`); Overview de Visits e
  de Tags (`i18n/messages/shell.ts:30,33`).
- **Organização com 7 abas**, três delas repetindo telas que já existem: inventory, kits, customers
  (`pages/xpot/OrganizationsPage.tsx:215`).

### "O que precisa de mim", em três lugares

Today do painel (`pages/admin/home-model.ts:100-131`), Needs action no Tags overview
(`pages/admin/tags/OverviewTab.tsx:71-74`) e Needs attention no Dashboard de Visits
(`pages/xpot/XpotDashboard.tsx:387`). Cada uma soma coisas diferentes. Uma lista só, por perfil, resolve.

### Produção

- **Impressões em aberto em dois lugares:** "Waiting to print" no quadro (`pages/admin/tags/production-board.tsx`,
  `RequestList filter="open"`) e a aba Orders (`pages/admin/tags/ProductionTab.tsx:65`).
- **Comando de terminal na tela:** `python print-pipeline/bench.py run` (`i18n/messages/productionBoard.ts:28`).
  "Used by the bench and by Claude" no campo de slug (`i18n/messages/production.ts:42`).
- **Lote com abas Summary, Print e Receive** (`BatchDetail.tsx:138`), que só fazem sentido para peça de fornecedor.

### Revendedor (Tags)

- **Jargão da casa:** "In your kit", "Ask Skale Club for a kit", "map its batch to a product"
  (`i18n/messages/tags.ts:67,117,302`).
- **8 filtros em My pieces:** status, venda, chip, busca, empresa, face, scans, cliente
  (`pages/tags/PiecesScreen.tsx:25-31,59`). Um revendedor tem dezenas de peças, não milhares.
- **Início está bom:** ler a peça, digitar o código (`pages/tags/HomeScreen.tsx:182-294`).

### Visits

- **Leads:** o filtro "Leads" inclui prospects trabalhados, e "Prospects" é um conjunto à parte
  (`pages/xpot/XpotLeads.tsx:156-175`). A mesma palavra com dois sentidos na mesma barra.
- **Dashboard:** 3 KPIs, seletor de métrica e período, e 4 blocos (`pages/xpot/XpotDashboard.tsx:175-485`). Para quem
  está na rua, "Seu dia" e "Precisa de atenção" bastam; o resto é relatório.
- **Sales:** 4 abas (`pages/xpot/XpotSales.tsx:169-173`). Pipeline é a visão do GoHighLevel e mostra um aviso quando a
  integração está desligada (`XpotSales.tsx:218-262`); melhor sumir a aba do que avisar.
- **Route:** 1.953 linhas num arquivo (`pages/xpot/XpotProspecting.tsx`), revisado há dias em
  `docs/AUDITORIA_ROTAS.md`. Mexer só depois de validar aquelas correções em uso.

### Sem necessidade de mudança agora

`/my` (538 linhas, `pages/my/`, `i18n/messages/myPlates.ts`) está limpo e é a referência de tom. Check-in é enxuto
(`pages/xpot/XpotCheckIn.tsx:477-494`). Settings tem 5 seções claras (`pages/xpot/XpotSettings.tsx:77`). Person,
Status e Integrations são técnicos, mas só a plataforma vê.

## O que cada pessoa veio fazer

| Perfil | Tela | A única coisa que importa |
|---|---|---|
| Revendedor | Início | Ler uma peça e configurar para o cliente |
| Revendedor | My pieces | Ver quais ainda não estão no ar |
| Vendedor | Dashboard | Saber o que fazer hoje |
| Vendedor | Leads | Achar a empresa e registrar a visita |
| Dono | Today | Ver o que está esperando por ele |
| Dono | Stock | Saber onde cada peça está |
| Quem produz | Production | Imprimir o que está na fila |
| Plataforma | Organizations, People | Aprovar e dar acesso |
| Dono da plaquinha | /my | Ver se a plaquinha está sendo usada |

## Plano em PRs

Ordem por risco: primeiro texto, depois tela, depois regra. Cada PR fecha sozinho, com CI verde e deploy.

| PR | O que faz | Arquivos principais | Pronto quando | Tam. | Risco | Depende |
|---|---|---|---|---|---|---|
| 0 | Fechar D1 a D7 e gravar o glossário em `docs/MODULES.md` §5 | `docs/MODULES.md` | Glossário sem termo em aberto | S | Nenhum | Decisões |
| 1 | Peça: um status, uma ação, "Mais detalhes" | `components/piece/*`, `pages/admin/tags/PiecesTab.tsx`, `tests/piece-view.test.ts` | Tabela de situações acima coberta por teste puro; popup abre sem rolagem em 1366px | M | Baixo | 0 |
| 2a | Aplicar o glossário nos três idiomas; tirar comando, "Claude" e regra do chip | `i18n/messages/*` (10 dicionários com "house"), `tests/module-nav.test.ts`, `tests/admin-tags-flow.test.ts` | `grep -i "house stock\|bench.py" i18n/` vazio; testes verdes | M | Baixo | 0 |
| 2b | Nome da organização no lugar de "Skale Club" | servidor expõe o nome da casa da peça; `i18n/messages/tags.ts:117-132,302-306` | Revendedor de parceiro nunca lê "Skale Club" | M | Baixo | 2a |
| 3 | Navegação: nomes únicos, Stuscle orders dentro de Hand out, Shop do admin renomeado, Organização sem abas repetidas | `moduleNav.ts`, `pages/xpot/OrganizationsPage.tsx:215`, `tests/module-nav.test.ts` | Nenhum rótulo repetido no mesmo painel; URLs iguais | M | Baixo | 2a |
| 4 | Uma lista de "o que precisa de mim" por perfil | `home-model.ts`, `OverviewTab.tsx`, `XpotDashboard.tsx`, `tests/admin-home.test.ts` | Needs action e Needs attention somem; Today cobre os dois | M | Médio | 3 |
| 5 | Produção: fila única; lote só em "Other ways"; Leads com filtro "Em andamento" | `production-board.tsx`, `ProductionTab.tsx`, `BatchDetail.tsx`, `XpotLeads.tsx` | "Waiting to print" e Orders viram uma lista | M | Médio | 3 |
| 6 | Estoque: caminho por origem da peça (D6); Receive só para fornecedor e revendedor | `CustodyCard.tsx`, `shared/tagCustody.ts`, `tests/tags/custody.integration.test.ts` | Peça impressa pela casa nunca mostra Receive | L | Médio | 1, 5 |
| 7 | Revendedor e vendedor: My pieces com 3 filtros; Dashboard só com o dia; Pipeline some sem GHL | `PiecesScreen.tsx`, `XpotDashboard.tsx`, `XpotSales.tsx` | Decidido depois de ver uso real | M | Baixo | 2a |
| 8 | Unificar módulo, painel e conta (D7) | `moduleNav.ts`, `AppLayout.tsx` | Só se 1 a 7 não bastarem | L | Alto | 1 a 7 |

Testes que comparam texto e vão quebrar de propósito nos PRs 2a e 3: `tests/module-nav.test.ts`,
`tests/admin-tags-flow.test.ts`, `tests/piece-view.test.ts`, `tests/admin-home.test.ts` e os de integração em
`tests/tags/` que citam "house stock". Atualizar junto, nunca antes.

Os PRs 1, 2a e 3 podem andar em paralelo depois do PR 0; 2b, 4 e 5 depois do 3; 6 e 7 por último.

## Decisões

Fechadas em 2026-11-01 com as recomendações da auditoria, aprovadas pelo dono. O glossário vale em `docs/MODULES.md` §5.

- **D1. Mesa de impressão:** "Impressão" (Print job, Impresión). "Plate" fica só para o produto.
- **D2. Estoque:** Stock, Estoque, Stock, em toda a interface. "Inventory" e "Inventário" saem.
- **D3. Kit:** a tela se chama "Entregar peças" (Hand out, Entregar piezas). "Kit" fica só no nome do pacote (K-0001).
- **D4. Clientes:** "Clientes" em Tags e "Companies" em Visits. O filtro "Leads" vira "Em andamento".
- **D5. Área do negócio:** "Organização" na plataforma, "Minha empresa" para o dono. "Workspace" sai.
- **D6. Recebimento:** peça impressa pela casa entra em estoque só ao marcar a impressão. Receive fica para fornecedor
  e revendedor (PR 6).
- **D7. Três áreas viram uma?** Em aberto: decidir depois dos PRs 1 a 5.
