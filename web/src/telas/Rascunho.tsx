import { useEffect, useRef, useState } from 'react'
import { espessura, deveDesenhar, tamanhoDoBitmap, type Ferramenta } from '../rascunho'

/**
 * A folha de rascunho, dentro do exercício.
 *
 * Pedido do dono, que estuda no tablet com caneta: "uma área para desenhar e
 * fazer conta, que eu consigo escrever, apagar". É o papel ao lado da prova,
 * na mesma tela — sem trocar de app no meio de uma questão.
 *
 * Três decisões que separam usável de irritante:
 *
 * - **`touch-action: none` no canvas.** Sem isso, arrastar a caneta ROLA a
 *   página em vez de desenhar, e o rascunho vira piada.
 * - **Rejeição de palma.** Depois que uma caneta encosta, o dedo deixa de
 *   desenhar: apoiar a mão para escrever não risca mais a folha.
 * - **Bitmap na densidade da tela.** Desenhar num bitmap pequeno e esticar é
 *   o que deixa a linha serrilhada no tablet.
 *
 * O traço NÃO é salvo: é rascunho, e morre com a questão, como o papel que se
 * amassa. Guardar exigiria decidir onde, e não é isso que ele pediu.
 */
export function Rascunho() {
  const [aberto, setAberto] = useState(false)
  const [ferramenta, setFerramenta] = useState<Ferramenta>('caneta')
  const canvas = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  /* Em `ref`, e não em estado: isto muda no meio de um gesto, e redesenhar a
     tela a cada toque engoliria o traço. */
  const usouCaneta = useRef(false)
  const ultimo = useRef<{ x: number; y: number } | null>(null)

  /* Prepara o bitmap quando a folha abre, e de novo se a janela mudar de
     largura. Redimensionar canvas limpa o conteúdo — virar o tablet apaga o
     rascunho, e é melhor que o traço fique borrado e fora de lugar. */
  useEffect(() => {
    if (!aberto) return
    const el = canvas.current
    if (!el) return

    const preparar = (): void => {
      const { largura, altura, escala } = tamanhoDoBitmap(
        el.clientWidth, el.clientHeight, window.devicePixelRatio
      )
      el.width = largura
      el.height = altura
      const ctx = el.getContext('2d')
      if (!ctx) return
      ctx.scale(escala, escala)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = getComputedStyle(el).color
    }

    preparar()
    window.addEventListener('resize', preparar)
    return () => window.removeEventListener('resize', preparar)
  }, [aberto])

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const comecar = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.pointerType === 'pen') usouCaneta.current = true
    if (!deveDesenhar(e.pointerType, usouCaneta.current)) return
    desenhando.current = true
    ultimo.current = ponto(e)
    // Captura o ponteiro para o traço não morrer se a caneta sair da folha.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* nem todo navegador deixa */ }
  }

  const mover = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!desenhando.current) return
    if (!deveDesenhar(e.pointerType, usouCaneta.current)) return
    const ctx = canvas.current?.getContext('2d')
    const de = ultimo.current
    if (!ctx || !de) return
    const ate = ponto(e)

    ctx.globalCompositeOperation = ferramenta === 'borracha' ? 'destination-out' : 'source-over'
    ctx.lineWidth = espessura(e.pressure, ferramenta)
    ctx.beginPath()
    ctx.moveTo(de.x, de.y)
    ctx.lineTo(ate.x, ate.y)
    ctx.stroke()

    ultimo.current = ate
  }

  const terminar = (): void => {
    desenhando.current = false
    ultimo.current = null
  }

  const limpar = (): void => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.restore()
  }

  if (!aberto) {
    return (
      <button
        type="button"
        className="btn btn-fantasma rascunho-abrir"
        onClick={() => setAberto(true)}
      >
        ✎ Rascunho
      </button>
    )
  }

  return (
    <div className="rascunho">
      <div className="rascunho-barra">
        <button
          type="button" className="btn-aba" data-ativa={ferramenta === 'caneta'}
          onClick={() => setFerramenta('caneta')}
        >✎ Caneta</button>
        <button
          type="button" className="btn-aba" data-ativa={ferramenta === 'borracha'}
          onClick={() => setFerramenta('borracha')}
        >⌫ Borracha</button>
        <button type="button" className="btn-aba" onClick={limpar}>Limpar</button>
        <button type="button" className="btn-aba" onClick={() => setAberto(false)}>Fechar</button>
      </div>

      <canvas
        ref={canvas}
        className="rascunho-folha"
        onPointerDown={comecar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={terminar}
      />

      <p className="rascunho-dica">
        Escreva com a caneta. Depois do primeiro traço, o toque do dedo deixa
        de desenhar — dá para apoiar a mão na tela.
      </p>
    </div>
  )
}
