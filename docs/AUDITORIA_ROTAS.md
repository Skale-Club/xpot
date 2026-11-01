# Revisão do sistema de criação de rotas

> **Retrato de 2026-11-01, base `023156d`.** Revisão estática do caminho que vai da busca
> de prospecção até a rota publicada e executada, com os três achados mais graves
> reproduzidos sobre o banco de teste (PGlite) dos testes de integração. O estado de cada
> achado passa a viver no [`BACKLOG.md`](./BACKLOG.md). Para o desenho do sistema, veja
> [`prospecting-routes-architecture.md`](./prospecting-routes-architecture.md).

**Escopo:** 4.450 linhas em `server/prospecting/`, `server/routes/xpot/prospecting.ts`,
`server/visit-workflow.ts`, `server/mcp/tools/prospecting.ts`, `shared/prospecting.ts` e
`shared/schema/prospecting.ts`, mais o cliente `XpotProspecting.tsx` nos pontos que chamam a
API. **Verificado nesta sessão:** `tsc --noEmit` sem erros; `vitest run` dos 7 arquivos de
prospecção/rota com 114 testes passando. **Não executado:** a aplicação em runtime, o motor
de busca real, a API do Google.

| | |
|---|---|
| Endpoints de rota | 16 (`/prospecting/jobs*`, `/prospecting/routes*`) |
| Tabelas | 5 (`prospecting_jobs`, `_runs`, `_candidates`, `_routes`, `_route_stops`) |
| Caminhos que criam rota | 3: automático (worker), manual (`POST /routes`), reaproveitar (`POST /routes/:id/reuse`) |
| Achados | 24 (4 altos, 9 médios, 11 baixos) |

---

## 1. Como uma rota nasce hoje

```text
Buscar oportunidades (cliente, com routeDate local)  ──┐
MCP prospecting_create_today (sem routeDate)        ──┤
                                                      v
  createProspectingJobForRep ── prospecting_jobs + prospecting_runs (fila FIFO global)
                                                      v
  worker: refreshActiveRun / dispatchNextRun / maybeQueueExpansion (até 2 ondas)
                                                      v
  job completed ── claimNextCompletedJob ── buildAutomaticRoute ── optimizeRouteWithGoogle
                                                      v
  prospecting_routes (draft) ── publishProspectingRouteForRep ── lead + visita planejada por parada
                                                      v
  edições à mão (reordenar, tirar, pôr, trocar) ── persistLocalStopOrder (haversine 30 km/h)
  execução (check-in/checkout em visit-workflow.ts) ── parada checked_in/completed, rota fecha sozinha
```

Os caminhos manual e de reaproveitamento passam por `createRoute` em
`server/routes/xpot/prospecting.ts:232` e **não** publicam: devolvem um rascunho, e o botão
"Usar esta rota" publica. O caminho automático publica na hora (`auto-route.ts:315`).

### O que está bem resolvido

- **Uma otimização paga por vez e por dia:** advisory lock `(rep, hashtext(routeDate))` em
  volta da chamada ao Google, nos três caminhos, mais o índice único parcial
  `prospecting_routes_rep_date_active_unique` (`shared/schema/prospecting.ts:179`).
- **Fila do motor:** um slot global com advisory lock, expiração em 24 h, recuperação de
  runs presos em `starting`, cancelamento sem reenviar (`queue.ts`).
- **Pipeline recuperável:** `routePlanningStatus` com recuperação de `building` velho e de
  rascunhos legados (`auto-route.ts:129-176`).
- **Horário de funcionamento** vira janelas de tempo para o Google e para a heurística, com
  fuso do próprio negócio e teto de 22 h local (`opening-hours.ts`, `route-optimizer.ts`).
- **Uma empresa, uma parada:** dedupe por lead e por Google Place na montagem; visita feita
  em pessoa marca o candidato `visited` em todas as listas (`route-execution.ts:210`).
