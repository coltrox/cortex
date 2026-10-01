import {
  useEffect, useRef, useState,
  type KeyboardEvent, type PointerEvent as ReactPointerEvent
} from 'react'
import { diaLocal, eventoSessao, type ExercicioFeito, type SerieFeita } from '../montar'
import { treinos, exerciciosDoTreino } from '../cardapio'
import { guardadoDoNavegador } from '../guardado'
import { mover, alvoDoArrasto, type Caixa } from '../ordem'
import { guardarSessaoLocal } from '../sessoesLocais'
import { Cabecalho, Botao, Aviso } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'
import { SubNavSaude } from './Saude'

const CHAVE = 'cortex.treino'

/**
 * O teclado do celular está aberto?
 *
 * A barra de "Cancelar / Registrar treino" é fixa no rodapé, e com o teclado
 * aberto o iPhone a reposiciona no meio da tela — ela ficava por cima dos
 * botões de adicionar exercício ("esses botões ficam aí voando", nas palavras
 * do dono). Com o teclado na frente, a barra sai; quem está digitando não
 * está registrando o treino.
 *
 * A medida é a do `visualViewport`: a parte da página que sobra à vista. Cem
 * pixels a menos que a janela é teclado — barra de endereço indo e vindo mexe
 * bem menos que isso.
 */
/**
 * O teclado está na frente, dada a janela e a parte dela que sobrou à vista.
 *
 * Cem pixels: a barra de endereço do Safari indo e vindo mexe bem menos que
 * isso, e nenhum teclado de celular é menor.
 */
export function tecladoNaFrente(alturaDaJanela: number, alturaVisivel: number): boolean {
  return alturaDaJanela - alturaVisivel > 100
}

function useTecladoAberto(): boolean {
  const [aberto, setAberto] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const medir = (): void => setAberto(tecladoNaFrente(window.innerHeight, vv.height))
    medir()
    vv.addEventListener('resize', medir)
    return () => vv.removeEventListener('resize', medir)
  }, [])
  return aberto
}

/**
 * `feito` é o botão de concluir, e não uma dedução do que foi digitado.
 *
 * Antes ele era `feitas.some(...)`: digitar as repetições da PRIMEIRA série
 * já riscava o exercício inteiro e o dava por encerrado, quando na verdade
 * faltavam três séries. Quem decide que acabou é quem está treinando.
 *
 * Opcional porque uma sessão guardada antes desta mudança não tem o campo —
 * e ausente vale como "não concluído", que é o estado certo para retomar.
 */
type Exercicio = { nome: string; presc: string; feitas: SerieFeita[]; feito?: boolean }
/**
 * `dia` só aparece quando a sessão é a edição de um treino já registrado —
 * ver "corrigir" no histórico. Sem ele, o treino é o de hoje.
 */
type Sessao = { modelo: string; itens: Exercicio[]; dia?: string }

/**
 * A sessão em andamento, guardada no aparelho.
 *
 * Um treino leva quarenta minutos, e nesse tempo a tela trava, o telefone
 * toca, o navegador descarta a aba para poupar memória. Sem isto, tudo que
 * foi anotado até ali some — e a pessoa só descobre no fim.
 *
 * É estado de tela, não dado: sai daqui assim que o treino é registrado, e o
 * que vale a partir de então é o evento na fila, que já sabe esperar a rede.
 */
function lerSessao(): Sessao | null {
  const bruto = guardadoDoNavegador.ler(CHAVE)
  if (!bruto) return null
  try {
    const o = JSON.parse(bruto) as Sessao
    return o && typeof o.modelo === 'string' && Array.isArray(o.itens) ? o : null
  } catch {
    return null
  }
}

const gravarSessao = (s: Sessao | null): void =>
  s ? guardadoDoNavegador.gravar(CHAVE, JSON.stringify(s)) : guardadoDoNavegador.apagar(CHAVE)

