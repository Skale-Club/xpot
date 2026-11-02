# Pedido do cliente: plano para aprovação

Data: 2 de novembro de 2026. **Proposta, não implementação.** Base e limitações na [pesquisa](PESQUISA.md); provas do laboratório em [LABORATORIO.md](LABORATORIO.md).

## O resultado para quem vende

No restaurante, a pessoa registra “10 placas grandes de cardápio”. O pedido mostra “2 de 10 entregues” e “faltam 8”. A produção recebe essas oito com o nome do cliente. Quando ficam prontas, o vendedor vê “8 prontas para entregar”. Confirmar a entrega usa as peças certas e registra uma única venda.

Na customizada, a pessoa registra o pedido antes de existir a peça. A linha fica “Esperando a arte”; a plataforma prepara a arte e o vendedor registra a aprovação do cliente. Só então a produção recebe o desenho aprovado. A proposta não presume que uma foto ou um logo já seja um arquivo imprimível.

Recomendo começar pelo restaurante, com produto existente, sem sinal antecipado e sem customização. Esse recorte permite validar a ligação cliente → produção → entrega sem decidir de uma vez o livro de adiantamentos e o processo de arte.

## 1. Decisões para o dono

Todas as recomendações abaixo continuam abertas. Dinheiro e autorização para construir dependem do dono.

| # | Pergunta em linguagem de operação | Recomendação | Efeito / fase |
|---|---|---|---|
| D1 | Quando o cliente pede dez e leva duas, já conta como venda de dez ou apenas das duas? | Contar as duas na entrega. As outras oito ficam como pedido, sem aumentar “vendido aqui” | É a decisão que determina o financeiro da fase 1. A alternativa antecipada foi testada e está na pesquisa §13 |
| D2 | Quem produz as oito que faltam? | A produtora autorizada da empresa vendedora; se ela não produz, Skale Club. Quando houver mais de uma opção, escolher antes de mandar à fila | Encaminhamento explícito; não deduzir pelo cargo de quem clicou. Parceiros externos entram na fase 2 |
| D3 | Quem paga as peças antes de o vendedor entregá-las ao restaurante? | Manter a política comercial e a aquisição já existentes. Pedido do cliente não faz uma compra em nome do vendedor | Na fase 1, custo ausente impede entrega comercial e pede solução ao dono; não criar cobrança de produção automaticamente |
| D4 | O vendedor pode receber sinal antes de entregar? | Deixar sinal para a fase 3. Depois, registrar dinheiro no pedido, separado da venda, com abatimento explícito em cada entrega | Evita registrar os mesmos US$ 60 como sinal e novamente como pagamento |
| D5 | Se cancelar com sinal, devolve tudo, parte ou nada? | O sistema deve pedir uma decisão do dono para aquele saldo e registrar motivo e devolução efetivamente feita. Não escolher retenção automática | Regra comercial/jurídica precisa ser fornecida pelo dono antes da fase 3 |
| D6 | Quem faz e quem aprova a arte? | Plataforma faz; cliente aprova; vendedor registra qual revisão foi aprovada, por quem, quando e por qual meio | Fase 4. Parceiro imprime o liberado, sem editar arte ou catálogo |
| D7 | Quanto custa a customizada? | Vendedor informa o preço combinado, na moeda do pedido; alterações posteriores exigem motivo e novo aceite se necessário | Requer aprovação do dono sobre a autonomia de preço. Custo interno da arte não fica visível ao vendedor |
| D8 | Cada logo deve virar um modelo de impressão? | Para poucos pedidos, só criar um modelo específico quando a arte aprovada mudar a geometria; sempre com preview 3D. Mudar apenas o link usa modelo existente | Fase 4. Evita fingir que o gerador de logo já existe. Arte variável sobre molde-base fica para um projeto posterior |
| D9 | Negócio ganho em “Negócios” vira pedido automaticamente? | Oferecer “Criar pedido” com revisão de produto, quantidade, preço e responsável; usar vínculo único para não converter duas vezes | Fase 5. Um negócio pode vender serviço, portanto ganho não implica peça |
| D10 | O vendedor pode cancelar o restante depois de produzir? | Antes de produzir, pode cancelar seu saldo sem dinheiro. Depois de começar a produção, o dono decide o destino das peças; entregas passadas não são canceladas junto | Fase 1 já registra essa distinção. Cancelar saldo de oito não apaga a venda das duas |
| D11 | Por onde avisar que está pronto? | Lista no app e tarefa ligada ao pedido; push opcional depois. Nenhuma mensagem externa automática na fase 1 | Fases 1 e 5. Telegram/WhatsApp/e-mail e contatos reais dependem de decisão posterior |
| D12 | O cliente final acompanha e aprova sozinho pelo portal? | Primeiro, vendedor acompanha e registra o aceite. Portal de pedidos fica fora deste primeiro ciclo | Não expor pedidos de outros clientes nem peças apenas separadas no painel atual |

