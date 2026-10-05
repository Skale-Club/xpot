# Plano: Visitas e Tags como painéis distintos

**Rev. 2** · base `2cf0985` · 2026-10-04 · **executado** (ver Status). A Rev. 1 era a proposta;
as seções 1 a 7 abaixo continuam como estavam, com as decisões revistas na seção Status.

## Status (Rev. 2)

As decisões foram reavaliadas antes de executar, contra o código. Cinco mudaram:

| Decisão | Rev. 1 | Rev. 2 | Por quê |
|---|---|---|---|
| MOD-10 / D3, prefixo de módulo nas URLs | `/visitas/*` | **Descartado.** As URLs ficam como estão, inclusive `/admin/<seção>` | Trocar `/leads`, `/visits` etc. quebraria links salvos, o app instalado (`start_url`) e links enviados por WhatsApp, sem ganho para quem usa: a identidade do módulo está no shell, não na URL. O módulo de cada tela vem de um mapa (`moduleNav.ts`), não do prefixo |
| D6, "Leads/Clientes" vira "Empresas" | Sim | **Descartado** | É uma escolha documentada (`i18n/messages/leads.ts`): a lista tem as abas Clientes e Prospectos, e "Empresas" desmancharia essa divisão. Ficaram só as duplicidades reais: "Suas tags" e "Suas peças" para os mesmos números, "Peças Tags", ES "Etiquetas", "Team" duas vezes |
| MOD-04, `/tags/summary` com escopo de gerente | Corrigir | **Descartado** | O resumo aparece como "Suas peças": ser pessoal é o certo. O total da operação está agora em Tags › Gestão › Visão geral |
| Seletor de módulo no desktop | Menu suspenso (como o seletor de workspace do Slack) | **Controle segmentado** Visitas \| Tags, sempre visível | Com dois módulos, um menu esconde a opção atrás de um clique a mais. O segmentado é o mesmo do celular |
| Cor de Tags | Violeta ou verde-água | **Violeta** | Verde-água foi testado e descartado na tela: o verde já significa dinheiro, "ao vivo" e sucesso no app inteiro (o botão "Nova venda" de Visitas é verde), então Tags voltaria a parecer Visitas |
| MOD-19, Admin traduzido | Fase 4 | **Feito em PR próprio** | Não ajudava a separar os módulos, então saiu depois, numa revisão isolada: são centenas de textos em três idiomas |
| MOD-21 / D5, peça vendida em Vendas | Depois | **Continua depois**, como recomendado | |

**Feito, por item**

| Item | Estado | Onde |
|---|---|---|
| MOD-01 checagem do módulo Visitas no servidor | ✅ | `requireVisitsModule` + `VISITS_ONLY_PATHS` (`server/routes/xpot/middleware.ts`, montado em `index.ts`); `tests/authorization.test.ts` |
| MOD-02 Xphere só com Visitas | ✅ | Configurações + o gate acima cobre `/xphere` |
| MOD-03 um início por módulo | ✅ | `MODULE_HOME` (`lib/xpot.ts`): Visitas = Painel, Tags = Início. "Voltar" das Configurações respeita o módulo |
| MOD-05 glossário | ✅ revisto | §5, com D6 descartada |
| MOD-06 seletor de módulo no desktop | ✅ | `SidebarModuleSwitch` em `AppLayout.tsx` |
| MOD-07 cor por módulo | ✅ | `MODULE_ACCENT` (`surface.ts`): barra lateral, seletor, linha no topo, barra inferior do celular |
| MOD-08 título com caminho | ✅ | "Tags › Lotes" na barra superior e na aba do navegador |
| MOD-09 ⌘K agrupado por módulo | ✅ | `CommandPalette` recebe o grupo de cada tela |
| MOD-11 Tags unificado | ✅ | A gestão de Tags é o grupo **Gestão** dentro de Tags. As abas de `/admin/tags` ficam só no celular. A busca por código foi para a barra superior |
| MOD-12 gestão de Visitas | ✅ | Equipe (o antigo Admin › Overview), Produtos, Regras de check-in, Xphere |
| MOD-13 Conta › Organização | ✅ | Pessoas, Integrações, Marca. Nas páginas de conta, a barra lateral lista a conta e nenhum módulo fica ativo |
| MOD-14 sem "Admin" separado | ✅ | Sem redirecionamentos: as URLs são as mesmas e só mudaram de lugar no shell |
| MOD-15 `ModuleBadge` nas pontes | ✅ | Card do Painel, seção de peças da empresa, "Vender peça" no check-in, chip e contagem na lista de leads |
| MOD-16 empresa com seções por módulo | ✅ já existia | O detalhe da empresa já tinha Vendas, Peças e Visitas; a seção de peças ganhou o selo |
| MOD-17 card de Tags no Painel | ✅ | Mantido, com cor e selo de Tags |
| MOD-18, MOD-20 vocabulário | ✅ parcial | "Suas peças" em todo lugar, "Peças" + selo, ES "Tags", aba "Visitas" → "Histórico" (D1), "Team report" → relatório por revendedor |
| MOD-19 Admin traduzido | ✅ | `i18n/messages/manage.ts` (Visitas e Organização), `manageTags.ts`, `manageTagsPieces.ts`, `manageTagsBatches.ts`; rótulos de peça, produto, chip e impressão vêm de `tags.ts` via `admin/tags/labels.ts`; `tests/i18n-messages.test.ts` confere placeholders e plurais |
| MOD-21 | ⏸ depende de D5 | |

