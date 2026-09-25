import { app, BrowserWindow, Menu, ipcMain, dialog, shell, session as sessaoEletron } from 'electron'
import { join, resolve, basename, relative, isAbsolute, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { Session } from './session'
import { registerIpc, sincronizadorDe } from './ipc/handlers'
import { ligarCampainha, desligarCampainha } from './nuvem/campainha'
import { Processos, scriptsDoProjeto } from './dev/processos'
import {
  estadoGit, iniciarRepo, definirRemoto, commitar, empurrar, urlDeRepositorio, mensagemDeCommit
} from './dev/git'
import {
  etapasNovoProjeto, arquivosNovoProjeto, escreverArquivosIniciais, comandosExternos, comandoInstalado, avisoDeFalta, atualizarPathDoWindows, rodarCurto, nomeDeProjetoValido, MODELOS_PROJETO, LINGUAGENS_PROJETO,
  NOME_MODELO, repoDoGithub
} from './dev/novoProjeto'
import { projetarConfigParaRenderer, type ConfigParaRenderer } from './config'
import { ehOuContem } from './caminhos'
import {
  ligarAtualizacaoAutomatica, estadoDaAtualizacao, procurarAtualizacaoAgora, reiniciarParaAtualizar
} from './atualizador'
import { instrucoesParaClaude, gravarSeMudou } from './instrucoesClaude'
import { lerEstadoDoConector } from './estadoConector'
import { ServicoAgenda } from './google/servico'
import { GuardaCifrada } from './google/guarda'

const session = new Session()

/**
 * O Google Agenda. O acesso fica em `userData`, cifrado pelo Windows — fora
 * do vault, que viaja entre máquinas. O login abre no navegador do sistema,
 * e só endereço https do Google passa por `shell.openExternal`.
 */
const agenda = new ServicoAgenda(
  session,
  new GuardaCifrada(join(app.getPath('userData'), 'google-agenda.dat')),
  async url => {
    if (!url.startsWith('https://accounts.google.com/')) throw new Error('endereço de login inesperado')
    await shell.openExternal(url)
  }
)

/**
 * Uma rodada com o Google sem derrubar nada: o erro fica gravado e aparece na
 * aba Google Agenda das Configurações.
 */
function sincronizarAgenda(): void {
  if (!session.isOpen) return
  agenda.sincronizar().catch(err => console.error('[cortex] google agenda:', err))
}
let agendaAdiada: ReturnType<typeof setTimeout> | null = null

/**
 * Os `npm run` que o Cortex esta rodando.
 *
 * Fica no modulo, e nao na sessao: um servidor de desenvolvimento nao deve
 * morrer porque o usuario trocou de vault. Ele morre quando o app fecha.
 */
const processos = new Processos()
let win: BrowserWindow | null = null

/**
 * Onde fica a memória de qual vault foi aberto por último.
 *
 * Vai no userData do Electron, e não no vault: é a única coisa que precisa
 * ser conhecida ANTES de existir um vault aberto. Guarda só um caminho.
 */
const memoriaPath = (): string => join(app.getPath('userData'), 'cortex.json')

async function lembrarVault(root: string): Promise<void> {
  try {
    await writeFile(memoriaPath(), JSON.stringify({ ultimoVault: root }, null, 2), 'utf8')
  } catch {
    // Não poder lembrar não é motivo para não abrir. Na próxima vez o app
    // pergunta de novo, e só.
  }
}

async function vaultLembrado(): Promise<string | null> {
  try {
    const o = JSON.parse(await readFile(memoriaPath(), 'utf8')) as { ultimoVault?: unknown }
    return typeof o.ultimoVault === 'string' && o.ultimoVault ? o.ultimoVault : null
  } catch {
    return null
  }
}

function avisarMudanca(rel: string): void {
  win?.webContents.send('vault:changed', rel)
  // Mexeu na agenda ou numa prova: o Google fica sabendo em alguns segundos,
  // sem esperar o relógio. Várias gravações seguidas viram uma rodada só.
  if (rel.startsWith('Agenda/') || rel.startsWith('Estudos/')) {
    if (agendaAdiada) clearTimeout(agendaAdiada)
    agendaAdiada = setTimeout(() => { agendaAdiada = null; sincronizarAgenda() }, 20_000)
  }
}

/**
 * Abre a sessão e memoriza. Devolve o estado que o renderer espera.
 *
 * `config` é sempre o recorte de `projetarConfigParaRenderer`, nunca
 * `session.config` inteiro — este é um dos quatro pontos que mandam config
 * pro renderer (junto de `vault:state` e o evento `vault:aberto`), e
 * `vaultId`/`nuvem` (que carrega a chave da nuvem) não têm por que atravessar
 * esse canal.
 */
async function abrirVault(root: string): Promise<{ root: string; config: ConfigParaRenderer }> {
  /*
   * A prateleira dos vaults não é um vault, e nada acima dela também é.
   *
   * A guarda fica aqui, e não só no diálogo, porque este é o funil único de
   * abertura: passam por ele o escolher, o criar e a reabertura do vault
   * lembrado. Barrar num só dos três deixaria os outros dois abrindo.
   *
   * Aconteceu três vezes no mesmo dia. O diálogo abre dentro de
   * `userData\vaults`, e um clique a mais para cima cai em `vaults`, dois em
   * `userData`. O Cortex abria aquilo como vault, criava um `.vault` com id
   * NOVO e espalhava as pastas de área ao redor — no caso de `vaults`, em
   * volta dos vaults de verdade. E o id novo é o estrago silencioso: o
   * celular continua publicando no id antigo, este Cortex passa a ouvir o
   * novo, e o que se marca no celular não volta nunca. Foi assim que a água
   * do dia parou de atualizar.
   *
   * A pergunta é `pastaDosVaults` e não `userData` porque é a mais apertada
   * das duas e cobre a outra: `vaults` mora dentro de `userData`, então
   * quem contém `userData` contém `vaults` também. `vaults\Cortex`, que fica
   * ABAIXO, continua passando — é o lugar certo.
   */
  if (ehOuContem(root, pastaDosVaults())) {
    throw new Error(
      'Essa é a pasta onde o Cortex guarda os próprios arquivos, não um vault. ' +
      `Os vaults ficam DENTRO de ${pastaDosVaults()} — escolha um de lá, ou crie um novo.`
    )
  }
  await session.open(root, avisarMudanca)
  await garantirPastaDeProjetos().catch(err => console.error('[cortex] pasta de projetos:', err))
  await lembrarVault(session.vault.root)
  void atualizarInstrucoesClaude()
  ligarCampainha(session.config, aoTocarCampainha)
  setTimeout(sincronizarAgenda, 5_000)
  return { root: session.vault.root, config: projetarConfigParaRenderer(session.config) }
}

/**
 * O celular gravou alguma coisa: puxa agora.
 *
 * O relógio de dois minutos do renderer continua no lugar como rede de
 * segurança — este caminho só adianta o que ele faria. Por isso a falha aqui
 * é silenciosa: um toque perdido custa, no pior caso, esperar o relógio.
 *
 * Não precisa avisar a tela: aplicar um evento grava no vault, o
 * `VaultWatcher` vê a gravação e dispara `vault:changed` como em qualquer
 * outra mudança de arquivo. O caminho de volta já existia.
 */
function aoTocarCampainha(t: 'eventos' | 'cardapio'): void {
  if (t !== 'eventos' || !session.isOpen) return
  void puxarAgora(true)
}

/**
 * Puxa os eventos do celular fora do relógio.
 *
 * O `try` não é decoração: `sincronizadorDe` lança de forma SÍNCRONA quando
 * não há credencial, antes de existir promessa alguma — um `.catch()` no
 * retorno não pegaria isso, e um throw solto aqui dentro sobe pelo tratador
 * de mensagem do WebSocket, no processo principal, sem ninguém acima para
 * segurar.
 *
 * `podeReTentar` cobre a única janela em que um toque se perderia: se a
 * rodada do relógio já estava em andamento quando o evento chegou ao banco,
 * ela pode tê-lo lido antes de ele existir, e a chamada disparada pelo toque
 * desiste (ver `sincronizandoAgora`, em `nuvem/sincronizador.ts`). Uma
 * segunda tentativa poucos segundos depois fecha essa janela sem inventar
 * fila nenhuma.
 */
async function puxarAgora(podeReTentar: boolean): Promise<void> {
  try {
    const r = await sincronizadorDe(session).sincronizar()
    if (r.pulado && podeReTentar) {
      setTimeout(() => { void puxarAgora(false) }, 3000)
    }
  } catch (err) {
    // Falhar aqui custa esperar o relógio de dois minutos, e nada além disso.
    console.error('[cortex] sincronização disparada pela campainha falhou:', err)
  }
}

function createWindow(): void {
  /*
   * Fora a barra de menu do Electron (File, Edit, View, Window).
   *
   * Ela vem de graça e não pertence a este app: o Cortex não abre arquivo por
   * menu e não tem Recortar/Colar de aplicação.
   *
   * Sai SEMPRE, inclusive em desenvolvimento — antes ela ficava ali só para
   * dar Ctrl+R e devtools, o que fazia a tela de quem programa ser diferente
   * da tela de quem usa. Os dois atalhos são registrados à mão logo abaixo,
   * então nada se perde.
   */
  Menu.setApplicationMenu(null)

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    title: 'Cortex',
    backgroundColor: '#181818',
    /*
     * A barra de título é do app, e não do Windows.
     *
     * A barra nativa tinha a cor do sistema, um tom diferente do fundo do
     * Cortex logo abaixo dela — o dono pediu que não houvesse essa emenda. Com
     * `hidden` a barra some e os três botões (minimizar, maximizar, fechar)
     * ficam desenhados por cima do topo do app, na cor que o tema mandar
     * (ver o canal `janela:tema`). O CSS marca o topo como área de arrastar.
     */
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#181818', symbolColor: '#999999', height: 40 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  /*
   * Os dois atalhos que a barra de menu dava, agora sem a barra.
   *
   * Só fora do app empacotado: recarregar a janela no meio do uso normal
   * descartaria o que estivesse sendo escrito, e devtools num app pessoal é
   * porta aberta para colar código que alguém mandou pelo WhatsApp.
   */
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (evento, entrada) => {
      if (entrada.type !== 'keyDown') return
      const ctrl = entrada.control || entrada.meta
      if (ctrl && entrada.key.toLowerCase() === 'r') {
        evento.preventDefault()
        win?.webContents.reload()
      }
      if (entrada.key === 'F12' || (ctrl && entrada.shift && entrada.key.toLowerCase() === 'i')) {
        evento.preventDefault()
        win?.webContents.toggleDevTools()
      }
    })
  }

  // F11 alterna a tela cheia — em desenvolvimento e no app instalado. Sem a
  // barra de menu do Electron o atalho não existia mais.
  win.webContents.on('before-input-event', (evento, entrada) => {
    if (entrada.type === 'keyDown' && entrada.key === 'F11') {
      evento.preventDefault()
      win?.setFullScreen(!win.isFullScreen())
    }
  })

  // Nada nesta janela pode navegar para fora nem abrir janela nova: o app é
  // local, e um link clicado dentro de uma nota abre no navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