Não proponho comissão, prazo prometido de fabricação, cobrança automática, multa ou texto jurídico. A pesquisa não encontrou uma regra atual de comissão a reaproveitar.

## 2. Menor solução e por que ela não basta

Foi possível fazer uma venda de dez, associar duas peças, criar tarefa para oito e pedir oito na produção. A venda ficou em US$ 200 concluídos; a tarefa e a impressão só se ligavam pelo texto. Também foi possível registrar uma venda livre da customizada sem arte. Ver ensaios E02–E11 e E24 em [EVIDENCIAS.json](evidencias/EVIDENCIAS.json).

Se o dono aceitar essa operação manual e venda antecipada, ela evita a entidade nova, mas não garante separação de estoque, saldo de entrega ou aprovação da arte. Para atender ao compromisso descrito no brief, recomendo relações próprias, sem copiar o estoque, o catálogo ou as vendas.

O pedido de cliente tem nome explícito. Em Produção, os pedidos internos continuam existindo; lá o vínculo se apresenta como “Para Restaurante X · 8 peças”. O nome simples de tela não precisa carregar número de tabela, estado técnico ou código interno.

## 3. Dados propostos

Os nomes abaixo são técnicos para implementação. A migração recebe o próximo número livre depois que a R3 entrar. Não há SQL novo nesta entrega.

| Relação | Dados principais | Por que existe |
|---|---|---|
| `customer_orders` | UUID; organização vendedora; cliente; vendedor responsável; criador; visita de origem opcional; negócio de origem opcional; moeda; situação comercial; revisão; observação; datas | O compromisso continua existindo quando o responsável muda ou ainda não há peça |
| `customer_order_lines` | Pedido; sequência; quantidade pedida; quantidade cancelada; descrição comercial congelada; produto de venda; tipo físico; face; cor; preço combinado e desconto em centavos; produtora; modelo/versão escolhidos quando existirem; referência de arte aprovada na fase 4 | “10 menus, placa grande” é diferente de uma venda ou de uma impressão |
| `customer_order_pieces` | Linha; peça; situação `allocated/delivered/released/damaged/returned`; quem separou; datas; entrega de destino opcional; motivo de saída; modelo/versão identificados | Cada unidade separada pertence a uma linha; preserva histórico de defeito, troca e liberação |
| `customer_order_deliveries` | Pedido; autor; data; venda associada única; situação `confirmed/reversed`; chave idempotente e impressão digital do comando; revisão esperada; motivo de reversão | Uma entrega pode conter várias linhas e sempre aponta para uma única venda financeira. As unidades estão em `customer_order_pieces` |
| `customer_order_events` | Pedido; evento; ator; data; revisão; comando/chave; campos alterados; referências de impressão/entrega/venda; motivo | Histórico de mudanças e base dos avisos. Não depende da Jornada, hoje restrita à plataforma |

As cinco relações têm funções distintas. Guardar só um número “faltam 8” ou um JSON na tarefa dispensaria tabelas, mas perderia a prova de quais peças, entrega e venda o produziram. Não criar uma segunda tabela de estoque ou de itens vendidos: usar `tags`, `sales_sales`, `sales_sale_items` e `sales_sale_tags` existentes.

