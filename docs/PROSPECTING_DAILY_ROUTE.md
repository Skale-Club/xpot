# Prospecting | Rota diária e continuidade pós-visita

## Objetivo

Este documento define a próxima experiência do Prospecting no Xpot. Ele deve
servir como contrato de produto para design, frontend, backend e validação.

Ao terminar a implementação, um representante deve conseguir iniciar o dia,
responder poucas perguntas, receber uma rota pronta, executar visitas pelo
celular e registrar o resultado de cada visita sem abandonar o fluxo da rota.

As decisões deste documento foram consolidadas em 12 de outubro de 2026.

## Resultado esperado

O fluxo principal deve ser:

1. O representante informa o segmento que vai prospectar.
2. Informa a cidade ou região.
3. Informa o horário de início e quanto tempo vai trabalhar.
4. Confirma a geração de uma única rota para aquele dia.
5. O Xpot processa a rota em segundo plano e mostra uma estimativa de espera.
6. O representante pode sair da tela e recebe uma notificação quando a rota
   estiver pronta.
7. A rota pronta abre com o mapa no topo e a sequência de empresas abaixo.
8. Em cada empresa, o representante pode abrir a navegação ou iniciar o
   check-in diretamente.
9. Ao encerrar a visita, o Xpot abre um resumo pós-visita com a gravação de
   áudio em destaque, campos rápidos e criação de tarefas.
10. Ao salvar o resumo, o representante volta para a próxima parada.

## Regras imutáveis de produto

- Existe somente uma rota oficial por representante e por dia local da
  organização.
- A trava de uma rota por dia deve existir no servidor e no banco. Esconder o
  botão no frontend não é suficiente.
- A geração da rota é assíncrona e deve continuar mesmo que o usuário troque de
  tela, feche a aba ou recarregue o aplicativo.
- Uma tentativa duplicada causada por clique duplo ou repetição de rede nunca
  pode gerar uma segunda cobrança.
- Uma geração que chegou ao estado `ready` ocupa a cota diária. Uma geração que
  falhou não ocupa a cota e pode ser retomada ou repetida sem criar uma segunda
  rota do dia.
- O representante comum não pode recriar nem reotimizar a rota usando créditos.
- Somente o super admin pode recriar uma rota. A ação exige confirmação,
  motivo e registro de auditoria.
- Depois que a rota estiver pronta, os campos de planejamento deixam de ocupar
  a tela do representante.
- A tela da rota pronta começa pelo mapa, tanto no celular quanto no desktop.
- O check-in pode ser iniciado diretamente a partir da empresa listada na rota.
- GPS, raio permitido e demais regras de validação continuam sendo a autoridade
  para aceitar ou recusar o check-in.
- Encerrar uma visita sempre leva ao resumo pós-visita antes de continuar a
  rota.
- A gravação de áudio é a ação principal do resumo. A digitação continua
  disponível para quem preferir ou não puder gravar.
- Rota, visita ativa e rascunho do resumo devem sobreviver a troca de tela,
  recarregamento e reabertura do aplicativo.

## 1. Planejamento do dia

### Quando mostrar o planejamento

O assistente de planejamento aparece apenas quando o usuário ainda não possui
uma rota válida para o dia atual.

Se existir uma rota nos estados `queued`, `generating`, `ready`, `active` ou
`completed`, o Xpot deve levar o usuário para o estado correspondente. Ele não
deve voltar à primeira pergunta.

Se existir uma tentativa com falha, o usuário vê a falha e a opção segura de
tentar novamente. Essa repetição reutiliza o pedido do dia e não cria uma rota
paralela.

### Assistente de uma pergunta por vez

O planejamento deve usar divulgação progressiva. Cada etapa apresenta uma
pergunta, uma resposta principal e um único botão de avanço.

#### Etapa 1 | Segmento

Pergunta: **O que você vai prospectar hoje?**

- Campo com busca e sugestões, por exemplo barbearias, restaurantes e oficinas.
- Segmentos recentes e favoritos podem aparecer como atalhos.
- A escolha deve ser legível e editável antes da confirmação final.

#### Etapa 2 | Local

Pergunta: **Onde você vai prospectar?**

- Busca por cidade ou região com autocomplete.
- Atalhos para localização atual e locais usados recentemente.
- O resultado armazenado deve incluir identificador do local, nome exibido,
  coordenadas centrais e limites quando disponíveis.