/* ---------- canais privilegiados ----------
 * Estes não passam por IPC_SCHEMAS porque não recebem caminho do renderer: o
 * caminho nasce de um diálogo nativo. É o que impede o renderer de nomear
 * qualquer pasta do disco.
 */

/*
 * A versão do app, para a tela de Configurações.
 *
 * Sem payload, então não há o que validar — como `vault:state`. E vem de
 * `app.getVersion()`, que lê o `package.json` empacotado: um número escrito à
 * mão no renderer viraria mentira na primeira release em que alguém
 * esquecesse de trocá-lo nos dois lugares.
 */
ipcMain.handle('app:versao', async () => app.getVersion())

/* A atualização do app: só ordens sem parâmetro e o estado de volta. */
ipcMain.handle('app:atualizacao', async () => estadoDaAtualizacao())
ipcMain.handle('app:procurar-atualizacao', async () => procurarAtualizacaoAgora())
ipcMain.handle('app:reiniciar-atualizacao', async () => { reiniciarParaAtualizar(); return estadoDaAtualizacao() })

/*
 * Google Agenda. Nenhum destes canais recebe caminho nem dado do renderer:
 * o arquivo do cliente é escolhido num diálogo nativo aberto AQUI, e o resto
 * são ordens sem parâmetro. O segredo do cliente e o token nunca voltam para
 * a tela — só o estado.
 */
