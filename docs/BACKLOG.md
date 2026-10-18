# Backlog Xpot

**Rev. 5** · base `claude/ux-overhaul` · 83 itens · **51 concluídos** · 3 obsoletos · 29 abertos

> **Rev. 5 (revisão de UX, 2026-10-18):** entrou a área **UXR**, com o que a
> revisão de UX fez e o que deixou aberto (resumo em
> [`UX_OVERHAUL.md`](./UX_OVERHAUL.md)). Conferidos no código e marcados ✅:
> MOD-21 (uma venda de peças de Tags é uma linha de `sales_sales` e aparece em
> Vendas; ativar continua não sendo venda, decisão 5 da revisão) e MOD-22
> (Minhas peças pede sempre `?mine=1`, também para o gerente).

> **Rev. 4 (conferência com o código, 2026-10-05):** os contadores não fechavam
> (o cabeçalho dizia 30 concluídos, a tabela somava 24 e os itens marcados ✅
> eram 28); agora vêm da contagem dos itens. Confirmados no código e marcados ✅:
> DAT-03, VND-16 e PLT-05. PLT-01, 02 e 03 eram problemas da Vercel, que saiu do
> projeto (`049cc76`): ficam como obsoletos. Entrou a área MOD, com o que sobrou
> do plano de módulos ([`MODULES.md`](./MODULES.md)). Suíte hoje: 332 testes de
> unidade em 38 arquivos (`npx vitest run`), mais 7 arquivos de integração que
> só rodam com `TAGS_INTEGRATION=1` e um Postgres descartável.
>
> **Rev. 2 (execução):** o módulo de vendas foi construído — catálogo, venda
> direta, consignação com acerto, captura por voz e espelho no Xphere — e a
> Fase 0 fechou as falhas de autorização antes disso. Itens resolvidos estão
> marcados ✅ com o commit. Suíte na época: 93 testes, typecheck limpo, build de produção
> passando. **Pendente de você:** a migration (renumerada para `0017` no merge
> com o `main`) roda sozinha no deploy do Coolify, antes do servidor subir.
>
> **Não verificado por falta de acesso:** a extração por voz nunca rodou contra
> um modelo real — o contrato e o parser estão testados com as saídas esperadas,
> o prompt não. O primeiro áudio de verdade é o teste que falta.

Registro do que está pendente no projeto. Cada item tem código estável (`VND-04`, `SEG-02`)
para referência em conversa. Estados: **Agora** (bloqueia outras coisas) · **A fazer** ·
**Decidir** (precisa de definição de produto antes de virar tarefa).

Detalhamento e referências completas de arquivo:linha em [`AUDITORIA.md`](./AUDITORIA.md).

| Área | Itens | Concluídos | Obsoletos | Abertos |
|---|---|---|---|---|
| VND — sistema de vendas | 18 | 5 | 0 | 13 |
| SEG — segurança/autorização | 10 | 10 | 0 | 0 |
| PLT — plataforma | 5 | 2 | 3 | 0 |
| DAT — integridade de dados | 6 | 5 | 0 | 1 |
| PRF — performance | 5 | 1 | 0 | 4 |
| DOC — testes e documentação | 5 | 5 | 0 | 0 |
| MOD — módulos Visitas e Tags | 3 | 3 | 0 | 0 |
| UXR — revisão de UX (out/2026) | 31 | 20 | 0 | 11 |
| **Total** | **83** | **51** | **3** | **29** |

### Novidades desta revisão

O módulo de vendas não estava no backlog original — ele é a estrutura nova.
Entregue em `e887a70`, `f70fcab`, `3327bb0`, `07f640d`:

- **Catálogo** com preço B2B, custo, margem ao vivo e faixas por quantidade
- **Venda direta** com itens, desconto e pagamento, a partir do check-in, do
  card da empresa ou da aba Sales
