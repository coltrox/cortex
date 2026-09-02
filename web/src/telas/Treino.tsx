import { useEffect, useState } from 'react'
import { diaLocal, eventoSessao, type ExercicioFeito, type SerieFeita } from '../montar'
import { treinos, exerciciosDoTreino } from '../cardapio'
import { guardadoDoNavegador } from '../guardado'
import { Cabecalho, Botao, Aviso } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

const CHAVE = 'cortex.treino'

type Exercicio = { nome: string; presc: string; feitas: SerieFeita[] }
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

/** Quantas séries o modelo pede, para a tela já nascer com as linhas certas. */
function seriesIniciais(series: number | undefined): SerieFeita[] {
  const n = typeof series === 'number' && series > 0 && series < 20 ? series : 3
  return Array.from({ length: n }, () => ({}))
}

export function Treino(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const modelos = treinos(p.cardapio.cardapio)
  const [sessao, setSessao] = useState<Sessao | null>(() => lerSessao())
  const [erro, setErro] = useState<string | null>(null)

  // Toda mudança vai para o disco na hora. É barato, e é o que faz o treino
  // sobreviver a fechar o app no meio.
  useEffect(() => { gravarSessao(sessao) }, [sessao])

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
        <Cabecalho titulo="Treino" aoVoltar={() => p.irPara('hoje')} />
        {modelos.length === 0 && (
          <Aviso titulo="Nenhum treino ainda">
            Cadastre um treino no Cortex — ele aparece aqui sozinho.
          </Aviso>
        )}
        <div className="bloco">
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

  const cheias = sessao.itens.filter(e => e.feitas.some(s => s.reps != null || s.carga != null))

  const enviar = (): void => {
    try {
      const lista: ExercicioFeito[] = sessao.itens.map(e => ({ nome: e.nome, feitas: e.feitas }))
      p.envio.registrar(eventoSessao(sessao.modelo, lista, diaLocal()))
      // A sessão sai do disco só depois que o evento entrou na fila — e a
      // fila já sabe esperar a rede voltar.
      setSessao(null)
      p.irPara('hoje')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  const porcento = sessao.itens.length ? (cheias.length / sessao.itens.length) * 100 : 0

  return (
    <div className="tema-treino">
      <Cabecalho
        titulo={sessao.modelo}
        // Voltar não descarta o treino: ele fica no disco e a tela reabre onde
        // parou. Sair de vez é registrar, ou descartar lá embaixo.
        aoVoltar={() => p.irPara('hoje')}
        direita={<span className="contador-serie">{cheias.length}/{sessao.itens.length}</span>}
      />

      <div className="progresso"><i style={{ width: `${porcento}%` }} /></div>

      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}

      <div className="bloco">
        <div className="lista">
          {sessao.itens.map((e, i) => {
            const feito = e.feitas.some(s => s.reps != null || s.carga != null)
            return (
              <div className={`cartao-exercicio ${feito ? 'exercicio-feito' : ''}`}
                key={`${e.nome}-${i}`}>
                <div className="exercicio-cabeca">
                  <div className="exercicio-topo">
                    <span className="marcador">{feito ? '✓' : i + 1}</span>
                    <span>
                      <span className="exercicio-nome">{e.nome}</span>
                      {e.presc && <span className="exercicio-presc">{e.presc}</span>}
                    </span>
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
                  {e.feitas.map((s, j) => (
                    <div className="serie" key={j}>
                      <span className="serie-n">S{j + 1}</span>
                      <label className="serie-campo">
                        <input type="text" inputMode="numeric" placeholder="—"
                          aria-label={`repetições da série ${j + 1} de ${e.nome}`}
                          value={s.reps ?? ''}
                          onChange={ev => mexerSerie(i, j, 'reps', ev.target.value)} />
                        <span>reps</span>
                      </label>
                      <span className="serie-x">×</span>
                      <label className="serie-campo">
                        <input type="text" inputMode="decimal" placeholder="—"
                          aria-label={`peso da série ${j + 1} de ${e.nome}`}
                          value={s.carga ?? ''}
                          onChange={ev => mexerSerie(i, j, 'carga', ev.target.value)} />
                        <span>kg</span>
                      </label>
                      <button className="sumir" type="button"
                        aria-label={`tirar a série ${j + 1}`}
                        onClick={() => mexer(i, x => ({
                          ...x, feitas: x.feitas.filter((_, k) => k !== j)
                        }))}>−</button>
                    </div>
                  ))}
                </div>

                <div className="linha-acoes">
                  <button className="btn-mini" type="button"
                    onClick={() => mexer(i, x => ({
                      // A série nova nasce com o peso da anterior: numa série a
                      // mais o peso quase sempre é o mesmo, e redigitar o
                      // número é o tipo de trabalho que o app deve poupar.
                      ...x,
                      feitas: [...x.feitas, { carga: x.feitas[x.feitas.length - 1]?.carga }]
                    }))}>
                    + série
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="linha-acoes">
          <button className="btn-mini" type="button"
            onClick={() => {
              const nome = window.prompt('Qual exercício?')?.trim()
              if (!nome) return
              // Só nesta sessão: o modelo no Cortex não muda. Um exercício a
              // mais hoje não redefine o treino de amanhã.
              setSessao(s => (s ? {
                ...s, itens: [...s.itens, { nome, presc: '', feitas: seriesIniciais(3) }]
              } : s))
            }}>
            + exercício
          </button>
          <button className="btn-mini" type="button"
            onClick={() => {
              if (window.confirm('Apagar este treino sem registrar?')) {
                setSessao(null)
                p.irPara('hoje')
              }
            }}>
            descartar
          </button>
        </div>
      </div>

      <div className="acao-fixa">
        <Botao tipo="principal" aoClicar={enviar} desligado={cheias.length === 0}>
          Registrar treino
        </Botao>
      </div>
    </div>
  )
}