Também: o mapa de onde cada tela vive é um só (`client/src/components/xpot/moduleNav.ts`), lido pela barra
lateral, pela paleta e pelo `AdminApp`, com testes (`tests/module-nav.test.ts`). As telas foram conferidas
contra uma API simulada em 1366px e 375px (admin, gerente, revendedor só de Tags).

**Pendências conscientes**

- O gerente vê **todas** as peças em Tags › Minhas peças (`server/tags/routes.ts:412`), como antes. Agora isso
  duplica Tags › Gestão › Todas as peças. Não foi mudado porque o gerente vende peças da casa pelo celular a
  partir dessa lista.
- Textos que vêm do servidor continuam em inglês: mensagens de erro da API, títulos que o servidor grava na Jornada, o diagnóstico das integrações (`shared/integrations-registry.ts`) e os erros de validação de link em `shared/tags.ts` (a gestão traduz os conhecidos pelo texto).

---

O Xpot tem dois produtos dentro de um app só:

- **Visitas** é o trabalho de campo do vendedor: check-in na empresa, leads, vendas de produto e
  consignação, painel do dia.
- **Tags** é o negócio das peças físicas com QR/NFC: lotes, kits para revendedores, venda e ativação
  da peça, gravação do chip.

São funções muito diferentes, com públicos diferentes (um revendedor de Tags pode nunca fazer uma
visita), mas a interface não deixa isso claro, principalmente no desktop. Este plano separa os dois
em **painéis distintos** sem quebrar as pontes que fazem sentido. Uma ponte que faz sentido é a
empresa visitada ser a mesma que compra a plaquinha.

Os códigos `MOD-xx` seguem o formato do [`BACKLOG.md`](./BACKLOG.md) e do [`DESKTOP.md`](./DESKTOP.md).

---

## 1. Diagnóstico

### 1.1 O shell do desktop mistura três mundos numa coluna só

No celular existe o `ModuleSwitch` (Visitas | Tags) no topo da tela, e cada módulo tem a sua barra
inferior. No desktop esse seletor **some** (`App.tsx:82-86` e `TagsApp.tsx:93-95` só o renderizam em
`mobileHeader`, que é `lg:hidden`). No lugar dele, a barra lateral empilha tudo:

```
VISITS            ← rótulo de 10px em caixa alta
  Dashboard
  Visits          ← página "Visits" dentro do módulo "Visits"
  Leads
  Sales
TAGS
  Home            ← um segundo "início"
  My pieces
  Direct link
ADMIN             ← só dentro do admin
  Overview        ← na prática só fala de Visitas
  Tags            ← um segundo "Tags", agora o de gestão
  Products        ← produtos de Visitas
  …
⚙ Settings
```

- **Identidade igual.** Mesmo ícone de marca, mesmo degradê azul no item ativo e mesmo título na
  barra superior (`AppLayout.tsx:90-112, 218-245`). Nada diz "você está em Tags".
