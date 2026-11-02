# Evidências dos pedidos do cliente

Pesquisa realizada em 2 de novembro de 2026, horário America/New_York. Código executado: `27856c4`. Ver [PESQUISA.md](PESQUISA.md) e [PLANO.md](PLANO.md).

## Ambiente e isolamento

Foi criada uma cópia do código em `C:/Users/Vanildo/Dev/xpot/.lab/customer-orders/runtime`, a partir de `git archive simplify/r3-decisions`, quando a branch apontava para `27856c4`. O código do produto dessa cópia não recebeu a implementação proposta nem as alterações da R3. Na revisão final, a branch já avançara a `bc3b685`; esses commits foram lidos e incorporados à pesquisa/plano, sem alegar execução dessa versão.

O banco-base fictício `postgres` foi clonado para `lab_customer_orders_20261102`, no Postgres local, porta 55432. O banco-base começou com 152 peças, 13 vendedores, 41 empresas, 21 vendas, 45 modelos e nove sessões. Nenhum banco de outra frente foi apagado ou teve sessões encerradas para obter essa cópia. A tentativa de clonar `lab_r1` foi abandonada porque havia uma sessão usando aquele banco.

Os dados-base foram salvos fora da pasta temporária, em `.lab/customer-orders/backup/rows.json`, com 68 tabelas. Código e scripts também foram preservados nessa pasta de pesquisa. É um snapshot lógico de dados de teste; não é um dump físico do cluster. Os binários/serviço Postgres continuam sendo os locais existentes. O `pg_dump` instalado era versão 17 e não serviu para o servidor 18, portanto não é apresentado como backup concluído. O snapshot JSON é o backup efetivamente produzido.

O servidor usou a porta 2210, chaves fictícias e uma chave de sessão nova. Não foi copiada nenhuma chave real do `.env`. Foram criadas sessões novas para os usuários fictícios clonados. O inicializador local usou o app real, sem iniciar os workers de prospecção ou notificações; chamadas `fetch` externas foram bloqueadas. Navegador ficou limitado a loopback e teve escritas da API bloqueadas. As mutações descritas abaixo vieram do script CLI, pela API local.

A revisão automática recusou a primeira versão da preparação por incluir cópia de uma chave do Supabase. O script foi corrigido para não ler aquele `.env`, usando valores fictícios. Não há aprovação pendente por esse motivo.

As integrações do banco fictício foram desativadas na cópia; nenhuma mensagem real, compra na Stuscle, upload real, impressão, leitura NFC ou entrega física foi realizada. O endereço `example.com/menu` foi apenas destino fictício, não acessado como parte dos ensaios.

### Dados preparados para os casos

- Vendedor fictício Kevin Brooks, id 6, política `zero`; habilitei Visitas além de Tags somente na cópia, para ensaiar as duas portas com a mesma identidade.
- Duas peças já disponíveis e sem cliente desse vendedor receberam face `menu` e rótulo de laboratório. Não as apresento como objetos físicos conferidos ou como prova de um desenho real branco.
- Restaurante fictício id 42; customizada fictícia id 43. Valores de US$ 20 por unidade, US$ 60 recebidos e US$ 75 pela customizada foram escolhidos para os ensaios, sem definir preços comerciais.
- Uma terceira peça fictícia do vendedor Jessica, id 5, foi marcada `reserved` diretamente no banco isolado para testar as garantias desse estado. Isso é preparação de fixture, não um fluxo existente de reservar para pedido.

O clone estava três migrações atrás do código: 0072, 0073 e 0074. A primeira criação de produção deu 500 por falta de `replaces_job_id`. Depois de aplicar as três migrações existentes somente à cópia, a mesma operação funcionou. E10 registra o erro de preparação; E11 registra o ensaio válido. Não classificar E10 como falha funcional de pedidos de cliente.

## Casos executados

O [EVIDENCIAS.json](evidencias/EVIDENCIAS.json) contém E01 a E31, com método, caminho, ator fictício, resposta HTTP e identificadores. Não inclui cookies, chave de sessão ou credenciais. Respostas integrais e scripts permanecem na pasta local ignorada.

