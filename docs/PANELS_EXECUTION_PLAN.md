# Plano de execução: três painéis (Admin, Produção, Visitas)

**Status:** proposto em 2026-11-04, a partir do que o dono explicou nesse dia. Nada executado ainda.
**Público:** dono, engenharia.
**Objetivo:** o Xpot passa a ter três lugares, cada um com o menu só do que se faz ali, e cada pessoa vê só os
lugares que lhe cabem. O que muda é o shell (menus, nomes, telas de entrada). Permissões, dados e URLs ficam como estão.

Sucede o [PROFILES_EXECUTION_PLAN.md](PROFILES_EXECUTION_PLAN.md) (Rev. 3, executado), que acertou as permissões e os
dados mas montou os menus por tarefa, dentro de um painel só por perfil. É esse painel único que ficou confuso.

**Revisão antes de executar (2026-11-04), contra o código. Vale sobre o resto do documento:**

| Ponto | Decisão | Por quê |
|---|---|---|
| Modelos | Item de **Produção**, só para `platform`, em vez de Admin. A aba some | A página de um modelo é aberta de dentro da produção (peças sem código, pedidos). Em Admin, cada um desses cliques trocaria de painel. O parceiro continua abrindo a página de um modelo pelos pedidos dele, mas não tem a lista |
| Abas de Produção | Produce, Printing e Models viram itens do menu (`/production`, `/production/printing`, `/production/models`); a barra de abas some | O menu já diz onde a pessoa está; abas repetiriam |
| Duplicata no menu | Produção não tem "Hoje" e "Produzir" separados: um item só, "Make / Produzir / Producir" | Eram a mesma tela |
| Visits e Tags dentro de Visitas | O seletor atual Visits \| Tags **continua** dentro do painel Visitas nesta rodada; o seletor novo fica acima dele | Fundir os dois mexe nas telas do vendedor, que estão funcionando, e não foi o que o dono pediu |
| Dono de equipe até a F4 | Na F1 ele continua com o painel atual, sem o nome antigo mudar de lugar; a F4 leva para Visitas | Cada fase precisa deixar todos os perfis funcionando |

**Correção do dono (2026-11-04), vale sobre todo o resto, inclusive a tabela acima:** a troca de painel **não** é uma aba no
topo da barra lateral. A plataforma inteira já é a plataforma de visitas; entrar em Produção ou Admin é escolher trocar de
página, então fica no pé da barra lateral, em linhas (`SidebarPanelRows`), acima de Settings. No topo fica só Visits | Tags.
Toda menção abaixo a um "seletor no topo" está superada.

---

## 1. O que o dono descreveu

Três painéis, e quem entra em cada um:

| Painel | Para quê | Quem |
|---|---|---|
| **Admin** | Gestão geral: todas as empresas, inclusive a Skale; todos os clientes; quem entra e quem sai; o que é da plataforma | Só Vanildo e Leila |
| **Produção** | Gestão das peças: fazer, imprimir, estoque, para quem foi e para quem vai, quem vendeu e quem não vendeu, quem está com peça, o que falta imprimir (peças e bases), quem está dentro da operação | Vanildo e Leila (a produção da Skale) e cada parceiro que imprime as peças da Xpot, cada um só com a própria operação. Replicável por parceiro |
| **Visitas** | O trabalho de rua. O painel padrão, simples | Todo mundo que visita. O parceiro também, se quiser vender |

Quem só visita tem só Visitas. Quem visita e é dono da própria organização (ele e a esposa; ele e três
funcionários) não produz nada e não vê nada de produção, mas, dentro de Visitas, organiza a equipe: quantas pessoas
tem, quais plaquinhas estão com o João, quantas com o Pedro.

Isso é uma decisão tomada. Não se pergunta de novo quem vê o quê.

## 2. Diagnóstico: o que o código tem hoje

Verificado em `main` (`b840194`), 2026-11-04.

