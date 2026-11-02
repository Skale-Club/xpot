# Auditoria visual: revendedor, cliente e público

Área `RCP`. Rodada r0. Olhei as imagens, salvo onde está escrito "visto só no código".

Perfil revendedor: Kevin Brooks (só módulo Tags, funcionário da Lindgren, peças vindas da Harbor Print, 4 peças).

## O que ele veio fazer, e o que encontra

O revendedor está na rua, com o celular, diante de uma peça. Ele quer ler a peça e deixá-la funcionando para o cliente.

- A tela de início tem 1605 px. Só os primeiros 228 servem a esse objetivo: o cabeçalho e o botão "Read a piece". O resto é relatório.
- Os outros 1377 px mostram 4 KPIs, gráfico e 4 listas. Nos dados do Kevin, 3 dessas listas mostram a mesma peça do mesmo cliente.
- A pergunta "o que falta eu fazer?" tem uma única resposta na tela, e ela afirma algo falso (RCP-4).
- Das 4 peças dele, 2 estão sem cliente, e o início não diz isso.
- A tela de peça é boa em si. O problema é que o cabeçalho de 130 px vem antes dela.

## Notas por tela

Nota de 0 a 10: quanto uma pessoa sem treino usa a tela de primeira.

| Tela | O mais importante | Nota | O que falta para 9 |
|---|---|---|---|
| reseller `tags-home` phone | Ler uma peça | 4 | RCP-4, 9, 10, 11 |
| reseller `tags-home` desktop | Digitar ou bipar o código | 5 | RCP-4, 10, 11 |
| reseller `visits-blocked-dashboard`, `visits-blocked-leads` | Cair no início sem susto | 8 | O redirecionamento mudo está certo; a nota final é a do início |
| reseller `tags-customers` phone | Achar o cliente | 6 | RCP-28 |
| reseller `tags-customers` desktop | Achar o cliente | 6 | RCP-28, 47 |
| reseller `tags-customer-27`, `tags-customer-30` phone | Ver as peças do cliente e o que falta | 5 | RCP-9, 17, 23, 29, 30, 31, 45 |
| reseller `tags-customer-27`, `tags-customer-30` desktop | Idem | 6 | RCP-17, 23, 29, 30, 31 |
| reseller `tags-shop` phone e desktop | Pedir mais peças | 2 | RCP-5, 32, 49 |
| reseller `tags-direct` phone e desktop | Gravar o link próprio do cliente num chip | 5 | RCP-19, 44, 47 |
| reseller `tags-pieces` phone | Ver o que ainda não está no ar | 5 | RCP-9, 14, 15, 16, 33 |
| reseller `tags-pieces`, `tags-pieces-search` desktop | Idem | 7 | RCP-14, 15, 33 |
| reseller `tags-piece-live`, `tags-piece-phone-route-live` phone | Saber para onde a peça abre | 5 | RCP-9, 13, 18, 43 |
| reseller `tags-piece-in-kit` phone | Configurar | 7 | RCP-9, 13, 14 |
| reseller `tags-piece-configured-no-chip` phone | Gravar o chip | 6 | RCP-9, 13, 18 |
| reseller `tags-piece-*` desktop | Idem | 7 | RCP-13, 14, 18 |
| reseller `tags-piece-unknown` desktop | Corrigir o código | 5 | RCP-36 |
| reseller `restricted-admin-home`, `restricted-admin-stock` | Voltar | 7 | RCP-35 |
| reseller `settings-profile` phone (lista) | Achar o ajuste | 7 | RCP-22 |
| reseller `settings-profile` e demais abas, desktop (página única) | Ajustar perfil e idioma | 6 | RCP-21, 22, 34 |
| reseller `settings-signin` phone | Ver o telefone de entrada | 5 | RCP-21 |
| reseller `settings-language` phone | Trocar o idioma | 9 | Nada |
| reseller `settings-organization` phone | Ver para quem trabalha | 5 | RCP-22 |
| reseller `settings-administration` phone | Nenhuma: tela não deveria existir para ele | 0 | RCP-20 |
| reseller `command-palette` desktop | Ir a uma tela | 8 | Só o nome "plain chip" (RCP-19) |
| reseller `organizations` desktop | Fora da lista pedida; aberta para comparar nomes | 5 | RCP-22, 23 |
| customer `my-plates` phone e desktop | Ver se a plaquinha está sendo usada | 8 | RCP-26, 37 |
| customer `my-plate-detail` phone e desktop | Idem, de uma plaquinha | 7 | RCP-26, 38, 46 |
| customer `my-plate-unknown` desktop | Voltar | 5 | RCP-39 |
| public `landing`, `/pt`, `/es` desktop | Entender e criar conta | 7 | RCP-42 |
| public `landing`, `/pt`, `/es` phone | Idem | 6 | RCP-41, 42 |
| public `login`, `login-with-next` | Entrar | 3 | RCP-25 |
| public `piece-live-qr`, `piece-live-nfc` | Stub do laboratório: redireciona e não dá para avaliar | n/a | n/a |
| public `piece-in-stock-not-live`, `piece-not-received` | Saber que ainda não funciona e quem resolve | 3 | RCP-7, 24, 48 |
| public `piece-configured-not-live` | Idem | 4 | RCP-24, 48 |
| public `piece-paused`, `piece-retired` | Saber que não funciona | 3 | RCP-6, 24, 48 |
| public `piece-unknown-code` | Conferir o código | 5 | RCP-24, 48 |
| public `privacy`, `privacy-pt`, `terms`, `terms-es` | Ler e conseguir falar com alguém | 5 | RCP-8, 27 |
| public `unknown-page` | Saber que a página não existe | 4 | RCP-40 |
| pending `pending-settings` | Saber que está em análise | 0 | RCP-1, 2 |
| pending `pending-tags` | Idem | 1 | RCP-2, 3 |
| pending `pending-admin` | Idem | 2 | RCP-2 |
| pending `pending-dashboard`, `pending-landing` | Idem | 3 | RCP-2 |

## S1

### RCP-1 [S1] Loader infinito em `/settings` para quem não tem acesso
Telas: pending/en-desktop/pending-settings, pending/en-phone/pending-settings
Problema: a pessoa vê três pontinhos azuis numa tela preta, para sempre, sem texto nem botão. É a única porta sem saída do app.
Causa provável (não reproduzi: `localhost:2110` respondeu 404 quando testei; a lógica foi conferida no fonte do `query-core`):
- `XpotSettings.tsx:325` só trata `isLoading`. Com o erro 403, ele segue e monta o `AppLayout`, cujos filhos abrem novos `useQuery` de `/api/xpot/me`.
- Um novo observador numa query com erro e sem dado refaz o fetch. Isso volta o status a `pending`, `isLoading` fica verdadeiro de novo e o `AppLoader` desmonta os filhos. O ciclo recomeça.
- A captura confirma o sintoma: 13 s no celular sem atingir `networkidle`. `/tags` (mesma query, sem filhos observando) termina em 2,4 s.
- Se a causa for essa, cada pessoa nessa tela martela o servidor sem parar. O mesmo vale para sessão expirada ou sem sessão (401).
Mudança: trocar a linha 325 pelo portão que `TagsApp` já usa: `if (!me) return <SessionGate failed={meQuery.isError} error={meQuery.error} />`, com o `SessionGate` de RCP-2 e RCP-3.
Arquivos: client/src/pages/xpot/XpotSettings.tsx:325, client/src/pages/tags/TagsApp.tsx:42, client/src/components/ui/spinner.tsx:65
Risco: nenhum de negócio. Confirmar no navegador contando as chamadas a `/api/xpot/me`.

