import { useEffect, useState } from 'react'
import type { NoteComCampos } from '../tipos'
import { txt, lista } from './base'

/**
 * Registrar o treino de hoje.
 *
 * Ao escolher um modelo, os exercícios são COPIADOS para cá. Tudo que você
 * mexer aqui — trocar a carga, tirar um exercício porque a máquina estava
 * ocupada, acrescentar um que deu vontade — fica só nesta sessão. O modelo
 * segue intacto, que foi o pedido: "isso nao vai mudar a estrutura dele, vai
 * mudar so o que eu fiz ali na hora".
 */

type Exercicio = { nome: string; series: string; reps: string; carga: string }

type Props = {
  modelos: NoteComCampos[]
  /** Caminho do modelo pré-escolhido, quando vem do botão "Treinar este". */
  modeloInicial?: string
  hoje: string
  /** Sessões já registradas, para sugerir a carga da vez passada. */
  sessoes: NoteComCampos[]
  aoSalvar: (campos: Record<string, unknown>) => void | Promise<void>
  aoFechar: () => void
}

const vazio = (): Exercicio => ({ nome: '', series: '', reps: '', carga: '' })

export function RegistroTreino({
  modelos, modeloInicial, hoje, sessoes, aoSalvar, aoFechar
}: Props) {
  const [modeloPath, setModeloPath] = useState(modeloInicial ?? modelos[0]?.path ?? '')
  const [data, setData] = useState(hoje)
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [salvando, setSalvando] = useState(false)

  const modelo = modelos.find(m => m.path === modeloPath)

  // Trocar de modelo recarrega a lista. É um efeito, e não um cálculo, porque
  // depois de carregada a lista é editável — ela deixa de ser função do modelo.
  useEffect(() => {
    const alvo = modelos.find(m => m.path === modeloPath)
    if (!alvo) { setExercicios([vazio()]); return }

    // Cargas da última sessão feita a partir deste modelo: é o número que você
    // quer bater, e redigitá-lo do zero toda semana é atrito puro.
    const anteriores = sessoes
      .filter(s => txt(s.campos.modelo) === alvo.title)
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    const ultimas = new Map<string, string>()
    for (const e of lista(anteriores[anteriores.length - 1]?.campos.exercicios)) {
      if (txt(e.carga)) ultimas.set(txt(e.nome), txt(e.carga))
    }

    const exs = lista(alvo.campos.exercicios).map(e => ({
      nome: txt(e.nome),
      series: txt(e.series),
      reps: txt(e.reps),
      carga: ultimas.get(txt(e.nome)) ?? ''
    }))
    setExercicios(exs.length ? exs : [vazio()])
  }, [modeloPath, modelos, sessoes])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aoFechar])

  const mudar = (i: number, k: keyof Exercicio, valor: string): void =>
    setExercicios(es => es.map((e, j) => (j === i ? { ...e, [k]: valor } : e)))

  const feitos = exercicios.filter(e => e.nome.trim())

  const enviar = async (): Promise<void> => {
    if (salvando || feitos.length === 0) return
    setSalvando(true)
    const nome = modelo?.title ?? 'Treino livre'
    try {
      await aoSalvar({
        titulo: `${nome} — ${data}`,
        date: data,
        modelo: nome,
        exercicios: feitos.map(e => ({
          nome: e.nome.trim(),
          ...(e.series.trim() ? { series: Number(e.series) || e.series.trim() } : {}),
          ...(e.reps.trim() ? { reps: e.reps.trim() } : {}),
          ...(e.carga.trim() ? { carga: e.carga.trim() } : {})
        }))
      })
    } finally { setSalvando(false) }
  }

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <form
        className="form largo"
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); void enviar() }}
      >
        <div className="form-topo">Registrar treino</div>

        <div className="form-corpo">
          <div className="form-linha">
            <label className="form-campo">
              <span className="form-rotulo">Treino</span>
              <select value={modeloPath} onChange={e => setModeloPath(e.target.value)}>
                <option value="">Treino livre</option>
                {modelos.map(m => <option key={m.path} value={m.path}>{m.title}</option>)}
              </select>
            </label>
            <label className="form-campo">
              <span className="form-rotulo">Data</span>
              <input type="date" value={data} onChange={e => setData(e.target.value)} />
            </label>
          </div>

          <div className="treino-grade">
            <div className="treino-cab">
              <span>Exercício</span><span>Séries</span><span>Reps</span><span>Carga</span><span />
            </div>
            {exercicios.map((e, i) => (
              <div key={i} className="treino-linha">
                <input value={e.nome} placeholder="Supino reto"
                  onChange={ev => mudar(i, 'nome', ev.target.value)} />
                <input value={e.series} type="number" placeholder="4"
                  onChange={ev => mudar(i, 'series', ev.target.value)} />
                <input value={e.reps} placeholder="8-10"
                  onChange={ev => mudar(i, 'reps', ev.target.value)} />
                <input value={e.carga} placeholder="60 kg" className="carga"
                  onChange={ev => mudar(i, 'carga', ev.target.value)} />
                <button
                  type="button" className="btn-icone perigo" title="Tirar deste treino"
                  onClick={() => setExercicios(es => es.filter((_, j) => j !== i))}
                >×</button>
              </div>
            ))}
            <button type="button" className="btn-add"
              onClick={() => setExercicios(es => [...es, vazio()])}>
              + exercício
            </button>
          </div>

          <p className="form-dica">
            {modelo
              ? `Mexer aqui não altera o treino "${modelo.title}" — só registra o que você fez hoje.`
              : 'Sem modelo: monte o treino livre aqui mesmo.'}
          </p>
        </div>

        <div className="form-rodape">
          {feitos.length === 0 && <span className="form-aviso">Falta pelo menos um exercício</span>}
          <button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="btn" disabled={salvando || feitos.length === 0}>
            {salvando ? 'Salvando…' : `Registrar ${feitos.length} exercícios`}
          </button>
        </div>
      </form>
    </div>
  )
}
