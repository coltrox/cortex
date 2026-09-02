import { ipcMain } from 'electron'
import { IPC_SCHEMAS, type IpcChannel } from '../../shared/ipc'
import type { Session } from '../session'
import {
  getNote, listNotes, listNotesWithFields, searchFullText, getBacklinks, getOutlinks, getBrokenLinks
} from '../index/queries'
import { patchFrontmatter, appendToFrontmatterList } from '../vault/patch'
import { resolveLinks } from '../index/resolver'
import {
  novoVaultId, projetarConfigParaRenderer, IDS_AREAS,
  pastasDasAreas, pastasProtegidas
} from '../config'
import { criarCofre, abrirCofre, reenvelopar } from '../cifra'
import { converterPastas } from '../converter'
import { criarSegredo, conferirSenha } from '../senha'
import { ClienteNuvem } from '../nuvem/cliente'
import { credencialDe } from '../nuvem/credencial'
import { Sincronizador } from '../nuvem/sincronizador'
import { tocarCampainha, religarCampainha } from '../nuvem/campainha'

/**
 * Monta o sincronizador na hora. Sem credencial, falha com mensagem legível.
 *
 * Exportada porque `index.ts` também precisa dela: é ele quem ouve a campainha
 * do celular e puxa os eventos na hora, sem passar por IPC nenhum.
 */
export function sincronizadorDe(session: Session): Sincronizador {
  const cred = credencialDe(session.config)
  // Sem credencial no build nem no config: o app segue funcionando inteiro,
  // só sem celular. A mensagem diz o que fazer a quem compilou o app, porque
  // não há tela onde o usuário possa consertar isso.
  if (!cred) {
    throw new Error(
      'este build saiu sem credencial do Supabase — preencha o .env da raiz e recompile'
    )
  }
  return new Sincronizador(session, new ClienteNuvem(cred, session.config.vaultId))
}

/**
 * `note:patch`, `note:append` e `note:ensure` são todos ler-modificar-gravar.
 * Duas chamadas concorrentes para o MESMO caminho (ex.: dois lançamentos
 * rápidos de gasto no diário de hoje) não podem interlear leitura e escrita —
 * senão a segunda gravação sobrescreve a primeira em silêncio (mesmo defeito
 * do nome de temporário por PID que já mordeu este projeto: "correto no
 * teste, errado sob concorrência real"). Cada `path` tem sua própria fila:
 * a operação N+1 só começa a ler o disco depois que a N terminou de gravar
 * (sucesso ou falha), mas caminhos diferentes seguem em paralelo.
 */
const filasPorSessao = new WeakMap<Session, Map<string, Promise<unknown>>>()

// `pastasDasAreas` e `pastasProtegidas` moram em ../config: session.ts
// tambem precisa delas, e session importando daqui fecharia um ciclo. O
// reexport mantem quem ja importava daqui funcionando.
export { pastasDasAreas } from '../config'

/**
 * Abre o cofre com a senha, ou lanca.
 *
 * Todo caminho que mexe na cifra passa por aqui: e o unico lugar onde a chave
 * mestra e materializada, e ela nunca sai desta funcao a nao ser para dentro
 * do `Cofre` da sessao.
 */
function abrirCofreDaSessao(session: Session, senha: string): Buffer {
  if (!session.config.cofre) throw new Error('nao ha cofre neste vault')
  const chave = abrirCofre(senha, session.config.cofre)
  if (!chave) throw new Error('senha incorreta')
  session.cofre.destrancar(chave)
  return chave
}

function serializarPorCaminho<T>(
  session: Session, path: string, tarefa: () => Promise<T>
): Promise<T> {
  let filas = filasPorSessao.get(session)
  if (!filas) { filas = new Map(); filasPorSessao.set(session, filas) }

  const anterior = filas.get(path) ?? Promise.resolve()
  const atual = anterior.then(tarefa, tarefa)
  // A entrada na fila nunca deve rejeitar — senão a PRÓXIMA operação na fila
  // (que só encadeia em `anterior.then(tarefa, tarefa)`) já dispara a partir
  // de uma promise resolvida, o que está correto; mas se guardássemos `atual`
  // diretamente aqui, um `.catch` externo tardio na op N poderia observar
  // "unhandled rejection" nesta referência interna. Guardamos uma cópia
  // silenciada só para servir de marcador de "vez" da fila.
  filas.set(path, atual.then(() => undefined, () => undefined))
  return atual
}