ipcMain.handle('google:estado', async () => agenda.estado())
ipcMain.handle('google:importar-cliente', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Escolher o arquivo do cliente do Google (JSON)',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (r.canceled || !r.filePaths[0]) return agenda.estado()
  const s = await stat(r.filePaths[0])
  if (s.size > 20_000) throw new Error('esse arquivo é grande demais para ser o JSON do cliente')
  return agenda.importarCliente(await readFile(r.filePaths[0], 'utf8'))
})
ipcMain.handle('google:conectar', async () => agenda.conectar())
ipcMain.handle('google:sincronizar', async () => agenda.sincronizar())
ipcMain.handle('google:desconectar', async () => agenda.desconectar())
ipcMain.handle('google:feriados', async () => agenda.feriados())

/*
 * O conector do Claude (MCP) é um script que o próprio executável do Cortex
 * roda em modo Node — quem usa não precisa ter Node instalado. Empacotado ele
 * mora em `resources/`; em desenvolvimento, na pasta do projeto.
 *
 * `CORTEX_DADOS` diz onde está o `cortex.json` com o último vault, e
 * `CORTEX_APP` de onde carregar o gray-matter que o app já usa.
 */
/**
 * Os argumentos do `claude mcp add` que registra o conector: os caminhos
 * DESTA instalação, entre aspas (um nome de usuário com espaço quebraria o
 * caminho no meio). O mesmo texto serve para o botão "Copiar comando" e para
 * o "Conectar", que o roda num terminal do próprio app.
 */
function argsDoConector(): string[] {
  const script = app.isPackaged
    ? join(process.resourcesPath, 'cortex-mcp.mjs')
    : join(app.getAppPath(), 'resources', 'mcp', 'cortex-mcp.mjs')
  const aspas = (s: string): string => `"${s}"`
  return [
    'mcp', 'add', 'cortex', '--scope', 'user',
    '-e', 'ELECTRON_RUN_AS_NODE=1',
    '-e', `CORTEX_DADOS=${aspas(app.getPath('userData'))}`,
    '-e', `CORTEX_APP=${aspas(app.getAppPath())}`,
    '--', aspas(process.execPath), aspas(script)
  ]
}

/** Se o conector já está registrado no Claude Code, e para este Cortex. Só lê o ~/.claude.json. */
ipcMain.handle('app:estado-conector', async () => {
  return { estado: await lerEstadoDoConector(join(app.getPath('home'), '.claude.json'), process.execPath) }
})

ipcMain.handle('app:conectorClaude', async () => {
  return { comando: ['claude', ...argsDoConector()].join(' ') }
})

/**
 * O botão "Conectar" do conector do Claude.
 *
 * Roda o `claude mcp add` como um processo do Cortex — a saída aparece num
 * terminal dentro das Configurações, que fecha sozinho quando dá certo.
 * Pedido do dono. Antes remove um "cortex" que já exista (outra versão,
 * outro caminho): sem isso o add responderia que ele já existe.
 */
