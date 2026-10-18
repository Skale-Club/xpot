# Revisão de UX do Xpot (outubro de 2026)

**Base:** `0f4b5be` (main) · **branch:** `claude/ux-overhaul` · **data:** 2026-10-18

Este documento resume o que mudou na revisão de UX, por quê, quais decisões de
produto foram tomadas por padrão (e como desfazer cada uma), como ficou o menu
e como conferir cada área. O histórico completo está nos commits
(`git log --oneline 0f4b5be..claude/ux-overhaul`); cada um explica o motivo no
corpo da mensagem.

## Por quê

A auditoria (relatório "Revisão UX do Xpot", 18/out) concluiu que boa parte da
"confusão visual" vinha de baixo: a mesma palavra com significados diferentes,
o mesmo número com definições diferentes e ações que faziam outra coisa além
do que o rótulo dizia. Exemplos: "Vendida" com três contas na mesma tela de
lote; "Exigir GPS" que não exigia GPS; editar o endereço apagava as
coordenadas; ativar uma peça da casa passava a peça para quem clicou; "Admin"
em Pessoas virava admin global sem aviso. Por isso a ordem foi: primeiro as
regras, depois o vocabulário, depois o kit visual, depois a reorganização do
menu e das telas, e por fim a limpeza.

## O que mudou, fase por fase

### Fase 0: regras de negócio (antes de qualquer visual)

- **Visitas** (0A): editar o endereço mantém as coordenadas (ou geocodifica o
  novo endereço); o raio padrão da área do cliente passa a valer; "Concluídas
  hoje" e "Últimas visitas" contam todo resultado final, não só `completed`;
  as regras de check-in dizem o que fazem e as visitas fora da área ganham o
  selo "Exceção: fora da área"; "Cancelar visita" alcançável e confirmado; card de rota
  do Painel igual à tela Rota; consignação encerrada nunca aparece atrasada;
  confirmação para cancelar venda e encerrar acordo; estados de carregamento e
  erro no lugar de "nada aqui"; a página da empresa lê os mesmos números de
  vendas nos tiles e no card; filtro "Retorno pendente" que encontra o que
  promete; segmento Prospectos; um único diálogo "Nova empresa", com Google e
  coordenadas.
- **Gestão de Tags** (0B): uma definição por número de estoque
  (`shared/tagMetrics.ts`), usada por todas as telas; ativar uma peça da casa
  pela gestão mantém a peça no estoque da casa; gerentes conseguem entregar kit
  a partir de um lote; custo do kit só obrigatório pela política de custo;
  "Passar" para outro revendedor vira movimento de estoque com confirmação;
  peça nova só pelo admin e com produto do catálogo; cards da Visão geral
  abrem a lista que contam.
- **Plataforma e Pessoas** (0C): os interruptores de voz e IA são respeitados
  (`server/lib/providerChoice.ts`, migração 0052); integrações dizem a
  verdade (fonte painel/ambiente, Twilio "obrigatório para entrar"); chaves do
  Xphere mascaradas e com rotação; o card de MCP diz o escopo real; Pessoas
  avisa antes de tornar alguém admin do Xpot, ninguém muda o próprio papel,
  recusas ficam separadas de bloqueios; erros de validação apontam o campo, no
  idioma da pessoa; Organizações, Marca, Landing e Status traduzidos.
- **App de Tags** (0D): o revendedor vê e abre as empresas que têm peças dele;
  leituras de 30 dias corretas; a venda sugere o cliente da peça primeiro;
  estoque e chip visíveis na peça; filtros de Minhas peças em dois eixos;
  desvincular a peça do cliente; bottom sheets com título, Esc e foco;
  mensagens de venda bloqueada dizem quem resolve e onde.

### Fase 1: vocabulário

O glossário foi aplicado nos arquivos de i18n (EN/PT/ES), e as recusas mais
comuns do servidor passaram a ter códigos estáveis que o cliente traduz
(`client/src/lib/apiErrors.ts`, `i18n/messages/apiErrors.ts`).