- **Testes offline e determinísticos** sobre PGlite com as migrações reais.

---

## 2. Achados

Severidade: **Alto** = perda de dados, cobrança indevida ou vendedor sem rota; **Médio** =
comportamento errado visível ou inconsistência entre caminhos; **Baixo** = limpeza, dívida.

### Altos

| # | Achado | Onde |
|---|---|---|
| ROT-01 | **O MCP cria buscas sem nenhuma trava diária.** `createProspectingJobForRep` só confere "rota ativa", "busca em preparo" e o limite de 3 por dia **dentro de `if (routeDate)`**; a ferramenta `prospecting_create_today` não manda `routeDate`. Reproduzido: com uma rota publicada hoje, a chamada com `routeDate` recebe 409 e a mesma chamada sem `routeDate` enfileira uma busca paga nova. Além disso a rota desse job recebe `routeDate` em **UTC** (`routeDateForJob`), então à noite nos EUA ela nasce "amanhã" e some da tela de hoje do vendedor, e o índice único por dia não a vê. | `server/prospecting/service.ts:132-160`, `server/mcp/tools/prospecting.ts:87`, `server/prospecting/auto-route.ts:30-35` |
| ROT-02 | **Reaproveitar uma rota cancela a antiga antes de a nova existir.** O endpoint cancela a rota anterior e solta suas visitas (`route_reused`) numa transação própria e só depois chama `createRoute`. Se a otimização falhar (Google fora, nenhuma parada cabe, coordenadas perdidas, limite diário), o vendedor fica sem a antiga e sem a nova. Reproduzido: resposta 400 e a rota antiga `cancelled`, nenhuma outra no banco. O cancelamento precisa acontecer **dentro** da transação travada de `createRoute`, antes da otimização, para o rollback desfazê-lo. | `server/routes/xpot/prospecting.ts:532-553` |
| ROT-03 | **Editar uma rota em andamento recalcula o dia a partir da manhã e reescreve visitas já feitas.** `persistLocalStopOrder` re-cronometra **todas** as paradas desde `route.plannedStartAt`, inclusive as concluídas, e grava `scheduledAt` nas visitas delas sem filtrar por `status = planned`. Reproduzido: rota iniciada 6 h antes, parada 1 concluída; ao trocar as duas paradas à frente, as ETAs delas ficaram 5 h **no passado** e a visita concluída teve o `scheduled_at` reescrito. O caminho ad hoc já faz certo (`retimeStopsAhead` parte da saída da última parada alcançada). Os dois modelos têm de ser um só. | `server/prospecting/route-editing.ts:39-108` vs `server/prospecting/route-execution.ts:170-203` |
| ROT-04 | **Reaproveitar uma rota enquanto uma busca de hoje está no ar engole a busca.** `/reuse` confere rota ativa e limite, mas não "busca em preparo" (a trava que o `service.ts` tem). Quando o job termina, `buildAutomaticRoute` encontra a rota reaproveitada ativa, devolve `reused`, publica-a de novo e marca o job `ready`: os candidatos da busca paga nunca viram rota e a tela do job fica para sempre no aviso "o Xpot vai montar a rota" (sem polling, porque `ready` não conta como pendente). | `server/routes/xpot/prospecting.ts:522-531`, `server/prospecting/auto-route.ts:184-185`, `client/src/pages/xpot/XpotProspecting.tsx:1465` |

### Médios

