# Plano: versão desktop do Xpot

**Rev. 2** · base `a973fa5` · 2026-10-04 · **executado** (ver Status)

O app do vendedor foi feito para o celular e está bem resolvido lá. No desktop, ele
é a mesma coluna de 448px (`max-w-md`) centralizada, com a barra de abas no rodapé
— uma tela de celular no meio de um monitor. Este plano leva o Xpot para o desktop
**sem mexer no que já funciona no celular**.

Cada item tem código estável (`DSK-03`) para referência em conversa, no mesmo
formato do [`BACKLOG.md`](./BACKLOG.md).


## Status (Rev. 2)

As nove fases (0 a 8) foram executadas no mesmo dia, uma PR por fase, todas verificadas
contra uma API simulada em 375px, 1100px e 1440px.

| Fase | PR | Itens | Estado |
|---|---|---|---|
| 0 · Fundação | #18 | DSK-01, 02, 03, 04 | ✅ (DSK-02 parcial: ver abaixo) |
| 1 · Shell | #19 | DSK-05, 07, 08 | ✅ |
| 2 · Leads | #20 | DSK-06, 09, 10, 11, 12 | ✅ |
| 3 · Painel e Visitas | #21 | DSK-06, 13, 14, 15 | ✅ |
| 4 · Vendas | #22 | DSK-06, 16, 17, 18, 19 | ✅ |
| 5 · Tags | #23 | DSK-06, 20, 21, 22 | ✅ |
| 6 · Check-in | #24 | DSK-23, 24 | ✅ |
| 7 · Config. e Admin | #25 | DSK-25, 26 | ✅ (helpers de Config. não unificados) |
| 8 · Acabamento | #26 | DSK-27, 29 | ✅ parcial · DSK-28 adiado |

**Pendências conscientes**

- **DSK-02**: as cores repetidas saíram das telas que foram redesenhadas; o
  restante (`rgba(…)` inline em diálogos e cards antigos) migra quando cada
  arquivo for tocado de novo. Uma troca em massa mudaria a aparência sem querer.
- **DSK-28 (paginação no servidor)**: adiado. As telas de desktop usam a lista
  completa no cliente (última visita por empresa, calendário com pontos,
  filtros e busca locais); paginar exige levar esses cálculos para o servidor.
  Com os volumes atuais a tabela não mostra o teto. Continua como **PRF-02** no
  BACKLOG.
- **DSK-29**: entraram testes de lógica das rotas e do CSV
  (`tests/desktop-routes.test.ts`). O smoke test visual em 390/1280px precisa
  de um navegador no CI (Playwright) e fica para quando o CI tiver um.
- **Visita ativa no desktop**: funciona inteira, mas na coluna estreita; o
  layout em 2–3 colunas descrito na Fase 3 do plano original não foi feito.

---

## 1. Diagnóstico

### O que existe hoje

| Parte | Largura | Navegação | Breakpoints |
|---|---|---|---|
| App de visitas (`App.tsx:72`) | `max-w-md` | barra inferior fixa, 5 abas | nenhum |
| Módulo Tags (`tags/TagsApp.tsx:79`) | `max-w-md` | outra barra inferior, 3 abas | nenhum |
| Configurações (`XpotSettings.tsx:423`) | `max-w-lg` | seta de voltar | nenhum |
| Admin (`admin/AdminApp.tsx:76`) | `max-w-5xl` | abas horizontais com rolagem | alguns `lg:` |

Em todo o app de vendedor, só dois diálogos se adaptam à largura
(`VisitRow.tsx:163`, `sales/ui.tsx:188`). O admin é a única parte com layout de
desktop de verdade, e `admin/tags/PiecesTab.tsx:121-144` já tem o padrão a copiar:
cards abaixo de `md`, tabela acima.

### O que trava o desktop

1. **Shell duplicado e preso ao celular.** Fundo, grade de pontos e barra inferior
   estão copiados em `App.tsx`, `TagsApp.tsx`, `XpotSettings.tsx` e `AdminApp.tsx`.
   Não há um layout único para trocar.
2. **Sem rota de detalhe.** Lead, visita, venda e consignação abrem em diálogo, sem
   URL própria. No desktop, o detalhe deveria ficar num painel ao lado da lista, e
   isso pede rotas como `/leads/:id`.
