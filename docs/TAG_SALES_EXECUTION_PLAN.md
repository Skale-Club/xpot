# Plano de execução: venda de peças e margem de parceiros

**Status:** implementado em outubro de 2026
**Público:** produto, engenharia e operação
**Objetivo:** transformar a venda de uma peça de Tags em uma venda financeira completa, ligada à peça física, ao cliente, à visita e ao custo real de quem vendeu.

---

## 1. Resultado esperado

Ao final deste trabalho, o Xpot deverá permitir que uma pessoa:

1. selecione ou escaneie uma ou várias peças;
2. informe para qual cliente elas foram vendidas;
3. registre preço, desconto, forma de pagamento e data;
4. confirme uma única venda com todas as peças;
5. veja essa venda tanto em **Tags** quanto em **Vendas** e, quando aplicável, na visita ativa;
6. veja faturamento, quantidade de peças, custo e lucro corretos.

O cálculo econômico seguirá a origem de cada peça:

- **Venda própria da operação:** custo da peça igual a zero. O valor líquido recebido é lucro bruto integral para o Xpot.
- **Venda de parceiro:** custo igual ao valor pelo qual aquela peça foi adquirida pelo parceiro.
- **Compra normal do parceiro:** o custo vem do pedido feito na Stuscle Wholesale.
- **Entrega presencial ou exceção:** o custo é informado na entrega e fica registrado como valor personalizado.

O sistema não deve inferir essa regra a partir de `rep`, `manager` ou `admin`. Papel controla permissão; política comercial controla custo.

---

## 2. Decisões de produto

### 2.1 Tags e Vendas terão responsabilidades diferentes

- **Tags** continua sendo a fonte da verdade sobre a peça física: código, modelo, lote, responsável atual, destino, ativação e leitura.
- **Vendas** continua sendo a fonte da verdade financeira: cliente, vendedor, valor, desconto, pagamento, custo e lucro.
- Uma nova associação ligará cada unidade física ao item de venda correspondente.

Uma peça pode estar ativa, desativada ou ainda sem destino e, independentemente disso, ter ou não uma venda financeira. Por isso, **“vendida” não deve virar um status operacional da peça**. É uma condição derivada da existência de uma venda válida.

### 2.2 Venda, ativação e leitura são eventos diferentes

- **Venda:** transferência comercial para um cliente, com valor e vendedor.
- **Ativação:** configuração do destino da peça.
- **Leitura:** uso do QR ou NFC.

A ativação pode acontecer antes ou depois da venda. Ela não deve criar receita automaticamente.

### 2.3 O custo será da unidade física

O custo de catálogo serve como sugestão para produtos genéricos, mas não é suficiente para plaquinhas. Duas unidades do mesmo modelo podem ter sido adquiridas por preços diferentes. Portanto, o custo efetivo precisa acompanhar cada peça adquirida e ser congelado na venda.

### 2.4 Histórico financeiro não será apagado

Cancelamentos e devoluções devem invalidar a associação ativa, mantendo o registro histórico. Se a mesma peça for vendida novamente, uma nova associação será criada.

---

## 3. Fluxos completos

### 3.1 Venda feita pelos donos do app

1. A pessoa abre **Tags** e toca em **Vender peças**.
2. Escaneia ou seleciona uma ou mais peças disponíveis.
3. Escolhe o cliente e informa os valores.
4. O sistema identifica a política comercial `zero` do vendedor.
5. Todas as peças recebem custo congelado de `0` centavos.
6. A venda é criada em Vendas e ligada às peças.
7. O lucro bruto é o valor líquido da venda.

Exemplo: duas peças vendidas por US$ 30 cada, sem desconto. Faturamento US$ 60, custo US$ 0, lucro bruto US$ 60.

### 3.2 Parceiro compra pela Stuscle Wholesale

