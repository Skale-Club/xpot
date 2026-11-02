# Pedidos de clientes — implementação

Implementado em 2 de novembro de 2026, na branch `codex/customer-orders`, sobre `65a40f1` (R3 integrada). O dono autorizou a construção completa com “ok, pode fazer até o fim”, depois da pesquisa e do plano. O [brief](../CUSTOMER_ORDERS_BRIEF.md), a [pesquisa](PESQUISA.md) e o [plano apresentado](PLANO.md) ficam preservados como histórico; suas frases sobre aguardar aprovação descrevem a etapa anterior.

## O que a pessoa consegue fazer

- Criar o pedido pelo início de Tags, pelo cliente, por uma visita ou por um negócio ganho. O pedido existe antes da peça e da venda.
- Separar peças compatíveis, pedir produção do saldo, acompanhar as unidades boas e ruins e entregar em partes. Só cada entrega confirmada gera uma venda, com o preço combinado.
- Trabalhar com a própria produtora ou uma parceira autorizada, preservando a origem do kit e o custo de aquisição. O dono pode recuperar um pedido quando o vendedor sai.
- Registrar sinal, abater crédito em entregas, receber depois de uma entrega não paga e registrar devolução ou retenção já realizada pelo responsável. O sistema não movimenta dinheiro.
- Anexar instruções e propostas de arte privadas, registrar quem aprovou e como, vincular modelo e versão exclusivos com preview GLB e acompanhar a produção.
- Acompanhar pedidos que precisam de atenção no início, abrir a lista correspondente e chegar ao pedido por sua tarefa. Negócio ganho não produz nem cobra sozinho.

As telas ficam em `/tags/orders`, `/tags/orders/new` e `/tags/orders/:id`, em inglês, português e espanhol. Funcionam também para vendedores que têm apenas Tags. O acesso à venda antiga e à fila administrativa aparece somente para quem possui o módulo ou a função correspondente.

## Regras que protegem estoque e dinheiro

O estoque físico continua `available` durante a separação. `tags.customer_order_line_id` indica a reserva; o histórico fica em `customer_order_pieces`. Os números de estoque livre, entrega de kit e devolução excluem essas peças. O banco impede as portas antigas de vender, ativar, trocar o cliente ou mudar o lote de uma peça separada. Uma peça com desenho exclusivo permanece ligada ao cliente original mesmo depois de liberada ou entregue.

Cada comando usa `Idempotency-Key` e a revisão do pedido. A transação bloqueia o pedido e suas linhas; uma entrega bloqueia também as peças e grava, na mesma transação, venda, unidades entregues, movimentos e abatimento do crédito. Falha na venda restaura a reserva. Duas confirmações com a mesma chave produzem uma entrega; pedidos diferentes não se apropriam da mesma peça.

Cancelar encerra apenas o saldo não entregue, libera as reservas e retira códigos de impressões ainda não iniciadas. Impressão já em andamento pode terminar; suas peças não voltam a ser reservadas para o pedido cancelado. As vendas entregues permanecem. Para estornar uma entrega, o responsável precisa confirmar a devolução física. O dinheiro pago volta a crédito do pedido; devolver dinheiro exige um registro separado.

Recebimentos não contam como receita de venda antes da entrega. O livro registra `received`, `applied`, `refund`, `retained` e `release`; recebimentos e eventos são imutáveis. Devolução e retenção exigem responsável, motivo e referência a um recebimento do mesmo pedido, dentro do crédito disponível. Editar pagamento ou cancelar diretamente uma venda vinculada é recusado e aponta o pedido de origem.

O pedido preserva produto, desenho, versão, quantidade e preço. O histórico de alteração registra os valores anteriores e novos. Uma arte alterada invalida aprovação e escolha do modelo; reimpressão não pode ignorar o desenho congelado nem reabrir um pedido cancelado. O vendedor vê preço, recebimentos e saldo, sem custo ou lucro, inclusive nas APIs antigas de Tags. A produtora parceira vê somente as linhas que lhe cabem e os dados necessários para cumpri-las.

Cliente com pedido, mesmo cancelado, não pode ser excluído, porque possui histórico comercial. Excluir a conta do vendedor preserva o pedido, o negócio convertido e o cliente, anonimiza a identidade quando necessário e permite reatribuição pelo responsável.

## Banco e migração

A migração `0075_customer_orders.sql` é aditiva: cria `customer_orders`, `customer_order_lines`, `customer_order_pieces`, `customer_order_deliveries`, `customer_order_events`, `customer_order_payments` e `customer_order_artwork`, com índices, restrições e RLS. Não converte vendas antigas em pedidos nem altera custos históricos.

Acrescenta o vínculo em peças, solicitações de impressão e modelos, além de `sales_tasks.customer_order_id`. A chegada de peças boas cria ou reabre uma única tarefa do pedido, dentro da transação do estoque. A tarefa encerra quando não há peças separadas; cancelar encerra tarefas pendentes. Não há envio de push, Telegram ou mensagem ao cliente nesta implementação: o aviso utilizável é o início do sistema e a tarefa ligada. Push era opcional no plano.

Recuar a aplicação não deve apagar essas tabelas ou o livro financeiro. Antes de voltar a uma versão sem pedidos, resolva ou libere as reservas pela versão atual e concilie os créditos. Preserve a migração e as proteções até concluir a transição. Uma aplicação antiga continua impedida pelo banco de se apropriar de peças que ainda estejam separadas.