ipcMain.handle('app:conectar-claude', async () => {
  await atualizarPathDoWindows()
  if (!(await comandoInstalado('claude'))) throw new Error(avisoDeFalta('claude'))
  const shell = process.platform === 'win32'
  await rodarCurto('claude', ['mcp', 'remove', 'cortex', '--scope', 'user'], shell)
  const processo = processos.iniciarEtapas(app.getPath('userData'), 'conectar o Claude', [
    { comando: 'claude', args: argsDoConector(), cwd: app.getPath('home') }
  ])
  return { processo }
})

/*
 * A cor dos botões da janela acompanha o tema do app.
 *
 * O renderer é entrada hostil: ele não manda uma COR, manda um de dois nomes,
 * e a cor sai desta tabela. Qualquer outro valor é ignorado.
 */
const CORES_BARRA = {
  escuro: { color: '#181818', symbolColor: '#999999' },
  claro:  { color: '#FBFBFA', symbolColor: '#555555' }
} as const
ipcMain.handle('janela:tema', async (_e, tema: unknown) => {
  if (tema !== 'escuro' && tema !== 'claro') return
  try {
    win?.setTitleBarOverlay({ ...CORES_BARRA[tema], height: 40 })
  } catch {
    // Sem a sobreposição (outro sistema, janela fechando) não há o que pintar.
  }
})

ipcMain.handle('vault:state', async () => {
  if (session.isOpen) return { root: session.vault.root, config: projetarConfigParaRenderer(session.config) }
  return { root: null, config: null }
})

/*
 * O diálogo abre ONDE OS VAULTS MORAM, e não em lugar nenhum.
 *
 * Sem `defaultPath`, o Windows abre na última pasta que o usuário visitou em
 * qualquer programa — e o vault do Cortex vive num caminho que ninguém decora
 * (`AppData\Roaming\Cortex\vaults`). O resultado real foi apontar para a pasta
 * de INSTALAÇÃO do app, que não tem nota nenhuma: o vault abria vazio, todas
 * as telas ficavam em branco, e nada dizia que a pasta escolhida era a errada.
 *
 * Com um vault aberto, abre na pasta dele — que é de onde quem troca de vault
 * quer começar a procurar.
 */
ipcMain.handle('vault:pick', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Escolher a pasta do vault',
    defaultPath: session.isOpen ? session.vault.root : pastaDosVaults(),
    properties: ['openDirectory']
  })
  if (r.canceled || !r.filePaths[0]) return null
  return abrirVault(r.filePaths[0])
})

/**
 * Onde moram os vaults que o app cria.
 *
 * `userData` é a pasta do próprio Cortex, por usuário — e NÃO a pasta onde o
 * app foi instalado. A diferença importa: o desinstalador do NSIS apaga o
 * diretório de instalação inteiro, e uma atualização reinstala por cima. Um
 * vault ali dentro morreria numa desinstalação, sem aviso e sem desfazer.
 * `userData` sobrevive às duas (ver `deleteAppDataOnUninstall: false` no
 * electron-builder.yml).
 *
 * Também não é mais o Desktop, que era o padrão do diálogo: aceitar o padrão
 * plantou um vault por cima de uma pasta `Cortex` que já tinha outra coisa
 * dentro.
 */
function pastaDosVaults(): string {
  return join(app.getPath('userData'), 'vaults')
}

/**
 * A pasta dos projetos do Dev: `userData\projetos`, ao lado dos vaults.
 *
 * Pedido do dono: os projetos que o Cortex cria (e os que clona) ficam nos
 * arquivos do próprio Cortex, como o vault — e não mais na Área de Trabalho.
 * Ela já vem criada e aberta no Dev; outras pastas entram por "Abrir pasta".
 */
function pastaDeProjetos(): string {
  return join(app.getPath('userData'), 'projetos')
}

/**
 * A pasta de projetos existe e está autorizada, na frente da lista.
 * Roda a cada vault aberto: a lista de autorização mora no vault, e um vault
 * novo (ou um em que ela foi tirada) volta a tê-la.
 */
async function garantirPastaDeProjetos(): Promise<void> {
  if (!session.isOpen) return
  const base = pastaDeProjetos()
  await mkdir(base, { recursive: true })
  const atuais = session.config.pastasDev
  if (atuais.some(x => resolve(x) === resolve(base))) return
  await session.salvarConfig({ pastasDev: [base, ...atuais] })
}

ipcMain.handle('dev:pasta-projetos', async () => pastaDeProjetos())

/**
 * O primeiro nome livre dentro de `vaults`.
 *
 * Criar não pode cair num vault que já existe: quem clicou em criar quer um
 * vault novo, e reaproveitar a pasta misturaria as notas dos dois.
 */
async function nomeDeVaultLivre(base: string): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const alvo = join(pastaDosVaults(), n === 1 ? base : `${base} ${n}`)
    try {
      await stat(alvo)
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return alvo
      throw err
    }
  }
  throw new Error('há vaults demais nesta pasta — apague os que não usa')
}

ipcMain.handle('vault:create', async () => {
  // Sem diálogo: clicar em criar cria. O caminho continua nascendo aqui no
  // processo principal, e não do renderer — é a mesma garantia que o diálogo
  // nativo dava, sem obrigar ninguém a escolher uma pasta.
  const alvo = await nomeDeVaultLivre('Cortex')
  await mkdir(alvo, { recursive: true })
  return abrirVault(alvo)
})

