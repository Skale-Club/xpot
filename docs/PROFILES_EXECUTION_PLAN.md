# Plano de execução: quatro perfis, quatro painéis

**Rev. 2** · base `24fb6ef` · 2026-11-01 · **D1 a D6 decididas pelo dono (§3); falta D7**. A Rev. 1 era a
proposta; as tabelas abaixo já incorporam as respostas.

Contexto que muda o plano: hoje a plataforma tem **dois usuários, ambos super admins** (os dois donos da empresa).
Não há dado legado de Manager, de dono ou de membro a preservar: tudo pode ser alterado, e o objetivo é **chegar à
produção já no modelo novo**.

Plano de readequação completa do Xpot aos quatro tipos de pessoa que usam a ferramenta, com um painel para cada
um. Cobre regras de acesso, dados, cada tela, cada rota do servidor, o MCP, a estação de impressão e os testes.
Segue o formato de [organizations-execution-plan.md](./organizations-execution-plan.md) e
[PRINT_EXECUTION_PLAN.md](./PRINT_EXECUTION_PLAN.md).

---

## 1. Visão

Quatro perfis, nas palavras do dono (2026-11-01):

| # | Perfil | O que é | Vê | Pode |
|---|---|---|---|---|
| P1 | **Super admin** (Skale, donos da plataforma) | A nossa empresa, que também produz | Tudo: a nossa empresa e todas as outras, com seus funcionários | Tudo, inclusive imprimir e gerar seriais |
| P2 | **Parceiro produtor** (fornecedores de outros lugares) | Uma organização capaz de produzir | Só a própria organização | Gerar serial, código e arquivo de impressão; imprimir. Nada do que o super admin vê |
| P3 | **Dono de organização** (empresas que vendem na rua) | Dono de um time de vendedores | Só a própria organização, inteira | Gerir o time, o estoque e as vendas. **Não** cria plaquinha |
| P4 | **Funcionário** (membro de uma organização) | Um vendedor | Só as próprias plaquinhas | Vender, ativar, **comprar** plaquinhas. **Não** imprime nem gera |
| P5 | **Dono das plaquinhas** (o negócio que comprou e usa as peças; Rev. 2, **a confirmar, D7**) | O cliente final: um restaurante com três placas de avaliação | Só as próprias plaquinhas | Ver quantas tem, quantas leituras cada uma teve, para onde apontam. Só leitura |

Regra transversal: **o estoque é um só e fica alinhado entre os quatro**: toda peça pertence a uma organização, e
cada perfil enxerga a fatia que lhe cabe da mesma verdade.

### 1.1 O que existe hoje, perfil a perfil

| Perfil | Hoje no código | Estado |
|---|---|---|
| P1 Super admin | `users.is_admin` (`isSuperAdmin`, `requireSuperAdmin`, `requireTagAdmin`) | Existe. Mistura "controlo a plataforma" com "a minha empresa produz" num só painel |
| P2 Parceiro | **Nada** | Não existe. Produção não tem organização e todas as rotas exigem `is_admin` |
| P3 Dono | Rep Admin (`organization_memberships.role = 'admin'`) | Regras do servidor certas (`listScope`, `canManageOrganization`); painel fraco: Organizações + Leads/Tarefas/Vendas, sem início, sem estoque, `/admin` bloqueado |
| P4 Funcionário | Rep (`sales_reps.role = 'rep'`, membro) | Praticamente certo. Compra pela Loja (código de atacado + Stuscle) |
| P5 Dono das plaquinhas | **Nada** com login. A peça conhece o cliente (`tags.lead_id`) e tem analytics (`/api/xpot/tags/:id/analytics`), mas só o vendedor vê | Não existe |
| *(fora do modelo)* | **Manager** (`sales_reps.role = 'manager'`) | Vê **todas** as organizações e o estoque inteiro, sem ser super admin. Ninguém usa (D1): **sai** |

---

## 2. Modelo de acesso: dois eixos, não quatro cargos

Em vez de quatro cargos soltos, quatro campos que já existem (ou quase):

| Eixo | Valores | Onde fica |
|---|---|---|
| **Plataforma** | sim / não | `users.is_admin` (mantido, só muda o nome na UI: "Plataforma") |
| **Tipo da organização** | `producer` (produz) / `seller` (vende) | **novo** `organizations.kind` |
| **Papel na organização** | `owner` / `member`, só isso (D6) | `organization_memberships.role` (`admin` → lido como "dono", `member` = funcionário; o enum não muda) |
| **Distribuição** (só produtoras) | `xpot` (nós cuidamos: Stuscle, nos EUA) / `own` (o parceiro cuida, fora dos EUA) | **novo** `organizations.distribution` (D3) |

| Perfil | Plataforma | Organização | Papel |
|---|---|---|---|
| P1 Super admin | sim | `xpot-company` (`producer`, já existe: `companyOrganizationId`) | owner |
| P2 Parceiro | não | a dele, `producer` | owner |
| P3 Dono | não | a dele, `seller` | owner |
| P4 Funcionário | não | a dele, `seller` | member |

O painel sai desses campos. Uma única função decide o perfil em todo lugar (§5.1 `shared/profiles.ts`).

Regras derivadas:

- **Produzir** = ser `owner` de uma organização `producer` (P1 e P2). Nunca mais "ser `is_admin`".
- **Plataforma** (todas as organizações, pessoas, integrações, marca, status) = `is_admin` (P1 só).
- **Estoque "da casa"** = peças **da minha organização** sem vendedor (`organization_id = minha AND rep_id IS NULL`).
  Hoje é só `rep_id IS NULL` ([shared/tagMetrics.ts](../shared/tagMetrics.ts) `house`), o que misturaria o estoque de
  um parceiro com o nosso.
- **Funcionário de uma produtora** é um funcionário como outro qualquer (P4): as próprias peças, sem produção. O
  parceiro quase sempre é uma pessoa só (D6); se precisar de uma segunda pessoa produzindo, a Plataforma a torna
  segundo dono. Não existe "funcionário que produz".

---

## 3. Decisões

### 3.1 Decididas (dono, 2026-11-01)

| # | Decisão | Resposta | Consequência no plano |
|---|---|---|---|
| **D1** | **Manager** | Só existem dois usuários, os dois super admins. Mude o que for preciso | Manager **sai** de vez: sem migração de dados, sem lista manual. A migração `manager_retire` vira só uma checagem (`SELECT count(*) ... role='manager'` = 0) e o valor some do enum numa migração posterior. `sales_reps.role` deixa de ter significado de acesso; o que conta é `users.is_admin` + papel na organização |
| **D2** | **Catálogo do parceiro** | Só imprime os **nossos** modelos. O que muda é o material: qual NFC ele usa (o que indicamos), onde compra. Ele só faz o que liberarmos | Modelos ficam `organization_id IS NULL` (da plataforma). Cada modelo ganha **ficha de materiais** (`print_models.materials`: adesivo NFC 10×20, filamento, cores, fornecedor indicado) e o parceiro vê um **"O que você precisa"** antes de produzir. A organização produtora ganha **capacidades liberadas** (`producer_capabilities`: quais modelos, se pode gerar seriais, se pode gravar chip) que só a Plataforma edita. Modelo próprio de parceiro: fora do plano |
| **D3** | **Venda e distribuição do parceiro** | Cada parceiro terá a **sua** forma. Nos EUA nós cuidamos (Stuscle); fora, o parceiro cuida. Organiza-se quando chegar o primeiro parceiro | O esquema já nasce com `organizations.distribution` (`xpot` / `own`) e o código trata os dois caminhos como **plugáveis**: a F6 define a interface (quem recebe o pedido, quem separa, para quem o kit sai) e implementa só o caminho `xpot`. O caminho `own` entra quando o primeiro parceiro existir |
| **D4** | **Compra do funcionário** | O dono **não aprova**; o pagamento fica na Stuscle | Como a Rev. 1 assumia. Em uma frase: o funcionário compra na Stuscle com o código dele, as peças chegam na organização em nome dele, e o dono só **vê** a lista de compras do time (e pode redistribuir as peças depois) |
| **D5** | **Vendedor sozinho** | Visão simples, **mas** ele é uma organização: pode incluir pessoas para trabalhar com ele | A organização pessoal (`rep-<id>`) é uma organização de verdade desde o início: o vendedor sozinho é o **dono** dela. Ele vê o app simples e, nas Configurações, "Minha organização › Convidar pessoa". Quando entra a segunda pessoa, o painel de dono aparece (`runsATeam` já faz isso) |
| **D6** | **Papéis dentro da organização** | Simples: **o dono vê tudo; quem entrar a mais é funcionário**, cada um com as suas plaquinhas e o seu lado, na mesma empresa (o autônomo que adiciona a esposa). Um segundo dono só quando a empresa pedir e a Plataforma der o acesso | Fica o que já existe: `admin` (dono) e `member` (funcionário). Nenhum papel novo, nenhuma migração. Promover a dono é um botão só da Plataforma (P1) na página da organização; o convite do dono cria sempre funcionário |

