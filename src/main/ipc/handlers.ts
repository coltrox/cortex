import { ipcMain } from 'electron'
import { IPC_SCHEMAS, type IpcChannel } from '../../shared/ipc'
import type { Session } from '../session'
import {
  getNote, listNotes, listNotesWithFields, searchFullText, getBacklinks, getOutlinks, getBrokenLinks
} from '../index/queries'
import { patchFrontmatter, appendToFrontmatterList } from '../vault/patch'
import { resolveLinks } from '../index/resolver'
import { novoVaultId, projetarConfigParaRenderer, IDS_AREAS } from '../config'
import { criarSegredo, conferirSenha } from '../senha'
import { ClienteNuvem } from '../nuvem/cliente'
import { Sincronizador } from '../nuvem/sincronizador'

/** Monta o sincronizador na hora. Sem credencial, falha com mensagem legível. */
function sincronizadorDe(session: Session): Sincronizador {
  const cred = session.config.nuvem
  if (!cred) throw new Error('nuvem não configurada — cole a URL e a chave na aba Nuvem')
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

/** Pastas que cada área quer ver existindo no vault. */
const PASTAS_POR_AREA: Record<string, string[]> = {
  vida: ['Vida', 'Vida/Documentos', 'Vida/Contas'],
  saude: ['Saude', 'Saude/Treinos', 'Saude/Dieta'],
  dev: ['Dev', 'Dev/Projetos', 'Dev/Seguranca'],
  conhecimento: ['Estudos', 'Estudos/Conteudos', 'Estudos/Provas', 'Estudos/Redacoes'],
  financas: ['Grana'],
  calendario: []
}

/** Diário e anexos existem sempre: são o lastro de qualquer área. */
const PASTAS_SEMPRE = ['Diario', 'Anexos']

export function pastasDasAreas(areas: string[]): string[] {
  const out = new Set(PASTAS_SEMPRE)
  for (const a of areas) for (const p of PASTAS_POR_AREA[a] ?? []) out.add(p)
  return [...out]
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
      // Trocar a senha exige a senha atual. Sem isso, quem senta na máquina
      // com um painel aberto redefine a senha e destranca o resto.
      if (session.config.senha !== null) {
        if (p.atual === null || !conferirSenha(p.atual, session.config.senha)) {
          throw new Error('senha atual incorreta')
        }
      }
      // criarSegredo recusa senha curta demais, e a mensagem vai para a tela.
      const senha = criarSegredo(p.nova)
      return projetarConfigParaRenderer(await session.salvarConfig({ senha }))
    }

    case 'senha:conferir':
      // Sem senha cadastrada não há o que conferir, e responder true aqui
      // abriria qualquer painel que estivesse na lista por engano.
      return session.config.senha !== null && conferirSenha(p.senha, session.config.senha)

    case 'senha:remover': {
      if (session.config.senha === null) return projetarConfigParaRenderer(session.config)
      if (!conferirSenha(p.atual, session.config.senha)) throw new Error('senha incorreta')
      // Tirar a senha destranca todos os painéis junto: manter a lista
      // deixaria painéis trancados sem chave nenhuma.
      return projetarConfigParaRenderer(
        await session.salvarConfig({ senha: null, paineisTrancados: [] })
      )
    }

    case 'senha:paineis': {
      // Mudar a lista é destrancar por outro caminho — pede a senha igual.
      if (session.config.senha === null) throw new Error('crie uma senha antes de trancar painéis')
      if (!conferirSenha(p.atual, session.config.senha)) throw new Error('senha incorreta')
      // Filtra por tipo E por area conhecida: o renderer e entrada hostil, e
      // um id fora de IDS_AREAS trancaria um painel que nao existe.
      const paineis = [...new Set((p.paineis as unknown[]).filter(
        (x): x is string => typeof x === 'string' && IDS_AREAS.includes(x)
      ))]
      return projetarConfigParaRenderer(await session.salvarConfig({ paineisTrancados: paineis }))
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
        configurada: session.config.nuvem !== null,
        url: session.config.nuvem?.url ?? null,
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
      return { vaultId: c.vaultId }
    }

    case 'nuvem:sincronizar':
      return sincronizadorDe(session).sincronizar()

    case 'nuvem:publicar':
      return { itens: await sincronizadorDe(session).publicar() }

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