## API e MCP

Base HTTP: `/api/xpot/customer-orders`. Autenticação e autorização usam a identidade ativa de Tags, sem depender de Visits.

| Operação | Contrato |
|---|---|
| `GET /` | `leadId`, `all`, `work=open|attention|all`, `limit` até 100 e `offset`; retorna `items`, `total`, `nextOffset` |
| `GET /catalog` | Produtos, modelos públicos e produtores permitidos, sem custos |
| `POST /` | Cliente, moeda, origem opcional, observações e linhas; exige chave de idempotência |
| `GET /:id` | Saldos por linha, peças, produção, arte e, para a parte vendedora, recebimentos, entregas e histórico |
| `GET /:id/candidates/:lineId` | Até 100 peças compatíveis livres, com busca por código |
| `GET /:id/assignees` | Pessoas ativas da empresa; somente responsável |
| `GET /:id/models/:lineId` | Modelos exclusivos da linha, prontos e com preview; somente plataforma |
| `POST /:id/allocate`, `/produce`, `/dispatch`, `/deliver` | Separação, solicitação, passagem por kit e entrega |
| `POST /:id/change`, `/release`, `/cancel` | Alteração com motivo, liberação e cancelamento do saldo |
| `POST /:id/payments`, `/settle`, `/reverse` | Recebimentos e resolução do crédito, pagamento posterior e estorno da entrega |
| `POST /:id/artwork`, `/approve`, `/model` | Revisão privada, aceite registrado e vínculo do modelo aprovado |
| `GET /:id/artwork/:artworkId/file` | Arquivo privado, autorizado pelo pedido; PNG, JPEG ou PDF até 5 MB |

Comandos exigem `revision` no corpo e `Idempotency-Key` de 8–120 caracteres. A mesma chave com outro corpo é conflito. Uma revisão desatualizada responde `409 order_revision_conflict`; a tela recarrega o pedido e preserva o formulário para revisão. Falta de acesso a outro pedido responde 404. As unidades de uma entrega são identificadas por UUID, nunca apenas por quantidade.

Pedidos aceitam até 20 linhas e 1.000 unidades por linha, com uma moeda. O valor total é limitado ao inteiro suportado pelo financeiro existente. Cada separação ou entrega aceita até 50 peças. Uma solicitação de produção pela tela aceita até 20 unidades; pedidos maiores podem gerar solicitações sucessivas, sempre descontando peças já separadas, entregues ou em produção. É um limite conservador para respeitar a capacidade da fila de impressão, inclusive modelos com uma unidade por mesa.

O escopo MCP explícito é `xpot:orders`. Ele publica `customer_orders_list`, `customer_order_get`, `customer_order_catalog`, `customer_order_create` e os comandos `customer_order_allocate`, `produce`, `dispatch`, `deliver`, `change`, `release`, `cancel`, `payments`, `settle`, `reverse`, `artwork`, `approve` e `model`. Cada chamada recarrega a identidade e suas empresas; não inventa um ator de plataforma para tokens sem usuário. OAuth existente com outro escopo não ganha pedidos automaticamente. Tokens estáticos administrativos continuam representando o conjunto de capacidades administrativas descrito na interface.

## Arte e modelo exclusivo

O vendedor registra instruções; somente a plataforma registra a proposta de arte. O vendedor registra o aceite real do cliente, com nome e meio. Anexos são privados, com verificação do conteúdo, hash e leitura autorizada. Repetição de upload não gera outra revisão nem outro objeto. PDFs são entregues como anexo.

Para criar o desenho na sessão de produção, use o `print_model_create` existente com `model.customerOrderLineId` igual ao UUID da linha. Esse campo torna o modelo privado desde a criação; ele não passa pelo catálogo público. Tipo, face e produto precisam corresponder à linha. Crie a versão pelo processo existente e envie o preview com `print-pipeline/preview.py --upload`. Depois do aceite, a plataforma seleciona esse modelo no pedido. A produção usa a versão congelada; preview sozinho não substitui a aprovação nem o arquivo imprimível.

Modelos particulares não entram na escolha automática de imagens de produtos genéricos. Um modelo explicitamente conhecido, mas sem preview, recebe a ilustração de fallback; nunca toma emprestada a arte de outro cliente.

## Verificação

O [teste de integração](../../tests/customerOrders.integration.test.ts) percorre por HTTP os dois casos, com Postgres real: 2/10 → produção de oito → seis boas e duas ruins → reposição → 10/10; sinal e abatimento; pagamento posterior; cancelamento e estorno com retorno físico; falha de venda com rollback; concorrência; parceiro e custo de aquisição; arte, upload e GLB privados; reatribuição e exclusão da conta; negócio convertido uma vez; ferramentas MCP com o SDK real e seus limites de escopo.

O laboratório usa bancos descartáveis separados da origem e da produção, credenciais fictícias, armazenamento local dos arquivos de teste, conexões externas bloqueadas e nenhum trabalhador em segundo plano. O GLB do teste é uma geometria sintética válida, não um projeto físico de cliente. Nenhuma peça foi impressa nem dinheiro real foi movimentado durante a validação.

Resultados e capturas finais ficam em [VERIFICACAO.md](VERIFICACAO.md). A implementação foi preparada para revisão local; publicação segue a regra explícita de Git do brief.
