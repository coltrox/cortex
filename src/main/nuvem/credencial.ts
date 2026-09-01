/**
 * A credencial do Supabase, assada no build.
 *
 * Ela não aparece em nenhuma tela, e não há campo para digitá-la: é sempre o
 * mesmo projeto, e pedir URL e chave a quem usa o app seria pedir que a
 * pessoa configure a fiação da própria casa. Sincronizar e publicar viraram
 * automáticos pelo mesmo motivo.
 *
 * Os valores entram por `.env` na raiz (fora do git), com o prefixo que o
 * electron-vite injeta no processo principal. O repositório é público; a
 * chave publicável não é segredo de verdade — ela vive dentro do pacote do
 * app web também —, mas mantê-la fora do código versionado evita que ela vire
 * um resultado de busca no GitHub.
 *
 * `config.nuvem` continua existindo e tem prioridade: é a saída para apontar
 * um vault para outro projeto sem recompilar.
 */
export type Credencial = { url: string; chave: string }

function doBuild(): Credencial | null {
  const url = import.meta.env?.MAIN_VITE_SUPABASE_URL
  const chave = import.meta.env?.MAIN_VITE_SUPABASE_CHAVE
  return typeof url === 'string' && url !== '' && typeof chave === 'string' && chave !== ''
    ? { url, chave }
    : null
}

export function credencialDe(config: { nuvem: Credencial | null }): Credencial | null {
  return config.nuvem ?? doBuild()
}
