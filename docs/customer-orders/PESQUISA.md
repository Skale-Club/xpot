# Pedidos do cliente: pesquisa

Data: 2 de novembro de 2026. Destinatários: dono do produto e quem for implementar. Próxima ação: avaliar o [plano](PLANO.md), sem iniciar a construção.

## Resultado

O sistema já aceita vender dez unidades e vincular duas peças físicas depois. Portanto, a afirmação de que só registra o que foi entregue precisa ser corrigida: a venda genérica aceita quantidade sem peça. O problema é que essa venda já entra como concluída pelo valor das dez, e não existe um compromisso estruturado de produzir e entregar as oito restantes. Isso foi reproduzido, não apenas inferido. Fontes: `server/routes/xpot/sales.ts:73`, `server/tags/sales.ts:425`, `server/tags/sales.ts:479`, `server/storage-sales.ts:774`; ensaios E02–E11.

Minha recomendação, ainda para aprovação: introduzir o pedido como compromisso com o cliente, reaproveitando produção e venda. A primeira entrega deve resolver o restaurante com produto existente, entrega parcial e saldo pendente. Arte personalizada e sinal exigem etapas próprias. Justificativa: respostas 2, 5, 6, 8 e 13 abaixo.

## Base e método

- **Código:** referências `arquivo:linha` deste documento apontam ao commit `27856c4`, salvo quando o texto identifica explicitamente a R3. Para reproduzir uma referência: `git show 27856c4:server/tags/sales.ts`. A cópia executada está em `.lab/customer-orders/runtime/`, dentro deste checkout.
- **Checkout principal:** continuou em `e44dd7f`. Não troquei sua branch, não fiz merge e não alterei código do produto. O brief original continua sem commit.
- **Dependência:** li primeiro as alterações ainda não commitadas de `C:/Users/Vanildo/Dev/xp-f2` e, na revisão final, os commits da branch `simplify/r3-decisions`, que avançou a `bc3b685`. Os três resultados estão na seção 12 como **R3 revisada**. Não foram aplicados à cópia executada nem tratados como deploy verificado.
- **Rodando:** 31 chamadas da API, dois clientes fictícios, venda antecipada, venda das duas peças, cancelamento, repetição, duplicidade entre portas, customizada, negócio ganho e peça `reserved`. Registro resumido e numerado em [EVIDENCIAS.json](evidencias/EVIDENCIAS.json).
- **Visual:** 16 capturas em português, 1440 px no computador e 390 px no celular, todas abertas. Índice no [relatório do laboratório](LABORATORIO.md). Ações de negócio pela API/CLI; navegador usado para observar telas. Não alego validação de cada clique dos formulários.
- **Suposições e proposta:** aparecem com esses nomes. Não são decisões do dono nem regras existentes.

Documentos consultados: `docs/MODULES.md:334` e `:347`, `docs/SIMPLICITY_PLAN_2.md:26`, `docs/TAG_SALES_EXECUTION_PLAN.md:1`, `docs/TAG_CUSTODY_EXECUTION_PLAN.md:1`, `docs/TAG_INVENTORY_EXECUTION_PLAN.md:9`, `docs/PRINT_EXECUTION_PLAN.md:549`, `docs/PROFILES_EXECUTION_PLAN.md:1` e `docs/organizations-execution-plan.md:77`. Há propostas históricas nesses arquivos: a nota de implementação e o código atual prevaleceram. Exemplo concreto: a entrada automática após marcar impressa está em `server/tags/production.ts:1321`, embora trechos antigos do plano de estoque falem só em leitura.

## 1. Vida da peça

São eixos diferentes: produto físico, posse/custódia, estado do estoque, estado digital e venda financeira. Ativar não cria venda. Fontes: `shared/tags.ts:10`, `:42`, `:51`, `:54`, `shared/tagAccess.ts:52`, `server/tags/field.ts:42`, `server/tags/sales.ts:230`.