- **Dois inícios.** Visitas abre no Painel (`/dashboard`) e Tags em "Home" (`/tags`). O
  `ModuleSwitch` manda Visitas para `/check-in` (`ModuleSwitch.tsx:11`), mas `getXpotHomePath` manda
  para `/dashboard` (`lib/xpot.ts`). Para o mesmo módulo, os dois destinos não batem.
- **A busca (⌘K) mistura tudo.** Empresas de Visitas e peças de Tags aparecem numa lista só
  (`CommandPalette.tsx:35-75`).

### 1.2 "Tags" existe duas vezes, e o Admin é organizado por assunto solto

| Onde | O que é | Para quem |
|---|---|---|
| Grupo **TAGS** da barra (`/tags`) | Home, Minhas peças, Link direto: o app do revendedor | Revendedor (o gerente vê **todas** as peças aqui também, `server/tags/routes.ts:412`) |
| **Admin › Tags** (`/admin/tags`) | 7 abas: Overview, Pieces, Kits, Batches, Journey, Team, NFC writers | Gerente/admin |

Um gerente tem portanto duas listas de peças, em dois lugares, com colunas diferentes.

As seções do Admin (`AdminApp.tsx:17-26`) misturam escopos sem dizer qual é qual:

| Seção | Na verdade é de… |
|---|---|
| Overview | **Visitas** (check-ins, pipeline, tarefas, sync: `AdminOverview.tsx:26-35`) |
| Tags | **Tags** (com outro "Overview" dentro) |
| Products | **Visitas** (catálogo para venda e consignação; os tipos de peça de Tags não estão aqui) |
| Settings | **Visitas** (regras de check-in: geofence, GPS) |
| Xphere | **Visitas** (sincroniza visitas) |
| Reps | Global (pessoas, módulos, código de atacado de Tags) |
| Integrations, Branding | Global |

Além disso, **o Admin inteiro é só em inglês**: nenhum arquivo em `pages/admin/` usa `useT`. O
resto do app tem EN/PT/ES.

### 1.3 Uma tela de um módulo mostra dados do outro, sem sinalizar

| Tela | Dado do outro módulo | Onde |
|---|---|---|
| Painel (Visitas) | card "Suas tags" | `XpotDashboard.tsx:67-143` |
| Leads, lista e tabela | contagem de peças NFC | `XpotLeads.tsx:454-461`, `LeadsTable.tsx:137-139` |
| Detalhe do lead | seção "Peças Tags" entre Vendas e Visitas | `LeadDetailPane.tsx:211-221` |
| Check-in | "Vender uma peça a este cliente": salta para `/tags` | `XpotCheckIn.tsx:531-551` |
| Tags, peça/direto | escolhe e **cria leads** de Visitas | `LeadPicker.tsx`, `repository.ts:527-550` |

Essas pontes são úteis. O problema é que nada mostra que você está atravessando de um módulo para o
outro.

### 1.4 Os dados: duas coisas compartilhadas, duas que parecem iguais e não são

- **Compartilhado de verdade:**
  - **Pessoas** (`sales_reps`): vendedor, revendedor e gerente são a mesma linha.
  - **Empresas** (`sales_leads`): o lead de Visitas é o cliente de Tags, e Tags grava nessa tabela
    (`source: "tag_sale"`, `status: "customer"`).
- **Parecido, mas separado:**
  - **"Venda".** A de Visitas é `sales_sales`, com itens de `sales_products`. A de Tags é a ativação
    da peça (`tags.sold_at`) e nunca vira linha em `sales_sales`. A aba Vendas não mostra peça vendida.
  - **"Produto".** O de Visitas é o catálogo do admin. O de Tags é a lista fixa `TAG_PRODUCT_TYPES`.

### 1.5 Vocabulário

| Conceito | Como aparece hoje |
|---|---|
| A empresa | "Leads" em EN, "Clientes" em PT/ES. "Customer" no Tags em EN, "estabelecimento" no PT. E `customer` também é um **status** de lead, então em PT "Cliente" significa duas coisas |
| A pessoa | "Rep" / "Vendedor" nas Configurações. "Reps" no menu do Admin, mas "New reseller", "All resellers" dentro dele. Nenhum arquivo de tradução tem "revendedor" |
| A peça | Módulo "Tags" / "Tags" / "Etiquetas". Objeto "peças". O Painel diz "Suas tags" e o Tags Home diz "Suas peças" para os mesmos números. O detalhe do lead diz "Peças Tags" |
| "Team" | Campo `team` da pessoa **e** a aba de relatório de revendedores em Admin › Tags |
| "Overview" | Admin, Admin › Tags e Vendas: três "visões gerais" diferentes |

