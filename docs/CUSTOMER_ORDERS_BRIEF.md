# Pedidos do cliente: brief para quem vai tocar

**Data:** 2026-11-02. **Estado:** nada construído. **Primeiro passo:** pesquisa, não código.

## 1. O pedido do dono

Palavras dele:

> "Eu fui vender num lugar e o cara pediu para mim uma plaquinha customizada. Então essa plaquinha customizada precisa ter um pedido."

> "Eu fui num restaurante e o cliente quer dez pecinhas de menu. E eu só tenho duas na minha bolsa. E eu tenho que produzir mais peças para esse cliente."

São dois casos:

- **Peça customizada:** ainda não existe. Precisa de arte e de produção.
- **Falta no estoque:** o produto existe, mas o vendedor não tem a quantidade. Entrega parte agora e o resto depois.

Ele pediu para "considerar essa estrutura de pedidos". Ainda não aprovou nenhum desenho.

## 2. O que o sistema tem hoje

Conferido lendo o código em 2026-11-02, na base `27856c4`. Não tomei isso como completo: a pesquisa precisa confirmar.

| Tabela | O que é | O que falta para este caso |
|---|---|---|
| `sales_sales` + `sales_sale_items` + `sales_sale_tags` | Venda já feita, com as peças | Não existe vendido e ainda não entregue |
| `print_requests` → `print_jobs` → `tag_batches` → `tags` | Produção interna | Não sabe para qual cliente é. `print_requests.replaces_job_id` (migração 0074) mostra o padrão de ligar um pedido a outra coisa |
| `tag_acquisitions` + `tag_acquisition_lines` | Compra de atacado do revendedor, vinda da Stuscle | É compra do revendedor, não do cliente final |
| `tag_kits` | Lote de peças entregue a um revendedor | Sem cliente |
| `sales_opportunities_local` | Negócios ("Deals") | Sem ligação com produção. **Pergunta aberta:** negócio ganho vira pedido? |
| `tags.stock_status = 'reserved'` | O status existe em `shared/tags.ts:51` | Não sei o que ele garante hoje. Conferir antes de usar |
| `tags.product_type = 'custom'` e a face `custom` (`shared/tagFace.ts`) | Já existem | Não sei o que cobrem no fluxo de produção |

## 3. Uma hipótese, não uma decisão

Propus isto ao dono. Use como ponto de partida e derrube o que a pesquisa contradisser.

**Fluxo:**
1. Na visita, o vendedor cria o pedido: cliente, produto e quantidade (10 menus).
2. O sistema mostra o que ele tem em mãos, e ele entrega 2 na hora.
3. Os 8 restantes aparecem em Production com o nome do cliente.
4. Ao imprimir, as peças ficam separadas para o pedido, fora do estoque livre.
5. Elas vão a quem vendeu, com aviso de pronto para entregar.

**Customizada:** o mesmo pedido, com descrição e logo, parado em "Esperando a arte" até o modelo existir.

**Estados:** Esperando a arte (só customizada), Na fila, Imprimindo, Pronto para entregar, Entregue, sempre com a parcial à vista ("2 de 10 entregues").

**Respostas que assumi. O dono não confirmou nenhuma:**

| Pergunta | O que assumi |
|---|---|
| Quem produz? | Quem produz para a empresa do vendedor: o parceiro, se houver, ou a Skale Club |
| Quando conta como venda? | Na entrega, peça por peça. O sinal fica no pedido e é abatido na entrega. **É a que mais pesa: mexe em dinheiro** |
| Quem faz a arte? | Só a plataforma. O cliente aprova, com o "ok" registrado pelo vendedor |
| Preço da customizada? | O vendedor digita no pedido, porque não há tabela |

## 4. Pesquisa obrigatória

Entregue `docs/customer-orders/PESQUISA.md`, com `arquivo:linha` em cada afirmação. Separe o que viu no código, o que viu rodando e o que supõe.

**Leia antes:** `docs/MODULES.md` (§5 é o glossário), `docs/SIMPLICITY_PLAN_2.md`, `docs/TAG_SALES_EXECUTION_PLAN.md`, `docs/TAG_CUSTODY_EXECUTION_PLAN.md`, `docs/TAG_INVENTORY_EXECUTION_PLAN.md`, `docs/PRINT_EXECUTION_PLAN.md`, `docs/PROFILES_EXECUTION_PLAN.md`, `docs/organizations-execution-plan.md`.

**Responda:**