### Vínculo com produção

Adicionar `customer_order_line_id` opcional a `print_requests`, com FK restritiva e índice. Uma linha pode ter vários pedidos internos: primeira produção, complemento e reposição. Não permitir uma impressão servir a vários clientes nesta primeira versão. Os lotes e as peças continuam sendo os da produção existente.

O pedido pertence à empresa que vendeu; `print_requests.organization_id` continua sendo a produtora. `fulfilled_from_organization_id` da aquisição mantém o significado de origem do atacado e não é reutilizado como cliente do pedido.

Na fase 4, arte pendente aceita modelo/versão nulos. Na fase 1, só produto físico existente, com desenho identificável e modelo pronto, pode entrar. Não fabricar um `print_model` vazio a cada tentativa de criar pedido.

### Restrições e índices

- FK `RESTRICT` para cliente, organização, linhas, peças e vendas que precisam de histórico. Visita pode usar `SET NULL`; apagar a visita não apaga pedido.
- Organização obrigatória em toda raiz e operação. Relações filhas usam FK composta ou validação equivalente para não cruzar pedido de uma organização com linha de outra. Como não há FK de “cliente com a mesma organização” hoje, validar e proteger essa condição também no serviço transacional.
- Índice único parcial por `tag_id` para separações `allocated`. O serviço também recusa unidade com venda ativa, dano, perda, retirada, outra separação ou cliente incompatível.
- `UNIQUE(sale_id)` em entrega; chave idempotente única no escopo do pedido; `UNIQUE(order_id, sequence)` na linha; índice único parcial para negócio convertido, quando existir esse fluxo.
- Quantidade pedida positiva; cancelada não negativa; entregue + cancelada não excede pedida. A soma entre linhas/unidades é verificada sob lock da linha, não em um `CHECK` que tente consultar outra tabela.
- Uma moeda por pedido e por entrega. Valores inteiros em centavos; somas e descontos sem arredondar separadamente cada parcela.
- Índices de consulta: empresa/situação/data; vendedor/situação; cliente/data; produtora/pendências; linha/estado da separação; pedido/data de evento; referência da produção.
- As tabelas seguem a política RLS e acesso pelo servidor das relações existentes; não abrir consulta direta do navegador só por ter UUID.

### Migração e recuperação

1. Criar relações e vínculos opcionais em uma migração aditiva, transacional. Não reclassificar vendas, tarefas, peças `reserved` ou pedidos de impressão antigos como pedidos de cliente.
2. Criar o recurso desligado; aplicação antiga continua operando sem preencher as novas relações. Antes de habilitar criação, todas as instâncias que podem vender/mover peça precisam reconhecer separações de pedido. Uma versão antiga não pode continuar liberada para vender peças separadas.
3. Testar migração em banco vazio e banco com dados, e comparar estoque, vínculos físicos, vendas e quantidades antes/depois. Só então habilitar para o piloto aprovado.
4. Para voltar atrás sem perda: desligar novas operações, manter a versão que protege separações e os dados; liberar ou finalizar saldos sob controle. Não voltar a um binário que ignora reservas enquanto houver unidades separadas.
5. `down` físico só em banco sem pedidos/entregas, ou após exportação e decisão explícita de recuperação. Depois de uso real, o rollback seguro é funcional, preservando registros, não apagar pedidos nem reembolsar por migração.

## 4. Estoque e entrega: regras que precisam valer juntas

**Separar não vende, não recebe e não configura.** A peça mantém sua organização, custódia e estado físico. A separação fica no vínculo ao pedido. Isso evita pôr `lead_id` antecipadamente e mostrar a peça no painel do cliente antes de entregá-la.

Não usar apenas `stock_status=reserved`: o ensaio mostrou que esse estado bloqueia venda/movimento e ainda permite ativação. Também não trocar `available → reserved → available` em chamadas distintas para conseguir vender. Isso abriria uma janela para outra pessoa pegar a unidade.

