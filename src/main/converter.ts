import type { Vault } from './vault/vault'
import type { Indexer } from './index/indexer'
import type { Cofre } from './cofre'
import { MARCA } from './cifra'

/**
 * Converte pastas entre texto puro e cifrado.
 *
 * O truque que torna isto quase trivial: `Vault.read` já decifra pelo
 * CONTEÚDO, e `Vault.writeAtomic` já cifra pelo CAMINHO. Então, com o cofre
 * já apontando para o estado FINAL das pastas, converter um arquivo é
 * literalmente lê-lo e gravá-lo de volta — o par read/write faz a conversão
 * nos dois sentidos sem que esta função precise saber para qual lado vai.
 *
 * ## Por que uma interrupção no meio não corrompe nada
 *
 * Cada arquivo é convertido sozinho, com a escrita atômica de sempre (grava
 * em .tmp e renomeia). Uma queda de energia no meio do laço deixa parte da
 * pasta cifrada e parte em texto — e isso continua funcionando, porque
 * `paraLer` decide pelo conteúdo de cada arquivo, não pela pasta. Rodar a
 * conversão de novo termina o serviço.
 *
 * É por isso que a decisão de decifrar olha o conteúdo, e não o caminho: o
 * desenho todo existe para que o estado intermediário seja um estado válido.
 */
export type ResultadoConversao = {
  convertidos: number
  /** Arquivos que já estavam do jeito desejado. */
  intactos: number
  /** Caminhos que falharam, com o motivo. A conversão continua nos outros. */
  falhas: { path: string; motivo: string }[]
}

export async function converterPastas(
  vault: Vault,
  indexer: Indexer,
  cofre: Cofre,
  pastas: string[]
): Promise<ResultadoConversao> {
  const prefixos = pastas.map(p => (p.endsWith('/') ? p : p + '/'))
  const todos = await vault.listMarkdown()
  const alvos = todos.filter(rel => {
    const limpo = rel.split(String.fromCharCode(92)).join('/')
    return prefixos.some(p => limpo.startsWith(p))
  })

  const r: ResultadoConversao = { convertidos: 0, intactos: 0, falhas: [] }

  for (const rel of alvos) {
    try {
      const bruto = await vault.readBruto(rel)
      const querCifrado = cofre.protege(rel)
      const jaCifrado = bruto.startsWith(MARCA)

      // Já está como deveria: não reescreve. Reescrever à toa mudaria o mtime
      // de metade do vault e faria o indexador reprocessar tudo por nada —
      // e, no caso cifrado, sortearia um IV novo sem motivo nenhum.
      if (querCifrado === jaCifrado) {
        r.intactos++
        continue
      }

      // `read` decifra pelo conteúdo; `writeAtomic` cifra pelo caminho. Com o
      // cofre já no estado final, este par faz a conversão nos dois sentidos.
      await vault.writeAtomic(rel, await vault.read(rel))
      r.convertidos++

      // Reindexar depois de converter: um arquivo que ACABOU de ser decifrado
      // precisa entrar no índice (pode ter ficado de fora enquanto estava
      // trancado), e um que acabou de ser cifrado precisa sair dele.
      try {
        if (querCifrado) indexer.removeFile(rel)
        else await indexer.indexFile(rel)
      } catch {
        // Índice defasado é recuperável — `syncAll` conserta na próxima
        // abertura do vault. Falhar a conversão por causa do índice não é.
      }
    } catch (e) {
      // Um arquivo problemático não pode abortar a conversão dos outros:
      // parar no meio deixaria o resto da pasta em estado misto sem que
      // ninguém soubesse quais faltaram.
      r.falhas.push({ path: rel, motivo: e instanceof Error ? e.message : String(e) })
    }
  }

  return r
}