#### Etapa 3 | Jornada

Pergunta: **Quando você começa e por quanto tempo vai trabalhar?**

- Horário de início.
- Duração planejada em horas e minutos.
- Horário estimado de término calculado e mostrado imediatamente.
- A duração deve considerar deslocamentos e o tempo médio de cada visita.

#### Etapa 4 | Revisão

A revisão mostra segmento, local, início, duração e término estimado.

O texto deve explicar que:

- será criada a rota do dia;
- a geração pode levar alguns minutos;
- o usuário poderá sair da tela;
- uma notificação será enviada quando a rota estiver pronta;
- somente o super admin poderá recriar a rota depois da confirmação.

O botão principal é **Gerar minha rota**. O frontend envia uma chave de
idempotência e bloqueia novos envios enquanto o pedido estiver em andamento.

### Persistência do planejamento

- Cada resposta é salva como rascunho.
- Voltar uma etapa não apaga as próximas respostas sem necessidade.
- Ao sair e retornar antes de confirmar, o assistente abre na última etapa
  incompleta.
- Nenhum crédito é consumido enquanto o usuário estiver apenas preenchendo o
  assistente.
- A interface mostra progresso, por exemplo `2 de 4`, sem transformar o fluxo
  em um formulário longo.

## 2. Geração assíncrona da rota

### Estados da rota

| Estado | Significado | Experiência do usuário |
|---|---|---|
| `draft` | O planejamento ainda não foi confirmado | Assistente na etapa salva |
| `queued` | Pedido aceito e aguardando processamento | Loading com estimativa inicial |
| `generating` | Descoberta, qualificação ou otimização em andamento | Loading com etapa atual |
| `ready` | Rota criada e disponível | Notificação e mapa no topo |
| `active` | Pelo menos uma parada foi iniciada | Mapa, progresso e próxima parada |
| `completed` | Todas as paradas foram resolvidas ou o dia foi encerrado | Resumo do dia |
| `failed` | Não foi possível concluir a geração | Motivo compreensível e nova tentativa segura |
| `superseded` | Uma versão anterior foi substituída pelo super admin | Somente histórico e auditoria |

### Tela de processamento

A tela de processamento permanece útil durante toda a espera. Ela deve mostrar:

- título claro, por exemplo **Estamos montando sua rota**;
- etapa atual: buscando empresas, qualificando opções, organizando paradas ou
  finalizando;
- janela estimada de conclusão ou horário estimado, sempre identificado como
  estimativa;
- mensagem de que o processamento continuará em segundo plano;
- ação secundária para voltar ao restante do Xpot;
- link para retornar ao status da rota.

Não deve existir uma porcentagem inventada. Se o backend não conseguir medir o
progresso real, a interface usa indicador indeterminado, etapas nomeadas e uma
janela de tempo estimada.

### Trabalho em segundo plano

- O servidor cria um job persistente antes de responder ao frontend.
- A resposta inicial é assíncrona e inclui identificadores da rota e do job,
  estado atual e horário estimado de conclusão.
- O job pode ser retomado após reinício do processo.
- A geração grava checkpoints suficientes para evitar repetir chamadas pagas
  que já foram concluídas.
- O frontend consulta o status com frequência moderada enquanto estiver aberto.
  A verdade continua sendo o estado persistido no servidor.

### Notificações

A notificação dentro do Xpot é obrigatória. A notificação do navegador ou do
sistema operacional é complementar e depende da permissão do usuário.

Quando a rota ficar pronta:

- criar uma notificação persistente dentro do Xpot;
- atualizar o badge de notificações;
- enviar Web Push quando houver inscrição e permissão válidas;
- abrir a rota correta ao tocar na notificação;
- mostrar um banner de conclusão se o usuário já estiver no aplicativo.

Quando a geração falhar, a notificação deve explicar que nenhum novo pedido do
dia foi consumido e levar para a tentativa segura.

## 3. Proteção de custo e permissões

### Uma rota por pessoa por dia

A identidade da rota diária é formada por:

- organização;
- representante;
- data no fuso da organização.

O banco deve impedir duas rotas oficiais para essa combinação. O servidor deve
responder com um erro de domínio previsível quando já existir uma rota diária,
e devolver a rota existente para que o cliente possa abri-la.

