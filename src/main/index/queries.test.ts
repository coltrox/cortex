import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from '../vault/vault'
import { openIndex, type Db } from './db'
import { Indexer } from './indexer'
import {
  getNote, listNotes, listNotesWithFields, searchFullText, getBacklinks, getOutlinks, getBrokenLinks
} from './queries'

let root: string, vault: Vault, db: Db, ix: Indexer

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
  db = openIndex(':memory:')
  ix = new Indexer(db, vault)

  await vault.writeAtomic('Segurança/MOC - Segurança.md',
    '---\ntipo: moc\n---\nchecklist de rate limiting')
  await vault.writeAtomic('Projetos/Nima.md',
    '---\ntipo: projeto\nproject: Nima\n---\nver [[MOC - Segurança]] e [[Fantasma]]')
  await vault.writeAtomic('Projetos/LCKP.md', '---\ntipo: projeto\nproject: LCKP\n---\noutro')
  // Segunda nota apontando para a mesma MOC - Segurança (e com um segundo link
  // quebrado), para provar que getBacklinks e getBrokenLinks devolvem todas as
  // linhas, não só a primeira. tipo 'nota' para não contaminar o filtro por
  // tipo='projeto' usado em outro teste.
  await vault.writeAtomic('Projetos/Outro.md',
    '---\ntipo: nota\n---\ntambém ver [[MOC - Segurança]] e [[Fantasma2]]')
  // Corpo com sintaxe de operador FTS5 (C++) para provar que o fallback de
  // frase literal em searchFullText não só evita a exceção como devolve a
  // nota certa.
  await vault.writeAtomic('Notas/Linguagens.md',
    '---\ntipo: nota\n---\naprendendo C++ de novo')
  await ix.syncAll()
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('queries', () => {
  it('getNote mapeia parse_error para parseError', () => {
    const n = getNote(db, 'Projetos/Nima.md')!
    expect(n.tipo).toBe('projeto')
    expect(n.title).toBe('Nima')
    expect(n.parseError).toBeNull()
  })

  it('getNote devolve undefined para caminho inexistente', () => {
    expect(getNote(db, 'nao/existe.md')).toBeUndefined()
  })

  it('listNotes filtra por tipo', () => {
    expect(listNotes(db, { tipo: 'projeto' }).map(r => r.title).sort()).toEqual(['LCKP', 'Nima'])
  })

  it('listNotes filtra por projeto', () => {
    expect(listNotes(db, { project: 'Nima' }).map(r => r.title)).toEqual(['Nima'])
  })

  it('listNotes sem filtro devolve tudo', () => {
    expect(listNotes(db).length).toBe(5)
  })

  it('searchFullText acha pelo corpo e devolve trecho', () => {
    const hits = searchFullText(db, 'limiting')
    expect(hits.map(h => h.path)).toEqual(['Segurança/MOC - Segurança.md'])
    expect(hits[0].snippet.toLowerCase()).toContain('limiting')
  })

  it('searchFullText respeita o limite', () => {
    expect(searchFullText(db, 'outro OR limiting OR ver', 1).length).toBe(1)
  })

  it('searchFullText sem limite devolve todas as linhas encontradas', () => {
    // "ver" aparece no corpo de Nima e de Outro — prova que a query
    // subjacente devolve múltiplas linhas antes de qualquer LIMIT restritivo,
    // não só a primeira.
    const hits = searchFullText(db, 'ver')
    expect(hits.length).toBe(2)
    expect(hits.map(h => h.path).sort()).toEqual(['Projetos/Nima.md', 'Projetos/Outro.md'])
  })

  it('searchFullText não lança para entrada com sintaxe FTS5 inválida e continua achando o termo', () => {
    let hits: { path: string; title: string; snippet: string }[] = []
    expect(() => { hits = searchFullText(db, 'C++') }).not.toThrow()
    expect(hits.map(h => h.path)).toEqual(['Notas/Linguagens.md'])
  })

  it('searchFullText não lança para aspa desbalanceada', () => {
    expect(() => searchFullText(db, 'nota "aberta')).not.toThrow()
  })

  it('searchFullText não lança para foo:bar', () => {
    expect(() => searchFullText(db, 'foo:bar')).not.toThrow()
  })

  it('searchFullText não lança para NOT sozinho', () => {
    expect(() => searchFullText(db, 'NOT')).not.toThrow()
  })

  it('searchFullText continua suportando OR legítimo entre dois termos', () => {
    // Prova que o fallback para frase literal só acontece em erro de sintaxe —
    // um OR válido entre dois termos que existem em notas diferentes ainda
    // precisa achar as duas.
    const hits = searchFullText(db, 'limiting OR fantasma2')
    expect(hits.map(h => h.path).sort()).toEqual(['Projetos/Outro.md', 'Segurança/MOC - Segurança.md'])
  })

  it('getBacklinks lista quem aponta para a nota', () => {
    const backlinks = getBacklinks(db, 'Segurança/MOC - Segurança.md')
    expect(backlinks.length).toBe(2)
    expect(backlinks.map(b => b.path).sort()).toEqual(['Projetos/Nima.md', 'Projetos/Outro.md'])
  })

  it('getOutlinks lista os links de saída, resolvidos e quebrados', () => {
    const out = getOutlinks(db, 'Projetos/Nima.md')
    expect(out.map(o => o.dst).sort()).toEqual(['Fantasma', 'MOC - Segurança'])
    expect(out.find(o => o.dst === 'Fantasma')!.resolvedPath).toBeNull()
  })

  it('getBrokenLinks lista só os não resolvidos', () => {
    const broken = getBrokenLinks(db)
    expect(broken.length).toBe(2)
    // ordenado por src: prova a ordenação além da contagem
    expect(broken).toEqual([
      { src: 'Projetos/Nima.md', dst: 'Fantasma', line: 1 },
      { src: 'Projetos/Outro.md', dst: 'Fantasma2', line: 1 }
    ])
  })
})