### RCP-2 [S1] A pessoa pendente recebe 4 respostas diferentes e nenhuma diz "em análise"
Telas: pending/en-phone/pending-tags, pending-settings, pending-admin, pending-dashboard, pending-landing, e as mesmas em desktop
Problema:
- `/tags` diz "Failed to load session".
- `/settings` não diz nada (RCP-1).
- `/admin` mostra escudo vermelho, "Access restricted" e "Sign in to continue", para quem já entrou.
- `/` e `/dashboard` mostram a landing com "Sign in" e "Create an account", como se ela nunca tivesse se cadastrado.
O servidor já responde o motivo exato (`code: "pending"`, "Your sign-up is being reviewed…") e o cliente joga fora. Os textos certos também já existem em `signin.ts`.
O fluxo normal de entrada já mostra "under review" sem abrir sessão. Estas telas são de quem tem sessão viva e perdeu o acesso, ou de link salvo. É um caso raro, mas não pode ser um beco.
Mudança: uma única tela em todo portão de sessão (`SessionGate`, `AdminApp`, `VisitsGate`) quando o 403 trouxer `code`.
- `pending`: título `pendingTitle`, texto `pendingText`, botão de WhatsApp (o mesmo de `PhoneSignIn`), link "Sign out".
  - en: "Your sign-up is under review" / "The Xpot team got your request and will review it. Once it's approved, sign in with this same number."
  - pt: "Seu cadastro está em análise" / "A equipe do Xpot recebeu seu pedido e vai analisar. Quando ele for aprovado, entre com este mesmo número."
  - es: "Tu registro está en revisión" / "El equipo de Xpot recibió tu solicitud y la va a revisar. Cuando sea aprobada, entra con este mismo número."
- `blocked`: mesma tela com `blockedTitle` e `blockedText`.
- Sai o `<Redirect to="/" />` de 403 em `VisitsGate`. Sai o "Sign in to continue" para quem tem sessão.
Arquivos: client/src/components/xpot/SessionGate.tsx:10, client/src/App.tsx:76, client/src/pages/admin/AdminApp.tsx:59, client/src/components/PhoneSignIn.tsx:267, client/src/i18n/messages/signin.ts:47, server/routes/xpot/middleware.ts:60
Risco: nenhum de negócio. O `ApiError` precisa expor o `code` do 403.

### RCP-3 [S1] "Failed to load session" serve para tudo, inclusive sinal fraco na rua
Telas: pending/en-phone/pending-tags, pending/en-desktop/pending-tags. A queda de rede não foi capturada: visto só no código.
Problema: `TagsApp` mostra esse texto para qualquer erro de `/me`. Sessão expirada, rede caída e servidor fora dão a mesma tela e o mesmo botão.
- "Session" não significa nada para o revendedor.
- Não há "tentar de novo". Com sinal ruim na rua, o único botão é "Go to sign-in", que o manda para a página de marketing. O comentário de `pwa.ts:51` promete justamente que isso não aconteceria.
- A tela não diz nada sobre como ele chegou ali, e o botão não leva a uma tela de entrada (RCP-25).
Mudança: `SessionGate` passa a distinguir três casos.
- 401: redirecionar para `/` já com o diálogo de entrada aberto e a rota atual lembrada.
- 403 com código: RCP-2.
- Rede ou 5xx:
  - en: "We couldn't reach Xpot. Check your connection and try again." Botão "Try again".
  - pt: "Não conseguimos falar com o Xpot. Confira sua conexão e tente de novo." Botão "Tentar de novo".
  - es: "No pudimos conectar con Xpot. Revisa tu conexión e inténtalo de nuevo." Botão "Reintentar".
Arquivos: client/src/components/xpot/SessionGate.tsx:15, client/src/pages/tags/TagsApp.tsx:42, client/src/i18n/messages/common.ts:29, client/src/lib/pwa.ts:51
Risco: nenhum.

### RCP-4 [S1] O alerta vermelho do início afirma algo falso sobre a peça
Telas: reseller/en-phone/tags-home, reseller/en-desktop/tags-home, reseller/pt-desktop/tags-home, comparadas com reseller/en-phone/tags-piece-configured-no-chip e public/en-phone/piece-configured-not-live
Problema: "1 piece with its NFC chip not written. The QR code already works, but a phone tapped on this piece opens nothing."
A peça é a CA03GDEQ, com status "Ready, not live". Quem escaneia o QR dela hoje vê "This experience is almost ready", ou seja, o QR não funciona. O revendedor pode entregar a peça confiando no alerta e o cliente recebe uma tela de "quase pronto".
A causa está na contagem: `chipsMissing` soma `assigned` e `active`, e o texto só é verdade para `active`.
Mudança: tirar a afirmação sobre o QR.
- Título en: "1 piece isn't ready to hand over" / pt: "1 peça ainda não está pronta para entregar" / es: "1 pieza aún no está lista para entregar".
- Corpo en: "Write the chip so a phone tap opens the right place." / pt: "Grave o chip para o toque do celular abrir o lugar certo." / es: "Graba el chip para que el toque del teléfono abra el lugar correcto."
- A tela da peça segue explicando o próximo passo.
- Tom âmbar quando a peça ainda não está no ar. Vermelho só para peça `active` sem chip, porque aí já está na rua falhando. Isso exige separar a contagem no servidor.
Arquivos: client/src/i18n/messages/tags.ts:257,712,1158, client/src/pages/tags/TagsDashboard.tsx:127, server/tags/repository.ts:2326
Risco: nenhum no texto. A separação de cor é opcional e vale fazer junto.

### RCP-5 [S1] A loja manda comprar de quem não fornece o revendedor
Telas: reseller/en-phone/tags-shop, reseller/en-desktop/tags-shop, reseller/pt-desktop/tags-shop, reseller/en-desktop/settings-profile, reseller/en-phone/settings-organization
Problema: o topo diz "What Skale Club sells. You order and pay in the Stuscle store, at your wholesale price." Logo abaixo dos produtos: "Your pieces come from Harbor Print Co.." (com ponto duplo).
- O mesmo revendedor vê três empresas sem explicação: Skale Club (loja), Harbor Print (peças), Lindgren (Settings).
- A distribuição própria da Harbor é justamente o caso em que o `WholesaleCard` esconde o código. Mesmo assim, os cartões prometem "your wholesale price" e levam a outra loja.
- A tela de perfil mostra "YOUR WHOLESALE CODE XP-KB06-RSLR", que a loja não usa. Esse código pode ser só do seed; conferir.
Mudança:
- Com `wholesale.partner` definido, a aba Shop não mostra catálogo nem preço. Mostra:
  - en: "Your pieces come from {name}. To get more, talk to them." (botão de contato, se houver telefone)
  - pt: "Suas peças vêm de {name}. Para pedir mais, fale com eles."
  - es: "Tus piezas vienen de {name}. Para pedir más, habla con ellos."
- Consertar o ponto duplo: não acrescentar "." quando o nome já termina em ponto.
- O código de atacado sai do perfil nesse caso.
Arquivos: client/src/pages/tags/ShopScreen.tsx:232,253, client/src/pages/tags/WholesaleCard.tsx:32, client/src/i18n/messages/tags.ts:436,437, client/src/pages/xpot/XpotSettings.tsx:416
Risco: regra de negócio; depende do dono. Recomendo: revendedor de parceiro com distribuição própria não compra da Skale Club por este app. O "Skale Club" fixo já está no plano (SIMPLICITY_AUDIT item 2b).

