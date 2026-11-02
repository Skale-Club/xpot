# Rodada 2: revendedor, cliente, público e login

Perfis: reseller (Kevin), rep-both (Jason), newbie (Rafael, recém-chegado), customer, pending, expired, public. Abri 51 imagens (limite 60), cada uma uma vez. Não contei RCP-8 e RCP-27 (privacidade e contato real do dono). Não repeti o que está em `pending-r1.md` (RCP-13, 14, 18, PE-1, PE-34, PE-35, PE-46). Textos em en; pt e es quando a mudança é de texto.

Limites do laboratório ignorados: `http://localhost:2190/my` no link da página do cliente, relógio "0m", figura 2D.
Observação sobre a captura offline: o seed fixa o código `2S3HJF64` (Fenway Fitness, peça minha e no ar) e a tela diz "Piece not found". Pelo código (`TagScreen.tsx:145`) um erro de rede deveria cair em `ErrorState` com "Try again". Tratei como achado porque a tela prova o texto errado; a causa pode ser a captura.

## Notas

| Tela | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| Home do recém-chegado, celular (`new-reseller-tags-home`) | Saber o que fazer na primeira vez | 4 | R2-RCP-3 |
| My pieces, Customers e Shop vazios (celular) | Dizer como começar | 4 | R2-RCP-3, 13 |
| Write a chip without Xpot (`tags-direct`) | Gravar um chip simples | 5 | R2-RCP-4 |
| Sheet "Read a piece" | Escanear ou digitar | 7 | R2-RCP-4 (link escondido) |
| Home do revendedor com peças | O que falta fazer | 7 | RCP-18 já pendente |
| Configurar peça (`setup-0` a `setup-7`) | Cliente e destino em uma mão | 6 | R2-RCP-5, 6 (e PE-35 pendente) |
| Peça minha no celular (`tags-piece-*`) | Estado e ação | 7 | R2-RCP-7, 16 |
| Lista My pieces, celular e computador | Achar a peça | 7 | R2-RCP-13 |
| Peça "not mine" e "other person" | Saber o que fazer | 4 | R2-RCP-7 |
| Câmera negada (`read-piece-qr-camera-denied`) | Seguir sem a câmera | 4 | R2-RCP-8 |
| Sessão expirada (`session-expired-*`) | Voltar a trabalhar | 4 | R2-RCP-2 |
| Sem internet (`network-offline-*`) | Saber que a rede caiu | 2 | R2-RCP-1 |
| Settings (perfil, My company, Sign-in) | Ajustar a conta | 6 | R2-RCP-9 |
| Customers, lista (reseller, celular) | Achar um cliente | 7 | nada grave |
| Cliente em Tags (`tags-customer-27`, pt, es) | Mandar o link e ver as peças | 5 | R2-RCP-10, 11, 16 |
| Cliente em Tags para quem também faz visitas (`tags-customer-5`) | Estado do cliente e o que dá para fazer | 5 | R2-RCP-12 |
| Página pública da peça (6 estados) | Dizer ao cliente do negócio o que houve | 8 | nada grave |
| Login (modal sobre a landing) | Entrar com o telefone | 7 | R2-RCP-2 |
| Página não encontrada | Voltar | 8 | nada |
| Pending (`pending-tags`) | Saber que está em análise | 5 | R2-RCP-15 |
| Cliente final: My plates e detalhe | Ver os acessos | 7 | R2-RCP-14 |

## S1

