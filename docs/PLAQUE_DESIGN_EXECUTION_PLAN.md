# Reestruturação da criação de plaquinhas

Referência: flyer `N:\My Drive\Marketing\NFC Price Flyer 2026`, conferido visualmente em 2026-11-02.

Situação: implementação local concluída e validada. Não houve deploy, alteração do banco de produção, criação de lotes reais, impressão física ou gravação de NFC nesta tarefa.

## Entrega

1. Escolher o serviço por logo, como no flyer: Google, Yelp, Instagram, Facebook, TikTok, Website, Menu, Wi-Fi, Venmo, Cash App, PayPal e Zelle. Extras compatíveis: WhatsApp, YouTube e LinkedIn. Personalizados ficam fora deste assistente.
2. Escolher aparência (cor e, quando disponível, estilo), NFC, quantidade e revisão. Cinco etapas com nomes legíveis, controles de avançar/voltar, navegação por teclado e resumo persistente. Sem avanço automático ao escolher.
3. Separar identidades de pagamento e Wi-Fi; preservar todos os estilos de uma mesma face no catálogo e selecionar o modelo exato no servidor.
4. Completar a matriz Stand/Plate × Small/Large × designs × cores × três NFC. Reutilizar os geradores existentes e criar um compositor comum para as faces adicionais, preservando as receitas históricas.
5. Entregar catálogo reproduzível e migração que cria novas versões sem alterar versões usadas em pedidos. Nenhum lote/código real é criado como teste.
6. Validar regras e API, geometria e QR, compilação e interface desktop/mobile. Registrar separadamente o que depende de impressão física.

## Critérios

- Nenhum título de etapa cortado, inclusive em 360 px.
- Os doze logos do flyer são selecionáveis nos quatro produtos.
- Escolhas anteriores persistem; uma mudança invalida combinações incompatíveis.
- Estilos não desaparecem por compartilhar a mesma face.
- O pedido registra o modelo e o NFC exatos, com material e pausa correspondentes.
- QR permanece um link serializado Xpot. Wi-Fi identifica a face; a configuração da rede continua na ativação da peça.
- Cores de filamento são explícitas; números de fatiamento de outras receitas não são apresentados como medidos nas novas variantes.
- Testes usam códigos de amostra e armazenamento isolado. Impressão física, gravação de chips e recebimento de estoque não são simulados como concluídos.

## Regras incorporadas durante a execução

- Uma geração de peças serializadas cria **uma só placa da impressora e um só lote**, mesmo se o pedido vier pelo MCP ou diretamente pela API. Limites vêm do layout real: Large Stand 4, Small Stand 4, Large Plate 4 e Small Plate 8. Uma quantidade menor é permitida; maior é recusada antes de emitir códigos. Pedidos antigos com várias placas conservam o histórico e o fluxo de reimpressão.
- A seleção de quantidade vazia fica inválida: não vira uma placa cheia silenciosamente.
- Os seis estilos de Menu mostram a peça inteira, desenhada a partir dos mesmos polígonos da impressão. Os demais serviços também têm prévia completa.
- Os três NFC têm ilustrações originais identificáveis, dimensões, chip e momento de gravação. São referências visuais, não fotografias do estoque.
- O corpo usa somente preto ou branco, em ELEGOO PLA comum de 1,75 mm como padrão. Detalhes coloridos dos logotipos podem usar PLA genérico; novas versões podem definir outra marca. O perfil inicial usa bico 215 °C na primeira camada e 210 °C nas seguintes; mesa texturizada 60/55 °C; vazão máxima 12 mm³/s; camada de 0,16 mm; primeira camada a 30 mm/s; corpo depois da arte; purga escuro→claro de pelo menos 600 mm³. Esses valores foram verificados no arquivo fatiado. Calibração física de vazão, pressão e variantes PLA+/Rapid/Matte não é declarada como feita.

## Matriz entregue

| Eixo | Opções |
|---|---|
| Peça | Stand Large, Stand Small, Plate Large, Plate Small |
| Serviço | 12 do flyer + WhatsApp, YouTube, LinkedIn |
| Cor do corpo aprovada | Branco e Preto; cores dos logotipos preservadas |
| Menu | Inria Serif Bold, Inria Serif Bold Italic, Metropolis Medium espaçado, Inter SemiBold espaçado, Metropolis Bold, Nunito Black |
| NFC | Adesivo redondo 25,4 mm NTAG215; adesivo retangular 10 × 20 mm NTAG213; pastilha 25 mm NTAG215 |

