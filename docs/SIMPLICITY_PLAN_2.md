# Plano 2 de simplificação do Xpot

**Data:** 2026-11-02 · **Base:** `44d2935` (main) · Substitui o plano de `docs/SIMPLICITY_AUDIT.md`, que continua como histórico.

## O que estava errado no plano 1

O plano 1 foi feito lendo código. Trocou nomes e reorganizou menus, mas ninguém olhou o resultado: a primeira tela que o dono abriu dizia "Not in stock yet" ao lado de "Company stock". Faltou usar o sistema.

## Como o plano 2 foi feito

O Xpot real rodou localmente, com banco próprio, 112 peças em 19 estados, impressões em todos os estados e 9 perfis logados: 1.657 capturas em computador e celular, nos três idiomas. Seis auditorias olharam as telas e uma usou os fluxos de ponta a ponta, clicando. Os achados estão em `docs/simplicity/`, com a tela, o problema e a mudança exata.

| Área | S1 | S2 | S3 | S4 |
|---|---:|---:|---:|---:|
| Peça e estoque | 10 | 20 | 18 | 6 |
| Produção | 8 | 34 | 23 | 5 |
| Painel e navegação | 5 | 16 | 11 | 3 |
| Revendedor, cliente e público | 8 | 19 | 17 | 5 |
| Visitas | 5 | 19 | 12 | 4 |
| Admin e idiomas | 5 | 28 | 15 | 10 |
| Fluxos reais | 4 | 13 | 3 | 0 |
| **Total** | **45** | **149** | **99** | **33** |

S1 é quebrado, errado ou enganoso. S2 é a pessoa não entender ou errar. S3 é excesso. S4 é acabamento.

## Regras

1. **Toda tela responde em 3 segundos:** o que é isto e o que eu faço aqui.
2. **Um status, em palavras normais, e uma ação principal.** Nunca botão desabilitado com aviso: se não dá para fazer, não aparece; o que falta é dito em uma frase.
3. **Vermelho e âmbar só para o que precisa de ação agora.**
4. **Um nome por coisa, em todas as telas e perfis**, o mesmo que a pessoa diria em voz alta.
5. **Números batem:** o que a lista conta é o que ela abre.
6. **Nada de sistema na tela:** slug, SKU, código de pedido, "Bambu", "bench", e-mail técnico.
7. **Celular primeiro para quem está na rua:** o essencial sem rolar, com uma mão.
8. **Nada "feito" sem ser visto:** cada correção é refotografada e olhada, e os fluxos são repetidos.

## Frentes

Cada frente tem uma pasta e um conjunto de arquivos próprios, para andarem em paralelo.

| Frente | Achados | Onde |
|---|---|---|
| F1 Moldura e navegação | NAV-5 a 7, 9, 12, 14, 15, 18, 21 em diante; AD-06, AD-20; RCP-9, RCP-12, RCP-20 a 22; PE-1, PE-30; VIS-12, VIS-29; ID-15 | `components/xpot/AppLayout`, `moduleNav`, `BottomSheet`, moldura do painel, menu de conta |
| F2 Peça, estoque e filas | PE-*; RCP-13, 14, 18; ID-01, ID-08; NAV-1, 2, 8, 17, 20, 24, 35 | `components/piece`, `PiecesTab`, `piece-table`, `OverviewTab`, `where-model`, Today |
| F3 Produção | PROD-*; FLX-4 a 8, FLX-17; ID-02 a 05, ID-13 | `production-*`, `BatchDetail`, `batches-*`, `ProductionTab`, histórico, gravadores, loja |
| F4 Entregar, atacado e organização | FLX-1; NAV-3, 4, 10, 11, 13, 16, 19; AD-01, 05, 10 a 13, 30; ID-09, ID-10 | `KitsTab`, `kits-*`, `server/tags/acquisitions.ts`, `OrganizationsPage`, `server/routes/xpot/organizations.ts` |
| F5 Revendedor, cliente, público e login | RCP-* restantes; FLX-9, FLX-10, FLX-16; ID-07, ID-14 | `pages/tags`, `pages/my`, landing, sessão, Settings |
| F6 Visitas | VIS-*; FLX-2, 3, 11 a 15 | `pages/xpot`, `pages/admin/AdminWork`, `AdminOverview`, `AdminProducts`, `AdminSettings` |
| F7 Admin | AD-* restantes | `AdminReps`, `PersonDetail`, integrações, marca, status |

Depois das frentes, uma varredura final de textos unifica o glossário, inclusive em pt e es.

## Rodadas

1. Cada frente corrige S1 e S2, depois S3 e S4 da sua área, e fotografa as próprias telas no seu servidor.
2. Revisão: as frentes entram no `main` de teste uma a uma, com testes, integração em Postgres real e build.
3. Recaptura completa e nova auditoria, com outro olhar, da mesma lista de perguntas.
4. Repetir 1 a 3 até não sobrar S1 nem S2 e nenhuma tela principal com nota abaixo de 8.
5. Cada rodada que passa sobe para produção com CI verde.

## Decisões tomadas sem esperar o dono

Combinado: não esperar. Cada uma segue a recomendação do achado e pode ser desfeita:

- **Navegação (antigo D7):** não unificar em uma área. Fica um controle "My work | My company", Settings vai para um menu no avatar, e o painel ganha barra inferior no celular. O antigo PR 8 sai.
- **Today conta o que a lista abre:** na plataforma, todas as organizações, com filtro à vista.
- **Peça recolhida** volta para a organização de onde o kit saiu.
- **Visão geral de organização** conta pela organização da empresa, não pelo dono.
- **Estoque** esconde por padrão as peças ainda fora do estoque, e elas ficam a um filtro.
- **Loja:** quem compra de parceiro com distribuição própria não vê o catálogo da Skale Club.
- **Vendedor** não vê lucro nem custo. Dono e parceiro veem custo, responsável e histórico da peça.
- **Cliente** é a palavra em Tags, "Companies" em Visits.

## Pendente para o dono (não dá para decidir por ele)

- **Privacidade:** qual contato publicar, e revisão jurídica da política (RCP-8, RCP-27).
- O restante de decisões menores fica registrado em cada PR.

## Resultado até agora

| Rodada | Achados | Fechados | Onde |
|---|---|---|---|
| 1 | 45 S1, 149 S2, 99 S3, 33 S4 | 7 frentes, mais uma para o que ficou entre elas | `docs/simplicity/*.md` |
| 2 | 19 S1, 82 S2, 64 S3, 19 S4 | S1: 19 de 19. S2: 78 de 82. S3: 7 de 64. S4: 2 de 19 | `docs/simplicity/rodada-2/` |

Os S2 abertos da rodada 2 são do dono ou estão feitos em parte: R2-PE-19, R2-PE-24, R2-RCP-8, R2-RCP-9. Os S3 e S4 da rodada 2 ficaram para depois, de propósito, para conter o custo.

Critério ainda não cumprido: nenhuma tela principal abaixo de 8. Não houve nova auditoria completa depois da rodada 2, só verificação por cliques.