/**
 * Tem treino começado e não registrado?
 *
 * A aba Saúde usa isto para abrir direto na sessão: quem saiu no meio do
 * treino para olhar outra coisa volta para onde estava, e não para a lista.
 */
export const haTreinoEmAndamento = (): boolean => lerSessao() !== null

/** Quantas séries o modelo pede, para a tela já nascer com as linhas certas. */
function seriesIniciais(series: number | undefined): SerieFeita[] {
  const n = typeof series === 'number' && series > 0 && series < 20 ? series : 3
  return Array.from({ length: n }, () => ({}))
}

/**
 * As repetições que o modelo pede para a série `j`, para mostrar de dica.
 *
 * "4 × 15-12-10-8" dá 15, 12, 10, 8; "3 × 10" dá 10 em todas. Série a mais
 * que a prescrição repete o último número.
 */
/**
 * O que o exercício fechado mostra: se foi feito, e o que já está anotado.
 *
 * Fechado, o cartão responde uma pergunta só — "este eu já fiz?" —, que é o
 * que o dono pediu. O peso vem junto quando existe, porque é o que ele
 * confere antes de abrir para repetir a carga.
 */
export function resumoDoExercicio(e: { feito?: boolean; feitas: SerieFeita[] }): string {
  const cheias = e.feitas.filter(s => s.reps != null || s.carga != null)
  const cargas = [...new Set(cheias.map(s => s.carga).filter((c): c is number => c != null))]
  const peso = cargas.length === 1 ? `${cargas[0]} kg` : cargas.length > 1 ? `até ${Math.max(...cargas)} kg` : ''
  if (e.feito === true) return ['feito', cheias.length ? `${cheias.length}×` : '', peso].filter(Boolean).join(' · ')
  if (cheias.length === 0) return 'não feito'
  return [`${cheias.length} de ${e.feitas.length}`, peso].filter(Boolean).join(' · ')
}

export function repsAlvo(presc: string, j: number): string {
  const reps = presc.includes('×') ? presc.split('×').pop() ?? '' : ''
  const partes = reps.split(/[-/,]/).map(s => s.trim()).filter(Boolean)
  if (partes.length === 0) return ''
  return partes[Math.min(j, partes.length - 1)]
}

/**
 * Enter pula para o próximo campo: kg → reps → kg da série seguinte → …
 * No último, fecha o teclado.
 */
function irParaProximo(atual: HTMLInputElement): void {
  const todos = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-campo-treino]'))
  const prox = todos[todos.indexOf(atual) + 1]
  if (prox) { prox.focus(); prox.select() } else atual.blur()
}

const aoEnter = (ev: KeyboardEvent<HTMLInputElement>): void => {
  if (ev.key !== 'Enter') return
  ev.preventDefault()
  irParaProximo(ev.currentTarget)
}