| Caminho comprovado no código | O que acontece | Evidência |
|---|---|---|
| Impressão pela plataforma ou parceiro | Pedido de N peças usa modelo e versão; divide em impressões, cada uma com lote e códigos novos `pending` | `server/tags/production.ts:1084`, `:1018`; `shared/printProduction.ts:91` |
| Impressão concluída | Boas passam a `available`, posse da empresa e movimento `intake`; ruins passam a `damaged` | `server/tags/production.ts:1321` |
| Códigos enviados ao fornecedor | Lote emitido tem peças `pending`; leitura no lote aberto recebe as unidades | `server/tags/repository.ts:1365`, `:1501` |
| Peça recebida com código existente | Lote por leitura pode cadastrar a unidade; código de outro lote é recusado | `server/tags/repository.ts:1501`; `docs/TAG_INVENTORY_EXECUTION_PLAN.md:21` |
| Legado com códigos fixados | Exceção administrativa cria peças disponíveis em lote fechado | `server/tags/repository.ts:1425` |
| Receber pelo celular | `pending` de lote aberto entra no estoque da empresa ou de quem recebeu; não cria aquisição/custo | `shared/tagCustody.ts:53`; `server/tags/custody.ts:36` |
| Entregar kit ao vendedor | Muda organização/possuidor conforme origem autorizada; entrega manual pode também criar aquisição com custo | `server/tags/repository.ts:845`, `:923`, `:944`; `server/tags/distribution.ts:130` |
| Compra no atacado | Aquisição é do vendedor, não do cliente final; separação cria vínculo de custo e kit | `server/tags/acquisitions.ts:104`, `:132`; `shared/schema/tags.ts:282` |
| Escolher cliente e configurar | `inventory → assigned → active`, ou configuração rápida; destino pode mudar sem receita | `shared/tags.ts:270`; `server/tags/repository.ts:578`; `server/tags/field.ts:42` |
| Vender peças | Cria venda e vínculos físicos; peças viram `sold`, posse do cliente, custo congelado | `server/tags/sales.ts:40`, `:243`, `:269` |
| Vincular a venda já registrada | Não aumenta o valor da venda; ocupa uma das unidades da linha | `server/tags/sales.ts:479` |
| Cancelar venda | Cancela vínculos, devolve estoque quando ainda `sold`, conserva cliente e destino; não reembolsa dinheiro | `server/tags/sales.ts:338`, `:353` |
| Recolher peça não vendida | Exige peça disponível e sem configuração; retorna conforme o caminho de custódia | `server/tags/repository.ts:679`, `:1197`; `shared/tagDistribution.ts:78` |
| Uso interno, perda, dano, retirada | Estados físicos próprios; não equivalem a pedido de cliente | `shared/tags.ts:51`; `server/tags/routes.ts:871` |
| Ir para o ar | QR/NFC consultam estado digital e destino; não verificam entrega ou pagamento | `shared/tags.ts:231`; `server/tags/publicHandler.ts:121` |

**Visto rodando:** duas peças foram ativadas sem venda, depois ligadas à venda de dez. A receita não foi criada pela ativação. O cliente mostrou duas peças no ar e US$ 200 vendidos, sem saldo de oito. E03–E08; capturas `simple-restaurant-customer-*`.

**Limite:** não imprimi, entreguei ou gravei nenhum objeto real. Os outros caminhos da tabela foram examinados no código e nos testes existentes, não demonstrados fisicamente nesta pesquisa.

## 2. O que `reserved` garante

Existe como valor aceito e filtro, mas não há uma entidade de reserva de pedido, beneficiário, quantidade prometida ou liberação vinculada a cliente. O levantamento do literal `reserved` em `shared/`, `server/` e `client/src/` encontrou enumeração, rótulos, tons e apresentação, sem um fluxo de reservar para pedido. Fontes: `shared/tags.ts:51`, `server/tags/routes.ts:140`, `client/src/pages/admin/tags/labels.ts:55`, `client/src/pages/admin/tags/where-model.ts:87`.

| Ação ou número | Com uma peça `reserved` | Fonte |
|---|---|---|
| Estoque da empresa e com vendedores | Sai dos dois contadores porque exigem `available` | `shared/tagMetrics.ts:27`, `:29`; `server/tags/metrics.ts:8` |
| Entregável em kit / recolhível | Recusada como fora do estoque disponível | `shared/tagDistribution.ts:63`, `:78`; `server/tags/repository.ts:701`, `:867` |
| Venda e vínculo com venda existente | Recusados por não estar `available` | `server/tags/sales.ts:175`, `:500` |
| Receber | Não é `pending`, portanto recusa; há retorno idempotente de recebimento anterior pelo mesmo usuário, que não constitui liberação da reserva | `server/tags/custody.ts:43`; `shared/tagCustody.ts:61` |
| Atribuir/ativar | A regra não trata `reserved` como bloqueio; configuração rápida só barra `pending` e estado digital retirado | `shared/tags.ts:270`; `server/tags/field.ts:50` |
| No ar / leituras | Pode continuar no contador digital e redirecionar | `shared/tagMetrics.ts:35`; `shared/tags.ts:231` |
| Gestão do estoque | Rótulo “reservada”, filtro físico e local derivado; não mostra “para o pedido de fulano” | `client/src/pages/admin/tags/where-model.ts:87`, `:98`; `client/src/pages/admin/tags/piece-table.tsx:46` |
| Minhas peças | Lista pessoal pode carregar a unidade; filtros digitais e de venda não formam uma reserva de cliente | `client/src/pages/tags/PiecesScreen.tsx:49`, `:82`; `shared/tagApp.ts:239` |
| Today e filas | Filas são de chip, leitura sem ativação e produto ausente; não há fila de reservas por pedido | `shared/tagQueues.ts:6`; `client/src/pages/admin/home-model.ts:21` |

