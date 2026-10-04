# Auditoria técnica — Xpot

**Base:** `27d2cc1` · **Data:** 2026-09-01 · **Escopo:** 17.406 linhas em `server/`, `client/`, `shared/`, `migrations/`, `scripts/`

Auditoria estática feita antes de uma alteração estrutural do sistema. Todos os achados
carregam referência de arquivo e linha. Verificado nesta sessão: `tsc --noEmit` sem erros e
`vitest run` com 22 testes / 4 arquivos passando. **Não** executado: a aplicação em runtime,
queries contra o banco de produção, ou teste de penetração ativo.

| | |
|---|---|
| Endpoints HTTP | 68 |
| Tabelas | 16 (12 de aplicação + 4 de infra) · 8 enums |
| Migrations | 9 arquivos SQL manuais |
| Testes | 22 casos / 4 arquivos |
| Achados | 26 (7 altos, 11 médios, 8 baixos) |

---

## 1. O que o sistema é

PWA mobile-first para vendedores externos. Ciclo de uso: o rep abre o app instalado, o
navegador entrega GPS, ele busca a empresa (base local ou Google Places), faz **check-in
geovalidado**, grava nota de voz, faz check-out — e a visita é empurrada para o CRM.

A validação geográfica é o núcleo e vive em `server/routes/xpot/visits.ts`: distância
haversine entre a posição do rep e a `lat/lng` da localização primária do lead, comparada ao
`geofenceRadiusMeters` (padrão 150 m). Grava um de quatro estados — `valid`,
`outside_geofence`, `gps_unavailable`, `manual_override` — e fora do raio exige justificativa.

Sobre isso há uma camada de IA opcional: áudio → Whisper (Groq primário, OpenAI fallback) →
LLM (OpenRouter primário, Gemini fallback) devolvendo JSON estruturado (resumo, desfecho,
sentimento, objeções, próximo passo) que preenche a nota da visita.

**Stack:** React 18 + Vite + Wouter + TanStack Query + Tailwind/Radix no cliente; Express 4 +
Drizzle + `connect-pg-simple` no servidor; Postgres em projeto Supabase dedicado
(`swqxxeivetzakglaphil`).

## 2. Dois runtimes, um código

`server/app.ts` exporta `createApp()`, consumido por dois entrypoints: `server/index.ts` (Node
de longa duração) e `api/index.ts` (função serverless da Vercel). **Toda inicialização precisa
existir nos dois lugares, e hoje não existe** — ver achado 2.1.

A Vercel impõe dois limites que o código não conhece: 4,5 MB de corpo de requisição (contra
`limit: "50mb"` em `server/app.ts:27`) e 30 s de execução (`vercel.json`).

## 3. Modelo de domínio

Grafo raso: `sales_reps` → `users`; `sales_leads` → rep dono; visitas/oportunidades/tarefas →
lead + rep. **Não existe entidade de organização ou tenant.** Todo o isolamento nasce de
`sales_leads.owner_rep_id` e `sales_visits.rep_id`, verificados manualmente rota a rota.

Ciclo do lead: `prospect → lead → active/customer`. `prospect` tem semântica real — prospects
nunca são sincronizados para o GHL (`sync.ts:21`, `helpers.ts:256`).

**RLS:** as migrations 0004, 0006, 0007 e 0008 ligam Row Level Security em todas as tabelas
*sem criar policies*. Correto para o objetivo (bloquear PostgREST com a chave anônima),
funciona porque a app conecta como owner (`BYPASSRLS`). O custo é uma dependência silenciosa:
com um role sem `BYPASSRLS`, toda query retorna zero linhas sem erro.

## 4. Autenticação e autorização

**Autenticação é sólida.** Cliente autentica no Supabase → envia access token para
`POST /api/auth/login` → servidor valida o token com a service key antes de criar a sessão →
`session.save()` explícito antes de responder (evita a corrida com o `GET /api/xpot/me` que o
cliente dispara em seguida). Sessão rolling de 30 dias.

**Autorização é aplicada à mão.** `requireXpotUser` / `requireXpotManager` garantem apenas
autenticação e papel. A verificação de propriedade do recurso é copiada dentro de cada
handler (`if (!isManagerOrAdmin(actor) && lead.ownerRepId !== actor.rep.id)`) — presente em
catorze handlers, **ausente em cinco**.