Os contadores devem distinguir “livres”, “separadas para pedido” e “com cliente”, aplicados ao mesmo conjunto que a lista abre. A soma do estoque físico pode incluir unidades separadas; o número que promete disponibilidade comercial deve excluí-las. Incorporar a definição R3 de peça com cliente, sem colocá-la simultaneamente em dois grupos de estoque livre.

Todas as portas que podem tirar ou alterar a peça devem consultar a separação: venda de Tags, vínculo com venda existente, entrega de kit, recolhimento, transferência de responsável, ajuste/dano, configuração rápida, atribuição de cliente, operações administrativas e futuras ferramentas MCP. Uma restrição só na tela do pedido não protege o estoque.

O pedido autoriza apenas sua própria entrega a consumir a separação. A unidade precisa estar com o vendedor correto, no estoque físico correto e com custo resolvido, conforme as regras existentes. Separação na produtora não faz a peça aparecer como estando na bolsa do vendedor.

### Uma transação por confirmação

Reaproveitar a lógica de `createTagSale`, extraindo uma parte que receba a transação em vez de abrir e confirmar outra internamente. A mesma operação deve:

1. Validar organização, responsável e revisão do pedido, e bloquear pedido/linhas/peças em ordem determinística.
2. Revalidar saldo, separação, desenho aprovado, custódia, produto, moeda e custo das unidades.
3. Criar uma única entrega e uma única venda com itens e vínculos físicos existentes.
4. Marcar as unidades como entregues, atualizar situação derivada e registrar evento.
5. Confirmar tudo de uma vez. Erro em qualquer parte deixa pedido, venda e estoque como estavam.

A chave repetida com o mesmo conteúdo devolve a entrega anterior; chave igual com conteúdo diferente responde conflito. Não tentar corrigir entrega parcialmente gravada criando outra venda por fora. A venda por entrega usa a mesma validação de pagamento explícito que a R3 entregar, sem assumir pago.

A venda de uma entrega não pode ser cancelada isoladamente pela rota antiga e deixar o pedido como entregue. A rota deve reconhecer o vínculo e encaminhar ao pedido. Reversão de entrega, encerramento de vínculos da venda e ajuste do saldo são uma única operação; devolver uma peça ao estoque exige registrar que ela realmente voltou. Cancelar apenas as oito ainda devidas não chama `cancelSale` sobre a entrega das duas. Correção de pagamento também não significa devolução física.

O preço da entrega vem do acordo do pedido: se a quantidade dez deu preço unitário especial, entregar duas não recalcula como compra avulsa de duas. Congelar a alocação dos descontos entre todas as unidades combinadas; a soma de entregas e cancelamentos precisa fechar o valor acordado. Custo continua sendo congelado na venda de cada unidade, segundo a aquisição/política existente.

Criar produção a partir da linha também precisa de transação e chave próprias. A função atual de produção abre transação internamente: extrair a parte comum para gravar vínculo e pedido de impressão juntos, preservando as APIs atuais. Não criar pedido interno e depois tentar anexar a linha em uma segunda chamada vulnerável a duplicação.

Sincronização externa, push e tarefas derivadas acontecem depois do commit, com referência durável ao evento e repetição controlada. Falha do aviso não vira falha falsa de entrega já confirmada.

## 5. Regras puras e tabela de casos

Implementar regras em módulo compartilhado puro, com dados de entrada completos e resultado estruturado. O servidor aplica a regra; a tela usa o mesmo resultado para explicar situação e escolher ação. Nada de confiar no número enviado pelo navegador.

Funções previstas: `orderLineBalance`, `pieceAllocationBlocker`, `planOrderDelivery`, `planOrderChange`, `orderWorkState` e `orderActorPermissions`. Nomes podem seguir o padrão vizinho na implementação, mantendo estas responsabilidades.