### 3.2 Em aberto

| # | Decisão | Opções | Recomendação assumida | Bloqueia |
|---|---|---|---|---|
| **D7** | **Dono das plaquinhas** (P5): é o cliente final, o negócio que usa as placas? | (a) sim, o cliente final (lead), painel só de leitura; (b) era outra coisa | **(a)**: painel do cliente, fase F7, com entrada por código da peça + telefone (Supabase, já usado no login) e vínculo `lead ↔ user`. Só leitura: minhas plaquinhas, leituras, destino, "fale com o vendedor" | F7 |

---

## 4. Contrato de permissões (alvo)

Enforçado no servidor; esconder navegação nunca é a fronteira. "Org" = a própria organização.

| Capacidade | P1 Super admin | P2 Parceiro (dono) | P3 Dono | P4 Funcionário |
|---|---|---|---|---|
| **Plataforma** | | | | |
| Ver/criar/editar qualquer organização, inclusive `kind` | Sim | Não | Não | Não |
| Pessoas de toda a plataforma (aprovar, bloquear, Plataforma sim/não) | Sim | Não | Não | Não |
| Integrações, Xphere, Marca e site, Landing, Status do sistema | Sim | Não | Não | Não |
| Vitrine da Loja (Tags › Shop) | Sim | Não | Não | Não |
| Produtos (catálogo de venda), Regras de check-in | Sim | Não | Não | Não |
| **Organização** | | | | |
| Ver a própria organização (visão geral, time, estoque, kits, clientes, config.) | Sim (qualquer) | Sim (a sua) | Sim (a sua) | Só o próprio recorte |
| Adicionar/remover/bloquear membros da org | Sim | Sim | Sim | Não |
| Editar nome/config. da org | Sim | Sim | Sim | Não |
| Ver compras (pedidos Stuscle) do time | Sim (todas) | Sim (org) | Sim (org) | Só as próprias |
| **Produção** (só `producer`) | | | | |
| Catálogo de modelos (ver, usar) | Sim | Sim (só os da plataforma que a Plataforma liberou, D2) | Não | Não |
| Criar/editar modelos e versões, upload de arquivos e preview | Sim | Não (D2) | Não | Não |
| Pedidos de impressão, placas, baixar arquivo, marcar impressa | Sim | Sim (org) | Não | Não |
| Lotes: criar, gerar códigos/seriais, estação de recebimento, exportar CSV/QR | Sim | Sim (org) | Não | Não |
| Estações (bench/gravador NFC): parear, revogar | Sim | Sim (org) | Não | Não |
| Jornada (passos de produção) | Sim | Sim (org) | Não | Não |
| Tokens MCP e conexões | Sim | Sim (org, escopo da org) | Não | Não |
| **Estoque e distribuição** | | | | |
| Estoque da casa (peças da org sem vendedor) | Sim | Sim (org) | Sim (org) | Não |
| Dar kit a um vendedor da org / receber de volta | Sim | Sim (org) | Sim (org) | Não |
| Dar kit a **outra** organização | Sim | Só com `distribution = own`, para vendedoras vinculadas (D3, F6) | Não | Não |
| Atender pedido Stuscle (separar peças) | Sim (do estoque da casa `xpot-company`) | Não (D3) | Não | Não |
| Peças da org: editar, uso interno, voltar ao estoque, dano, reatribuir | Sim | Sim (org) | Sim (org) | Não |
| Filas e relatórios (Visão geral de Tags, analytics, relatório) | Sim (tudo) | Sim (org) | Sim (org) | Não |
| **Vendedor** | | | | |
| Minhas peças: ativar, destino, gravar/apagar chip, vender, devolver | Sim | Sim | Sim | Sim (as próprias) |
| Comprar kits (código de atacado + Stuscle) | Sim | Não (D3) | Sim | **Sim** |
| Clientes, visitas, rota, tarefas, vendas (módulo Visitas) | Sim | Sim | Sim (org inteira) | Sim (as próprias) |
| Buscar peça por código (`/tags/lookup`) | Sim | Sim (org) | Sim (org) | Sim (as próprias) |

Dentro de uma organização só há dois papéis (D6): o **dono** (coluna P3) e o **funcionário** (coluna P4). Promover
um funcionário a segundo dono é ação da Plataforma (P1), a pedido da empresa.

**P5 Dono das plaquinhas** (D7, só leitura): ver as peças ligadas ao seu negócio (`tags.lead_id`), as leituras de
cada uma (os mesmos números de `/api/xpot/tags/:id/analytics`, sem dados de outros clientes), o destino atual e o
contato do vendedor. Nada de editar, ativar, gravar ou comprar: isso continua com o vendedor.

---

## 5. Inventário completo: de onde está para onde vai

### 5.1 Regra única (novo)

| Arquivo | Conteúdo |
|---|---|
| `shared/profiles.ts` (novo) | `profileOf(me)` → `"platform" \| "producerOwner" \| "sellerOwner" \| "member"`; `can(profile, capability)` com a tabela da §4; `organizationKind`. Substitui, aos poucos, `canManage`/`isSuperAdmin` ([shared/modules.ts](../shared/modules.ts)), `platformRoleOf`/`managesEveryOrganization`/`runsATeam` ([shared/organizations.ts](../shared/organizations.ts)) e `managementReach` ([client/src/lib/adminMode.ts](../client/src/lib/adminMode.ts)) |
| `server/routes/xpot/middleware.ts` | `requireProfile(...)`/`requireCapability(...)` ao lado de `requireXpotUser`; `listScope` perde o caso Manager (D1) e mantém o mecanismo atual: as telas pessoais mostram o próprio trabalho e a gestão é explícita na URL (`X-Xpot-View: manage`, `client/src/lib/workspace.ts`). Essa decisão já está no código e não muda |
| `server/tags/access.ts` | `requireProducer` (dono de `producer`, com `actor.producerOrganizationId`) substitui `requireTagAdmin` nas rotas de produção; `requireTagManager` passa a aceitar dono (org) |
| `tests/profiles.test.ts` (novo) | A tabela da §4 como teste de mesa: para cada perfil × capacidade, permitido ou não |

### 5.2 Dados

O runner (`scripts/migrate.ts`) aplica os `.sql` em ordem lexical, então cada migração recebe o próximo número
livre **quando o PR dela entra** (a próxima é `0065`). Abaixo, o nome lógico, a fase e a ordem prevista.

