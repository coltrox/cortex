/**
 * Claro, escuro, ou o que o sistema estiver usando.
 *
 * A preferência mora no `localStorage`, e NÃO no `config.json` do vault. A
 * diferença importa: o config viaja junto com a pasta — zipar o vault e abrir
 * noutra máquina levaria o tema junto, impondo o escuro num computador de sala
 * clara. Tema é preferência de quem está olhando, não do vault.
 *
 * Quem resolve entre os três é este arquivo, e o CSS tem um bloco escuro só.
 * A alternativa — uma `@media (prefers-color-scheme: dark)` no CSS além do
 * bloco explícito — obrigaria a mesma paleta a existir em dois lugares, e as
 * duas divergiriam na primeira cor ajustada num deles.
 */

export type Tema = 'sistema' | 'claro' | 'escuro'

const CHAVE = 'cortex.tema'

const ESCOLHAS: readonly Tema[] = ['sistema', 'claro', 'escuro']

/**
 * A preferência guardada. `sistema` é o padrão, e é o padrão certo: quem
 * deixou o Windows no escuro já disse o que prefere.
 *
 * Envolvido em try/catch porque `localStorage` LANÇA quando o navegador está
 * configurado para bloquear dado de site — e um app que não abre porque não
 * conseguiu ler uma preferência de cor seria absurdo.
 */
export function lerTema(): Tema {
  try {
    const v = localStorage.getItem(CHAVE)
    return ESCOLHAS.find(e => e === v) ?? 'sistema'
  } catch {
    return 'sistema'
  }
}

export function salvarTema(t: Tema): void {
  try {
    localStorage.setItem(CHAVE, t)
  } catch {
    // Sem espaço ou sem permissão: o tema vale para esta sessão e volta ao
    // padrão na próxima. Não é motivo para avisar nada a ninguém.
  }
}

/** O sistema está no escuro agora? */
function sistemaEscuro(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/**
 * Escreve o tema resolvido no `<html>`, que é de onde o CSS lê.
 *
 * Só `escuro` vira atributo; claro é a ausência dele, que é o `:root` normal.
 */
export function aplicarTema(t: Tema): void {
  const escuro = t === 'escuro' || (t === 'sistema' && sistemaEscuro())
  if (escuro) document.documentElement.dataset.tema = 'escuro'
  else delete document.documentElement.dataset.tema
}

/**
 * Passa a acompanhar o sistema enquanto a preferência for `sistema`.
 *
 * Sem isto, trocar o Windows para o escuro à noite não faria nada até fechar
 * e abrir o Cortex — e "seguir o sistema" que só segue na abertura não está
 * seguindo coisa nenhuma.
 *
 * Devolve como parar de ouvir.
 */
export function acompanharSistema(): () => void {
  const consulta = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!consulta) return () => {}
  const aoMudar = (): void => {
    if (lerTema() === 'sistema') aplicarTema('sistema')
  }
  consulta.addEventListener('change', aoMudar)
  return () => consulta.removeEventListener('change', aoMudar)
}
