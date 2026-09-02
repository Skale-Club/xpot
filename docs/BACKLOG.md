# Backlog Xpot

**Rev. 3** · base `07f640d` · 49 itens · **30 concluídos** · foco: módulo de vendas

> **Rev. 2 (execução):** o módulo de vendas foi construído — catálogo, venda
> direta, consignação com acerto, captura por voz e espelho no Xphere — e a
> Fase 0 fechou as falhas de autorização antes disso. Itens resolvidos estão
> marcados ✅ com o commit. Suíte: 93 testes, typecheck limpo, build de produção
> passando. **Pendente de você:** aplicar a migration `0009` no Supabase de
> produção (`npm run migrate`) — não tenho conexão com o banco neste ambiente.
>
> **Não verificado por falta de acesso:** a extração por voz nunca rodou contra
> um modelo real — o contrato e o parser estão testados com as saídas esperadas,
> o prompt não. O primeiro áudio de verdade é o teste que falta.

Registro do que está pendente no projeto. Cada item tem código estável (`VND-04`, `SEG-02`)
para referência em conversa. Estados: **Agora** (bloqueia outras coisas) · **A fazer** ·
**Decidir** (precisa de definição de produto antes de virar tarefa).

Detalhamento e referências completas de arquivo:linha em [`AUDITORIA.md`](./AUDITORIA.md).

| Área | Itens | Concluídos | Restantes |
|---|---|---|---|
| VND — sistema de vendas | 18 | 6 | 12 |
| SEG — segurança/autorização | 10 | 9 | 1 |
| PLT — plataforma | 5 | 1 | 4 |
| DAT — integridade de dados | 6 | 4 | 2 |
| PRF — performance | 5 | 0 | 5 |
| DOC — testes e documentação | 5 | 4 | 1 |

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
| VND-16 | Médio | **Contatos da conta existem só no banco.** Tabela, schema, storage e rotas prontos; `POST /leads/:id/contacts` sem chamadores. Sem registrar decisor/comprador. — `leads.ts:364-374` | A fazer |
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
| ✅ PLT-01 | Médio | Bucket de storage nunca criado em produção (Vercel pula `ensureUploadBucket`). `api/index.ts:16-33` | ✅ feito |
| ✅ PLT-02 | Médio | Limite de upload de 50 MB contra teto de 4,5 MB da Vercel. `app.ts:26-34` | ✅ feito |
| ✅ PLT-03 | Médio | Pipeline de áudio síncrono dentro de 30 s (upload + Whisper + LLM). `visits.ts:214-320` | ✅ feito |
| ✅ PLT-04 | Médio | Nenhuma validação de ambiente no boot além de `DATABASE_URL`. `db.ts:9-13` | ✅ feito |
| PLT-05 | Baixo | RLS depende de `BYPASSRLS` sem estar documentado. `migrations/0004, 0007` | A fazer |

## DAT — Integridade de dados

| ID | Sev | Item | Estado |
|---|---|---|---|
| ✅ DAT-01 | Médio | Excluir visita quebra em violação de FK (tarefas vinculadas). `storage.ts:594-597` | ✅ feito |
| ✅ DAT-02 | Médio | Entrada do Xphere não é idempotente — retry duplica leads. `inbound.ts:30-73` | ✅ feito |
| DAT-03 | Médio | Configurações de check-in inalcançáveis pela aplicação. `storage.ts:155-163` | A fazer |
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


---

## Fora do backlog original — decisões pendentes

Coisas que a execução revelou e que precisam de você:

1. **Aplicar a migration 0009** no Supabase de produção. Sete tabelas novas, um
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
6. **Preços do catálogo inicial** são estimativas minhas — edite em Admin › Products.