| Conceito | Antes (amostra) | Agora (PT / EN) |
|---|---|---|
| Registro do negócio | Lead, Cliente, Estabelecimento | Empresa / Company |
| Estágio da empresa | Prospect, Lead, Ativo | Prospecto → Em negociação → Cliente / Prospect → Lead → Customer |
| Pessoa de campo | Vendedor, Revendedor, Parceiro, Rep | Vendedor (Visitas), Revendedor (Tags); "Nova pessoa" em Pessoas |
| Gestão | Modo de gestão, Admin, Organização, Equipe | Modo gestão / Sair da gestão; selo "Admin do Xpot"; papel "Admin da organização"; grupo Administração |
| Estoque sem revendedor | Em casa, Estoque da empresa, Casa | Estoque da casa / House stock |
| Status digital | Disponível, Desligada | Sem cliente · Configurada, fora do ar · No ar · Pausada · Aposentada |
| Movimentos | Dar kit, Devolver, Passar, Desvincular | Entregar · Recolher ao estoque da casa · Transferir · Remover cliente · Trocar cliente |
| Vendida | 3+ definições | Só "venda registrada" |
| Chip | Programar, conferido, travado | Gravar · Gravado · Verificado · Lacrar / Lacrado |
| Leituras | Scans, Interações, toques | Leituras (QR + NFC), sempre com o período |
| Destino | Link de destino, O que abre | Destino / Destination |
| Margem | Ganho, Você ficou com, Lucro bruto | Lucro; "Margem da empresa" no catálogo |
| Estoque no cliente | Estoque, Na rua, No cliente | Consignação; "Na prateleira" para a quantidade |
| Resultado da visita | Status, "Concluída" | Resultado; "Visitada"; nota livre = Anotações |
| Jornada | Jornada, Trajetória, Jornada do lote | Atividade (automático) e Diário de produção |

### Fase 2: kit visual único

Um azul de marca (`--primary` = `#3b82f6`), tokens navy no modo escuro, uma
escala de raio, e um componente de cada: Button (variantes brand, money,
danger, secondary, outline, ghost; `loading`), Pill com mapas de tom por
domínio, EmptyState/ErrorState, ConfirmDialog (fim do `window.confirm` /
`prompt`), PageHeader/BackLink, Field/Input/Select/Textarea, FormFooter,
SwitchRow, CopyButton, Stat/KpiTile, SectionCard, InlineAlert, ListSkeleton,
RetryButton, CompactDataTable com alinhamento e linha selecionada, e os
formatadores de `lib/format.ts`. Regras de cor: verde só para dinheiro e
sucesso, violeta só para Tags, âmbar só para "precisa de um passo". Depois do
kit, todas as telas (gestão geral, gestão de Tags, Visitas, Rota, app de Tags,
conta e entrada) foram migradas para ele. Índice: [UI_KIT.md](./UI_KIT.md).

Dois bugs apareceram na migração e foram corrigidos: as notas de voz do
check-in nunca eram enviadas (a mutação ignorava a gravação), e os "três
pontinhos" do loader e o hover dos botões não existiam (classes CSS ausentes).

### Fase 3: reorganização

- **3a, navegação:** um só mapa de telas (`moduleNav.ts`) para barra lateral,
  barras do celular, paleta, trilha e título. Grupos Administração (gerentes)
  e Plataforma (admin do Xpot). Modo gestão com chip de escopo e aba Gestão
  no celular nos dois módulos; o botão de escudo saiu. Configurações em quatro
  abas. "Voltar" leva de onde a pessoa veio. Tarefas do time só em modo gestão.
- **3b, plataforma:** Integrações organizadas por função, com último teste e
  último erro (migração 0053, `integration_checks`); Marca e site público
  junta Marca e o editor da Landing; Status com serviços, problemas de sync do
  CRM com Retry e "Montar a rota de novo" para rotas presas. Integrações e
  Status leem a mesma lista de serviços (`server/observability/services.ts`).
- **3c, gestão de Tags:** Visão geral com filas "Precisa de ação" e funil de
  estoque; Distribuição (Entregar, Pedidos Stuscle, Kits como histórico,
  Recolher), com simulação antes de entregar e de recolher; kits numerados
  (K-0001) e com histórico do que foi entregue (migração 0054,
  `tag_kit_items`); Lotes como pipeline por etapa; detalhe do lote em abas;
  estação de recebimento com "Desfazer última leitura".