| # | Achado | Onde |
|---|---|---|
| ROT-05 | **Dois limites diários diferentes.** Ao aceitar a busca, conta-se **jobs** do dia (`filters->>'routeDate'`); ao montar a rota, contam-se **rotas** do dia (inclusive canceladas e reaproveitadas). Com duas rotas reaproveitadas e uma automática no dia, a quarta busca é aceita, roda no motor (paga) e termina em "limite diário atingido". A aceitação da busca deve olhar as rotas também. | `service.ts:157`, `auto-route.ts:186`, `prospecting.ts:270` |
| ROT-06 | **"Tentar a rota de novo" num job com mais de 24 h não faz nada.** `retryAutomaticRoute` põe `pending`, mas `claimNextCompletedJob` só pega jobs com `completedAt`/`createdAt` nas últimas 24 h. O endpoint responde 202 e o job fica `pending` para sempre. Incluir `updatedAt` na janela, ou recusar o retry com 409 explicando. | `auto-route.ts:157-164`, `auto-route.ts:357-368` |
| ROT-07 | **Recalcular (admin) sem rota ativa apaga a última rota concluída.** `lockedExisting = lockedActive ?? lockedRoutes[0]`: sem rota ativa, a mais recente (concluída ou cancelada) é deletada em cascata com suas paradas. As visitas sobrevivem, mas perdem o vínculo com a parada e a rota some do histórico. O rebuild deveria só substituir uma rota **ativa**. | `prospecting.ts:388-393` |
| ROT-08 | **Reaproveitar pega emprestado o `jobId` de uma busca antiga.** `jobId: input.jobId ?? discovered[0]?.jobId` liga a rota reaproveitada (rascunho) ao job de onde vieram os candidatos. A recuperação de "ready + rascunho" em `claimNextCompletedJob` vê isso, põe o job velho em `pending`, e no tick seguinte `buildAutomaticRoute` publica o rascunho sozinho e manda o push "rota pronta". O botão "Usar esta rota" corre contra o worker (15 s) e o job antigo muda de estado sem ninguém pedir. Rotas reaproveitadas não deveriam ter `jobId`, ou a recuperação legada deveria ter data de validade. | `prospecting.ts:414`, `auto-route.ts:134-146` |
| ROT-09 | **`PATCH /routes/:r/stops/:s` muda a parada sem mexer na visita nem na rota.** Marcar `skipped`/`completed` por aqui deixa a visita planejada na agenda e não fecha a rota quando era a última aberta, ao contrário do check-out (`visit-workflow.ts:140-160`) e de `releaseStop`. Hoje sem chamador no cliente; ou alinha, ou remove. | `prospecting.ts:919-951` |
| ROT-10 | **Três cópias da sincronização parada ↔ visita.** `visit-workflow.ts` faz inline o que `prospecting/visit-sync.ts` faz (este só é usado pelo próprio teste: código morto com teste), e o `PATCH` da parada faz uma terceira versão. Uma função só, chamada pelos três. | `server/visit-workflow.ts:76-92,122-150`, `server/prospecting/visit-sync.ts`, `prospecting.ts:919` |
| ROT-11 | **Reordenar e remover leem a rota sem trava.** Duas edições simultâneas (dois dedos, duas abas) chegam ao `persistLocalStopOrder` com listas diferentes e colidem no índice único de posição: 500 em vez de 409. `addRouteStop` já usa `FOR UPDATE`; os outros dois não. | `prospecting.ts:613-637, 645-668` |
| ROT-12 | **Documentação diz "uma otimização por vendedor por dia".** Desde a migração `0048` são até 3, e o índice único é parcial (só rotas ativas). A arquitetura e o runbook ainda descrevem o índice antigo `(rep_id, route_date)` e a migração `0033` como a regra vigente. | `docs/prospecting-routes-architecture.md:181-189`, `docs/prospecting-engine-runbook.md:50-53` |
| ROT-13 | **`prepare-demo` e `prepare-check-in` têm a própria materialização de lead.** Procuram o lead por `ownerRepId` em vez de organização, sem o advisory lock por Google Place, e inserem direto: se outro vendedor da mesma organização já tem a empresa, o índice `sales_leads_org_google_place_unique` estoura em 500. Hoje só chega aí uma rota rascunho legada sem `leadId` (todos os caminhos novos criam o lead na montagem ou na publicação), por isso é médio e não alto. Trocar por `ensureProspectingCandidateLead`. | `prospecting.ts:712-741, 794-830` vs `lead-materializer.ts:16-77` |