### 2.1 O que já está certo e não muda

| Já existe | Onde |
|---|---|
| Os perfis: `platform`, `partner`, `owner`, `member` | `shared/profiles.ts` (`profileOf`, `can`) |
| Produção por organização: o admin vê tudo, o parceiro só a sua | `requireProductionUser` + `productionScopeOf` (`server/tags/access.ts`); `print_jobs.organization_id` etc. (migração `0065`) |
| Estoque, distribuição e resultados por organização | `requireTagManager` + `tagScopeOf`; `0068` |
| Modelos liberados por parceiro | `released_print_models` (`0069`) |
| Equipe, compras e configurações de uma organização | `/organizations/<id>?tab=team|purchases|settings` |
| Painel do cliente final (`/my`) | `0071`, `client/src/pages/my/` |
| Qualquer computador Windows gera arquivos de impressão | `print-pipeline/desktop.py`, Production › Printing (2026-11-04) |

Em resumo: **o servidor já sabe quem pode o quê.** Nenhuma permissão nova é necessária para este plano.

### 2.2 O que está errado (e é o que o dono vê)

| Problema | Evidência | Efeito |
|---|---|---|
| Um painel por perfil, com os menus agrupados por tarefa (Make, Pieces, Field, Administration), em vez de três lugares | `panelGroups` em `client/src/components/xpot/moduleNav.ts` | O painel do super admin mistura produção, estoque, visitas das empresas e administração numa lista só |
| O painel do parceiro é o painel do dono com "Make" na frente | idem, `profile === "partner"` | O parceiro ganha um grupo "Field" (Tarefas, Vendas, resultados da equipe) dentro da produção |
| A porta do painel se chama "Skale Club" para a plataforma | `panelPlatform` em `i18n/messages/workspaces.ts`; `panelNames.ts` | Parece a empresa, não o Admin; e a Skale também é uma empresa como as outras |
| Tarefas e Vendas de todas as empresas aparecem no painel | `/admin/work/tasks`, `/admin/work/sales` no grupo Field | O dono disse que não fazem sentido ali |
| Modelos (catálogo técnico) é uma aba de Produção | `ProductionTab.tsx` | Confunde quem só quer fazer peças; e criar modelo é da plataforma, não do parceiro |
| Computers (pareamento) no menu principal | `provisioners` no grupo Make | Já não é preciso para imprimir (Xpot Desktop). Fica só a gravação de chip por leitor USB |
| History no menu | movido para Administration em 2026-11-04 | Ainda é um item de menu; é consulta, não trabalho |
| Produção não diz "o que falta imprimir" como lista | Bases com estoque baixo aparecem só dentro dos cards "Always ready" | O dono quer ver o que falta (peças e bases) na entrada da Produção |
| Produção não mostra "quem está dentro da operação" | A equipe do parceiro fica em `/organizations/<id>?tab=team`, fora do painel | O parceiro precisa gerir a operação dele a partir da Produção |
| Vocabulário | "Reseller", "kit", "Hand out" (parcialmente trocado em 2026-11-04) | Termos que o dono não reconhece |

### 2.3 O que não está decidido no código nem no plano anterior

- O painel do dono de uma organização vendedora era um painel próprio (`/admin` com Team, Stock, Hand out…). Pelo que o
  dono descreveu, isso **não é um painel**: é a parte "Empresa" de Visitas. A §4.4 propõe isso.
- O parceiro que também vende: hoje o módulo Visitas já é independente do painel. Ele terá Visitas se o módulo estiver
  ligado para ele, como qualquer pessoa.

## 3. Modelo alvo

### 3.1 Três lugares, acesso por perfil

```
                     Admin        Produção      Visitas
platform (Vanildo,   ✓ tudo       ✓ (Skale)     ✓
  Leila)
partner (imprime)    ✗            ✓ (a sua)     ✓ se tiver o módulo
owner (vende, tem    ✗            ✗             ✓ + "Empresa"
  equipe)
member               ✗            ✗             ✓
```