1. O parceiro compra usando seu código de atacado.
2. A Stuscle envia o pedido ao Xpot por uma integração autenticada.
3. O Xpot registra a aquisição, o parceiro, os produtos, quantidades, valores e referência externa.
4. Se os códigos físicos já forem conhecidos, as peças são ligadas imediatamente à aquisição.
5. Se ainda não forem conhecidos, o pedido fica como **aguardando separação**.
6. Na separação ou entrega, a operação escaneia as peças e conclui a aquisição.
7. Quando o parceiro vende uma peça, o custo daquela unidade é copiado para a venda.

Exemplo: parceiro compra cada peça por US$ 12 e vende por US$ 25. Faturamento US$ 25, custo US$ 12, lucro bruto do parceiro US$ 13.

### 3.3 Entrega presencial com preço personalizado

1. Um gerente abre a entrega de peças.
2. Seleciona o parceiro e escaneia as unidades.
3. Escolhe a origem **Entrega manual**.
4. Informa o custo unitário ou custos diferentes por unidade.
5. O sistema cria a aquisição e o kit logístico na mesma operação.
6. As vendas futuras usam esse custo personalizado.

O valor personalizado deve guardar quem informou, quando informou e, se for alterado, o motivo da alteração.

### 3.4 Venda durante uma visita

Quando houver uma visita ativa para o mesmo cliente, o Xpot deverá sugerir e preencher automaticamente a visita. A confirmação da venda atualiza o resumo da visita, mas continua usando o mesmo serviço de venda das demais telas.

### 3.5 Devolução e revenda

1. A venda original é cancelada ou recebe uma devolução.
2. O vínculo comercial da peça deixa de ser ativo, sem apagar o histórico.
3. A peça volta ao estoque adequado, conforme a operação escolhida.
4. Uma revenda cria um novo vínculo, com novo preço e novo custo congelado.

---

## 4. Modelo de dados proposto

### 4.1 Política comercial do vendedor

Adicionar ao perfil comercial do vendedor:

- `costPolicy`: `zero` ou `acquisition`;
- data da configuração;
- usuário que configurou.

Regras:

- `zero`: usado pelos donos do app para vendas de peças próprias;
- `acquisition`: usado por parceiros que compram estoque;
- a migração não deve classificar pessoas apenas pelo papel de acesso;
- pessoas existentes devem ser classificadas explicitamente pela operação.

Essa política vale para vendas de peças físicas de Tags. Outros produtos continuam usando suas próprias regras de custo.

### 4.2 Associação entre modelo físico e produto vendável

Cada lote ou peça deverá apontar para um produto do catálogo de Vendas. O lote fornece o padrão e a peça pode guardar a associação efetiva.

Isso permite que os modelos físicos em evolução sejam cadastrados no catálogo sem colocar preços dentro do tipo técnico da peça. Peças antigas podem permanecer sem associação até serem reconciliadas, mas uma nova venda exige um produto definido.

### 4.3 Aquisição de estoque

Criar um cabeçalho de aquisição, por exemplo `tag_acquisitions`, com:

- parceiro comprador;
- origem: `stuscle`, `manual`, `house` ou `migration`;
- referência externa única;
- moeda;
- situação: `pending`, `fulfilled` ou `cancelled`;
- data da compra ou entrega;
- kit logístico associado, quando houver;
- usuário responsável pela operação manual.

Criar linhas da aquisição, por exemplo `tag_acquisition_lines`, com:

- produto do catálogo;
- quantidade;
- subtotal líquido;
- custo unitário calculado;
- SKU externo, quando houver.

Criar a associação das unidades, por exemplo `tag_acquisition_units`, com:

- linha da aquisição;
- peça física;
- custo da unidade em centavos;
- data de atribuição;
- eventual devolução ou invalidação;
- origem e justificativa de qualquer ajuste.

O kit continua representando a entrega e o agrupamento logístico. A aquisição passa a representar a operação econômica. Uma entrega manual pode criar os dois registros em conjunto.

### 4.4 Associação entre venda e peças

