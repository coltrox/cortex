import { describe, it, expect } from 'vitest'
import { ehAnexoDoVault, resolverAnexo, IPC_SCHEMAS } from './ipc'

describe('IPC_SCHEMAS', () => {
  it('rejeita caminho vazio em note:read', () => {
    expect(IPC_SCHEMAS['note:read'].safeParse({ path: '' }).success).toBe(false)
  })

  it('aceita payload válido de note:write', () => {
    expect(IPC_SCHEMAS['note:write'].safeParse({ path: 'a.md', content: 'x' }).success).toBe(true)
  })

  it('aplica limite padrão na busca', () => {
    expect(IPC_SCHEMAS['search:fulltext'].parse({ q: 'nima' }).limit).toBe(50)
  })

  it('recusa limite acima do teto', () => {
    expect(IPC_SCHEMAS['search:fulltext'].safeParse({ q: 'x', limit: 5000 }).success).toBe(false)
  })

  it('recusa campo desconhecido', () => {
    expect(IPC_SCHEMAS['note:read'].safeParse({ path: 'a.md', extra: 1 }).success).toBe(false)
  })

  describe('caminho — confina o QUE, não só o ONDE', () => {
    const rejeitados = [
      '.vault/index.db',
      'a/../.vault/index.db',
      'Anexos/contrato.pdf',
      'Projetos\\Nima.md'
    ]

    for (const path of rejeitados) {
      it(`rejeita "${path}"`, () => {
        expect(IPC_SCHEMAS['note:read'].safeParse({ path }).success).toBe(false)
      })
    }

    it('aceita um caminho .md normal', () => {
      expect(IPC_SCHEMAS['note:read'].safeParse({ path: 'Projetos/Nima.md' }).success).toBe(true)
    })
  })
})

describe('anexo do vault', () => {
  it('so abre o que o sistema NAO executaria', () => {
    // Abrir e entregar ao sistema, que decide pela extensao -- e para .exe a
    // decisao e EXECUTAR. Um clique numa nota nao pode rodar programa.
    for (const bom of ['Anexos/a.mp3', 'Anexos/a.pdf', 'Anexos/a.mp4', 'Anexos/foto.jpg']) {
      expect(ehAnexoDoVault(bom), bom).toBe(true)
    }
    for (const mau of ['Anexos/a.exe', 'Anexos/a.bat', 'Anexos/a.ps1', 'Anexos/a.lnk',
      'Anexos/a.cmd', 'Anexos/a.scr', 'Anexos/a.svg']) {
      expect(ehAnexoDoVault(mau), mau).toBe(false)
    }
  })

  it('endereco com esquema nunca e anexo', () => {
    expect(ehAnexoDoVault('https://exemplo.com/a.mp3')).toBe(false)
    expect(ehAnexoDoVault('javascript:alert(1)')).toBe(false)
    expect(ehAnexoDoVault('file:///C:/a.mp3')).toBe(false)
    expect(ehAnexoDoVault('//servidor/a.mp3')).toBe(false)
  })
})

describe('resolverAnexo', () => {
  it('resolve o `..` contra a pasta da nota', () => {
    // E assim que se escreve numa nota, e assim que o Obsidian entende.
    expect(resolverAnexo('Vida', '../Anexos/audio.mp4')).toBe('Anexos/audio.mp4')
    expect(resolverAnexo('Vida/Rotinas', '../../Anexos/a.mp3')).toBe('Anexos/a.mp3')
  })

  it('caminho ja a partir da raiz passa direto', () => {
    expect(resolverAnexo('Vida', 'Anexos/a.mp3')).toBe('Vida/Anexos/a.mp3')
    expect(resolverAnexo('', 'Anexos/a.mp3')).toBe('Anexos/a.mp3')
  })

  it('`./` nao muda nada', () => {
    expect(resolverAnexo('Vida', './a.mp3')).toBe('Vida/a.mp3')
  })

  it('subir alem da raiz devolve null', () => {
    // Nao existe pasta acima do vault.
    expect(resolverAnexo('Vida', '../../Anexos/a.mp3')).toBeNull()
    expect(resolverAnexo('', '../a.mp3')).toBeNull()
  })

  it('segmento oculto nunca entra', () => {
    // `.vault` e do app: indice, config e a chave do cofre moram la.
    expect(resolverAnexo('', '.vault/index.db')).toBeNull()
    expect(resolverAnexo('Vida', '../.vault/config.json')).toBeNull()
  })
})
