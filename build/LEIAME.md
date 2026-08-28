# Ícone

`icon.ico` e `icon.png` saem de `icone-origem.png` — a imagem que o Pedro
escolheu, um cérebro feito de rede.

O recorte é automático: acha a caixa dos pixels claros, centraliza, e deixa o
desenho ocupar 86% do lado. Os cantos são arredondados em 20% do lado, e o
`.ico` carrega 16, 24, 32, 48, 64, 128 e 256 px.

Não há script para refazer isso. Node não decodifica esse formato sozinho, e trazer uma
biblioteca de imagem para o projeto por causa de um arquivo que muda uma vez a
cada nunca não se paga. Se o ícone mudar, o desenho é: canvas do navegador,
`drawImage` com o recorte, `clip()` num retângulo de cantos arredondados,
`toDataURL`.
