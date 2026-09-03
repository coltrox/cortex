import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Puxar para atualizar.
 *
 * O app já se mantém em dia sozinho — relógio de dois minutos, campainha,
 * volta de tela. Isto não substitui nada disso: existe para o momento em que
 * a pessoa MEXEU no Cortex agora e quer ver o resultado no celular sem
 * esperar, e para o oposto, em que ela desconfia que o app travou. Um gesto
 * que responde na hora é o que transforma "será que está funcionando?" numa
 * resposta.
 *
 * Não há botão de atualizar em lugar nenhum, e continua não havendo: um botão
 * fica na tela o tempo todo dizendo que manter os dados em dia é trabalho de
 * quem usa. O gesto some quando não está em uso.
 */

/** Quanto é preciso puxar para soltar e atualizar. */
export const LIMITE = 70

/** Onde o indicador para de descer, por mais que se puxe. */
export const MAXIMO = 110

/**
 * A borracha do gesto.
 *
 * Sem resistência, o indicador acompanha o dedo um-para-um e desce a tela
 * inteira — some do campo de visão e o gesto perde o próprio retorno visual.
 * Metade do movimento, com teto, é o que dá a sensação de elástico: puxa
 * fácil no começo e vai ficando duro.
 */
export function comResistencia(bruta: number): number {
  if (bruta <= 0) return 0
  return Math.min(MAXIMO, bruta * 0.5)
}

/** Passou do ponto de soltar? */
export const passou = (distancia: number): boolean => distancia >= LIMITE

/**
 * O quanto o indicador aparece, de 0 a 1.
 *
 * Serve para ele nascer junto com o gesto em vez de piscar inteiro no
 * primeiro pixel — antes de `LIMITE` ainda se está "carregando a mola".
 */
export const progresso = (distancia: number): number =>
  Math.max(0, Math.min(1, distancia / LIMITE))

export type UsoDoPuxar = {
  /** Quanto o indicador desceu, em pixels. */
  distancia: number
  /** Uma atualização disparada pelo gesto está em curso. */
  atualizando: boolean
}

/**
 * Liga o gesto na janela inteira.
 *
 * Na janela, e não num container com `overflow`: as telas rolam no próprio
 * documento, então é `window.scrollY` que diz se já estamos no topo — e só no
 * topo o gesto arma, senão ele roubaria a rolagem normal da lista.
 */
export function usePuxarParaAtualizar(aoAtualizar: () => Promise<void>): UsoDoPuxar {
  const [distancia, setDistancia] = useState(0)
  const [atualizando, setAtualizando] = useState(false)

  // Em ref, e não em estado: o handler de `touchmove` roda a cada frame do
  // dedo, e um `setState` por frame só para guardar a origem do gesto faria
  // a tela re-renderizar sem nada ter mudado nela.
  const origem = useRef<number | null>(null)
  const ocupado = useRef(false)

  /*
   * A distância vive em dois lugares: no estado, porque a tela desenha a
   * partir dela, e num ref, porque `soltar` precisa LER o valor atual para
   * decidir se dispara.
   *
   * Ler de dentro de um `setDistancia(d => …)` seria o caminho curto, mas
   * updater de estado tem de ser função pura — o React roda o updater duas
   * vezes em StrictMode, e disparar a atualização lá dentro a dispararia
   * duas vezes junto.
   */
  const atual = useRef(0)
  const mudar = useCallback((d: number): void => { atual.current = d; setDistancia(d) }, [])

  /*
   * A função de atualizar entra por ref, e não como dependência.
   *
   * Quem chama monta ela com `useCallback` sobre `p.cardapio`/`p.envio`, que
   * são objetos novos a cada render — então ela muda de identidade toda vez.
   * Como dependência, faria o efeito abaixo remover e repor os listeners de
   * toque a cada render, e um render no meio do gesto (marcar um suplemento,
   * a fila mudar de tamanho) tiraria os listeners debaixo do dedo.
   */
  const chamar = useRef(aoAtualizar)
  useEffect(() => { chamar.current = aoAtualizar }, [aoAtualizar])

  const disparar = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    setAtualizando(true)
    try {
      await chamar.current()
    } finally {
      ocupado.current = false
      setAtualizando(false)
      mudar(0)
    }
  }, [mudar])

  useEffect(() => {
    const comecar = (e: TouchEvent): void => {
      // Só arma no topo. No meio da lista, o dedo para baixo é rolagem.
      if (window.scrollY > 0 || ocupado.current) { origem.current = null; return }
      origem.current = e.touches[0]?.clientY ?? null
    }

    const mover = (e: TouchEvent): void => {
      if (origem.current === null) return
      const y = e.touches[0]?.clientY
      if (y === undefined) return
      const bruta = y - origem.current
      if (bruta <= 0) {
        // Mudou de ideia e voltou para cima: devolve a rolagem ao navegador.
        origem.current = null
        mudar(0)
        return
      }
      // Sem isto o navegador faz o próprio overscroll junto, e a tela balança
      // duas vezes. Exige listener não-passivo — ver `addEventListener` abaixo.
      if (e.cancelable) e.preventDefault()
      mudar(comResistencia(bruta))
    }

    const soltar = (): void => {
      if (origem.current === null) return
      origem.current = null
      if (!passou(atual.current)) { mudar(0); return }
      // Fica no limite até a atualização terminar, senão o indicador some
      // antes de girar e o gesto parece não ter feito nada.
      mudar(LIMITE)
      void disparar()
    }

    window.addEventListener('touchstart', comecar, { passive: true })
    window.addEventListener('touchmove', mover, { passive: false })
    window.addEventListener('touchend', soltar, { passive: true })
    window.addEventListener('touchcancel', soltar, { passive: true })
    return () => {
      window.removeEventListener('touchstart', comecar)
      window.removeEventListener('touchmove', mover)
      window.removeEventListener('touchend', soltar)
      window.removeEventListener('touchcancel', soltar)
    }
  }, [disparar, mudar])

  return { distancia, atualizando }
}