---

## 5. Achados

### Autorização e exposição de dados

**5.1 — ALTO · Qualquer conta autenticada vira um rep ativo**
`ensureXpotRep` faz upsert de um `sales_reps` com `isActive: true` para todo usuário sem
perfil. Não há convite nem aprovação. O perímetro do Xpot é o perímetro de cadastro do
projeto Supabase.
`server/routes/xpot/middleware.ts:27-48`

**5.2 — ALTO · IDOR em tarefas**
`PATCH /tasks/:id` não lê a tarefa nem compara `repId`. Qualquer rep altera título, prazo ou
status de qualquer tarefa da instalação.
`server/routes/xpot/tasks.ts:41-49`

**5.3 — ALTO · IDOR em oportunidades, com efeito no CRM**
`PATCH /opportunities/:id` também não verifica dono, e dispara `syncOpportunityToGhl` em
seguida — a alteração não autorizada é propagada para o GoHighLevel.
`server/routes/xpot/opportunities.ts:74-103`

**5.4 — ALTO · Contatos de lead sem nenhuma verificação**
`GET /leads/:id/contacts` e `POST /leads/:id/contacts` são as únicas rotas do arquivo que não
carregam o lead nem checam propriedade. Qualquer rep lista ou injeta contatos em qualquer lead.
`server/routes/xpot/leads.ts:364-374`

**5.5 — ALTO · Check-in aceita lead de outro rep**
`POST /visits/check-in` valida que o lead existe, não que pertence a quem faz check-in. Além
da visita, promove `prospect → lead` e sobrescreve `lastVisitAt`/`nextVisitDueAt`.
`server/routes/xpot/visits.ts:32-107`

**5.6 — ALTO · Detalhe do lead vaza dados de outros reps**
A checagem do lead está correta, mas `listSalesOpportunities({ leadId })` traz as de todos os
reps e `listSalesTasks()` carrega a tabela inteira antes de filtrar em memória.
`server/routes/xpot/leads.ts:176-192`

**5.7 — ALTO · Manager pode se promover a admin**
`POST /admin/reps` (protegido por `requireXpotManager`) chama `upsertSalesRep`, que para um
`userId` existente sobrescreve **todos** os campos, inclusive `role` e `isActive`.
`server/routes/xpot/admin.ts:51-66` · `server/storage.ts:283-296`

**5.8 — MÉDIO · Filtro de listagem inconsistente**
`/leads` e `/visits` usam `isManagerOrAdmin()`; `/opportunities` e `/tasks` usam
`actor.user.isAdmin`. Um `rep.role = "manager"` vê todos os leads mas só as próprias
oportunidades.
`server/routes/xpot/opportunities.ts:30` · `server/routes/xpot/tasks.ts:18`

### Plataforma e execução

**5.9 — MÉDIO · Bucket de storage nunca criado em produção**
`ensureUploadBucket()` roda apenas no entrypoint Node. `api/index.ts` chama `createApp()`
direto e pula essa etapa. Na Vercel, se `uploads` não existir, avatar/fotos/áudio falham.
`server/index.ts:11-13` · `api/index.ts:16-33`

**5.10 — MÉDIO · Limite de upload de 50 MB contra teto de 4,5 MB da Vercel**
Uploads base64 acima de ~4,5 MB são rejeitados pela infraestrutura antes do Express, sem
mensagem útil. Áudio longo e foto de celular chegam nessa faixa.
`server/app.ts:26-34` · `vercel.json`

**5.11 — MÉDIO · Pipeline de áudio síncrono num orçamento de 30 s**
`POST /visits/:id/audio` faz, dentro do request: decode, upload ao Storage, Whisper (com
fallback para segundo provedor) e chamada LLM. A gravação vai até 300 s no cliente.
`server/routes/xpot/visits.ts:214-320` · `client/src/pages/xpot/hooks/useCheckIn.ts:174`

**5.12 — MÉDIO · Nenhuma validação de ambiente no boot**
Só `DATABASE_URL` é verificado. `SESSION_SECRET` usa `!` não-nulo; chaves Supabase falham na
primeira requisição que precisa delas.
`server/db.ts:9-13` · `server/auth/supabaseAuth.ts:27`

