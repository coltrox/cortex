import { app, BrowserWindow, dialog } from 'electron'
import electronUpdater from 'electron-updater'

/**
 * Atualização automática, a partir das releases do GitHub.
 *
 * O `app-update.yml` já vinha dentro do pacote desde a 0.1.0, apontando para
 * o repositório certo — mas o `electron-updater` não estava nas dependências.
 * A configuração existia e o motor faltava, então o app nunca teve como
 * descobrir que havia versão nova.
 *
 * ## Como se comporta
 *
 * **Procura sozinho, e de novo com o app aberto.** 30 s depois de abrir e a
 * cada seis horas. Só ao abrir não bastava: quem deixa o Cortex aberto por
 * dias nunca descobria que havia versão nova.
 *
 * **Baixa sozinho e PERGUNTA.** Com a versão nova baixada, uma janela oferece
 * "Reiniciar e atualizar" ou "Depois". Antes ela entrava calada ao fechar o
 * app; o dono pediu o aviso em 13/09/2026, quando amigos passaram a usar o
 * Cortex. "Depois" não perde nada: a versão entra sozinha na próxima vez que o
 * app fechar. A pergunta aparece uma vez por versão, e não a cada verificação.
 *
 * **Falha em silêncio.** Sem internet, GitHub fora do ar, rede de escola
 * bloqueando: nada disso é problema de quem está usando, e nada disso pode
 * virar alerta. Sem atualização, o app instalado continua funcionando
 * inteiro — ele é local.
 *
 * **Não roda em desenvolvimento.** `npm run dev` não é uma instalação; pedir
 * atualização ali só produziria erro no console.
 *
 * ## O que a atualização NÃO toca
 *
 * O vault. Ele vive numa pasta escolhida pela pessoa, e o instalador mexe só
 * em `%LOCALAPPDATA%\Programs\Cortex`. O índice pode ser reconstruído sem
 * perda — é derivado dos arquivos —, e uma nota gravada por uma versão antiga
 * continua abrindo numa nova, porque campo que falta no frontmatter é campo
 * ausente, não erro.
 */
const SEIS_HORAS = 6 * 60 * 60 * 1000

export function ligarAtualizacaoAutomatica(): void {
  if (!app.isPackaged) return

  // `electron-updater` é CommonJS e não expõe export nomeado no ESM:
  // importar `{ autoUpdater }` direto quebra no build. O default é o módulo.
  const { autoUpdater } = electronUpdater

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // Erro aqui é informação para quem depura, não para quem usa: o app
  // funciona sem atualizar, e um alerta por falta de rede seria ruído diário
  // para quem trabalha offline.
  autoUpdater.on('error', err => {
    console.warn('[cortex] atualizacao nao verificada:', err?.message ?? err)
  })

  // Uma pergunta por versão: com a verificação a cada seis horas, a mesma
  // versão já baixada seria anunciada de novo a cada volta do relógio.
  let avisada: string | null = null
  autoUpdater.on('update-downloaded', info => {
    console.log(`[cortex] versao ${info.version} baixada`)
    if (avisada === info.version) return
    avisada = info.version
    void perguntarSeReinicia(info.version, () => autoUpdater.quitAndInstall(true, true))
  })

  const procurar = (): void => {
    void autoUpdater.checkForUpdates().catch(() => {
      // Já tratado no `on('error')`. O catch existe só para a promessa
      // rejeitada não virar um `unhandledRejection`.
    })
  }

  // Espera o app assentar antes de gastar rede: abrir o vault, indexar e
  // desenhar a primeira tela importam mais do que descobrir se há versão nova.
  setTimeout(procurar, 30_000)
  setInterval(procurar, SEIS_HORAS)
}

/**
 * A pergunta, numa janela do próprio Windows presa à do Cortex.
 *
 * "Reiniciar e atualizar" instala em silêncio e abre o app de novo sozinho
 * (`quitAndInstall(true, true)`). Fechar o app também encerra os `npm run` do
 * Dev — ver `before-quit` em `index.ts` — e perde o que estiver digitado num
 * formulário aberto; por isso o aviso diz as duas coisas.
 */
async function perguntarSeReinicia(versao: string, reiniciar: () => void): Promise<void> {
  const janela = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  // Sem janela aberta não há a quem perguntar — a versão entra ao sair.
  if (!janela) return
  const { response } = await dialog.showMessageBox(janela, {
    type: 'info',
    title: 'Atualização do Cortex',
    message: `A versão ${versao} do Cortex está pronta.`,
    detail:
      'O Cortex fecha e abre de novo em alguns segundos, já atualizado. Salve o ' +
      'que estiver escrevendo antes — terminais rodando no Dev também são ' +
      'encerrados. Se preferir, escolha Depois: ela entra sozinha na próxima vez ' +
      'que você fechar o app.',
    buttons: ['Reiniciar e atualizar', 'Depois'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  if (response === 0) reiniciar()
}
