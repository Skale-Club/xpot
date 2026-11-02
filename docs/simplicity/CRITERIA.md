# Critério da auditoria visual do Xpot

Contexto: o dono do Xpot abriu o sistema e disse: "Eu não faço ideia do que são essas opções, e fui eu que fiz o aplicativo." A primeira auditoria foi feita lendo código e ficou superficial. Esta é feita OLHANDO as telas. Se você não abriu a imagem, você não tem achado sobre ela.

Quem usa: dono de negócio pequeno, revendedor na rua pelo celular, vendedor em campo, quem opera a impressora. Nenhum deles conhece o banco nem o código. Pense como a pessoa, não como o programador.

Imagens: `.lab/shots/<round>/<perfil>/<lang>-<device>/<tela>.png` (abra com a ferramenta Read). Lista: `.lab/shots/<round>/screens-by-profile.txt`. Técnico: `.lab/shots/<round>/report.json`. Código: `client/src` (só leitura, para achar o arquivo e a causa). Glossário: `docs/MODULES.md` §5. Plano antigo: `docs/SIMPLICITY_AUDIT.md`.

## Perguntas para CADA tela

1. Em 3 segundos: o que é esta tela e o que eu faço aqui? Qual é a única coisa mais importante?
2. Cada palavra: uma pessoa comum entende sem explicação? (jargão, código interno, nome de sistema, sigla)
3. Contradição: algum texto, status, número ou botão contradiz outro na mesma tela, ou o que ela disse na tela anterior?
4. Cada bloco: precisa estar aqui, agora, para esta pessoa? Sim, mostrar. Às vezes, recolher. Não, remover. Repete outro lugar?
5. Cada botão: está claro o que acontece ao clicar? Faz sentido neste estado? Tem botão que não deveria aparecer, ou falta o que deveria?
6. Hierarquia: o que mais chama atenção é o mais importante? Vermelho/âmbar é problema de verdade? Títulos repetidos?
7. Visual: algo cortado, vazando do card, desalinhado, sobreposto, apertado, ilegível, sem espaço? Peça branca e peça preta visíveis no fundo?
8. Celular: dá para usar com uma mão? O essencial aparece sem rolar? Cabeçalho come a tela?
9. Estados: vazio, carregando, erro e o caso de muitos itens estão bons? A tela diz o que fazer a seguir?
10. Coerência: mesma coisa com mesmo nome, mesma aparência e mesmo lugar em todas as telas e perfis?

## Gravidade

- **S1** quebrado, errado, enganoso, contradição, ação perigosa sem aviso, dado errado, tela inutilizável.
- **S2** a pessoa não entende ou erra: nome confuso, botão ambíguo, próximo passo ausente, informação essencial escondida.
- **S3** carregado: bloco desnecessário, repetição, hierarquia ruim, excesso de filtros ou colunas.
- **S4** acabamento: espaçamento, alinhamento, ícone, tom.

Limitações do laboratório, que NÃO são achados: sem previews 3D (figura 2D), sem fotos enviadas, sem mapa (`/api/xpot/map` 503), dados de teste com nomes inventados, relógio de "visit in progress" alto.

## Entrega

Grave em `docs/simplicity/<área>.md`. Sem achado genérico: "simplificar a tela" não vale. Cada achado na forma:

```
### <ID da área>-<n> [S1|S2|S3|S4] <título curto>
Telas: <perfil/lang-device/tela, tela2>
Problema: o que a pessoa vê e por que atrapalha. Cite o texto exato.
Mudança: exatamente o que fazer (texto novo em en/pt/es quando for texto; o que sai, o que fica, para onde vai).
Arquivos: caminho:linha
Risco: regra de negócio? depende de decisão do dono? (se sim, recomende uma opção)
```

No topo do arquivo: uma tabela com cada tela da área, a coisa mais importante dela, nota de 0 a 10 hoje, e o que falta para 9. Nota honesta: 10 é uma tela que uma pessoa sem treino usa de primeira.

Abra TODAS as telas da sua área, em en-desktop e en-phone quando existirem. Para perfis diferentes da mesma tela, abra e compare. Não edite código do app. Não commite. Não rode o seed nem a captura. Na resposta final, diga quantas imagens abriu de fato, quantos achados de cada gravidade e os 5 mais graves; se não abriu alguma, diga qual e por quê.