/**
 * O git do projeto aberto: estado, remoto, commit e push.
 *
 * A tela nunca manda comando — ela escolhe qual dos quatro gestos, e os
 * argumentos saem de `dev/git.ts`. A pasta passa pelo confinamento de
 * `PastasDev`, como todo o resto da lente Dev.
 */
const pastaDoProjeto = (payload: unknown): string => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('pasta inválida')
  return session.pastasDev.resolver(p.raiz, typeof p.sub === 'string' ? p.sub : '')
}

ipcMain.handle('git:estado', async (_e, payload: unknown) => estadoGit(pastaDoProjeto(payload)))

ipcMain.handle('git:remoto', async (_e, payload: unknown) => {
  const cwd = pastaDoProjeto(payload)
  const p = (payload ?? {}) as { url?: unknown }
  const url = urlDeRepositorio(typeof p.url === 'string' ? p.url : '')
  if (!url) {
    return { ok: false, saida: 'Endereço inválido. Cole o link do repositório, como https://github.com/voce/projeto' }
  }
  const est = await estadoGit(cwd)
  if (!est.repo) {
    const ini = await iniciarRepo(cwd)
    if (!ini.ok) return ini
  }
  return definirRemoto(cwd, url)
})

ipcMain.handle('git:commit', async (_e, payload: unknown) => {
  const cwd = pastaDoProjeto(payload)
  const p = (payload ?? {}) as { mensagem?: unknown }
  const est = await estadoGit(cwd)
  if (!est.repo) {
    const ini = await iniciarRepo(cwd)
    if (!ini.ok) return ini
  }
  return commitar(cwd, mensagemDeCommit(typeof p.mensagem === 'string' ? p.mensagem : ''))
})

ipcMain.handle('git:push', async (_e, payload: unknown) => {
  const cwd = pastaDoProjeto(payload)
  const est = await estadoGit(cwd)
  if (!est.remoto) {
    return { ok: false, saida: 'Este projeto ainda não tem um repositório no GitHub. Cole o link primeiro.' }
  }
  if (est.semCommit) return { ok: false, saida: 'Faça o primeiro commit antes de enviar.' }
  return empurrar(cwd, est.ramo)
})

ipcMain.handle('dev:add-folder', async () => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const r = await dialog.showOpenDialog({
    title: 'Autorizar uma pasta de código',
    properties: ['openDirectory']
  })
  if (r.canceled || !r.filePaths[0]) return session.config.pastasDev
  const nova = resolve(r.filePaths[0])
  const atuais = session.config.pastasDev
  if (atuais.some(p => resolve(p) === nova)) return atuais
  const c = await session.salvarConfig({ pastasDev: [...atuais, nova] })
  return c.pastasDev
})

/**
 * Autoriza uma pasta que o usuário arrastou para a janela.
 *
 * Aqui o renderer nomeia um caminho absoluto — a única vez em todo o app. Por
 * isso o processo principal não confia nele: confirma que é mesmo um
 * diretório e PERGUNTA ao usuário, com o caminho na tela, antes de gravar na
 * lista de autorização. Um arrastar sem querer não pode virar acesso
 * permanente a uma pasta, e a confirmação é o que mantém a autorização sendo
 * uma decisão humana, como no diálogo nativo.
 */
ipcMain.handle('dev:add-dropped', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { caminho?: unknown }
  if (typeof p.caminho !== 'string' || !p.caminho) throw new Error('caminho inválido')

  const alvo = resolve(p.caminho)
  const s = await stat(alvo).catch(() => null)
  if (!s?.isDirectory()) throw new Error('arraste uma pasta, não um arquivo')

  const atuais = session.config.pastasDev
  if (atuais.some(x => resolve(x) === alvo)) return atuais

  const r = await dialog.showMessageBox({
    type: 'question',
    title: 'Autorizar pasta de código',
    message: `Dar ao Cortex acesso de leitura e escrita a esta pasta?`,
    detail: alvo,
    buttons: ['Autorizar', 'Cancelar'],
    defaultId: 0,
    cancelId: 1
  })
  if (r.response !== 0) return atuais

  const c = await session.salvarConfig({ pastasDev: [...atuais, alvo] })
  return c.pastasDev
})

/**
 * Abre um terminal na pasta.
 *
 * A pasta passa por `PastasDev.resolver` antes: mesmo sendo o processo
 * principal, uma raiz não autorizada não vira `cwd` de nada. E o caminho vai
 * como `cwd` do processo, nunca concatenado dentro de uma linha de comando —
 * é isso que impede um nome de pasta com aspas ou `&` de virar comando.
 */
ipcMain.handle('dev:terminal', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  const sub = typeof p.sub === 'string' ? p.sub : ''
  const cwd = session.pastasDev.resolver(p.raiz, sub)

  if (process.platform === 'win32') {
    // `start ""` abre uma janela nova de console herdando o cwd deste spawn.
    spawn(process.env.ComSpec ?? 'cmd.exe', ['/c', 'start', '', 'cmd.exe'], {
      cwd, detached: true, stdio: 'ignore', windowsHide: false
    }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Terminal', cwd], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('x-terminal-emulator', [], { cwd, detached: true, stdio: 'ignore' }).unref()
  }
  return { cwd: basename(cwd) }
})