### R2-RCP-1 [S1] Sem internet, a peça diz "Piece not found... may not be yours"
Telas: rep-both/en-phone/network-offline-while-using-tags
Problema: a rede cai, o revendedor toca na própria peça no ar (Fenway Fitness, `2S3HJF64`) e a tela diz "Piece not found. Check the code on the piece. If it's right, this piece may not be yours." Ele conclui que perdeu a peça ou digitou errado. Não há aviso de rede na tela (a barra vermelha "You are offline" existe em `PhoneTopBar.tsx:33`, mas a tela da peça usa outra barra) nem botão "Try again"; só "Read another piece". Na rua, com sinal ruim, é o caso mais comum.
Mudança: erro de rede nunca vira "not found". Na tela da peça: título "No connection", frase "We can't reach Xpot. Your pieces are safe. Check your signal and try again.", botão principal "Try again". Mostrar a faixa offline também nas telas que usam `TopBar` (peça, popup). pt: "Sem conexão" / "Não conseguimos falar com o Xpot. Suas peças estão salvas. Confira o sinal e tente de novo." / "Tentar de novo". es: "Sin conexión" / "No podemos conectar con Xpot. Tus piezas están a salvo. Revisa la señal e inténtalo de nuevo." / "Reintentar". Se o código já tem `ErrorState` para isso, descobrir por que a tela não chega nele (service worker ou `lookupTag` devolvendo "not_found" para falha de rede).
Arquivos: client/src/pages/tags/TagScreen.tsx:134-155, client/src/pages/tags/lib.ts:218-227, client/src/components/xpot/PhoneTopBar.tsx:33
Risco: nenhum de regra. Confirmar com captura real offline.

## S2
Status: feito. Causa no código, não na captura: com a rede fora o React Query pausa a consulta (sem dado e sem erro) e a tela lia isso como 'não encontrada'. Agora pieceLoadView separa carregando, sem conexão, falha e não encontrada (tests/piece-load.test.ts). Faixa offline também em TopBar das telas internas. Visto na captura offline.

