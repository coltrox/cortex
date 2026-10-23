import { useEffect, useRef } from 'react'
import { semear, avancar, ligacoes, quantosNos, type No } from './redeNeural'

/**
 * A rede neural desenhada, para a tela de abertura.
 *
 * Mora em `shared` porque os DOIS apps a usam — o Cortex enquanto abre o
 * vault, e o celular enquanto carrega. Duas cópias de um canvas acabam
 * divergindo em algum detalhe, e aí a mesma marca fica diferente em cada
 * aparelho.
 *
 * Decisões que valem explicar:
 *
 * - **Tudo em `ref`, nada em estado.** A animação pinta a 60 quadros por
 *   segundo; um `setState` por quadro re-renderizaria a árvore do React
 *   sessenta vezes por segundo, numa tela cujo único trabalho é parecer
 *   leve.
 * - **Herda `currentColor`.** O desenho acompanha o tema sem segunda versão.
 * - **Respeita quem pediu menos movimento.** Com `prefers-reduced-motion` a
 *   rede é desenhada UMA vez e para. Animação de fundo é enfeite, e enfeite
 *   não justifica passar mal.
 */
export function RedeAnimada({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    const pai = el.parentElement
    const densidade = Math.min(window.devicePixelRatio || 1, 2)
    let largura = 0
    let altura = 0
    let nos: No[] = []

    const medir = (): void => {
      largura = pai?.clientWidth ?? el.clientWidth
      altura = pai?.clientHeight ?? el.clientHeight
      el.width = Math.max(1, Math.floor(largura * densidade))
      el.height = Math.max(1, Math.floor(altura * densidade))
      ctx.setTransform(densidade, 0, 0, densidade, 0, 0)
      /* Semeia de novo ao redimensionar: a quantidade de nós depende da
         área, e manter os antigos deixaria a tela grande vazia e a pequena
         apinhada. */
      nos = semear(quantosNos(largura, altura))
    }

    const pintar = (): void => {
      ctx.clearRect(0, 0, largura, altura)
      const cor = getComputedStyle(el).color

      // As linhas primeiro, para os nós ficarem por cima das pontas.
      for (const l of ligacoes(nos)) {
        const a = nos[l.a]
        const b = nos[l.b]
        if (!a || !b) continue
        ctx.globalAlpha = l.forca * 0.33
        ctx.strokeStyle = cor
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(a.x * largura, a.y * altura)
        ctx.lineTo(b.x * largura, b.y * altura)
        ctx.stroke()
      }

      for (const n of nos) {
        ctx.globalAlpha = 0.25 + n.tamanho * 0.45
        ctx.fillStyle = cor
        ctx.beginPath()
        ctx.arc(n.x * largura, n.y * altura, 1.1 + n.tamanho * 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    medir()
    /* Pinta JÁ, sem esperar o primeiro quadro.
       `requestAnimationFrame` não dispara enquanto a janela está em segundo
       plano — e a abertura é justamente a hora em que ela pode ainda não
       estar na frente. Sem esta primeira pintura, quem abre o app numa aba
       de fundo volta para ela e encontra um retângulo vazio. */
    pintar()

    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (quieto) return

    let quadro = 0
    let antes = performance.now()
    const laco = (agora: number): void => {
      nos = avancar(nos, (agora - antes) / 1000)
      antes = agora
      pintar()
      quadro = requestAnimationFrame(laco)
    }
    quadro = requestAnimationFrame(laco)

    const aoRedimensionar = (): void => { medir() }
    window.addEventListener('resize', aoRedimensionar)

    return () => {
      cancelAnimationFrame(quadro)
      window.removeEventListener('resize', aoRedimensionar)
    }
  }, [])

  return <canvas ref={canvas} className={className} aria-hidden="true" />
}