3. **Visual em estilo inline.** São 226 `style={{…}}`, 444 `rgba(` e 196 cores hex
   nos `.tsx`. O "card de vidro" foi redefinido como `GLASS` em quatro arquivos; o
   seletor segmentado com gradiente foi copiado quatro vezes; o bloco de estado vazio,
   umas dez. Existem dois kits paralelos: `sales/ui.tsx` (inline) e `tags/ui.tsx`
   (constantes Tailwind).
4. **Interações só de toque.** `ConfirmSlider` funciona só arrastando, sem teclado
   nem ARIA. `BottomSheet` sobe do rodapé. Leitura de NFC, câmera de QR e gravação
   de chip não existem no desktop.
5. **Ações escondidas no hover.** Os botões de linha em Leads (`XpotLeads.tsx:382`,
   `opacity-0 group-hover:opacity-100`) não aparecem no toque, e no desktop ficam
   difíceis de achar.
6. **Listas sem paginação.** Visitas, leads, oportunidades e peças vêm inteiras e são
   filtradas no cliente (PRF-02). No celular a lista curta disfarça; numa tabela
   de desktop o teto aparece logo.

### O que já ajuda

- O conteúdo do detalhe da visita (`VisitRow.tsx`) já tem duas colunas em `sm` e
  vira painel lateral quase sem mudança.
- Os dados para um dashboard mais rico já existem (`/metrics`, `/dashboard`,
  resumo de vendas e de tags).
- O admin já resolveu tabela, layout com barra lateral (`AdminIntegrations.tsx:110`)
  e coluna lateral de 320px (`TeamTab.tsx:107`).

---

## 2. Princípios

1. **Celular intocado.** Todo layout novo entra atrás de `lg:` (1024px). Abaixo
   disso o app continua como está. Antes de cada merge, comparar a tela em 390px
   antes e depois.
2. **Um layout, dois modos.** Um `AppLayout` único decide entre barra inferior
   (celular) e barra lateral (desktop). As telas não sabem em qual estão, a não
   ser onde a interação muda (slider, NFC, câmera).
3. **Lista + detalhe com URL.** No desktop, o detalhe abre num painel ao lado da
   lista. No celular, a mesma rota abre em tela cheia ou diálogo. O link pode ser
   compartilhado e o botão de voltar funciona.
4. **Desktop é escritório, celular é rua.** No desktop o vendedor ou gerente
   planeja, revisa, corrige e cadastra em lote. O check-in com GPS é do celular.
5. **Componente antes de tela.** Primeiro se extraem os primitivos, depois se
   redesenha cada tela. Assim a versão desktop não vira uma segunda cópia do app.

---

## 3. Layout-alvo (≥ 1024px)

```
┌────────────┬──────────────────────────────────────────────────────┐
│ Xpot       │  Leads                         [⌘K Buscar]  PT ▾  👤 │
│            ├──────────────────────────────┬───────────────────────┤
│ VISITAS    │ [Leads|Prospects] 🔍  + Novo │  Padaria Central      │
│  Painel    │ ┌──────────────────────────┐ │  Rua X, 123 · SP      │
│  Visitas   │ │ Nome   Cidade  Últ.visita│ │  ─────────────────    │
│  Leads   ● │ │ ▸ Padaria …   SP   2d    │ │  Contatos · Fotos     │
│  Vendas    │ │   Mercado …   RJ   5d    │ │  Vendas · Estoque     │
│            │ │   …                      │ │  Peças Tags           │
│ TAGS       │ └──────────────────────────┘ │  [Vender] [Editar]    │
│  Início    │                              │                       │
│  Peças     │                              │                       │
│  Direto    │                              │                       │
│            │                              │                       │
│ ⚙ Config.  │                              │                       │
│ 🛡 Admin   │                              │                       │
└────────────┴──────────────────────────────┴───────────────────────┘
```

- **Barra lateral** (240px, recolhível para 72px só com ícones): os dois módulos
  como grupos, no lugar do `ModuleSwitch`. Configurações, Admin (para gerente/admin)
  e perfil no rodapé. Um rep com um módulo só vê um grupo.
- **Barra superior**: título da tela, busca global (⌘K) em leads e peças, idioma,
  avatar. Ela substitui o cabeçalho que hoje existe só no Dashboard
  (`XpotDashboard.tsx:110-186`).
- **Conteúdo**: fluido até ~1440px. Telas de lista usam lista + painel de detalhe
  de 400–480px.
- **Tela inicial no desktop**: Painel, não Check-in.
- **Faixa de visita ativa**: se uma visita foi aberta no celular, aparece uma faixa
  no topo com o timer e o link para a visita.

---

## 4. Fases