/** Os scripts do package.json daquele projeto. Lista vazia se nao houver. */
ipcMain.handle('dev:scripts', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  const cwd = session.pastasDev.resolver(p.raiz, typeof p.sub === 'string' ? p.sub : '')
  return { scripts: await scriptsDoProjeto(cwd) }
})

/**
 * Roda um script do projeto dentro do app.
 *
 * O renderer manda o NOME do script; `Processos.iniciar` recusa qualquer um
 * que nao esteja no package.json. Nunca um comando livre.
 */
ipcMain.handle('dev:rodar', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown; script?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  if (typeof p.script !== 'string' || p.script === '') throw new Error('script inválido')
  const cwd = session.pastasDev.resolver(p.raiz, typeof p.sub === 'string' ? p.sub : '')
  return processos.iniciar(p.raiz, cwd, p.script)
})

/** Tira da lista um processo que já terminou (o terminal do "Conectar", que fecha sozinho). */
ipcMain.handle('dev:esquecer', async (_e, payload: unknown) => {
  const p = (payload ?? {}) as { id?: unknown }
  if (typeof p.id !== 'string') throw new Error('id inválido')
  processos.esquecer(p.id)
  return { ok: true }
})

/** O "Interromper todos" do terminal: para tudo que o Cortex iniciou. */
ipcMain.handle('dev:parar-todos', async () => {
  processos.pararTudo()
  return { ok: true }
})

ipcMain.handle('dev:parar', async (_e, payload: unknown) => {
  const p = (payload ?? {}) as { id?: unknown }
  if (typeof p.id !== 'string') throw new Error('id inválido')
  processos.parar(p.id)
  return { ok: true }
})

ipcMain.handle('dev:processos', async () => ({ processos: processos.listar() }))

ipcMain.handle('dev:saida', async (_e, payload: unknown) => {
  const p = (payload ?? {}) as { id?: unknown }
  if (typeof p.id !== 'string') throw new Error('id inválido')
  return { linhas: processos.saida(p.id) }
})

ipcMain.handle('dev:limpar-encerrados', async () => {
  processos.limparEncerrados()
  return { processos: processos.listar() }
})

/**
 * Cria um projeto novo na pasta de projetos do Cortex e já instala tudo.
 *
 * A tela manda três coisas: o modelo e a linguagem, de listas fechadas, e um
 * nome, conferido pelo formato estreito de `novoProjeto.ts`. Os comandos são
 * montados aqui, daquela tabela.
 *
 * A pasta `projetos` entra na lista de autorização sem o diálogo nativo, e é
 * a exceção consciente: não é a tela nomeando um caminho do disco — é este
 * botão, apertado pela pessoa, criando uma pasta num lugar fixo que o próprio
 * processo principal escolhe.
 */
ipcMain.handle('dev:novo-projeto', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { modelo?: unknown; linguagem?: unknown; nome?: unknown }
  const modelo = MODELOS_PROJETO.find(m => m === p.modelo)
  const linguagem = LINGUAGENS_PROJETO.find(l => l === p.linguagem)
  if (!modelo) throw new Error('modelo inválido')
  if (!linguagem) throw new Error('linguagem inválida')
  if (!nomeDeProjetoValido(p.nome)) {
    throw new Error('nome inválido: comece com letra minúscula e use só letras, números, - e _')
  }
  const nome = p.nome

  const base = pastaDeProjetos()
  await mkdir(base, { recursive: true })
  if (await stat(join(base, nome)).catch(() => null)) {
    throw new Error(`já existe uma pasta "${nome}" em projetos`)
  }

  // Antes de criar qualquer coisa: as ferramentas que as etapas usam existem
  // neste computador? Se não, um aviso claro do que instalar — e nenhuma
  // pasta pela metade.
  const etapas = etapasNovoProjeto(modelo, linguagem, nome, base)
  await atualizarPathDoWindows()
  for (const c of comandosExternos(etapas)) {
    if (!(await comandoInstalado(c))) throw new Error(avisoDeFalta(c))
  }

  let pastasDev = session.config.pastasDev
  let raiz = pastasDev.find(x => resolve(x) === resolve(base))
  if (!raiz) {
    pastasDev = (await session.salvarConfig({ pastasDev: [...pastasDev, base] })).pastasDev
    raiz = base
  }

  // Python, C e C++ não têm criador oficial: o esqueleto sai da tabela de
  // `novoProjeto.ts`, com conteúdo fixo, e cada caminho é conferido para não
  // sair da pasta do projeto antes de ser escrito.
  const arquivos = arquivosNovoProjeto(modelo, nome, linguagem)
  if (arquivos.length > 0) await escreverArquivosIniciais(join(base, nome), arquivos)

  const rotulo = `criar ${NOME_MODELO[modelo]} · ${nome}`
  const processo = processos.iniciarEtapas(raiz, rotulo, etapas)
  return { processo, raiz, pasta: nome, pastasDev }
})

/**
 * Clona um repositório do GitHub na pasta de projetos do Cortex.
 *
 * Mesma exceção consciente do novo projeto: a pasta `projetos` entra na
 * autorização sem diálogo, porque o lugar é fixo e escolhido aqui. O que vem
 * da tela é só o texto do repositório, que `repoDoGithub` reduz a uma URL
 * https do GitHub — nada além disso vira argumento do `git`.
 */