Criar uma tabela de vínculo, por exemplo `sales_sale_tags`, com:

- venda;
- item da venda;
- peça física;
- aquisição que forneceu o custo, quando aplicável;
- custo congelado da unidade;
- situação do vínculo;
- data de criação, cancelamento ou devolução.

Deve existir no máximo um vínculo comercial ativo por peça. O histórico de vínculos anteriores continua disponível.

### 4.5 Valores líquidos por item

Hoje o lucro não pode depender apenas de preço unitário menos custo quando existe desconto no total da venda. A criação da venda deverá distribuir o desconto entre os itens e congelar:

- valor bruto do item;
- desconto alocado;
- valor líquido do item;
- custo total congelado;
- lucro bruto.

A soma dos valores líquidos dos itens deve ser exatamente igual ao total líquido da venda, inclusive quando o arredondamento em centavos não divide perfeitamente.

### 4.6 Origem e idempotência

A venda deverá guardar sua origem, como `tags`, `visit`, `lead`, `sales` ou `voice`. Operações de celular e integrações deverão aceitar uma chave de idempotência para impedir vendas ou aquisições duplicadas após reenvio.

---

## 5. Regra de custo e lucro

Para cada peça vendida:

1. Se a política do vendedor é `zero`, o custo é zero.
2. Se a política é `acquisition`, buscar a aquisição ativa daquela unidade.
3. Se existe custo personalizado auditado, usar esse custo.
4. Se o custo não existe, nunca assumir zero silenciosamente.
5. Um gerente pode resolver a pendência com uma correção justificada.
6. O custo encontrado é congelado no vínculo da peça e no item financeiro.

Para novas vendas online de parceiros, custo ausente deve impedir a confirmação até que a aquisição seja informada. Em importações legadas ou operação offline, a venda pode ser registrada como **margem pendente**, mas fica fora dos totais de lucro até a correção.

Fórmulas:

```text
receita líquida da peça = preço alocado - desconto alocado
lucro bruto da peça = receita líquida da peça - custo congelado da peça
lucro bruto da venda = soma dos lucros das peças e demais itens
```

O painel deverá distinguir:

- faturamento bruto;
- descontos;
- faturamento líquido;
- custo das mercadorias;
- lucro bruto;
- transações;
- peças vendidas;
- vendas com margem pendente.

O valor pago pelo parceiro na Stuscle representa o custo do parceiro. A receita de atacado recebida pelos donos é outra visão econômica e não deve ser misturada à venda varejista durante esta primeira entrega.

### Regra inicial para pedidos Stuscle

Na primeira versão, o custo unitário será o valor líquido da linha após descontos, dividido pela quantidade. Frete e impostos ficam fora do custo da peça. Uma futura regra de custo posto no estoque pode incorporá-los sem reescrever vendas passadas.

---

## 6. Integração com a Stuscle Wholesale

A integração atual valida o código do parceiro, mas ainda não informa ao Xpot o conteúdo do pedido. Será necessário adicionar um webhook ou uma importação autenticada de pedidos.

Contrato sugerido:

```http
POST /api/integrations/stuscle/wholesale/orders
Authorization: Bearer <segredo compartilhado>
```

Dados mínimos:

- identificador único do pedido;
- código de atacado ou identificador do parceiro;
- moeda e data;
- situação do pagamento;
- itens com SKU, quantidade, subtotal líquido e descontos;
- códigos das peças ou identificador do kit, se já conhecidos.

Comportamento:

- rejeitar parceiro inexistente ou inativo;
- usar o identificador do pedido para idempotência;
- validar moeda, valores e quantidades;
- criar aquisição pendente quando as peças ainda não foram separadas;
- concluir a aquisição somente depois de associar as unidades físicas;
- registrar cancelamento sem apagar o pedido original;
- manter um log de processamento sem expor o segredo.

Se a Stuscle não conseguir enviar webhook inicialmente, o mesmo contrato pode ser alimentado por uma importação administrativa. A modelagem não deve depender do meio de chegada.

