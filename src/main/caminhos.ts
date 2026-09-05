import { resolve, relative, isAbsolute } from 'node:path'

/**
 * `alvo` é a pasta `outra`, ou está acima dela?
 *
 * Existe para uma pergunta só: a pasta que alguém escolheu como vault engole
 * a pasta de dados do próprio Cortex?
 *
 * Aconteceu duas vezes no mesmo dia. O diálogo de escolher vault abre perto de
 * `AppData\Roaming\Cortex\vaults`, e um clique a mais para cima cai em
 * `AppData\Roaming\Cortex` — que é onde o app guarda o que é dele. Aberta como
 * vault, ela ganha um `.vault` próprio, um id novo (que passa a poluir o
 * banco), e as pastas de área nascem espalhadas no meio dos arquivos do
 * Electron. O vault abre vazio, e nada na tela diz por quê.
 *
 * Escolher `AppData\Roaming` seria pior ainda: o Cortex indexaria todo
 * markdown de todo programa instalado.
 *
 * A comparação é por caminho resolvido, e não por texto cru: `C:\x\y\..\z` e
 * `C:\x\z` são a mesma pasta. No Windows a caixa das letras não distingue
 * pastas, então a comparação também não distingue.
 *
 * O contrário -- impedir que um caminho ESCAPE de uma raiz -- já existe em
 * `vault/vault.ts` e `dev/pastas.ts`. Aqui a pergunta é a inversa.
 */
export function ehOuContem(alvo: string, outra: string): boolean {
  const a = normalizar(alvo)
  const b = normalizar(outra)
  if (a === b) return true
  const rel = relative(a, b)
  // Vazio: são a mesma pasta. Começa com `..`: `outra` está fora de `alvo`.
  // Absoluto: estão em discos diferentes, e aí não há como uma conter a outra.
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

const normalizar = (p: string): string =>
  process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p)