Um lugar é um conjunto de telas com o próprio menu, a própria cor e o próprio "Hoje". A pessoa troca de lugar pelas linhas
no pé da barra lateral, que só listam os outros lugares que ela tem. Quem tem um só não vê nenhuma.

- **Visitas** é o app atual (módulos Visitas e Tags: Início, Rota, Empresas, Visitas, Tarefas, Vendas; Minhas peças,
  Clientes, Loja). Continua o padrão e a tela de entrada de todo mundo.
- **Produção** é a parte de Tags › Gestão que trata de peças, com escopo da organização de quem está vendo.
- **Admin** é tudo que é da plataforma, mais a visão de todas as empresas.

### 3.2 URLs

Nenhuma muda. O shell decide a que lugar cada caminho pertence (`panelOfPath`):

| Caminho | Lugar |
|---|---|
| `/dashboard`, `/route`, `/leads`, `/tasks`, `/sales`, `/tags/*`, `/settings` | Visitas |
| `/organizations/<id>` (equipe, compras, configurações da própria organização) | Visitas › Empresa (owner) · Produção › Operação (partner) · Admin › Organizações (platform) |
| `/admin/tags/production/*` (com `/models/*`), `/admin/tags/batches/*`, `/admin/tags/pieces/*`, `/admin/tags/kits`, `/admin/tags/overview/*` | Produção (para o owner, os três últimos são Visitas › Empresa). `/admin/tags/kits` é sempre da Produção, seja qual for a query: `?view=orders` (pedidos Stuscle) é uma visão da Distribuição e não troca de painel |
| `/admin/tags/provisioners` | Produção, só enquanto existir (§4.5) |
| `/admin`, `/organizations`, `/admin/reps`, `/admin/work/leads`, `/admin/products`, `/admin/tags/shop`, `/admin/tags/journey`, `/admin/integrations`, `/admin/xphere`, `/admin/branding`, `/admin/landing`, `/admin/health`, `/admin/settings`, `/admin/overview` | Admin |
| `/admin/work/tasks`, `/admin/work/sales` | Admin, sem item de menu (links antigos continuam abrindo) |

O "Hoje" de cada lugar: Admin em `/admin`; Produção em `/admin/tags/production` (o board, que já é o dia a dia); Visitas
em `/dashboard`. Um parceiro que abrir `/admin` vai para `/admin/tags/production`.

O escopo de dados (`X-Xpot-View: manage|rep`, `client/src/lib/workspace.ts`) continua preso ao caminho, não ao lugar.
Nada muda nele.

### 3.3 Menus

```
ADMIN (âmbar)                       PRODUÇÃO (violeta)                 VISITAS (azul)
Hoje                                PEÇAS                              Início
EMPRESAS                              Produzir                         Rota
  Organizações (todas, com a Skale)   Impressão                        Empresas
  Pessoas                             Estoque                          Visitas
  Clientes (de todas)                 Distribuição                     Tarefas
  Resultados das equipes              Resultados                       Vendas
                                    OPERAÇÃO                           ─────
PLATAFORMA                            Equipe (da organização)          Minhas peças
  Produtos                            Computadores (até a F5)          Clientes
  Loja                                Modelos (só platform)            Loja
  Integrações · Marca · Status      ─────                              EMPRESA (só owner)  
  Regras de check-in                  Configurações da operação          Equipe
  Histórico                                                              Peças da equipe
                                                                         Entregar e receber
                                                                         Compras da equipe
                                                                         Resultados
```

Não há item "Pedidos Stuscle" em Admin: os pedidos são uma visão da Distribuição (`/admin/tags/kits?view=orders`), que
é da Produção, e abrir a aba Pedidos dentro da Distribuição não pode trocar de painel. A linha de pedidos pendentes do
"Hoje" de Admin continua levando a essa visão (aí a plataforma entra em Produção, e tudo bem). Na Distribuição, a tela abre
em "Entregar sem pedido" para o parceiro e em "Pedidos para enviar" para a Skale, como hoje.

