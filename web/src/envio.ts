import { useCallback, useEffect, useRef, useState } from 'react'
import type { Evento } from '@compartilhado/eventos'
import { guardadoDoNavegador } from './guardado'
import { lerVaultId } from './ajustes'
import { Fila } from './fila'
import { ClienteWeb } from './nuvem'
import { CREDENCIAL, faltaCredencial } from './credencial'
import {
  ouvirCampainha, tocarCampainha, reavaliarCampainha, acordarCampainha
} from './campainha'
import { lerCardapio, gravarCardapio, type Cardapio } from './cardapio'

/** De quanto em quanto tempo a fila tenta sair sozinha, com o app aberto. */
const INTERVALO_MS = 30_000

/**
 * De quanto em quanto tempo os dados do Cortex sao buscados de novo.
 *
 * Isto e a rede de seguranca, nao o caminho normal: o caminho normal e a
 * campainha, que avisa na hora que o Cortex publicou. O relogio cobre o que
 * a campainha nao cobre — o toque que saiu enquanto o celular estava sem
 * sinal, o WebSocket que a rede da escola bloqueia, o Realtime fora do ar.
 *
 * Nao ha botao de atualizar em lugar nenhum, e e de proposito: o vault esta
 * conectado, entao manter isso em dia e trabalho do app, nao da pessoa.
 */
const INTERVALO_CARDAPIO_MS = 120_000

/**
 * O cliente da vez, ou `null` enquanto o id do vault não estiver configurado.
 *
 * É recriado a cada chamada de propósito: o id pode ter acabado de ser colado
 * na tela de Ajustes, e um cliente guardado em módulo continuaria apontando
 * para o vault antigo até alguém recarregar a página.
 */
export function clienteAtual(): ClienteWeb | null {
  const id = lerVaultId(guardadoDoNavegador)
  if (!id || faltaCredencial()) return null
  return new ClienteWeb(CREDENCIAL, id)
}

export type EstadoEnvio = {
  naFila: number
  enviando: boolean
  avisos: string[]
}

/**
 * A fila, os relógios e o estado que a tela mostra.
 *
 * A fila esvazia ao abrir, ao voltar a rede, e a cada 30 segundos. Falha de
 * rede não vira erro na tela: a próxima tentativa resolve, e um aviso vermelho
 * a cada 30 segundos dentro do metrô seria só ruído.
 */
export function useEnvio() {
  const fila = useRef(new Fila(guardadoDoNavegador)).current
  const [estado, setEstado] = useState<EstadoEnvio>({
    naFila: fila.quantos(), enviando: false, avisos: []
  })
  // Impede duas drenagens ao mesmo tempo — o relógio de 30 s e o evento
  // `online` disparam juntos quando o sinal volta.
  const drenando = useRef(false)

  const drenar = useCallback(async () => {
    if (drenando.current) return
    const cliente = clienteAtual()
    if (!cliente || fila.quantos() === 0) {
      setEstado(e => ({ ...e, naFila: fila.quantos() }))
      return
    }

    const tinha = fila.quantos()
    drenando.current = true
    setEstado(e => ({ ...e, enviando: true }))
    try {
      const r = await fila.esvaziar(ev => cliente.registrarEvento(ev))
      setEstado(e => ({ naFila: r.restam, enviando: false, avisos: [...e.avisos, ...r.avisos] }))
      // Alguma coisa saiu da fila: o Cortex tem novidade para puxar, e o
      // toque faz ele puxar agora em vez de daqui a dois minutos. Só quando
      // de fato saiu — uma rodada que não conseguiu enviar nada não é
      // novidade nenhuma para ninguém.
      if (r.restam < tinha) tocarCampainha('eventos')
    } finally {
      drenando.current = false
      setEstado(e => ({ ...e, enviando: false, naFila: fila.quantos() }))
    }
  }, [fila])

  const registrar = useCallback((evento: Evento) => {
    fila.enfileirar(evento)
    setEstado(e => ({ ...e, naFila: fila.quantos() }))
    void drenar()
  }, [fila, drenar])

  const limparAvisos = useCallback(() => setEstado(e => ({ ...e, avisos: [] })), [])

  useEffect(() => {
    void drenar()
    const relogio = setInterval(() => void drenar(), INTERVALO_MS)
    const aoVoltar = () => void drenar()
    window.addEventListener('online', aoVoltar)
    return () => {
      clearInterval(relogio)
      window.removeEventListener('online', aoVoltar)
    }
  }, [drenar])

  return { estado, registrar, drenar, limparAvisos }
}