| Caso | Passos efetivamente executados | Resultado observado |
|---|---|---|
| Restaurante, alternativa sem entidade nova | Criar cliente; vender dez por US$ 200 com US$ 60 pagos; ativar duas peças; consultar vendas compatíveis e vinculá-las; criar tarefa para oito; pedir oito à produção | Venda 22 concluída, linha 33 de quantidade dez, duas peças vinculadas. Tarefa 17 e produção em duas impressões de quatro, cliente apenas na nota. E01–E11 |
| Cancelar com valor recebido | Cancelar venda 22 e consultar o registro | Situação cancelada, `paid_cents=6000` e pagamento parcial preservados. Nenhum reembolso ou crédito automático. E12 e snapshot |
| Venda das duas unidades entregues | Vender as mesmas duas restauradas, via Tags, escolhendo não pago | Venda 23 de US$ 40. Oito restantes continuaram na tarefa e produção independentes. E13 |
| Repetição da entrega | Reenviar o mesmo corpo e chave; depois usar outra chave | Mesma chave devolveu venda 23 com `replayed`; outra chave deu 409 `tag_already_sold`. E14–E15 |
| Cobrança comercial duplicada por outra porta | Depois da venda por peças, registrar também venda genérica de duas unidades | Outra venda de US$ 40 foi aceita. Snapshot: US$ 40 `tags` + US$ 40 `sales`. Cancelei a duplicata 24. E17–E18 |
| Oito que ainda não existem | Tentar venda de Tags com lista de códigos vazia | HTTP 400, sem registrar promessa das oito. E16 |
| Customizada | Criar cliente, tentar vender sem código, criar tarefa de arte, cadastrar modelo sem versão e pedir uma peça | Venda de Tags recusada por códigos vazios; modelo cadastrado; produção recusada com 409 `print_model_design_needed`. E19–E23 |
| “Resolver” customizada por venda livre | Registrar US$ 75 sem produto de catálogo e sem arte | Aceitou venda 25 concluída; cliente mostra valor vendido, mas não progresso da arte. E24 |
| Negócio ganho | Criar negócio 8 e marcá-lo ganho | Operação aceita sem criar novo pedido de impressão; o único pedido interno do ensaio continuou sendo o das oito peças do restaurante. E25–E26 e snapshot |
| Reserva | Na peça preparada como `reserved`, receber, recolher, vender, configurar e consultar | Três recusas 409; configuração rápida 200, ativa e ainda reservada; listagem confirma. E27–E31 |
| Custo no perfil simples | Examinar resposta da venda de Tags ao vendedor do ensaio | Item continha `unitCostCents`. A retirada de custo aplicada a Vendas não cobriu essa porta de Tags. E13 |

Não fiz teste concorrente novo das APIs atuais. As repetições acima foram sequenciais. A concorrência da futura separação/entrega continua como aceitação obrigatória no plano.

## Telas abertas

Foram capturadas e abertas **16 imagens**, oito no computador e oito no celular, todas em português. Não fiz uma auditoria geral de todos os perfis ou dos três idiomas. Capturas são da aplicação existente com dados fictícios, não mockups da proposta.

| Tela / estado | Computador | Celular | O que foi visto |
|---|---|---|---|
| Venda antecipada de dez | [Imagem](evidencias/simple-restaurant-sale-desktop.png) | [Imagem](evidencias/simple-restaurant-sale-phone.png) | US$ 200, US$ 60 recebidos, dez itens e apenas dois códigos; sem saldo de entrega. Detalhe fica cortado horizontalmente a 390 px |
| Cliente do restaurante | [Imagem](evidencias/simple-restaurant-customer-desktop.png) | [Imagem](evidencias/simple-restaurant-customer-phone.png) | “Vendido aqui” US$ 200, duas peças no ar; nada informa oito devidas |
| Tarefa dos oito | [Imagem](evidencias/simple-restaurant-task-desktop.png) | [Imagem](evidencias/simple-restaurant-task-phone.png) | Quantidades só no texto da tarefa |
| Produção das oito | [Imagem](evidencias/simple-production-desktop.png) | [Imagem](evidencias/simple-production-phone.png) | Oito peças em duas impressões; restaurante na nota, que é truncada no celular, sem vínculo de pedido de cliente |
| Venda apenas das duas | [Imagem](evidencias/final-delivered-sale-desktop.png) | [Imagem](evidencias/final-delivered-sale-phone.png) | US$ 40 e dois códigos; histórico preserva as vendas canceladas. Sem promessa estruturada das oito |
| Cliente da customizada | [Imagem](evidencias/final-custom-customer-desktop.png) | [Imagem](evidencias/final-custom-customer-phone.png) | US$ 75 vendidos, sem peça ou progresso de arte |
| Modelo customizado sem versão | [Imagem](evidencias/final-custom-model-desktop.png) | [Imagem](evidencias/final-custom-model-phone.png) | “Sem desenho” e ação para primeira versão; não mostra a ligação ao cliente |
| Duas tarefas pendentes | [Imagem](evidencias/final-custom-tasks-desktop.png) | [Imagem](evidencias/final-custom-tasks-phone.png) | Arte e oito peças aparecem como tarefas livres; o texto longo perde informação no celular |