Celular: a barra de baixo tem quatro itens por lugar (Admin: Hoje, Organizações, Pessoas, Mais; Produção: Hoje,
Impressão, Estoque, Distribuição; Visitas: as de hoje). O seletor de lugar vai para "Mais" e para o menu da conta.

### 3.4 Nomes

| Hoje | Alvo (en / pt / es) |
|---|---|
| "Skale Club" (porta e barra âmbar) | "Admin" / "Admin" / "Admin" |
| "My company" / "My companies" | some: a equipe do dono é "Company" / "Empresa" / "Empresa" dentro de Visitas |
| grupos Make, Pieces, Field, Administration | somem; os grupos são os da §3.3 |
| "Production" (aba e item) | "Production" / "Produção" / "Producción" (o lugar); dentro dele "Make pieces" vira "Make" / "Produzir" / "Producir" |
| "Computers" | some (§4.5); "This computer" / "Este computador" / "Esta computadora" fica dentro de Produção |
| "Reseller" (quem recebe peças) | "person" / "pessoa" / "persona"; na equipe, "member" / "membro" / "miembro" |
| "kit" | "delivery" / "entrega" / "entrega" |

## 4. Fases

Cada fase é um PR que entra sozinho em produção sem quebrar o que está. Ordem obrigatória: F0 → F1 → (F2, F3, F4 em
qualquer ordem) → F5 → F6.

### F0 · O lugar de cada caminho `risk:low`

- `client/src/components/xpot/panels.ts` (novo): `Panel = "admin" | "production" | "visits"`; `panelsOf(profile, modules)`;
  `panelOfPath(path, profile)` (tabela da §3.2); `panelHome(panel, profile)`.
- `tests/panels.test.ts`: a tabela da §3.1 e a da §3.2 como teste de mesa, perfil a perfil.
- Nada visível muda ainda.

### F1 · O shell: seletor e menus `risk:medium` `depends:[F0]`

- `moduleNav.ts`: `panelGroups` passa a receber o lugar, não o perfil, e devolve os grupos da §3.3. `panelPhoneTabs` por lugar.
- `AppLayout.tsx`: `SidebarModuleSwitch` vira o seletor de lugar (Visitas | Produção | Admin), com a cor de cada um
  (`MODULE_ACCENT.visits`, `.tags`, `MANAGEMENT_ACCENT`). A porta "Skale Club" (`panelDoor.tsx`, `PanelDoorRow`) e o
  item "Skale Club" no ⌘K somem. A barra âmbar (`AdminMode.tsx`) diz o nome do lugar.
- `AdminApp.tsx`: `allowed` passa a ser "o lugar deste caminho está em `panelsOf`"; título e ⌘K lêem o lugar. Parceiro
  em `/admin` → `/admin/tags/production`.
- `AdminHome.tsx` / `home-model.ts`: o "Hoje" de Admin fica só com as linhas de plataforma (pessoas a aprovar,
  organizações novas, pedidos Stuscle, estações e computadores fora do ar). As linhas de produção vão para o board.
- `workspaces.ts`, `shell.ts`, `navIa.ts`: os nomes da §3.4, nas três línguas.
- Testes: `tests/module-nav.test.ts` reescrito por lugar; `tests/navigation-loading.test.ts`; `tests/i18n-menu-paths.test.ts`.

### F2 · Produção: o que falta e quem opera `risk:medium` `depends:[F1]`

- Board (`production-board.tsx`): uma seção "O que falta" acima de "Fazer peças": bases e peças sem código abaixo do
  ponto de reposição (`partReorderAt`, já existe) e materiais (adesivos NFC) a comprar, cada linha com o botão de
  imprimir ou o link do fornecedor (`production-materials.tsx`).