### 1.6 Furos encontrados no caminho

1. **O servidor não verifica o módulo Visitas.** `requireXpotUser` só checa ativo/bloqueado
   (`middleware.ts:65-79`). Um revendedor só-Tags é barrado de Visitas apenas no cliente. Tags faz a
   checagem certa no servidor (`server/tags/access.ts:24-27`).
2. **Configurações mostra a integração Xphere a quem só tem Tags** (`XpotSettings.tsx:562`, sem
   condição), e a rota do servidor não checa módulo.
3. **Os botões "voltar" de Configurações e do Admin vão para `/dashboard`**, que é Visitas, mesmo
   para quem só tem Tags (`XpotSettings.tsx:424`, `AdminApp.tsx:114`).
4. **`/tags/summary` ignora o papel de gerente** (`routes.ts:377-380`). O card do Painel do gerente
   mostra só as peças dele, enquanto a lista mostra todas.

---

## 2. Princípios

1. **Módulo primeiro, papel depois.** A pessoa escolhe em que negócio está trabalhando. Dentro dele,
   o que ela vê depende do papel (revendedor, vendedor, gerente). A gestão de Tags mora **dentro** de
   Tags, e não num "Admin" ao lado.
2. **Um módulo ativo por vez na tela.** A barra lateral mostra só o módulo atual. Trocar de módulo é
   uma ação explícita, visível e com um lugar fixo.
3. **Cada módulo tem identidade própria:** nome, ícone e cor de destaque. A barra superior diz
   sempre "Visitas › Leads" ou "Tags › Lotes".
4. **Pontes explícitas.** Quando uma tela mostra dado do outro módulo, ele aparece com a cor e o
   selo daquele módulo, e o clique atravessa de forma assumida.
5. **O que é da conta fica fora dos módulos:** pessoas, integrações, marca, idioma e perfil.
6. **Nada muda no celular sem motivo.** O `ModuleSwitch` do celular já funciona; o desktop passa a
   ter o equivalente dele.

---

## 3. Arquitetura-alvo

### 3.1 Três espaços

| Espaço | Rota | Conteúdo |
|---|---|---|
| **Visitas** | `/visitas/*` (hoje na raiz) | Para o vendedor: Painel, Visitas, Empresas, Vendas. **Gestão** (gerente): Equipe (o atual Admin Overview), Produtos, Regras de check-in, Xphere |
| **Tags** | `/tags/*` | Para o revendedor: Início, Minhas peças, Link direto. **Gestão** (gerente): Visão geral, Todas as peças, Lotes, Kits, Revendedores (atual "Team"), Jornada, Gravadores NFC |
| **Conta** | `/conta/*` (Configurações + parte global do Admin) | Perfil, idioma e senha para todos. **Organização** (admin): Pessoas e acessos, Integrações, Marca |

O `/admin` deixa de existir como lugar próprio e vira redirecionamento para a seção equivalente.
Com isso, o "Admin › Tags" se funde com o "Tags" do revendedor: **um só Tags**, que mostra mais itens
para o gerente.

### 3.2 Desktop

```
┌──────────────────────┬────────────────────────────────────────────────┐
│ [X] Xpot             │  Tags › Lotes                    ⌘K  EN  ●     │
│ ┌──────────────────┐ ├────────────────────────────────────────────────┤
│ │ ◆ Tags         ▾ │ │                                                │
│ └──────────────────┘ │   (conteúdo)                                   │
│   Início             │                                                │
│   Minhas peças       │                                                │
│   Link direto        │                                                │
│ GESTÃO               │                                                │
│   Visão geral        │                                                │
│   Todas as peças     │                                                │
│   Lotes   ◀ ativo    │                                                │
│   Kits               │                                                │
│   Revendedores       │                                                │
│   Gravadores NFC     │                                                │
│                      │                                                │
│ ⚙ Conta              │                                                │
│ (avatar) Vanildo     │                                                │
└──────────────────────┴────────────────────────────────────────────────┘
```