ipcMain.handle('dev:clonar-repo', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const repo = repoDoGithub((payload as { url?: unknown } | null)?.url)
  if (!repo) throw new Error('repositório inválido: use o link do GitHub ou dono/repositório')

  const base = pastaDeProjetos()
  await mkdir(base, { recursive: true })
  if (await stat(join(base, repo.nome)).catch(() => null)) {
    throw new Error(`já existe uma pasta "${repo.nome}" em projetos`)
  }
  await atualizarPathDoWindows()
  if (!(await comandoInstalado('git'))) throw new Error(avisoDeFalta('git'))

  let pastasDev = session.config.pastasDev
  let raiz = pastasDev.find(x => resolve(x) === resolve(base))
  if (!raiz) {
    pastasDev = (await session.salvarConfig({ pastasDev: [...pastasDev, base] })).pastasDev
    raiz = base
  }

  // `--` antes da URL: nada depois dele é lido como opção do git.
  // GIT_TERMINAL_PROMPT=0: repositório privado sem login falha na hora, em vez
  // de esperar uma senha num terminal que não existe.
  const processo = processos.iniciarEtapas(raiz, `clonar ${repo.nome}`, [{
    comando: 'git', args: ['clone', '--', repo.url, repo.nome], cwd: base,
    env: { GIT_TERMINAL_PROMPT: '0' }
  }])
  return { processo, raiz, pasta: repo.nome, pastasDev }
})

/**
 * O `CLAUDE.md` da pasta de dados do Cortex (`AppData\Roaming\Cortex`).
 *
 * Gravado sozinho, sem botão: toda vez que um vault abre, e quando as áreas
 * mudam. Assim ele sempre aponta para o vault em uso e só pergunta das áreas
 * ligadas. Mora na pasta de dados, e não dentro do vault, porque é ali que o
 * dono abre o Claude Code — e o vault é das notas, não do app.
 *
 * Falha em silêncio: sem o arquivo o Cortex funciona igual, e um erro de
 * disco aqui não pode impedir o vault de abrir.
 */
async function atualizarInstrucoesClaude(): Promise<void> {
  if (!session.isOpen) return
  try {
    const dados = app.getPath('userData')
    const root = session.vault.root
    const rel = relative(dados, root)
    const dentro = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
    await gravarSeMudou(join(dados, 'CLAUDE.md'), instrucoesParaClaude(session.config.areas, {
      pasta: root,
      relativo: dentro ? rel.split(sep).join('/') : null
    }))
  } catch {
    // Ver acima: não é motivo para nada deixar de funcionar.
  }
}

/**
 * Abre a pasta do projeto no VS Code.
 *
 * `code` e um .cmd no Windows, por isso o shell. O caminho vai como
 * argumento separado -- concatena-lo numa string deixaria um projeto com
 * espaco ou aspas no nome virar comando.
 */
ipcMain.handle('dev:vscode', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  const alvo = session.pastasDev.resolver(p.raiz, typeof p.sub === 'string' ? p.sub : '')
  const filho = spawn('code', [alvo], {
    shell: process.platform === 'win32', detached: true, stdio: 'ignore', windowsHide: true
  })
  filho.unref()
  return new Promise(resolve => {
    // `code` nao instalado e o caso comum, e o erro so aparece de forma
    // assincrona. Sem esta espera curta, a tela diria "abrindo" para sempre.
    filho.on('error', () => resolve({ ok: false, motivo: 'VS Code não encontrado no PATH' }))
    setTimeout(() => resolve({ ok: true }), 400)
  })
})

/**
 * Copia para uma pasta da árvore o que foi arrastado do Explorer.
 *
 * O caminho de origem vem do renderer (webUtils, no preload), e é a única
 * coisa que ele nomeia fora das pastas autorizadas: só é LIDO, nunca
 * gravado. O destino passa por PastasDev.resolver. Ver copiarPara.
 */
ipcMain.handle('dev:copiar', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown; origem?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  if (typeof p.origem !== 'string' || !p.origem) throw new Error('arquivo inválido')
  const rel = await session.pastasDev.copiarPara(p.raiz, typeof p.sub === 'string' ? p.sub : '', p.origem)
  return { rel }
})

/** O `{ raiz, rel }` de um item da árvore, conferido. */
function itemDoPayload(payload: unknown): { raiz: string; rel: string } {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; rel?: unknown }
  if (typeof p.raiz !== 'string' || typeof p.rel !== 'string') throw new Error('item inválido')
  return { raiz: p.raiz, rel: p.rel }
}

/**
 * Exclui um arquivo ou pasta da árvore mandando para a LIXEIRA, e não
 * apagando de vez: um clique errado se desfaz pela Lixeira do Windows.
 */
ipcMain.handle('dev:excluir', async (_e, payload: unknown) => {
  const { raiz, rel } = itemDoPayload(payload)
  await shell.trashItem(session.pastasDev.item(raiz, rel))
  return { ok: true }
})

/** Move um item para outra pasta da mesma raiz (arrastar dentro da árvore). */
ipcMain.handle('dev:mover', async (_e, payload: unknown) => {
  const { raiz, rel } = itemDoPayload(payload)
  const para = (payload as { para?: unknown }).para
  if (typeof para !== 'string') throw new Error('destino inválido')
  return { rel: await session.pastasDev.mover(raiz, rel, para) }
})