Cada fase é um PR que vai para produção sozinho. Nenhuma deixa o app quebrado
no meio do caminho.

### Fase 0 — Fundação (sem mudança visual)

| ID | Item |
|---|---|
| DSK-01 | **Primitivos de UI.** Extrair `GlassCard`, `Segmented` (substitui as 4 cópias + os chips de período), `EmptyState`, `DarkDialog`, `GradientButton` e o fundo com grade de pontos para `components/xpot/`. Juntar `sales/ui.tsx` e `tags/ui.tsx` num kit só. |
| DSK-02 | **Superfícies em um lugar só.** `components/xpot/surface.ts` (`GLASS`, `GLASS_RAISED`, `BRAND_GRADIENT`, `PAGE_GRADIENT`) substitui as cópias locais. Os `rgba(…)` restantes migram conforme cada tela é redesenhada nas fases seguintes, sem uma troca em massa que mudaria a aparência sem querer. |
| DSK-03 | **`useIsDesktop()`** (`hooks/use-is-desktop.ts`, via `matchMedia` no breakpoint `lg`) e **`BottomSheet` responsivo**: sobe do rodapé no celular e vira diálogo centralizado a partir de `lg`, só com classes, sem componente novo. |
| DSK-04 | **Remover código morto:** `XpotProfileEditor.tsx` não é importado em lugar nenhum. |

**Pronto quando:** o app está pixel-idêntico em 390px, o typecheck passa e não sobra
nenhuma cópia de `GLASS`.

### Fase 1 — Shell desktop

| ID | Item |
|---|---|
| DSK-05 | **`AppLayout` único** para Visitas, Tags e Configurações. Abaixo de `lg`, a barra inferior atual; acima, barra lateral + barra superior. `App.tsx` e `TagsApp.tsx` deixam de ter shell próprio. |
| DSK-06 | **Rotas de detalhe** (entram junto com o painel de cada tela, Fases 2–5, porque uma rota sem painel não tem quem a use): `/leads/:id`, `/visits/:id`, `/sales/:tab/:id`, `/tags/pieces/:code` (esta já existe como `/tags/t/:code`). No celular, mantêm o diálogo atual; no desktop, o painel lateral. |
| DSK-07 | **Destino inicial por dispositivo:** desktop abre no Painel; celular segue como hoje (último módulo usado, `homeForModules`). |
| DSK-08 | **Faixa de visita ativa** no topo do desktop. |

**Pronto quando:** em 1280px todas as telas atuais renderizam dentro do novo shell
(ainda na coluna estreita, até `lg:max-w-2xl`) e a navegação funciona por URL.

### Fase 2 — Leads (a de maior ganho)

| ID | Item |
|---|---|
| DSK-09 | **Tabela de leads** com colunas: nome, cidade, último check-in, status no CRM, vendas em aberto. Ordenação por coluna. No celular, os cards continuam. |
| DSK-10 | **Painel de detalhe** do lead: campos editáveis inline (reaproveitando o `EditLeadDialog`), contatos (destrava VND-16, que hoje não tem tela), fotos, `LeadSalesPanel` e peças de Tags vinculadas. |
| DSK-11 | **Ações sempre visíveis** em vez do hover (`XpotLeads.tsx:382`). Corrige também o toque. |
| DSK-12 | **Importação CSV** com prévia em tabela antes de confirmar. No desktop é onde ela faz sentido. |

### Fase 3 — Painel e Visitas

| ID | Item |
|---|---|
| DSK-13 | **Painel em grade:** KPIs em linha (sem os rótulos de 8px quebrados à mão, `XpotDashboard.tsx:218-226`), gráfico largo, coluna lateral com vendas, Tags e falhas de sync. |
| DSK-14 | **Visitas como tabela** (data, lead, desfecho, duração), filtros de status como barra fixa e **calendário de verdade** no lugar do `<input type=date>` escondido (`XpotVisits.tsx:139-153`). |
| DSK-15 | **Detalhe da visita no painel lateral** (o conteúdo de `VisitRow.tsx` sai do diálogo). O gravador de voz continua disponível, porque o desktop tem microfone. |

### Fase 4 — Vendas

