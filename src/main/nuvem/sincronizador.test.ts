import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session } from '../session'
import { Sincronizador } from './sincronizador'
import type { ClienteNuvem, EventoRemoto } from './cliente'

let root: string, session: Session

/** Cliente de mentira: devolve o que o teste mandar, sem rede. */
class ClienteFalso {
  publicado: unknown[] = []
  constructor(public eventos: EventoRemoto[]) {}
  async listarEventos(): Promise<EventoRemoto[]> { return this.eventos }
  async publicarCardapio(itens: unknown[]): Promise<number> {
    this.publicado = itens
    return itens.length
  }
}

const ev = (id: string, tipo: string, dados: Record<string, unknown>): EventoRemoto =>
  ({ id, criadoEm: '2026-08-27T10:00:00Z', dia: '2026-08-27', tipo, dados }) as EventoRemoto

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-sinc-'))
  session = new Session()
  await session.open(root)
})
afterEach(async () => { await session.close(); await rm(root, { recursive: true, force: true }) })

const sinc = (cliente: ClienteFalso): Sincronizador =>
  new Sincronizador(session, cliente as unknown as ClienteNuvem)

describe('Sincronizador', () => {
  it('aplica um suplemento no diario do dia', async () => {
    const r = await sinc(new ClienteFalso([ev('e1', 'suplemento', { nome: 'Whey' })])).sincronizar()
    expect(r.aplicados).toBe(1)

    const md = await session.vault.read('Diario/2026-08-27.md')
    expect(md).toContain('suplementos_feitos')
    expect(md).toContain('Whey')
  })

  it('nao duplica o mesmo evento em duas sincronizacoes', async () => {
    const cliente = new ClienteFalso([ev('e1', 'gasto', { item: 'Almoço', valor: 32 })])
    await sinc(cliente).sincronizar()
    const segunda = await sinc(cliente).sincronizar()

    expect(segunda.aplicados).toBe(0)
    expect(segunda.ignorados).toBe(1)

    const md = await session.vault.read('Diario/2026-08-27.md')
    expect(md.split('Almoço').length - 1).toBe(1)
  })

  it('marcar o mesmo suplemento duas vezes nao repete na lista', async () => {
    await sinc(new ClienteFalso([ev('e1', 'suplemento', { nome: 'Whey' })])).sincronizar()
    await sinc(new ClienteFalso([ev('e2', 'suplemento', { nome: 'Whey' })])).sincronizar()

    const md = await session.vault.read('Diario/2026-08-27.md')
    expect(md.split('Whey').length - 1).toBe(1)
  })

  it('cria a nota de treino e indexa', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'sessao', { modelo: 'Push A', exercicios: [{ nome: 'Supino', carga: '60 kg' }] })
    ])).sincronizar()

    expect(await session.vault.exists('Saude/Treinos/Push A — 2026-08-27.md')).toBe(true)
    const notas = session.db.prepare("SELECT path FROM notes WHERE tipo='sessao'").all()
    expect(notas).toHaveLength(1)
  })

  it('peso e medida do mesmo dia caem na mesma nota', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'peso', { peso: 78.4 }),
      ev('e2', 'medida', { cintura: 84 })
    ])).sincronizar()

    const md = await session.vault.read('Saude/medida-2026-08-27.md')
    expect(md).toContain('78.4')
    expect(md).toContain('84')
  })

  it('evento de tipo desconhecido e ignorado, sem quebrar os outros', async () => {
    const r = await sinc(new ClienteFalso([
      ev('e1', 'coisa-do-futuro', {}),
      ev('e2', 'suplemento', { nome: 'Creatina' })
    ])).sincronizar()

    expect(r.aplicados).toBe(1)
    expect(r.ignorados).toBe(1)
    expect(await session.vault.read('Diario/2026-08-27.md')).toContain('Creatina')
  })

  it('publicar manda so o cardapio, sem a carga', async () => {
    await session.vault.writeAtomic('Saude/Treinos/Push A.md',
      '---\ntipo: treino-modelo\nexercicios: [{"nome":"Supino","series":4,"carga":"60 kg"}]\n---\n')
    await session.indexer.syncAll()

    const cliente = new ClienteFalso([])
    await sinc(cliente).publicar()

    expect(JSON.stringify(cliente.publicado)).toContain('Push A')
    expect(JSON.stringify(cliente.publicado)).not.toContain('60 kg')
  })
})
