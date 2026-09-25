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

; ---------------------------------------------------------------------------
; Associações de arquivo sem sequestrar o padrão.
;
; O electron-builder registra cada extensão de `fileAssociations` de dois
; jeitos ao mesmo tempo: põe o Cortex na lista "Abrir com" (OpenWithProgids)
; E grava o programa PADRÃO da extensão. O segundo ninguém pediu — na
; primeira instalação com associações (2.6.26) isso fez os `.md` da máquina
; do dono passarem a abrir no Cortex, no lugar do VS Code.
;
; Aqui o valor padrão é apagado logo depois de escrito, deixando só o "Abrir
; com". Quem quiser o Cortex como padrão escolhe no Windows, uma vez — e essa
; escolha (UserChoice) manda em tudo isto.
;
; SHCTX é HKCU nesta instalação (`perMachine: false`).
; ---------------------------------------------------------------------------
!macro customInstall
  DeleteRegValue SHCTX "Software\Classes\.md" ""
  DeleteRegValue SHCTX "Software\Classes\.txt" ""
  DeleteRegValue SHCTX "Software\Classes\.json" ""
  DeleteRegValue SHCTX "Software\Classes\.yml" ""
  DeleteRegValue SHCTX "Software\Classes\.yaml" ""
  DeleteRegValue SHCTX "Software\Classes\.csv" ""
  DeleteRegValue SHCTX "Software\Classes\.log" ""
  DeleteRegValue SHCTX "Software\Classes\.js" ""
  DeleteRegValue SHCTX "Software\Classes\.jsx" ""
  DeleteRegValue SHCTX "Software\Classes\.ts" ""
  DeleteRegValue SHCTX "Software\Classes\.tsx" ""
  DeleteRegValue SHCTX "Software\Classes\.css" ""
  DeleteRegValue SHCTX "Software\Classes\.html" ""
  DeleteRegValue SHCTX "Software\Classes\.py" ""
  DeleteRegValue SHCTX "Software\Classes\.sql" ""
  DeleteRegValue SHCTX "Software\Classes\.sh" ""
  DeleteRegValue SHCTX "Software\Classes\.env" ""
  ; Avisa o Explorer para reler as associações.
  System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

; ---------------------------------------------------------------------------
; Fechar o Cortex antes de instalar por cima.
;
; O padrão do electron-builder desistia rápido e pedia para "fechar a janela" —
; mas às vezes não há janela: o conector do Claude roda o próprio Cortex.exe em
; segundo plano, e o app aberto pode levar alguns segundos gravando o índice ao
; fechar. Aqui: pede para fechar, espera, força (com os processos filhos), e só
; depois de quatro voltas pergunta — dizendo o que pode estar segurando.
; Só processos com o nome do app e do usuário atual; o instalador e o
; desinstalador têm outro nome e não entram.
; ---------------------------------------------------------------------------
!include LogicLib.nsh

!macro customCheckAppRunning
  StrCpy $R9 0
  cortexFechar:
    DetailPrint "Fechando o Cortex…"
    nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
    Pop $0
    Sleep 1500
    nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
    Pop $0
    Sleep 1000
    nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $0
    ${If} $0 == 0
      IntOp $R9 $R9 + 1
      ${If} $R9 < 4
        Goto cortexFechar
      ${EndIf}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "O Cortex ainda está aberto e não fechou sozinho.$\r$\n$\r$\nFeche o Cortex e também o Claude, se ele estiver usando o conector do Cortex. Depois clique em Repetir." /SD IDCANCEL IDRETRY cortexRepetir
      Quit
      cortexRepetir:
      StrCpy $R9 0
      Goto cortexFechar
    ${EndIf}
!macroend
