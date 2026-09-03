import type { Vault } from '../vault/vault'
import type { Indexer } from '../index/indexer'
import { patchFrontmatter, appendToFrontmatterList } from '../vault/patch'
import { parseFrontmatter } from '../parser/frontmatter'
import { DEPENDENCIAS } from '../templates'
import type { Operacao } from './planejar'

/**
 * Aplica as operações no vault.
 *
 * Fino de propósito: toda a decisão está em `planejar`, e aqui só há escrita.
 * Usa exatamente os mesmos utilitários que os formulários da interface usam —
 * nenhum caminho novo de escrita entra no projeto por causa da nuvem. Isso
 * vale também para nota nova: o esqueleto abaixo (`ESQUELETO_VAZIO`) é só
 * `---\n---\n` — YAML vazio, mas válido — e quem escreve o frontmatter de
 * verdade por cima é sempre o `patchFrontmatter`, com o `gray-matter` real
 * escapando dois-pontos, aspas e quebra de linha. Montar as linhas do YAML na
 * mão (como uma versão anterior deste arquivo fazia) corrompe qualquer valor
 * com esses caracteres — e `anotacao` é justamente o tipo que carrega texto
 * livre digitado pelo usuário no celular, o mais propenso a ter ": " ou
 * parágrafo.
 */

const cabecalhoDiario = (dia: string): string =>
  `---\ntipo: diario\ndate: ${dia}\n---\n\n## Como foi o dia\n`

/** Esqueleto de nota nova: YAML vazio válido + o mesmo rodapé de sempre. */
const ESQUELETO_VAZIO = `---\n---\n\n${DEPENDENCIAS}\n\n`

async function garantir(vault: Vault, path: string, inicial: string): Promise<void> {
  if (!(await vault.exists(path))) await vault.writeAtomic(path, inicial)
}

/** Conteúdo de `path`, ou o esqueleto vazio se ele ainda não existir. */
async function lerOuVazio(vault: Vault, path: string): Promise<string> {
  return (await vault.exists(path)) ? vault.read(path) : ESQUELETO_VAZIO
}

/**
 * Acha um caminho livre para uma nota com política `seExistir: 'criarOutro'`
 * (ver `Operacao` em `planejar.ts`). `anotacao` deriva o nome da primeira
 * linha do texto — duas anotações de dias diferentes que começam igual não
 * podem colidir e uma apagar a outra, então aqui se acrescenta " (2)",
 * " (3)"... até achar um nome que ainda não existe.
 */
async function proximoCaminhoLivre(vault: Vault, path: string): Promise<string> {
  if (!(await vault.exists(path))) return path
  const base = path.endsWith('.md') ? path.slice(0, -3) : path
  for (let n = 2; ; n++) {
    const candidato = `${base} (${n}).md`
    if (!(await vault.exists(candidato))) return candidato
  }
}

function comoLista(v: unknown): string[] {
  return Array.isArray(v) ? v.map(x => String(x)) : []
}

/**
 * Indexa sem deixar uma falha aqui virar reprocessamento do evento inteiro.
 *
 * Quando esta função é chamada, o `writeAtomic` já terminou — o dado já está
 * gravado no disco. Se `indexFile` falhar (índice bloqueado, disco cheio no
 * meio da escrita do `.db`, o que for) e essa falha subir até o
 * `Sincronizador`, o evento não é marcado como aplicado, e a próxima rodada
 * reaplica a mesma operação sobre um arquivo que já tem o dado — para
 * `diario-lista` (gasto, refeição extra) isso duplica a linha no arquivo do
 * usuário. Entre um índice temporariamente desatualizado e um gasto em
 * dobro, o índice é o erro mais barato.
 *
 * Isso não quer dizer que o índice se autocorrige sozinho. `VaultWatcher`
 * (`vault/watcher.ts`) observa o disco e tenta indexar de novo quando este
 * arquivo mudar de novo — mas se essa nova tentativa também falhar, ele só
 * loga (`console.error`) e segue: não refileira, não insiste. Quem garante
 * a correção de fato é `syncAll()` (`index/indexer.ts`), chamado por
 * `Session.open` a cada abertura do vault: ele compara `mtime`/`size` de
 * cada arquivo contra o que está gravado no banco e reindexa qualquer
 * divergência, inclusive esta. Até lá, ou até a próxima mudança neste
 * arquivo, o índice fica defasado para esta nota — defasado é recuperável;
 * duplicado no arquivo do usuário não é.
 */
