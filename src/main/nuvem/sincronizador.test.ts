import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session } from '../session'
import { Sincronizador } from './sincronizador'
import { parseFrontmatter } from '../parser/frontmatter'
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

  it('anotacao com dois-pontos e quebra de linha no texto nao corrompe o YAML', async () => {
    const texto = 'Nota: comprar leite\nE também pão'
    const r = await sinc(new ClienteFalso([ev('e1', 'anotacao', { texto })])).sincronizar()
    expect(r.aplicados).toBe(1)

    const notas = session.db.prepare("SELECT path FROM notes WHERE tipo='anotacao'").all() as { path: string }[]
    expect(notas).toHaveLength(1)

    const md = await session.vault.read(notas[0].path)
    const { frontmatter, parseError } = parseFrontmatter(md)
    expect(parseError).toBeNull()
    expect(frontmatter.texto).toBe(texto)
  })

  it('duas anotacoes com a mesma primeira linha viram dois arquivos, sem perder texto', async () => {
    const t1 = 'Lembrar de pagar conta\nDetalhe da primeira'
    const t2 = 'Lembrar de pagar conta\nDetalhe da segunda, bem diferente'

    await sinc(new ClienteFalso([ev('e1', 'anotacao', { texto: t1 })])).sincronizar()
    await sinc(new ClienteFalso([ev('e2', 'anotacao', { texto: t2 })])).sincronizar()

    const notas = session.db.prepare("SELECT path FROM notes WHERE tipo='anotacao'").all() as { path: string }[]
    expect(notas).toHaveLength(2)

    const textos = await Promise.all(notas.map(n => session.vault.read(n.path)))
    expect(textos.some(md => md.includes('Detalhe da primeira'))).toBe(true)
    expect(textos.some(md => md.includes('Detalhe da segunda'))).toBe(true)
  })

  it('falha ao indexar nao impede a escrita nem forca reprocessamento', async () => {
    const original = session.indexer.indexFile.bind(session.indexer)
    session.indexer.indexFile = async () => { throw new Error('indice bloqueado') }

    try {
      const r = await sinc(new ClienteFalso([ev('e1', 'suplemento', { nome: 'Creatina' })])).sincronizar()
      expect(r.aplicados).toBe(1)
      expect(r.falhas).toBe(0)
      expect(await session.vault.read('Diario/2026-08-27.md')).toContain('Creatina')
    } finally {
      session.indexer.indexFile = original
    }

    // Se a falha de indexar tivesse impedido `marcar`, o mesmo evento
    // voltaria nesta segunda rodada e "Creatina" apareceria duas vezes.
    const segunda = await sinc(new ClienteFalso([ev('e1', 'suplemento', { nome: 'Creatina' })])).sincronizar()
    expect(segunda.aplicados).toBe(0)
    expect(segunda.ignorados).toBe(1)
    const md = await session.vault.read('Diario/2026-08-27.md')
    expect(md.split('Creatina').length - 1).toBe(1)
  })

  it('falha no meio do lote nao trava os eventos seguintes', async () => {
    const caminhoQuebrado = 'Saude/Treinos/Quebrado — 2026-08-27.md'
    const yamlInvalido = '---\ntipo: [nao, fechado\n---\ncorpo original'
    await session.vault.writeAtomic(caminhoQuebrado, yamlInvalido)

    const r = await sinc(new ClienteFalso([
      ev('e1', 'sessao', { modelo: 'Quebrado', exercicios: [] }),
      ev('e2', 'suplemento', { nome: 'Creatina' })
    ])).sincronizar()

    expect(r.falhas).toBe(1)
    expect(r.aplicados).toBe(1)
    expect(await session.vault.read('Diario/2026-08-27.md')).toContain('Creatina')
    // O arquivo quebrado continua exatamente como estava — nada tentou
    // reescrevê-lo por cima do erro.
    expect(await session.vault.read(caminhoQuebrado)).toBe(yamlInvalido)
  })

  it('recusa construir quando a retencao nao e maior que a janela de busca', () => {
    const clienteQualquer = new ClienteFalso([]) as unknown as ClienteNuvem
    expect(() => new Sincronizador(session, clienteQualquer, 30, 30)).toThrow()
    expect(() => new Sincronizador(session, clienteQualquer, 30, 20)).toThrow()
    expect(() => new Sincronizador(session, clienteQualquer, 30, 31)).not.toThrow()
  })
})