| ID | Item |
|---|---|
| DSK-16 | As 4 abas (`XpotSales.tsx:197`) viram **sub-navegação** fixa no topo da tela. |
| DSK-17 | **Vendas e Estoque como tabela + detalhe.** O livro-razão da consignação (`MovementLedger`) fica ao lado, não num diálogo. As consignações vencidas ficam fixas no topo. |
| DSK-18 | **Pipeline em duas colunas:** oportunidades e tarefas lado a lado. Os formulários de criação viram diálogo. Combina com VND-01/08 (editar oportunidade e tarefa), que no desktop ficam naturais. |
| DSK-19 | **Visão geral** com período, KPIs e gráficos em grade. |

### Fase 5 — Tags no desktop

| ID | Item |
|---|---|
| DSK-20 | **Início sem NFC/câmera:** esconder "Ler NFC" e "Escanear QR". O campo de código ganha foco automático e aceita **leitor USB/Bluetooth** (que digita como teclado). |
| DSK-21 | **Peças como tabela + detalhe**, com `TagScreen` no painel lateral em duas colunas (resumo / formulário de venda). |
| DSK-22 | **Gravar chip no desktop:** em vez do `WriteSheet`, mostrar um **QR "continuar no celular"** (a lib `qrcode` já está no projeto) que abre a peça no celular para gravar. Além disso, botão de copiar link. |

### Fase 6 — Check-in no desktop

| ID | Item |
|---|---|
| DSK-23 | **`ConfirmSlider` acessível:** suporte a teclado (Enter/Espaço) e ARIA. No desktop, vira botão + confirmação. Vale para o celular também. |
| DSK-24 | **Check-in fora da navegação principal do desktop.** Ver decisão D1. A visita ativa continua acessível pela faixa do topo (DSK-08), com notas, vendas e desfecho editáveis. |

### Fase 7 — Configurações e Admin no mesmo shell

| ID | Item |
|---|---|
| DSK-25 | **Configurações** com navegação de seções à esquerda e formulários em duas colunas. Os helpers `Section`/`Field` duplicados saem (usar o kit da DSK-01). |
| DSK-26 | **Admin dentro do `AppLayout`:** as abas horizontais (`AdminApp.tsx:95`) viram um grupo "Admin" na barra lateral. Acaba o "sair do app para entrar no admin". |

### Fase 8 — Acabamento

| ID | Item |
|---|---|
| DSK-27 | **Atalhos:** ⌘K (busca), `N` (novo lead/venda conforme a tela), `/` (filtrar), `J`/`K` (navegar lista), `Esc` (fechar painel). |
| DSK-28 | **Paginação no servidor** para leads, visitas e peças (é a PRF-02). Pode vir antes, se a tabela da Fase 2 mostrar o teto. |
| DSK-29 | **Testes de layout:** smoke test em 390px e 1280px por tela (Playwright, ou Vitest + jsdom para o `AppLayout`). |

---

## 5. Decisões em aberto

Cada uma tem uma recomendação; se ninguém discordar, a recomendação vale.

| ID | Pergunta | Recomendação |
|---|---|---|
| D1 | O desktop pode **iniciar** check-in? | **Não.** O GPS de notebook é por Wi-Fi e impreciso, e validar presença na mesa não faz sentido. O desktop mostra e edita a visita ativa; só o celular inicia e encerra. |
| D2 | Breakpoint do desktop: `md` (768) ou `lg` (1024)? | **`lg`.** O tablet em retrato continua com o layout de celular, que já funciona bem lá. |
| D3 | Tema claro no desktop? | **Agora não.** O app força `dark` (`App.tsx`). Os tokens da DSK-02 deixam isso barato depois. |
| D4 | O gerente ganha uma visão de **equipe** (visitas e vendas de todos os reps) no desktop? | **Sim, como fase própria depois da 8.** Depende da definição de multi-tenancy (BACKLOG, "Funcionalidades a definir" §1) e de VND-15 (relatórios de conversão). |
| D5 | O PWA instalado no desktop abre direto no app? | **Sim:** mesma lógica do `RootRoute` (sessão válida → workspace), já vale para qualquer `display: standalone`. |

---

## 6. Ordem e dependências

```
Fase 0 ──► Fase 1 ──┬─► Fase 2 (Leads) ──► Fase 3 (Painel/Visitas)
                    ├─► Fase 4 (Vendas)
                    ├─► Fase 5 (Tags)
                    └─► Fase 6 (Check-in)
                                   └──► Fase 7 (Config/Admin) ──► Fase 8
```

As Fases 0 e 1 são obrigatórias e sequenciais. Da 2 à 6 dá para paralelizar ou
reordenar por prioridade de negócio. A recomendação é começar por Leads, porque é
onde o desktop mais rende: cadastro, edição e importação em volume.
