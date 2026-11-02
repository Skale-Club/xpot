# Verificação de pedidos de clientes

Data: 2026-11-02. Código em `codex/customer-orders`, baseado na R3 integrada (`65a40f1`). Commit da implementação: `7818b3cc49f39a072fa923fdbddfa4640f6f0e51`.

## Checagens

| Verificação | Resultado | Evidência |
|---|---|---|
| `npm run check` | Código de saída 0 | [tipos.txt](validacao/tipos.txt) |
| `npm test -- --maxWorkers=4` | 1.748 testes aprovados; 26 condicionais ignorados nesta execução | [suite.txt](validacao/suite.txt) |
| Regras, tentativa repetida, imagens, filtros e traduções após a última alteração | 39 testes aprovados em cinco arquivos | [testes-finais.txt](validacao/testes-finais.txt) |
| Integrações exatas do CI em Postgres real, com pedidos acrescentados | 19 arquivos / 19 testes aprovados | [integracao.txt](validacao/integracao.txt) |
| Migração do zero | 81 migrações aplicadas, incluindo `0075_customer_orders.sql` | [integracao.txt](validacao/integracao.txt) |
| `npm run build` | Código de saída 0; frontend e servidor gerados | [build.txt](validacao/build.txt) |
| Compilação Python e testes do pipeline | 20 testes aprovados | [python.txt](validacao/python.txt) |
| Testes de lógica do provisionador NFC | 19 testes aprovados; sem hardware | [nfc.txt](validacao/nfc.txt) |
| Navegador | 16 capturas, nenhum erro de JavaScript ou overflow horizontal | [telas.json](validacao/telas.json) |

O build conserva os avisos existentes de tamanho de chunks e da chamada de subprocesso do script de build. Não houve erro de compilação. As execuções que precisavam renomear arquivos temporários ou abrir servidores de teste foram repetidas fora do sandbox restritivo do Windows e concluíram com sucesso; não foi preciso alterar o produto para contornar essas restrições.

## Casos exercitados

O teste `tests/customerOrders.integration.test.ts` usa HTTP e Postgres reais, o serviço existente de arquivos privados e o SDK oficial MCP. As verificações incluem:

1. Pedido de dez, duas peças separadas sem receita, entrega das duas e apenas uma venda pelo valor dessas duas.
2. Produção das oito restantes, seis boas e duas ruins, entrega das seis, reposição das duas e conclusão de 10/10 em três vendas.
3. Sinal, abatimento, saldo disponível, recebimento posterior de uma entrega não paga e rejeição de valores excedentes.
4. Cancelamento do saldo com crédito, preservação da venda entregue, devolução registrada, retorno físico e retenção registrada pelo responsável.
5. Duas criações ou entregas com a mesma chave; dois pedidos disputando a mesma peça; conflito de revisão.
6. Falha financeira depois de iniciar a entrega: nenhuma venda criada e reserva preservada pela transação.
7. Arte revisada perdendo o aceite anterior; upload repetido gerando só uma revisão e um arquivo; leitura proibida para outro vendedor.
8. Modelo privado desde a criação, GLB válido obrigatório para vinculá-lo e bloqueio de produção antes da aprovação.
9. Peça customizada não podendo trocar para outro cliente, mesmo depois da entrega.
10. Produtor parceiro vendo somente suas linhas, sem preço ou recebimentos; passagem por kit com custo obrigatório quando a política é aquisição; origem e custo preservados na venda.
11. Vendedor inativo, reatribuição e entrega pelo novo responsável sem mudar silenciosamente o dono do cadastro no CRM.
12. Exclusão da conta do vendedor preservando pedido, cliente e negócio convertido, com identidade anonimizada e recuperação pelo responsável.
13. Conversão concorrente de negócio ganho gerando um único pedido.
14. Ferramentas MCP disponíveis apenas no escopo explícito; mesma fronteira de conta da API; vendedor alheio recebendo `order_not_found`.
15. Cliente com pedido bloqueado para exclusão e ausência de custo/lucro na resposta da API de peças para membro.

O teste puro `tests/customerOrderCommands.test.ts` reproduz o caso de resposta perdida: mesmo depois de recarregar um saldo com revisão maior, a repetição conserva a chave **e a revisão original**, permitindo ao servidor reconhecer a operação já realizada. Uma ação diferente recebe outra chave.

## Telas abertas e inspecionadas

Todas as imagens abaixo foram abertas para inspeção, além da checagem automática. Dados e nomes são fictícios.

| Cenário | Capturas |
|---|---|
| Duas peças prontas, oito em produção e sinal de US$ 60 | [Desktop](validacao/ready-pt-desktop.png), [formulário de entrega usando US$ 40 do crédito](validacao/delivery-pt-phone.png) |
| Customizada aguardando arte | [Celular PT](validacao/artwork-waiting-pt-phone.png) |
| Lista de pedidos | [Desktop PT](validacao/list-pt-desktop.png), [celular PT](validacao/list-pt-phone.png) |
| Dez peças entregues | [Desktop PT](validacao/ten-pt-desktop.png), [celular PT](validacao/ten-pt-phone.png) |
| Customizada concluída e revisões da arte | [Desktop EN](validacao/custom-en-desktop.png), [celular ES](validacao/custom-es-phone.png) |
| Cancelamento e resolução financeira | [Desktop PT](validacao/cancelled-pt-desktop.png) |
| Visão da produtora parceira, sem dados financeiros | [Desktop PT](validacao/partner-pt-desktop.png) |
| Formulário de novo pedido customizado | [Celular PT](validacao/new-pt-phone.png), [desktop EN](validacao/new-en-desktop.png) |
| Avisos no início | [Vendedor](validacao/home-pt-phone.png), [plataforma](validacao/admin-today-pt-desktop.png) |
| Pedido recuperado por outro vendedor | [Celular PT](validacao/reassigned-pt-phone.png) |

As mutações do laboratório foram feitas por API/CLI/MCP. O navegador foi usado para observar, abrir formulários e preencher uma confirmação sem enviá-la. Requisições de escrita da interface foram bloqueadas no navegador de captura. A pesquisa anterior e suas capturas permanecem em `evidencias/`, separadas destes resultados.

## Limites desta validação

Banco, sessões, arquivos e pessoas do teste são isolados e fictícios. O GLB é uma geometria sintética válida de teste. Não houve impressão física, operação bancária, mensagem externa ou alteração da produção. Push era opcional no plano e não foi ativado; o aviso entregue é a tarefa e a lista no início. A publicação não faz parte destes resultados locais e segue a autorização de Git do brief.