### RCP-6 [S1] Peça desativada para sempre aparece como "Temporarily offline"
Telas: public/en-phone/piece-retired, public/en-desktop/piece-retired, comparadas com piece-paused (idênticas)
Problema: pausada e desativada mostram a mesma página: "Temporarily offline. The piece itself is still recognized". Para a peça desativada, "temporarily" é falso e o cliente fica esperando. "Still recognized" não diz nada a quem escaneou.
O servidor esconde o motivo de propósito (comentário em `publicHandler.ts`), então a saída é um texto neutro que sirva aos dois casos.
Mudança: trocar `state` e `detail` do bloco `unavailable`.
- en: "Not available" / "Ask the business where you found it."
- pt: "Indisponível" / "Pergunte no local onde você encontrou a peça."
- es: "No disponible" / "Pregunta en el lugar donde encontraste la pieza."
Arquivos: server/tags/publicPages.ts:50,88
Risco: nenhum. Mantém a regra de não expor o motivo.

### RCP-7 [S1] A página pública garante "QR + NFC are ready" sem saber se é verdade
Telas: public/en-phone/piece-not-received, public/en-phone/piece-in-stock-not-live, public/en-desktop dos mesmos; comparadas com reseller/en-phone/tags-pieces (ícone vermelho de chip nas peças sem cliente)
Problema: "The piece is verified and connected." e "QR + NFC are ready" aparecem em toda peça `inventory`. Isso inclui peça ainda não recebida (lote só pedido) e peça cujo chip nunca foi gravado. O próprio app marca essas peças como chip pendente, então a página contradiz o app.
Mudança: remover as frases sobre verificação e sobre QR/NFC; a nova redação está em RCP-24.
Arquivos: server/tags/publicPages.ts:30-37 (e as cópias pt/es)
Risco: nenhum.

### RCP-8 [S1] Quem tem direito sobre os dados não tem como falar com o Xpot
Telas: public/en-desktop/privacy, public/en-phone/privacy, public/en-desktop/privacy-pt, public/en-desktop/terms, public/en-phone/terms, public/en-desktop/terms-es
Problema: a seção 1 diz "You can reach us through the contact at the end of this page". A seção 8 diz "People at businesses recorded in Xpot can make the same requests. Contact us". O fim da página diz só "Use the support contact shown in the app when you sign in."
O contato é circular. Quem não tem conta (dono de negócio cadastrado, pessoa que escaneou) não tem como exercer o direito que a página promete, em LGPD, GDPR ou CCPA. O mesmo cartão está em Terms.
Mudança: trocar a frase por um contato real e visível, sem login, nas 3 línguas, em privacy e terms.
- en: "Write to {contato}. We reply within 30 days."
- pt: "Escreva para {contato}. Respondemos em até 30 dias."
- es: "Escribe a {contato}. Respondemos en un plazo de 30 días."
Arquivos: client/src/pages/legal/content.ts:24,99 e o cartão de contato; client/src/pages/legal/LegalPage.tsx
Risco: depende do dono (qual endereço) e de revisão jurídica. Recomendo um e-mail dedicado a privacidade.

## S2

### RCP-9 [S2] O cabeçalho come a tela, até dentro de uma peça
Telas: reseller/en-phone/tags-home, tags-customers, tags-customer-27, tags-shop, tags-direct, tags-pieces, tags-piece-live, tags-piece-in-kit, tags-piece-configured-no-chip
Problema: toda tela começa com avatar de 62 px, "GOOD EVENING / Kevin 👋 / Sunday, November 1", engrenagem, sair, e o logo em linha própria.
- São 130 px de 844 antes do conteúdo. O código da peça só começa em y≈150, 18% da altura.
- Numa peça, ele quer ver a peça. "Good evening" não ajuda e se repete em toda tela.
- O logo não leva a lugar nenhum nem informa nada.
- Settings e `/my` já funcionam sem esse cabeçalho, com voltar + título, e ficam melhores.
Mudança:
- Telas internas (peça, cliente, chip): sem `ShellHeader` nem logo. Só voltar + título.
- Telas de aba (Home, Customers, My pieces, Shop): barra de 48 px com o título da tela e a engrenagem.
- Saem do celular: saudação, emoji, data, logo. O avatar e sua troca ficam em Settings, onde a troca já existe.
- A bolinha "online" vira uma faixa que só aparece quando estiver offline.
Arquivos: client/src/pages/tags/TagsApp.tsx:60-71, client/src/components/xpot/ShellHeader.tsx:62-96, client/src/components/xpot/UserGreeting.tsx
Risco: o `ShellHeader` é compartilhado com Visitas. Recomendo decidir uma vez para os dois módulos. Esta auditoria só comprova o caso de Tags.

### RCP-10 [S2] O início é um relatório, e não diz o que fazer
Telas: reseller/en-phone/tags-home, reseller/en-desktop/tags-home, reseller/pt-desktop/tags-home, reseller/en-phone/visits-blocked-dashboard
Problema: depois de "Read a piece" vêm 4 KPIs, gráfico, "Recent scans", "Most scanned pieces", "Customers with the most scans" e "Phones used". São 1605 px no celular. Nos dados do Kevin, as 3 listas mostram a mesma Malden Hardware. As 2 peças sem cliente não aparecem em lugar nenhum. O próprio plano diz que o trabalho desta tela é "Ler uma peça e configurar para o cliente" (SIMPLICITY_AUDIT, linha 185).
Mudança: no perfil revendedor, fora da visão de gestão (`fleet`):
- Fica: "Read a piece".
- Entra logo abaixo o bloco "To do / A fazer / Por hacer", com uma linha por tipo, cada uma levando à lista filtrada:
  - "1 piece to finish" (com o texto de RCP-4)
  - "2 pieces with no customer yet"
  - "1 paused piece", se houver
- Com nada pendente: "All your pieces are live" / "Todas as suas peças estão no ar" / "Todas tus piezas están activas".
- Entra um link "See results / Ver resultados / Ver resultados" para uma tela nova.
- Vão para essa tela de resultados: "Scans (30 days)" com o gráfico, "Most scanned pieces" e "Customers with the most scans".
- Saem de vez: "Recent scans" e "Phones used" (RCP-11), e os KPIs "With you" e "Live", repetidos em My pieces.
Arquivos: client/src/pages/tags/HomeScreen.tsx:250, client/src/pages/tags/TagsDashboard.tsx:148-267
Risco: depende do dono. O plano adiou isso "depois de ver uso real" (item 7). Recomendo fazer já: as 3 listas repetidas se resolvem sozinhas. A visão de gestão continua com o painel.

### RCP-11 [S2] "Phones used" lista Windows e macOS
Telas: reseller/en-phone/tags-home, reseller/en-desktop/tags-home, reseller/pt-desktop/tags-home
Problema: o título diz "Phones used" e as linhas dizem iOS 11, Android 5, Windows 4, macOS 2. Além do erro, ninguém na rua decide nada com isso. "Est. visitors: 22", ao lado de "22 scans", também não acrescenta nada.
Mudança: sai do revendedor (RCP-10). Se ficar na gestão: "Devices / Aparelhos / Dispositivos". Sai "Est. visitors" do revendedor.
Arquivos: client/src/i18n/messages/tags.ts:243,248,704,1150, client/src/pages/tags/TagsDashboard.tsx:161,261
Risco: nenhum.