Não confirmei ações de negócio pelo navegador: o brief manda operar Xpot por MCP/API/CLI. As ações e seus resultados foram exercitados pela API, inclusive cancelamento e reenvio. Não houve alteração de UI que possa ser declarada aprovada visualmente.

## Checagens da base

As checagens dizem respeito ao código-base `27856c4`, sem a R3 não commitada e sem pedidos implementados. Foi usado banco de integração exclusivo, `lab_customer_orders_ci_20261102`, separado do banco dos casos.

| Comando | Resultado |
|---|---|
| `npm run check` | Exit 0 |
| `npm test` | 175 arquivos passaram, 23 pulados; 1.721 testes passaram, 23 pulados |
| `npm run build` | Exit 0; bundle e servidor gerados. Avisos de chunks grandes e depreciação do uso de shell no processo de build |
| Migração do banco de ensaio | 0072–0074 aplicadas; demais já existentes |
| Migração em banco novo de integração | 80 arquivos de migração aplicados |
| Integração conforme `.github/workflows/ci.yml` | 16 arquivos / 16 testes passaram com `TAGS_INTEGRATION=1` e `--no-file-parallelism` |

Playwright foi instalado para as capturas e depois preservado fora de `runtime/node_modules`. Em seguida, as dependências foram restauradas com `npm ci` e os quatro gates foram repetidos: todos com exit 0, Vitest 4.1.9 do lockfile. Os resultados finais estão em [VERIFICACAO.json](evidencias/VERIFICACAO.json), com logs integrais na pasta local ignorada. Isso distingue as versões transitórias da ferramenta de captura das versões usadas nas checagens finais.

Os registros de linha da pesquisa foram conferidos contra os arquivos do snapshot, e os arquivos/imagens ligados por estes documentos devem existir antes da entrega. Não foram executadas as etapas extras de Python e NFC provisioner do CI; a linha de integração e os três comandos pedidos no brief são o escopo desta checagem.

## Continuidade

Pasta local: `C:/Users/Vanildo/Dev/xpot/.lab/customer-orders`, ignorada pelo Git. Contém snapshot dos dados-base, cópia do código, scripts `prepare.mjs`, `experiment.mjs`, `capture.mjs`, `integration.mjs`, estado integral dos ensaios, logs e ferramenta de captura. O arquivo de preparação é específico desta execução, não um seed geral seguro para rodar novamente sobre dados já exercitados.

Para retomar, usar o banco exclusivo preservado, conferir migrações e subir o inicializador local `.lab/orders-boot.ts` na cópia. Criar sessão nova se expirada; não reutilizar credencial real. Capturas podem ser repetidas com `node .lab/customer-orders/capture.mjs simple` ou `final`, mas o estado financeiro já avançou: as imagens da venda 22 antes do cancelamento são evidência histórica, não serão recriadas só abrindo a mesma URL.

O servidor desta pesquisa foi encerrado ao entregar; os bancos locais e o snapshot foram preservados. Não deixar uma captura histórica parecer estado atual de produção. Nenhuma operação foi feita em `xpot.place`, e não foi verificado deploy nesta tarefa.