- **Seletor de módulo no topo da barra lateral**, como o seletor de workspace do Slack ou do Notion.
  Ele mostra o módulo atual com a sua cor e abre a lista dos outros. Também troca por atalho (`G V`,
  `G T`). Quem tem um módulo só vê o nome, sem seta.
- **Cor por módulo**, aplicada ao item ativo, ao seletor e a uma fina linha no topo. Sugestão:
  Visitas no azul atual e Tags em violeta/ciano, que já é a cor dos ícones NFC.
- **A barra superior mostra o caminho** "Módulo › Tela", em vez de só o nome da tela.
- **⌘K agrupado por módulo.** "Em Visitas: empresas…" e "Em Tags: peças…", com o módulo atual
  primeiro.

### 3.3 Celular

Continua igual: `ModuleSwitch` no topo e barra inferior por módulo. Muda só o seguinte:

- o gerente ganha a entrada **Gestão** no módulo (uma aba "Mais" ou um item no topo), em vez de ir a
  um Admin separado;
- as mesmas cores por módulo do desktop.

### 3.4 Empresas: a ponte principal

A empresa é **uma entidade da conta, vista pelos dois módulos.**

- Em Visitas, é a lista de empresas como hoje.
- Em Tags, o cliente é escolhido nessa mesma base.
- O detalhe da empresa ganha **seções por módulo, com o selo de cada um**: "Visitas · 12 check-ins",
  "Vendas · R$ …", "Tags · 2 peças ativas". Cada seção leva para o módulo dela.

---

## 4. Fases

Cada fase é um PR que vai para produção sozinho.

### Fase 0: decisões e furos (sem mudança de navegação)

| ID | Item |
|---|---|
| MOD-01 | **Checagem do módulo Visitas no servidor**, espelhando `server/tags/access.ts`: as rotas de Visitas (leads, visitas, vendas, Xphere) recusam quem não tem `visits`. É a correção do furo 1.6.1. Atenção: o `LeadPicker` de Tags usa `/api/xpot/leads`, então Tags precisa de uma rota própria de busca e criação de empresa, ou essa rota passa a aceitar os dois módulos |
| MOD-02 | **Xphere só para quem tem Visitas**, em Configurações e no servidor (1.6.2) |
| MOD-03 | **Um destino inicial por módulo**, numa fonte só: `ModuleSwitch.HOME` e `getXpotHomePath` param de divergir. Os botões "voltar" de Configurações e do Admin respeitam o módulo da pessoa (1.6.3) |
| MOD-04 | **`/tags/summary` com escopo de gerente** (1.6.4) |
| MOD-05 | **Glossário fechado** (§5) e aprovado antes das fases de texto |

### Fase 1: shell por módulo

| ID | Item |
|---|---|
| MOD-06 | **Seletor de módulo no topo da barra lateral do desktop.** A barra mostra só o módulo atual, mais Conta no rodapé. É o equivalente desktop do `ModuleSwitch` |
| MOD-07 | **Identidade por módulo:** token de cor em `components/xpot/surface.ts` (`MODULE_ACCENT.visits / .tags`) aplicado no item ativo, no seletor, na linha do topo e nas pílulas do celular |
| MOD-08 | **Título com caminho** "Módulo › Tela" na barra superior; `document.title` igual |
| MOD-09 | **⌘K agrupado por módulo**, com o módulo atual primeiro |
| MOD-10 | **Rotas com prefixo de módulo:** `/visitas/painel`, `/visitas/empresas`… As rotas antigas redirecionam (links salvos, PWA instalada, `start_url`). Os nomes em PT nas URLs dependem da decisão D3 |

### Fase 2: a gestão entra no módulo

| ID | Item |
|---|---|
| MOD-11 | **Tags unificado:** as abas de Admin › Tags viram itens do grupo **Gestão** dentro de Tags. "Todas as peças" usa a tabela do admin (com a coluna da face); "Minhas peças" continua a do revendedor. Some a lista duplicada de peças |
| MOD-12 | **Gestão de Visitas:** Admin Overview vira "Equipe" em Visitas. Products, Settings (regras de check-in) e Xphere (admin) entram nesse grupo |
| MOD-13 | **Conta › Organização:** Reps (renomeado "Pessoas e acessos"), Integrações e Marca. O código de atacado de Tags aparece na pessoa, com o selo de Tags |
| MOD-14 | **`/admin/*` redireciona** para os novos lugares. A entrada "Admin" do rodapé sai |