**Visto rodando:** marquei uma unidade fictícia como `reserved` exclusivamente no banco isolado. Receber, recolher e vender responderam 409. Configurar e ativar respondeu 200, mantendo `stockStatus=reserved`. A listagem filtrada a devolveu assim. E27–E31.

**Conclusão proposta:** não usar apenas esse status como reserva. É necessário saber a qual linha de pedido a peça pertence e aplicar o mesmo bloqueio a todas as portas de venda/distribuição/configuração. O plano recomenda um vínculo de separação independente do estado físico, com contadores de estoque livre derivados desse vínculo. Não basta mudar um filtro.

## 3. O que o vendedor tem na bolsa

`tags.rep_id` identifica quem tem a peça; a listagem pessoal usa `mine` e as organizações em que a pessoa mantém acesso. Produto de venda é o da peça, com fallback do lote. A face vem da peça, lote ou de poucos tipos com face implícita. Fontes: `server/tags/routes.ts:476`, `server/tags/repository.ts:187`, `shared/tagFace.ts:74`, `shared/tagAccess.ts:31`.

O contador “em estoque” do vendedor não é sinônimo de “livre para um novo cliente”: conta disponíveis, não retiradas e sem venda, inclusive configuradas ou ativas. A venda recusa outro cliente quando `lead_id` já está preenchido. Fontes: `shared/tagMetrics.ts:29`, `server/tags/repository.ts:2384`, `server/tags/sales.ts:178`.

Para o pedido, a lista de escolha precisa combinar posse atual, organização ativa, ausência de venda, disponibilidade física, compatibilidade da linha e inexistência de separação para outro pedido. Não se deve contar uma peça já configurada para outro cliente como solução para a falta. Esta é uma regra proposta, derivada das restrições acima.

**Limite do desenho:** cor não está em `tags`; o preview descobre o modelo pelo lote e pelas impressões. Peças antigas ou avulsas podem não ter esse caminho. Não é seguro chamar todas as `large_plate` de menu branco. Fontes: `shared/printProduction.ts:65`; `server/tags/production.ts:613`; `shared/schema/tags.ts:417`.

## 4. Linha do pedido: produto, face e modelo

| Conceito | Exemplo | Onde mora |
|---|---|---|
| O que custa e é vendido | Placa grande | `sales_products`: preço, moeda, tipo, custo de catálogo; `shared/schema/sales.ts:647` |
| Formato da peça | `large_plate` | `shared/tags.ts:10` |
| O que está impresso | `menu` | `shared/tagFace.ts:14` |
| Projeto que se imprime | `plate-large-menu-white` | Modelo: produto × face × tema; `shared/schema/tags.ts:417` |
| Receita e arquivo daquela edição | versão 2, mesa de quatro | `shared/schema/tags.ts:444`; `server/tags/production.ts:430` |
| Unidade entregue | código único | `shared/schema/tags.ts:87`; `server/tags/sales.ts:269` |

O mapa é parcial. Modelo serializado novo precisa informar tipo, face, cor, produto de venda e prefixo, mas campos legados podem ser nulos; `custom` não é um mapa de logo para geometria. Várias faces podem compartilhar o mesmo produto de venda e preço. Fontes: `shared/printProduction.ts:301`, `:305`; `server/tags/production.ts:330`; `shared/tagFace.ts:62`.

**Visto rodando:** o catálogo do laboratório tinha “Large Plate” como produto de venda, modelos de menu prontos e modelos com face `custom` ainda sem desenho, incluindo Wi-Fi e pagamentos. Os dois formatos não são equivalentes a um produto novo por restaurante. Consulta local registrada no relatório; esquema em `shared/schema/tags.ts:417`.

**Proposta:** congelar na linha os atributos comerciais e o desenho escolhido. Quando não houver modelo pronto, aceitar a intenção do cliente como “esperando arte”, sem inventar modelo nem código físico. Na escolha de peças antigas com desenho desconhecido, exigir identificação explícita antes de separar.

## 5. As duas portas de venda e a cobrança duplicada

