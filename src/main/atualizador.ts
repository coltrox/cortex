import { app } from 'electron'
import electronUpdater from 'electron-updater'

/**
 * Atualização automática, a partir das releases do GitHub.
 *
 * O `app-update.yml` já vinha dentro do pacote desde a 0.1.0, apontando para
 * o repositório certo — mas o `electron-updater` não estava nas dependências.
 * A configuração existia e o motor faltava, então o app nunca teve como
 * descobrir que havia versão nova.
 *
 * ## As três escolhas que definem o comportamento
 *
 * **Baixa sozinho, instala ao sair.** Nada de diálogo perguntando no meio do
 * trabalho, e nada de reiniciar o app por conta própria. A versão nova entra
 * na próxima vez que a pessoa fechar e abrir — que é quando ela já esperava
 * uma pausa.
 *
 * **Falha em silêncio.** Sem internet, GitHub fora do ar, rede de escola
 * bloqueando: nada disso é problema de quem está usando, e nada disso pode
 * virar alerta na abertura. Sem atualização, o app instalado continua
 * funcionando inteiro — ele é local.
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
export function ligarAtualizacaoAutomatica(): void {
  if (!app.isPackaged) return

  // `electron-updater` é CommonJS e não expõe export nomeado no ESM:
  // importar `{ autoUpdater }` direto quebra no build. O default é o módulo.
  const { autoUpdater } = electronUpdater

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // Erro aqui é informação para quem depura, não para quem usa: o app
  // funciona sem atualizar, e um alerta na abertura por falta de rede seria
  // ruído diário para quem trabalha offline.
  autoUpdater.on('error', err => {
    console.warn('[cortex] atualizacao nao verificada:', err?.message ?? err)
  })
  autoUpdater.on('update-downloaded', info => {
    console.log(`[cortex] versao ${info.version} baixada; entra ao fechar o app`)
  })

  // Espera o app assentar antes de gastar rede: abrir o vault, indexar e
  // desenhar a primeira tela importam mais do que descobrir se há versão
  // nova, e os dois competiriam pelo mesmo instante.
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => {
      // Já tratado no `on('error')`. O catch existe só para a promessa
      // rejeitada não virar um `unhandledRejection`.
    })
  }, 30_000)
}
