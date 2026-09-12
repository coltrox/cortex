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
  pintarBarraDeStatus(t)
}

/**
 * As duas cores do TOPO DA PÁGINA (`--fundo` em `estilo.css`).
 *
 * Eram as do casco, um tom abaixo do fundo — e o manifesto tinha um terceiro
 * escuro. A emenda entre a barra de status e o topo da página aparecia como
 * uma linha. Os mesmos dois valores estão no script do `index.html`.
 */
const FUNDO = { claro: '#faf9f6', escuro: '#101215' }

/**
 * A cor da barra de status do celular.
 *
 * Ela vinha só das duas metas `theme-color` com `prefers-color-scheme`, e por
 * isso seguia o tema do APARELHO, não o do app. Com o celular no claro e o app
 * no escuro, o Android pintava a faixa de cima de bege sobre uma tela preta —
 * a linha branca no topo.
 *
 * Uma meta sem `media` vence as duas com `media`, então basta manter esta em
 * dia. As outras continuam no HTML para a primeira pintura, antes de o
 * JavaScript rodar.
 *
 * `sistema` volta a perguntar ao aparelho, que é o que a opção quer dizer.
 */
function pintarBarraDeStatus(t: Tema): void {
  const escuro = t === 'escuro' || (
    t === 'sistema' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  )
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = escuro ? FUNDO.escuro : FUNDO.claro
}
