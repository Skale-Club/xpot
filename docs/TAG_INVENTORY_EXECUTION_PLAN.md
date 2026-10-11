# Plano de execução: cadastro e estoque de plaquinhas NFC

**Status:** proposto em outubro de 2026  
**Público:** produto, engenharia e operação  
**Objetivo:** permitir que a equipe receba fisicamente as plaquinhas, abra um lote no Xpot e escaneie cada unidade para colocá-la no estoque.

---

## 1. Regra central

O Xpot não controla o pedido feito à China, a quantidade enviada ou a quantidade que chegou dentro da caixa.

Para o Xpot:

- um lote novo começa vazio;
- uma plaquinha não existe no sistema antes de ser escaneada;
- cada leitura válida cadastra uma unidade no lote e no estoque;
- a quantidade do lote é sempre a quantidade de unidades cadastradas nele;
- não existe quantidade esperada, faltante ou pendente de escaneamento;
- fechar o lote apenas impede novas inclusões; não compara o lote com uma quantidade externa.

Exemplo: se a operação escanear 73 plaquinhas, o lote possui 73 unidades e o estoque aumenta em 73. O Xpot não presume que existam outras 27.

---

## 2. Fluxo operacional

### 2.1 Abrir o lote

Quando as plaquinhas estiverem fisicamente em mãos, o operador abre **Tags → Lotes → Novo lote** e informa:

- nome ou referência interna;
- tipo/modelo da plaquinha;
- fornecedor opcional;
- face/layout opcional;
- produto de venda relacionado;
- observação opcional.

O lote é criado com status `open` e quantidade zero. Não são gerados códigos nem linhas em `tags` nessa etapa.

### 2.2 Escanear as plaquinhas

Dentro do lote, o operador toca em **Adicionar por leitura** e escaneia uma peça por vez.

Para cada leitura, o Xpot:

1. recebe o conteúdo bruto do QR, link ou identificador;
2. normaliza o código da peça;
3. verifica se a unidade já foi cadastrada;
4. cria a linha em `tags` vinculada ao lote;
5. coloca a unidade no estoque da empresa;
6. registra quem escaneou e quando;
7. atualiza a contagem exibida do lote.

A tela permanece aberta para a próxima leitura e mostra o total acumulado em tempo real.

### 2.3 Encerrar o lote

Quando terminar de escanear, o operador toca em **Fechar lote**.

- o lote passa para `closed`;
- sua quantidade final é o número de unidades cadastradas;
- nenhuma conferência contra pedido ou nota externa é exigida;
- um gerente pode reabrir o lote, com motivo registrado, se novas peças precisarem ser incluídas.

### 2.4 Destinos posteriores

Depois de cadastrada, a unidade pode:

- permanecer no estoque da empresa;
- ser entregue a um representante;
- ser vendida diretamente;
- ser utilizada internamente;
- ser marcada como danificada ou perdida;
- ser ativada para um cliente.

---

## 3. Diagnóstico do Xpot atual

O sistema já possui lotes, unidades físicas, códigos públicos, kits para representantes, vendas ligadas às peças, ativação, provisionamento NFC, organizações e histórico.

O problema está na criação do lote. Atualmente, `createBatch` recebe uma quantidade, gera os códigos e cria todas as unidades imediatamente como `inventory`. Assim, o lote precisa conhecer as peças antes de elas serem escaneadas.

O novo fluxo inverte essa lógica:

`criar lote vazio → escanear peça → cadastrar unidade → entrar no estoque`

---

## 4. Decisões de produto

### 4.1 A quantidade é derivada

O formulário não terá campo obrigatório de quantidade. A fonte da verdade será:

`quantidade do lote = COUNT(tags WHERE batch_id = lote)`

O campo atual `tag_batches.quantity` deverá ser removido, tornado opcional para compatibilidade ou mantido apenas como cache atualizado pelo servidor. Ele nunca poderá ser informado manualmente como saldo de estoque.

### 4.2 O lote é um agrupador de entrada

O lote identifica o conjunto de peças cadastrado junto. Ele não representa pedido de compra, transporte ou nota fiscal.

Estados necessários:

- `open`: aceita novas leituras;
- `closed`: entrada concluída;
- `cancelled`: lote vazio cancelado administrativamente.

Estados legados podem continuar sendo lidos durante a migração, mas a interface nova não deve oferecer transições de fabricação ou transporte.

### 4.3 A leitura cria a unidade

Uma unidade somente entra em `tags` depois de uma leitura válida. Não haverá:

- unidades anônimas;
- linhas reservadas previamente;
- geração antecipada de QR;
- estoque esperado ou em trânsito;
- diferença automática entre pedido e lote.

### 4.4 Leitura duplicada não duplica estoque

O código público continua único no banco. Se a mesma peça for lida novamente:

- no mesmo lote, a interface informa “já adicionada” e mantém o total;
- em outro lote, informa em qual lote ela já está;
- requisições repetidas por falha de rede retornam o mesmo resultado, sem nova linha.

### 4.5 Cadastro, venda e ativação são eventos distintos

- **Cadastro:** a peça passa a existir no Xpot e fica disponível.
- **Venda:** registra a transferência comercial.
- **Ativação:** configura o destino do QR/NFC.
- **Leitura pública:** uso posterior da peça pelo cliente.

Escanear para entrada no lote não ativa a plaquinha para um cliente.

### 4.6 Estoque e estado digital permanecem separados

O atual `tags.status` continua descrevendo o ciclo digital: `inventory`, `assigned`, `active`, `disabled` e `retired`.

Adicionar um estado físico independente: `available`, `reserved`, `internal_use`, `sold`, `damaged`, `lost` ou `retired`.

Isso permite que uma peça esteja fisicamente com um representante, continue disponível para venda e ainda não esteja ativada.

---

## 5. Modelo de dados

### 5.1 `tag_batches`

Manter ID, código do lote, nome, modelo/produto, face/layout, fornecedor, observação, criador e datas.

Alterar:

- status para `open`, `closed` ou `cancelled`;
- quantidade para valor derivado;
- adicionar dados de fechamento e reabertura com ator, data e motivo.

### 5.2 `tags`

Cada leitura aceita cria uma linha com:

- lote aberto;
- código público normalizado;
- número sequencial dentro do lote;
- tipo e produto herdados do lote;
- organização e localização da empresa;
- estado digital inicial `inventory`;
- estado físico inicial `available`;
- usuário e instante do cadastro;
- conteúdo bruto escaneado para auditoria, quando seguro.

Adicionar `stock_status`, `current_location_id`, `ownership_type`, `custodian_rep_id`, `registered_at`, `registered_by_user_id` e `stock_updated_at`.

### 5.3 `tag_locations`

Criar localizações para estoque principal, representantes, uso interno e futuras áreas físicas. `organization_id` permanece como limite de acesso e não substitui localização.

### 5.4 `tag_stock_movements`

Criar histórico imutável contendo peça, tipo de movimento, estado/localização/custodiante antes e depois, documento de origem, ator, data, motivo e chave de idempotência.

A primeira movimentação será `intake`, criada pelo escaneamento. As seguintes podem ser `transfer`, `return`, `reserve`, `release`, `sale`, `internal_use`, `damage`, `loss`, `restore`, `retire` ou `adjustment`.

---

## 6. Serviço de entrada

Criar um serviço transacional único, por exemplo `server/tags/intake.ts`, recebendo lote, conteúdo bruto escaneado, ator e chave de idempotência do dispositivo.

Dentro de uma transação, o serviço deverá:

1. bloquear e validar o lote aberto;
2. normalizar e validar o conteúdo lido;
3. procurar uma unidade existente pelo código único;
4. retornar resultado idempotente ou conflito de outro lote;
5. calcular o próximo número sequencial com segurança concorrente;
6. criar a `tag`;
7. criar o movimento inicial `intake`;
8. registrar a jornada administrativa;
9. retornar a unidade e a nova contagem do lote.

Nenhuma rota deverá criar estoque contornando esse serviço.

---

## 7. APIs propostas

### Lotes

- `POST /api/xpot/tags/batches` — cria lote vazio;
- `GET /api/xpot/tags/batches/:id` — retorna lote e contagem derivada;
- `POST /api/xpot/tags/batches/:id/close` — fecha o lote;
- `POST /api/xpot/tags/batches/:id/reopen` — reabre com motivo;
- `POST /api/xpot/tags/batches/:id/cancel` — cancela lote vazio.

### Entrada por leitura

- `POST /api/xpot/tags/batches/:id/scan` — valida a leitura, cria a unidade e registra a entrada;
- `GET /api/xpot/tags/batches/:id/tags` — lista as unidades já adicionadas;
- `DELETE /api/xpot/tags/batches/:id/tags/:tagId` — desfaz erro antes de movimentações posteriores, sempre com auditoria.

A rota aceita conteúdo bruto. A normalização do QR/link fica no servidor para que celular, scanner e futuro MCP usem a mesma regra.

---

## 8. Interface

### 8.1 Lista e criação de lotes