---

## 7. Serviço único de venda

Todas as entradas de venda — Tags, visita, cliente, tela de Vendas e voz — devem chamar um único serviço transacional.

Esse serviço deve:

1. validar vendedor, cliente, visita e permissões;
2. verificar que as peças pertencem ao estoque disponível do vendedor;
3. resolver produto, preço e custo de cada unidade;
4. distribuir descontos em centavos;
5. criar venda, itens e vínculos das peças na mesma transação;
6. impedir vínculos ativos duplicados;
7. registrar eventos de auditoria;
8. enfileirar a sincronização com o CRM dentro da mesma transação;
9. responder com a venda completa.

Contrato sugerido para a experiência de Tags:

```http
POST /api/xpot/tag-sales
Idempotency-Key: <uuid>
```

Corpo conceitual:

```json
{
  "leadId": "cliente",
  "visitId": "visita-opcional",
  "soldAt": "data-opcional",
  "discountCents": 0,
  "paymentMethod": "cash",
  "lines": [
    {
      "salesProductId": "produto",
      "tagIds": ["peca-1", "peca-2"],
      "unitPriceCents": 3000
    }
  ],
  "notes": "opcional"
}
```

Erros devem seguir um formato único com `code`, `message`, `details` e `requestId`. Conflito de peça já vendida, custo ausente, estoque de outro parceiro e chave idempotente com corpo diferente precisam ter códigos próprios.

---

## 8. Experiência de uso

### 8.1 Tags

Adicionar a ação **Vender peças**:

- leitura de QR/NFC ou seleção na lista;
- carrinho com várias unidades;
- agrupamento por produto;
- cliente obrigatório;
- preço sugerido pelo catálogo, mas editável conforme permissão;
- desconto e forma de pagamento;
- indicação de visita ativa;
- resumo de receita e, para parceiros, custo e margem próprios;
- confirmação única;
- comprovante com link para a venda.

Na lista e no detalhe da peça, mostrar:

- selo **Vendida** derivado da venda válida;
- data, cliente e valor;
- link para a venda;
- custo e margem somente para quem tem permissão.

### 8.2 Vendas

No detalhe da venda, mostrar:

- origem **Tags**;
- modelos e códigos das peças;
- quantidade de unidades;
- receita líquida, custo e lucro;
- visita relacionada;
- histórico de cancelamento ou devolução.

Os relatórios devem permitir filtrar por origem, parceiro, produto físico e período.

### 8.3 Visitas e clientes

- A visita ativa sugere o cliente e recebe a venda automaticamente.
- O detalhe do cliente reúne vendas, peças compradas e visitas.
- O painel da visita conta a transação uma vez e as peças pela quantidade real.

### 8.4 Gestão de parceiros e estoque

Adicionar à gestão:

- política comercial `Custo zero` ou `Custo por aquisição`;
- caixa de entrada de pedidos Stuscle;
- separação dos pedidos em peças físicas;
- entrega manual com custo personalizado;
- fila de custo ausente;
- fila de vendas antigas a reconciliar;
- relatório por parceiro.

Um parceiro vê apenas seus próprios custos e margens. Gerentes e administradores podem ver toda a operação. Termos de atacado de um parceiro nunca aparecem para outro.

---

## 9. Migração e reconciliação

A implementação deverá usar uma nova migração posterior às migrações já pendentes no repositório. Ela não deve alterar nem substituir o trabalho atual de expansão dos modelos físicos.

Estratégia:

1. adicionar estruturas novas sem remover campos antigos;
2. classificar explicitamente a política comercial das pessoas existentes;
3. associar lotes e peças aos produtos do catálogo;
4. preencher custo zero apenas para estoque próprio confirmado;
5. marcar peças de parceiro sem aquisição conhecida como **custo ausente**;
6. identificar peças com data de venda, mas sem venda financeira;
7. criar uma fila de reconciliação, sem inventar preço ou forma de pagamento;
8. sugerir correspondências por cliente, vendedor, data e produto, exigindo confirmação;
9. depois da validação operacional, trocar as telas para a nova fonte de verdade.