- **3d, uma tela de peça:** a tela do revendedor e a página do admin viraram
  uma só, montada por seções conforme o papel (`client/src/components/piece/`).
  Cancelar uma venda de Tags agora devolve a peça ao estoque (antes ela ficava
  marcada como vendida e não podia ser vendida de novo). A gestão pode vender
  em nome do revendedor que tem a peça.
- **3e, pessoas:** Pessoas é o único lugar para gerenciar uma pessoa (acesso,
  papel e módulos, organizações, Tags, Xphere, atividade); Organizações não
  cria mais contas (só vincula pessoas existentes); espaços pessoais
  escondidos atrás de um interruptor; Visitas › Gestão › Visão geral por
  período, com uma linha por vendedor; Produtos com abas Ativos/Arquivados.

### Fase 4: limpeza

- **4a, código morto:** a tela `RouteSettings` que nenhuma rota abria, o
  diálogo de importação CSV sem tela, código morto dos hooks de empresas e
  check-in (inclusive uma busca do Google Places paga que rodava sem ser
  lida), exportações e aliases do kit sem uso, imports não usados, a API
  Xphere do vendedor (`/api/xpot/xphere/config`), os endpoints
  `/tags/summary` e `/tags/:id/dashboard`, `markLeadCustomer`, tokens de
  Tailwind e variáveis CSS sem uso e 216 chaves de i18n sem uso. Um teste
  novo (`tests/i18n-unused-keys.test.ts`, script
  `scripts/i18n-unused-keys.ts`) falha quando uma chave fica sem uso. As
  rotas-alias antigas continuam, para não quebrar favoritos.
- **4b, documentação:** README, [ARCHITECTURE.md](./ARCHITECTURE.md),
  [UI_KIT.md](./UI_KIT.md), [BACKLOG.md](./BACKLOG.md) (área UXR) e este
  documento; linhas que ficaram falsas em [MODULES.md](./MODULES.md),
  [TAG_SALES_EXECUTION_PLAN.md](./TAG_SALES_EXECUTION_PLAN.md) e
  [prospecting-planner-ux.md](./prospecting-planner-ux.md) ganharam nota datada.

## As 6 decisões de produto tomadas por padrão

O relatório deixou seis perguntas para você. Seguimos a opção indicada abaixo;
cada uma pode ser desfeita.

| # | Pergunta | O que foi feito | Como reverter |
|---|---|---|---|
| 1 | Organizações já são para o usuário? | Ficam no modelo de dados. A tela `/organizations` sai da navegação de quem não gerencia e fica em Administração para gerentes e admins; foi traduzida e o escopo foi corrigido (revendedor vê as empresas que têm peças dele). Organizações não cria contas: só vincula pessoas existentes; criar é em Pessoas. A criação automática de espaços pessoais continua | Para tirar a tela de vez: remover o item `/organizations` de `administrationItems()` (`client/src/components/xpot/moduleNav.ts`) e a rota em `App.tsx`. Para mostrar a quem não gerencia: devolver o item ao grupo do menu dessa pessoa em `accountGroups()`. Para parar a criação automática: `ensureOrganizationForRep` em `server/organizations/service.ts` |
| 2 | Xphere: configurado pelo vendedor ou só pelo admin? | Só pelo admin do Xpot: Plataforma › Integrações › Xphere ou a seção Xphere da pessoa em Pessoas. Chaves de entrada mascaradas, com mostrar, copiar e trocar. Os textos do vendedor em Configurações saíram | Para o vendedor configurar: uma seção em Configurações chamando `GET/PUT /api/xpot/xphere/config` (rotas do vendedor removidas na Fase 4a, commit `85a38d5`; recuperar do histórico) |
| 3 | GoHighLevel ainda é usado? | Continua funcionando, marcado "Legado": na seção CRM de Integrações fica dobrado sob "Legado"; Vendas › Pipeline explica quando não está conectado | Tirar os rótulos: chaves `legacyBadge` / `legacyTitle` (`i18n/messages/integrations.ts`, `platformAdmin.ts`) e a dobra em `client/src/pages/admin/platform/IntegrationsHub.tsx`. Remover o GHL de vez é outra tarefa (`server/integrations/ghl.ts`, sync, selo nas empresas) |
| 4 | Custo do kit de Tags | Obrigatório só quando a política do revendedor é custo por aquisição, ou quando o kit é uma compra. Na consignação de estoque da casa, um custo informado fica registrado como referência e a peça continua da empresa | A regra está num só lugar, `shared/tagKits.ts`, usado pelo formulário e pela rota |
| 5 | Ativar uma peça conta como venda? | **Nunca.** Só uma venda registrada (`sales_sale_tags` ativa) conta como vendida, em todas as telas e relatórios (`shared/tagMetrics.ts`). O diálogo de ativação diz isso. A venda de Tags aparece em Vendas | Contraria o plano (`TAG_SALES_EXECUTION_PLAN.md` §14, "transformar ativação da peça em venda automática" está fora do escopo). Exigiria criar a venda na ativação e mudar a métrica `sold` em `shared/tagMetrics.ts`. Não recomendado |
| 6 | Jornada: manter planos e caderno de decisões? | Mantidos. O nome no menu passou a "Diário de produção"; o automático aparece como "Atividade"; entradas automáticas repetidas são dobradas em "N registros parecidos" | Para ficar só com a atividade e o diário: esconder planos e decisões em `client/src/pages/admin/tags/JourneyTab.tsx` / `JourneyPanel.tsx` / `JourneyForms.tsx`. As ferramentas MCP de planos (`tags_plan_*`) continuariam existindo |