ipcMain.handle('dev:renomear', async (_e, payload: unknown) => {
  const { raiz, rel } = itemDoPayload(payload)
  const nome = (payload as { nome?: unknown }).nome
  if (typeof nome !== 'string') throw new Error('nome inválido')
  return { rel: await session.pastasDev.renomear(raiz, rel, nome) }
})

/** Foto ou PDF em base64, para o Dev mostrar em vez de "binário". */
ipcMain.handle('dev:ler-midia', async (_e, payload: unknown) => {
  const { raiz, rel } = itemDoPayload(payload)
  return session.pastasDev.lerMidia(raiz, rel)
})

/** Abre um arquivo no programa padrão do Windows (o que não abre dentro do Cortex). */
ipcMain.handle('dev:abrir-padrao', async (_e, payload: unknown) => {
  const { raiz, rel } = itemDoPayload(payload)
  const erro = await shell.openPath(session.pastasDev.item(raiz, rel))
  return erro ? { ok: false, motivo: erro } : { ok: true }
})

/** Abre a pasta no explorador de arquivos do sistema. */
ipcMain.handle('dev:reveal', async (_e, payload: unknown) => {
  if (!session.isOpen) throw new Error('nenhum vault aberto')
  const p = (payload ?? {}) as { raiz?: unknown; sub?: unknown }
  if (typeof p.raiz !== 'string') throw new Error('raiz inválida')
  const alvo = session.pastasDev.resolver(p.raiz, typeof p.sub === 'string' ? p.sub : '')
  // No Windows, o explorer.exe direto: o `shell.openPath` respondia "ok" e
  // não abria janela nenhuma na pasta de projetos (dentro do AppData), e a
  // falha ficava muda. O caminho vai como argumento, nunca dentro de um
  // comando montado.
  if (process.platform === 'win32') {
    spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe'), [alvo], {
      detached: true, stdio: 'ignore', windowsHide: false
    }).unref()
    return { ok: true }
  }
  const erro = await shell.openPath(alvo)
  if (erro) throw new Error(`não deu para abrir a pasta: ${erro}`)
  return { ok: true }
})

// Fechar o app tem que levar junto o que ele iniciou: sem isto, um
// `npm run dev` fica vivo segurando a porta, e a unica forma de perceber e
// pelo gerenciador de tarefas.
app.on('before-quit', () => processos.pararTudo())

app.whenReady().then(async () => {
  // A checagem acontece no processo main, e não no renderer: a CSP logo
  // abaixo põe `connect-src 'none'` na janela, e uma busca de rede feita de
  // lá seria barrada. Vale para qualquer chamada externa futura.
  ligarAtualizacaoAutomatica()

  // Em produção o renderer é um arquivo local e não deve poder buscar nada na
  // rede. Em dev a CSP fica de fora porque o HMR do Vite usa websocket e
  // eval — travar isso quebraria o ciclo de desenvolvimento sem tornar o app
  // empacotado mais seguro.
  if (!process.env.ELECTRON_RENDERER_URL) {
    sessaoEletron.defaultSession.webRequest.onHeadersReceived((detalhes, cb) => {
      cb({
        responseHeaders: {
          ...detalhes.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            // blob: para foto e PDF da lente Dev, que chegam do processo principal
            // em base64 e viram um endereço local — nada vem da rede.
            "img-src 'self' data: blob:; frame-src blob:; font-src 'self' data:; connect-src 'none'; " +
            "object-src 'none'; base-uri 'none'; form-action 'none'"
          ]
        }
      })
    })
  }

  registerIpc(session, { aoMudarAreas: () => void atualizarInstrucoesClaude() })
  // A cada três minutos o Cortex confere o Google Agenda (o que foi criado ou
  // editado no celular). Sem conexão feita, a rodada volta na hora sem rede.
  setInterval(sincronizarAgenda, 3 * 60_000)
  createWindow()

  // Reabre o último vault sozinho. A tela de abertura só aparece de verdade
  // no primeiro uso — ou se a pasta lembrada sumiu.
  const lembrado = await vaultLembrado()
  if (lembrado) {
    try {
      // Passa por `abrirVault` para não haver dois caminhos de abertura: foi
      // exatamente essa duplicação que deixaria a campainha ligada só quando
      // o vault fosse escolhido à mão, e muda no caso mais comum, que é o app
      // reabrindo sozinho no vault de sempre.
      const aberto = await abrirVault(lembrado)
      win?.webContents.send('vault:aberto', aberto)
    } catch {
      // Pasta apagada, drive desconectado, permissão negada: cai na abertura.
    }
  }
})

app.on('window-all-closed', async () => {
  desligarCampainha()
  // Fechar não pode ficar pendurado: o instalador de uma versão nova espera o
  // Cortex sair para trocar os arquivos. Se fechar o índice travar, sai assim
  // mesmo em 3 s — as notas já estão gravadas, e o índice se refaz ao abrir.
  const limite = setTimeout(() => app.exit(0), 3000)
  await session.close().catch(() => {})
  clearTimeout(limite)
  if (process.platform !== 'darwin') app.quit()
})
