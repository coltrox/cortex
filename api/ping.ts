/**
 * Diz se as funcoes deste site rodam.
 *
 * Existe por causa de um FUNCTION_INVOCATION_FAILED sem explicacao no
 * `/agenda.ics`: aquele erro nao distingue "a funcao quebrou" de "funcao
 * nenhuma sobe aqui", e sem essa distincao a investigacao vira adivinhacao.
 * Este arquivo nao importa nada, entao so falha se o segundo caso for o caso.
 */
type Res = {
  status: (n: number) => Res
  setHeader: (k: string, v: string) => void
  send: (corpo: string) => void
}

export default function handler(_req: unknown, res: Res): void {
  res.status(200)
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.send([
    'ok',
    'tem VITE_SUPABASE_URL: ' + (process.env.VITE_SUPABASE_URL ? 'sim' : 'nao'),
    'tem VITE_SUPABASE_CHAVE: ' + (process.env.VITE_SUPABASE_CHAVE ? 'sim' : 'nao'),
    'node: ' + process.version
  ].join('\n'))
}
