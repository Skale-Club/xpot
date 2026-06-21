# Roadmap — Xpot v1.1

## Milestone: v1.1 — Integração Xpot → Xphere (Lead Sync)

**Goal:** Quando um lead é criado no Xpot, sincronizá-lo automaticamente como contato no Xphere (opt-in por usuário).

---

## Phase 1 — syncLeadToXphere + Trigger

**Status:** pending

**Goal:** Implementar a função `syncLeadToXphere()` e o trigger fire-and-forget na criação de leads.

**Files:**
- `server/routes/xpot/helpers.ts` — nova função syncLeadToXphere
- `server/routes/xpot/leads.ts` — trigger após criação

**Done when:**
- Lead criado no Xpot → contato criado no Xphere (se isEnabled)
- leads com source='xphere' não sincronizam (anti-loop)
- Falhas são silenciosas e registradas em sales_sync_events
- xphereRef salvo no lead após sync bem-sucedido

---