- **Consignação**: depósito, acerto por contagem, devolução, ajuste, com livro-razão
- **Ganho** = preço − custo, congelado por venda
- **Captura por voz**: o áudio vira ações propostas que você confirma
- **Espelho no Xphere**: venda vira oportunidade ganha, interesse vira aberta

---

## VND — Sistema de vendas

Conclusão central: **o pipeline é somente-criação**. Uma oportunidade pode ser aberta e nunca
mais tocada — sem mudar estágio, corrigir valor, marcar ganha/perdida ou arquivar. O endpoint
`PATCH /opportunities/:id` existe no servidor e **não tem um único chamador no cliente**.

### Pipeline e oportunidades

| ID | Sev | Item | Estado |
|---|---|---|---|
| VND-01 | Alto | **Oportunidade não pode ser editada depois de criada.** `status`, `lossReason`, `closeDate`, `notes` nunca são escritos após a criação. `PATCH /opportunities/:id` sem chamadores. — `client/…/XpotSales.tsx`, `server/routes/xpot/opportunities.ts:74` | Agora |
| VND-02 | Alto | **Métrica de negócios ganhados é sempre zero.** `metrics.ts:50` conta `status === "won"`; nenhum caminho consegue atribuir esse valor. Consequência direta de VND-01. | Agora |
| ✅ VND-03 | Alto | **“Venda feita” na visita não cria oportunidade.** `sale_made` grava na visita e o pipeline não sabe. Não há ponte entre desfecho e funil. — `client/…/VisitStatus.tsx:21` | ✅ feito |
| VND-04 | Alto | **Falha de sync com o CRM é invisível na criação.** O servidor devolve `{ghl, message}` e marca `needs_review`; o cliente mostra “Opportunity created”. — `client/…/useSales.ts:35-38` | Agora |
| VND-05 | Alto | **Ordem de dependência com o CRM não é guiada.** A oportunidade só sincroniza se o lead tiver `ghlContactId`, e o sync do lead é manual em outra tela. — `helpers.ts:156-159` | A fazer |
| VND-06 | Médio | **Não há pipeline padrão configurável.** `defaultPipelineKey`/`defaultStageKey` são lidos no fallback mas nenhuma rota os escreve. — `helpers.ts:161-165` | A fazer |
| VND-07 | Médio | **Lista sem filtro e com jargão interno.** O endpoint aceita `?status=` e a UI não usa; o card exibe `syncStatus` cru para o vendedor. — `XpotSales.tsx:264-297` | A fazer |

### Tarefas de follow-up

| ID | Sev | Item | Estado |
|---|---|---|---|
| VND-08 | Médio | **Tarefa só pode ser criada e concluída.** Sem editar, cancelar, reabrir ou excluir — o schema de update já aceita quase tudo isso. — `shared/xpot.ts:115-120` | A fazer |
| VND-09 | Médio | **Tarefa não se liga a uma oportunidade.** `sales_tasks.opportunity_id` existe e o cliente nunca preenche. — `shared/schema/sales.ts:224` | A fazer |
| VND-10 | Baixo | **Descrição e tipo de tarefa sem interface.** `type` é sempre `follow_up`. — `useSales.ts:45-54` | A fazer |

### Visita ↔ venda

| ID | Sev | Item | Estado |
|---|---|---|---|
| ✅ VND-11 | Alto | **Mudar o desfecho depois do check-out não chega ao CRM.** `PATCH /visits/:id` grava só o status e não redispara `syncVisitToGhl`/`syncVisitToXphere`. — `visits.ts:173-183` | ✅ feito |
| ✅ VND-12 | Médio | **Não dá para filtrar visitas pelos desfechos comerciais.** `sale_made`, `follow_up`, `no_answer`, `not_interested`, `came_back_later` são setáveis e não filtráveis. — `XpotVisits.tsx:43` | ✅ feito |
| VND-13 | Baixo | **Dois conceitos de “hoje”.** Dashboard conta por `createdAt`, tela de visitas filtra por `checkedInAt`. — `dashboard.ts:25-32` | A fazer |

### Dashboard e relatórios