- "Equipe" da operação: `/organizations/<id>?tab=team` entra no menu de Produção para `platform` (a Skale) e
  `partner`. É a tela que já existe; só ganha a porta.
- Modelos sai das abas de Produção (`ProductionTab.tsx`) e vira Admin › Modelos (mesma `CatalogView`, mesma URL).
  Um parceiro continua sem ver (`requireTagAdmin` nas rotas de escrita, já é assim).
- "Este computador" (`production-this-computer.tsx`) ganha o leitor NFC: quando plugado, oferece "Gravar chips neste
  computador" (abre o fluxo de gravação atual). Enquanto o app Xpot NFC Writer for necessário, o item diz como instalá-lo.

### F3 · Admin: todas as empresas `risk:low` `depends:[F1]`

- Organizações (`/organizations`): a Skale aparece na lista como uma empresa (hoje é a "company" escondida pelo slug
  `xpot-company`); coluna "Produz" (prints_own_pieces) e filtro.
- Clientes (`/admin/work/leads`): já lista todas as empresas para `platform`; entra no menu como "Clientes".
- Tarefas e Vendas de todas as empresas saem do menu (URLs continuam).
- Pedidos Stuscle: **não** entram no menu de Admin. `/admin/tags/kits` (qualquer `?view=`) é sempre da Produção; só a
  linha de pedidos pendentes do "Hoje" de Admin aponta para `?view=orders`.
- Histórico (`/admin/tags/journey`) e Regras de check-in ficam no fim do grupo Plataforma.

### F4 · Visitas › Empresa (owner) `risk:medium` `depends:[F1]`

- Para `owner` (`runsATeam`), a barra lateral de Visitas (e a de Tags) ganha o grupo "Company / Empresa / Empresa", nunca
  "Minha equipe": Overview (o Hoje do dono, `/admin`), Team, Pieces, Give and take back, Purchases, Results, Team results e,
  com nomes que não repetem os do próprio vendedor, Team customers, Team tasks, Team sales (`/admin/work/*`). São as telas
  que formavam o painel do dono, com o mesmo escopo (`tagScopeOf`); o cabeçalho de dados continua preso ao caminho.
  O dono não tem painel, nem porta, nem barra âmbar: essas telas usam o chrome de Visitas e, no celular, o grupo abre numa
  folha pela aba "Empresa" das barras de Visitas e Tags. `/admin` não redireciona: é o item Overview.
  Feito (2026-11-04); `panelsOf("owner")` é `["visits"]` e `panelOfPath` devolve `visits` nesses caminhos.
- A tela de Peças da equipe responde "quais plaquinhas estão com o João": é a lista atual (`PiecesTab`) filtrada por
  pessoa, com o filtro de pessoa em destaque e a contagem por pessoa no topo.
- `member`: nada muda.
- `partner`: a equipe dele está em Produção › Operação (F2); em Visitas ele é um vendedor comum.

### F5 · Limpeza `risk:low` `depends:[F2,F3,F4]`

- Remover a tela Computers (`ProvisionersTab.tsx`, `manageWriters`) depois do primeiro teste real do Xpot Desktop
  (checklist §6). A gravação de chip por leitor USB continua pelo app Xpot NFC Writer até a F2 cobrir o leitor; o
  pareamento dele passa a ser feito de "Este computador", sem tela própria.
- Desligar o processo antigo do bench neste PC (`bench.py run` iniciado em 2026-11-03 pelo Codex) e apagar o
  `credentials.json` dele; o Xpot Desktop assume.
- Vocabulário restante (§3.4) em `adminTagsFlow.ts`, `manageTags*.ts`, `pieceScreen.ts`.
- Apagar: `panelNames.ts` (`panelPlatform`, `panelCompany`, `panelCompanies`), `panelDoor.tsx`, `accountGroups` e o que
  mais só o painel único usava. `docs/MODULES.md` e `PROFILES_EXECUTION_PLAN.md` ganham uma nota apontando para cá.