### Idempotência

- O pedido de geração exige uma chave de idempotência.
- Repetir a mesma chave devolve o mesmo job.
- Pedidos simultâneos para o mesmo representante e dia convergem para a mesma
  rota.
- A chamada paga e seu resultado têm identificadores de provedor registrados.

### Recriação por super admin

A ação **Recriar rota** aparece apenas para super admins e deve solicitar:

- confirmação explícita;
- motivo obrigatório;
- ciência de que a operação pode consumir novos créditos.

A recriação cria uma nova versão da mesma rota diária. A versão anterior vira
`superseded` e continua disponível na auditoria. Não apagar o pedido anterior é
necessário para investigar custos, falhas e decisões de suporte.

Gerentes e representantes não recebem acesso à operação, mesmo que chamem a API
diretamente.

### Auditoria de geração

Cada tentativa registra:

- organização, representante e data da rota;
- usuário que iniciou a ação;
- motivo, quando for uma recriação;
- versão da rota;
- chave de idempotência;
- provedor e identificador externo;
- início, conclusão e duração;
- estado final e erro sanitizado;
- unidades, créditos ou custo retornado pelo provedor;
- indicação de tentativa original, repetição ou recriação administrativa.

## 4. Rota pronta no celular

### Hierarquia da tela

1. Mapa no topo, ocupando aproximadamente um terço da altura útil inicial.
2. Resumo compacto com progresso, duração restante e próxima parada.
3. Cartão da próxima empresa.
4. Lista das demais empresas na ordem da rota.
5. Ações secundárias e resumo dos critérios usados.

Os campos de segmento, cidade e jornada não permanecem abertos. Um resumo
somente leitura pode ficar em uma área recolhível. Para o super admin, a ação de
recriar rota fica em um menu administrativo separado.

### Conteúdo de cada parada

O cartão de empresa deve mostrar, quando disponível:

- posição na rota;
- nome da empresa em destaque;
- endereço;
- horário estimado de chegada;
- tempo de deslocamento;
- situação de funcionamento naquele horário;
- avaliação e quantidade de reviews;
- motivo pelo qual a empresa foi selecionada;
- última visita ou relacionamento existente;
- estado da parada.

A quantidade de reviews é importante para qualificação e deve aparecer ao lado
da avaliação, não escondida em detalhes.

### Ações da parada

Existem duas ações principais e visualmente distintas:

- **Ir**: abre a navegação curva a curva no aplicativo de mapas.
- **Check-in**: inicia a visita daquela empresa diretamente no Xpot.

Tocar no corpo ou no nome da empresa executa a ação principal de check-in. O
botão **Ir** tem sua própria área de toque e não pode propagar o evento para o
check-in. Não existe uma confirmação intermediária quando todas as permissões e
regras de localização estiverem satisfeitas.

Antes de marcar a visita como iniciada, o Xpot valida a localização no servidor.
Se GPS ou permissão não estiverem disponíveis, a interface abre o fluxo de
recuperação correspondente. Um estado otimista nunca deve afirmar que a visita
começou antes da confirmação do servidor.

Se o toque tiver sido acidental, a tela da visita ativa oferece **Cancelar
visita**, com motivo, sem registrar uma visita concluída.

### Estados da parada

| Estado | Uso |
|---|---|
| `planned` | Parada ainda não iniciada |
| `in_progress` | Check-in ativo e ligado à visita atual |
| `visited` | Visita encerrada e resumo salvo |
| `skipped` | Representante pulou a parada com motivo |
| `unavailable` | Empresa fechada, inexistente ou inacessível |
| `removed` | Remoção administrativa, preservada no histórico |

O representante pode pular uma parada e informar um motivo. Ele também pode
reordenar manualmente as paradas restantes sem nova chamada paga. A ação de
**Reotimizar**, que consulta novamente o provedor, continua exclusiva do super
admin e segue a mesma proteção de custo da recriação.

### Continuidade da rota

- A visita ativa aparece acima das demais paradas.
- Ao voltar ao Xpot durante um check-in, o aplicativo reabre a visita ativa.
- Se o usuário tentar iniciar outra empresa durante uma visita, o servidor
  rejeita a ação e oferece retomar ou cancelar a visita atual.
