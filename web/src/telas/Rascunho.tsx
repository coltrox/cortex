import { useEffect, useRef, useState } from 'react'
import {
  espessura, acaoDoPonteiro, tamanhoDoBitmap, paraFolha, comArrasto, comPinca,
  comZoom, nomeDoPng, VISTA_INICIAL, type Ferramenta, type Vista
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
 *   a folha, dois dedos AMPLIAM.
 * - E, depois que uma caneta aparece, o dedo nunca desenha. Apoiar a mão na
 *   tela para escrever não risca nada — a rejeição de palma sai como
 *   consequência da regra, e não como heurística de área de toque.
 *
 * No celular, sem caneta nenhuma, o dedo desenha: quem não tem tablet
 * continua tendo rascunho. Quem decide isso é `deveDesenhar`.
 *
 * A folha é MAIOR que a janela de propósito: dá para empurrá-la de lado e
 * continuar a conta no espaço em branco, em vez de apagar para ter espaço.
 *
 * O traço não é salvo. É rascunho, e morre com a questão.
 */

/**
 * O tamanho da folha, em pixels lógicos.
 *
 * Bem maior que a janela, a pedido dele — "escrever bastante". Dá umas quatro
 * telas de conta: quando acabar o espaço, empurra a folha de lado em vez de
 * apagar. O teto de memória de `tamanhoDoBitmap` é quem segura a conta disso
 * num tablet de alta densidade.
 */
const FOLHA_L = 2200
const FOLHA_A = 1500

/** Quanto cada toque nos botões `−`/`+` amplia ou reduz. */
const PASSO_ZOOM = 1.25

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
  /* Uma caneta já encostou nesta folha? A partir daí o dedo só move. */
  const jaUsouCaneta = useRef(false)
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

  /**
   * O ponto, em coordenada da folha.
   *
   * Mede o retângulo do CANVAS, não o da área: ele já vem com o translate e o
   * scale aplicados, então o traço cai onde a ponta encostou sem o código ter
   * de adivinhar de que canto o CSS amplia.
   */
  const naFolha = (e: React.PointerEvent): { x: number; y: number } => {
    const r = canvas.current?.getBoundingClientRect()
    return paraFolha(
      e.clientX, e.clientY,
      { left: r?.left ?? 0, top: r?.top ?? 0 },
      vistaRef.current.escala
    )
  }

  /** Ponto do dedo em coordenada da ÁREA, que é o que os gestos usam. */
  const naArea = (e: React.PointerEvent): { x: number; y: number } => {
    const r = area.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }

  /** Desenha de um ponto ao outro, já em coordenada de folha. */
  const riscar = (
    de: { x: number; y: number }, ate: { x: number; y: number }, pressao: number
  ): void => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.globalCompositeOperation = ferramenta === 'borracha' ? 'destination-out' : 'source-over'
    /* A espessura é dividida pela escala para o traço ter a mesma grossura
       APARENTE em qualquer zoom: ampliado, um traço de 2 px viraria 10. */
    ctx.lineWidth = espessura(pressao, ferramenta) / vistaRef.current.escala
    ctx.beginPath()
    ctx.moveTo(de.x, de.y)
    ctx.lineTo(ate.x, ate.y)
    ctx.stroke()
  }

  /** A regra, com o estado atual da folha preenchido. */
  const acao = (e: React.PointerEvent) =>
    acaoDoPonteiro(e.pointerType, jaUsouCaneta.current, ultimo.current !== null)

  const aoEncostar = (e: React.PointerEvent): void => {
    if (e.pointerType === 'pen') jaUsouCaneta.current = true
    const o_que = acao(e)
    if (o_que === 'ignorar') return

    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* nem todo navegador deixa */ }

    if (o_que === 'desenhar') {
      const p = naFolha(e)
      ultimo.current = p
      // Um toque curto precisa deixar um ponto: sem isto, pingar um "i" ou
      // marcar uma vírgula não desenha nada, porque não houve movimento.
      riscar(p, p, e.pressure)
      return
    }

    dedos.current.set(e.pointerId, naArea(e))
  }

  const aoMover = (e: React.PointerEvent): void => {
    const o_que = acao(e)
    if (o_que === 'ignorar') return

    if (o_que === 'desenhar') {
      if (!ultimo.current) return
      const ate = naFolha(e)
      riscar(ultimo.current, ate, e.pressure)
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
    /* Com `canetaEncostada` em false, a pergunta é "este ponteiro era o que
       desenhava?" — e só ele encerra o traço. A palma levantando no meio da
       escrita não pode cortar a linha. */
    if (acaoDoPonteiro(e.pointerType, jaUsouCaneta.current, false) === 'desenhar') {
      ultimo.current = null
    }
    dedos.current.delete(e.pointerId)
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

  /** O meio da janela, que é a âncora natural para os botões de zoom. */
  const meioDaArea = (): { x: number; y: number } => {
    const r = area.current?.getBoundingClientRect()
    return { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 }
  }

  const ampliar = (fator: number): void =>
    aplicar(comZoom(vistaRef.current, fator, meioDaArea()))

  /**
   * Roda do mouse amplia, em vez de rolar a página.
   *
   * No computador não há pinça, e sem isto o zoom ficaria só nos botões. A
   * âncora é o ponteiro: amplia onde o mouse está, como todo mapa faz.
   */
  const aoRodar = (e: React.WheelEvent): void => {
    const r = area.current?.getBoundingClientRect()
    if (!r) return
    aplicar(comZoom(
      vistaRef.current,
      e.deltaY < 0 ? PASSO_ZOOM : 1 / PASSO_ZOOM,
      { x: e.clientX - r.left, y: e.clientY - r.top }
    ))
  }

  /**
   * Salva a folha como PNG, no tamanho cheio do bitmap.
   *
   * Duas decisões moram aqui. A primeira é exportar o BITMAP inteiro, e não o
   * pedaço visível: o arquivo sai na resolução de desenho, que num tablet é
   * duas a três vezes a da tela — serve para guardar a resolução da conta, que
   * é o que ele pediu.
   *
   * A segunda é pintar o fundo antes. O canvas é transparente, e um PNG
   * transparente com traço escuro abre invisível em visualizador de fundo
   * escuro. Com o fundo sólido, o arquivo sai como a folha aparece na tela.
   */
  const salvarPng = (): void => {
    const el = canvas.current
    if (!el) return

    const folha = document.createElement('canvas')
    folha.width = el.width
    folha.height = el.height
    const ctx = folha.getContext('2d')
    if (!ctx) return

    const estilo = getComputedStyle(el)
    ctx.fillStyle = estilo.backgroundColor || '#ffffff'
    ctx.fillRect(0, 0, folha.width, folha.height)
    ctx.drawImage(el, 0, 0)

    folha.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nomeDoPng(new Date())
      a.click()
      // Sem revogar, o bitmap inteiro fica preso na memória da aba até ela
      // fechar — e são dezenas de megabytes.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
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

        {/* O zoom em botão, porque no computador não há pinça — e no tablet
            é mais firme do que dois dedos no meio de uma conta. */}
        <span className="rascunho-zoom">
          <button
            type="button" className="btn-aba" aria-label="Reduzir"
            onClick={() => ampliar(1 / PASSO_ZOOM)}
          >−</button>
          <span className="rascunho-escala">{Math.round(vista.escala * 100)}%</span>
          <button
            type="button" className="btn-aba" aria-label="Ampliar"
            onClick={() => ampliar(PASSO_ZOOM)}
          >+</button>
        </span>

        <button
          type="button" className="btn-aba"
          onClick={() => aplicar(VISTA_INICIAL)}
        >Centralizar</button>
        <button type="button" className="btn-aba" onClick={salvarPng}>⇩ PNG</button>
        <button type="button" className="btn-aba" onClick={() => setAberto(false)}>Fechar</button>
      </div>

      <div
        ref={area}
        className="rascunho-area"
        onPointerDown={aoEncostar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onWheel={aoRodar}
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
        Caneta escreve. Um dedo arrasta a folha, dois dedos dão zoom (no
        computador, a roda do mouse) — e a mão apoiada não risca nada. A folha
        é bem maior que a janela: empurre para o lado quando faltar espaço.
      </p>
    </div>
  )
}