| Caso de teste | Resultado esperado |
|---|---|
| Pedido 10; entregues 2; canceladas 0 | Faltam 8; não completo |
| Pedido 10; entregues 2; separadas 3 | Faltam entregar 8; prontas 3 se fisicamente disponíveis; falta obter/produzir 5, descontando produção viva |
| Pedido 10; duas entregues; pedido interno vivo de oito | Não criar outra produção de oito ao repetir o comando |
| Impressão de oito com duas ruins | Seis boas separadas; duas aguardando reposição; não “oito prontas” |
| Mesmo código aparece duas vezes na seleção | Recusar, sem gravação |
| Peça separada em outro pedido do mesmo cliente | Recusar; o cliente ser o mesmo não libera disputa entre pedidos |
| Peça já com outro cliente, vendida, pendente, danificada, perdida ou retirada | Recusar separação/entrega com motivo |
| Produto certo, face ou arte errada | Recusar mesmo que o preço seja igual |
| Duas unidades reservadas, mas ainda na produtora | “Prontas na produtora”; vendedor ainda não pode confirmar entrega física |
| Tentar entregar 9 quando faltam 8 | Recusar sem venda |
| Repetir confirmação | Mesma entrega e mesma venda |
| Duas confirmações simultâneas das mesmas unidades | Uma confirma; outra encontra conflito, sem receita extra |
| Alterar quantidade total de 10 para 1 após entregar 2 | Recusar |
| Baixar de 10 para 6 com duas entregues | Cancelar/liberar quatro ainda não entregues; revisar produção excedente; preservar venda das duas |
| Cancelar oito restantes | Duas entregues permanecem; libera separações não entregues e trata produção em andamento explicitamente |
| Cancelar depois de pronta | Exige dono e destino das peças; nunca retira automaticamente peça física que não voltou |
| Vendedor perde acesso à empresa | Sem acesso ao pedido; dono vê pendência de reatribuir |
| Usuário de outra empresa usa UUID válido | Não ganha acesso nem informação sobre cliente/valores |
| Vendedor `member` consulta detalhe, lista, entrega e erro | Não recebe custo nem lucro em nenhum campo ou aninhamento |
| Falta custo para política `acquisition` | Pedido pode existir; entrega comercial bloqueada até solução autorizada |
| Entrega sem escolha de pagamento | Recusar; em valor zero usar regra explícita de gratuidade, sem inventar recebimento |
| Reposição de uma peça já entregue | Registra troca, sem aumentar quantidade pedida nem nova receita automaticamente |
| Arte não aprovada ou revisão alterada depois do aceite | Não mandar à produção |
| Cancelamento com dinheiro a devolver na fase 3 | Situação logística pode ser encerrada, mas saldo financeiro continua pendente até decisão e registro |

Quantidades de produção são planejadas sob lock da linha. Produção cancelada não conta como “a caminho”; uma tentativa refeita não conta duas vezes; reposição de defeito não aumenta o compromisso do cliente. Testes de concorrência precisam ser de integração com Postgres real, não apenas teste da função pura.

## 6. Estados e quem muda

Guardar decisão comercial e histórico; calcular o andamento a partir de arte, produção, separações, custódia e entregas. “2 de 10 entregues” fica visível em todos os estados. Não deixar a pessoa escolher livremente “Entregue” em um menu.

| O que a pessoa vê | Como se chega lá | Quem age / ação principal |
|---|---|---|
| Esperando a arte | Linha customizada sem revisão aprovada | Plataforma prepara; vendedor acompanha |
| Aguardando aprovação | Revisão pronta para o cliente conferir | Vendedor registra o aceite daquela revisão |
| Na fila | Saldo sem peças prontas, com produção a iniciar | Produtora autorizada inicia o fluxo existente |
| Em produção | Há arquivo sendo gerado ou impressão em andamento | Produtora usa as ações de produção atuais |
| Pronto na produtora | Unidades boas separadas, ainda fora da custódia do vendedor | Dono/produtora encaminha pelos caminhos de distribuição autorizados |
| Pronto para entregar | Unidades disponíveis e separadas com o vendedor | Vendedor confirma quantidade/códigos da entrega |
| Entregue | Todo saldo não cancelado tem entrega confirmada | Ver entrega e, quando preciso, configurar link |
| Encerrado com entrega parcial | Parte entregue, resto cancelado | Ver o que foi entregue e o motivo do saldo cancelado |
| Cancelado | Nenhuma entrega e saldo cancelado | Histórico; não esconder pendência financeira |