**5.13 — BAIXO · Estado de credenciais impresso no log**
`GET /opportunities/pipelines` loga se a integração está ativa e se há chave/locationId.
`server/routes/xpot/opportunities.ts:15,20`

### Integridade de dados

**5.14 — MÉDIO · Excluir visita quebra em violação de FK**
`deleteSalesVisit` apaga nota e visita, mas não as `sales_tasks` que referenciam `visit_id`.
`DELETE /visits/:id` retorna 500 sempre que a visita tem tarefa vinculada — e o app cria
exatamente essas tarefas durante a visita (`useSales.ts:45` envia `visitId`).
`server/storage.ts:594-597` · `server/routes/xpot/visits.ts:185-194`

**5.15 — MÉDIO · Entrada do Xphere não é idempotente**
`POST /inbound/prospects` sempre executa `createSalesLead`. Não há verificação por
`xphere_ref` nem índice único. Um retry duplica os leads e o contador `sent` confirma sucesso.
`server/routes/xpot/inbound.ts:30-73` · `migrations/0005_sales_leads_xphere_ref.sql`

**5.16 — MÉDIO · Configurações de check-in inalcançáveis pela aplicação**
`updateSalesAppSettings()` não é chamado por nenhuma rota — é código morto. GPS obrigatório,
raio padrão e permissão de override só mudam por SQL direto.
`server/storage.ts:155-163`

**5.17 — BAIXO · Dois UPDATEs consecutivos no mesmo lead no check-in**
Promoção `prospect → lead` e gravação de `lastVisitAt` são dois `updateSalesLead` separados,
nenhum em transação com a criação da visita.
`server/routes/xpot/visits.ts:97-104`

**5.18 — BAIXO · `upsertPrimaryLocation` não toca `updatedAt`**
Único método de escrita do storage que não atualiza o timestamp.
`server/storage.ts:427-448`

### Desempenho e escala

**5.19 — MÉDIO · N+1 sistêmico nas telas principais**
`GET /visits` faz três queries por visita (3N+1); `/dashboard` e `/opportunities` repetem o
padrão com `await storage.getSalesLead()` dentro de `Promise.all(map(...))`. O batching já
existe e é usado corretamente em `/leads` (`listSalesLeadLocationsBatch`).
`server/routes/xpot/visits.ts:19-27` · `dashboard.ts:40-48` · `opportunities.ts:34-37`

**5.20 — MÉDIO · Nenhuma rota de listagem tem paginação**
`listSalesVisits`/`Opportunities`/`Tasks`/`Leads` não aceitam limite. `/metrics` carrega o
histórico completo para agregar 7 dias em memória. A única rota paginada é
`/admin/recent-visits`.
`server/routes/xpot/metrics.ts:15-19` · `server/storage.ts:472-490`

**5.21 — MÉDIO · Helpers de sync carregam tabelas inteiras para achar uma linha**
`syncOpportunityToGhl` e `syncTaskToGhl` fazem `listSalesOpportunities().find(...)`. Não há
`getSalesOpportunity(id)` nem `getSalesTask(id)` no storage. Criar uma oportunidade dispara
três varreduras completas.
`server/routes/xpot/helpers.ts:151,211` · `opportunities.ts:68,100`

**5.22 — MÉDIO · Flush de sincronização sem limite de concorrência**
`POST /sync/flush` dispara tudo em `Promise.all` sem pool. Para um manager, é uma chamada HTTP
ao GHL por lead/oportunidade/tarefa pendente, simultaneamente.
`server/routes/xpot/sync.ts:29-33`

**5.23 — BAIXO · Cache do cliente permanente e invalidado à mão**
`staleTime: Infinity` + `refetchOnWindowFocus: false`. Toda atualização depende de
`invalidateXpotData()`, que invalida sete chaves fixas.
`client/src/lib/queryClient.ts:76-88` · `hooks/useXpotShared.ts:7-17`

### Documentação e dívida

**5.24 — MÉDIO · Cobertura de testes não alcança nenhuma rota**
22 testes cobrem funções puras e os helpers Xphere via mock. Zero cobertura de rotas,
middlewares de autorização, storage ou fluxo de check-in — exatamente onde estão os achados
acima.

**5.25 — BAIXO · `.env.example` descreve arquitetura que não existe mais**
Afirma que "Xpot usa o MESMO banco Supabase que o Skale Club" e que a separação é decisão
futura. O README diz o oposto e está certo. Mesmo texto obsoleto em `shared/schema/auth.ts:1-2`.