| Migração (nome lógico) | Fase | Mudança | Backfill |
|---|---|---|---|
| `organization_kind` | F0 | `organizations.kind text NOT NULL DEFAULT 'seller' CHECK (kind IN ('producer','seller'))`; `organizations.distribution text NOT NULL DEFAULT 'xpot' CHECK (distribution IN ('xpot','own'))` (D3); `organizations.producer_capabilities jsonb NOT NULL DEFAULT '{}'` (D2) | `xpot-company` → `producer`, `distribution = 'xpot'`, capacidades completas |
| `manager_retire` | F0 | Checagem: falha se existir `sales_reps.role = 'manager'` ativo (hoje não existe). Nenhum poder ligado a `role` daí em diante | Nenhum |
| `acquisition_organization` | F4 | `tag_acquisitions.organization_id` (org do comprador) e `fulfilled_from_organization_id` (quem separou); índice `tags (organization_id, rep_id, stock_status)` para o novo "da casa" | `organization_id` ← org ativa do `rep_id`; `fulfilled_from` ← `xpot-company` nos atendidos |
| `production_organization` | F5 | `tag_batches.organization_id`, `print_models.organization_id` (null = plataforma), `print_requests.organization_id`, `print_jobs.organization_id`, `tag_provisioning_devices.organization_id`, `tag_journey_entries.organization_id`, `mcp_tokens.organization_id`, `mcp_oauth_tokens.organization_id`; índices `tag_batches (organization_id, created_at)`, `print_jobs (organization_id, status)` | Tudo → `xpot-company`. `print_models` existentes → `NULL` (catálogo da plataforma, D2) |
| `print_model_materials` | F5 | `print_models.materials jsonb NOT NULL DEFAULT '[]'`: `[{ kind: "nfc_sticker", spec: "10x20", supplier, url }, { kind: "filament", color, supplier }]` | Preencher para os modelos atuais (adesivo 10×20 em todos os modelos novos, ver memória do projeto) |
| `partner_links` | F6 | `organization_links (producer_id, seller_id)`: as vendedoras vinculadas a um parceiro `own` | Nenhum |
| `customer_accounts` | F7 | `lead_accounts (lead_id, user_id, verified_at)` | Nenhum |

Invariantes (acrescentam às de organizations-execution-plan.md): toda peça, lote, placa, pedido, estação e compra
tem organização; só `producer` tem produção; `is_admin` nunca é condição para produzir.

### 5.3 Telas do cliente

Legenda: **P1** super admin · **P2** parceiro · **P3** dono · **P4** funcionário · ✓ vê · ✗ não vê · (org) só a sua org.

#### 5.3.1 Entrada, shell e navegação

| Tela / componente | Hoje | Alvo | Trabalho |
|---|---|---|---|
| `App.tsx` rotas | `/admin/*` só `canManage`; `/organizations` todos | Mesmas URLs; a guarda vem de `profileOf` | Trocar as condições, sem mudar URLs (decisão já tomada em MODULES.md) |
| `AdminApp.tsx` (`SECTIONS`, `SUPER_ADMIN_SECTIONS`, `organizationOnly`) | Dois painéis: "Super admin panel" / "Team management"; dono só entra em `work` | **Quatro** painéis pelo perfil: P1 "Plataforma" + "Minha empresa"; P2 "Produção"; P3 "Minha organização"; P4 não tem painel | Reescrever a montagem dos grupos; `panelName` por perfil |
| `moduleNav.ts` (`managementGroups`, `organizationPanelGroups`, `accountGroups`, `platformItems`, `administrationItems`) | Grupos por `canManage`/`isAdmin` | Grupos por perfil (ver §6) | Reescrever; manter `contextOfPath`/`visitsScreen` |
| `AdminMode.tsx` (porta de entrada e barra âmbar) | "Super admin panel" / "Team management" | Rótulo por perfil: "Plataforma", "Produção", "Minha organização" | Só rótulos + destino |
| `AppLayout.tsx` (sidebar, ⌘K, tab bar, `AdminBadge`) | Badge "Xpot admin" em `adminOnly` | Badge "Plataforma" só para P1; itens de produção marcados "Produção" | Rótulos; o palette lê `moduleNav` |
| `XpotSettings.tsx` | Perfil, rota, módulos, Xphere | + "Minha organização" (nome, papel, **Convidar pessoa** para o vendedor sozinho, D5) e "Código de atacado" (P3/P4) | Pequeno |
| **Novo** `/my/*` (painel do cliente, P5, D7) | — | Entrar com código da peça + telefone; "Minhas plaquinhas"; detalhe com leituras e destino; "Falar com o vendedor" | Novo app pequeno, só leitura (F7) |
| `Login.tsx`, legais, landing | Público | Sem mudança | — |

#### 5.3.2 Painel home ("Today", `AdminHome.tsx` + `home-model.ts`)

| Perfil | Linhas (cada uma abre a lista atrás) |
|---|---|
| P1 **Plataforma** | Pessoas aguardando aprovação; organizações novas sem dono; pedidos Stuscle pagos a separar; estações offline |
| P1 **Minha empresa** / P2 Produção | Mesas para imprimir; arquivos travados há mais de N h (não "sendo gerados"); **impressões falhas**; lotes aguardando peças (org); chips para gravar (org); lidas e fora do ar (org); sem produto |
| P3 Dono | Compras do time a receber (D4); peças paradas sem destino há N dias; vendedores sem kit; lidas e fora do ar (org); clientes sem visita há N dias; convites pendentes |
| P4 | Não tem painel: o início dele é `/tags` (HomeScreen) |
| P5 | Não tem "Hoje": a home dele é a lista das próprias plaquinhas com as leituras da semana |

Trabalho: `todayRows` recebe `profile` e `organizationId`; novas filas no servidor (`tagQueues.ts` + `repository.ts`
overview) com escopo de org; corrigir os dois pontos de conteúdo achados em 2026-11-01 (arquivos gerando não é tarefa;
falhas não aparecem).

#### 5.3.3 Painel: seções de `/admin`

| Seção | Hoje | P1 | P2 | P3 | P4 | Trabalho |
|---|---|---|---|---|---|---|
| `/admin` home | ✓ `canManage` | ✓ | ✓ | ✓ | ✗ | §5.3.2 |
| `/admin/overview` (Visão geral de Visitas, `AdminOverview.tsx`, `team-activity`) | managers | ✓ (todas) | ✗ | ✓ (org) | ✗ | `team-activity` com escopo de org |
| `/admin/work/{leads,tasks,sales}` (`AdminWork.tsx`) | managers e dono | ✓ | ✗ | ✓ (org) | ✗ | Já usa `listScope`; só a guarda |
| `/admin/products` | managers | ✓ | ✗ | ✗ | ✗ | Vira Plataforma: o catálogo de venda é da Skale |
| `/admin/settings` (regras de check-in) | managers | ✓ | ✗ | ✗ | ✗ | Continua global, na Plataforma. Regras por organização ficam fora deste plano |
| `/admin/reps` + `PersonDetail.tsx` + `PersonTagsSales.tsx` | managers | ✓ (todos) | ✗ | ✗ (usa o Time da org) | ✗ | Vira Plataforma › Pessoas. Campo "Role" vira "Plataforma: sim/não"; sem Manager (D1); mostra org e tipo |
| `/admin/integrations`, `/admin/xphere` | P1 | ✓ | ✗ | ✗ | ✗ | Sem mudança |
| `/admin/branding`, `/admin/landing` | P1 | ✓ | ✗ | ✗ | ✗ | Sem mudança |
| `/admin/health` | P1 | ✓ | ✗ | ✗ | ✗ | Sem mudança |
| `/admin/tags/*` | ver 5.3.4 | | | | | |

#### 5.3.4 Painel: Tags (`admin/tags/AdminTags.tsx` `TABS` e subtelas)

