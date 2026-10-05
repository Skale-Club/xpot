# Roadmap — Xpot v1.1

## Milestone: v1.1 — Integração Xpot → Xphere (Lead Sync)

**Goal:** Quando um lead é criado no Xpot, sincronizá-lo automaticamente como contato no Xphere (opt-in por usuário).

**Status:** concluído (conferido no código em 2026-10-05).

---

## Phase 1 — syncLeadToXphere + Trigger

**Status:** done

**Goal:** Implementar a função `syncLeadToXphere()` e o trigger fire-and-forget na criação de leads.

**Files:**
- `server/routes/xpot/helpers.ts` — nova função syncLeadToXphere
- `server/routes/xpot/leads.ts` — trigger após criação

**Done when:**
- Lead criado no Xpot → contato criado no Xphere (se isEnabled)
- leads com source='xphere' não sincronizam (anti-loop)
- Falhas são silenciosas e registradas em sales_sync_events
- xphereRef salvo no lead após sync bem-sucedido

**Evidência:**
- `syncLeadToXphere()` em `server/routes/xpot/helpers.ts` (entrou em `bcb2eab`, 2026-06-20).
  Em `6e51a94` (2026-07-03) passou a usar `POST /api/v1/prospects` em vez de contatos: o lead
  chega ao Xphere como prospecto do tipo empresa, e a chave precisa do escopo `prospects:write`.
- Chamada fire-and-forget em `POST /api/xpot/leads` (`server/routes/xpot/leads.ts`, depois de
  criar o lead e a localização). A importação por CSV não sincroniza, de propósito.
- Anti-loop: `source === "xphere"` retorna sem chamar o Xphere. Sem integração ativa para o dono
  do lead, também não chama.
- Sucesso grava `xphere_ref` (`account:<id>` ou `contact:<id>`) e um `sales_sync_events` com
  status `synced`; falha grava `failed` com o erro e nunca chega ao cliente.
- Testes: `tests/xphere-sync.test.ts`.