Para as duas peças citadas como caso real, a regularização deverá permitir criar uma única venda retroativa, escolher o cliente e o valor total, e associar as duas unidades exatas.

---

## 10. Fases de execução

### Fase 0 — Fechar invariantes e configuração

**Entrega:** decisões codificadas e configuração comercial disponível.

- criar os enums e validadores compartilhados;
- adicionar política comercial ao vendedor;
- criar a tela administrativa para classificação;
- definir a associação entre modelo físico e produto vendável;
- documentar as regras de permissão.

**Aceite:** toda pessoa que vende Tags tem uma política explícita; nenhuma regra usa papel de acesso como substituto.

### Fase 1 — Aquisição e custo por unidade

**Entrega:** livro de aquisições e entrega manual.

- criar tabelas de aquisição, linhas e unidades;
- ligar aquisições a kits sem fundir os dois conceitos;
- implementar entrega presencial com custo personalizado;
- implementar resolução de custo e auditoria de ajustes;
- criar a fila de custo ausente.

**Aceite:** uma peça entregue a um parceiro possui origem e custo consultáveis; estoque próprio resolve custo zero.

### Fase 2 — Entrada de pedidos Stuscle

**Entrega:** pedidos de atacado criam aquisições idempotentes.

- definir e validar o contrato do webhook/importação;
- autenticar com segredo rotacionável;
- mapear SKU para produto;
- receber cancelamentos;
- criar a separação de peças para pedidos pendentes;
- instrumentar falhas e reprocessamento.

**Aceite:** reenviar o mesmo pedido não duplica estoque nem custo; um pedido pode ser recebido antes dos códigos físicos.

### Fase 3 — Núcleo financeiro da venda de peças

**Entrega:** serviço transacional único e vínculo exato com peças.

- criar o vínculo entre item de venda e peça;
- implementar idempotência;
- corrigir alocação de desconto e lucro líquido por item;
- congelar custo por unidade;
- centralizar criação da venda;
- criar evento transacional para sincronização com CRM;
- implementar cancelamento, devolução e revenda.

**Aceite:** uma falha em qualquer etapa não deixa venda parcial; a mesma peça não pode estar em duas vendas ativas.

### Fase 4 — Fluxo de venda em Tags

**Entrega:** experiência completa para vender uma ou várias peças.

- construir seleção, scanner e carrinho;
- integrar cliente, visita, preço e pagamento;
- exibir custo e margem conforme permissão;
- adicionar confirmação e comprovante;
- mostrar venda no detalhe da peça e a peça no detalhe da venda.

**Aceite:** o caso de duas plaquinhas é concluído em uma venda, sem cadastro duplicado e com todos os vínculos navegáveis.

### Fase 5 — Reconciliação e relatórios

**Entrega:** histórico utilizável e indicadores corretos.

- criar ferramenta de regularização das vendas antigas;
- adicionar métricas de transações e unidades;
- separar receita bruta, descontos, custo e lucro;
- excluir margens pendentes dos totais de lucro;
- adicionar filtros por parceiro, produto e origem;
- consolidar a exibição em visitas e clientes.

**Aceite:** os totais fecham com os itens e peças; nenhum registro antigo recebe preço ou custo inventado.

### Fase 6 — Consolidação e lançamento

**Entrega:** migração segura para a nova fonte de verdade.

- fazer voz e demais entradas usarem o serviço único;
- validar a sincronização com Xphere e integrações legadas;
- lançar por feature flag, primeiro para administradores;
- acompanhar erros, duplicidades, custo ausente e divergências;
- habilitar parceiros gradualmente;
- retirar cálculos e fluxos antigos somente após estabilização.

**Aceite:** não há criação de venda fora do serviço central; o recurso pode ser desativado sem perder os registros já gravados.