Mostrar nome, código, modelo, fornecedor opcional, status, quantidade cadastrada, data e responsável. Não mostrar quantidade esperada, enviada ou faltante.

O formulário atual deve remover quantidade e geração automática de unidades. Ao salvar, abre diretamente a tela de leitura.

### 8.2 Tela de leitura

Otimizada para celular:

- câmera/scanner pronto para a próxima peça;
- digitação manual como alternativa;
- total do lote em destaque;
- última peça e leituras recentes;
- som, vibração e confirmação visual;
- alertas distintos para duplicada, inválida e pertencente a outro lote;
- repetição idempotente após perda de conexão;
- botão **Fechar lote**.

Exemplo: `Lote OUT-2026-10 — 73 peças cadastradas`. Esse número significa somente o que já foi lido.

### 8.3 Detalhe da peça

Mostrar lote de entrada, quem cadastrou, data, localização, custodiante e históricos físico e digital.

---

## 9. Distribuição depois da entrada

### Representante

- entregar somente unidades `available`;
- registrar consignação ou atacado;
- alterar localização/custódia por movimento;
- devolver pelo movimento inverso.

### Venda

- selecionar somente unidades cadastradas e disponíveis;
- registrar `sale` junto da venda financeira;
- impedir duas vendas da mesma peça.

### Uso próprio

- mover para `internal_use`;
- informar finalidade e responsável opcional;
- não criar venda ou cliente falso;
- permitir retorno ao estoque.

---

## 10. Plano de implementação

### Fase 1 — Lote vazio e entrada por leitura

**Entregas**

- migrar lote para `open`, `closed`, `cancelled`;
- remover quantidade do comando de criação;
- parar de gerar unidades em `createBatch`;
- calcular quantidade pelas unidades vinculadas;
- criar serviço e rota idempotente de leitura;
- criar tela móvel de escaneamento;
- fechar e reabrir lote com auditoria.

**Aceite**

- criar lote resulta em zero unidades;
- cada leitura inédita aumenta lote e estoque em um;
- leitura duplicada não altera a contagem;
- fechar o lote impede novas leituras;
- nenhuma quantidade não escaneada aparece no sistema.

### Fase 2 — Estado físico e movimentações

**Entregas**

- criar localizações e razão de movimentações;
- adicionar estado físico às peças;
- gerar `intake` em toda nova leitura;
- fazer backfill das peças existentes;
- centralizar transferências no serviço de inventário.

**Aceite**

- toda unidade possui localização e estado atuais;
- todo saldo é explicável por movimentos;
- peças existentes continuam funcionando.

### Fase 3 — Representantes, venda e uso interno

Adaptar kits, atacado, devoluções, venda financeira e uso interno. Diferenciar consignação de venda ao representante e impedir saída de unidades indisponíveis.

### Fase 4 — Relatórios e operação

Adicionar inventário por lote/localização/representante/estado, histórico por unidade, contagem física, ajuste auditado e métricas de leituras inválidas ou duplicadas.

---

## 11. Migração dos dados atuais

- preservar códigos, links e vínculos existentes;
- recalcular a quantidade de cada lote pelas peças vinculadas;
- mapear lotes finalizados para `closed`;
- criar localização e movimento inicial de migração para cada peça;
- manter exportação de fabricação apenas para lotes legados;
- listar códigos duplicados ou peças sem lote para decisão humana.

---

## 12. Testes obrigatórios

### Entrada

- lote começa vazio;
- leitura válida cria exatamente uma unidade;
- leitura repetida no mesmo ou em outro lote;
- duas requisições concorrentes para a mesma peça;
- lote fechado ou cancelado;
- conteúdo inválido;
- repetição idempotente após perda de conexão;
- sequência correta sob concorrência.

### Não regressão

- QR/NFC público continua redirecionando;
- ativação continua independente do cadastro;
- kits e vendas existentes continuam funcionando;
- custo do representante permanece correto;
- isolamento entre organizações permanece intacto.

---

## 13. MCP

O MCP poderá consultar lotes, listar unidades e informar saldos. Uma futura ferramenta de entrada deverá chamar o mesmo serviço de escaneamento e exigir lote, ator e chave de idempotência.

---

## 14. Resultado da primeira entrega

1. as peças chegam fisicamente;
2. o operador abre um lote vazio;
3. escaneia uma por uma;
4. cada leitura cria uma unidade no lote e no estoque;
5. a contagem do lote é o número exato de leituras aceitas;
6. o operador fecha o lote.

Essa é a única fonte de verdade para a entrada inicial das plaquinhas no Xpot.