- O mapa, a lista e o progresso usam o mesmo estado persistido.
- A versão desktop mantém os mesmos recursos, com mapa e lista lado a lado
  quando houver espaço.

## 5. Check-in integrado à parada

O check-in da rota reutiliza todas as regras atuais de visita. A diferença é
que empresa, endereço e contexto da rota já estão resolvidos.

Ao gerar a rota, cada parada deve estar ligada a um lead e a uma localização
válidos. Se a descoberta encontrar uma empresa externa, o sistema cria ou
promove o prospecto de forma idempotente antes de publicar a rota.

Ao tocar em **Check-in**:

1. O cliente envia rota, versão, parada, coordenadas e chave de idempotência.
2. O servidor confirma que a parada pertence à rota do representante.
3. O servidor confirma que não existe outra visita ativa.
4. O servidor valida geolocalização e regras da organização.
5. O servidor cria exatamente uma visita e liga seu identificador à parada.
6. A parada passa para `in_progress`.
7. A interface abre a visita ativa.

Repetir a mesma solicitação por instabilidade de rede devolve a mesma visita.

## 6. Resumo pós-visita

### Entrada no resumo

Ao encerrar o check-in, a visita já está finalizada e o usuário é direcionado a
uma tela dedicada de resumo. Essa etapa não pode reabrir o cronômetro nem deixar
a visita ativa.

O resumo é um rascunho persistente. Se o usuário mudar de tela, fechar o app ou
perder conexão, o conteúdo preenchido deve reaparecer quando ele voltar.

### Hierarquia da tela

1. Nome da empresa e resultado básico da visita.
2. Gravador de áudio como maior e mais evidente ação.
3. Campo rápido **Quem te atendeu?**.
4. Campos digitáveis de resultado, resumo e próximo passo.
5. Criação de tarefas rápidas.
6. Ações para salvar e continuar a rota.

### Gravação de áudio

O gravador deve oferecer:

- gravar;
- pausar ou encerrar;
- reproduzir;
- apagar e gravar novamente;
- estado de envio;
- recuperação de upload interrompido.

Depois do envio, o áudio pode ser transcrito e analisado. Informações extraídas,
como contato, venda, oportunidade ou tarefa, são propostas para confirmação e
nunca gravadas silenciosamente como fatos definitivos.

O áudio é a ação principal, mas não é obrigatório. O representante pode concluir
o resumo somente com texto.

### Campos rápidos

- **Quem te atendeu?**: nome curto, por exemplo Antônio, com opção de salvar ou
  atualizar o contato da empresa.
- **Resultado**: desfecho da visita.
- **Resumo**: observações livres.
- **Próximo passo**: ação combinada.
- **Tarefa**: título, data rápida, responsável e prioridade.

Todos os campos salvam rascunho automaticamente. O envio final precisa ser
idempotente para não duplicar contatos, tarefas ou ações extraídas.

### Saída do resumo

O botão principal é **Salvar e ir para a próxima parada**. Ele salva o resumo,
marca a parada como `visited` e volta à rota focando a próxima empresa.

A ação secundária **Salvar e ficar** permite revisar a empresa sem avançar.

## 7. Sistema simples de tarefas

### Decisão de produto

O Xpot já possui uma base de tarefas ligada a leads, visitas e oportunidades.
Ela deve ser ampliada, não substituída. A experiência e o vocabulário devem
seguir a estrutura validada no Xphere, adaptada ao trabalho de campo do Xpot.

O objetivo inicial é lembrar uma pessoa de visitar, ligar ou realizar uma ação
para uma empresa em uma data específica. O primeiro lançamento não inclui
projetos, subtarefas, dependências, comentários, recorrência ou quadro Kanban.

### Campos do modelo inicial

| Campo | Regra |
|---|---|
| Título | Obrigatório e curto |
| Descrição | Opcional |
| Vencimento | Data e horário opcionais |
| Prioridade | `low`, `medium`, `high` ou `urgent` |
| Estado | `todo`, `in_progress`, `done` ou `cancelled` |
| Tipo | `follow_up`, `return_visit`, `call`, `delivery` ou `other` |
| Responsável | Representante que deve executar |
| Criado por | Usuário que criou a tarefa |
| Empresa | Lead relacionado, quando houver |
| Visita | Visita de origem, quando houver |
| Oportunidade | Oportunidade relacionada, quando houver |