async function indexarSemFalhar(indexer: Indexer, path: string): Promise<void> {
  try {
    await indexer.indexFile(path)
  } catch (err) {
    console.error(`[cortex] falha ao indexar ${path} após escrita vinda da nuvem:`, err)
  }
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
        await indexarSemFalhar(indexer, path)
        break
      }

      /*
       * O desfazer do check.
       *
       * Se o diário do dia nem existe, não há o que desmarcar — e criar o
       * arquivo aqui produziria um diário vazio só para registrar que nada
       * foi feito. Por isso este caso NÃO chama `garantir`, ao contrário do
       * `diario-conjunto` logo acima.
       */
      case 'diario-tirar': {
        const path = `Diario/${op.dia}.md`
        if (!(await vault.exists(path))) break
        const raw = await vault.read(path)
        const atual = comoLista(parseFrontmatter(raw).frontmatter[op.campo])
        if (!atual.includes(op.valor)) break
        const restante = atual.filter(v => v !== op.valor)
        // Lista vazia vira `null`, que `patchFrontmatter` traduz em apagar a
        // chave: um `suplementos_feitos: []` pendurado no diário é uma linha
        // que não diz nada e que aparece em toda nota do dia.
        await vault.writeAtomic(path, patchFrontmatter(raw, {
          [op.campo]: restante.length > 0 ? restante : null
        }))
        await indexarSemFalhar(indexer, path)
        break
      }

      case 'diario-lista': {
        const path = `Diario/${op.dia}.md`
        await garantir(vault, path, cabecalhoDiario(op.dia))
        const raw = await vault.read(path)
        await vault.writeAtomic(path, appendToFrontmatterList(raw, op.campo, op.item).raw)
        await indexarSemFalhar(indexer, path)
        break
      }

      case 'nota': {
        if (op.seExistir === 'mesclar') {
          // Já existir não é erro: dois cardios no mesmo dia (ou duas
          // sessões com o mesmo modelo e data) caem no mesmo caminho, e o
          // segundo mescla em vez de estourar.
          const raw = await lerOuVazio(vault, op.path)
          await vault.writeAtomic(op.path, patchFrontmatter(raw, op.frontmatter))
          await indexarSemFalhar(indexer, op.path)
        } else {
          // 'criarOutro': mesclar aqui apagaria uma anotação diferente que
          // só por acaso começa com a mesma frase — nunca sobrescreve,
          // sempre cria um arquivo à parte com um sufixo que desambigua.
          const path = await proximoCaminhoLivre(vault, op.path)
          await vault.writeAtomic(path, patchFrontmatter(ESQUELETO_VAZIO, op.frontmatter))
          await indexarSemFalhar(indexer, path)
        }
        break
      }

      case 'marcar': {
        // Nunca cria. Se a nota sumiu, a operação não faz nada: criar aqui
        // ressuscitaria, como arquivo vazio, algo que o dono apagou no
        // computador.
        if (!(await vault.exists(op.path))) {
          console.error(`[cortex] evento do celular aponta para nota que não existe: ${op.path}`)
          break
        }
        const raw = await vault.read(op.path)
        const tipo = parseFrontmatter(raw).frontmatter.tipo
        // A guarda que separa esta operação das outras: o caminho vem de
        // fora. Sem conferir o tipo, um evento marcaria `cancelado: true`
        // em qualquer nota do vault — um documento, uma senha, um projeto.
        if (typeof tipo !== 'string' || !op.tiposPermitidos.includes(tipo)) {
          console.error(
            `[cortex] evento do celular tentou marcar ${op.path} (tipo ${String(tipo)}), ` +
            `mas só ${op.tiposPermitidos.join('/')} podem ser marcados`
          )
          break
        }
        await vault.writeAtomic(op.path, patchFrontmatter(raw, op.campos))
        await indexarSemFalhar(indexer, op.path)
        break
      }

      case 'apagar': {
        // Já não existe: nada a fazer, e nada a registrar. Apagar duas vezes
        // o mesmo compromisso é o caso normal de um evento reprocessado.
        if (!(await vault.exists(op.path))) break
        const raw = await vault.read(op.path)
        const tipo = parseFrontmatter(raw).frontmatter.tipo
        // A guarda que separa esta operação de um comando de apagar arquivo:
        // o caminho vem de fora, do celular.
        if (typeof tipo !== 'string' || !op.tiposPermitidos.includes(tipo)) {
          console.error(
            `[cortex] evento do celular tentou apagar ${op.path} (tipo ${String(tipo)}), ` +
            `mas só ${op.tiposPermitidos.join('/')} podem ser apagados`
          )
          break
        }
        await vault.remover(op.path)
        indexer.removeFile(op.path)
        break
      }

      case 'nota-campos': {
        const raw = await lerOuVazio(vault, op.path)
        // `op.tipo` depois do spread de `op.campos`: quem decide o `tipo`
        // da nota é este executor, não o evento que originou `campos` — a
        // mesma regra de "seus campos depois do spread" usada no resto do
        // plano (ver `planejar.ts`), aplicada aqui de novo por segurança
        // mesmo que hoje `campos` já traga o `tipo` certo.
        await vault.writeAtomic(op.path, patchFrontmatter(raw, { ...op.campos, tipo: op.tipo }))
        await indexarSemFalhar(indexer, op.path)
        break
      }
    }
  }
}