| Porta | O que valida e grava | Consequência para pedidos |
|---|---|---|
| `POST /api/xpot/sales` | Quantidade e produto ou descrição livre; cria venda `completed`, sem exigir códigos | Pode registrar dez antes da entrega, mas reconhece o valor total imediatamente. `server/routes/xpot/sales.ts:73`, `:134`; `shared/xpot.ts:202` |
| `POST /api/xpot/tag-sales` | Códigos reais, produto, cliente, disponibilidade e custo por unidade; bloqueio de linha e chave idempotente | Serve à entrega de unidades existentes. Não registra oito que ainda não existem. `server/tags/routes.ts:512`; `server/tags/sales.ts:40`, `:85`, `:163` |
| `POST /api/xpot/tags/:id/link-sale` | Ocupa unidade de uma venda genérica compatível, sob bloqueio da venda/linha/peça | Une peça e venda já feita sem nova receita. `server/tags/sales.ts:479` |

Há proteção contra duas vendas físicas ativas da mesma peça, inclusive índice parcial no banco, e repetição com a mesma chave retorna a mesma venda. Mas uma venda genérica sem código pode duplicar o valor comercial da venda por peças: não há um identificador de pedido comum às duas. Fontes: `migrations/0021_tag_sales_and_acquisitions.sql:132`; `server/tags/sales.ts:54`; `server/routes/xpot/sales.ts:134`; E13–E18.

**Visto rodando:** chave repetida devolveu novamente a venda 23; outra chave para as mesmas peças deu 409. A porta genérica aceitou mais US$ 40 para o mesmo cliente e produto, ficando US$ 40 em Tags + US$ 40 em Vendas. Depois cancelei a duplicata de teste. E13–E18. Isso demonstra duplicidade de registro financeiro; não houve cobrança em cartão ou transferência real.

**Recomendação:** ao confirmar uma entrega do novo pedido, usar uma única operação transacional que consuma as peças separadas e invoque a lógica de venda de Tags. Visita e cliente abrem essa mesma operação. Não criar uma venda genérica e depois outra em Tags. Se o dono escolher venda antecipada, usar exclusivamente a venda original e `link-sale`; isso altera a recomendação de dinheiro e deve ser decidido antes da implementação.

## 6. Dinheiro, consignação, sinal e comissão

| Comprovado hoje | Evidência | Implicação |
|---|---|---|
| Política comercial `zero` ou `acquisition` é explícita por vendedor; não deve ser deduzida do cargo | `shared/tagSales.ts:3`, `:84`; `server/tags/sales.ts:67`, `:183` | Produzir para um vendedor não define quem pagou ou qual custo ele terá |
| Venda de Tags congela custo da aquisição ou exceção; falta de custo pode bloquear | `server/tags/sales.ts:180`, `:243`, `:269` | Pedido pronto pode ainda precisar da aquisição antes da entrega comercial |
| Venda genérica congela custo do catálogo, ou zero em linha livre | `server/routes/xpot/sales.ts:94`; `server/tags/sales.ts:542` | Vincular depois usa o custo da venda antiga, não necessariamente o custo real da peça |
| Consignação registra estoque já deixado na empresa e cobra o que saiu no acerto | `server/routes/xpot/consignments.ts:74`, `:114`; `shared/schema/sales.ts:677` | Não representa oito unidades ainda por fabricar; `deposit` aqui é depósito de mercadoria, não sinal em dinheiro |
| Pagamento é acumulado `paid_cents` com situação e forma na venda | `shared/schema/sales.ts:711`; `server/routes/xpot/sales.ts:173` | Não é um histórico de recebimentos, abatimentos e reembolsos de pedido |
| Cancelar muda a venda e devolve os vínculos físicos; não altera `paid_cents` nem faz reembolso | `server/tags/sales.ts:338` | Cancelamento com sinal exige decisão e registro financeiro próprios |
| No snapshot executado, a API permite omitir `paymentStatus`; Tags assume pago | `shared/tagSales.ts:23`; `shared/xpot.ts:219`; `server/tags/sales.ts:210` | A R3 corrigiu a criação com valor positivo no servidor; ver seção 12. Novo pedido deve usar essa regra |

**Visto rodando:** a venda 22 foi cancelada mantendo `paid_cents=6000`, `payment_status=partial`. A venda de duas peças seguinte não recebeu automaticamente esse dinheiro. Isso não é prova de que o cliente deve perder o sinal, apenas de que não existe abatimento/reembolso automático. E12 e `cancelSnapshot`.

**Custo e lucro para `member`:** a proteção existe para Produtos/Vendas/Consignações em `server/routes/xpot/index.ts:58`, com retirada recursiva em `server/routes/xpot/profitVisibility.ts:11`. As rotas de Tags são registradas antes, e ainda retornam `acquisitionCostCents`, `costCents`, `unitCostCents` e/ou `costBasisCents`; o diálogo de venda de Tags também contém preview de custo/lucro. Fontes: `server/routes.ts:15`; `server/tags/repository.ts:188`; `server/tags/routes.ts:531`; `server/tags/sales.ts:305`; `client/src/pages/tags/TagSaleDialog.tsx:174`, `:335`. E13 confirmou `unitCostCents` na resposta ao vendedor de perfil simples. A regra desejada ainda não está garantida em todas as portas.

