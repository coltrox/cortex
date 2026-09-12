import { useEffect, useState } from 'react'
import { qualSistema, type Sistema } from '../instalar'

/**
 * O passo a passo de pôr o Cortex na tela inicial.
 *
 * Aparece uma vez, no primeiro encontro, e some depois — quem fechar sem
 * instalar acha o mesmo texto nos Ajustes.
 *
 * Um sistema de cada vez. Mostrar os dois lado a lado obrigaria a pessoa a
 * descobrir qual é o dela, que é justamente o trabalho que este aviso deveria
 * poupar.
 */

/** O que o Android tem e o iPhone não: um pedido de instalação de verdade. */
type PedidoDeInstalar = Event & { prompt: () => Promise<void> }

const PASSOS: Record<Sistema, { titulo: string; passos: string[]; fecho: string }> = {
  android: {
    titulo: 'Instalar no Android',
    passos: [
      'Toque nos três pontinhos, no canto do Chrome.',
      'Escolha "Adicionar à tela inicial", ou "Instalar aplicativo".',
      'Confirme. O Cortex aparece junto dos seus outros apps.'
    ],
    fecho: 'Instalado, ele abre sem a barra de endereço e guarda o que você registrar mesmo sem sinal.'
  },
  iphone: {
    titulo: 'Instalar no iPhone',
    passos: [
      'Toque no botão de compartilhar, o quadrado com a seta para cima.',
      'Role a lista e escolha "Adicionar à Tela de Início".',
      'Toque em "Adicionar", no canto de cima.'
    ],
    // O Safari é o único navegador do iPhone que instala. Dizer isso evita a
    // meia hora de quem tenta pelo Chrome e conclui que o app é que não presta.
    fecho: 'Precisa ser pelo Safari — no iPhone só ele instala. Depois disso o Cortex abre como app.'
  },
  outro: {
    titulo: 'Abra no celular',
    passos: [
      'Este app foi feito para o bolso: registrar o dia em dois toques.',
      'Abra este mesmo endereço no seu celular.',
      'Lá ele se instala na tela inicial e passa a abrir como aplicativo.'
    ],
    fecho: 'No computador quem manda é o Cortex, que é onde as notas de verdade vivem.'
  }
}

export function Instalar({ aoFechar }: { aoFechar: () => void }) {
  const sistema = qualSistema(navigator.userAgent, navigator.maxTouchPoints)
  const conteudo = PASSOS[sistema]

  /*
   * O Android deixa o site PEDIR a instalação; o iPhone, não.
   *
   * Quando o navegador oferece, um botão vale mais que três passos escritos:
   * ele instala no toque. O evento chega sozinho e precisa ser segurado — por
   * padrão o Chrome mostraria um banner próprio, e seriam dois convites
   * competindo na mesma tela.
   */
  const [pedido, setPedido] = useState<PedidoDeInstalar | null>(null)
  useEffect(() => {
    const aoPoder = (e: Event): void => {
      e.preventDefault()
      setPedido(e as PedidoDeInstalar)
    }
    window.addEventListener('beforeinstallprompt', aoPoder)
    return () => window.removeEventListener('beforeinstallprompt', aoPoder)
  }, [])

  return (
    <div className="instalar-fundo" role="dialog" aria-modal="true" aria-label={conteudo.titulo}>
      <div className="instalar-caixa">
        <span className="instalar-etiqueta">primeira vez por aqui</span>
        <h2 className="instalar-titulo">{conteudo.titulo}</h2>

        <ol className="instalar-passos">
          {conteudo.passos.map((t, i) => (
            <li key={i}>
              <span className="instalar-numero">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>

        <p className="instalar-fecho">{conteudo.fecho}</p>

        <div className="instalar-acoes">
          {pedido && (
            <button
              className="btn btn-principal"
              type="button"
              onClick={() => { void pedido.prompt(); aoFechar() }}
            >
              Instalar agora
            </button>
          )}
          <button className="btn-fantasma" type="button" onClick={aoFechar}>
            {pedido ? 'Agora não' : 'Entendi'}
          </button>
        </div>
      </div>
    </div>
  )
}
