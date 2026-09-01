import { useEffect, useRef, useState } from 'react'
import { ehIdDeVault, idDoFragmento } from '../ajustes'
import { Cabecalho, Botao, Aviso } from '../componentes'

/**
 * Lê o QR do Cortex com a câmera do celular.
 *
 * Aceita as duas formas que o Cortex gera: o link (`https://…/#id=<uuid>`) e
 * o id cru, para quando o endereço do app ainda não foi configurado lá.
 *
 * Usa a `BarcodeDetector` do navegador, que não existe em todo lugar — no
 * Safari do iPhone, por exemplo. Quando falta, a tela diz isso e manda usar a
 * câmera do sistema, que lê o mesmo QR sem app nenhum. É por isso que o QR
 * carrega um link: a câmera nativa sempre funciona, e este leitor é a
 * conveniência, não o caminho principal.
 */
export function LerQr({ aoLer, aoFechar }: {
  aoLer: (id: string) => void
  aoFechar: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [procurando, setProcurando] = useState(true)

  useEffect(() => {
    const Detector = (window as unknown as {
      BarcodeDetector?: new (o: unknown) => {
        detect(fonte: unknown): Promise<{ rawValue: string }[]>
      }
    }).BarcodeDetector

    if (!Detector) {
      setErro(
        'Este navegador não sabe ler QR. Use a câmera normal do celular no ' +
        'QR do Cortex — ela abre o app já conectado.'
      )
      setProcurando(false)
      return
    }

    let vivo = true
    let fluxo: MediaStream | null = null
    const detector = new Detector({ formats: ['qr_code'] })

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

        const procurar = async (): Promise<void> => {
          if (!vivo || !video.current) return
          try {
            const achados = await detector.detect(video.current)
            const bruto = achados[0]?.rawValue
            if (bruto) {
              const doLink = bruto.includes('#')
                ? idDoFragmento(bruto.slice(bruto.indexOf('#')))
                : null
              const id = doLink ?? (ehIdDeVault(bruto) ? bruto.trim().toLowerCase() : null)
              if (id) { aoLer(id); return }
              // QR de outra coisa (um Pix, um site). Continua procurando em vez
              // de acusar erro: a pessoa pode ter mirado no lugar errado.
            }
          } catch {
            // Um quadro ilegível não é erro; o próximo resolve.
          }
          requestAnimationFrame(() => void procurar())
        }
        void procurar()
      } catch {
        setErro('Não deu para abrir a câmera. Confira a permissão no navegador.')
        setProcurando(false)
      }
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
    <>
      <Cabecalho titulo="Ler QR" aoVoltar={aoFechar} />
      {erro && <Aviso grave>{erro}</Aviso>}
      <div className="secao">
        {procurando && (
          <>
            <div className="camera">
              <video ref={video} playsInline muted />
              <div className="camera-mira" />
            </div>
            <p className="nota">
              Aponte para o QR que está no Cortex, em Configurações → Celular.
            </p>
          </>
        )}
        <Botao aoClicar={aoFechar}>Voltar e digitar o id</Botao>
      </div>
    </>
  )
}
