import { useEffect, useRef, useState } from 'react'
import { textoDoQuadro, idDoQr } from '../qrleitura'
import { Cabecalho, Botao, Aviso } from '../componentes'

/**
 * Lê o QR do Cortex com a câmera do celular.
 *
 * Aceita as duas formas que o Cortex gera: o link (`https://…/#id=<uuid>`) e
 * o id cru, para quando o endereço do app ainda não foi configurado lá.
 *
 * ## Por que há dois leitores
 *
 * `BarcodeDetector` é do navegador, e o Safari do iPhone não tem — que é
 * justamente o aparelho do dono. Antes a tela desistia ali e mandava usar a
 * câmera do sistema; na prática isso era "a câmera não abre". Agora o
 * detector nativo é usado quando existe (é mais rápido e não custa nada), e
 * onde não existe um decodificador em JS lê o mesmo quadro.
 */

/** Recebe o quadro atual do vídeo e devolve o texto do QR, se houver. */
type Leitor = (v: HTMLVideoElement) => Promise<string | null>

/** O leitor do navegador. Chrome e Android têm; Safari não. */
function leitorNativo(): Leitor | null {
  const Detector = (window as unknown as {
    BarcodeDetector?: new (o: unknown) => {
      detect(fonte: unknown): Promise<{ rawValue: string }[]>
    }
  }).BarcodeDetector
  if (!Detector) return null

  const detector = new Detector({ formats: ['qr_code'] })
  return async v => {
    try {
      return (await detector.detect(v))[0]?.rawValue ?? null
    } catch {
      // Um quadro ilegível não é erro; o próximo resolve.
      return null
    }
  }
}

/**
 * O decodificador em JS, para quando o navegador não traz um.
 *
 * O quadro é reduzido antes de decodificar: um QR que preenche a mira é
 * legível de sobra a 480px, e decodificar 1920px a cada quadro esquenta o
 * telefone sem ler nada a mais.
 */
const LADO_MAX = 480

function leitorPorCanvas(): Leitor {
  const tela = document.createElement('canvas')
  // `willReadFrequently` evita que o navegador mantenha a tela na GPU: aqui
  // ela é lida a cada quadro, e o vaivém entre GPU e memória é o gargalo.
  const ctx = tela.getContext('2d', { willReadFrequently: true })

  return async v => {
    if (!ctx || !v.videoWidth || !v.videoHeight) return null
    const escala = Math.min(1, LADO_MAX / Math.max(v.videoWidth, v.videoHeight))
    tela.width = Math.round(v.videoWidth * escala)
    tela.height = Math.round(v.videoHeight * escala)
    ctx.drawImage(v, 0, 0, tela.width, tela.height)
    const quadro = ctx.getImageData(0, 0, tela.width, tela.height)
    return textoDoQuadro(quadro.data, quadro.width, quadro.height)
  }
}

export function LerQr({ aoLer, aoFechar }: {
  aoLer: (id: string) => void
  aoFechar: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    let fluxo: MediaStream | null = null
    const ler = leitorNativo() ?? leitorPorCanvas()

    const rodar = async (): Promise<void> => {
      try {
        // `environment` é a câmera de trás: a da frente leria o QR espelhado e
        // obrigaria a pessoa a virar o celular contra a tela do computador.
        fluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })
        if (!vivo) { fluxo.getTracks().forEach(t => t.stop()); return }
        if (video.current) {
          video.current.srcObject = fluxo
          await video.current.play()
        }
      } catch {
        setErro(
          'Não deu para abrir a câmera. Confira a permissão do navegador para ' +
          'este site — ou volte e cole o id do vault à mão.'
        )
        return
      }

      const procurar = async (): Promise<void> => {
        if (!vivo || !video.current) return
        const bruto = await ler(video.current)
        if (bruto) {
          const id = idDoQr(bruto)
          if (id) { aoLer(id); return }
          // QR de outra coisa (um Pix, um site). Continua procurando em vez de
          // acusar erro: a pessoa pode ter mirado no lugar errado.
        }
        if (vivo) requestAnimationFrame(() => void procurar())
      }
      void procurar()
    }

    void rodar()
    return () => {
      vivo = false
      // Soltar a câmera ao sair da tela: sem isto a luzinha fica acesa e o
      // celular esquenta enquanto o app estiver aberto noutra aba.
      fluxo?.getTracks().forEach(t => t.stop())
    }
  }, [aoLer])

  return (
    <div className="tema-hoje">
      <Cabecalho titulo="Ler QR" aoVoltar={aoFechar} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="bloco">
        {/* O visor continua na tela mesmo com erro: sem ele sobra um aviso e
            um botão, e nada que se pareça com a tela da câmera. */}
        <div className="visor">
          <video ref={video} playsInline muted />
          <div className="mira"><i /><i /><i /><i /></div>
        </div>
        <p className="instrucao">
          Aponte para o QR que está no Cortex, em Configurações → Celular.
        </p>
        <Botao aoClicar={aoFechar}>Voltar e digitar o id</Botao>
      </div>
    </div>
  )
}
