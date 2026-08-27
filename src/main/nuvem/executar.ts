import type { Vault } from '../vault/vault'
import type { Indexer } from '../index/indexer'
import { patchFrontmatter, appendToFrontmatterList } from '../vault/patch'
import { parseFrontmatter } from '../parser/frontmatter'
import type { Operacao } from './planejar'

/**
 * Aplica as operações no vault.
 *
 * Fino de propósito: toda a decisão está em `planejar`, e aqui só há escrita.
 * Usa exatamente os mesmos utilitários que os formulários da interface usam —
 * nenhum caminho novo de escrita entra no projeto por causa da nuvem.
 */

const cabecalhoDiario = (dia: string): string =>
  `---\ntipo: diario\ndate: ${dia}\n---\n\n## Como foi o dia\n`

async function garantir(vault: Vault, path: string, inicial: string): Promise<void> {
  if (!(await vault.exists(path))) await vault.writeAtomic(path, inicial)
}

function comoLista(v: unknown): string[] {
  return Array.isArray(v) ? v.map(x => String(x)) : []
}

export async function executar(
  vault: Vault, indexer: Indexer, ops: Operacao[]
): Promise<void> {
  for (const op of ops) {
    switch (op.acao) {
      case 'diario-conjunto': {
        const path = `Diario/${op.dia}.md`
        await garantir(vault, path, cabecalhoDiario(op.dia))
        const raw = await vault.read(path)
        // Conjunto, não lista: marcar o mesmo suplemento de novo não repete.
        const atual = comoLista(parseFrontmatter(raw).frontmatter[op.campo])
        if (atual.includes(op.valor)) break
        await vault.writeAtomic(path, patchFrontmatter(raw, { [op.campo]: [...atual, op.valor] }))
        await indexer.indexFile(path)
        break
      }

      case 'diario-lista': {
        const path = `Diario/${op.dia}.md`
        await garantir(vault, path, cabecalhoDiario(op.dia))
        const raw = await vault.read(path)
        await vault.writeAtomic(path, appendToFrontmatterList(raw, op.campo, op.item).raw)
        await indexer.indexFile(path)
        break
      }

      case 'nota': {
        // Já existir não é erro: dois cardios no mesmo dia caem no mesmo
        // caminho, e o segundo mescla em vez de estourar.
        if (await vault.exists(op.path)) {
          const raw = await vault.read(op.path)
          await vault.writeAtomic(op.path, patchFrontmatter(raw, op.frontmatter))
        } else {
          const linhas = Object.entries(op.frontmatter).map(([k, v]) =>
            `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
          await vault.writeAtomic(op.path,
            `---\n${linhas.join('\n')}\n---\n\n### 🕸️ Dependências da Rede\n-\n\n`)
        }
        await indexer.indexFile(op.path)
        break
      }

      case 'nota-campos': {
        await garantir(vault, op.path,
          `---\ntipo: ${op.tipo}\n---\n\n### 🕸️ Dependências da Rede\n-\n\n`)
        const raw = await vault.read(op.path)
        await vault.writeAtomic(op.path, patchFrontmatter(raw, op.campos))
        await indexer.indexFile(op.path)
        break
      }
    }
  }
}