| Aba / tela | Hoje | P1 | P2 | P3 | P4 | Trabalho |
|---|---|---|---|---|---|---|
| `overview` (`OverviewTab.tsx`, filas, atividade, scans por peça) | managers | ✓ tudo | ✓ (org) | ✓ (org) | ✗ | `/admin/tags/overview` recebe `organizationId` do perfil; filas com escopo; `needsActionQueues` por perfil |
| `overview/<fila>` (listas das filas) | managers | ✓ | ✓ (org) | ✓ (org) | ✗ | `GET /api/xpot/tags?queue=` com org |
| `production` (`ProductionTab.tsx`: board, `queue`, `models`, `models/<slug>`, `jobs/<id>`, `batches/<id>`, `batches?pending=1`, wizard) | `adminOnly` | ✓ | ✓ (org) | ✗ | ✗ | Guarda `producerOwner`; todas as consultas filtradas pela org da produtora; catálogo = modelos da plataforma liberados para ela (D2) |
| `production-board.tsx`, `production-generate.tsx`, `production-orders.tsx`, `production-job.tsx`, `production-model.tsx`, `production-preview*.tsx`, `production-printed-dialog.tsx`, `production-wizard.tsx`, `production-identity.tsx` | idem | ✓ | ✓ | ✗ | ✗ | Sem mudança de UI além de esconder "editar modelo" para P2 quando o modelo é da plataforma |
| `BatchDetail.tsx`, `batch-receive.tsx`, `scan-station.tsx`, `returns-station.tsx`, `code-check-list.tsx` | admin | ✓ | ✓ (org) | ✗ | ✗ | Lote carrega `organization_id`; estação só recebe peças da própria org |
| `pieces` (`PiecesTab.tsx`, `PieceDetail.tsx`, `piece-table.tsx`, `pieces-analytics.tsx`, `pieces-NfcProvisioningCard.tsx`) | managers | ✓ tudo | ✓ (org) | ✓ (org) | ✗ | Lista e detalhe com escopo; ações de produção (gravação por estação) só P1/P2 |
| `kits` (`KitsTab.tsx`, `kits-give-form.tsx`, `kits-list.tsx`, `distribution-model.ts`, pedidos Stuscle `?view=orders`) | managers | ✓ | ✓ (org; a vendedoras vinculadas só com `own`, F6) | ✓ (org: dar/receber dos próprios funcionários) | ✗ | Origem do kit = estoque da casa **da org**; pedidos Stuscle: P1 atende; P3 só vê os do time (D4) |
| `shop` (`ShowcaseTab.tsx`, vitrine) | `adminOnly` | ✓ | ✗ | ✗ | ✗ | Vira Plataforma |
| `journey` (`JourneyTab.tsx`, `JourneyPanel.tsx`, `JourneyForms.tsx`, `JourneyMcpCard.tsx`) | `adminOnly` | ✓ | ✓ (org) | ✗ | ✗ | Entradas com org; tokens MCP da org |
| `provisioners` (`ProvisionersTab.tsx`) | `adminOnly` | ✓ (todas) | ✓ (org) | ✗ | ✗ | Estação pareada à org de quem pareou |
| `CodeLookup` (busca por código na barra) | managers | ✓ | ✓ (org) | ✓ (org) | ✓ (próprias) | `/tags/lookup` já respeita `canWorkOnTag`; estender ao dono |
| `/admin/tags/batches*` (links antigos) | admin | redireciona | redireciona | ✗ | ✗ | `productionPath` já cobre |

#### 5.3.5 Área da organização (`/organizations`, `OrganizationsPage.tsx`, `OrganizationPerson.tsx`)

Decisão de arquitetura (F1): **um painel por perfil**. O conteúdo das abas abaixo passa a viver no painel `/admin`
do dono (P3), montado com os mesmos componentes do painel de Tags. `/organizations` fica como a lista da Plataforma
(P1), e `/organizations/:id` como o "ver como o dono" da F3. As linhas descrevem o conteúdo, onde quer que ele seja
renderizado.

| Tela | Hoje | Alvo | Trabalho |
|---|---|---|---|
| Lista `/organizations` | managers veem todas (com "mostrar pessoais"); dono vê as suas | P1: todas, com coluna **Tipo** e filtro; criar organização escolhe `kind`. P2/P3: abre direto a sua (sem lista se só tem uma) | Coluna, filtro, campo no formulário de criação, redirecionamento |
| Workspace `?tab=overview` | Contagens básicas | P3: vira a **home do dono** (ou a home `/admin` aponta para cá). Números do time, estoque, compras, vendas | Reaproveitar `Today` da §5.3.2 |
| `?tab=team` + `OrganizationPerson.tsx` | Adicionar/remover/bloquear membros | Igual + **convidar por telefone** (hoje só quem já tem conta; o convidado entra com o código SMS do login atual). O convite cria sempre funcionário; "Tornar dono" só aparece para a Plataforma (D6) | Médio |
| `?tab=inventory` | `listOrganizationInventory` cru (array `any[]`, 500 linhas) | Mesma tabela de peças do painel (`piece-table.tsx`) com filtros, por org | Médio: trocar o endpoint pelo `/api/xpot/tags?organizationId=` |
| `?tab=kits` | `listOrganizationKits` cru | Mesma lista/ações de Kits do painel, por org | Médio |
| `?tab=customers` | Lista | Mantém; liga ao `AdminWork` leads | Pequeno |
| `?tab=settings` | Nome | + tipo e distribuição (só P1 edita), código de atacado do dono | Pequeno |
| **Novo** `?tab=purchases` | — | Compras do time (pedidos Stuscle) com status e peças (D4) | Novo, depende da F4 |

#### 5.3.6 Aplicativo do vendedor (`/tags/*`, `pages/tags/*`)

| Tela | Hoje | P4 | P3 | P2 | P1 | Trabalho |
|---|---|---|---|---|---|---|
| `HomeScreen.tsx` + `TagsDashboard.tsx` (`fleet = canManage`) | Frota só para managers | próprias | próprias + atalho "Minha organização" | próprias + "Produção" | idem P1 | `fleet` passa a ler o perfil; cartão de atalho |
| `PiecesScreen.tsx`, `TagScreen.tsx` (`/tags/t/<code>`, `/tags/pieces/<code>`), `LimitedPiece.tsx` | `canWorkOnTag`: próprias; dono alcança as da org | próprias | próprias; as da org pelo painel | — | — | Sem mudança de regra |
| `WriteSheet`, `EraseSheet`, `LockSheet`, `ContentEditor`, `ContentQr`, `ReviewLinkSheet`, `ContinueOnPhone`, `QrScanner`, `webNfc`, `saveChipProgress` | Operação da peça | ✓ | ✓ | ✓ | ✓ | Sem mudança |
| `TagSaleDialog.tsx` (vender peça) | ✓ | ✓ | ✓ | (D3) | ✓ | Sem mudança |
| `CustomersScreen.tsx`, `CustomerScreen.tsx`, `LeadPicker`, `PlacePicker` | `canUseLead` | próprios | org | — | — | Sem mudança |
| `ShopScreen.tsx` + `WholesaleCard.tsx` (comprar na Stuscle com código próprio) | Todos com Tags | **✓** | ✓ | ✗ (D3) | ✓ | Esconder para membros de produtora; texto "sua compra chega na organização X" |
| `DirectScreen.tsx` (gravar chip sem Xpot) | ✓ | ✓ | ✓ | ✓ | ✓ | Sem mudança |
| `TagsTabBar.tsx` | 4 abas | 4 abas | 4 + porta do painel | idem | idem | Porta já existe (`AdminModeSidebarItem`) |

#### 5.3.7 Módulo Visitas (`pages/xpot/*`)

| Tela | Regra | Trabalho |
|---|---|---|
| `XpotDashboard`, `XpotCheckIn`, `XpotVisits`, `XpotLeads`, `XpotProspecting`, `XpotTasks`, `XpotSales` | Já usam `listScope`/`recordFilters`: P4 próprio, P3 org em modo gestão, P1 tudo | Remover o caso Manager (D1); P2 igual a P4 se tiver o módulo |
| `AdminOverview` (atividade do time) | `team-activity` sem escopo de org | Escopo |

### 5.4 Servidor: rota por rota

Guardas atuais → alvo. "org" = filtrar/validar pela organização do perfil.