export function Treino(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const modelos = treinos(p.cardapio.cardapio)
  const [sessao, setSessao] = useState<Sessao | null>(() => lerSessao())
  const [erro, setErro] = useState<string | null>(null)
  /** Qual exercício está com o nome aberto para editar. */
  const [renomeando, setRenomeando] = useState<number | null>(null)
  const [nomeNovo, setNomeNovo] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const tecladoAberto = useTecladoAberto()
  /**
   * Os exercícios encolhidos, pelo nome.
   *
   * Pelo nome e não pelo índice porque a lista se reordena: guardado por
   * índice, arrastar o terceiro para cima encolheria o que ficou no lugar
   * dele. Concluir encolhe sozinho — o que acabou sai da frente do que falta.
   */
  const [encolhidos, setEncolhidos] = useState<Set<string>>(() => new Set())
  /**
   * O arraste em andamento: de onde saiu, sobre qual posição está, e quanto o
   * dedo já andou — é o `quanto` que faz o cartão acompanhar a mão.
   */
  const [arrastando, setArrastando] = useState<{ de: number; sobre: number; y0: number; y: number } | null>(null)
  /** Os cartões na tela, para saber sobre qual posição o dedo passou. */
  const cartoes = useRef<(HTMLDivElement | null)[]>([])
  const pressionando = useRef<number | null>(null)
  /** Onde o dedo encostou, enquanto o arraste ainda não pegou. */
  const comecouEm = useRef<number | null>(null)
  const [nomeExercicio, setNomeExercicio] = useState('')
  /** Depois de adicionar um exercício, o foco vai para o kg da primeira série dele. */
  const focarExercicio = useRef<number | null>(null)

  // Toda mudança vai para o disco na hora. É barato, e é o que faz o treino
  // sobreviver a fechar o app no meio.
  useEffect(() => { gravarSessao(sessao) }, [sessao])

  useEffect(() => {
    const i = focarExercicio.current
    if (i === null) return
    focarExercicio.current = null
    document.querySelector<HTMLInputElement>(`input[data-campo-treino="${i}-0-carga"]`)?.focus()
  })

  /*
   * Enquanto arrasta, a página fica parada.
   *
   * No iPhone, `touch-action` e o `preventDefault` do pointermove não bastam:
   * quem decide rolar é o gesto de toque, e só um `touchmove` registrado como
   * NÃO passivo consegue recusá-lo. React registra os dele como passivos, por
   * isso este vai na mão, no documento, e só existe durante o arraste.
   */
  useEffect(() => {
    if (!arrastando) return
    const segurar = (e: TouchEvent): void => e.preventDefault()
    document.addEventListener('touchmove', segurar, { passive: false })
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('touchmove', segurar)
      document.body.style.overflow = overflowAntes
    }
  }, [arrastando])

  const comecar = (nome: string): void => {
    const m = modelos.find(x => x.nome === nome)
    if (!m) return
    setSessao({
      modelo: nome,
      itens: exerciciosDoTreino(m).map(e => ({
        nome: e.nome,
        presc: [e.series, e.reps].filter(Boolean).join(' × '),
        feitas: seriesIniciais(e.series)
      }))
    })
  }

  /* ---------- etapa 1: escolher ---------- */

  if (!sessao) {
    return (
      <div className="tema-treino">
        <Cabecalho titulo="Treino" />
        {modelos.length === 0 && (
          <Aviso titulo="Nenhum treino ainda">
            Cadastre um treino no Cortex — ele aparece aqui sozinho.
          </Aviso>
        )}
        <div className="bloco">
        <SubNavSaude atual="treino" irPara={p.irPara} />
          <div className="lista">
            {modelos.map(m => {
              const n = exerciciosDoTreino(m).length
              const grupo = typeof m.detalhe.grupo === 'string' ? m.detalhe.grupo : ''
              return (
                <button key={m.nome} className="cartao" type="button"
                  onClick={() => comecar(m.nome)}>
                  <span className="cartao-corpo">
                    <span className="cartao-topo">
                      <span className="cartao-nome">{m.nome}</span>
                      {grupo && <span className="etiqueta">{grupo}</span>}
                    </span>
                    <span className="cartao-meta">
                      {n} {n === 1 ? 'exercício' : 'exercícios'}
                    </span>
                  </span>
                  <svg className="seta" width="18" height="18" viewBox="0 0 18 18" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6.5 3.5 5.5 5.5-5.5 5.5" />
                  </svg>
                </button>
              )
            })}
            {/* O cardio mora aqui, junto dos treinos: a tela dele existia e
                nenhuma outra levava até ela (pedido do dono, 23/09/2026). */}
            <button className="cartao cartao-cardio" type="button" onClick={() => p.irPara('cardio')}>
              <span className="cartao-corpo">
                <span className="cartao-topo">
                  <span className="cartao-nome">Cardio</span>
                  <span className="etiqueta">esteira, escada, rua…</span>
                </span>
                <span className="cartao-meta">minutos, distância e pace</span>
              </span>
              <span className="mais-cardio" aria-hidden="true">+</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ---------- etapa 2: fazer ---------- */

  const mexer = (i: number, fn: (e: Exercicio) => Exercicio): void =>
    setSessao(s => (s ? { ...s, itens: s.itens.map((e, k) => (k === i ? fn(e) : e)) } : s))

  const mexerSerie = (i: number, j: number, campo: 'reps' | 'carga', valor: string): void =>
    mexer(i, e => ({
      ...e,
      feitas: e.feitas.map((s, k) => {
        if (k !== j) return s
        const n = Number(valor.replace(',', '.'))
        // Campo apagado volta a ser "não preenchido", e não zero: zero é uma
        // série de zero repetições, que não é a mesma coisa que branco.
        return { ...s, [campo]: valor.trim() === '' || !Number.isFinite(n) ? undefined : n }
      })
    }))

  const salvarNome = (i: number): void => {
    const nome = nomeNovo.trim()
    // Só nesta sessão: o modelo no Cortex não muda.
    if (nome) mexer(i, e => ({ ...e, nome }))
    setRenomeando(null)
  }

  const adicionarExercicio = (): void => {
    const nome = nomeExercicio.trim()
    if (!nome) return
    // Só nesta sessão: um exercício a mais hoje não redefine o treino de amanhã.
    focarExercicio.current = sessao.itens.length
    setSessao(s => (s ? {
      ...s, itens: [...s.itens, { nome, presc: '', feitas: seriesIniciais(3) }]
    } : s))
    setNomeExercicio('')
    setAdicionando(false)
  }

  /* ---------- encolher e arrastar ---------- */

  const encolhido = (nome: string): boolean => encolhidos.has(nome)

  const virarEncolhido = (nome: string): void =>
    setEncolhidos(atual => {
      const novo = new Set(atual)
      if (novo.has(nome)) novo.delete(nome)
      else novo.add(nome)
      return novo
    })

  /**
   * Segurar um exercício começa o arraste.
   *
   * Meio segundo de dedo parado: menos que isso e rolar a lista viraria
   * arrastar o exercício sem querer, que é o jeito de bagunçar o treino no
   * meio da série. Enquanto arrasta, todos encolhem — a lista inteira cabe na
   * tela e dá para ver para onde o exercício está indo.
   */
  const comecarArrasto = (i: number, ev: ReactPointerEvent<HTMLElement>): void => {
    // Campo e botão continuam sendo campo e botão: digitar o peso não pode
    // pegar o exercício no colo.
    const onde = ev.target as HTMLElement
    if (onde.closest('input, button, textarea')) return
    const alvo = ev.currentTarget
    const y = ev.clientY
    // Onde o dedo encostou: se ele deslizar antes de o arraste pegar, era
    // rolagem — e rolar a lista não pode virar mudar a ordem do treino.
    comecouEm.current = y
    pressionando.current = window.setTimeout(() => {
      pressionando.current = null
      // Em try: o dedo pode ter saído antes do fim da espera, e aí o
      // navegador recusa a captura -- recusa que mataria o resto do começo
      // do arraste.
      try { alvo.setPointerCapture?.(ev.pointerId) } catch { /* segue sem captura */ }
      // Uma batidinha no aparelho avisa que pegou — sem ela, o dedo parado
      // não tem como saber que o arraste começou.
      navigator.vibrate?.(15)
      setArrastando({ de: i, sobre: i, y0: y, y })
    }, 250)
  }

  const soltarPressao = (): void => {
    if (pressionando.current !== null) {
      clearTimeout(pressionando.current)
      pressionando.current = null
    }
    comecouEm.current = null
  }

  const arrastarAte = (ev: ReactPointerEvent<HTMLElement>): void => {
    if (!arrastando) {
      // Ainda esperando o arraste pegar: um deslize de mais de 8 px é a
      // pessoa rolando a lista, e aí a espera morre aqui.
      if (comecouEm.current !== null && Math.abs(ev.clientY - comecouEm.current) > 8) soltarPressao()
      return
    }
    ev.preventDefault()
    const y = ev.clientY
    const caixas: Caixa[] = cartoes.current
      .filter((el): el is HTMLDivElement => el !== null)
      .map(el => {
        const r = el.getBoundingClientRect()
        return { topo: r.top, altura: r.height }
      })
    setArrastando(a => (a ? { ...a, y, sobre: alvoDoArrasto(y, caixas) } : a))
  }

  const terminarArrasto = (): void => {
    soltarPressao()
    if (!arrastando) return
    const { de, sobre } = arrastando
    setArrastando(null)
    if (de !== sobre) {
      setSessao(st => (st ? { ...st, itens: mover(st.itens, de, sobre) } : st))
      navigator.vibrate?.(10)
    }
  }

  const concluidos = sessao.itens.filter(e => e.feito === true)
  // Ter o que registrar é outra pergunta: alguém pode anotar as séries todas e
  // sair sem apertar concluir em nenhum exercício, e esse treino não pode ser
  // perdido só por causa disso.
  const temDado = sessao.itens.some(e => e.feitas.some(s => s.reps != null || s.carga != null))

  /**
   * Sai do treino sem registrar nada.
   *
   * Confirma antes porque o que se perde é o que foi digitado até aqui, e não
   * há desfazer — mas só quando há algo a perder: quem abriu o treino errado e
   * ainda não anotou nada não precisa de uma pergunta no caminho.
   */
  const cancelar = (): void => {
    if (temDado && !window.confirm('Sair sem registrar? O que você anotou se perde.')) return
    encerrar()
  }

  /**
   * Fecha a sessão e sai — apagando do disco AGORA, não pelo efeito.
   *
   * O efeito que grava `sessao` roda em quem continua montado. Aqui a tela
   * muda no mesmo instante, o `Treino` desmonta, e o efeito do valor novo
   * (`null`) nunca chega a rodar: a sessão ficava no `localStorage` e voltava
   * inteira na próxima vez que alguém abrisse o treino.
   */
  const encerrar = (): void => {
    gravarSessao(null)
    setSessao(null)
    p.irPara('hoje')
  }

  const enviar = (): void => {
    try {
      const lista: ExercicioFeito[] = sessao.itens.map(e => ({ nome: e.nome, feitas: e.feitas }))
      // Corrigindo um treino antigo, o evento vai com o dia DELE: reescrever
      // o de ontem não pode criar um treino de hoje.
      const dia = sessao.dia ?? diaLocal()
      p.envio.registrar(eventoSessao(sessao.modelo, lista, dia))
      // E o histórico mostra na hora, sem esperar o computador acordar.
      guardarSessaoLocal(guardadoDoNavegador, {
        data: dia,
        modelo: sessao.modelo,
        exercicios: sessao.itens.map(e => ({
          nome: e.nome,
          series: null,
          reps: '',
          carga: null,
          feitas: e.feitas.map(x => ({ carga: x.carga ?? null, reps: x.reps ?? null }))
        }))
      })
      // A sessão sai do disco só depois que o evento entrou na fila — e a
      // fila já sabe esperar a rede voltar.
      encerrar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  const porcento = sessao.itens.length ? (concluidos.length / sessao.itens.length) * 100 : 0

  return (
    <div className="tema-treino">
      <Cabecalho
        titulo={sessao.modelo}
        direita={<span className="contador-serie">{concluidos.length}/{sessao.itens.length}</span>}
      />

      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}

      <div className="bloco">
        <SubNavSaude atual="treino" irPara={p.irPara} />
        <div className="progresso progresso-fluxo"><i style={{ width: `${porcento}%` }} /></div>

        <div className="lista lista-treino">
          {sessao.itens.map((e, i) => {
            const feito = e.feito === true
            // Arrastando, todos encolhem: a lista inteira cabe na tela e dá
            // para ver para onde o exercício está indo.
            const fechado = arrastando !== null || encolhido(e.nome)
            const puxado = arrastando?.de === i
            const cedendo = arrastando !== null && arrastando.sobre === i && !puxado
            return (
              <div
                className={`cartao-exercicio ${feito ? 'exercicio-feito' : ''}`}
                data-fechado={fechado}
                data-puxado={puxado}
                data-cedendo={cedendo}
                // O cartão puxado anda com o dedo — é o que faz parecer que a
                // mão está segurando ele, e não a lista piscando embaixo.
                style={puxado && arrastando ? { transform: `translateY(${arrastando.y - arrastando.y0}px)` } : undefined}
                ref={el => { cartoes.current[i] = el }}
                key={`${i}-${e.nome}`}
                // Segurar QUALQUER lugar do cartão pega o exercício (pedido do
                // dono); campo e botão continuam seus, ver `comecarArrasto`.
                onPointerDown={ev => comecarArrasto(i, ev)}
                onPointerMove={arrastarAte}
                onPointerUp={terminarArrasto}
                onPointerCancel={terminarArrasto}
              >
                <div className="exercicio-cabeca">
                  <span className="exercicio-punho" aria-hidden="true">⠿</span>
                  <span className="marcador">{feito ? '✓' : i + 1}</span>
                  <div className="exercicio-titulo">
                    {renomeando === i ? (
                      <input
                        className="exercicio-renomear"
                        autoFocus
                        enterKeyHint="done"
                        value={nomeNovo}
                        aria-label="nome do exercício"
                        onChange={ev => setNomeNovo(ev.target.value)}
                        onBlur={() => salvarNome(i)}
                        onKeyDown={ev => {
                          if (ev.key === 'Enter') salvarNome(i)
                          if (ev.key === 'Escape') setRenomeando(null)
                        }}
                      />
                    ) : (
                      <button type="button" className="exercicio-nome-botao"
                        aria-label={`renomear ${e.nome}`}
                        onClick={() => { setRenomeando(i); setNomeNovo(e.nome) }}>
                        <span className="exercicio-nome">{e.nome}</span>
                        <svg className="lapis" width="13" height="13" viewBox="0 0 16 16" fill="none"
                          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z" />
                        </svg>
                      </button>
                    )}
                    {e.presc && <span className="exercicio-presc">{e.presc}</span>}
                  </div>
                  {/* Encolhido, o cartão diz só se o exercício foi feito —
                      é o que o dono pediu para ver quando a lista está
                      fechada. */}
                  {fechado && <span className="exercicio-resumo">{resumoDoExercicio(e)}</span>}
                  {/* O lixo só no cartão aberto: fechado, o cabeçalho
                      responde "fiz ou não fiz", e um lixo ali ao lado do
                      ponto onde se segura para arrastar é acidente à espera. */}
                  {!fechado && (
                    <button
                      className="sumir" type="button"
                      aria-label={`tirar ${e.nome} deste treino`}
                      onClick={() => setSessao(st =>
                        st ? { ...st, itens: st.itens.filter((_, k) => k !== i) } : st)}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
                      </svg>
                    </button>
                  )}
                  <button
                    className="exercicio-abrir" type="button"
                    aria-expanded={!fechado}
                    aria-label={`${fechado ? 'Abrir' : 'Fechar'} ${e.nome}`}
                    onClick={() => virarEncolhido(e.nome)}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5.5 7 9 10.5 12.5 7" />
                    </svg>
                  </button>
                </div>

                {!fechado && <>
                <div className="series">
                  <div className="serie serie-rotulos" aria-hidden="true">
                    <span />
                    <span>kg</span>
                    <span />
                    <span>reps</span>
                    <span />
                  </div>
                  {e.feitas.map((s, j) => {
                    const cheia = s.carga != null && s.reps != null
                    return (
                      <div className="serie" key={j} data-cheia={cheia}>
                        <span className="serie-n">{j + 1}</span>
                        <input
                          className="serie-input"
                          type="text" inputMode="decimal" enterKeyHint="next"
                          data-campo-treino={`${i}-${j}-carga`}
                          placeholder={e.feitas[j - 1]?.carga != null ? String(e.feitas[j - 1].carga) : '0'}
                          aria-label={`peso da série ${j + 1} de ${e.nome}`}
                          value={s.carga ?? ''}
                          onChange={ev => mexerSerie(i, j, 'carga', ev.target.value)}
                          onKeyDown={aoEnter}
                        />
                        <span className="serie-x">×</span>
                        <input
                          className="serie-input"
                          type="text" inputMode="numeric" enterKeyHint="next"
                          data-campo-treino={`${i}-${j}-reps`}
                          placeholder={repsAlvo(e.presc, j) || '0'}
                          aria-label={`repetições da série ${j + 1} de ${e.nome}`}
                          value={s.reps ?? ''}
                          onChange={ev => mexerSerie(i, j, 'reps', ev.target.value)}
                          onKeyDown={aoEnter}
                        />
                        <button className="sumir sumir-serie" type="button"
                          aria-label={`tirar a série ${j + 1}`}
                          onClick={() => mexer(i, x => ({
                            ...x, feitas: x.feitas.filter((_, k) => k !== j)
                          }))}>−</button>
                      </div>
                    )
                  })}
                </div>

                <div className="linha-acoes">
                  <button className="btn-mini" type="button"
                    onClick={() => mexer(i, x => ({
                      // A série nova nasce com o peso da anterior: numa série a
                      // mais o peso quase sempre é o mesmo.
                      ...x,
                      feitas: [...x.feitas, { carga: x.feitas[x.feitas.length - 1]?.carga }]
                    }))}>
                    + série
                  </button>
                  {/* Concluir é um interruptor: apertou por engano, aperta de
                      novo. Nada é enviado aqui. */}
                  <button
                    className={`btn-mini ${feito ? 'btn-mini-ligado' : ''}`}
                    type="button"
                    aria-pressed={feito}
                    onClick={() => {
                      // Concluir fecha o cartão: o que acabou sai da frente
                      // do que falta. Desfazer abre de novo, para corrigir.
                      const virou = !feito
                      mexer(i, x => ({ ...x, feito: virou }))
                      setEncolhidos(atual => {
                        const novo = new Set(atual)
                        if (virou) novo.add(e.nome)
                        else novo.delete(e.nome)
                        return novo
                      })
                    }}
                  >
                    {feito ? '✓ concluído' : 'concluir'}
                  </button>
                </div>
                </>}
              </div>
            )
          })}

          {adicionando ? (
            <div className="cartao-exercicio novo-exercicio">
              <input
                className="exercicio-renomear"
                autoFocus
                enterKeyHint="done"
                placeholder="Nome do exercício"
                value={nomeExercicio}
                onChange={ev => setNomeExercicio(ev.target.value)}
                onKeyDown={ev => {
                  if (ev.key === 'Enter') adicionarExercicio()
                  if (ev.key === 'Escape') setAdicionando(false)
                }}
              />
              <div className="linha-acoes">
                <button className="btn-mini" type="button"
                  onClick={() => { setAdicionando(false); setNomeExercicio('') }}>
                  cancelar
                </button>
                <button className="btn-mini btn-mini-ligado" type="button"
                  disabled={!nomeExercicio.trim()} onClick={adicionarExercicio}>
                  adicionar
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-mini adicionar-exercicio" type="button"
              onClick={() => setAdicionando(true)}>
              + adicionar exercício
            </button>
          )}
        </div>
      </div>

      {/* Fora da árvore, e não `hidden`: o atributo perde para o
          `display:flex` da classe, e a barra continuava na frente dos botões
          de adicionar exercício. */}
      {!tecladoAberto && <div className="acao-fixa acao-fixa-par">
        {/* Cancelar mora aqui, ao lado de registrar: as duas saídas da sessão
            ficam juntas, que é onde a pessoa olha ao terminar. */}
        <Botao tipo="perigo" aoClicar={cancelar}>Cancelar</Botao>
        <Botao tipo="principal" aoClicar={enviar} desligado={!temDado}>
          Registrar treino
        </Botao>
      </div>}
    </div>
  )
}