**Comissão:** não localizei cálculo ou livro de comissão no recorte de venda, precificação, aquisição e esquemas examinados. Crédito por vendedor existe, mas não significa comissão a pagar. Evidência do escopo: `server/tags/sales.ts:46`, `:230`; `shared/schema/sales.ts:711`; `shared/tagSales.ts:84`. Não proponho percentual nem obrigação financeira.

**Decisões abertas:** momento da venda, quem paga a produção/peças, preço personalizado e destino do sinal cancelado. Recomendação detalhada no plano. Nenhuma delas foi assumida como aprovada.

## 7. Empresas, perfis e parceiro produtor

O perfil vem de admin da plataforma, organizações ativas, capacidade de produzir e existência de equipe. O nome “member” no perfil não é idêntico ao papel `member` da associação: vendedor sozinho pode ser dono da organização e ter painel simples. Fontes: `shared/profiles.ts:1`, `:31`; `shared/organizations.ts:32`; `docs/PROFILES_EXECUTION_PLAN.md:14`.

| Perfil | Acesso existente comprovado | Papel sugerido no pedido, ainda sem implementação |
|---|---|---|
| Plataforma | Todas as organizações; catálogo e produção | Ver e resolver todos; desenhar; escolher produtora autorizada |
| Parceiro produtor | Produção das organizações em que é dono e que imprimem; modelos liberados | Produzir linhas encaminhadas a ele; ver só dados necessários da entrega |
| Dono de empresa vendedora | Estoque e clientes da organização; sem criar catálogo/produção | Ver todos da empresa, redistribuir responsável e cancelar saldo |
| Vendedor | Peças/clientes permitidos e próprios; sem produção | Criar pedido no seu cliente, separar suas peças e registrar entrega |
| Cliente final | Painel de leitura das peças vinculadas aos clientes autorizados na sessão | Aprovação via vendedor na primeira etapa; portal de pedidos não entra implicitamente |

Fontes da coluna existente: `shared/profiles.ts:40`; `server/tags/access.ts:79`, `:109`, `:132`; `shared/tagAccess.ts:31`, `:43`; `server/customer/repository.ts:10`, `:89`.

Produção tem organização produtora; aquisição tem organização compradora e `fulfilled_from_organization_id`. São papéis diferentes. No caminho `own`, parceiro entrega estoque às empresas vinculadas; no caminho `xpot`, a separação de atacado atual usa a empresa da plataforma. Há critérios de vínculo, atividade e modelos liberados, mas não uma promessa de que toda empresa vendedora tem exatamente um produtor. Fontes: `server/tags/distribution.ts:69`, `:130`; `server/tags/acquisitions.ts:127`, `:192`; `server/tags/production.ts:239`, `:1056`; `shared/schema/tags.ts:286`.

**Recomendação:** pedido pertence à organização vendedora; cada linha guarda a produtora escolhida. Começar com a própria produtora ou Skale Club, quando autorizadas; ambiguidade entre parceiros exige escolha. Não inferir produtor pelo usuário que clicou, nem copiar o `organization_id` da venda para a impressão.

## 8. Customizada, logo e preview 3D

`custom` é um valor de tipo físico e também uma face. Não é um editor de arte, aprovação de cliente, upload de logo por pedido nem um gerador universal. Os geradores registrados são de famílias específicas de placas e stands; não há um gerador genérico de logo nessa lista. Fontes: `shared/tags.ts:10`; `shared/tagFace.ts:14`; `print-pipeline/builders/__init__.py:174`.

Modelo nasce com identidade física e estado `design_needed`; sua primeira versão o torna `ready`. A versão guarda parâmetros, receita, mesas, consumo e preview, e os pedidos apontam para a versão usada. Imprimir sem versão atual é recusado. Fontes: `server/tags/production.ts:288`, `:384`, `:430`, `:867`; `shared/schema/tags.ts:444`, `:466`.

**Visto rodando:** cadastrar o modelo fictício com face `custom` funcionou; pedir uma unidade deu 409 `print_model_design_needed`. A empresa só mostrou uma venda livre de US$ 75, e a tarefa de arte ficou separada do modelo. Marcar o negócio como ganho não criou produção. E19–E26; capturas `final-custom-*`.

