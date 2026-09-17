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
 * **Procura sozinho, e de novo com o app aberto.** 30 s depois de abrir, a
 * cada 30 minutos, e quando a janela volta ao foco (no máximo a cada 10
 * minutos). Eram seis horas — e quem estava com o app aberto quando saía uma
 * versão ficava a tarde inteira sem saber dela. A consulta é um arquivo
 * pequeno do GitHub; o download só acontece quando há versão nova.
 *
 * **Diz em que pé está.** Configurações › Geral mostra "procurando",
 * "baixando 40%", "pronta para instalar" ou "em dia", com um botão para
 * procurar agora e outro para reiniciar quando a versão já baixou.
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
const MEIA_HORA = 30 * 60 * 1000
const DEZ_MINUTOS = 10 * 60 * 1000

export type EstadoAtualizacao = {
  fase: 'desligada' | 'parada' | 'procurando' | 'baixando' | 'pronta' | 'em-dia' | 'erro'
  /** A versão nova, quando há uma. */
  versao: string | null
  /** 0 a 100, enquanto baixa. */
  progresso: number | null
  /** ISO da última vez que procurou. */
  ultimaVerificacao: string | null
}

let estado: EstadoAtualizacao = { fase: 'desligada', versao: null, progresso: null, ultimaVerificacao: null }
let procurarAgora: () => void = () => {}
let instalar: () => void = () => {}

export const estadoDaAtualizacao = (): EstadoAtualizacao => estado
export const procurarAtualizacaoAgora = (): EstadoAtualizacao => { procurarAgora(); return estado }
export const reiniciarParaAtualizar = (): void => {
  if (estado.fase === 'pronta') instalar()
}

export function ligarAtualizacaoAutomatica(): void {
  if (!app.isPackaged) return
  estado = { ...estado, fase: 'parada' }

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
    // Uma versão já baixada continua pronta mesmo que a próxima consulta falhe.
    if (estado.fase !== 'pronta') estado = { ...estado, fase: 'erro', progresso: null }
  })
  autoUpdater.on('checking-for-update', () => {
    if (estado.fase !== 'pronta' && estado.fase !== 'baixando') estado = { ...estado, fase: 'procurando' }
  })
  autoUpdater.on('update-not-available', () => {
    estado = { ...estado, fase: 'em-dia', versao: null, progresso: null }
  })
  autoUpdater.on('update-available', info => {
    if (estado.fase !== 'pronta') estado = { ...estado, fase: 'baixando', versao: info.version, progresso: 0 }
  })
  autoUpdater.on('download-progress', p => {
    estado = { ...estado, fase: 'baixando', progresso: Math.round(p.percent) }
  })
  instalar = () => autoUpdater.quitAndInstall(true, true)

  // Uma pergunta por versão: com a verificação a cada seis horas, a mesma
  // versão já baixada seria anunciada de novo a cada volta do relógio.
  let avisada: string | null = null
  autoUpdater.on('update-downloaded', info => {
    console.log(`[cortex] versao ${info.version} baixada`)
    estado = { ...estado, fase: 'pronta', versao: info.version, progresso: 100 }
    if (avisada === info.version) return
    avisada = info.version
    void perguntarSeReinicia(info.version, () => autoUpdater.quitAndInstall(true, true))
  })

  const procurar = (): void => {
    // Já baixada, ou baixando: não há o que procurar até instalar.
    if (estado.fase === 'pronta' || estado.fase === 'baixando') return
    estado = { ...estado, ultimaVerificacao: new Date().toISOString() }
    void autoUpdater.checkForUpdates().catch(() => {
      // Já tratado no `on('error')`. O catch existe só para a promessa
      // rejeitada não virar um `unhandledRejection`.
    })
  }

  // Espera o app assentar antes de gastar rede: abrir o vault, indexar e
  // desenhar a primeira tela importam mais do que descobrir se há versão nova.
  procurarAgora = procurar
  setTimeout(procurar, 30_000)
  setInterval(procurar, MEIA_HORA)
  // Voltar para a janela é a hora em que uma novidade faz sentido — com um
  // intervalo mínimo, para alternar de janela não virar uma consulta por clique.
  app.on('browser-window-focus', () => {
    const ultima = estado.ultimaVerificacao ? Date.parse(estado.ultimaVerificacao) : 0
    if (Date.now() - ultima > DEZ_MINUTOS) procurar()
  })
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