### F6 · Verificação `risk:medium` `depends:[F5]`

- `tests/profiles-matrix.integration.test.ts` ganha os três lugares: para cada perfil, cada caminho da §3.2 abre ou é
  negado, e o menu tem exatamente os itens da §3.3.
- Navegador, uma conta por perfil, em desenvolvimento: platform (a conta do dono), partner, owner com dois membros,
  member. Hoje não existe conta de parceiro nem de dono com equipe em desenvolvimento; a F6 cria as duas organizações
  de teste no banco de desenvolvimento (Supabase, `DEV_DATABASE_URL`), nunca em produção.
- Celular (390 px) e desktop (1280 px) para cada lugar.

### Ordem e tamanho

| Fase | Arquivos tocados (estimativa) | Tamanho |
|---|---|---|
| F0 | 2 novos | Pequeno |
| F1 | `moduleNav.ts`, `AppLayout.tsx`, `AdminApp.tsx`, `AdminMode.tsx`, `panelDoor.tsx`, `AdminHome.tsx`, `home-model.ts`, 3 dicionários, 3 testes | Grande (é o coração) |
| F2 | `production-board.tsx`, `ProductionTab.tsx`, `production-this-computer.tsx`, `desktop.py`, dicionários | Médio |
| F3 | `OrganizationsPage`, `moduleNav.ts`, dicionários | Pequeno |
| F4 | `moduleNav.ts`, `PiecesTab.tsx`, `AdminApp.tsx`, dicionários | Médio |
| F5 | remoções | Pequeno |
| F6 | testes, contas de teste | Médio |

## 5. O que não muda, de propósito

- Permissões e escopo de dados no servidor (`requireProductionUser`, `requireTagManager`, `requireTagAdmin`): já estão
  certos para os três lugares. Esconder menu nunca é a fronteira; o servidor continua negando.
- URLs: nenhuma muda, nenhum link salvo quebra.
- Stuscle, a loja do vendedor (`/tags/shop`), o painel do cliente final (`/my`), o caminho `own` de distribuição do
  parceiro (fica para o primeiro parceiro fora dos EUA, como já estava).
- A regra de que o parceiro imprime só os modelos liberados pela plataforma.

## 6. Riscos e salvaguardas

| Risco | Salvaguarda |
|---|---|
| Alguém perde o acesso a uma tela que usava | A F0 lista todos os caminhos; a F6 testa cada um por perfil. Um caminho fora da tabela cai em Admin para `platform` e é negado para os outros, nunca some em silêncio |
| O seletor de lugar confunde no celular | Três itens, cores diferentes, nome escrito; testado a 390 px antes de entrar |
| Tirar Computers antes do Xpot Desktop funcionar deixa a Skale sem gerar arquivo | F5 só depois do checklist: um pedido gerado e impresso por um computador preparado pelo Xpot Desktop, com o processo antigo desligado |
| A conta do dono é `platform` e `partner` ao mesmo tempo (a Skale produz) | `panelsOf("platform")` dá os três lugares; a Produção dele é a da Skale, pelo escopo `null` já existente |
| O parceiro não tem o módulo Visitas ligado | Ele vê só Produção; ligar Visitas é a ação já existente em Admin › Pessoas |

## 7. Checklist antes de começar

- [ ] O dono leu este plano e não discorda da §3.3 (os menus) e da §4.4 (a equipe do dono dentro de Visitas, não um
      painel próprio). Se discordar de um ponto, a fase correspondente muda; o resto segue.
- [ ] `DEV_DATABASE_URL` e `DEV_SUPABASE_PROJECT_REF` no `.env` deste PC, para a F6 rodar em desenvolvimento.
- [ ] Teste real do Xpot Desktop feito (pré-requisito da F5, não das outras).