| Arquivo | Rotas | Hoje | Alvo |
|---|---|---|---|
| `server/routes/xpot/auth.ts` (`/me`) | 4 | `requireXpotUser` | `/me` devolve `profile` e `organization { id, name, kind, distribution, role }` (a produtora de um P2 é essa mesma organização) |
| `server/routes/xpot/organizations.ts` | 13 | manager/admin: todas; dono: a sua | P1 tudo + `kind` no POST/PATCH; P2/P3 a sua; `inventory`/`kits` passam a usar os mesmos serviços do painel com escopo |
| `server/routes/xpot/admin.ts` + `resellerAccounts.ts` (`/admin/reps*`) | 21 | `requireXpotManager`; `role` enum `rep/manager/admin`; admin ↔ `users.is_admin` sincronizado em `storage.updateSalesRepAccountProfile` | `requireSuperAdmin` (Plataforma). `role` deixa de ser editável: campo **Plataforma** (bool) e papel na org pelo endpoint de membros. Sem `manager` (D1) |
| `admin-integrations.ts`, `branding.ts`, `landing-content.ts`, `system-health.ts`, `xphere*.ts` | 26 | `requireSuperAdmin` | Sem mudança |
| `products.ts` | 8 | `requireXpotManager` nas escritas | `requireSuperAdmin` nas escritas; leitura para todos |
| `dashboard.ts`, `metrics.ts`, `leads.ts`, `visits.ts`, `opportunities.ts`, `tasks.ts`, `sales.ts`, `consignments.ts`, `visit-actions.ts`, `map.ts`, `prospecting.ts`, `place-search.ts`, `sync.ts`, `files.ts` | ~107 | `requireXpotUser` + `listScope`/`canAccessLead` | Mesmo; `listScope` sem Manager e com dono implícito |
| `teamActivity.ts` (`/admin/team-activity`) | 1 | `requireXpotManager` (o router `/admin` inteiro, `admin.ts`) | Aceita dono; `org` para P3 |
| `inbound.ts` (`/inbound/prospects`, `/inbound/tasks`) | 2 | chave de integração | Sem mudança |
| **`server/tags/routes.ts`** | | | |
| · públicas `/q/:code`, `/n/:code` | 2 | públicas | Sem mudança |
| · campo `/api/xpot/tags*` (dashboard, by-lead, lookup, lista, `:id`, analytics, activity, quick-activate, link-sale, ações, destination, unassign, nfc-*, receive, return-to-house, catalog) | ~20 | `requireTagUser` + `canWorkOnTag`; lista: `inManagement` = tudo | Lista: P1 tudo; P2/P3 org; P4 próprias (`listTags({ organizationIds })` já existe) |
| · `POST /tag-sales`, `/tag-direct-writes`, `/tools/review-link` | 4 | `requireTagUser` | Sem mudança |
| · admin `/api/xpot/admin/tags` (overview, analytics, report, PATCH, internal-use, return-to-stock, damage, assign, ações, rep, analytics, qr) | 14 | `requireTagManager` (`POST` criar peça: admin) | `requireTagManager` aceita dono; **todas** recebem `organizationId` do perfil (P1 pode passar `?organizationId=`); criar peça avulsa: `producer` |
| · kits `/admin/tag-kits*` (listar, dar, devolver, checar, itens) | 6 | `requireTagManager` | Dono: só da org, origem = casa da org; P2: destino pode ser vendedora indicada (D3) |
| · `/admin/tag-acquisitions`, `/:id/fulfill` | 2 | `requireTagManager`; `listAcquisitions(repId?)` | Listar: P1 todas, P3 as da org (`organization_id`); atender: P1 só (D3), e as peças escolhidas têm de ser da org de quem atende (`fulfilled_from_organization_id`) |
| · `/admin/tag-batch-options` | 1 | manager | org |
| · lotes `/admin/tag-batches*` (listar, criar, scan, apagar peça, close, reopen, GET, PATCH, export.csv, qr-assets.zip) | 10 | `requireTagAdmin` | `requireProducer`; `organization_id` na criação; leitura/escrita só da org; códigos continuam únicos globais (`generateUniqueCodes`) |
| · estações `/admin/tag-provisioners*`, `/:id/provisioning`, `/provisioning-jobs*` | 6 | `requireTagAdmin` | `requireProducer`; estação nasce com a org de quem pareia; jobs só para peças da org |
| · protocolo da estação `/api/provisioner/pair`, `session`, `jobs/claim`, `events`, `jobs/:id/complete` | 5 | token do dispositivo | `claim` filtra por `device.organization_id` (chips e placas) |
| **`server/tags/productionRoutes.ts`** (modelos, versões, arquivos, preview, catálogo de preview, pedidos, placas, download, printed, bench claim/report) | 33 | 25× `requireTagAdmin`, 3× `requireTagUser` | `requireProducer`; modelos: leitura = os da plataforma liberados em `producer_capabilities` (o esquema aceita modelo próprio, a UI não oferece, D2); escrita = P1; pedidos/placas com `organization_id`; bench só pega placas da org da estação |
| **`server/tags/journeyRoutes.ts`** | 6 | `requireTagAdmin` | `requireProducer` + org |
| **`server/mcp/routes.ts`** + `oauth.ts` (`isAdmin`) + `tools/*` (printProduction, tagJourney, tasks, prospecting) | 7 + ferramentas | `requireTagAdmin`; OAuth exige `is_admin` | Token (`mcp_tokens`, `mcp_oauth_tokens`) nasce com a org do emissor; OAuth aceita dono de `producer`; ferramentas de produção e jornada filtram pela org do token; `tasks`/`prospecting` continuam P1 |
| **`server/wholesale/index.ts`** (`/api/xpot/wholesale`, Stuscle `verify`/`orders`, `wholesale-code`) | 4 | usuário; Stuscle por chave | `orders` grava `organization_id` do comprador (`organizationIdForRep`); `/api/xpot/wholesale` também para P3; `wholesale-code` regenerar: P1 |
| `server/tags/repository.ts` (`listTags`, `BATCH_SELECT`, `getTagOverview` filas, `listKits`, `deliverKit`/`checkHandOut`, `createBatch` (emite os códigos), `companyOrganizationId` em 4 pontos) | — | "casa" = `rep_id IS NULL` | "casa" = org + `rep_id IS NULL`; `getTagOverview(organizationId?)`; `deliverKit` valida `sourceOrganizationId` sempre; `createBatch` grava a org; os 4 `companyOrganizationId()` viram `actor.producerOrganizationId` |
| `server/tags/production.ts` (`listModels`, `createModel`, `listRequests`, `listJobs`, `createJob`, `generatePieces`, `claimJob`, `printNowPlates`, `completeFromBench`) | — | Sem organização | Cada leitura filtra pela org da produtora; `createJob`/`generatePieces` gravam a org; `claimJob` e `printNowPlates` só da org da estação; `listModels` = modelos da plataforma liberados para a org |
| `server/tags/acquisitions.ts` | — | `recordStuscleOrder(input, repId)`, `fulfillAcquisition(id, codes)` | Gravar/validar as duas organizações (§5.2) |
| `server/organizations/service.ts` | — | `companyOrganizationId`, `ensureOrganizationForRep`, `listOrganizationInventory/Kits` crus | `kind` em criar/listar; `producerOrganizationOf(actor)`; inventário/kits delegam ao repositório de Tags |
| `shared/tagMetrics.ts`, `server/tags/metrics.ts` | `house: { holder: "house" }` | `house` recebe `organizationId` (SQL `t.organization_id = $org AND t.rep_id IS NULL`) |

### 5.5 Fora do servidor web

| Peça | Hoje | Alvo |
|---|---|---|
| `nfc-provisioner/` (app desktop: gravador NFC + bench) | Pareia por código, sem org; `capabilities: nfc/print` | Pareamento herda a org de quem gerou o código; a tela do app mostra "Estação de <org>" |
| `print-pipeline/` (`bench.py`, `print_now.py`, `pipeline.py`, `preview.py`) | Token de estação; constrói qualquer placa `requested` | `claim` já filtrado no servidor; nenhum código muda, só o README |
| MCP `xpot` (token em `~/.claude.json`) | Admin global | Token com org; skill `xpot-print-preview` continua igual |
| Stuscle (loja) | Verifica código de atacado, manda pedido | Sem mudança no contrato; o Xpot passa a guardar a org |
| Xphere (`xpot-tenant-in-xphere`) | Sync global | Sem mudança neste plano |

