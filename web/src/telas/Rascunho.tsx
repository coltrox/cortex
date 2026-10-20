import { useEffect, useRef, useState } from 'react'
import {
  espessura, tamanhoDoBitmap, paraFolha, comArrasto, comPinca,
  VISTA_INICIAL, type Ferramenta, type Vista
} from '../rascunho'

/**
 * A folha de rascunho, dentro do exercício.
 *
 * Pedido do dono, que estuda no tablet com caneta: fazer a conta ao lado da
 * questão, sem trocar de app. E, depois de usar: **caneta escreve, dedo move
 * e amplia** — como num app de caderno.
 *
 * É por isso que os gestos são feitos à mão aqui, em vez de deixar o
 * navegador cuidar:
 *
 * - `touch-action: none` na área impede o navegador de rolar a página com o
 *   dedo. Sem isso, arrastar a caneta rolaria a tela em vez de desenhar.
 * - Com o navegador fora do caminho, o dedo precisa de dono: um dedo ARRASTA
 *   a folha, dois dedos AMPLIAM. É o que este componente faz.
 * - E o dedo nunca desenha. Apoiar a mão na tela para escrever não risca
 *   nada — a rejeição de palma sai de graça, como consequência da regra.
 *
 * A folha é MAIOR que a janela de propósito: dá para empurrá-la de lado e
 * continuar a conta no espaço em branco, em vez de apagar para ter espaço.
 *
 * O traço não é salvo. É rascunho, e morre com a questão.
 */

/** O tamanho da folha, em pixels lógicos. Maior que a tela, para sobrar espaço. */
const FOLHA_L = 1400
const FOLHA_A = 1000

export function Rascunho() {
  const [aberto, setAberto] = useState(false)
  const [ferramenta, setFerramenta] = useState<Ferramenta>('caneta')
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL)

  const area = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const ultimo = useRef<{ x: number; y: number } | null>(null)
  /* Os dedos encostados agora, por id. Em `ref` porque mudam a cada frame do
     gesto, e um `setState` por frame travaria o arraste. */
  const dedos = useRef(new Map<number, { x: number; y: number }>())
  /* A vista também em ref: os handlers precisam do valor atual DENTRO do
     gesto, e o estado só chega no render seguinte. */
  const vistaRef = useRef(vista)
  vistaRef.current = vista

  const aplicar = (v: Vista): void => { vistaRef.current = v; setVista(v) }

  useEffect(() => {
    if (!aberto) return
    const el = canvas.current
    if (!el) return
    const { largura, altura, escala } = tamanhoDoBitmap(
      FOLHA_L, FOLHA_A, window.devicePixelRatio
    )
    el.width = largura
    el.height = altura
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.scale(escala, escala)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = getComputedStyle(el).color
  }, [aberto])

  const origem = (): { left: number; top: number } => {
    const r = area.current?.getBoundingClientRect()
    return { left: r?.left ?? 0, top: r?.top ?? 0 }
  }

  /** Ponto do dedo em coordenada da ÁREA, que é o que os gestos usam. */
  const naArea = (e: React.PointerEvent): { x: number; y: number } => {
    const o = origem()
    return { x: e.clientX - o.left, y: e.clientY - o.top }
  }

  const aoEncostar = (e: React.PointerEvent): void => {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* nem todo navegador deixa */ }

    if (e.pointerType === 'pen') {
      ultimo.current = paraFolha(e.clientX, e.clientY, origem(), vistaRef.current)
      return
    }
    // Dedo e mouse movem a folha. Nunca desenham — é daí que sai a rejeição
    // de palma: a mão apoiada é só mais um dedo, e dedo não risca.
    dedos.current.set(e.pointerId, naArea(e))
  }

  const aoMover = (e: React.PointerEvent): void => {
    if (e.pointerType === 'pen') {
      const de = ultimo.current
      if (!de) return
      const ctx = canvas.current?.getContext('2d')
      if (!ctx) return
      const ate = paraFolha(e.clientX, e.clientY, origem(), vistaRef.current)

      ctx.globalCompositeOperation = ferramenta === 'borracha' ? 'destination-out' : 'source-over'
      /* A espessura é dividida pela escala para o traço ter a mesma grossura
         APARENTE em qualquer zoom: ampliado, um traço de 2 px viraria 10. */
      ctx.lineWidth = espessura(e.pressure, ferramenta) / vistaRef.current.escala
      ctx.beginPath()
      ctx.moveTo(de.x, de.y)
      ctx.lineTo(ate.x, ate.y)
      ctx.stroke()

      ultimo.current = ate
      return
    }

    const antes = dedos.current.get(e.pointerId)
    if (!antes) return
    const agora = naArea(e)

    if (dedos.current.size === 1) {
      aplicar(comArrasto(vistaRef.current, agora.x - antes.x, agora.y - antes.y))
      dedos.current.set(e.pointerId, agora)
      return
    }

    // Dois dedos: pinça. Pega o outro dedo para formar o par.
    const outro = [...dedos.current.entries()].find(([id]) => id !== e.pointerId)
    if (!outro) return
    aplicar(comPinca(
      vistaRef.current,
      { a: antes, b: outro[1] },
      { a: agora, b: outro[1] }
    ))
    dedos.current.set(e.pointerId, agora)
  }

  const aoSoltar = (e: React.PointerEvent): void => {
    if (e.pointerType === 'pen') ultimo.current = null
    else dedos.current.delete(e.pointerId)
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
        <button
          type="button" className="btn-aba"
          onClick={() => aplicar(VISTA_INICIAL)}
        >Centralizar</button>
        <button type="button" className="btn-aba" onClick={() => setAberto(false)}>Fechar</button>
      </div>

      <div
        ref={area}
        className="rascunho-area"
        onPointerDown={aoEncostar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onPointerLeave={aoSoltar}
      >
        <canvas
          ref={canvas}
          className="rascunho-folha"
          style={{
            width: `${FOLHA_L}px`,
            height: `${FOLHA_A}px`,
            transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.escala})`
          }}
        />
      </div>

      <p className="rascunho-dica">
        Caneta escreve. Um dedo arrasta a folha, dois dedos dão zoom — e a mão
        apoiada não risca nada.
      </p>
    </div>
  )
}