1. **Vida da peça:** de impressa até vendida e no ar, em todos os caminhos. Código: `shared/tags.ts`, `shared/tagCustody.ts`, `shared/tagMetrics.ts`, `server/tags/custody.ts`, `distribution.ts`, `sales.ts`, `production.ts`.
2. **Reserva:** o que `reserved` faz hoje em cada tela, métrica e ação. Dá para receber, entregar, vender ou recolher uma peça reservada? A reserva serve, ou é preciso outro vínculo? Como reservar sem quebrar os filtros do estoque?
3. **O que o vendedor "tem na bolsa":** como saber por produto e design, e o que acontece com peça que já tem cliente.
4. **Linha do pedido:** como "menu, placa grande" se traduz em produto de venda (`sales_products`), `product_type`, face e modelo de impressão (`print_models`). Esse mapa existe para todos os casos?
5. **As duas portas de venda:** venda em Visits (`server/routes/xpot/sales.ts`) e venda de peça em Tags (`server/tags/sales.ts`). Por qual o pedido passa na entrega? Pode ser cobrado duas vezes?
6. **Dinheiro:** regra de quem paga as peças, consignação, custo congelado na venda, sinal, parcial, cancelamento com sinal pago. Vendedor (`member`) não pode ver custo nem lucro. Existe comissão?
7. **Empresas e perfis:** `shared/profiles.ts`, `organizations`, modelos liberados por organização, `fulfilled_from_organization_id`. Quem cria, vê, produz, entrega e cancela, por perfil. O que muda quando a peça é de parceiro?
8. **Customizada:** como um modelo novo nasce, com versão e arquivo; o que `custom` cobre; onde guardar o logo (`putPrivateFile`, arquivos privados). Já existe um caso real em produção: o lote `LPLATE-2026-006` ("Pay here" Venmo), feito por script. As notas dele dizem face `custom`, mas hoje a face gravada é `venmo`: entenda por que mudou. Leia com `tags_batch_get`. **Regra do projeto:** todo modelo novo precisa do preview 3D (skill `xpot-print-preview`), e isso pesa em uma peça por cliente. É um modelo novo por pedido, ou uma arte sobre um modelo existente?
9. **Reimpressão:** peça com defeito em um pedido (`reprint-damaged`, migração 0074). A reposição continua ligada ao cliente?
10. **Onde aparece:** Today (`client/src/pages/admin/home-model.ts`), a visita, a empresa em Visits e o cliente em Tags, Production, a tela do revendedor, o MCP (`server/mcp/tools/`).
11. **Avisos:** o que existe para avisar o vendedor (push em `sales_push_subscriptions`, Telegram, tarefas em `sales_tasks`).
12. **Bordas:** cliente cancela no meio; quantidade muda; vendedor sai da empresa; empresa excluída (o bloqueio de `Delete company` precisa contar pedidos abertos); dois pedidos disputando as mesmas peças; peça entregue com design errado; quando a peça entregue é configurada e vai para o ar; negócio ganho vira pedido?
13. **Por que a venda de hoje não basta:** dá para resolver com menos? Teste a resposta mais simples antes da tabela nova.

**Rode o sistema.** Faça hoje, no laboratório, a venda do restaurante e a da customizada, e anote onde o caminho quebra. Olhe as telas: a primeira auditoria foi rejeitada pelo dono porque só leu código.

## 5. Depois da pesquisa, e antes de qualquer código

Entregue `docs/customer-orders/PLANO.md`:

- Tabelas e migração, aditiva e reversível.
- Regras em função pura, com tabela de casos.
- Estados e quem muda cada um.
- Telas em linguagem de produto, celular primeiro.
- Fases pequenas, cada uma em um PR, começando pela menor que resolve o restaurante.
- As perguntas para o dono, cada uma com sua recomendação.

**Pare aqui e leve ao dono.** Dinheiro, texto jurídico e contato real são decisão dele: não invente. Ele fala português e quer explicação simples, com exemplos, sem termos internos.

## 6. Regras do projeto

- **Custo:** todo subagente em Sonnet, com limite de imagens e de chamadas no brief. O dono parou uma rodada em Opus por gastar os créditos dele.
- **Nada está feito até ser visto:** fotografe em computador e celular, e clique na ação, inclusive no que vem depois de confirmar.
- **Toda tela responde em 3 segundos:** o que é isto e o que eu faço. Um status e uma ação principal. O que não dá para fazer não aparece, em vez de aparecer apagado. Vermelho só para o que pede ação agora. Números batem com a lista que abrem. Nada de termo de sistema na tela.
- **Textos:** `client/src/i18n/messages/`, sempre em en, pt e es, seguindo o glossário. Um nome por coisa. Sem travessão.
- **Arquivos com finais de linha mistos:** nunca `sed -i`. Confira `git diff --stat`.
- **Git:** caminhos explícitos, nunca `git add -A`; o checkout é compartilhado por sessões. Nunca faça junction de `node_modules` em worktree: rode `npm ci` em cada um. Push só com pedido do dono.
- **Operar Xpot e Skale:** por MCP, API ou CLI, nunca pelo navegador. Registre cada passo de produção de peças físicas com `tags_journey_record`.
- **Checagens:** `npm run check`, `npm test`, `npm run build`, e a integração do `.github/workflows/ci.yml` em banco próprio.

## 7. Laboratório

É o Xpot real, com banco local e dados de teste. Nada fala com `xpot.place`, Twilio, Telegram ou Stuscle.

- **Onde:** `C:\Users\Vanildo\Dev\xp-int\.lab` (não versionado): `FRONT.md`, `RUBRIC.md`, `capture.mjs`, `screens.mjs`, `seed.ts`, `flows/`, `q.mjs`. O `.env` de teste fica em `xp-int`.
- **Postgres e Supabase falso:** rodam na sessão que escreveu este brief e podem estar parados. Binários e dados: `C:\Users\Vanildo\AppData\Local\Temp\claude\C--Users-Vanildo-Dev-skaleclub\e5e059fa-92a5-4081-87a1-a3c72462bc1e\scratchpad\pgbox`, porta 55432. Supabase falso: `pgbox\fake-supabase.cjs`, porta 2199. **A pasta é temporária:** copie-a se for depender dela.
- **Armadilhas:** o `pg_ctl` com pipe trava o shell, então rode em segundo plano. Sem `psql`: use um script node com `pg`. O servidor de desenvolvimento passa de 4 GB em rodada grande: use `NODE_OPTIONS=--max-old-space-size=12000`.
- **Limites:** sem preview 3D, upload real, mapa ou NFC real.

## 8. Dependência

A frente `simplify/r3-decisions`, ainda não juntada ao `main`, muda três coisas que este trabalho usa:

- A métrica `house`: peça com cliente sai de "In company stock", com um chip novo.
- O bloqueio de `Delete company`.
- `paymentStatus` obrigatório na API.

Comece a pesquisa pelo `main` atualizado **depois** que ela entrar, ou leia essa branch.