---

## 6. Os quatro painéis (navegação alvo)

```
P1 Super admin                      P2 Parceiro                 P3 Dono                      P4 Funcionário
─────────────────────────────       ──────────────────────      ─────────────────────        ─────────────────
Hoje (Plataforma)                   Hoje (Produção)             Hoje (Minha organização)     (sem painel)
PLATAFORMA                          PRODUÇÃO                    ORGANIZAÇÃO                  App: Início,
  Organizações (todas, por tipo)      Produzir (board)            Time                         Clientes,
  Pessoas                             Pedidos                     Estoque                      Minhas peças,
  Pedidos Stuscle a separar           Modelos (plataforma)        Kits                         Loja (compra)
  Produtos · Vitrine                  Lotes e recebimento         Compras do time (D4)
  Integrações · Marca · Status        Estações · Jornada          Clientes · Tarefas · Vendas
MINHA EMPRESA (= xpot-company)        Visão geral (org)           Visão geral de Tags (org)
  Produzir · Pedidos · Modelos      ORGANIZAÇÃO                   Configurações
  Lotes · Estações · Jornada          Time · Estoque · Kits
  Estoque · Kits · Visão geral        Configurações
  Time · Configurações
```

P5 (se confirmado, D7) não entra neste shell: é um app próprio em `/my`, com lista e detalhe.

Vocabulário de UI (en/pt/es, `i18n/messages/workspaces.ts` + `shell.ts` + `navIa.ts`):

| Hoje | Alvo |
|---|---|
| "Super admin panel" | "Plataforma" (grupo) + "Minha empresa" (grupo) |
| "Team management" | "Minha organização" |
| "Xpot admin" (badge) | "Plataforma" |
| "Manager" | sai (D1) |
| "Rep Admin" | "Dono" (owner) |
| "Rep" | "Funcionário" quando falamos do papel na organização; "vendedor" quando falamos do que a pessoa faz |
| — | "Parceiro" / "Organização produtora"; "Organização vendedora" |

---

## 7. Fases

Cada fase é mergeável sozinha, com migração reversível e testes. "Depois disto" é a demonstração de aceite.

### F0 · Regra única `risk:low` `depends:[]`

- `shared/profiles.ts` com `profileOf`, `can`, e a tabela da §4 em `tests/profiles.test.ts`.
- `/api/xpot/me` devolve `profile`, `organization { id, name, kind, distribution, role }`.
- Migrações `organization_kind` e `manager_retire` (§5.2); `xpot-company` → `producer`; `kind` no
  `listOrganizations` e no criar (P1).
- Manager some do código: `isManagerOrAdmin`/`canManage` passam a ser "Plataforma ou dono"; People deixa de oferecer
  Manager; `storage.updateSalesRepAccountProfile` deixa de sincronizar `role` ↔ `is_admin` (a Plataforma vira um campo
  próprio no formulário). Como só existem dois usuários, ambos `is_admin`, nada muda para ninguém.
- Glossário i18n da §6 (três idiomas; `tests/i18n-messages.test.ts`).
- Docs: ARCHITECTURE.md e MODULES.md ganham a seção "Perfis".

> Depois disto: `/me` diz qual dos quatro perfis sou; nenhum Manager tem poder a mais; nada muda nas telas ainda,
> além dos nomes.

Arquivos: `shared/profiles.ts` (novo), `shared/modules.ts`, `shared/organizations.ts`, `server/routes/xpot/auth.ts`,
`server/routes/xpot/middleware.ts` (`listScope`), `server/routes/xpot/admin.ts`, `server/routes/xpot/resellerAccounts.ts`,
`server/storage.ts`, `server/organizations/service.ts`, `client/src/pages/admin/AdminReps.tsx`, `PersonDetail.tsx`,
duas migrações, i18n. Testes: `profiles.test.ts`, `authorization.test.ts`, `organizations*.test.ts`,
`management-scope.test.ts`, `list-scope.integration.test.ts`. **~3 PRs.**

### F1 · Painel do dono (P3) `risk:medium` `depends:[F0]` `D4, D5`

- `AdminApp` deixa P3 entrar em `/admin` com os grupos de §6 (`moduleNav.ts` `ownerGroups`).
- Home "Hoje" do dono (§5.3.2) com filas por org: `getTagOverview(organizationId)`, `tagQueues` por org.
- Estoque e Kits da org com os componentes do painel (`PiecesTab`, `KitsTab`) recebendo `organizationId` fixo;
  `/admin/tags/{overview,pieces,kits}` liberados para dono com escopo; `requireTagManager` aceita dono.
- Time e Configurações: mover do workspace `/organizations/:id` para dentro do painel; `/organizations` vira lista só
  para P1 (ou redireciona P3 para `/admin`).
- `CodeLookup` para o dono (org).
- App do vendedor: atalho "Minha organização" no `HomeScreen` (porta já existe).
- **Convidar pessoa** (D5): Configurações › Minha organização › Convidar, por telefone. Cria o `sales_reps` dormente
  + convite; quem entra pelo SMS cai direto na organização como funcionário. Hoje `POST /organizations/:id/members`
  só aceita quem já tem conta (`repId`). O convidado **não** ganha organização pessoal (`createResellerAccount` com
  `createOrganization: false`, que já existe): a dele é a de quem convidou.
- **Tornar dono** (D6): botão só da Plataforma na página da organização (`PATCH /organizations/:id/members/:repId`
  com `role: "admin"`, que já existe; a UI é que passa a ser só de P1).
- D5: `runsATeam` continua decidindo quando a org pessoal vira painel; o vendedor sozinho já é dono dela.

> Depois disto: o dono de uma equipe entra em `/admin`, vê "Hoje" com o que a equipe precisa, o estoque da sua
> organização, os kits, o time e as vendas, e nunca vê outra organização nem nada de produção.

Arquivos: `AdminApp.tsx`, `moduleNav.ts`, `AdminHome.tsx`, `home-model.ts`, `OverviewTab.tsx`, `overview-model.ts`,
`PiecesTab.tsx`, `KitsTab.tsx`, `kits-give-form.tsx`, `OrganizationsPage.tsx`, `AdminMode.tsx`, `server/tags/access.ts`,
`server/tags/routes.ts` (admin tags, kits, overview), `server/tags/repository.ts` (`getTagOverview`, `listKits`,
`deliverKit` com `sourceOrganizationId` obrigatório para dono), `shared/tagQueues.ts`. Testes: `admin-home.test.ts`,
`admin-tags-flow.test.ts`, `admin-tags-org-filter.test.ts`, novo `owner-panel.integration.test.ts` (dono não vê
outra org por URL nem por API). **~4 PRs.**

### F2 · Funcionário (P4) `risk:low` `depends:[F0]`

- Auditoria do app `/tags`: `fleet` em `TagsDashboard` pelo perfil; Loja visível e com o aviso "chega na organização X".
- `/api/xpot/tags` lista: `organizationIds` já restringe; confirmar que `?mine` e `inManagement` não vazam.
- Esconder qualquer porta de produção/painel; `AdminApp` devolve "acesso restrito" com a mensagem do perfil.
- Testes de que P4 recebe 403 em toda rota de org e de produção (matriz).

> Depois disto: um funcionário vê só as próprias peças e clientes, compra kits pela Loja, e qualquer tentativa de ver a
> organização inteira ou produzir é recusada pela API.

Arquivos: `TagsDashboard.tsx`, `HomeScreen.tsx`, `ShopScreen.tsx`, `WholesaleCard.tsx`, `AdminApp.tsx`, i18n. Testes:
`authorization.test.ts`, `tags-member.integration.test.ts` (novo). **~1 PR.**