---

## 11. Plano de testes

### Regras unitárias

- política `zero` sempre resulta em custo zero para peças;
- política `acquisition` usa o custo da unidade correta;
- custo personalizado tem precedência auditada;
- custo ausente nunca vira zero implicitamente;
- desconto é distribuído sem perder ou criar centavos;
- lucro usa receita líquida e custo congelado.

### Integração

- venda própria com uma e várias peças;
- parceiro com pedido Stuscle;
- parceiro com entrega presencial personalizada;
- duas peças iguais com custos diferentes;
- reenvio da mesma venda e do mesmo pedido;
- tentativa de vender peça de outro parceiro;
- rollback completo quando uma unidade falha;
- cancelamento, devolução e revenda;
- vínculo automático com visita;
- criação do evento de CRM na mesma transação;
- pedido Stuscle recebido antes da separação física.

### Interface

- fluxo por scanner e por seleção;
- venda com duas peças;
- estados de carregamento, conflito e repetição após perda de conexão;
- custo e margem escondidos para usuários sem permissão;
- acessibilidade por teclado, leitor de tela e telas pequenas;
- textos equivalentes em português, inglês e espanhol.

### Migração

- banco novo;
- base existente com peças próprias;
- base existente com parceiros e custo desconhecido;
- peças com `soldAt` sem venda financeira;
- compatibilidade com a migração pendente dos modelos físicos.

---

## 12. Observabilidade e auditoria

Registrar métricas e alertas para:

- falhas do webhook Stuscle;
- pedidos duplicados ou divergentes;
- aquisições aguardando separação;
- peças com custo ausente;
- conflito de peça já vendida;
- falha de sincronização com CRM;
- diferença entre total da venda e soma dos itens;
- tentativas de acesso ao custo de outro parceiro.

Toda mudança manual de custo precisa manter valor anterior, novo valor, autor, data e motivo. Dados sensíveis e segredos de integração não devem aparecer em logs.

---

## 13. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Confundir papel de acesso com modelo comercial | Campo explícito de política de custo e classificação administrativa |
| Stuscle ainda não enviar os códigos físicos | Aquisição pendente seguida de separação no Xpot |
| Duplicidade por conexão móvel ou reenvio de webhook | Chaves de idempotência e restrições únicas |
| Desconto produzir lucro incorreto | Alocação e congelamento do valor líquido por item |
| Parceiro vender peça de outro estoque | Validação de posse dentro da transação |
| Histórico antigo sem preço ou custo confiável | Fila de reconciliação; nunca inventar valores |
| Exposição de condição de atacado | Escopo por parceiro e autorização no servidor |
| Migração conflitar com novos modelos de peça | Criar a próxima migração somente depois da pendente e manter campos aditivos |

---

## 14. Fora do escopo inicial

- processar pagamento ou estorno bancário dentro do Xpot;
- emitir nota fiscal;
- calcular comissão, imposto ou custo de frete no lucro;
- contabilizar a receita de atacado dos donos junto com a venda varejista do parceiro;
- substituir a Stuscle como loja;
- transformar ativação da peça em venda automática.

Esses itens podem ser adicionados depois sem mudar o vínculo fundamental entre aquisição, peça e venda.

---

## 15. Definição de pronto

O trabalho estará concluído quando:

- uma venda de duas plaquinhas puder ser registrada uma única vez;
- cada unidade física estiver ligada ao item financeiro e ao cliente;
- a venda aparecer em Tags, Vendas e, quando houver, na visita;
- vendas próprias usarem custo zero;
- parceiros usarem custo da Stuscle ou custo personalizado da entrega;
- desconto, custo e lucro fecharem em centavos;
- não houver duplicidade em reenvios;
- devoluções e revendas preservarem histórico;
- dados antigos puderem ser regularizados sem valores inventados;
- permissões impedirem acesso ao custo de outros parceiros;
- testes automatizados cobrirem os fluxos e regras acima.
