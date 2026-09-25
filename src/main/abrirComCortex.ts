import { dirname, resolve } from 'node:path'

/**
 * "Abrir com o Cortex": o arquivo que o Windows manda na linha de comando.
 *
 * Com as associações do instalador, dar duplo clique num `.md` — ou escolher
 * "Abrir com" num `.txt`, `.json`, `.ts` — chama o Cortex com o caminho do
 * arquivo como argumento. Se o app já estiver aberto, o mesmo caminho chega
 * pelo evento de segunda instância, e a janela que existe é que abre o
 * arquivo.
 *
 * A lista de argumentos vem cheia de coisa que não é arquivo: as flags do
 * Chromium (`--allow-file-access-from-files`), o próprio executável e, em
 * desenvolvimento, o caminho do script. Por isso esta regra mora aqui,
 * separada e testável sem abrir janela nenhuma.
 */
export function arquivoDosArgumentos(
  argv: string[],
  empacotado: boolean,
  existe: (caminho: string) => boolean
): string | null {
  // Empacotado: `[Cortex.exe, ...flags, arquivo]`. Em desenvolvimento o
  // Electron recebe o script antes (`[electron.exe, out/main/index.js, …]`),
  // e aquele script É um arquivo que existe — daí ele sair da conta.
  for (const bruto of argv.slice(empacotado ? 1 : 2)) {
    if (!bruto || bruto.startsWith('-') || bruto === '.') continue
    const abs = resolve(bruto)
    if (existe(abs)) return abs
  }
  return null
}

/**
 * A pasta que precisa estar autorizada e o caminho do arquivo dentro dela.
 *
 * A lente Dev trabalha com pasta autorizada mais caminho relativo — é assim
 * que o confinamento de `PastasDev` funciona —, então abrir um arquivo solto
 * é autorizar a pasta dele e apontar o nome.
 */
export function pastaEArquivo(abs: string): { pasta: string; nome: string } {
  const pasta = dirname(abs)
  return { pasta, nome: abs.slice(pasta.length + 1).replace(/\\/g, '/') }
}