**Arquivo privado:** `putPrivateFile` serve para armazenamento, mas o validador de chaves atual só aceita áudio, foto e impressão, e a leitura de foto depende de referência pertencente a cliente/visita. Não basta escrever `orders/<id>/logo.svg` ou guardar URL pública. Serão necessários prefixo validado de arte de pedido, vínculo do arquivo e checagem por organização/pedido. Fontes: `server/lib/files.ts:57`, `:276`; `server/routes/xpot/files.ts:30`, `:35`, `:47`.

**Preview obrigatório:** localizei e li a skill `C:/Users/Vanildo/.claude/skills/xpot-print-preview/SKILL.md:3`, `:34`: modelo ou versão novo não está pronto sem seu GLB anexado e conferido. O código tem upload privado e catálogo de preview por modelo/lote, mas criar versão não impõe esse requisito. Fontes: `server/tags/production.ts:430`, `:581`, `:613`; `shared/printProduction.ts:65`. Não acessei token nem fiz upload real; o laboratório explicitamente não tem preview 3D real.

**Visibilidade da arte:** o catálogo atual é compartilhado; a liberação de modelos com valor nulo significa todos, e o catálogo de previews para vendedores reúne modelos com preview. Portanto, um modelo específico de cliente não se torna privado por guardar seu arquivo em storage privado. Antes dessa alternativa, é necessário restringir catálogo, detalhe, impressão e preview pelo pedido/organizações autorizadas. Fontes: `server/tags/production.ts:209`, `:218`, `:235`, `:613`; `server/tags/productionRoutes.ts:134`; `shared/printProduction.ts:65`.

**Alternativas e recomendação:**

| Alternativa | Compatibilidade atual | Recomendação |
|---|---|---|
| Usar modelo padrão sem mudar geometria, só mudar destino do QR | Já existe; não muda o que está impresso | Para personalização apenas do link, não criar modelo |
| Alterar versão compartilhada para pôr logo de um cliente | A versão nova se torna padrão para pedidos futuros do modelo | Não usar uma versão compartilhada como espaço temporário de um cliente |
| Modelo específico quando o logo muda a geometria | Usa modelo/versão/lote/preview atuais; aumenta catálogo e exige produção da arte | Melhor ponte inicial para poucos pedidos, depois de a arte ser aprovada; manter referência explícita da linha ao modelo |
| Arte variável sobre modelo-base | Exige extensão de ticket, gerador, arquivo congelado e preview por arte/pedido | Considerar quando houver volume; não alegar que existe hoje |

Base técnica da comparação: `server/tags/production.ts:384`, `:430`, `:1533`; `shared/schema/tags.ts:417`, `:444`; `print-pipeline/builders/__init__.py:174`; `shared/printProduction.ts:65`. Custo da arte, preço e aprovação seguem para o dono no plano.

## 9. Defeito e reimpressão

`reprint-damaged` conta as peças danificadas de uma impressão concluída e cria novo pedido do mesmo modelo/organização/mesa. `replaces_job_id` aponta a impressão original; há bloqueio transacional contra duplicar reposição ainda viva. Um `redo` de impressão falha pode manter códigos ou gerar códigos novos e retirar os antigos pendentes. Fontes: `server/tags/production.ts:1168`, `:1183`, `:1119`, `:1256`; `migrations/0074_print_request_replaces.sql:1`.

Hoje não há cliente do pedido para preservar. O vínculo existente permite encontrar a origem produtiva, mas não prova que uma unidade substituta foi separada para determinado restaurante. Fontes: `shared/schema/tags.ts:466`, `:482`.

**Proposta:** toda reposição herda a linha do pedido, não aumenta quantidade pedida nem vendida. Reposição de peça já entregue deve registrar troca/defeito; não gerar segunda receita automaticamente. A versão efetivamente usada e o motivo da substituição devem permanecer auditáveis. Não executei reimpressão física nesta pesquisa.

## 10. Onde o pedido aparece

| Superfície atual | O que existe | Lacuna para o pedido |
|---|---|---|
| Today da gestão | Pessoas, atacado, compras da equipe, impressões e filas de peças | Sem pedidos de clientes aguardando arte/produção/entrega; `client/src/pages/admin/home-model.ts:21`, `:124` |
| Visita e empresa em Visitas | Venda, consignação, tarefas e peças | Sem total pedido e saldo entregue; `client/src/pages/xpot/components/leads/LeadDetailPane.tsx:243`; `client/src/pages/xpot/components/sales/VisitSaleActions.tsx:49` |
| Cliente em Tags | As peças já vinculadas e atalhos para empresa | Cliente do teste redirecionou a `/leads/42`; ainda sem oito pendentes; `client/src/pages/tags/TagsApp.tsx:74`; capturas `simple-restaurant-customer-*` |
| Minhas peças / tela da peça | Estado, cliente, venda e ações operacionais | Não distingue “comigo e livre” de “separada para pedido”; `client/src/pages/tags/PiecesScreen.tsx:49`; `client/src/components/piece/pieceView.ts:72` |
| Produção | Pedido interno, modelo, impressões e notas | Nome do cliente só pôde ser escrito em nota; E11; `client/src/pages/admin/tags/production-orders.tsx:19` |
| Cliente final | Peças configuradas e métricas de uso | Não é acompanhamento de pedido; pré-vincular `lead_id` pode tornar peça visível antes da entrega; `server/customer/repository.ts:89` |
| MCP | Criar/listar produção e registrar Jornada | Nenhuma entidade de pedido do cliente; ferramentas usam serviços de produção existentes; `server/mcp/tools/printProduction.ts:111`, `:143`; `server/mcp/tools/tagJourney.ts:102` |