## A nova arquitetura de informação

```
Visitas                                   (barra do celular: Painel, Rota, Empresas, Tarefas, Vendas [+ Gestão])
├─ Painel                /dashboard
├─ Rota                  /route            → Visita /route/check-in (pela rota, Empresas ou a paleta)
├─ Empresas              /leads, /leads/:id
├─ Visitas               /dashboard/history (fora da barra do celular; pelo Painel, barra lateral e paleta)
├─ Tarefas               /tasks
├─ Vendas                /sales (Resumo · Vendas · Consignações · Funil)
└─ Gestão                (gerente, em modo gestão)
   ├─ Visão geral        /admin/overview
   ├─ Produtos           /admin/products
   └─ Regras de check-in /admin/settings

Tags                                      (barra do celular: Painel, Clientes*, Minhas peças [+ Gestão])
├─ Painel                /tags             → Gravar chip sem o Xpot /tags/direct
├─ Clientes              /tags/customers (* fora da barra do celular de quem também tem Visitas)
├─ Minhas peças          /tags/pieces      → peça /tags/t/:code
└─ Gestão                (gerente, em modo gestão; ★ = só admin do Xpot)
   ├─ Visão geral        /admin/tags/overview (filas, funil, leituras, atividade)
   ├─ Lotes ★            /admin/tags/batches (Resumo · Impressão · Receber · Peças · Entregar · Atividade)
   ├─ Inventário         /admin/tags/pieces → peça /admin/tags/pieces/:id
   ├─ Distribuição       /admin/tags/kits (Entregar · Pedidos Stuscle · Kits · Recolher)
   ├─ Revendedores       /admin/tags/team
   ├─ Diário de produção ★ /admin/tags/journey
   └─ Gravadores NFC ★   /admin/tags/provisioners

Conta
├─ Configurações         /settings (Perfil · Acesso · Idioma · Vínculos)
├─ Administração         (gerente, em modo gestão)
│  ├─ Pessoas            /admin/reps, /admin/reps/:repId
│  └─ Organizações       /organizations
└─ Plataforma ★          (só admin do Xpot; selo uma vez no título do grupo)
   ├─ Integrações        /admin/integrations (Serviços · Xphere · Assistentes de IA)
   ├─ Marca e site público /admin/branding (Identidade · App instalado · Landing page /admin/landing)
   └─ Status             /admin/health
```

Regras que valem para o app todo: uma tela de peça para todos os papéis; um
fluxo de venda nos dois módulos; um chip de escopo ("Vendo: todos / só eu") em
toda lista que o modo gestão amplia (Empresas, Visitas, Vendas, Tarefas, Painel
e Clientes de Tags; Minhas peças é sempre só da pessoa). As URLs antigas
continuam funcionando (`/visits`, `/prospecting`, `/check-in`, `/admin/xphere`).