Total aprovado após confirmação do proprietário em 03/11/2026: **160 modelos, 480 combinações com NFC**. As quatro cores alternativas eram sugestões não aprovadas e foram retiradas do gerador e das novas opções de produção. Cada novo modelo tem uma cama e os três bolsos/pausas. Não foram reaproveitados tempos ou consumos medidos em outras peças.

A migração histórica 0078 permanece intacta para preservar compatibilidade e receitas existentes. Mesmo que o catálogo contenha registros antigos de outras cores, o gerador de peças padrão oferece somente branco e preto. Histórico, arquivos já emitidos e serial codes não são alterados.

## Evidências

- Integração: migração instala 480 modelos; reexecutá-la não duplica versões; receita antiga permanece igual; zero códigos de produção criados pela migração; escolha de estilo não pode escapar da face/cor/produto; NFC e modelo exatos ficam no pedido.
- Auditoria de geometria: **480/480** geometrias distintas (as cores compartilham geometrias de contraste), com arquivos STL, volumes e QR conferidos. Relatório local: `.cache/plaque-geometry.json`.
- Bambu Studio offline: **12/12 placas completas**, cobrindo quatro produtos × três NFC. **60/60 QR** decodificados do G-code, pausas antes das pontes, sem avisos de fatiamento. Resultados em `.cache/plaque-slices/validation.json`; são amostras TEST ONLY.
- Navegador: seleção por logo, pesquisa, seis estilos completos, três NFC visuais, bloqueio de 80 peças, revisão e envio para simulador local. Envio verificado: Menu arredondado preto, 3 peças, NFC retangular, modelo `stand-large-menu-black-rounded`. Nenhum endpoint de produção foi usado.
- Mobile: 360 × 800, sem transbordamento horizontal, logos carregados e rodapé fixo. Inglês e português conferidos.

## Publicação

1. Publicar o código e os assets; atualizar e reiniciar o bench no computador de impressão com estes geradores e as fontes incluídas em `print-pipeline/library/fonts`, antes de ativar as novas receitas.
2. Aplicar `migrations/0078_flyer_design_catalog.sql` pelo migrador normal. Ela é idempotente, cria novas versões e não altera lotes, códigos, estoque ou versões históricas. Usa os produtos comerciais existentes pelos SKUs Stand/Plate; se o SKU variar, procura um modelo do mesmo produto. Sem produto comercial correspondente, não inventa preço/produto.
3. Conferir o catálogo no servidor e realizar a primeira impressão física com o PLA e NFC escolhidos; confirmar leitura nos celulares e só então registrar impressão/recebimento reais.

Reprodução: `catalog/design_catalog.py` regenera a migração e as prévias; `tests/validate_design_geometry.py` audita a geometria; `tests/validate_design_slices.py` valida placas completas offline. O simulador de navegador (`scripts/preview-production-design.ts`) só aceita dados locais e nunca lê `.env` nem acessa banco ou impressora.

Comandos conferidos: `npx vitest run --maxWorkers=4` (1.872 aprovados, 26 testes sem ambiente externo ignorados); `python -m unittest discover -s print-pipeline/tests -p 'test_*.py'` (22 aprovados); `npm run check`; `npm run build`. A checagem final específica de produção e traduções passou com 105 testes. Capturas e resumo do fatiamento estão em `docs/plaques/evidence/`.

Para abrir o simulador: `npx tsx scripts/preview-production-design.ts` e `http://127.0.0.1:2112/dev/production-design.html`. O próprio comando regenera os dados de amostra.

## Referências consultadas

- Flyer local e seus doze assets originais, preservados.
- [NFC redondo NTAG215](https://nfc.cards/en/stickers/5-nfc-tag-ntag215.html).
- [Inlay retangular NTAG213 de 20 × 10 mm — GoToTags](https://store.gototags.com/clear-wet-nfc-inlay-ntag213-20-x-10-mm-rectangle/).
- [Pastilha PVC NTAG215 de 25 mm — ficha do fabricante](https://www.asiarfid.com/it/wp-content/uploads/2021/03/Ntag215-Coin-Card.pdf).
- [ELEGOO PLA comum — página oficial](https://www.elegoo.com/products/pla-filament-1-75mm-colored-1kg).
