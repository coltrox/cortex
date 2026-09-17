import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import matter from 'gray-matter'
// @ts-expect-error — script .mjs sem tipos, empacotado fora do bundle.
import * as mcp from '../../resources/mcp/cortex-mcp.mjs'

let vault: string

async function nota(rel: string, texto: string): Promise<void> {
  const abs = join(vault, rel)
  await mkdir(join(abs, '..'), { recursive: true })
  await writeFile(abs, texto, 'utf8')
}

beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), 'cortex-mcp-'))
  await nota('Vida/Contas/Banco.md', '---\ntipo: conta\ntitulo: Banco\nsenha: segredo123\n---\n')
  await nota('Vida/Documentos/RG.md', '---\ntipo: documento\ntitulo: RG\n---\nnúmero 123')
  await nota('Vida/Senha solta.md', '---\ntipo: conta\ntitulo: Senha solta\nsenha: outra456\n---\n')
  await nota('Vida/Cifrada.md', 'CORTEX-CIFRADO-1\nabcdef')
  await nota('.vault/segredo.md', 'banco segredo')
  await nota('Estudos/Provas/ENEM.md', '---\ntipo: prova\ntitulo: ENEM\ndate: 2026-11-08\n---\nBanco de questões')
  await nota('Vida/Beber água.md', '---\ntipo: rotina\ntitulo: Beber água\n---\n')
  await nota('Vida/Inglês.md', '---\ntipo: rotina\ntitulo: Inglês\ndias: [sab]\n---\n')
})
afterEach(async () => { await rm(vault, { recursive: true, force: true }) })

const conector = () => mcp.criarConector({ vault, matter })
const trancar = (paineis: string[]) =>
  writeFile(join(vault, '.vault', 'config.json'), JSON.stringify({ paineisTrancados: paineis }))

describe('conector do Claude — o que não sai', () => {
  it('busca não devolve contas, documentos, cifradas nem pastas com ponto', async () => {
    const r: string = await conector().buscar_notas({ termo: 'banco' })
    expect(r).toContain('ENEM')
    expect(r).not.toMatch(/Contas|Documentos|Senha solta|Cifrada|\.vault/)
    expect(await conector().buscar_notas({ termo: 'segredo' })).toMatch(/Nada encontrado/)
  })

  it('leitura direta de pasta protegida, cifrada ou tipo sensível é recusada', async () => {
    const c = conector()
    await expect(c.ler_nota({ caminho: 'Vida/Contas/Banco.md' })).rejects.toThrow(/protegida/)
    await expect(c.ler_nota({ caminho: 'vida/contas/Banco.md' })).rejects.toThrow(/protegida/)
    await expect(c.ler_nota({ caminho: 'Vida/Cifrada.md' })).rejects.toThrow(/cifrada/)
    await expect(c.ler_nota({ caminho: 'Vida/Senha solta.md' })).rejects.toThrow(/conta e documento/)
  })

  it('caminho que escapa do vault ou não é .md é recusado', async () => {
    const c = conector()
    await expect(c.ler_nota({ caminho: '../fora.md' })).rejects.toThrow(/inválido/)
    await expect(c.ler_nota({ caminho: join(vault, 'Estudos/Provas/ENEM.md') })).rejects.toThrow(/inválido/)
    await expect(c.ler_nota({ caminho: '.vault/config.json' })).rejects.toThrow(/inválido/)
    await expect(c.ler_nota({ caminho: '.vault/segredo.md' })).rejects.toThrow(/protegida/)
  })

  it('painel trancado no config some da busca e da leitura', async () => {
    await trancar(['conhecimento'])
    expect(await conector().buscar_notas({ termo: 'enem' })).toMatch(/Nada encontrado/)
    await expect(conector().ler_nota({ caminho: 'Estudos/Provas/ENEM.md' })).rejects.toThrow(/protegida/)
  })
})

describe('conector do Claude — escrita', () => {
  it('cria anotação sem sobrescrever, com YAML escapado', async () => {
    const c = conector()
    expect(await c.criar_anotacao({ titulo: 'Ideia: app', texto: 'linha 1\nlinha "2"' })).toContain('Vida/Ideia- app.md')
    expect(await c.criar_anotacao({ titulo: 'Ideia: app' })).toContain('Vida/Ideia- app 2.md')
    const lido = matter(await readFile(join(vault, 'Vida/Ideia- app.md'), 'utf8'), {})
    expect(lido.data).toMatchObject({ tipo: 'anotacao', titulo: 'Ideia: app', texto: 'linha 1\nlinha "2"' })
  })

  it('não grava anotação em texto puro com a Vida trancada', async () => {
    await trancar(['vida'])
    await expect(conector().criar_anotacao({ titulo: 'x' })).rejects.toThrow(/trancada/)
  })

  it('marca e desmarca a tarefa diária no diário, sem virar data com hora', async () => {
    const c = conector()
    expect(await c.marcar_tarefa_do_dia({ nome: 'beber agua', dia: '2026-09-15' })).toContain('Beber água')
    const raw = await readFile(join(vault, 'Diario/2026-09-15.md'), 'utf8')
    expect(raw).toMatch(/date: '?2026-09-15'?\n/)
    expect(raw).toContain('## Como foi o dia')
    expect(matter(raw, {}).data.rotinas_feitas).toEqual(['Beber água'])
    expect(await c.hoje({ dia: '2026-09-15' })).toContain('[x] Beber água')

    await c.marcar_tarefa_do_dia({ nome: 'Beber água', dia: '2026-09-15', feito: false })
    expect(matter(await readFile(join(vault, 'Diario/2026-09-15.md'), 'utf8'), {}).data.rotinas_feitas).toEqual([])
  })

  it('tarefa de outro dia da semana não é marcada', async () => {
    // 2026-09-15 é terça; Inglês é só sábado.
    await expect(conector().marcar_tarefa_do_dia({ nome: 'Inglês', dia: '2026-09-15' })).rejects.toThrow(/Nenhuma/)
  })
})

describe('conector do Claude — protocolo', () => {
  const obter = async () => conector()

  it('initialize, tools/list e notificação', async () => {
    const ini = await mcp.responder({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, obter)
    expect(ini.result.capabilities).toEqual({ tools: {} })
    const lista = await mcp.responder({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, obter)
    expect(lista.result.tools.map((t: { name: string }) => t.name)).toContain('hoje')
    expect(await mcp.responder({ jsonrpc: '2.0', method: 'notifications/initialized' }, obter)).toBeNull()
  })

  it('erro de ferramenta volta como isError, e ferramenta inventada é recusada', async () => {
    const r = await mcp.responder({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ler_nota', arguments: { caminho: 'Vida/Contas/Banco.md' } } }, obter)
    expect(r.result.isError).toBe(true)
    expect(JSON.stringify(r)).not.toContain('segredo123')
    const x = await mcp.responder({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'apagar_tudo' } }, obter)
    expect(x.error.code).toBe(-32602)
  })
})