**Proposta:** entrada única de Pedido do cliente, acessível pelo cliente e pela visita; vendedores só-Tags também precisam dela. Produção recebe um vínculo clicável ao pedido com acesso mínimo necessário; Today conta a mesma lista que abre. Não renomear silenciosamente o pedido interno de impressão: o glossário já usa “pedido” para ele, em `docs/MODULES.md:356`.

## 11. Avisos

Há assinatura e envio Web Push por vendedor; o envio depende de chaves VAPID e limpa inscrições expiradas. Os chamadores encontrados são de prospecção/rota, não de pedido de cliente. Fontes: `server/push-notifications.ts:15`, `:35`; `server/prospecting/queue.ts:146`; `server/prospecting/auto-route.ts:237`.

Telegram cobre cadastro e abandono de cadastro, não uma preferência de entrega por vendedor. Tarefas têm organização, responsável, situação e sincronização próprias. Fontes: `server/auth/telegramNotifications.ts:9`; `server/tasks/service.ts:206`, `:253`; `shared/xpot.ts:135`.

**Recomendação:** começar por “Pronto para entregar” no app e por tarefa ligada ao pedido. Push pode reaproveitar a infraestrutura, com envio posterior à confirmação da transação e deduplicação por evento; falha do aviso não desfaz a produção. Não enviar Telegram, WhatsApp, e-mail nem contato real sem definição do dono. Nenhuma mensagem real foi enviada no laboratório.

## 12. Bordas e dependência R3

| Situação | Evidência atual | Recomendação de regra para o plano |
|---|---|---|
| Cancelar saldo depois de entregar duas | Não há pedido; cancelar venda desfaz todos os vínculos daquela venda, `server/tags/sales.ts:338` | Cancelar só as oito ainda devidas; preservar a venda das duas |
| Alterar quantidade | Venda não é compromisso produtivo; `shared/xpot.ts:213`; `shared/schema/tags.ts:466` | Não baixar abaixo do entregue; liberar sobra separada e cancelar/reavaliar impressões pendentes em transação |
| Vendedor deixa a empresa | Acesso é recalculado por associação ativa, `server/tags/access.ts:34`; listagem `server/tags/routes.ts:493` | Pedido fica na organização e vai à fila do dono para redistribuir; crédito das vendas antigas não muda |
| Conta do vendedor é excluída | Clientes sem venda/consignação e tarefas podem ser removidos, `server/accountDeletion.ts:101`, `:138` | Pedido aberto e dinheiro também devem impedir perda do cliente; reatribuir antes de excluir |
| Empresa/cliente é excluído | Exclusão atual passa por `server/storage.ts:526` e `:917` | FK restritiva e regra contando pedidos, inclusive ainda sem peças/vendas; não depender só de esconder botão |
| Dois pedidos querem a mesma peça | Venda tem lock/índice, mas não existe reserva entre pedidos; `server/tags/sales.ts:85`; migração 0021:132 | Lock da unidade + índice único de separação ativa, e teste concorrente |
| Desenho errado | Venda confere produto de venda, não face/modelo da linha; `server/tags/sales.ts:156` | Confirmar tipo, face, modelo/arte aprovada e versão permitida na separação/entrega |
| Peça já entregue vai ao ar | Cliente/destino são independentes de venda, `server/tags/field.ts:42`; `shared/tags.ts:231` | Entrega não deve exigir NFC real nem gerar ativação por suposição; oferecer configurar em seguida |
| Negócio ganho | Muda negócio e sincroniza CRM; não cria produção, `server/routes/xpot/opportunities.ts:100` | Botão “Criar pedido” com revisão e vínculo único; não converter todo ganho automaticamente |

**R3 revisada após os commits, em 2/11:**