### RCP-12 [S2] Sair da conta a um toque, ao lado da engrenagem
Telas: reseller/en-phone/tags-home e todas as telas com cabeçalho
Problema: o botão de sair fica colado na engrenagem, no canto de toque do polegar, e age sem confirmação. Na rua, um toque errado obriga a refazer o código por SMS. Enquanto isso, a tela de Settings do celular não tem "Sign out".
Mudança: sai do cabeçalho do celular. Entra no fim da lista de Settings, com confirmação:
- en: "Sign out of Xpot?" / "You'll need a text code to come back."
- pt: "Sair do Xpot?" / "Para voltar, você vai precisar de um código por SMS."
- es: "¿Salir de Xpot?" / "Para volver necesitarás un código por SMS."
Arquivos: client/src/components/xpot/ShellHeader.tsx:105, client/src/pages/xpot/XpotSettings.tsx:585
Risco: nenhum.

### RCP-13 [S2] "With Kevin Brooks" para o próprio Kevin, e numa peça que está no cliente
Telas: reseller/en-phone/tags-piece-live, tags-piece-in-kit, tags-piece-configured-no-chip, reseller/en-desktop dos mesmos, reseller/en-phone/tags-home
Problema:
- "With Kevin Brooks · Kit K-0003" aparece para o próprio Kevin. O glossário manda "With me".
- Na peça Live, ela está no balcão da Malden Hardware, mas a linha diz que está com ele. Duas linhas abaixo aparece o cliente.
- O KPI "With you 4" conta as 4 peças, inclusive essa, e o "Sold 0" não explica o resto.
- "Kit K-0003" não ajuda na rua.
Mudança: com o portador igual a quem está vendo:
- Peça sem cliente: "With me / Comigo / Conmigo".
- Peça com cliente: a linha some; fica só o cliente.
- "Kit K-…" vai para "More details".
Arquivos: client/src/components/piece/PieceHeader.tsx:79-92, client/src/i18n/messages/pieceScreen.ts:19, client/src/i18n/messages/tags.ts:67
Risco: regra de custódia. "With you" conta consignação. Peça com o Kevin e peça no cliente seguem separadas no estoque; muda só o que ele lê. O KPI sai junto em RCP-10.

### RCP-14 [S2] O mesmo estado tem nomes diferentes na lista e na peça
Telas: reseller/en-phone/tags-pieces comparada com tags-piece-in-kit e tags-piece-configured-no-chip; reseller/en-desktop/tags-pieces
Problema:
- ES7FKKRZ: na lista "No customer yet", ao abrir "In stock" e ainda "No customer yet" na linha de baixo.
- CA03GDEQ: na lista "Ready, not live" + "Chip not written", ao abrir "Ready, chip not written yet".
- No desktop, a mesma linha diz "No customer yet" duas vezes (coluna COMPANY e coluna STATUS).
Mudança: a peça usa a mesma palavra da lista, que é a do glossário.
- `situation_inStock` para quem é revendedor: "No customer yet / Sem cliente / Sin cliente". A linha repetida embaixo some.
- `situation_readyNoChip` e a lista usam o mesmo par: "Ready, not live" + "Chip not written".
- No desktop, coluna COMPANY vazia com "—" quando não há cliente.
Arquivos: client/src/i18n/messages/pieceScreen.ts:113-115, client/src/i18n/messages/tags.ts:121, client/src/components/piece/PieceHeader.tsx
Risco: a tela de peça é compartilhada com a gestão, onde "In stock" faz sentido. Trocar só para o revendedor.

### RCP-15 [S2] O filtro não tem a opção de que ele mais precisa
Telas: reseller/en-phone/tags-pieces, reseller/en-desktop/tags-pieces, reseller/en-desktop/tags-pieces-search
Problema: os chips são All, No customer yet, Live, Paused. A CA03GDEQ, única que pede ação, não cai em nenhum além de All. No celular, "Paused" fica cortado em "Paus" e "More filters" ocupa uma linha inteira para 4 peças.
Mudança: chips "All / To finish / No customer yet / Live" (pt: "Todas / Para terminar / Sem cliente / No ar"; es: "Todas / Por terminar / Sin cliente / Activas"). "To finish" = com cliente e fora do ar, ou chip pendente. "Paused" vai para "More filters". Nas telas com até 10 peças, busca e "More filters" na mesma linha.
Arquivos: client/src/pages/tags/PiecesScreen.tsx:27,165
Risco: nenhum.

### RCP-16 [S2] Na lista do celular, o nome do cliente some e a pílula cobre o tamanho
Telas: reseller/en-phone/tags-pieces
Problema: "Lowell ..." é tudo o que resta de Lowell Street Laundromat, e "instagram...." é tudo do destino. A pílula "Chip not written" encosta e cobre o selo "L". O cliente é justamente o que ele procura nessa lista.
Mudança: no celular, linha em 3 andares: cliente em largura total; código + selos; pílulas. O destino sai da linha no celular.
Arquivos: client/src/pages/tags/PiecesScreen.tsx:280-288
Risco: nenhum.

### RCP-17 [S2] "Change destination" sem nada selecionado muda todas as peças do cliente
Telas: reseller/en-phone/tags-customer-27, tags-customer-30, reseller/en-desktop/tags-customer-27, tags-customer-30, reseller/pt-desktop/tags-customer-27
Problema: o botão aparece igual com ou sem seleção e não diz o alcance. O código aplica a todas quando nada está marcado. Um revendedor que quer trocar um link pode trocar os de todas as peças de um cliente. O título da folha seguinte traz a quantidade, mas a folha não foi capturada.
Além disso, a linha tem checkbox mesmo com uma só peça, e um ícone de corrente quebrada sem rótulo que remove o cliente.
Mudança:
- Com 1 peça: sem checkbox; "Change destination".
- Com várias e nada marcado: "Change all (3) / Alterar todas (3) / Cambiar todas (3)".
- Com marcadas: "Change selected (2) / Alterar selecionadas (2) / Cambiar seleccionadas (2)".
- O ícone da corrente sai da linha: "Remove customer" fica na tela da peça.
Arquivos: client/src/pages/tags/CustomerScreen.tsx:266,369,414
Risco: nenhum de regra. Confirmar se a folha avisa antes de salvar.

### RCP-18 [S2] A peça no ar destaca o menos urgente e aperta o principal
Telas: reseller/en-phone/tags-piece-live, tags-piece-configured-no-chip, reseller/en-desktop dos mesmos, reseller/es-desktop/tags-piece-configured-no-chip
Problema: esta é a tela que ele veio ver.
- O botão principal da peça no ar é "See performance", e a resposta a "para onde ela abre?" fica abaixo, cortada em "search.google.com…".
- O cliente aparece duas vezes, a segunda cortada: "Malden Ha...".
- Essa linha cortada ainda divide espaço com um lápis (que renomeia a empresa em todo o sistema) e "Change customer", duas ações parecidas e de efeito bem diferente.
Mudança:
- Bloco único, nesta ordem: "Customer: Malden Hardware [Change]"; "Opens: Google Review [Change] [abrir] [copiar]".
- O lápis sai daqui e fica na tela do cliente.
- "See performance" vira botão secundário sob o bloco. Para peça no ar, nenhum botão colorido é obrigatório.
- A peça sem cliente (Set up) e a sem chip (Write chip) continuam como estão: lá o destaque está certo.
Arquivos: client/src/components/piece/PieceBody.tsx, client/src/components/piece/PieceHeader.tsx
Risco: a tela é compartilhada com a gestão. Pode coincidir com a área da peça de outro auditor; alinhar antes de mexer.

