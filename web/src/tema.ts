import type { Guardado } from './guardado'

/**
 * Claro, escuro, ou o que o aparelho mandar.
 *
 * O app nasceu escuro e sem escolha. O desenho `Rotina` é claro e traz os três
 * botões — e trazer a escolha junto com a virada é o que evita a pergunta
 * óbvia de quem gostava do escuro.
 *
 * `sistema` é o padrão porque é o que responde certo sem ninguém tocar em
 * nada: quem usa o celular no escuro à noite recebe o escuro à noite.
 */
export type Tema = 'claro' | 'escuro' | 'sistema'

const CHAVE = 'cortex.tema'

const VALIDOS: Tema[] = ['claro', 'escuro', 'sistema']

/**
 * Lê a escolha guardada.
 *
 * Nunca confia no que está no disco: `localStorage` é texto que qualquer coisa
 * pode ter escrito, e uma versão futura pode gravar outro vocabulário. O que
 * não for um dos três vira `sistema`, em vez de virar um atributo estranho no
 * `<html>` que nenhuma regra de CSS casa — o que deixaria o app sem paleta.
 */
export function lerTema(g: Guardado): Tema {
  const v = g.ler(CHAVE)
  return VALIDOS.find(t => t === v) ?? 'sistema'
}

export function gravarTema(g: Guardado, t: Tema): void {
  g.gravar(CHAVE, VALIDOS.find(x => x === t) ?? 'sistema')
}

/**
 * Põe a escolha no `<html>`, que é onde o CSS a lê.
 *
 * No elemento raiz, e não no corpo: a cor de fundo da página vem do `html`, e
 * é ela que aparece na área de rolagem elástica do iPhone quando se puxa a
 * lista além do fim. Pintar só o `body` deixa aquela faixa clara no tema
 * escuro.
 */
export function aplicarTema(t: Tema): void {
  document.documentElement.dataset.tema = t
}