Para pedido com várias linhas, mostrar um estado principal que indique a próxima ação da pessoa e o detalhe por linha. Não chamar o pedido inteiro de pronto quando só uma parte está pronta. Falha de impressão é aviso de ação da produção, não novo estado financeiro.

Membro cria e acompanha seus pedidos e entrega suas peças; dono da empresa vê a equipe, redistribui e resolve cancelamento depois de produzir; parceiro só opera suas linhas de produção; plataforma administra o todo e o catálogo. Ser dono não basta para criar modelo ou liberar parceiro. Acesso ao pedido não concede acesso ao estoque de outra organização.

## 7. Telas, começando pelo celular

| Tela | O que precisa dizer em três segundos | Ação principal |
|---|---|---|
| Cliente em Tags e empresa em Visitas | “Pedidos · faltam 8 peças” | Abrir pedido ou criar o primeiro |
| Visita | “O cliente pediu algo que ainda falta entregar” | Criar pedido, com cliente/visita já preenchidos |
| Criar pedido | Cliente; produto/desenho; quantidade; preço combinado; o que existe comigo | Salvar pedido; oferecer “Entregar 2 agora” em seguida |
| Pedido | “Restaurante X · 2 de 10 entregues · 8 em produção” | A próxima ação possível para aquela pessoa |
| Entrega | Quantas unidades, quais desenhos, valor desta entrega e pagamento escolhido | Confirmar entrega uma vez; depois mostrar o comprovante e os códigos |
| Minhas peças | “Livres comigo” e “Separadas para pedidos” com lista correspondente | Abrir o pedido da peça separada |
| Produção | “8 menus para Restaurante X”, desenho e prazo se combinado | A ação de produção que já existe naquele estado |
| Today | Pedidos precisando daquela pessoa, com escopo à vista | Abrir exatamente a lista que produziu o número |
| Arte | Revisão, imagem aprovada e observação do cliente | Registrar aprovação ou solicitar ajuste |

Um card de pedido pode dizer:

> Restaurante X\
> Cardápio · placa grande · branca\
> 2 de 10 entregues\
> 8 em produção\
> Ver pedido

No celular, totais e botões devem empilhar. As capturas da venda atual mostraram conteúdo cortado no detalhe a 390 px; não transportar esse desenho para o pedido. Sem botão apagado; dizer o que falta e oferecer só a ação permitida. Vermelho apenas quando alguém precisa resolver um problema agora.

Textos novos em en/pt/es, seguindo o glossário. Proposta de termos: “Customer order / Pedido do cliente / Pedido del cliente”; “Set aside for this order / Separada para este pedido / Separada para este pedido”; “Delivered 2 of 10 / 2 de 10 entregues / 2 de 10 entregadas”. Não mudar URLs atuais nem usar o nome da tabela na interface.

O vendedor só-Tags precisa criar e entregar sem habilitar Visitas. A nova API não pode ficar atrás do gate de Visitas. Ligações entre empresa, cliente e visita mostram o mesmo pedido, não cópias.

## 8. Produção, parceiros e peças que saíram ruins

Ao imprimir, separar as unidades boas para a linha na mesma transação da entrada. Nenhuma unidade prometida deve aparecer por um instante como estoque livre. Peças ruins mantêm a necessidade do pedido; a reposição herda `customer_order_line_id` e preserva `replaces_job_id`.

Quando códigos mudarem em `redo`, liberar/encerrar as separações antigas e relacionar as novas sem perder histórico. Uma peça apenas pendente de impressão nunca é pronta para entrega. Se o modelo mudou desde o primeiro pedido, a reposição precisa conferir que a nova versão continua atendendo ao desenho aprovado.

A remessa ao vendedor usa kit/aquisição e origem autorizada já existentes. Acompanhar “na produtora”, “com vendedor” e “no cliente” sem tratar todas como uma única entrega. Transferência logística não reconhece receita de varejo.