### RCP-19 [S2] "Write a plain chip" não diz o que é
Telas: reseller/en-phone/tags-direct, reseller/en-desktop/tags-direct, reseller/es-desktop/tags-direct, reseller/en-desktop/command-palette
Problema: "plain chip" é jargão, e EN diverge de PT/ES ("Gravar chip sem o Xpot"), que estão certos. "THE CUSTOMER'S OWN CONTENT" é outra expressão que não ajuda. "No analytics" é termo técnico. O aviso não diz a consequência em palavras simples.
Mudança:
- `navDirect` en: "Write a chip without Xpot".
- `directEyebrow`: remover.
- `directExplain`:
  - en: "The chip opens the customer's own link directly. You won't see its scans, and changing it means writing the chip again."
  - pt: "O chip abre direto o link do próprio cliente. Você não vê as leituras, e para mudar é preciso gravar o chip de novo."
  - es: "El chip abre directamente el enlace del cliente. No verás sus lecturas y para cambiarlo hay que grabar el chip otra vez."
- `recentDirect` en: "Recent chips without Xpot".
- `openDirect` en: "Write without Xpot instead".
Arquivos: client/src/i18n/messages/tags.ts:12,92,407,408,415 (e pt/es)
Risco: nenhum.

### RCP-20 [S2] Tela totalmente vazia chamada "My company"
Telas: reseller/en-phone/settings-administration (no desktop a seção apenas não aparece)
Problema: o revendedor sem permissão abre `?tab=administration` e vê só o título "My company" numa tela preta. A linha não aparece na lista dele, então só se chega por link antigo. Mesmo assim, a página mente: parece que a empresa dele sumiu.
Mudança: seção sem permissão cai na lista de Settings. Em `XpotSettings`, `linkedSection === "administration" && !canManage` é tratado como `null`.
Arquivos: client/src/pages/xpot/XpotSettings.tsx:227,524,552
Risco: nenhum.

### RCP-21 [S2] "To change it, ask the platform"
Telas: reseller/en-phone/settings-signin, reseller/en-desktop/settings-profile
Problema: "the platform" é palavra interna, e não diz com quem falar. O campo desabilitado parece editável.
Mudança:
- en: "To change it, talk to the Xpot team."
- pt: "Para mudar, fale com a equipe do Xpot."
- es: "Para cambiarlo, habla con el equipo de Xpot."
Mostrar o telefone como texto, não como campo.
Arquivos: client/src/i18n/messages/navIa.ts:29 (e pt/es)
Risco: revendedor de parceiro talvez deva falar com o parceiro. Recomendo manter "equipe do Xpot" até haver o nome da casa (item 2b).

### RCP-22 [S2] "My organization" contra "My company", e um texto estranho
Telas: reseller/en-phone/settings-profile, settings-organization, settings-administration, reseller/en-desktop/settings-organization
Problema:
- O glossário fechou "My company", mas a tela segue "My organization", e "My company" é usado no painel do dono.
- No celular, rótulo e valor são ambos cortados: "My organiz..." e "Lindgren Local Gro...".
- "You work in this organization. Your pieces and companies are yours." não diz nada que ele possa usar.
Mudança:
- `sectionTitle` en: "My company" / pt: "Minha empresa" / es: "Mi empresa".
- `employeeHint`:
  - en: "You work for this company. Your pieces and customers stay under your name."
  - pt: "Você trabalha para esta empresa. Suas peças e clientes ficam no seu nome."
  - es: "Trabajas para esta empresa. Tus piezas y clientes quedan a tu nombre."
Arquivos: client/src/i18n/messages/addPerson.ts:22,28,55,79, client/src/i18n/messages/workspaces.ts:8-9
Risco: confirmar com o dono se "ficam no seu nome" é a regra.

### RCP-23 [S2] Cliente, empresa, negócio: três palavras para a mesma coisa; "Chapa" e "placa" para a mesma peça
Telas: reseller/en-desktop/tags-customers, tags-pieces, tags-customer-27, reseller/en-phone/tags-direct, settings-organization, reseller/pt-desktop/tags-home, tags-customer-27, reseller/es-desktop/tags-piece-configured-no-chip, reseller/en-desktop/organizations
Problema:
- O menu diz "Customers". A tabela diz "COMPANY". A busca diz "Search code, company or label". O formulário diz "Search companies". O acesso diz "this business's plates".
- Em PT e ES o selo diz "CHAPA", mas a mesma tela diz "placas" e a loja diz "Large Plate".
- O selo "L" (em PT, "G") não tem explicação ao lado.
Mudança:
- No módulo Tags, "customer / cliente / cliente" em toda a interface. "COMPANY" vira "CUSTOMER". "Search companies" vira "Search customers".
- `plaqueModel_Plate` pt e es: "Placa". No selo de tamanho, usar a palavra por extenso na tela da peça: "Large / Grande / Grande".
Arquivos: client/src/i18n/messages/tags.ts:610,1056, client/src/pages/tags/PiecesScreen.tsx, client/src/pages/tags/CustomersScreen.tsx, client/src/i18n/messages/myPlates.ts:70
Risco: Tags e Visitas compartilham a empresa (Leads). A decisão D6 manteve Leads/Clientes em Visitas. Mudar só nas telas de Tags.

### RCP-24 [S2] A página pública fala de "experience" e empurra todo mundo para vender Xpot
Telas: public/en-phone/piece-in-stock-not-live, piece-not-received, piece-configured-not-live, piece-paused, piece-retired, piece-unknown-code, e public/en-desktop dos mesmos
Problema: quem escaneia é um cliente no balcão, querendo deixar uma avaliação.
- Ele lê "This Xpot is ready to come alive.", "This experience is almost ready.", "Setup in progress" (ninguém está configurando nada agora), "The physical link is verified". "A Xpot" não significa nada para ele.
- O único botão é o grande "Discover Xpot", que o leva a uma página para virar vendedor.
- "Own this piece? Sign in to Xpot" é só texto, sem link.
Mudança: o cartão diz o que aconteceu e pronto. O botão colorido sai, salvo se houver URL de configuração. Vira um link discreto no rodapé: "What's Xpot?".

| Estado | en | pt | es |
|---|---|---|---|
| inventory | "This piece isn't set up yet." / "Ask the business where you found it." | "Esta peça ainda não foi configurada." / "Pergunte no local onde você a encontrou." | "Esta pieza aún no está configurada." / "Pregunta en el lugar donde la encontraste." |
| assigned | "This piece will be ready soon." / "Scan it again later, or ask the business." | "Esta peça estará pronta em breve." / "Escaneie de novo mais tarde ou pergunte no local." | "Esta pieza estará lista pronto." / "Escanéala de nuevo más tarde o pregunta en el lugar." |
| unavailable | "This piece isn't available." + RCP-6 | "Esta peça não está disponível." + RCP-6 | "Esta pieza no está disponible." + RCP-6 |
| not_found | "We couldn't find this code." / "Check the printed code or ask whoever gave it to you." | "Não encontramos este código." / "Confira o código impresso ou fale com quem entregou a peça." | "No encontramos este código." / "Revisa el código impreso o habla con quien te dio la pieza." |