### R2-RCP-2 [S2] Sessão expirada: cai na landing com "Sign in or create your account", sem dizer o que houve
Telas: rep-both/en-phone/session-expired-while-using-piece, session-expired-while-using-tags; expired/en-phone/*; public/en-desktop/login-with-next
Problema: o revendedor estava na peça, a sessão acabou e ele vê a landing de vendas "Sell on your schedule." desfocada e uma janela "Sign in or create your account with your phone number." Nenhuma frase diz "sua sessão acabou" nem "vamos te devolver à peça". Parece que foi deslogado por erro, ou que é a primeira vez; "create your account" convida quem já tem conta a criar outra. Não existe texto de sessão expirada no sistema (busca em `i18n/messages` sem resultado).
Mudança: quando o login vem de redirecionamento com `next`, a janela abre com uma faixa no topo: "Your session ended. Sign in again and you'll go back to where you were." e o título vira "Sign in". Sem "or create your account" nesse caso. pt: "Sua sessão terminou. Entre de novo e você volta de onde parou." es: "Tu sesión terminó. Inicia sesión de nuevo y volverás donde estabas."
Arquivos: client/src/components/xpot/SessionGate.tsx:33, client/src/pages/Login.tsx, client/src/lib/xpot.ts:107, client/src/pages/tags/lib.ts:168-171
Risco: nenhum.
Status: feito. ?ended=1 só quando a sessão acabou de verdade (401 em uso, ou 401 num navegador que já teve sessão: flag xpot.wasSignedIn); a janela diz a frase e não oferece criar conta. Visto em phone, nos dois caminhos. Não refiz um login completo até a peça (mecanismo ?next= já existia).

### R2-RCP-3 [S2] Quem acabou de entrar vê quatro telas vazias que não explicam nada nem dizem quem procurar
Telas: newbie/en-phone/new-reseller-tags-home, new-reseller-tags-pieces, new-reseller-tags-shop, new-reseller-tags-customers; newbie/en-desktop/new-reseller-tags-home; newbie/en-phone/new-reseller-settings-profile
Problema: a primeira tela (Rafael Costa) é um botão "Read a piece" e a frase cinza "You have no pieces yet. When you do, what is waiting for you shows up here." Ocupa 15% da tela, o resto é preto. Nada diz o que é Xpot para ele, o que um revendedor faz, nem como conseguir a primeira peça. As outras três abas pedem a mesma coisa com palavras diferentes: My pieces "Ask your manager for pieces." (quem é o gestor?), Shop "Your pieces come from Harbor Print Co. To get more, talk to them." (Settings diz que a empresa dele é Lindgren Local Group: duas empresas, e nenhuma com telefone ou botão), Customers "appear here after you sell or link a piece". My pieces ainda mostra busca, "More filters" e quatro filtros para zero peças. No computador, a Home é só "Type the code" com foco no campo e dica de leitor USB, a mesma tela que o celular chama de "Read a piece".
Mudança: para quem tem zero peças, a Home vira um cartão de começo, e as abas vazias apontam para ele:
- Título "Welcome, Rafael" e três linhas: "1. Get pieces from your company. 2. Read a piece and set up the customer. 3. Put it live." (pt: "Boas-vindas, Rafael" / "1. Receba peças da sua empresa. 2. Leia a peça e configure o cliente. 3. Coloque no ar." es igual em espanhol).
- Botão "Contact Lindgren Local Growth" (WhatsApp ou telefone da organização) no lugar de "talk to them"/"ask your manager". Uma só palavra para a empresa em todas as telas: o nome dela.
- Sem busca nem filtros em My pieces quando a lista é vazia; Shop vazio sem a aba (ou com o mesmo botão de contato).
- "Read a piece" continua como botão principal no celular; no computador, mesmo título "Read a piece" acima do campo.
Arquivos: client/src/pages/tags/HomeScreen.tsx, client/src/pages/tags/PiecesScreen.tsx, client/src/pages/tags/ShopScreen.tsx, client/src/i18n/messages/tags.ts (chaves "noPieces", "askManager", "shopEmpty")
Risco: depende de a organização ter um contato; se não tiver, usar o telefone da Skale Club da conta (decisão do dono, mas é só qual número aparece).
Status: feito, sem botão de contato (organizations não tem telefone). Cartão 'Welcome, Rafael' com 3 passos e o nome real da empresa (whoToAsk.ts, testado); Pieces/Shop/Customers apontam para ele; My pieces vazia sem busca nem filtros; Home no computador com título 'Read a piece'. Visto phone e desktop.

### R2-RCP-4 [S2] "Write a chip without Xpot": nome sem sentido, escondido e com botões mortos sem motivo
Telas: newbie/en-phone/new-reseller-tags-direct, new-reseller-read-piece-sheet, rep-both/en-phone/read-piece-code-other-person
Problema: a única porta é um link sublinhado "Write a chip without Xpot" no pé da janela "Read a piece". Quem lê o nome entende "gravar sem o Xpot" e não sabe para que serve. A tela repete o título duas vezes (barra e título), abre a explicação "The chip opens the customer's own link directly. You won't see its scans, and changing it means writing the chip again." e mostra "Write to chip" e "QR code" apagados, sem dizer o que falta preencher (a tela de configurar tem a frase "Choose the customer for this piece."; esta não tem). "Destination" (aba Link/Email/Phone/Contact) e depois "Customer link" confundem: o mesmo campo tem dois nomes. "Recent chips without Xpot" fica vazio.
Mudança: chamar de "Plain chip (no tracking)" em toda parte; no link da janela: "Need a plain chip with no tracking?" (pt: "Chip simples, sem acompanhamento"; es: "Chip simple, sin seguimiento"). Título único; a explicação vira uma linha: "Opens your customer's link directly. You won't see scans." Botões desabilitados ganham a linha de ajuda "Enter the link to continue." Rótulo do campo igual ao da aba: "Link", "Email", "Phone", "Contact".
Arquivos: client/src/pages/tags/DirectScreen.tsx, client/src/pages/tags/HomeScreen.tsx (janela Read a piece), client/src/i18n/messages/tags.ts
Risco: nome do recurso é decisão de produto; recomendo "Plain chip".
Status: feito. 'Plain chip (no tracking)' em tudo, título único (phoneBarHidden inclui /tags/direct, teste ajustado), explicação de uma linha, linha de ajuda nos botões apagados, campo 'Link'. Visto phone.

### R2-RCP-5 [S2] Configurar peça durante uma visita não sugere o cliente da visita
Telas: rep-both/en-phone/setup-0-piece-before, setup-1-editor-empty, setup-2-customer-search
Problema: a faixa verde diz "Blue Harbor Seafood ... Open visit" (o revendedor está lá agora). Ele toca "Set up", e o campo Customer abre vazio, com "Search or type a new name". Ele precisa digitar o nome do lugar onde está. "Pho Saigon Corner" e "Copper Kettle Cafe" aparecem na busca por "co", outros clientes, e o cliente da visita não vem primeiro. O código de configurar só usa visita em `TagSaleDialog.tsx`.
Mudança: com visita aberta, abrir o campo com o cliente da visita já escolhido (tirável com o X) ou como primeira linha "Blue Harbor Seafood · visiting now".
Arquivos: client/src/components/piece/CustomerDestinationSection.tsx, client/src/pages/tags/ (editor "Set up this piece")
Risco: nenhum.
Status: feito. suggestedCustomer (testado): vendendo para, senão o cliente da visita aberta; vem escolhido com o X. Visto phone.

### R2-RCP-6 [S2] "Generate Google review link ..." cortado e sem explicar o que faz
Telas: rep-both/en-phone/setup-3-customer-picked, setup-7-contact-kind
Problema: depois de escolher o cliente aparece um botão largo, com estrela amarela, "Generate Google review link ...". No celular o texto `Generate Google review link for {name}` é cortado onde estaria o nome; dá a impressão de botão quebrado. Não diz que vai buscar o cliente no Google e preencher o campo "Destination" abaixo, e fica na aba Contact, onde não faz sentido. A estrela amarela destoa da paleta (azul e navy).
Mudança: texto fixo "Use the Google review link" com a linha de ajuda "Finds {name} on Google and fills the link below." (pt: "Usar o link de avaliação do Google" / "Procura {name} no Google e preenche o link abaixo."; es: "Usar el enlace de reseñas de Google" / "Busca a {name} en Google y rellena el enlace de abajo."). Só quando a aba é Link. Ícone neutro.
Arquivos: client/src/pages/tags/ReviewLinkSheet.tsx:119,209, client/src/i18n/messages/tags.ts:193
Risco: nenhum.
Status: feito. 'Use the Google review link' + ajuda, só na aba Link, ícone neutro. Visto e clicado (gera o link; some na aba Contact).

### R2-RCP-7 [S2] Peça de outra pessoa: "This piece is not with you." e nenhum próximo passo, em três frases diferentes
Telas: rep-both/en-phone/tags-piece-not-mine, read-piece-code-other-person; newbie (código não encontrado); rep-both/en-phone/network-offline-while-using-tags
Problema: o revendedor escaneia uma plaquinha achada no cliente e vê "This piece is not with you." (peça: tela vazia com "Read another piece"; janela: faixa vermelha). Não diz com quem está nem o que fazer. Outro texto para quase o mesmo caso: "Piece not found... this piece may not be yours." e outro, `notYours`. Na rua é uma tela sem saída.
Mudança: uma frase por caso, ambas com saída:
- Não é dele: "This piece isn't in your list. Ask your company to hand it to you, or check the code." Botões "Read another piece" e "Contact {company}".
- Não existe: "We can't find this code. Check the letters and numbers on the piece."
pt: "Esta peça não está na sua lista. Peça à sua empresa que entregue a você, ou confira o código." / "Não encontramos este código. Confira as letras e números da peça." es: "Esta pieza no está en tu lista. Pide a tu empresa que te la entregue, o revisa el código." / "No encontramos este código. Revisa las letras y números de la pieza."
Arquivos: client/src/pages/tags/TagScreen.tsx:150, client/src/i18n/messages/tags.ts:100-101, apiErrors.ts
Risco: nenhum.
Status: feito (sem botão 'Contact {company}': não há contato). Uma frase para 'não está na sua lista' e outra para 'código não encontrado', em en/pt/es, em tela, banner e erro do servidor. lookupTag agora reconhece pelo código tag_not_yours, não pela palavra 'kit' (em pt/es nunca casava).

### R2-RCP-8 [S2] Câmera negada: "Could not open the camera." e só "Back"
Telas: rep-both/en-phone/read-piece-qr-camera-denied
Problema: tela preta com um cartão "Could not open the camera." e o botão "Back". Não diz que é permissão, como liberar, nem que dá para digitar o código. Fica uma faixa verde da visita aparecendo no topo da tela preta.
Mudança: "The camera is blocked. Allow it in your browser settings, or type the code instead." Botões "Type the code" (principal, volta à janela com o campo focado) e "Close". pt: "A câmera está bloqueada. Libere nas configurações do navegador, ou digite o código." / "Digitar o código" / "Fechar". es: "La cámara está bloqueada. Permítela en los ajustes del navegador, o escribe el código." / "Escribir el código" / "Cerrar".
Arquivos: client/src/pages/tags/QrScanner.tsx, useQrCamera.ts, client/src/i18n/messages/tags.ts
Risco: nenhum.
Status: não tocado, como pedido.

### R2-RCP-9 [S2] Settings: trocar o telefone manda "talk to the Xpot team" sem como falar, e "My company" é uma tela para um cartão
Telas: reseller/en-phone/settings-signin, settings-organization, settings-profile; newbie/en-phone/new-reseller-settings-profile
Problema: "Sign-in" mostra o telefone e "To change it, talk to the Xpot team." Não há link, WhatsApp ou e-mail; o revendedor que trocou de chip não consegue seguir. "My company" abre uma tela inteira só para repetir o nome (já aparece à direita no menu) e o selo "Employee": "You work for this company. Your pieces and customers stay under your name." Para revendedor "Employee" também engana. (Contato real de privacidade é do dono; aqui falta só o canal para trocar telefone, que é o do suporte.)
Mudança: "Sign-in": botão "Message the Xpot team" (WhatsApp de suporte já usado em `TalkToSeller`, `support`) com o texto "To change your number, message us." pt: "Para trocar o número, fale com a gente." / "Falar com o Xpot". es: "Para cambiar tu número, escríbenos." / "Escribir al equipo de Xpot". "My company": tirar o item do menu quando a pessoa só tem o nome e o papel; mostrar "Company: Lindgren Local Growth" como linha do perfil.
Arquivos: client/src/pages/my/SignIn.tsx e a tela de Settings do módulo (Organization), client/src/pages/my/TalkToSeller.tsx (`contact.support`)
Risco: precisa do número de suporte configurado (já existe `contact.data.support`).
Status: pendente. Não inventei canal de contato nem nome de botão. Para o dono: qual o botão e o canal para trocar o telefone (existe o WhatsApp de suporte em /api/auth/phone/config) e se 'My company' sai do menu quando só há nome e papel.

### R2-RCP-10 [S2] Página do cliente: "Who can see these plates" mistura plate, piece, company e customer
Telas: reseller/en-phone/tags-customer-27, reseller/es-desktop/tags-customer-27
Problema: o bloco diz "WHO CAN SEE THESE PLATES. Send this link. They sign in with the code on a plate and a text message." O cliente na verdade entra com o telefone e um SMS; "the code on a plate" confunde. Mais abaixo: "Business phone · Always allowed. Change the phone on the company to stop it." A tela inteira diz "customer", agora aparece "company". "Plates" aqui, "Pieces" no resto (e "Large Stand" no painel do cliente chama-se plate também: ver RCP-14 abaixo). "Allow" não diz o que libera (outro número ver as peças). A dica de "Always allowed" é um beco: o revendedor não sabe onde trocar.
Mudança: título "Let your customer see how their pieces perform"; texto "Send this link. They sign in with their phone number and a text message." Linha do telefone: "+1 (617) 555-1182 · Business phone (always allowed)". Botão "Allow another number" com campo "Phone number". pt: "Deixe seu cliente ver o desempenho das peças" / "Envie este link. Ele entra com o número de telefone e um SMS." / "Permitir outro número". es: "Deja que tu cliente vea el rendimiento de sus piezas" / "Envía este enlace. Entra con su número de teléfono y un SMS." / "Permitir otro número". "Plate" só quando é o modelo.
Arquivos: client/src/pages/tags/CustomerAccess.tsx, client/src/i18n/messages/myPlates.ts:70
Risco: nenhum.
Status: feito, com um achado parcialmente errado: o cliente entra, sim, com o código impresso numa peça (my/SignIn.tsx exige), além do telefone e do SMS. A frase agora diz as três coisas; 'plates' virou 'pieces'; botão 'Allow another number'; sem a dica sem saída.

### R2-RCP-11 [S2] Página do cliente: "CODE" solto e "Change destination" sem dizer de qual peça
Telas: reseller/en-phone/tags-customer-27, reseller/es-desktop/tags-customer-27
Problema: no cartão "PIECES" há "Change destination" e "Link a piece" no topo e, embaixo, um cabeçalho de coluna "CODE" sobre uma única linha, no celular sem as outras colunas. Com mais de uma peça, "Change destination" não diz qual muda (ou muda todas?).
Mudança: tirar "CODE" no celular; "Change destination" vira ação por peça (dentro da linha) ou "Change destination of all pieces" quando há mais de uma. pt: "Trocar o destino de todas as peças".
Arquivos: client/src/pages/tags/CustomerScreen.tsx
Risco: se hoje já troca todas, só o texto muda.
Status: feito. 'Change destination' já dizia 'Change all (N)'; agora 'Change destination of all N pieces'. 'CODE' solto some no celular.

### R2-RCP-12 [S2] Cliente aberto por quem também faz visitas: "Finish your visit at Blue Harbor Seafood first." e botões de venda iguais a ativos; "Delete company" sem separação
Telas: rep-both/en-phone/tags-customer-5
Problema: a nota âmbar "Finish your visit at Blue Harbor Seafood first." aparece logo abaixo de "Directions", longe dos botões "New sale", "Leave stock", "Count and bill", que parecem ativos. Não diz que ação está bloqueada (check-in?) nem tem botão para abrir a visita. Embaixo da página, "Delete company" em vermelho, sem separação, ao lado de 18 unidades em consignação (6d overdue) e $548 vendidos.
Mudança: a nota vira botão "Open visit at Blue Harbor Seafood" quando algo está bloqueado, e diz o que bloqueia: "Check in here after you finish your visit at Blue Harbor Seafood." "Delete company" dentro de "Details" (recolhido) e sumido quando há venda ou estoque (a regra já existe no servidor? conferir).
Arquivos: client/src/pages/tags/CustomerScreen.tsx e a página de empresa de Visits
Risco: regra de apagar com estoque é decisão do dono; recomendo bloquear.
Status: feito em parte (arquivo de Visits, mínimo): botão 'Back to visit' e a nota 'Check in here after you finish your visit at X.'. Pendente para o dono: 'Delete company' com consignação e vendas. O servidor apaga sem checar nada (server/routes/xpot/leads.ts); recomendo bloquear, mas é regra de dinheiro.

### R2-RCP-13 [S3] Títulos repetidos e filtros em telas vazias, no celular
Telas: newbie/en-phone/new-reseller-tags-pieces, tags-shop, tags-customers, tags-direct
Problema: barra superior "My pieces" e logo abaixo "0 PIECES / My pieces"; Customers e Shop repetem o mesmo nome em dois tamanhos. My pieces vazia mostra busca, "More filters" e quatro filtros.
Mudança: uma só linha de título; em lista vazia sem busca nem filtros.
Arquivos: client/src/pages/tags/PiecesScreen.tsx, ShopScreen.tsx, CustomersScreen.tsx
Risco: nenhum.
Status: pendente (S3). Título repetido só no celular de quem tem um módulo; tirar a barra cortaria o único título de quem tem os dois. Filtros em lista vazia: feito em My pieces.

### R2-RCP-14 [S3] Painel do cliente final: "My plates" para um Stand; "Talk to your seller" não diz que abre o WhatsApp
Telas: customer/en-phone/my-plates, my-plate-detail
Problema: o título é "My plates" e a primeira linha "Google Review · Large Stand". O botão "Talk to your seller" abre o WhatsApp em outra aba (`TalkToSeller.tsx`: `target="_blank"`), sem avisar. Um cliente sem treino acha que é um chat do app. A explicação "To change where a plate opens ... talk to your seller" se repete na lista e no detalhe.
Mudança: título "My Xpot pieces" (pt "Minhas peças Xpot"; es "Mis piezas Xpot"); botão "Message your seller on WhatsApp" (pt "Falar com o vendedor no WhatsApp"; es "Escribir al vendedor por WhatsApp"). A frase explicativa só uma vez, no detalhe.
Arquivos: client/src/pages/my/TalkToSeller.tsx:24, client/src/i18n/messages/myPlates.ts:64
Risco: nenhum.
Status: pendente (S3, fora do escopo desta lista).

### R2-RCP-15 [S3] Sign-up em análise: sem prazo e sem quem procurar
Telas: pending/en-phone/pending-tags
Problema: "Your sign-up is under review. The Xpot team got your request and will review it. Once it's approved, sign in with this same number." Ícone âmbar de relógio, só "Sign out". Não diz em quanto tempo, nem se vai chegar aviso, nem como falar com alguém. A pessoa volta todo dia para ver.
Mudança: acrescentar "We usually reply within 1 business day. We'll text you when it's approved." e o botão "Message the Xpot team" (mesmo canal de R2-RCP-9). pt: "Costumamos responder em 1 dia útil. Avisamos por SMS quando for aprovado." es: "Solemos responder en 1 día hábil. Te avisaremos por SMS cuando sea aprobado." Prazo e aviso por SMS são decisão do dono; recomendo só incluir o que o sistema faz de verdade.
Arquivos: client/src/pages/Pending.tsx (ou `pending-*`), client/src/i18n/messages/auth.ts
Risco: depende de existir esse SMS.
Status: pendente: o prazo é do dono, como pedido.

### R2-RCP-16 [S4] Acabamento
Telas: reseller/en-phone/tags-piece-live, rep-both/en-phone/tags-piece-sold-live, reseller/es-desktop/tags-customer-27, newbie/en-phone/new-reseller-read-piece-sheet
Problema: o destino quebra no meio da palavra ("instagram.com/mald / enhardware"); o telefone na página do cliente em es quebra "+1 (617) 555-118 / 2"; o placeholder "Número de te" fica cortado; o exemplo de código na janela mostra "A7K3PS" cortado (o código real termina em "9"); "chipTooBig" em tags.ts diz "Too big for small chips (NTAG213). Use an NTAG215/216 chip or an Xpot piece." (sigla técnica para quem grava chip sem Xpot).
Mudança: `break-all` só no meio do domínio, ou truncar com "…" e copiar; `whitespace-nowrap` no telefone; placeholder "Teléfono"; exemplo "A7K3P9X2" em campo mais largo; chipTooBig: "This chip is too small for this content. Use a larger chip." (pt: "Este chip é pequeno demais para este conteúdo. Use um chip maior.").
Arquivos: client/src/components/piece/CustomerDestinationSection.tsx, client/src/pages/tags/CustomerScreen.tsx, client/src/i18n/messages/tags.ts
Risco: nenhum.
Status: feito em parte: placeholder do código mais curto, telefone do acesso sem quebra, formulário do acesso em coluna. Fora: destino quebrado, telefone do painel de dados (InlineField), chipTooBig.