1. Commit `f5a720d`: `shared/tagMetrics.ts:29` acrescenta `customer:false` a `house`; `:31` cria `withCustomer`. Isso retira da empresa a peça com cliente, ainda disponível e sem venda. Não retira de `withResellers` a peça já configurada: essa diferença continua relevante para a bolsa.
2. Commit `20398b2`: `shared/leadDeletion.ts:18` bloqueia por venda, consignação e peça; `server/storage.ts:936` conta esses vínculos. Ainda não pode contar pedidos que não existem. Tarefas e negócios, sozinhos, são removíveis.
3. Commit `bb63017`: a criação de venda genérica, venda de Tags e acerto de consignação passa por `chosenPaymentStatus`, em `shared/pricing.ts:159`; sem escolha em total positivo, retorna `payment_status_required`. As chamadas estão em `server/routes/xpot/sales.ts:125`, `server/tags/sales.ts:211` e `server/storage-sales.ts:559`. O campo continua opcional no schema porque o total só é conhecido após precificar, e total zero dispensa escolha. Logo, `optional()` sozinho não demonstra falta de validação. Em ações por voz, silêncio vira não pago, `shared/pricing.ts:166` e `server/routes/xpot/visit-actions.ts:324`.
4. Commit `bc3b685`: a lista de negócios da plataforma segue o time contado, e dono autorizado pode editar negócio de colega na sua organização. Isso não cria pedido nem produção: `server/routes/xpot/opportunities.ts:32`, `:123`, `:132`.

Os números acima da R3 são de `bc3b685`, não do snapshot executado. A revisão final foi de código/diff; as 16 capturas e os testes reportados continuam sendo de `27856c4`. O plano já incorpora os três resultados, mas deve ser reconciliado com o `main` depois do merge. A autorização “pode seguir” permitiu esta pesquisa agora; não transforma as alterações em merge ou deploy verificado.

## 13. Teste da saída sem tabela nova

| Alternativa | Teste / verificação | Julgamento |
|---|---|---|
| Venda de dez + vínculo de duas + tarefa para oito + impressão de oito | Executado: venda 22, linha 33, duas peças, tarefa 17, produção em 4+4; E02–E11 | Funciona como registro manual se o dono aceitar venda antecipada. Não há saldo de entrega confiável nem ligação de produção |
| Vender apenas as duas + tarefa para oito | Executado: venda 23, total US$ 40; E13; capturas `final-delivered-sale-*` | Financeiro acompanha duas unidades, mas os oito continuam sendo texto livre |
| Venda livre da customizada | Executado: US$ 75 concluídos, sem arte nem peça; E24 | Registra valor, não aprovação, arquivo, produção ou entrega |
| Negócio ganho | Executado: negócio 8 ganhou; E25–E26 | Não virou pedido, impressão nem reserva |
| Usar `reserved` e cliente na peça | Executado parcialmente, E27–E31; não guarda unidade inexistente | Não representa os oito que ainda não existem e não bloqueia ativação |
| Consignação | Examinação de `server/routes/xpot/consignments.ts:74`, `:114` | Confunde mercadoria já deixada com mercadoria prometida; rejeitada por significado |
| Aquisição do vendedor | Examinação de `shared/schema/tags.ts:282` e `server/tags/acquisitions.ts:127` | É compra/custo do vendedor, não pedido do restaurante |
| Só pedido de impressão | Executado, E11; modelo sem arte recusou, E23 | Não cobre as duas já existentes, financeiro, cliente responsável ou aceite da arte |
| Tarefa/Jornada com JSON de pedido | Esquema de tarefa em `shared/xpot.ts:135`; metadados da Jornada em `shared/schema/tags.ts:376` | Exigiria inventar dentro de texto/JSON as mesmas relações, locks e permissões; Jornada atual é da plataforma |

**Resposta:** dá para operar manualmente sem tabela nova, com as limitações demonstradas. Para garantir “cliente pediu dez, duas entregues, oito devidas”, conciliar peças e produção, impedir disputa de estoque e preservar cancelamento, recomendo a entidade própria. Ela deve reaproveitar os serviços existentes e não ser um segundo sistema de estoque ou vendas. A escolha está descrita no [plano](PLANO.md).

## Encerramento desta etapa

Pesquisa e proposta documentadas. As checagens são da base `27856c4`, não de uma funcionalidade implementada: TypeScript passou; 1.721 testes passaram e 23 foram pulados; os 16 arquivos de integração do CI passaram em banco novo; build passou com avisos de tamanho de bundle e depreciação já registrados no laboratório. Evidência e limitações no [relatório](LABORATORIO.md).

Não há código de pedidos, migração nova, commit, push ou deploy deste trabalho. Dinheiro, preço personalizado, responsabilidade da arte e conversão de negócio continuam sujeitos ao dono. A próxima etapa é aprovar ou ajustar o [PLANO.md](PLANO.md).
