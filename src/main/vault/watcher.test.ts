import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from './vault'
import { VaultWatcher } from './watcher'
import { openIndex, type Db } from '../index/db'
import { Indexer } from '../index/indexer'

let root: string, vault: Vault, db: Db, ix: Indexer, w: VaultWatcher
const eventos: { rel: string; kind: string }[] = []

const esperar = (cond: () => boolean, ms = 5000) => new Promise<void>((ok, fail) => {
  const t0 = Date.now()
  const tick = (): void => {
    if (cond()) return ok()
    if (Date.now() - t0 > ms) return fail(new Error('timeout esperando o watcher'))
    setTimeout(tick, 50)
  }
  tick()
})

beforeEach(async () => {
  eventos.length = 0
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
  db = openIndex(':memory:')
  ix = new Indexer(db, vault)
  w = new VaultWatcher(vault, ix, db, (rel, kind) => eventos.push({ rel, kind }))
  await w.start()
})
afterEach(async () => { await w.stop(); await rm(root, { recursive: true, force: true }) })

describe('VaultWatcher', () => {
  it('indexa nota criada por fora do app', async () => {
    await vault.writeAtomic('novo.md', '---\ntipo: nota\n---\ncriado por fora')
    await esperar(() => eventos.some(e => e.rel === 'novo.md'))
    const n = db.prepare('SELECT tipo FROM notes WHERE path=?').get('novo.md') as any
    expect(n.tipo).toBe('nota')
  })

  it('reindexa nota alterada por fora', async () => {
    await vault.writeAtomic('a.md', '[[Antes]]')
    await esperar(() => eventos.some(e => e.rel === 'a.md'))
    eventos.length = 0
    await vault.writeAtomic('a.md', '[[Depois]]')
    await esperar(() => eventos.some(e => e.rel === 'a.md'))
    expect(db.prepare('SELECT dst FROM links WHERE src=?').all('a.md')).toEqual([{ dst: 'Depois' }])
  })

  it('remove do índice nota apagada por fora', async () => {
    await vault.writeAtomic('a.md', 'x')
    await esperar(() => eventos.some(e => e.rel === 'a.md'))
    await rm(join(root, 'a.md'))
    await esperar(() => eventos.some(e => e.kind === 'unlink'))
    expect(db.prepare('SELECT count(*) c FROM notes').get()).toEqual({ c: 0 })
  })

  it('não emite evento para arquivo que não é .md', async () => {
    await writeFile(join(root, 'imagem.png'), 'x')
    await new Promise(r => setTimeout(r, 800))
    expect(eventos.some(e => e.rel.endsWith('.png'))).toBe(false)
  })

  it('resolve o link ao indexar e limpa resolved_path ao apagar o alvo (unlink chama resolveLinks)', async () => {
    await vault.writeAtomic('alvo.md', 'conteúdo do alvo')
    await vault.writeAtomic('origem.md', '[[alvo]]')
    await esperar(() => eventos.some(e => e.rel === 'alvo.md') && eventos.some(e => e.rel === 'origem.md'))

    const antes = db.prepare('SELECT resolved_path FROM links WHERE src=?').get('origem.md') as any
    expect(antes.resolved_path).toBe('alvo.md')

    await rm(join(root, 'alvo.md'))
    await esperar(() => eventos.some(e => e.kind === 'unlink'))

    const depois = db.prepare('SELECT resolved_path FROM links WHERE src=?').get('origem.md') as any
    expect(depois.resolved_path).toBeNull()
  })

  it('onError é chamado em falha não-ENOENT e o watcher continua vivo', async () => {
    await w.stop() // watcher da beforeEach não deve competir com este teste

    const erros: { err: Error; rel: string }[] = []
    const original = ix.indexFile.bind(ix)
    ;(ix as any).indexFile = async (rel: string) => {
      if (rel === 'falha.md') throw new Error('falha proposital sem code')
      return original(rel)
    }

    const w2 = new VaultWatcher(
      vault, ix, db,
      (rel, kind) => eventos.push({ rel, kind }),
      (err, rel) => erros.push({ err, rel })
    )
    await w2.start()
    try {
      await vault.writeAtomic('falha.md', 'x')
      await esperar(() => erros.some(e => e.rel === 'falha.md'))
      expect(erros[0].err.message).toBe('falha proposital sem code')
      expect(eventos.some(e => e.rel === 'falha.md')).toBe(false)

      // o watcher precisa continuar vivo: um arquivo válido depois é indexado normalmente
      await vault.writeAtomic('ok.md', 'y')
      await esperar(() => eventos.some(e => e.rel === 'ok.md'))
      expect(db.prepare('SELECT path FROM notes WHERE path=?').get('ok.md')).toBeTruthy()
    } finally {
      await w2.stop()
    }
  })

  it('erro ENOENT permanece silencioso (onError não é chamado)', async () => {
    await w.stop()

    const erros: { err: Error; rel: string }[] = []
    const original = ix.indexFile.bind(ix)
    ;(ix as any).indexFile = async (rel: string) => {
      if (rel === 'sumiu.md') {
        const e: NodeJS.ErrnoException = new Error('ENOENT: sumiu')
        e.code = 'ENOENT'
        throw e
      }
      return original(rel)
    }

    const w2 = new VaultWatcher(
      vault, ix, db,
      (rel, kind) => eventos.push({ rel, kind }),
      (err, rel) => erros.push({ err, rel })
    )
    await w2.start()
    try {
      await vault.writeAtomic('sumiu.md', 'x')
      // sumiu.md não gera onChange (nem sucesso nem erro reportado); usamos um
      // segundo arquivo válido como sinal de que o lote já foi drenado.
      await vault.writeAtomic('sinal.md', 'y')
      await esperar(() => eventos.some(e => e.rel === 'sinal.md'))
      expect(erros).toEqual([])
    } finally {
      await w2.stop()
    }
  })

  it('stop() espera o lote em voo terminar antes de retornar', async () => {
    const rejeicoesNaoTratadas: unknown[] = []
    const onRejeicao = (err: unknown): void => { rejeicoesNaoTratadas.push(err) }
    process.on('unhandledRejection', onRejeicao)

    try {
      let emVoo = false
      let liberar!: () => void
      const gate = new Promise<void>(r => { liberar = r })
      const original = ix.indexFile.bind(ix)
      ;(ix as any).indexFile = async (rel: string) => {
        emVoo = true
        await gate
        return original(rel)
      }

      await vault.writeAtomic('lento.md', 'x')
      await esperar(() => emVoo) // drenar() já começou e está bloqueado dentro do indexFile

      const stopPromise = w.stop()
      // dá tempo do stop() alcançar o "await this.drenando" antes de liberar o gate
      await new Promise(r => setTimeout(r, 50))
      const eventosAntes = eventos.length

      liberar()
      await stopPromise

      // só depois de liberar o gate e esperar o stop() é que o onChange do lote roda:
      // prova que stop() aguardou o drenar em voo, não retornou na frente dele.
      expect(eventos.length).toBeGreaterThan(eventosAntes)
      const contagemFinal = eventos.length

      db.close()
      await new Promise(r => setTimeout(r, 500))

      expect(eventos.length).toBe(contagemFinal)
      expect(rejeicoesNaoTratadas).toEqual([])
    } finally {
      process.off('unhandledRejection', onRejeicao)
    }
  })
})