A base atual usa estados equivalentes a pendente, concluída e cancelada. A
migração deve preservar os registros e fazer o seguinte mapeamento:

- `pending` para `todo`;
- `completed` para `done`;
- `cancelled` permanece `cancelled`;
- adicionar `in_progress`.

### Experiência reaproveitada do Xphere

- grupos por vencimento: atrasadas, hoje, amanhã, próximos 7 dias, futuras e
  sem data;
- datas rápidas: hoje, amanhã e próxima semana;
- filtros por estado, prioridade, responsável, empresa e período;
- busca por título e descrição;
- ação rápida de concluir e opção de reabrir;
- edição, cancelamento e exclusão com as permissões apropriadas;
- ordenação por vencimento, responsável, criação, atualização e conclusão.

### Pontos de criação

Uma tarefa pode ser criada:

- no resumo pós-visita;
- no detalhe de uma empresa;
- na área central de tarefas;
- futuramente, a partir de uma sugestão confirmada do áudio.

Uma tarefa criada no resumo recebe automaticamente a empresa, a visita e o
representante atual. O usuário precisa preencher somente o título e a data, com
prioridade média como padrão.

### Lembretes

- Tarefas vencendo hoje aparecem no início do dia.
- A notificação interna é obrigatória.
- Web Push é enviado quando autorizado.
- Concluir, cancelar ou alterar a data remove lembretes obsoletos.
- O histórico de sincronização existente deve continuar funcionando.

No futuro, tarefas do tipo `return_visit` com vencimento no dia poderão entrar
como candidatas no planejamento da rota. Essa integração não faz parte da
primeira entrega do novo fluxo.

## 8. Modelo de dados proposto

### Rotas diárias

Uma rota diária precisa armazenar:

- organização, representante, data e fuso usados na trava diária;
- segmento e local escolhidos;
- início, duração e término planejados;
- ponto de partida, quando informado;
- estado e versão atual;
- estimativa de conclusão da geração;
- horários de criação, geração, início e conclusão;
- erro sanitizado, quando houver.

### Paradas

Cada parada precisa armazenar:

- rota e versão;
- sequência;
- lead e localização;
- visita, quando iniciada;
- chegada estimada;
- duração de deslocamento e de visita;
- estado e motivo de pulo;
- avaliação, quantidade de reviews, horário de funcionamento e motivos de
  seleção congelados no momento da geração.

Congelar os dados usados para decidir a rota torna o histórico explicável,
mesmo que o cadastro da empresa mude depois.

### Tentativas e custo

Cada tentativa de geração precisa armazenar os dados descritos na auditoria de
geração, incluindo versão, job, provedor, custo e motivo administrativo.

### Notificações

A notificação persistente precisa armazenar destinatário, tipo, título,
mensagem, referência de navegação, leitura e criação. Inscrições de push ficam
separadas e podem ser revogadas sem apagar o histórico das notificações.

## 9. Contratos de API

Os nomes finais podem seguir o padrão já usado pelo Xpot, mas os comportamentos
abaixo são obrigatórios.

| Operação | Comportamento |
|---|---|
| Obter rota de hoje | Devolve rascunho, processamento, rota pronta ou ausência |
| Salvar rascunho | Atualiza uma etapa sem gerar custo |
| Gerar rota | Responde de forma assíncrona com rota, job, estado e estimativa |
| Obter status | Devolve etapa atual, estimativa, falha ou rota pronta |
| Recriar rota | Super admin, motivo obrigatório, nova versão e auditoria |
| Reordenar paradas | Altera apenas a ordem manual, sem chamada paga |
| Pular parada | Exige motivo e atualiza o progresso |
| Check-in da parada | Valida GPS, cria uma única visita e liga a parada |
| Encerrar e resumir | Finaliza visita e cria ou atualiza o rascunho do resumo |
| Concluir resumo | Confirma dados, tarefas e próxima parada de forma idempotente |
| Listar notificações | Devolve itens persistentes e contagem não lida |
| Marcar notificação | Registra leitura sem apagar o item |

Erros de domínio devem ter códigos estáveis para rota já existente, falta de
permissão, visita já ativa, distância inválida, localização indisponível,
geração em andamento e falha recuperável.