export async function handle(
  session: Session, canal: IpcChannel, bruto: unknown
): Promise<unknown> {
  const schema = IPC_SCHEMAS[canal]
  if (!schema) throw new Error(`canal desconhecido: ${canal}`)

  const parsed = schema.safeParse(bruto ?? {})
  if (!parsed.success) throw new Error(`payload inválido em ${canal}: ${parsed.error.message}`)
  const p = parsed.data as any

  switch (canal) {
    case 'note:read': {
      const content = await session.vault.read(p.path)
      return { content, meta: getNote(session.db, p.path) ?? null }
    }

    case 'note:write':
      await session.vault.writeAtomic(p.path, p.content)
      await session.indexer.indexFile(p.path)
      return { ok: true }

    case 'note:list':
      return listNotes(session.db, { tipo: p.tipo, project: p.project })

    case 'note:list-fields':
      return listNotesWithFields(session.db, {
        tipo: p.tipo, project: p.project, desde: p.desde, ate: p.ate
      })

    case 'note:create': {
      if (await session.vault.exists(p.path)) {
        throw new Error(`nota já existe: ${p.path}`)
      }
      await session.vault.writeAtomic(p.path, p.content)
      await session.indexer.indexFile(p.path)
      return { path: p.path }
    }

    // Frontmatter escrito por formulário — ação explícita do usuário, nunca
    // automática (emenda à constraint "o app nunca reescreve frontmatter que
    // o autor digitou"). Ler-modificar-gravar acontece aqui, no processo
    // principal, serializado por caminho: ver `serializarPorCaminho`.
    case 'note:patch':
      return serializarPorCaminho(session, p.path, async () => {
        const raw = await session.vault.read(p.path)
        const patched = patchFrontmatter(raw, p.campos)
        await session.vault.writeAtomic(p.path, patched)
        await session.indexer.indexFile(p.path)
        return { path: p.path }
      })

    case 'note:append':
      return serializarPorCaminho(session, p.path, async () => {
        const raw = await session.vault.read(p.path)
        const { raw: patched, total } = appendToFrontmatterList(raw, p.campo, p.item)
        await session.vault.writeAtomic(p.path, patched)
        await session.indexer.indexFile(p.path)
        return { path: p.path, total }
      })

    case 'note:ensure':
      return serializarPorCaminho(session, p.path, async () => {
        if (await session.vault.exists(p.path)) {
          return { path: p.path, criada: false }
        }
        await session.vault.writeAtomic(p.path, p.conteudoInicial)
        await session.indexer.indexFile(p.path)
        return { path: p.path, criada: true }
      })

    // Apagar e mover mexem no conjunto de notas existentes, então `resolveLinks`
    // roda logo em seguida: sem isso, um wikilink que apontava para a nota
    // movida continuaria com `resolved_path` antigo até o próximo lote do
    // watcher — o painel de dependências mostraria um link válido para um
    // arquivo que não está mais ali. Mesmo defeito que já mordeu o watcher.
    case 'note:delete':
      return serializarPorCaminho(session, p.path, async () => {
        await session.vault.remover(p.path)
        session.indexer.removeFile(p.path)
        resolveLinks(session.db)
        return { path: p.path }
      })

    case 'note:move':
      return serializarPorCaminho(session, p.de, async () => {
        await session.vault.mover(p.de, p.para)
        session.indexer.removeFile(p.de)
        await session.indexer.indexFile(p.para)
        resolveLinks(session.db)
        return { de: p.de, para: p.para }
      })

    case 'folder:list':
      return session.vault.listarPastas()

    case 'folder:create':
      await session.vault.criarPasta(p.pasta)
      return { pasta: p.pasta }

    // Recorte explícito: o renderer nunca recebe `session.config` inteiro,
    // que carrega `vaultId` e a chave da nuvem. Ver `projetarConfigParaRenderer`.
    case 'config:get':
      return projetarConfigParaRenderer(session.config)

    case 'config:areas': {
      const c = await session.salvarConfig({ areas: p.areas, escolheu: true })
      // Criar as pastas na hora que a área é ligada é o que faz o vault ser
      // legível fora do app: quem abrir a pasta no Explorer (ou o Claude
      // lendo do disco) encontra a estrutura mesmo antes da primeira nota.
      // Idempotente — religar uma área não mexe no que já está lá.
      for (const pasta of pastasDasAreas(c.areas)) {
        await session.vault.criarPasta(pasta)
      }
      return projetarConfigParaRenderer(c)
    }

    /*
     * A senha dos painéis.
     *
     * Toda a conferência acontece aqui, no processo principal. O renderer
     * nunca recebe o segredo — nem para comparar — porque ele é entrada
     * hostil neste projeto: qualquer coisa que ele possa ler, uma página
     * comprometida também pode.
     *
     * Lembrete honesto para quem mexer nisto depois: enquanto a cifra dos
     * painéis trancados não existir, esta é uma tranca de TELA. O vault
     * continua em markdown legível no disco.
     */
    case 'senha:definir': {
      // Trocar a senha exige a senha atual. Sem isso, quem senta na maquina
      // com um painel aberto redefine a senha e destranca o resto.
      let cofre = session.config.cofre
      let chave: Buffer

      if (session.config.senha === null) {
        // Primeira senha do vault: cofre novo, chave nova.
        const novo = criarCofre(p.nova)
        cofre = novo.cofre
        chave = novo.chave
      } else {
        if (p.atual === null || !conferirSenha(p.atual, session.config.senha)) {
          throw new Error('senha atual incorreta')
        }
        if (cofre) {
          const atual = abrirCofre(p.atual, cofre)
          // A senha confere mas o cofre nao abre: o envelope esta corrompido.
          // Seguir daqui reembrulharia lixo e deixaria o conteudo cifrado
          // ilegivel para sempre -- e nao ha recuperacao.
          if (!atual) {
            throw new Error(
              'a senha confere, mas o cofre da cifra nao abriu — o config.json ' +
              'pode estar corrompido. A senha NAO foi trocada.'
            )
          }
          // Reembrulha a chave-mestra com a senha nova, em vez de recifrar o
          // vault: e o ponto inteiro do envelope (ver cifra.ts). Uma escrita,
          // nao milhares.
          chave = atual
          cofre = reenvelopar(atual, p.nova)
        } else {
          const novo = criarCofre(p.nova)
          cofre = novo.cofre
          chave = novo.chave
        }
      }

      const senha = criarSegredo(p.nova)
      session.cofre.destrancar(chave)
      session.cofre.definirPastas(pastasProtegidas(session.config.paineisTrancados))
      // A dica anda junto com a senha, sempre: ela lembra ESTA senha, e
      // deixar a frase antiga colada numa senha nova é pior do que não ter
      // dica nenhuma — ela apontaria para o segredo errado.
      return projetarConfigParaRenderer(
        await session.salvarConfig({ senha, cofre, dicaSenha: p.dica.trim() })
      )
    }

    case 'senha:conferir': {
      // Sem senha cadastrada nao ha o que conferir, e responder true aqui
      // abriria qualquer painel que estivesse na lista por engano.
      if (session.config.senha === null) return false
      if (!conferirSenha(p.senha, session.config.senha)) return false
      // Conferir a senha e o mesmo gesto que abrir o cofre: e assim que o
      // painel cifrado passa a ser legivel enquanto ele estiver na tela.
      if (session.config.cofre) {
        const chave = abrirCofre(p.senha, session.config.cofre)
        if (chave) session.cofre.destrancar(chave)
      }
      session.cofre.definirPastas(pastasProtegidas(session.config.paineisTrancados))
      return true
    }

    case 'senha:remover': {
      if (session.config.senha === null) return projetarConfigParaRenderer(session.config)
      if (!conferirSenha(p.atual, session.config.senha)) throw new Error('senha incorreta')

      // Decifra tudo ANTES de jogar a chave fora. Na ordem inversa, o
      // conteudo ficaria ilegivel para sempre -- e nao ha recuperacao.
      const antes = pastasProtegidas(session.config.paineisTrancados)
      if (session.config.cofre && antes.length > 0) {
        abrirCofreDaSessao(session, p.atual)
        session.cofre.definirPastas([])
        const r = await converterPastas(session.vault, session.indexer, session.cofre, antes)
        if (r.falhas.length > 0) {
          // Parar aqui, com a chave ainda guardada, e o unico jeito de o
          // Pedro poder tentar de novo. Apagar o cofre agora deixaria esses
          // arquivos ilegiveis para sempre.
          throw new Error(
            `${r.falhas.length} arquivo(s) nao puderam ser decifrados; a senha NAO foi ` +
            `removida. Primeiro: ${r.falhas[0].path} (${r.falhas[0].motivo})`
          )
        }
      }
      session.cofre.trancar()
      session.cofre.definirPastas([])
      // Tirar a senha destranca todos os paineis junto: manter a lista
      // deixaria paineis trancados sem chave nenhuma.
      // A dica sai junto: uma frase de lembrete pendurada num vault sem
      // cadeado só entrega o que a pessoa pensou ao escolher a senha.
      return projetarConfigParaRenderer(
        await session.salvarConfig({
          senha: null, paineisTrancados: [], cofre: null, dicaSenha: ''
        })
      )
    }

    case 'senha:paineis': {
      // Mudar a lista e destrancar por outro caminho -- pede a senha igual.
      if (session.config.senha === null) throw new Error('crie uma senha antes de trancar painéis')
      if (!conferirSenha(p.atual, session.config.senha)) throw new Error('senha incorreta')

      // Filtra por tipo E por area conhecida: o renderer e entrada hostil, e
      // um id fora de IDS_AREAS trancaria um painel que nao existe.
      const paineis = [...new Set((p.paineis as unknown[]).filter(
        (x): x is string => typeof x === 'string' && IDS_AREAS.includes(x)
      ))]

      const antes = pastasProtegidas(session.config.paineisTrancados)
      const depois = pastasProtegidas(paineis)

      // Um vault que nunca teve painel trancado ainda nao tem cofre.
      let cofre = session.config.cofre
      if (!cofre && depois.length > 0) {
        const novo = criarCofre(p.atual)
        cofre = novo.cofre
        session.cofre.destrancar(novo.chave)
      } else if (cofre) {
        abrirCofreDaSessao(session, p.atual)
      }

      // O cofre aponta para o estado FINAL antes de converter: e o que faz a
      // conversao ser "ler e gravar de volta" nos dois sentidos (converter.ts).
      session.cofre.definirPastas(depois)
      const afetadas = [...new Set([...antes, ...depois])]
      const r = afetadas.length > 0
        ? await converterPastas(session.vault, session.indexer, session.cofre, afetadas)
        : { convertidos: 0, intactos: 0, falhas: [] }

      const salvo = await session.salvarConfig({ paineisTrancados: paineis, cofre })
      if (r.falhas.length > 0) {
        // A config ja foi salva: o estado em disco e misto, e misto e um
        // estado valido (paraLer decide por arquivo). Repetir a operacao
        // termina o servico -- por isso e aviso, nao excecao.
        console.error('[cortex] falhas ao converter paineis:', r.falhas)
      }
      return projetarConfigParaRenderer(salvo)
    }

    case 'dev:folders':
      return session.config.pastasDev

    case 'dev:remove-folder': {
      // Só tira da lista de autorização — o app nunca apaga pasta de código.
      const restantes = session.config.pastasDev.filter(r => r !== p.raiz)
      return projetarConfigParaRenderer(await session.salvarConfig({ pastasDev: restantes }))
    }

    case 'dev:tree':
      return session.pastasDev.listar(p.raiz, p.sub)

    case 'dev:read':
      return { conteudo: await session.pastasDev.ler(p.raiz, p.arquivo) }

    case 'dev:write':
      await session.pastasDev.gravar(p.raiz, p.arquivo, p.conteudo)
      return { ok: true }

    case 'search:fulltext':
      return searchFullText(session.db, p.q, p.limit)

    case 'links:backlinks': return getBacklinks(session.db, p.path)
    case 'links:outlinks':  return getOutlinks(session.db, p.path)
    case 'links:broken':    return getBrokenLinks(session.db)

    case 'nuvem:estado':
      return {
        vaultId: session.config.vaultId,
        configurada: credencialDe(session.config) !== null,
        enderecoApp: session.config.enderecoApp
      }

    case 'nuvem:endereco': {
      // `normalizarConfig` é quem recusa o que não for https — gravar aqui e
      // reler de lá garante que a regra viva num lugar só.
      const c = await session.salvarConfig({ enderecoApp: p.endereco })
      return { enderecoApp: c.enderecoApp }
    }

    case 'nuvem:credenciais': {
      const c = await session.salvarConfig({ nuvem: { url: p.url, chave: p.chave } })
      return { configurada: c.nuvem !== null, url: c.nuvem?.url ?? null }
    }

    case 'nuvem:novo-id': {
      // Trocar o id é o que revoga um celular cujo id vazou. Nada é apagado:
      // os eventos antigos simplesmente deixam de ser buscados.
      const c = await session.salvarConfig({ vaultId: novoVaultId() })
      religarCampainha(c)
      return { vaultId: c.vaultId }
    }

    case 'nuvem:sincronizar':
      return sincronizadorDe(session).sincronizar()

    case 'nuvem:publicar': {
      const itens = await sincronizadorDe(session).publicar()
      // Toca só depois de o banco confirmar: avisar antes faria o celular
      // buscar o cardápio velho e concluir que não mudou nada.
      tocarCampainha('cardapio')
      return { itens }
    }

    default: {
      // Guarda de exaustividade: se um canal novo for acrescentado a IPC_SCHEMAS
      // sem um `case` aqui, o compilador acusa `canal` como não-`never`. Em
      // runtime (payload validado mas canal sem case), falha alto e explícito
      // em vez de devolver `undefined` como se a chamada tivesse tido sucesso.
      const exaustivo: never = canal
      throw new Error(`canal sem handler: ${exaustivo}`)
    }
  }
}

export function registerIpc(session: Session): void {
  for (const canal of Object.keys(IPC_SCHEMAS) as IpcChannel[]) {
    ipcMain.handle(canal, (_e, payload) => handle(session, canal, payload))
  }
}