### Baixos

| # | Achado | Onde |
|---|---|---|
| ROT-14 | `repairPublishedAutomaticRouteFirstLeg` roda **a cada tick** (15 s), com `SELECT … FOR UPDATE SKIP LOCKED`, para consertar um formato de rota que não é mais gerado. Merece data para sair. | `auto-route.ts:42-127` |
| ROT-15 | `createRoute` carrega **todos** os leads do vendedor (`storage.listSalesLeads({ ownerRepId })`) para ficar com os poucos selecionados. | `prospecting.ts:274-275` |
| ROT-16 | `missingCoordinates` em `optimizationMeta` guarda id de candidato **negativo** no caminho manual e **positivo** no automático. | `prospecting.ts:332` vs `auto-route.ts:218` |
| ROT-17 | Rota só de leads (sem candidato com fuso) não ganha o teto das 22 h: `secondsUntilDayEnd` recebe `undefined`. | `prospecting.ts:366-367` |
| ROT-18 | `prospectingRouteCreateSchema.start` é aceito e ignorado em silêncio; `maxStops` da rota automática é 60 fixo enquanto `targetStops` é calculado e não usado. | `shared/prospecting.ts:95-99`, `auto-route.ts:255` |
| ROT-19 | Checagem de idempotência duplicada: o router faz a mesma consulta que o serviço faz logo em seguida. | `prospecting.ts:143-149`, `service.ts:110-116` |
| ROT-20 | `GET /routes/:id` busca os leads das paradas por `ownerRepId`; uma parada adicionada por `kind: "lead"` de outro vendedor da organização volta sem telefone e site. | `prospecting.ts:587` |
| ROT-21 | O worker segura o advisory lock `(rep, dia)` durante a chamada ao Google (até 45 s); "Buscar oportunidades" do mesmo vendedor espera esse tempo para responder. | `auto-route.ts:243`, `service.ts:135` |
| ROT-22 | Rota cancelada em segundos conta como uma das 3 do dia. Decisão de produto, mas vale explicitar na tela. | `auto-route.ts:186`, `prospecting.ts:270` |
| ROT-23 | `/prospecting/jobs` e `/prospecting/routes` sem limite nem paginação (já em PRF-02). | `prospecting.ts:132, 213` |
| ROT-24 | Na montagem manual, um candidato sem `leadId` cujo Google Place é o mesmo de um lead selecionado não é deduplicado (o dedupe por place só olha entre candidatos). | `prospecting.ts:324-350` |

---

## 3. Ordem sugerida

1. **ROT-01 + ROT-05** juntos: o serviço passa a exigir `routeDate` (a ferramenta MCP recebe
   um parâmetro opcional com padrão em UTC, documentado) e a aceitação da busca conta rotas
   e jobs do dia com a mesma régua.
2. **ROT-02 + ROT-04 + ROT-08**: `createRoute` ganha um parâmetro "substitui a rota X", que
   solta e cancela a antiga dentro da transação travada; `/reuse` confere busca em preparo
   como o `service.ts`; rota reaproveitada nasce sem `jobId`.
3. **ROT-03 + ROT-10 + ROT-09**: uma única função de re-cronometragem (a de
   `route-execution.ts`) para edições à mão e paradas extra, que nunca toca parada ou visita
   já alcançada; uma única função de sincronização parada ↔ visita.
4. **ROT-06, ROT-07, ROT-11, ROT-13**: correções locais de uma tela cada.
5. **ROT-12** com a mesma mudança, para a documentação parar de prometer um limite que não
   existe mais.

Para cada item acima há como escrever o teste de reprodução no harness de
`tests/prospecting-routes.integration.test.ts`; os três reproduzidos nesta revisão foram
exatamente assim.