**5.26 — BAIXO · README desatualizado e módulo de tipos duplicado**
README fala em "9 tabelas" (são 12 de aplicação), omite `xphere_integrations` e
`app_branding`, e aponta para um `EXTRACTION-NOTES.md` inexistente.
`client/src/pages/xpot/hooks/types.ts` (3 linhas) concorre com `pages/xpot/types.ts` (109).

---

## 6. O que está bem-feito

- **A camada `storage` é uma fronteira real.** Interface explícita de ~50 métodos; nenhuma
  rota importa Drizzle diretamente. É o ativo mais valioso para a mudança estrutural.
- **O registry de integrações é bem projetado.** `shared/integrations-registry.ts` é fonte
  única para backend e frontend: tabela de destino, campos, mascaramento e grupos mutex.
- **O log de sync é honesto.** `sales_sync_events` registra sucesso e falha de toda
  integração, e `POST /sync/retry` (que *tem* verificação de propriedade) permite reprocessar.
- **O PWA foi endurecido contra o campo.** Watchdog de boot de 12 s, deadline de 8 s no fetch
  do SW, precache dos assets extraídos do shell, `/api/*` nunca cacheado, e `resolveRootView()`
  distinguindo "sessão expirou" de "rede caiu" — com testes.
- **Os comentários explicam o porquê**, não o quê. Isso tornou a auditoria rápida.
- **O contrato Xphere está pinado por testes**, com espelho declarado no repositório do Xphere.

---

## 7. Onde o sistema resiste a mudanças

**1. Não existe conceito de tenant — e uma integração já finge que existe.**
O isolamento é `owner_rep_id`, verificado à mão. Mas `xphere_integrations` é multi-tenant por
usuário, enquanto GHL, Google Places e os provedores de IA leem uma linha global por provider
em `integration_settings`. **São dois modelos de tenancy contraditórios convivendo.** Se a
mudança envolve múltiplas empresas/equipes/clientes, essa decisão vem primeiro — ela redefine
schema, middlewares e o painel admin inteiro.

**2. Autorização espalhada, não centralizada.**
O predicado de propriedade aparece copiado em catorze handlers e ausente em cinco. Não há
`loadLead` / `requireOwnership`. Qualquer mudança no modelo de acesso exige tocar cada rota.

**3. Schema por SQL manual, sem baseline verificado.**
Migrations escritas à mão, mas `drizzle-kit push` disponível. A 0003 dropou e recriou todas as
tabelas `sales_` sob a justificativa de que estavam vazias. Não há verificação automática de
que o banco de produção corresponde ao schema Drizzle — que é a base de tipos dos dois lados.

**4. Ausência total de paginação como teto funcional.**
Quebra por volume de dados antes de quebrar por número de usuários — e quebra dentro de uma
função serverless com 30 s de orçamento.

---

## 8. Sequência recomendada

Em ordem de dependência, não de esforço.

1. **Fechar os cinco IDORs e o auto-provisionamento** (5.1–5.5). Correções pequenas e
   independentes — o padrão correto já existe em `leads.ts`. Refatorar sobre autorização
   quebrada só espalha o problema.
2. **Decidir o modelo de tenancy antes de qualquer código.** O isolamento continua por rep ou
   passa a ser por organização? A resposta define se `integration_settings` vira multi-tenant
   e se entra uma coluna de tenant nas tabelas `sales_`.
3. **Verificar o schema de produção contra o Drizzle** e documentar divergências. Sem esse
   baseline, migration estrutural é feita às cegas.
4. **Escrever testes de rota para os fluxos que a mudança vai tocar** — check-in, autorização
   de leads, sync flush. Rede de segurança, não cobertura ampla.
5. **Extrair a autorização para middleware antes de refatorar.** Fecha a classe inteira de
   bugs da §5, não os cinco casos individuais.
6. **Paginação e eliminação dos N+1.** Aplicar o padrão de batch de `/leads` às demais
   listagens, adicionar `getSalesOpportunity(id)` / `getSalesTask(id)` ao storage.
7. **Tirar transcrição e análise do caminho síncrono.** Remove o acoplamento ao `maxDuration`.
8. **Alinhar a documentação** (`.env.example`, README, `shared/schema/auth.ts`).
