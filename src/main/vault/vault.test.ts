import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault, comRepeticao } from './vault'
import { VaultRootMissingError } from './errors'

let root: string
let vault: Vault

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('Vault', () => {
  it('lista .md em caminho relativo POSIX, recursivamente', async () => {
    await mkdir(join(root, 'Projetos'), { recursive: true })
    await writeFile(join(root, 'Projetos', 'Nima.md'), '# Nima')
    await writeFile(join(root, 'raiz.md'), 'x')
    const files = await vault.listMarkdown()
    expect(files.sort()).toEqual(['Projetos/Nima.md', 'raiz.md'])
  })

  it('ignora .vault/ e arquivos que não são .md', async () => {
    await mkdir(join(root, '.vault'), { recursive: true })
    await writeFile(join(root, '.vault', 'nota.md'), 'x')
    await writeFile(join(root, 'imagem.png'), 'x')
    expect(await vault.listMarkdown()).toEqual([])
  })

  it('lê e escreve preservando o conteúdo', async () => {
    await vault.writeAtomic('a.md', 'conteúdo com acento')
    expect(await vault.read('a.md')).toBe('conteúdo com acento')
  })

  it('cria diretórios intermediários ao escrever', async () => {
    await vault.writeAtomic('Saúde/Treinos/2026-08-24.md', 'treino')
    expect(await readFile(join(root, 'Saúde', 'Treinos', '2026-08-24.md'), 'utf8')).toBe('treino')
  })

  it('não deixa arquivo temporário no diretório após escrita bem-sucedida', async () => {
    await vault.writeAtomic('a.md', 'x')
    expect(await readdir(root)).toEqual(['a.md'])
  })

  it('limpa o temporário quando o rename falha', async () => {
    // Força uma falha de rename real: o destino é um diretório não vazio,
    // então renomear um arquivo por cima dele deve rejeitar.
    await mkdir(join(root, 'b.md'), { recursive: true })
    await writeFile(join(root, 'b.md', 'dentro.txt'), 'y')

    await expect(vault.writeAtomic('b.md', 'x')).rejects.toThrow()

    const entries = await readdir(root)
    expect(entries.some((e) => e.endsWith('.tmp'))).toBe(false)
  })

  // Este teste é a rede de regressão do defeito Crítico em que o nome do
  // temporário usava só `process.pid`, deixando duas escritas concorrentes
  // interlearem num híbrido corrompido enquanto ambas reportavam sucesso.
  // Usamos `allSettled` (em vez de `Promise.all`) porque as duas chamadas
  // correm de propósito para o mesmo `rename()` de destino: no POSIX isso é
  // atômico e silencioso, mas no Windows um `rename` substituindo um arquivo
  // existente pode fazer a perna perdedora falhar transitoriamente com
  // EPERM/EBUSY mesmo sem a corrupção — e isso não pode ser confundido com o
  // defeito real. A asserção de conteúdo abaixo, porém, NUNCA deve ser
  // afrouxada: é ela que prova que não houve híbrido, e é o único motivo de
  // este teste existir.
  it('escritas concorrentes no mesmo caminho não produzem conteúdo híbrido', async () => {
    const a = 'AAAAAAAAAA-content-from-write-A-longer-string-here'
    const b = 'B-short'

    const results = await Promise.allSettled([
      vault.writeAtomic('c.md', a),
      vault.writeAtomic('c.md', b),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)

    for (const r of results) {
      if (r.status === 'rejected') {
        const code = (r.reason as { code?: string } | undefined)?.code
        expect(['EPERM', 'EBUSY', 'EACCES']).toContain(code)
      }
    }

    const final = await vault.read('c.md')
    expect([a, b]).toContain(final)
  })

  it('não recria a raiz do vault se ela sumiu do disco entre escritas', async () => {
    await vault.writeAtomic('a.md', 'primeira escrita ok')
    expect(await vault.read('a.md')).toBe('primeira escrita ok')

    await rm(root, { recursive: true, force: true })

    await expect(vault.writeAtomic('b.md', 'segunda escrita')).rejects.toThrow(
      VaultRootMissingError,
    )

    // A asserção que importa: a raiz não pode ter sido reconstruída pelo
    // `mkdir(dirname(abs), { recursive: true })` antes do throw. Um teste
    // que só checasse a rejeição passaria mesmo se o diretório tivesse sido
    // recriado (vazio) primeiro.
    await expect(stat(root)).rejects.toThrow()
  })

  it('recusa path traversal com ..', () => {
    expect(() => vault.toAbsolute('../fora.md')).toThrow('caminho fora do vault')
    expect(() => vault.toAbsolute('Projetos/../../fora.md')).toThrow('caminho fora do vault')
  })

  it('recusa caminho absoluto', () => {
    expect(() => vault.toAbsolute('C:/Windows/system32/x.md')).toThrow('caminho fora do vault')
  })

  it('devolve mtime e size', async () => {
    await vault.writeAtomic('a.md', 'abc')
    const s = await vault.stat('a.md')
    expect(s.size).toBe(3)
    expect(s.mtimeMs).toBeGreaterThan(0)
  })
})

/**
 * A repeticao das operacoes de arquivo.
 *
 * Existe por um defeito medido: a suite falhava uma vez a cada algumas
 * centenas de execucoes, sempre numa gravacao atomica em diretorio temporario
 * sob escrita concorrente. No Windows, `rename` e `unlink` sao recusados na
 * hora enquanto outro processo mantem o arquivo aberto -- antivirus, previa do
 * Explorer, o indexador do proprio Cortex lendo no mesmo instante.
 *
 * As tentativas e a espera sao injetadas: provar isto prendendo um arquivo de
 * verdade seria lento e nao daria para reproduzir em outra maquina.
 */
describe('comRepeticao', () => {
  const preso = (codigo: string): NodeJS.ErrnoException =>
    Object.assign(new Error(`falso ${codigo}`), { code: codigo })

  const semDormir = async (): Promise<void> => {}

  it('devolve na primeira, sem esperar, quando da certo', async () => {
    const esperas: number[] = []
    const r = await comRepeticao(async () => 'pronto', [10, 20], async ms => { esperas.push(ms) })
    expect(r).toBe('pronto')
    // O caminho comum e o de sempre: nenhuma espera no meio.
    expect(esperas).toEqual([])
  })

  it('repete enquanto o arquivo estiver preso, e entrega quando soltar', async () => {
    // EPERM duas vezes e depois sucesso: exatamente o que um antivirus
    // varrendo o arquivo recem-escrito produz.
    let tentativas = 0
    const r = await comRepeticao(async () => {
      tentativas++
      if (tentativas < 3) throw preso('EPERM')
      return 'renomeado'
    }, [1, 2, 3], semDormir)

    expect(r).toBe('renomeado')
    expect(tentativas).toBe(3)
  })

  it('espera cada vez mais entre as tentativas', async () => {
    // Sem o intervalo crescendo, cinco tentativas num piscar de olhos batem
    // todas dentro da mesma varredura e nenhuma delas encontra o arquivo livre.
    const esperas: number[] = []
    await expect(comRepeticao(
      async () => { throw preso('EBUSY') },
      [10, 20, 40],
      async ms => { esperas.push(ms) }
    )).rejects.toThrow('falso EBUSY')
    expect(esperas).toEqual([10, 20, 40])
  })

  it('desiste com o erro ORIGINAL, e nao com um resumo', async () => {
    // A mensagem do sistema diz qual e o problema. Troca-la por "falhou 4
    // vezes" apagaria a unica informacao util para quem for diagnosticar.
    await expect(comRepeticao(
      async () => { throw preso('EACCES') }, [1], semDormir
    )).rejects.toThrow('falso EACCES')
  })

  it('nao repete o que repetir nao conserta', async () => {
    // ENOENT e ENOSPC nao melhoram com tempo: repetir so atrasa o erro certo.
    for (const codigo of ['ENOENT', 'ENOSPC']) {
      let tentativas = 0
      await expect(comRepeticao(async () => {
        tentativas++
        throw preso(codigo)
      }, [1, 2], semDormir)).rejects.toThrow(`falso ${codigo}`)
      expect(tentativas).toBe(1)
    }
  })

  it('erro sem codigo nenhum sobe na hora', async () => {
    let tentativas = 0
    await expect(comRepeticao(async () => {
      tentativas++
      throw new Error('defeito de programacao')
    }, [1, 2], semDormir)).rejects.toThrow('defeito de programacao')
    expect(tentativas).toBe(1)
  })
})
