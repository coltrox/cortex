import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * As preferências de TELA, gravadas em disco pelo processo principal.
 *
 * Existem por um defeito que ficou invisível por muito tempo: `localStorage`
 * NÃO FUNCIONA no app instalado. A janela de produção carrega por `file://`,
 * que para o Chromium é origem opaca, e ali ele recusa o armazenamento local.
 * Quem lia e gravava — os ajustes do Cérebro — engolia a exceção num
 * `try/catch`, então a falha não aparecia: durante a sessão os ajustes
 * pareciam salvos, porque o estado do React os segurava, e sumiam ao reabrir.
 *
 * Medido antes de consertar: o armazenamento local do app não tinha UMA
 * entrada de `file://` — só de `http://localhost:5173`, gravadas quando o app
 * roda em desenvolvimento, onde a origem é de verdade. Era por isso que o
 * problema nunca aparecia enquanto se programava.
 *
 * ## Por que não é a config do vault
 *
 * `main/config.ts` guarda o que pertence ao VAULT — áreas ligadas, painéis
 * trancados, nuvem — e mora dentro dele, porque é a configuração daquele
 * vault. Tamanho de ponto do grafo é preferência de quem está olhando, e
 * acompanha o computador, não o vault. Misturar as duas faria trocar de vault
 * perder o ajuste da tela, e levar o vault para outra máquina carregaria junto
 * o gosto de quem usava a primeira.
 */

/** Chave e valor, ambos texto. Quem chama serializa o que quiser guardar. */
export type Prefs = Record<string, string>

const caminho = (): string => join(app.getPath('userData'), 'prefs.json')

/**
 * Lê o que está no disco.
 *
 * Qualquer falha devolve vazio: arquivo ausente na primeira execução, JSON
 * quebrado por uma versão futura, disco sem permissão. Nenhuma delas é motivo
 * para o app não abrir, e todas dão no mesmo resultado prático — a tela usa os
 * padrões.
 *
 * Só pares de texto passam. O arquivo é gravado por nós, mas ler dele como se
 * fosse confiável é o tipo de suposição que envelhece mal.
 */
export async function lerPrefs(): Promise<Prefs> {
  try {
    const cru = JSON.parse(await readFile(caminho(), 'utf8')) as unknown
    if (!cru || typeof cru !== 'object' || Array.isArray(cru)) return {}
    const out: Prefs = {}
    for (const [k, v] of Object.entries(cru as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Grava uma preferência, preservando as outras.
 *
 * Lê, mescla e escreve o arquivo inteiro. É o suficiente porque isto guarda
 * punhados de bytes e muda quando alguém arrasta um controle — não há volume
 * nem concorrência que justifique algo mais elaborado.
 */
export async function gravarPref(chave: string, valor: string): Promise<void> {
  const atuais = await lerPrefs()
  atuais[chave] = valor
  await writeFile(caminho(), JSON.stringify(atuais, null, 2), 'utf8')
}
