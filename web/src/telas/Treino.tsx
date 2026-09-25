import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { diaLocal, eventoSessao, type ExercicioFeito, type SerieFeita } from '../montar'
import { treinos, exerciciosDoTreino } from '../cardapio'
import { guardadoDoNavegador } from '../guardado'
import { Cabecalho, Botao, Aviso } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'
import { SubNavSaude } from './Saude'

const CHAVE = 'cortex.treino'

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
type Sessao = { modelo: string; itens: Exercicio[] }

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
      p.envio.registrar(eventoSessao(sessao.modelo, lista, diaLocal()))
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
            return (
              <div className={`cartao-exercicio ${feito ? 'exercicio-feito' : ''}`}
                key={`${i}-${e.nome}`}>
                <div className="exercicio-cabeca">
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
                  <button
                    className="sumir" type="button"
                    aria-label={`tirar ${e.nome} deste treino`}
                    onClick={() => setSessao(s =>
                      s ? { ...s, itens: s.itens.filter((_, k) => k !== i) } : s)}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
                    </svg>
                  </button>
                </div>

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
                    onClick={() => mexer(i, x => ({ ...x, feito: !x.feito }))}
                  >
                    {feito ? '✓ concluído' : 'concluir'}
                  </button>
                </div>
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

      <div className="acao-fixa acao-fixa-par">
        {/* Cancelar mora aqui, ao lado de registrar: as duas saídas da sessão
            ficam juntas, que é onde a pessoa olha ao terminar. */}
        <Botao tipo="perigo" aoClicar={cancelar}>Cancelar</Botao>
        <Botao tipo="principal" aoClicar={enviar} desligado={!temDado}>
          Registrar treino
        </Botao>
      </div>
    </div>
  )
}