## 10. Critérios de aceite

### Planejamento e custo

- [ ] O representante sem rota responde uma pergunta por tela.
- [ ] Sair e voltar mantém a etapa e as respostas.
- [ ] Confirmar duas vezes cria somente um job e uma tentativa cobrável.
- [ ] A rota continua sendo gerada após navegar para outra área.
- [ ] A interface mostra etapa real e estimativa de espera.
- [ ] A conclusão gera notificação interna e, quando autorizado, push.
- [ ] O representante com rota pronta não vê novamente o formulário do dia.
- [ ] Um representante ou gerente não consegue recriar a rota pela interface
      nem chamando a API diretamente.
- [ ] O super admin consegue recriar após confirmar custo e informar o motivo.
- [ ] A versão anterior e o custo permanecem auditáveis.

### Execução da rota

- [ ] O mapa é o primeiro elemento da rota pronta no celular e no desktop.
- [ ] Cada parada mostra avaliação e quantidade de reviews quando disponíveis.
- [ ] **Ir** abre o aplicativo de mapas sem iniciar check-in.
- [ ] Tocar na empresa ou em **Check-in** inicia a validação daquela parada.
- [ ] Repetições de rede criam somente uma visita.
- [ ] Uma visita ativa reaparece após troca de tela ou recarregamento.
- [ ] Não é possível iniciar uma segunda visita ao mesmo tempo.
- [ ] Pular e reordenar manualmente não consomem crédito de otimização.

### Pós-visita e tarefas

- [ ] Encerrar a visita abre imediatamente o resumo pós-visita.
- [ ] O gravador de áudio é o ator visual principal.
- [ ] É possível preencher rapidamente quem atendeu.
- [ ] O usuário pode concluir sem áudio usando texto.
- [ ] O rascunho sobrevive a troca de tela, recarregamento e perda temporária
      de conexão.
- [ ] Criar uma tarefa no resumo preenche empresa, visita e responsável.
- [ ] Salvar e continuar abre a rota na próxima parada.
- [ ] A lista de tarefas agrupa atrasadas, hoje, amanhã, próximos 7 dias,
      futuras e sem data.
- [ ] É possível criar, editar, concluir, reabrir e cancelar tarefas.

## 11. Ordem de entrega

### Fase 1 | Fundação e proteção de custo

- Modelo de rota, parada, versão, tentativa e notificação.
- Job persistente e idempotente.
- Trava diária por representante.
- Permissão e auditoria de recriação pelo super admin.

### Fase 2 | Assistente e processamento

- Planejamento de uma pergunta por vez.
- Rascunho persistente.
- Tela de loading com estimativa e etapas.
- Notificação interna e Web Push.

### Fase 3 | Rota pronta e check-in direto

- Mapa no topo.
- Lista mobile com navegação e check-in.
- Persistência da visita ativa.
- Pulo, reordenação manual e progresso.

### Fase 4 | Resumo pós-visita

- Tela dedicada e rascunho persistente.
- Áudio em destaque, transcrição e sugestões confirmáveis.
- Contato rápido, resultado, observações e próximo passo.
- Retorno automático para a rota.

### Fase 5 | Tarefas alinhadas ao Xphere

- Evolução segura do modelo atual.
- Prioridade, estado em andamento, tipos e vínculos completos.
- Grupos por data, filtros, edição e reabertura.
- Criação rápida no resumo da visita e lembretes.

### Fase 6 | Otimização avançada

- Uso mais forte de horários de funcionamento, reviews e histórico.
- Inclusão opcional de retornos vencendo no dia.
- Métricas de aderência à rota e qualidade das sugestões.
- Ajustes de estimativa baseados no tempo real de geração e visita.

## 12. Métricas de sucesso

- Percentual de rotas concluídas sem recriação.
- Tempo entre confirmação e rota pronta.
- Taxa de notificações entregues e abertas.
- Percentual de paradas iniciadas pelo check-in direto.
- Tempo entre check-out e resumo salvo.
- Percentual de resumos com áudio, contato identificado e próximo passo.
- Percentual de tarefas concluídas no prazo.
- Créditos consumidos por rota pronta e por falha.
- Ocorrências de tentativa duplicada que resultaram em cobrança adicional. A
  meta para esta métrica é zero.