export type UsoDoCardapio = {
  cardapio: Cardapio
  atualizar: (opts?: { comoConexao?: boolean }) => Promise<void>
  erro: string | null
  buscando: boolean
}

/** O cardápio guardado, com uma busca ao abrir o app. */
export function useCardapio(): UsoDoCardapio {
  const [cardapio, setCardapio] = useState<Cardapio>(() => lerCardapio(guardadoDoNavegador))
  const [erro, setErro] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  /*
   * `comoConexao` é a única hora em que cardápio vazio vira aviso.
   *
   * O ID ligado ao vault não é "válido só quando há algo publicado" — ele
   * fica ligado independente de o Cortex ter publicado algo ainda. Cardápio
   * vazio e ID errado respondem exatamente igual (lista vazia), e por um
   * tempo este hook tratava os dois casos como o mesmo aviso vermelho —
   * inclusive nas buscas de fundo, que rodam a cada dois minutos pelo resto
   * da vida do app. Um vault recém-criado, ou um dia em que o Cortex não
   * publicou nada novo, acendia o mesmo alarme de "ID errado?" para sempre.
   *
   * A única checagem honesta acontece uma vez, no instante de ligar o ID
   * (`Ajustes.tsx` chama com `comoConexao: true` logo após salvar) — é o que
   * o comentário de lá já dizia: "o aviso aparece agora e não amanhã". Fora
   * desse instante, vazio é estado normal, não motivo de alarme.
   */
  const atualizar = useCallback(async (opts?: { comoConexao?: boolean }) => {
    // Conectar ou trocar de vault em Ajustes chama isto logo em seguida; é o
    // ponto certo para a campainha trocar de canal junto.
    reavaliarCampainha()
    const cliente = clienteAtual()
    if (!cliente) return
    setBuscando(true)
    try {
      const itens = await cliente.listarCardapio()
      gravarCardapio(guardadoDoNavegador, itens, new Date().toISOString())
      setCardapio(lerCardapio(guardadoDoNavegador))
      setErro(opts?.comoConexao && itens.length === 0
        ? 'Não veio nada com esse ID. Ou ele está errado, ou o Cortex ainda não subiu seus dados — confira o ID no Cortex, em Configurações → Celular.'
        : null)
    } catch {
      // Sem rede: fica com o que já estava guardado, em silêncio.
      setErro(null)
    } finally {
      setBuscando(false)
    }
  }, [])

  useEffect(() => {
    void atualizar()
    const relogio = setInterval(() => void atualizar(), INTERVALO_CARDAPIO_MS)

    // Voltar para o app e o momento mais provavel de haver novidade: a pessoa
    // acabou de mexer no Cortex e trocou de janela. Esperar o proximo tique
    // de dois minutos ali seria esperar a toa.
    // Reconectar E buscar. Um broadcast é tiro único e não fica guardado no
    // servidor: reconectar cobre os toques daqui para frente, buscar cobre o
    // que se perdeu enquanto o aparelho dormia.
    const voltar = (): void => { acordarCampainha(); void atualizar() }
    const aoVoltar = (): void => {
      if (document.visibilityState === 'visible') voltar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('online', voltar)

    // O caminho instantâneo: o Cortex publicou e tocou, e a busca sai agora.
    const pararDeOuvir = ouvirCampainha(t => { if (t === 'cardapio') void atualizar() })

    return () => {
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('online', voltar)
      pararDeOuvir()
    }
  }, [atualizar])

  return { cardapio, atualizar, erro, buscando }
}
