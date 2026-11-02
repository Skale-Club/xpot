# Limite de tempo da visita

Uma visita em andamento expira após **4 horas**. O limite é compartilhado entre servidor e interface (`shared/visit-time-limit.ts`). Não depende de GPS, horário comercial, abas abertas ou do dispositivo.

O servidor verifica a cada 30 segundos e ao consultar a visita ativa ou tentar fazer check-out. Ao reiniciar, verifica as pendências imediatamente. O horário de encerramento é sempre o prazo original de quatro horas, mesmo se o servidor só voltar dias depois.

A visita expirada fica cancelada, com `expiredAt` indicando o encerramento automático e `durationSeconds = null`: quatro horas é o limite da sessão, não a duração real de uma visita esquecida. Não registra resultado comercial, coordenadas de saída ou uma nova data de última visita. Notas e vendas existentes são preservadas. A parada vinculada fica pulada (`visit_timeout`), permitindo continuar a rota.

O histórico diferencia encerramento automático de cancelamento manual e explica que a saída real e a duração são desconhecidas. O horário de encerramento técnico não é apresentado como check-out real. Uma visita expirada não pode ser reaberta nem receber resultado por uma chamada atrasada. Novas visitas podem ser iniciadas normalmente.

A migração 0077 é aditiva: coluna opcional e índice parcial para as sessões em andamento. O processo não reescreve visitas já encerradas.

Validação: 1.768 testes aprovados (26 condicionais ignorados), checagem de tipos e build de produção aprovados. Os testes cobrem prazo exato, visita de 66 horas, check-out normal e repetido, bloqueio de resultado depois da expiração, liberação do próximo check-in, isolamento por vendedor e encerramento da parada de rota. Em PostgreSQL real, as 83 migrações foram aplicadas em banco vazio e o worker encerrou visitas esquecidas sem depender de navegador aberto. A lista e o detalhe do histórico foram conferidos no navegador com o resultado automático e duração desconhecida.
