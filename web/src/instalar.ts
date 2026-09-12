import type { Guardado } from './guardado'

const CHAVE = 'cortex.viu-instalar'

/**
 * Instalar o app na tela inicial — e quem precisa ouvir o quê.
 *
 * O Cortex do celular é um site que se instala, e a diferença entre usá-lo
 * pelo navegador e instalado é grande: instalado ele abre sem barra de
 * endereço, aparece na gaveta de apps e guarda a fila offline com folga. Mas
 * ninguém descobre isso sozinho — o gesto está escondido num menu, e é um
 * menu DIFERENTE em cada sistema.
 *
 * Por isso a detecção existe: mostrar as duas instruções lado a lado obrigaria
 * a pessoa a descobrir qual das duas é a dela, que é exatamente o trabalho que
 * este aviso deveria poupar.
 */
export type Sistema = 'android' | 'iphone' | 'outro'

/**
 * Qual sistema está segurando este site.
 *
 * O iPad mente desde o iOS 13: ele se anuncia como Macintosh. A diferença
 * entre um Mac de verdade e um iPad é o toque — nenhum Mac reporta vários
 * pontos de toque —, e é assim que os dois se separam.
 *
 * `outro` inclui o computador, onde instalar não faz sentido nenhum: quem
 * abre isto no desktop está conferindo alguma coisa, não montando o celular.
 */
export function qualSistema(ua: string, pontosDeToque = 0): Sistema {
  const s = ua.toLowerCase()
  if (/iphone|ipod|ipad/.test(s)) return 'iphone'
  // iPadOS 13+ se diz Macintosh; só o toque o denuncia.
  if (/macintosh/.test(s) && pontosDeToque > 1) return 'iphone'
  if (/android/.test(s)) return 'android'
  return 'outro'
}

/**
 * O site já está aberto como app instalado?
 *
 * Nesse caso o tutorial não tem o que ensinar, e mostrá-lo seria pedir que a
 * pessoa fizesse de novo o que já fez. `standalone` é a forma do Android e do
 * padrão; `navigator.standalone` é a do iOS, que nunca implementou a primeira.
 */
export function jaInstalado(): boolean {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
    return (navigator as { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/** Já viu o tutorial alguma vez neste aparelho? */
export function viuTutorial(g: Guardado): boolean {
  return g.ler(CHAVE) === '1'
}

/**
 * Marca como visto.
 *
 * Uma vez por aparelho, e não uma vez por visita: o aviso é útil no primeiro
 * encontro e vira estorvo no segundo. Quem fechar sem instalar e quiser de
 * volta acha o mesmo passo a passo nos Ajustes.
 */
export function marcarTutorialVisto(g: Guardado): void {
  g.gravar(CHAVE, '1')
}