### Fase 3: pontes explícitas

| ID | Item |
|---|---|
| MOD-15 | **Componente `ModuleBadge`** (ícone e cor do módulo) usado em toda informação que atravessa: o card de Tags no Painel, a contagem de peças nos Leads, a seção de peças na empresa, o botão "Vender peça" no check-in |
| MOD-16 | **Detalhe da empresa com seções por módulo** (§3.4), visível nos dois módulos |
| MOD-17 | **Painel de Visitas:** o card de Tags vira um atalho compacto com o selo, ou sai. Decisão D4 |

### Fase 4: vocabulário e idiomas

| ID | Item |
|---|---|
| MOD-18 | **Aplicar o glossário** nos arquivos de `i18n/messages/*` |
| MOD-19 | **Admin traduzido** (EN/PT/ES): hoje é 100% inglês. Entra junto da Fase 2, já que as telas mudam de lugar de qualquer forma |
| MOD-20 | **Desfazer as palavras duplas:** "Team" (campo da pessoa) contra "Revendedores" (relatório), e os três "Overview" |

### Fase 5: números da conta (depende de D5)

| ID | Item |
|---|---|
| MOD-21 | Se a peça vendida tiver de aparecer em Vendas, a ativação de Tags passa a gerar uma linha de venda, ou a aba Vendas ganha uma fonte "Tags". Se não tiver, a separação fica escrita aqui e na tela de Vendas |

---

## 5. Glossário proposto

| Conceito | EN | PT | ES | Observação |
|---|---|---|---|---|
| Módulo de campo | Visits | Visitas | Visitas | Ou "Campo". Ver D1: hoje o módulo e uma tela dele têm o mesmo nome |
| Módulo das peças | Tags | Tags | Tags | Hoje "Etiquetas" em ES. Unificar para a marca ser uma só |
| O objeto físico | piece | peça | pieza | Nunca "tag" para o objeto: Tags é o módulo |
| A empresa | business | empresa | empresa | "Lead" e "Cliente" passam a ser **status** da empresa, não nomes da lista |
| Quem vende na rua | rep | vendedor | vendedor | |
| Quem revende peças | reseller | revendedor | revendedor | O mesmo cadastro de pessoa, com o módulo Tags |
| Lote de fabricação | batch | lote | lote | |
| Entrega a revendedor | kit | kit | kit | |

---

## 6. Decisões em aberto

Cada uma tem uma recomendação; se ninguém discordar, a recomendação vale.

| ID | Pergunta | Recomendação |
|---|---|---|
| D1 | O módulo continua se chamando "Visitas", tendo uma tela "Visitas" dentro? | **Renomear a tela** para "Histórico" ou "Check-ins" e manter o módulo "Visitas". O nome do módulo é o que o vendedor já conhece |
| D2 | A gestão vai para dentro de cada módulo (§3.1) ou o Admin continua separado, só organizado por módulo? | **Dentro do módulo.** É o que acaba com o "Tags duas vezes", e o gerente trabalha no mesmo lugar que a equipe dele |
| D3 | URLs em português (`/visitas/empresas`) ou em inglês (`/visits/businesses`)? | **Inglês**, como o código e a API. A interface traduz. Evita três idiomas de URL |
| D4 | O Painel de Visitas continua mostrando Tags? | **Sim, como atalho compacto com o selo de Tags**, só para quem tem os dois módulos |
| D5 | Peça vendida conta como venda na aba Vendas? | **Ainda não.** Primeiro separar bem (Fases 1–4); depois decidir com os números reais de Tags |
| D6 | "Lead/Cliente" vira "Empresa" na interface? | **Sim** (§5). Acaba com "Cliente" sendo ao mesmo tempo a lista e um status |

---

## 7. Ordem e dependências

```
Fase 0 (furos + glossário) ──► Fase 1 (shell) ──► Fase 2 (gestão no módulo) ──► Fase 4 (texto + Admin traduzido)
                                     └──────────► Fase 3 (pontes)
                                                                     Fase 5 depende de D5
```

A Fase 0 pode começar já: não depende de nenhuma decisão de layout, e o MOD-01 é um furo de
autorização. A Fase 1 é a que resolve o "não consigo identificar no desktop". A Fase 2 é a maior e a
que mais muda a rotina do gerente.