| ID | Sev | Item | Estado |
|---|---|---|---|
| ✅ VND-14 | Alto | **O gráfico do dashboard mostra dados inventados.** “Visit Activity — Last 7 Days” gera os 6 dias anteriores com `Math.random()`, re-sorteando a cada render. `GET /metrics`, que calcula a série real, não tem chamadores. — `XpotDashboard.tsx:239-252` | ✅ feito |
| VND-15 | Médio | **Nenhum relatório de conversão existe.** Sem taxa visita→oportunidade, ciclo de fechamento, motivo de perda ou desempenho por rep. Dados brutos já no banco. | Decidir |

### Cadastro comercial

| ID | Sev | Item | Estado |
|---|---|---|---|
| ✅ VND-16 | Médio | **Contatos da conta existem só no banco.** Tabela, schema, storage e rotas prontos; `POST /leads/:id/contacts` sem chamadores. Sem registrar decisor/comprador. — `leads.ts:364-374` | ✅ feito em `de1a2c8` (#20): `LeadContacts.tsx` chama `POST /leads/:id/contacts`, no detalhe da empresa (`LeadDetailPane.tsx`) |
| VND-17 | Baixo | **Painel admin de visitas recentes nunca foi ligado.** ~70 linhas com joins e a única paginação do sistema, sem consumidor. Ligar ou remover. — `storage.ts:492-560` | Decidir |
| VND-18 | Baixo | **Fila offline é uma coluna sem implementação.** `offline_queue_enabled` não é lida nem escrita; o app bloqueia check-in offline. — `shared/schema/sales.ts:261` | Decidir |

---

## NEW — Funcionalidades a definir

Nada registrado ainda. Conforme as funcionalidades da estrutura nova forem acordadas, entram
aqui como `NEW-01`, `NEW-02`… com escopo, o que tocam no código atual e dependências.

Três definições de produto mudam o desenho de quase tudo e ainda estão em aberto:

1. **Multi-tenancy** — o isolamento continua por vendedor, ou passa a ser por empresa/equipe?
   Hoje há dois modelos contraditórios convivendo (ver SEG-09 e §7 da auditoria).
2. **Fonte da verdade do pipeline** — o GoHighLevel manda e o Xpot espelha, ou o Xpot passa a
   ser autoridade sobre o próprio funil?
3. **Offline** — o vendedor precisa operar sem sinal? Define se a fila offline entra na
   estrutura nova ou sai do schema (VND-18).

---

## SEG — Segurança e autorização

Bloqueiam a refatoração: não faz sentido reestruturar sobre autorização quebrada.

| ID | Sev | Item | Estado |
|---|---|---|---|
| ✅ SEG-01 | Alto | Qualquer conta autenticada vira vendedor ativo — sem convite nem aprovação. `middleware.ts:27-48` | ✅ feito |
| ✅ SEG-02 | Alto | Qualquer rep edita a tarefa de qualquer outro. `tasks.ts:41-49` | ✅ feito |
| ✅ SEG-03 | Alto | Qualquer rep edita a oportunidade de qualquer outro — e propaga ao CRM. `opportunities.ts:74-103` | ✅ feito |
| ✅ SEG-04 | Alto | Contatos de lead sem nenhuma verificação. `leads.ts:364-374` | ✅ feito |
| ✅ SEG-05 | Alto | Check-in aceita lead de outro rep, promove e sobrescreve `lastVisitAt`. `visits.ts:32-107` | ✅ feito |
| ✅ SEG-06 | Alto | Detalhe do lead vaza oportunidades e tarefas de outros reps. `leads.ts:176-192` | ✅ feito |
| ✅ SEG-07 | Alto | Manager pode se promover a admin via `upsertSalesRep`. `admin.ts:51-66` | ✅ feito |
| ✅ SEG-08 | Médio | Regra de “quem vê tudo” inconsistente entre rotas. `opportunities.ts:30`, `tasks.ts:18` | ✅ feito |
| ✅ SEG-09 | Alto | Extrair autorização para middleware antes de refatorar — fecha a classe inteira, não os 5 casos. | ✅ feito |
| ✅ SEG-10 | Baixo | Estado das credenciais impresso no log. `opportunities.ts:15,20` | ✅ feito |

---

## PLT — Plataforma

| ID | Sev | Item | Estado |
|---|---|---|---|
| PLT-01 | Médio | Bucket de storage nunca criado em produção (Vercel pula `ensureUploadBucket`). `api/index.ts:16-33` | Obsoleto: a Vercel e o `api/index.ts` saíram em `049cc76`. No Coolify há um processo só, e `server/index.ts` cria o bucket no boot |
| PLT-02 | Médio | Limite de upload de 50 MB contra teto de 4,5 MB da Vercel. `app.ts:26-34` | Obsoleto: o teto de 4,5 MB era da Vercel. O limite de 8 MB do corpo JSON (`server/app.ts`) continua |
| PLT-03 | Médio | Pipeline de áudio síncrono dentro de 30 s (upload + Whisper + LLM). `visits.ts:214-320` | Obsoleto: os 30 s eram o limite de função da Vercel. O contêiner no Coolify não tem esse teto |
| ✅ PLT-04 | Médio | Nenhuma validação de ambiente no boot além de `DATABASE_URL`. `db.ts:9-13` | ✅ feito |
| ✅ PLT-05 | Baixo | RLS depende de `BYPASSRLS` sem estar documentado. `migrations/0004, 0007` | ✅ documentado: comentários das migrations 0004 e 0007, README (seção Database) e `docs/ARCHITECTURE.md` §5 |

## DAT — Integridade de dados

| ID | Sev | Item | Estado |
|---|---|---|---|
| ✅ DAT-01 | Médio | Excluir visita quebra em violação de FK (tarefas vinculadas). `storage.ts:594-597` | ✅ feito |
| ✅ DAT-02 | Médio | Entrada do Xphere não é idempotente — retry duplica leads. `inbound.ts:30-73` | ✅ feito |
| ✅ DAT-03 | Médio | Configurações de check-in inalcançáveis pela aplicação. `storage.ts:155-163` | ✅ feito em `f99fbb5`: `GET/PUT /api/xpot/admin/settings` (`server/routes/xpot/admin.ts`) e a tela Visitas › Gestão › Regras de check-in (`AdminSettings.tsx`) |
| ✅ DAT-04 | Baixo | Check-in faz dois UPDATEs no lead, fora de transação. `visits.ts:97-104` | ✅ feito |
| ✅ DAT-05 | Baixo | `upsertPrimaryLocation` não atualiza `updatedAt`. `storage.ts:427-448` | ✅ feito |
| DAT-06 | Alto | Verificar o schema de produção contra o Drizzle — baseline antes de qualquer migration estrutural. | Agora |

## PRF — Performance

| ID | Sev | Item | Estado |
|---|---|---|---|
| PRF-01 | Médio | N+1 nas quatro telas principais; o batch correto já existe em `/leads`. `visits.ts:19-27` | A fazer |
| PRF-02 | Médio | Nenhuma rota de listagem tem paginação — teto funcional, não só de desempenho. | A fazer |
| ✅ PRF-03 | Médio | Sync carrega tabelas inteiras para achar uma linha; faltam `getSalesOpportunity/Task(id)`. | ✅ feito |
| PRF-04 | Médio | Flush de sincronização sem limite de concorrência. `sync.ts:29-33` | A fazer |
| PRF-05 | Baixo | Cache do cliente permanente, invalidado à mão. `queryClient.ts:76-88` | A fazer |

## DOC — Testes e documentação

| ID | Sev | Item | Estado |
|---|---|---|---|
| ✅ DOC-01 | Médio | Testes de rota para os fluxos que a mudança vai tocar — hoje zero cobertura de rotas/auth/storage. | ✅ feito |
| ✅ DOC-02 | Baixo | `.env.example` descreve arquitetura que não existe mais. `.env.example:1-7` | ✅ feito |
| ✅ DOC-03 | Baixo | README desatualizado em números e referências. | ✅ feito |
| ✅ DOC-04 | Baixo | Dois módulos de tipos concorrentes no cliente. `hooks/types.ts` | ✅ feito |
| ✅ DOC-05 | Baixo | Endpoints admin sem consumidor (`/admin/sync-events`, `/admin/ghl/pipelines`). | ✅ feito |

## MOD — Módulos Visitas e Tags

O que ficou aberto do plano [`MODULES.md`](./MODULES.md), executado no #31.

| ID | Sev | Item | Estado |
|---|---|---|---|
| MOD-19 | Médio | **Telas de gestão traduzidas (EN/PT/ES).** `i18n/messages/manage.ts`, `manageTags*.ts`; `tests/i18n-messages.test.ts` confere placeholders e plurais em todos os dicionários. Também a área de Vendas (#34). | ✅ #33 |
| ✅ MOD-21 | Médio | **Peça vendida em Tags contar em Vendas.** Hoje a ativação de uma peça (`tags.sold_at`) não vira linha em `sales_sales`, e a aba Vendas não a mostra. Depende da decisão D5 do `MODULES.md`. | ✅ conferido em 2026-10-18: "Vender esta peça" (`POST /api/xpot/tag-sales`) cria a venda em `sales_sales` e liga cada peça em `sales_sale_tags`; ela aparece em Vendas e a peça mostra "Abrir em Vendas". Ativar nunca é venda (UXR, decisão 5) |
| ✅ MOD-22 | Baixo | **"Minhas peças" do gerente lista todas as peças** (`server/tags/routes.ts:412`) e duplica Tags › Gestão › Todas as peças. Vender não depende dessa lista: a peça é aberta lendo o QR/NFC ou digitando o código, e ao ser ativada passa a ser do gerente (`saleCredit`). Proposta: "Minhas peças" mostra só as do próprio gerente; o link "Ver peças" de um cliente de Visitas leva o gerente à Gestão filtrada por cliente; a busca (⌘K) do gerente procura em todas. | ✅ conferido em 2026-10-18: `PiecesScreen.tsx` pede sempre `?mine=1`, e as peças de um cliente abrem `/admin/tags/pieces?lead=…` em modo gestão |


## UXR — Revisão de UX (out/2026)

A revisão de UX feita sobre `0f4b5be`, integrada na branch `claude/ux-overhaul`.
O que mudou e por quê, as seis decisões de produto e como conferir:
[`UX_OVERHAUL.md`](./UX_OVERHAUL.md). Os commits citados estão nessa branch.

### Feito

| ID | Sev | Item | Estado |
|---|---|---|---|
| ✅ UXR-01 | Alto | **Editar o endereço apagava as coordenadas** e voltava o raio para 150; o raio padrão não tinha efeito. | ✅ `b5deef1` |
| ✅ UXR-02 | Alto | **"Concluídas hoje" e "Últimas visitas" contavam só `completed`.** Visitas encerradas como Venda feita, Retorno etc. sumiam. | ✅ `58c1d27` (`shared/visit-status.ts`) |
| ✅ UXR-03 | Alto | **"Exigir GPS no check-in" não exigia GPS.** As regras agora dizem o que fazem e as exceções ganham selo. | ✅ `bfb2f51` |
| ✅ UXR-04 | Alto | **"Vendida" e o estoque com várias contas na mesma tela.** Uma definição por número, `shared/tagMetrics.ts`, em todas as telas. | ✅ `eb84399` |
| ✅ UXR-05 | Alto | **Ativar uma peça da casa passava a peça para quem clicou.** Pela gestão, ela fica no estoque da casa; ativar nunca é venda. | ✅ `efd3904`, `ba1974b` |
| ✅ UXR-06 | Alto | **Voz e IA ignoravam os interruptores** (Groq usado mesmo desligado; ligar o OpenAI desligava o Groq). | ✅ `09acad5` (`server/lib/providerChoice.ts`, migração 0052) |
| ✅ UXR-07 | Alto | **MCP concedia mais do que dizia; chaves do Xphere expostas.** Escopo real no card, escopos por conexão, chaves mascaradas com troca. | ✅ `e544ded`, `7cea706` |
| ✅ UXR-08 | Alto | **"Admin" em Pessoas promovia a admin global sem aviso.** Aviso e confirmação, ninguém muda o próprio papel, recusas separadas de bloqueios. | ✅ `d0957e6` |
| ✅ UXR-09 | Alto | **Clientes do revendedor sem nome e "Cliente não encontrado".** O revendedor vê e abre as empresas que têm peças dele. | ✅ `0fffdda` |
| ✅ UXR-10 | Médio | **Vocabulário: a mesma palavra com significados diferentes.** Glossário aplicado em EN/PT/ES; recusas do servidor com códigos traduzidos no cliente. | ✅ `baad4db` (merge da Fase 1) |
| ✅ UXR-11 | Médio | **Três kits de componentes paralelos.** Um kit visual único, e todas as telas migradas para ele. | ✅ `bed0f3a` e os merges da Fase 2b (`547a0d8`, `6fd9ce3`, `df276bb`, `4c29bcd`, `55c54ec`) |
| ✅ UXR-12 | Alto | **Menu: "Organização" com assuntos soltos, gestão escondida no celular.** Um mapa de telas, grupos Administração e Plataforma, modo gestão com chip de escopo, aba Gestão no celular, voltar para a origem. | ✅ `d274b28`, `33800b6`, `828233c` |
| ✅ UXR-13 | Médio | **Configurações / Conta / Informações da conta.** Quatro abas: Perfil, Acesso, Idioma, Vínculos. | ✅ `0f127b7` |
| ✅ UXR-14 | Médio | **Integrações, Marca e Saúde soltas.** Integrações por função com último teste e erro; Marca e site público; Status com serviços e sync do CRM. | ✅ `4fe4d41`, `a262bb8`, `3ce2174`, `3389934` |
| ✅ UXR-15 | Alto | **Quatro caminhos para entregar peças; kit sem histórico.** Distribuição com simulação, kits numerados com histórico (`tag_kit_items`), recebimento do lote com desfazer. | ✅ `35d83fe`, `d6805d0` (migração 0054) |
| ✅ UXR-16 | Alto | **Duas telas de peça que não se ligavam; cancelar venda deixava a peça vendida.** Uma tela por seções conforme o papel; cancelar devolve ao estoque. | ✅ `524ae0a`, `1e50189`, `88b85c0` |
| ✅ UXR-17 | Alto | **Cinco lugares para gerenciar pessoas.** Pessoas é o único lugar; Organizações só vincula pessoas existentes; Visão geral de Visitas por período e por vendedor. | ✅ `1ddaeee`, `02afe53` |
| ✅ UXR-18 | Baixo | **Código morto** (Fase 4a): `RouteSettings`, importação CSV sem tela, a API Xphere do vendedor, `markLeadCustomer`, `/tags/summary`, 216 chaves de i18n sem uso (com teste que impede novas). As rotas-alias antigas ficam, por causa de favoritos. | ✅ Fase 4a (`f9ecb66`, `f63cfcd`, `85a38d5`) |
| ✅ UXR-19 | Baixo | **README e docs desatualizados** (local do MCP, Xphere em Configurações, "por usuário", `PROSPECTING_DAILY_ROUTE.md` inexistente). | ✅ Fase 4b |
| ✅ UXR-28 | Baixo | **`GET /api/xpot/tags/:id/dashboard` sem chamadores** desde a tela única de peça. Remover. | ✅ Fase 4a (`36e1951`) |

### Aberto

| ID | Sev | Item | Estado |
|---|---|---|---|
| UXR-20 | Médio | **Cancelar uma busca de prospecção presa.** `server/prospecting/**` não tem cancelamento de job ou run; Status só oferece Retry e "Montar a rota de novo". | A fazer |
| UXR-21 | Baixo | **Filtro por vendedor no histórico de visitas.** Sem ele, a página da pessoa em Pessoas não tem o atalho "visitas dela" (tem peças e kits). | A fazer |
| UXR-22 | Médio | **Filtro por organização em Inventário, Kits e Empresas.** Sem ele, as abas de Organizações ficam como listas só de leitura. | A fazer |
| UXR-23 | Baixo | **MasterDetail nas telas de detalhe da gestão** (peça, lote, kit de Tags e outras). Pessoas já usa; as demais abrem página inteira. | A fazer |
| UXR-24 | Baixo | **Tipos de lugar do Google sem tradução.** `primaryType` aparece cru na busca de empresas (`PlaceLeadSearch`); não há fonte de tradução. | A fazer |
| UXR-25 | Baixo | **Página de consentimento OAuth (MCP) e resultados de "Testar" das integrações em inglês.** | A fazer |
| UXR-26 | Baixo | **Recusas antigas com motivo próprio aparecem como Bloqueado.** Só o texto padrão é reconhecido como recusa; não há marcador para as demais. | A fazer |
| UXR-27 | Baixo | **Linhas do Xphere e o card CRM de Integrações levarem à pessoa** (`/admin/reps/:repId`). | A fazer (conferido em 2026-10-18: nenhuma linha do Xphere leva à pessoa) |
| UXR-29 | Baixo | **Retry de oportunidades em Status › Sync do CRM.** Elas aparecem na lista, mas `POST /api/xpot/sync/retry` não as aceita. | A fazer |
| UXR-30 | Baixo | **Aviso de alterações não salvas em Integrações** cobre só a troca de provedor; a Landing tem o aviso completo. | A fazer |
| UXR-31 | Baixo | **Quem cancela uma venda de Tags.** A tela mostra "Cancelar venda" só a gerentes; o servidor também deixa o próprio vendedor (com Visitas) cancelar. | Decidir |

---

## Fora do backlog original — decisões pendentes

Coisas que a execução revelou e que precisam de você:

1. **Migration 0017** (era 0009 antes do merge) — aplicada automaticamente no deploy. Sete tabelas novas, um
   índice único em `xphere_ref` e o catálogo inicial. Idempotente.
2. **Pipeline "Xpot Field Sales" no Xphere.** O espelho procura um pipeline com
   esse nome e os estágios `Interested` e `Customer`. Sem eles o Xphere responde
   `skipped: no_pipeline` — a venda fica registrada no Xpot e o espelho falha em
   silêncio (visível em `sales_sync_events`). Crie-os no painel do Xphere.
3. ✅ **Uma oportunidade por venda** — resolvido nos dois lados. Xphere: branch
   `claude/xpot-mirror-per-sale` adiciona `opportunity.external_id` opcional ao
   `/api/v1/sync` (Xtimator/XmartMenu/Xkedule não mudam). Xpot: cada venda vira
   uma oportunidade ganha própria; interesse abre uma por lead e a primeira
   venda a converte. **Falta:** revisar e mesclar a branch do Xphere — não abri
   PR porque você não pediu; a branch está no remoto.
4. ✅ **Conta duplicada no Xphere** — resolvido na mesma branch, dos dois lados:
   o espelho adota a conta criada via prospects (`source_type` + `source_id`) em
   vez de criar outra, e o `/api/v1/prospects` passa a carimbar
   `external_source`/`external_id` na inserção. Bônus: nota de venda em empresa
   sem telefone/e-mail ia para o lixo (sem contato); agora vai na conta.
5. **Modelo de IA para a extração.** O configurado hoje é `gpt-4o-mini`. Para
   números falados em português recomendo um modelo mais forte; trocável no
   admin sem código.
6. **Preços do catálogo inicial** são estimativas minhas — edite em Visitas › Gestão › Produtos (`/admin/products`).