## Como conferir

Entre com três perfis: o admin do Xpot, um gerente e um revendedor só de Tags.
Confira cada tela em 1440 px e 390 px (não deve haver rolagem lateral).

**Navegação e modo gestão**
- [ ] Barra lateral, barra do celular, paleta (Ctrl/⌘+K) e título usam o mesmo nome para cada tela.
- [ ] Gerente com o modo gestão desligado vê o mesmo que um vendedor; ligar pela barra lateral, por Configurações › Vínculos ou pelo chip de escopo.
- [ ] Com o modo ligado: barra âmbar, aba Gestão no celular em Visitas e em Tags, chip "Vendo: todos" em Empresas, Visitas, Vendas, Tarefas e no Painel/Clientes de Tags.
- [ ] Abrir um link `/admin/...` liga o modo com um aviso; sair do modo numa tela de gestão leva à tela de vendedor equivalente; sair da conta desliga.
- [ ] Gerente não vê Plataforma; abrir `/admin/integrations` mostra acesso restrito.

**Visitas**
- [ ] Editar o endereço de uma empresa mantém o check-in validado pela área.
- [ ] Uma visita encerrada como "Venda feita" ou "Retorno" conta em "Finalizadas hoje" e em Últimas visitas.
- [ ] Check-in fora da área aparece com o selo "Exceção: fora da área".
- [ ] Cancelar visita pede confirmação; check-out de uma parada volta para a rota.
- [ ] Nota de voz gravada no check-in chega à visita.
- [ ] Página da empresa: tiles e card de vendas mostram os mesmos valores.

**Tags (revendedor)**
- [ ] Clientes lista e abre as empresas das peças dele, com nome.
- [ ] Na peça: chips Digital, Estoque físico e Chip; ativar diz que não é venda; "Vender esta peça" sugere o cliente da peça.
- [ ] A venda aparece em Vendas (quem tem Visitas) e a peça mostra "Abrir em Vendas".

**Tags (gestão)**
- [ ] Visão geral, Lotes, Inventário, Distribuição e Revendedores dão o mesmo número para o mesmo estoque.
- [ ] Ativar uma peça da casa pela gestão mantém a peça no estoque da casa.
- [ ] Entregar: a simulação diz por que cada código não pode ir; o kit recebe um código K-0001 e aparece em Kits com a lista do que foi entregue, inclusive depois de recolher peças.
- [ ] Recebimento do lote: ler, desfazer a última leitura, ler de novo.
- [ ] Cancelar uma venda de Tags devolve a peça ao estoque e permite vender de novo.

**Pessoas e organizações**
- [ ] Tornar alguém admin do Xpot avisa e pede confirmação; ninguém muda o próprio papel.
- [ ] Recusar um cadastro coloca a pessoa em "Recusados", separado de bloqueados.
- [ ] A página da pessoa mostra organizações, Tags (regra de custo, código de atacado) e, para o admin do Xpot, o Xphere com a chave mascarada e "Trocar a chave de entrada".
- [ ] Organizações não cria conta; "Adicionar pessoa existente" funciona para gerentes.

**Plataforma**
- [ ] Integrações: seções por função, "Em uso agora" na voz e na IA, GoHighLevel sob "Legado", último teste guardado depois de recarregar.
- [ ] Assistentes de IA: o segredo só fecha em "Já copiei"; conexões mostram os escopos.
- [ ] Marca e site público: trocar de aba não perde o rascunho da Landing; "Restaurar padrão" no ícone e no logo.
- [ ] Status: o banner diz a causa; uma linha de serviço abre o card em Integrações; Retry nos problemas de sync.

## O que ficou aberto

Está no [BACKLOG.md](./BACKLOG.md), área UXR: cancelar uma busca de
prospecção presa, filtro por vendedor no histórico de visitas, filtro por
organização em Inventário/Kits/Empresas, MasterDetail nas telas de detalhe da
gestão, tradução dos tipos de lugar do Google, página de consentimento OAuth e
resultados de Testar em inglês, e recusas antigas com motivo próprio que ainda
aparecem como Bloqueado.