Na primeira fase, manter uma produtora por linha e uma linha por pedido de impressão. A fase 2 cobre produção por parceiro com distribuição própria, visibilidade limitada da linha e passagem entre organizações. Não implementar implicitamente loja/cobrança do parceiro, que ainda são tratadas fora do Xpot.

## 9. Sinal e arte nas fases seguintes

### Dinheiro antecipado, se D4 e D5 forem aprovadas

Adicionar um livro próprio de eventos monetários do pedido, não uma coluna sobrescrita “sinal”. Cada recebimento tem valor, moeda, autor, data, forma, referência e chave idempotente. Abatimento liga esse recebimento a uma entrega/venda; devolução tem referência à decisão e ao recebimento original.

Exemplo de teste, não política aprovada: pedido de US$ 200, sinal de US$ 60, primeira entrega de US$ 40. Aplicam-se US$ 40 uma única vez à primeira venda; sobram US$ 20 no pedido. A entrega seguinte pode usar esses US$ 20. Não somar novamente os US$ 40 como novo dinheiro recebido nos relatórios de caixa.

Essa fase precisa definir qual relatório conta dinheiro recebido e qual conta venda realizada, inclusive pagamentos posteriores diretamente na venda. Cancelar o saldo não gera devolução bancária fictícia. Se a decisão for devolver US$ 20, o sistema só marca devolvido quando a devolução tiver sido registrada. A política de retenção, prazo e textos depende do dono.

### Arte personalizada, se D6–D8 forem aprovadas

Adicionar revisões de arte ligadas à linha: descrição, arquivo privado, hash, autor, estado e aprovação com referência à revisão exata. Alteração depois de aprovada cria nova revisão e invalida o aceite anterior para a produção ainda não iniciada.

Upload de logo não vira arquivo público de branding. Definir tipos e limites aceitos, leitura autorizada ao pedido e exclusão controlada; o cliente autoriza o uso do material no processo definido pelo dono. Não redigir condições jurídicas por suposição.

Para logo que muda a geometria, criar o modelo específico após a aprovação, cadastrar versão e conferir GLB anexado conforme `xpot-print-preview`. A linha guarda esse modelo; as próximas impressões repetem o desenho aprovado. Não alterar o modelo compartilhado de menus para representar o logo temporário de um cliente.

O modelo específico também precisa de vínculo opcional e restritivo à linha do pedido, distinto dos modelos compartilhados. Catálogo, detalhe, arquivo, geração e preview devem respeitar esse vínculo. A liberação atual “todos os modelos” de um parceiro não autoriza ver o logo de qualquer cliente. O endpoint de catálogo de previews para vendedores também precisa ser filtrado; storage privado sozinho não resolve essa exposição. Essa adaptação integra a fase 4 e seus testes entre organizações.

## 10. Fases pequenas, cada uma em um PR

| Fase | Entrega utilizável | Entra | Critério para terminar |
|---|---|---|---|
| 1. Restaurante com produto pronto | Criar dez, entregar duas, mandar oito à produção, separar boas e concluir entregas posteriores | Núcleo de dados, ligação à produção, reserva, transação única de entrega/venda, cliente/visita, lista pessoal, cancelamento do saldo, bloqueio de exclusão e proteção de custo | Demonstração em celular e computador: 2/10 → produção de 8 → 6 boas + 2 ruins → reposição → 10/10. Uma venda por entrega; nenhum valor para as peças pendentes; estoques livres e separados conferidos |
| 2. Empresa e parceiro produtor | O pedido atravessa a produtora e a empresa vendedora sem perder o cliente ou expor dados de outra empresa | Escopo do dono/equipe, reatribuição, distribuição `own`, aquisição/custo e rastreio da origem; listas de trabalho por produtor | Vendedor sai: dono recupera pedido. Parceiro só vê suas linhas. Custódia, aquisição e organização corretas na entrega |
| 3. Sinal e cancelamento financeiro | Receber antes, abater depois e resolver saldo cancelado sem duplicar dinheiro | Livro de recebimentos/abatimentos/devoluções, telas e relatórios definidos em D4/D5 | US$ 60 → US$ 40 aplicados + US$ 20 restantes; repetição e cancelamento preservam saldo; membro não recebe custo/lucro |
| 4. Customizada | Pedido existe antes da arte e chega à entrega com a revisão aprovada | Arquivos privados, revisões e aceite; modelo específico quando necessário; preview 3D; preço conforme D7 | Arte recusada/alterada não imprime. Modelo/versão com preview conferido; cliente correto recebe a peça correta; não exige preço de catálogo inexistente |
| 5. Avisos e origem comercial | Próximo passo aparece a quem precisa; negócio pode gerar pedido uma vez | Today, tarefa ligada, push opcional, “Criar pedido” em Negócios, ferramentas MCP com escopo explícito | Número abre lista equivalente; erro/repetição de push não duplica tarefa; negócio ganho sozinho não fabrica nem cobra |