### F3 · Super admin em dois grupos (P1) `risk:medium` `depends:[F0,F1]`

- `moduleNav.ts`: grupos **Plataforma** (Organizações, Pessoas, Pedidos Stuscle, Produtos, Vitrine, Integrações, Marca,
  Status) e **Minha empresa** (os mesmos itens do dono + produção, fixados em `xpot-company`).
- Home "Hoje" em dois blocos (§5.3.2); correções de conteúdo (falhas; arquivos travados em vez de "gerando").
- Organizações: coluna Tipo, filtro, criação com `kind`; abrir uma organização mostra o painel dela **como o dono vê**
  ("ver como"), com a barra âmbar dizendo de quem é.
- Pessoas: Plataforma sim/não; organização e papel; sem Manager.
- `/admin/products`, `/admin/tags/shop`, `/admin/settings` ficam na Plataforma.

> Depois disto: o super admin distingue, na navegação e na home, o que é controle da plataforma do que é a produção e
> o estoque da própria empresa, e consegue abrir qualquer organização e vê-la como o dono dela.

Arquivos: `moduleNav.ts`, `AdminApp.tsx`, `AdminHome.tsx`, `home-model.ts`, `OrganizationsPage.tsx`, `AdminReps.tsx`,
`PersonDetail.tsx`, `AdminMode.tsx`, `server/routes/xpot/organizations.ts`, `products.ts`. Testes: `admin-home.test.ts`,
`organizations.test.ts`, `moduleNav` (novo `module-nav.test.ts`). **~3 PRs.**

### F4 · Estoque por organização `risk:high` `depends:[F1]` `D4`

- `house` = org + sem vendedor (`shared/tagMetrics.ts`, `server/tags/metrics.ts`, `repository.ts` overview, batch
  counts, `handOutCount`); todas as contagens da Visão geral, dos lotes e dos kits recebem `organizationId`.
- `deliverKit`/`checkHandOut`: `sourceOrganizationId` sempre = org de quem dá; validação de que cada código pertence a ela.
- **Receber de volta** (`returnToHouse`, usado por `/admin/tag-kits/return` e pelo "Take back" do telefone): hoje
  tira o vendedor e **deixa a peça na organização dele**. Passa a mover a peça para a organização de quem recebe
  (P1 recebendo = `xpot-company`; dono recebendo de um funcionário = a própria org), com movimento de estoque
  registrado. Antes da migração, um script lista as peças sem vendedor fora da `xpot-company` (devoluções antigas) para
  o dono decidir onde elas estão fisicamente.
- Migração `acquisition_organization`: `tag_acquisitions.organization_id` e `fulfilled_from_organization_id`;
  `recordStuscleOrder` grava a org do comprador; `fulfillAcquisition` grava e valida a org de quem atende;
  `listAcquisitions({ organizationId })`.
- Dono: aba/lista "Compras do time" (D4) com status pendente/atendido/cancelado e peças recebidas.
- Relatórios (`/admin/tags/report`, `analytics`) com escopo.
- Teste de propriedade: nenhuma consulta agregada de estoque roda sem `organization_id` quando o perfil não é P1
  (lint simples em `tests/`: grep por `countMetricSql("house"` sem org).

> Depois disto: dois estoques "da casa" em organizações diferentes nunca se somam; um pedido Stuscle sabe de que
> organização saiu e para qual foi; o dono vê as compras do time.

Arquivos: `shared/tagMetrics.ts`, `server/tags/metrics.ts`, `server/tags/repository.ts`, `server/tags/acquisitions.ts`,
`server/wholesale/index.ts`, `server/tags/routes.ts` (acquisitions, report, analytics), `KitsTab.tsx`, `kits-give-form.tsx`,
`OrganizationsPage.tsx`/painel do dono (compras), uma migração. Testes: `tags/printProduction.test.ts` não muda;
novos `stock-scope.integration.test.ts`, `acquisitions-organization.test.ts`; `admin-tags-org-filter.test.ts`. **~3 PRs.**

### F5 · Parceiro produtor (P2) `risk:high` `depends:[F3,F4]` `D2, D3`

- Migração `production_organization`: `organization_id` em `tag_batches`, `print_models` (null = plataforma),
  `print_requests`, `print_jobs`, `tag_provisioning_devices`, `tag_journey_entries`, tokens MCP; backfill →
  `xpot-company`.
- Onboarding pelo P1: criar a pessoa (Pessoas), criar a organização `producer`, torná-la dona, liberar capacidades e
  modelos, gerar o código de pareamento da estação. Um só fluxo "Novo parceiro" na Plataforma faz os cinco passos.
- `requireProducer` substitui `requireTagAdmin` em `productionRoutes.ts` (33), lotes (10), estações e jobs (6),
  `journeyRoutes.ts` (6), `mcp/routes.ts` (7); `oauth.ts` aceita dono de `producer`.
- Repositório de produção (`production.ts`, `repository.ts`): todas as consultas filtradas pela org da produtora;
  `createBatch`, `createJob`, `generatePieces` gravam a org; `listModels` = modelos da plataforma
  (`organization_id IS NULL`) liberados em `producer_capabilities` (D2); `createModel`/`updateModel`/`createVersion`
  continuam só do P1.
- Estação: o código de pareamento já guarda quem o criou (`createdByUserId`, `provisioning.ts`); `redeemPairing`
  grava a org dessa pessoa no dispositivo; `claimJob` (placas) e `jobs/claim` (chips) só da org.
- Painel P2 (§6): `AdminApp` + `moduleNav.ts` `producerGroups`; home "Hoje" de produção; `ProductionTab` sem
  "editar modelo" nos da plataforma; Lotes, Estações, Jornada por org; Visão geral de Tags da org.
- **Materiais e capacidades (D2):** migração `print_model_materials`, ficha de materiais por modelo; tela "O que você precisa" no catálogo do
  parceiro (adesivo NFC indicado, filamento, fornecedor, link de compra); `producer_capabilities` editado só pela
  Plataforma (quais modelos, gerar seriais, gravar chip, parear estação) e respeitado por `requireProducer` e pela
  navegação. Onboarding do parceiro: checklist na página da organização (Plataforma) com o que já foi liberado.
- Distribuição (D3): nesta fase o parceiro produz para o **próprio estoque**; sair do estoque dele é a F6.
- Loja escondida para membros de produtora.
- MCP: ferramentas `printProduction` e `tagJourney` lêem a org do token; `tasks`/`prospecting` seguem P1.
- Docs: PRINT_EXECUTION_PLAN.md e `print-pipeline/README.md` ganham "por organização".

> Depois disto: criamos uma organização "Parceiro X" do tipo produtora, seu dono entra em `/admin`, vê Produzir,
> Pedidos, Modelos da plataforma, Lotes, Estações e Jornada só dele, gera seriais e imprime, e não vê nossas placas,
> lotes, pessoas nem outras organizações; nossa bench nunca pega uma placa dele e vice-versa.

Arquivos: duas migrações, `server/tags/access.ts`, `productionRoutes.ts`, `production.ts`, `journey.ts`,
`journeyRoutes.ts`, `provisioning.ts`, `routes.ts` (lotes, estações, protocolo), `repository.ts`, `server/mcp/*`,
`shared/printProduction.ts` (tipos com `organizationId`), `moduleNav.ts`, `AdminApp.tsx`, `ProductionTab.tsx`,
`production-*.tsx`, `BatchDetail.tsx`, `ProvisionersTab.tsx`, `JourneyTab.tsx`, `nfc-provisioner/src/api`. Testes:
`tags/production.integration.test.ts`, `production-workflow.test.ts`, `mcp.scope.test.ts`, `mcp.oauth*.test.ts`,
novos `producer-scope.integration.test.ts`, `provisioner-organization.test.ts`. **~6 PRs.**

### F6 · Distribuição por parceiro `risk:medium` `depends:[F5]` `D3`

Cada parceiro tem a sua forma de vender e distribuir (D3). A fase define a **interface** e implementa só o caminho
que já existe:

