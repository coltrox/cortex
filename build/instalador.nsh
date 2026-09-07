; Texto do assistente de instalação do Cortex.
;
; O electron-builder inclui este arquivo antes de montar as páginas, então
; definir as macros aqui sobrescreve os textos padrão do NSIS. Sem ele o
; assistente fala em termos genéricos e não diz o que está sendo instalado —
; o que serve para quem já conhece o app, e não para quem o vê pela primeira
; vez.
;
; `!ifndef` em volta de cada uma: redefinir uma macro que o electron-builder
; já tenha definido faz o compilador do NSIS parar, e o build inteiro falha
; por causa de uma linha de texto.
;
; `$\r$\n` é a quebra de linha do NSIS. `\n` sozinho sai como dois caracteres
; literais no meio da frase.

!ifndef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao Cortex"
!endif

!ifndef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TEXT "Um segundo cérebro que roda na sua máquina.$\r$\n$\r$\nSuas notas ficam em Markdown, numa pasta que você escolhe — legíveis por qualquer editor, com ou sem o Cortex instalado.$\r$\n$\r$\nA instalação não toca em vault nenhum: se você já usa o Cortex, suas notas continuam onde estão.$\r$\n$\r$\nCriado por Pedro Coltro."
!endif

!ifndef MUI_FINISHPAGE_TITLE
  !define MUI_FINISHPAGE_TITLE "Cortex instalado"
!endif

!ifndef MUI_FINISHPAGE_TEXT
  !define MUI_FINISHPAGE_TEXT "O Cortex está pronto para usar.$\r$\n$\r$\nDaqui em diante ele se atualiza sozinho: procura versão nova, baixa em segundo plano e troca quando você fecha o app."
!endif