Para quem administra a peça, um link em todos os estados exceto `not_found`: "Set up this piece / Configurar esta peça / Configurar esta pieza", levando a `/tags?code=…`, que passa pela entrada.
Arquivos: server/tags/publicPages.ts:28-145,204-235
Risco: `Discover Xpot` é divulgação e pode ser desejado pelo dono. Recomendo o link discreto: quem escaneou não é o público da landing.

### RCP-25 [S2] Não existe tela de entrada: `/login` e "Go to sign-in" caem na landing sem abrir nada
Telas: public/en-desktop/login, login-with-next, public/en-phone/login, pending/en-phone/pending-tags, pending-admin
Problema: `/login` redireciona para `/` sem abrir o diálogo, e `?next=/tags/pieces` se perde em `cleanUrl()`. "Go to sign-in" faz o mesmo: o botão promete uma coisa e entrega a página de marketing. A pessoa precisa achar "Sign in" sozinha.
Mudança: `/login` sem callback em andamento abre a landing com o diálogo aberto e guarda o `next`. "Go to sign-in" faz o mesmo. Usar o mecanismo que a landing já tem (`rememberPostLoginRedirect`, `setIsLoginOpen`).
Arquivos: client/src/pages/Login.tsx:50,62-76,140, client/src/pages/xpot/XpotLandingPage.tsx:262-280, client/src/components/xpot/SessionGate.tsx:20
Risco: o redirect só pode aceitar caminho interno. O diálogo de entrada não foi capturado (ver lacunas).

### RCP-26 [S2] `/my`: número sem o que está sendo contado
Telas: customer/en-phone/my-plate-detail, customer/en-desktop/my-plate-detail, customer/en-phone/my-plates, customer/en-desktop/my-plates
Problema: "57 THIS WEEK" e "156 30 DAYS". 57 o quê? Quem não conhece o produto não sabe, e o ícone não ajuda. A lista tem "57 scans this week" logo abaixo, então lá o número é repetido, não explicado.
Mudança: `kpiWeek`, `kpiMonth`:
- en: "Scans this week" / "Scans in 30 days"
- pt: "Leituras na semana" / "Leituras em 30 dias"
- es: "Lecturas esta semana" / "Lecturas en 30 días"
Conferir o corte do rótulo nos 3 KPIs da lista (rótulo em 2 linhas).
Arquivos: client/src/i18n/messages/myPlates.ts:39,40,123,124,201,202
Risco: nenhum.

### RCP-27 [S2] A política de privacidade não cobre o dono da plaquinha
Telas: public/en-desktop/privacy, public/en-phone/privacy, public/en-desktop/privacy-pt, comparadas com customer/en-phone/my-plates e reseller/en-phone/tags-customer-27
Problema: a abertura descreve quem usa o app como "sales reps, managers and admins". O `/my` tem outro público: o dono do negócio, que entra com telefone e SMS, e cujo telefone é acrescentado pelo revendedor. Não há seção para esse caso.
Mudança: acrescentar "business owners who read their pieces" na abertura e, em "What we collect", um item:
- en: "Piece owners. The phone number a seller adds for a business, the sign-in codes we text to it, and when it was last used."
- pt: "Donos de peças. O telefone que um vendedor adiciona para um negócio, os códigos de acesso que enviamos a ele e quando foi usado pela última vez."
- es: "Dueños de piezas. El teléfono que un vendedor agrega para un negocio, los códigos de acceso que le enviamos y cuándo se usó por última vez."
Arquivos: client/src/pages/legal/content.ts:19 (e pt/es)
Risco: pede revisão jurídica. Conferir o que o `/my` guarda de fato.

## S3

### RCP-28 [S3] Customers: 4 KPIs acima de uma lista que já diz tudo
Telas: reseller/en-phone/tags-customers, reseller/en-desktop/tags-customers
Problema: "2 CUSTOMERS WITH PIECES" (eyebrow), título, KPIs 2, 2, 1, 22 em 230 px, e a lista de 2 linhas que repete os mesmos números. No celular, a lista só começa em y≈535. Busca em cartão próprio para 2 clientes.
Mudança: saem eyebrow e KPIs. A busca só aparece com 8 clientes ou mais. Na linha, um aviso quando há o que fazer ("1 piece to finish"), no lugar de "0 live".
Arquivos: client/src/pages/tags/CustomersScreen.tsx:128,144-147,153
Risco: nenhum no revendedor. O dono usa outra tela.

### RCP-29 [S3] "Plate owner access": bloco longo, nome interno, campo cortado
Telas: reseller/en-phone/tags-customer-27, tags-customer-30, reseller/en-desktop dos mesmos, reseller/pt-desktop/tags-customer-27
Problema: "Plate owner access" e 4 linhas de texto para explicar uma coisa simples. "Phone numb" é o que sobra do placeholder no celular, e "Allow" fica apertado. Em PT, o país veio +55 para um cliente dos EUA porque segue o idioma do aparelho.
Mudança:
- `accessTitle`: "Who can see these plates / Quem pode ver estas placas / Quién puede ver estas placas".
- `accessHint`:
  - en: "Send this link. They sign in with the code on a plate and a text message."
  - pt: "Envie este link. A pessoa entra com o código da placa e um SMS."
  - es: "Envía este enlace. Entran con el código de la placa y un SMS."
- No celular, país + telefone na linha 1 e "Allow" na linha 2, largura total.
- País padrão: o do telefone da empresa, quando houver.
Arquivos: client/src/i18n/messages/myPlates.ts:69,70,150,151,228,229, client/src/pages/tags/CustomerAccess.tsx:34,133-150
Risco: nenhum.

### RCP-30 [S3] Dados da empresa: telefone cru, e-mail partido, nome repetido
Telas: reseller/en-phone/tags-customer-27, tags-customer-30, reseller/en-desktop dos mesmos
Problema: "+16175551182" e, mais abaixo no mesmo cartão, "+1 (617) 555-1182". E-mail quebrado no meio da palavra: "hello@maldenh / ardware.com", e "hello@lowellstre / etlaundromat.co / m" no desktop. "Customer name" repete o título da tela.
Mudança: exibir o telefone com `formatPhone`. E-mail em linha inteira, sem o botão ao lado. No celular, cartão recolhido por padrão com "Company details". O nome some enquanto não está em edição.
Arquivos: client/src/pages/tags/CustomerScreen.tsx:481,482
Risco: nenhum.

### RCP-31 [S3] Cartão do Google vazio, com "Unlink" a um toque
Telas: reseller/en-phone/tags-customer-27, tags-customer-30, reseller/en-desktop dos mesmos, reseller/pt-desktop/tags-customer-27
Problema: o cartão mostra só o título e "Unlink". O vazio pode ser o Google fora no laboratório, mas o código não trata erro: se a consulta falha, não aparece nada. "Unlink" age sem confirmar.
Mudança: se a consulta falhar: "Couldn't load the Google profile. Try again." com botão. "Unlink" pede confirmação.
Arquivos: client/src/pages/tags/CustomerScreen.tsx:116,121-143
Risco: nenhum.