- `server/tags/distribution/` com um contrato: `receiveOrder` (de onde vem o pedido), `fulfill` (quem separa, de que
  estoque), `handOut` (para quem o kit sai). Duas implementações: **`xpot`** (a de hoje: Stuscle → `tag_acquisitions`
  → atendimento pelo estoque da `xpot-company` → kit para a org do comprador) e **`own`** (esqueleto: o parceiro dá
  kits do estoque dele para organizações vendedoras que a Plataforma vincular a ele, migração `partner_links`;
  pedido e pagamento fora do Xpot).
- `organizations.distribution` escolhe a implementação; a Plataforma muda na página da organização.
- Parceiro nos EUA (`xpot`): fica em aberto se um pedido Stuscle pode ser separado do estoque **dele** em vez do
  nosso. Decidir com o primeiro parceiro americano; o contrato `fulfill` já recebe "de que estoque".
- "Dar kit" do parceiro (`own`) aceita como destino uma vendedora vinculada e troca a `organization_id` das peças.
- O que falta no `own` (pedido do cliente, cobrança, loja do parceiro) fica documentado como "ao chegar o primeiro
  parceiro", com os pontos de extensão nomeados.

> Depois disto: um parceiro com `distribution = own` entrega kits do estoque dele às vendedoras vinculadas, sem
> passar pela Stuscle; o caminho dos EUA continua idêntico; trocar o modo de um parceiro é um campo na Plataforma.

### F7 · Painel do dono das plaquinhas (P5) `risk:medium` `depends:[F0]` `D7`

- Migração `customer_accounts`, vínculo cliente ↔ conta; entrada em `/my` por **código da peça + telefone** (o SMS do login atual); a peça
  tem de estar ativa e ligada a um lead; o telefone é gravado no lead na primeira entrada e confirmado pelo vendedor
  (ou já bate com o telefone do lead).
- Telas: Minhas plaquinhas (lista com leituras da semana), detalhe (leituras por dia, destino atual, QR), "Falar com
  o vendedor" (WhatsApp do rep da peça). Três idiomas.
- API `/api/my/*` só leitura, `requireCustomer`, filtrando por `tags.lead_id` do vínculo; reaproveita
  `pieceActivity.ts`/analytics com os números já calculados (sem expor outros clientes nem a organização).
- Fora: ativar, mudar destino, comprar. Se o cliente quiser, o botão chama o vendedor.
- Custo: cada entrada é um SMS do Supabase; sessão longa (30 dias) para não reenviar a cada visita.

> Depois disto: um restaurante com três placas entra com o código de uma delas e o telefone, vê as três, quantas
> leituras cada uma teve e para onde apontam, e fala com o vendedor em um toque.

### F8 · Verificação cruzada e limpeza `risk:high` `depends:[F0..F7]`

- Matriz automática perfil × rota (os ~300 handlers de §5.4): permitido/negado, gerada a partir de `can` (um teste
  por arquivo de rotas, no estilo de `authorization.test.ts`).
- Aceite no navegador por perfil (cinco contas de teste, uma por perfil): entrar, home, cada item da navegação, uma
  operação de escrita, uma tentativa de URL alheia.
- Remover código morto: os ramos `manager` de `managesEveryOrganization`/`isManagerOrAdmin`/`repModules`,
  `organizationPanelGroups`, `SUPER_ADMIN_SECTIONS`, `platformRoleOf`.
- Atualizar `organizations-execution-plan.md` (contrato de permissões substituído por este), `ARCHITECTURE.md`,
  `MODULES.md`, `HANDOFF.md`; memória do projeto (`xpot-four-profiles`).
- Rollout: cada fase já foi para produção com a sua migração e backup; aqui roda o script de verificação final
  (contagens por organização; nenhuma peça, lote, placa, estação ou compra sem organização; nenhuma peça sem vendedor
  fora da organização que a tem fisicamente).

> Depois disto: um teste falha se qualquer rota deixar um perfil fazer o que a §4 proíbe; os painéis foram vistos
> funcionando com uma conta de cada perfil; a documentação descreve o modelo novo.

### Ordem e tamanho

| Fase | Depende | Risco | PRs (estimativa grosseira) |
|---|---|---|---|
| F0 regra única | — | baixo | 3 |
| F1 painel do dono (+ convite) | F0 | médio | 4 |
| F2 funcionário | F0 | baixo | 1 |
| F3 super admin em dois | F0, F1 | médio | 3 |
| F4 estoque por org (+ devolução) | F1 | alto | 4 |
| F5 parceiro (+ materiais, capacidades, onboarding) | F3, F4 | alto | 7 |
| F6 distribuição por parceiro | F5 | médio | 2 |
| F7 painel do dono das plaquinhas | F0, D7 | médio | 3 |
| F8 verificação e limpeza | tudo | alto | 2 |

F1 e F2 podem andar em paralelo; F3, F4 e F7 também, depois de F1. F5 só começa com F3 e F4 prontas. Como não há
usuários a migrar, as fases podem ir para produção uma a uma sem janela de manutenção; o único cuidado é o
backfill da F5 na produção que roda todo dia.

---

## 8. Riscos e salvaguardas

| Risco | Salvaguarda |
|---|---|
| Quebrar o fluxo de produção atual (que roda todo dia) ao trocar `requireTagAdmin` | F5 só vem depois de dono, super admin e estoque; até lá P1 continua `is_admin`; `requireProducer` aceita `is_admin` como dono de `xpot-company` desde o primeiro commit |
| Estoque "da casa" mudar de número para o super admin | Pode mudar: peças devolvidas por vendedores ficaram sem vendedor **na organização deles** (`returnToHouse` não muda a organização), e hoje contam como casa. O script pré-F4 lista essas peças; o dono diz onde cada lote está fisicamente antes de a migração rodar |
| Links salvos e app instalado | Nenhuma URL muda (decisão de MODULES.md) |
| Manager em uso por alguém hoje | Não há (dois usuários, ambos super admins); a migração `manager_retire` confirma e falha se aparecer um |
| Parceiro produzir com material errado | Ficha de materiais por modelo e "O que você precisa" antes do primeiro pedido; capacidades liberadas uma a uma pela Plataforma |
| Cliente final ver dados de outro cliente | `/api/my/*` filtra por `lead_id` do vínculo; teste de que dois clientes nunca se cruzam |
| Códigos de plaquinha colidirem entre produtoras | Já são únicos na plataforma (`tags_public_code_unique`, `generateUniqueCodes`); nada muda |
| Estação de um parceiro pegar placa nossa | `claim` filtra por org da estação (F5), testado |
| Peça comprada na Stuscle ir para a org errada | `organizationIdForRep` do comprador no momento do pedido, gravado; teste |
| Três idiomas | Cada rótulo novo em en/pt/es; `i18n-messages.test.ts` |

---

## 9. Checklist de alinhamento (antes da F0)

- [x] D1 Manager: sai. Dois usuários, ambos super admins
- [x] D2 Catálogo do parceiro: só o nosso; ficha de materiais e capacidades liberadas pela Plataforma
- [x] D3 Distribuição: por parceiro (`xpot` nos EUA, `own` fora); interface agora, caminho `own` com o primeiro parceiro
- [x] D4 Compra do funcionário: o dono acompanha, não aprova; pagamento na Stuscle
- [x] D5 Vendedor sozinho: app simples, mas dono da própria organização; convida pessoas
- [x] D6 Papéis: só dono e funcionário; segundo dono a pedido, dado pela Plataforma
- [ ] D7 Dono das plaquinhas = cliente final com painel só de leitura?
- [ ] Nomes de UI da §6 aprovados (Plataforma, Minha empresa, Minha organização, Produção, Dono, Vendedor, Parceiro)
- [ ] Ordem das fases aprovada (dono primeiro, parceiro depois, cliente final em paralelo)
- [ ] Antes da F4: lista das peças sem vendedor fora da `xpot-company`, para dizer onde estão fisicamente