describe('listNotesWithFields', () => {
  beforeEach(async () => {
    await vault.writeAtomic('Diario/2026-08-25.md', [
      '---',
      'tipo: diario',
      'date: 2026-08-25',
      'peso: 78.4',
      'gastos:',
      '  - { hora: "08:30", item: Café, valor: 8.50, cat: alimentacao }',
      '  - { hora: "10:15", item: Mercado, valor: 42.90, cat: mercado }',
      '---',
      '',
      '## Como foi o dia'
    ].join('\n'))
    await vault.writeAtomic('Diario/2026-08-20.md', [
      '---',
      'tipo: diario',
      'date: 2026-08-20',
      'peso: 79.1',
      '---',
      ''
    ].join('\n'))
    await vault.writeAtomic('Diario/2026-08-30.md', [
      '---',
      'tipo: diario',
      'date: 2026-08-30',
      'peso: 77.9',
      '---',
      ''
    ].join('\n'))
    await ix.syncAll()
  })

  it('reidrata número, data, texto e array de objetos', () => {
    const notas = listNotesWithFields(db, { tipo: 'diario' })
    const nota = notas.find(n => n.path === 'Diario/2026-08-25.md')!
    expect(nota.campos.peso).toBe(78.4)
    expect(nota.campos.date).toBe('2026-08-25')
    expect(nota.campos.tipo).toBe('diario')
    expect(Array.isArray(nota.campos.gastos)).toBe(true)
    const gastos = nota.campos.gastos as Array<Record<string, unknown>>
    expect(gastos.length).toBe(2)
    expect(gastos[0].item).toBe('Café')
    expect(gastos[0].valor).toBe(8.5)
    expect(gastos[1].item).toBe('Mercado')
    expect(gastos[1].cat).toBe('mercado')
  })

  it('devolve o mesmo número de chaves em campos que existem no frontmatter (asserção de contagem)', () => {
    const notas = listNotesWithFields(db, { tipo: 'diario' })
    const nota = notas.find(n => n.path === 'Diario/2026-08-25.md')!
    // tipo, date, peso, gastos = 4 chaves de frontmatter
    expect(Object.keys(nota.campos).sort()).toEqual(['date', 'gastos', 'peso', 'tipo'])
  })

  it('filtra por desde/ate incluindo as duas pontas', () => {
    const notas = listNotesWithFields(db, { tipo: 'diario', desde: '2026-08-20', ate: '2026-08-25' })
    expect(notas.map(n => n.path).sort()).toEqual(['Diario/2026-08-20.md', 'Diario/2026-08-25.md'])
  })
})