### RCP-32 [S3] Texto da loja cheio de sistema e repetido em cada cartão
Telas: reseller/en-phone/tags-shop, reseller/en-desktop/tags-shop, reseller/pt-desktop/tags-shop
Problema: "Piece model", "Reference price $50.00", "The price that counts is the one in Stuscle." em cada cartão. O texto do topo explica "Add to cart", mas 2 dos 3 cartões dizem "See it in the store". No celular a tela não tem título, ao contrário das outras abas. Vale para quem compra de fato pela loja; ver RCP-5.
Mudança:
- Topo, uma frase. en: "Order more pieces. Checkout happens in the store, at your wholesale price." / pt: "Peça mais peças. A compra termina na loja, com o seu preço de atacado." / es: "Pide más piezas. La compra termina en la tienda, con tu precio mayorista."
- Sai `shopOpensStore`.
- Sai a nota por cartão. O preço passa a ser "About $50.00 / Cerca de US$ 50,00 / Unos US$ 50,00".
- Sai a pílula "Piece model"; fica só "Ready-made kit".
Arquivos: client/src/i18n/messages/tags.ts:437-443,455 (e pt/es), client/src/pages/tags/ShopScreen.tsx:144,164,253
Risco: "o preço que vale é o da Stuscle" pode ter razão comercial. "About" cobre o mesmo sentido.

### RCP-33 [S3] "Your pieces come from…" em My pieces, toda vez
Telas: reseller/en-phone/tags-pieces, reseller/en-desktop/tags-pieces, tags-pieces-search
Problema: uma faixa de largura total em todo acesso à lista, sem ação nenhuma.
Mudança: sai de My pieces. Fica só em Shop (RCP-5) e em "More details" da peça.
Arquivos: client/src/pages/tags/PiecesScreen.tsx:305
Risco: nenhum.

### RCP-34 [S3] Perfil pede e mostra o que o revendedor não usa
Telas: reseller/en-desktop/settings-profile, settings-signin, settings-language, settings-organization, settings-administration
Problema:
- "Shown to your team and on your visits." para quem não tem Visitas.
- First name, Last name e Display name: três campos para o nome.
- "Contact phone (not used to sign in)" em "6175550106", e abaixo "Sign-in phone" em "+1 (617) 555-0106".
- O menu lateral perde Home, Customers e My pieces ao entrar em Settings.
Mudança:
- `photoHint` para quem só tem Tags: "Shown to your team. / Aparece para a sua equipe. / Se muestra a tu equipo."
- "Display name" recolhido em "More".
- Telefone sempre formatado.
- O menu do módulo continua visível em Settings.
Arquivos: client/src/i18n/messages/navIa.ts:26, client/src/pages/xpot/XpotSettings.tsx, client/src/components/xpot/AppLayout.tsx
Risco: nenhum.

### RCP-35 [S3] Vermelho para quem só entrou no lugar errado
Telas: reseller/en-phone/restricted-admin-home, reseller/en-desktop/restricted-admin-home, restricted-admin-stock
Problema: cartão vermelho com escudo, "Access restricted", "You don't have access to management". Nada está quebrado, e "management" é palavra interna. Seta e botão fazem a mesma coisa.
Mudança: tom neutro, sem a seta.
- en: "This area is for company managers." / "Back to Xpot"
- pt: "Esta área é para quem gerencia a empresa." / "Voltar ao Xpot"
- es: "Esta área es para quienes gestionan la empresa." / "Volver a Xpot"
Arquivos: client/src/pages/admin/AdminApp.tsx:59, client/src/i18n/messages/manage.ts:11,12,14,235,237,446
Risco: nenhum.

### RCP-36 [S3] Código não encontrado, sem próximo passo
Telas: reseller/en-desktop/tags-piece-unknown
Problema: título "ZZZZZZZZ", depois "No piece with code ZZZZZZZZ." Repete o código e para aí.
Mudança: título "Piece not found / Peça não encontrada / Pieza no encontrada". Corpo:
- en: "Check the code on the piece. If it's right, this piece may not be yours."
- pt: "Confira o código na peça. Se estiver certo, talvez ela não seja sua."
- es: "Revisa el código en la pieza. Si es correcto, quizá no sea tuya."
Mais um botão "Read another piece".
Arquivos: client/src/i18n/messages/tags.ts:94,560,1006
Risco: a mensagem não pode revelar se a peça existe para outra pessoa. Este texto não revela.

### RCP-37 [S3] `/my`: falta o nome do negócio, e "plate" para um Stand
Telas: customer/en-phone/my-plates, customer/en-desktop/my-plates
Problema:
- O nome do negócio só aparece com 2 negócios ou mais, então o dono não confirma que está vendo o dele.
- "57" aparece duas vezes.
- O título diz "My plates" e a peça é um "Large Stand". O glossário reserva "Plate" e "Stand" para produtos.
Mudança:
- Sempre mostrar o nome do negócio sob o título.
- Com 1 peça, saem os KPIs: a linha da peça diz tudo.
- Trocar "plates" por "pieces" no `/my` depende de decisão.
Arquivos: client/src/pages/my/Plates.tsx:70-72,81, client/src/i18n/messages/myPlates.ts:35
Risco: depende do dono. O plano cita `/my` como referência de tom por usar "plates". Recomendo manter "plates" até haver muitos Stands em uso, e só resolver o nome do negócio agora.

### RCP-38 [S3] `/my`: URL crua e "Large Stand" solto
Telas: customer/en-phone/my-plate-detail, customer/en-desktop/my-plate-detail
Problema: "https://search.google.com/local/writereview?placeid=ChIJlabReview" em duas linhas para um dono de negócio, partida no meio. "Large Stand" sozinho no fim do cartão repete o título.
Mudança: mostrar o nome do destino ("Google Review") e o domínio; o link inteiro só atrás de "Open this link". Sai "Large Stand".
Arquivos: client/src/pages/my/PlateDetail.tsx:94-103
Risco: nenhum.

### RCP-39 [S3] `/my`: placa não encontrada sem botão
Telas: customer/en-desktop/my-plate-unknown
Problema: "We couldn't find that plate." e só a seta pequena no alto.
Mudança: botão "Back to my plates / Voltar às minhas placas / Volver a mis placas".
Arquivos: client/src/pages/my/PlateDetail.tsx:28, client/src/i18n/messages/myPlates.ts:61
Risco: nenhum.

### RCP-40 [S3] Página inexistente vira landing sem aviso
Telas: public/en-desktop/unknown-page
Problema: `/this-page-does-not-exist` cai em "Sell on your schedule", sem dizer que o endereço está errado. Quem clicou num link antigo acha que foi enganado. A causa é que toda rota desconhecida entra no `VisitsGate`, que redireciona em 401.
Mudança: rota desconhecida sem sessão mostra:
- en: "We couldn't find this page." / botão "Go to the home page"
- pt: "Não encontramos esta página." / "Ir para o início"
- es: "No encontramos esta página." / "Ir al inicio"
Arquivos: client/src/App.tsx:76,240-242
Risco: é preciso listar as rotas de Visitas válidas para distinguir.

### RCP-41 [S3] Landing no celular: 6884 px e prints ilegíveis
Telas: public/en-phone/landing, landing-pt, landing-es, pending/en-phone/pending-landing
Problema: os 4 cartões de "One app…" espremem um print do app em cerca de 130 px de largura. No de cima, o texto da tela é ilegível. No mock do telefone, "Sale · 6 re…" está cortado e "Visit in progress" quebra em duas linhas ao lado de "At the door · 38 m". A primeira dobra funciona bem: título, "Create an account", "See how it works", e a foto cortada convida a rolar.
Mudança: no celular, print acima do texto em largura total, ou nenhum print. Recomendo tirar os prints dos cartões 1 a 3 no celular: fica mais curto e a lista de itens já explica. Aumentar a coluna de "Sale · 6 review stands".
Arquivos: client/src/pages/xpot/XpotLandingPage.tsx
Risco: nenhum.