**Recorte da fase 1:** produto existente, um desenho por linha, uma moeda, produção pela Skale Club ou pela própria empresa quando autorizada; piloto com política comercial/acquisição já resolvida. Não contém sinal, logo, comissão, portal do cliente, cobrança automática ou parceiro externo novo. Embora existam relações para várias linhas, o formulário inicial pode começar com uma linha, desde que a entrega identifique as unidades sem ambiguidade.

O primeiro PR precisa ser uma fatia funcional, não apenas migração sem tela. Se ficar grande para revisão, reduzir o piloto e a seleção de produtos antes de separar artificialmente banco, API e tela em entregas que ninguém consegue usar. Cada fase posterior pode ser adiada sem apagar o que o restaurante já usa.

## 11. Verificação e dependências antes de construir

1. Reconciliar o plano com a R3 integrada: commits `f5a720d` (estoque com cliente), `20398b2` (exclusão) e `bb63017` (pagamento explícito). A revisão final confirmou a exigência no serviço depois de precificar, embora o schema mantenha o campo opcional; repetir os casos sem escolha e com total zero no primeiro PR. Capturas e checagens desta pesquisa são da base anterior, `27856c4`.
2. Preservar estoque/vendas/custos antigos na migração. Corrigir o ponto de exposição de custo/lucro nas portas de Tags que a nova entrega usar; testar as respostas completas, não só a presença do card.
3. Rodar as tabelas de casos puras e testes de API/permissão de todos os perfis. Concorrência e rollback da entrega são testes em Postgres real: venda falha, estoque fica igual; duas requisições, uma entrega.
4. Na fase 1, repetir o restaurante pelo fluxo real no computador e celular, incluindo selecionar unidades, confirmar, abrir o resultado, atualizar pagamento explícito e cancelar apenas saldo. Na fase 4, repetir a customizada inteira, com upload/preview reais em ambiente próprio de teste.
5. Ver telas em en/pt/es e nos perfis afetados, abrir as imagens, conferir corte/overflow, ações e números contra as listas. A pesquisa atual em português não substitui isso.
6. Executar `npm run check`, `npm test`, `npm run build` e a lista de integração de `.github/workflows/ci.yml` em banco exclusivo. Acrescentar ao CI os novos testes críticos, sem depender só de execução manual.
7. Operações de Xpot/Skale por MCP/API/CLI. Quando houver fabricação física, registrar cada etapa em `tags_journey_record`, além do evento do pedido. Não usar o ambiente de produção para ensaio.

A pesquisa preservou os dados de teste e os scripts na pasta local `.lab/customer-orders/`, ignorada pelo Git. O backup de dados não depende da pasta temporária original. O servidor da pesquisa é temporário e deve ser encerrado ao concluir; nada foi publicado.

## 12. Aprovação solicitada

O dono pode aprovar ou alterar a fase 1 e as respostas D1–D3/D10 que a governam, deixando sinal e customizada para depois. A recomendação de partida é: **pedido guarda a promessa; entrega registra a venda das peças realmente entregues; produção mantém o vínculo com o cliente; sinal fica fora da primeira fase**.

Este documento encerra a etapa de planejamento pedida no brief. Não autoriza construir sozinho: o brief diz “Pare aqui e leve ao dono”. Nenhuma recomendação monetária ou de arte vira decisão só por estar escrita aqui.