### RCP-42 [S3] Landing em PT e ES com prints em inglês
Telas: public/en-desktop/landing-pt, landing-es, public/en-phone/landing-pt, landing-es
Problema: toda a página está traduzida, mas os prints mostram "Tuesday, October 20", "Use this route", "Open route in Google Maps", "SLIDE TO CHECK IN", "Overview". Quem lê português vê um produto em inglês.
Mudança: capturar os 3 prints em PT e ES e servir por idioma, ou trocá-los por mock em HTML como o do cartão "Your selling day".
Arquivos: client/src/pages/xpot/XpotLandingPage.tsx
Risco: nenhum.

### RCP-43 [S3] Figura da peça com Instagram apontando para Google Review, sem aviso
Telas: reseller/en-phone/tags-piece-live, tags-pieces, tags-home, reseller/en-desktop/tags-customer-27
Problema: T339MPEV mostra a figura do Instagram, e o destino é "Google Review". Se a peça impressa diz "Follow on Instagram", quem escaneia cai em outro lugar. Pode ser só combinação do seed; o app não diz nada de qualquer forma.
Mudança: em `LinkInput` e na peça, quando o tipo do destino divergir do que está impresso:
- en: "This piece is printed for Instagram, but it opens a Google review."
- pt: "Esta peça está impressa para o Instagram, mas abre uma avaliação do Google."
- es: "Esta pieza está impresa para Instagram, pero abre una reseña de Google."
Só aviso, sem bloquear.
Arquivos: client/src/pages/tags/CustomerScreen.tsx:539, client/src/components/piece/PieceBody.tsx
Risco: confirmar a origem do dado. Se o seed for o único caso, a prioridade cai.

### RCP-44 [S3] "Write a plain chip" não tem entrada no celular
Telas: reseller/en-phone/tags-direct, reseller/en-desktop/command-palette, reseller/en-desktop/tags-home
Problema: o comentário em `TagsTabBar.tsx:12` e em `moduleNav.ts:215` diz "reached from the dashboard", mas o início não tem o link. No desktop, só pela busca. No celular, só depois de ler um chip vazio, e a tela não tem voltar: a aba acesa é Home.
Mudança: link discreto no fim da folha "Read a piece": "Write a chip without Xpot". Seta de voltar na tela.
Arquivos: client/src/pages/tags/HomeScreen.tsx:308, client/src/pages/tags/TagsTabBar.tsx:12, client/src/components/xpot/moduleNav.ts:216
Risco: a folha não foi capturada; a posição veio do código.

## S4

### RCP-45 [S4] Rótulo de KPI cortado
Telas: reseller/en-phone/tags-customer-27, tags-customer-30
Problema: "SCANS (30 DA…".
Mudança: no `KpiTile`, deixar o rótulo quebrar em 2 linhas em vez de cortar. Encurtar para "Scans 30d" não serve, porque fica obscuro.
Arquivos: client/src/components/xpot/DashboardKit.tsx (KpiTile), client/src/pages/tags/CustomerScreen.tsx:458-460
Risco: nenhum.

### RCP-46 [S4] Primeira data do gráfico cortada e legenda quebrada
Telas: reseller/en-phone/tags-home, customer/en-phone/my-plate-detail, customer/en-desktop/my-plate-detail, reseller/pt-desktop/tags-home
Problema: "ct 3" em vez de "Oct 3" no celular e no `/my`. Em PT, o início de "3 de out." também é cortado, até no desktop. A legenda quebra em "· Est. / visitors: 22".
Mudança: `XAxis` com `padding` à esquerda, ou primeiro rótulo alinhado à esquerda. A legenda sem "Est. visitors" (RCP-11) cabe numa linha.
Arquivos: client/src/pages/tags/charts.ts:40,46, client/src/pages/tags/TagsDashboard.tsx:172-179, client/src/pages/my/PlateDetail.tsx
Risco: nenhum.

### RCP-47 [S4] Cor contraria o sentido
Telas: reseller/en-desktop/tags-customers, reseller/en-phone/tags-direct, reseller/en-desktop/tags-direct, reseller/es-desktop/tags-direct
Problema: "● 0" em verde na coluna Live: zero peças no ar com cara de tudo certo. "Chip written" em âmbar, cor de pendência, com um texto que soa como concluído. O âmbar existe porque o chip foi gravado e ainda não conferido, mas o texto não diz isso.
Mudança: zero em cinza, sem bolinha. Manter o âmbar e trocar o texto de `chip_programmed`: "Written, not checked / Gravado, sem conferir / Grabado, sin verificar".
Arquivos: client/src/pages/tags/CustomersScreen.tsx, client/src/pages/tags/DirectScreen.tsx:232, client/src/i18n/messages/tags.ts:135
Risco: `chip_programmed` aparece em outras telas; o novo texto vale para todas.

### RCP-48 [S4] Título público com letras encostando; slogan contradiz a página
Telas: public/en-desktop/piece-configured-not-live, piece-paused, piece-unknown-code, public/en-phone dos mesmos
Problema: o título em fonte de sistema com espaçamento muito negativo faz as letras se tocarem ("experience", "ready"). "One physical link. Always the right destination." aparece embaixo de "This experience is unavailable" e "We could not find this Xpot", com contraste muito baixo.
Mudança: letter-spacing de no máximo -0,02em. O slogan só na página do QR que funciona, ou em nenhuma.
Arquivos: server/tags/publicPages.ts (PAGE_STYLE e `promise`)
Risco: nenhum.

### RCP-49 [S4] Título e logo somem e aparecem sem regra
Telas: reseller/en-phone/tags-shop comparada com tags-customers e tags-pieces; customer/en-phone/my-plates comparada com my-plate-detail
Problema: Shop não tem título no celular, Customers e My pieces têm. No `/my`, a lista não tem logo e o detalhe tem.
Mudança: Shop ganha `TopBar`. No `/my`, logo em nenhuma das duas, ou em ambas. Recomendo nenhuma: o usuário já sabe onde está.
Arquivos: client/src/pages/tags/ShopScreen.tsx:252, client/src/pages/my/MyApp.tsx
Risco: nenhum.

## Lacunas: o que estas imagens não mostram

Nenhuma destas telas foi capturada, então não há achado sobre elas. Elas são o centro do trabalho do revendedor, e faltam na rodada seguinte:

- Folha "Read a piece", câmera do QR, leitura do chip e peça de outra pessoa.
- Fluxo "Set up": escolher cliente e destino.
- Folha "Write chip", inclusive em iPhone, que não grava chip.
- "Link a piece" e a folha "Change destination".
- Diálogo de entrada, cadastro e telas "under review" do `PhoneSignIn`.
- Entrada do `/my`.
- Revendedor novo, sem peças e sem clientes; `/my` sem plaquinhas.
- Revendedor com distribuição da Skale Club: com código de atacado e carrinho. O Kevin é o caso do parceiro, então parte de RCP-32 foi lida por código.
- Peças públicas em PT e ES (a página segue o Accept-Language).
- `/tags` com sessão expirada (401) e queda de rede.
- Peça com status de pausada ou vendida no perfil revendedor.
