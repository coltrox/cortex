import { useEffect, useState } from 'react'
import { DIAS_SEMANA, type Campo } from '../formularios'

/**
 * O formulário genérico.
 *
 * Desenha qualquer tipo a partir do schema em `formularios.tsx`. Só existe um
 * componente porque só existe um formato de nota: frontmatter mais corpo.
 * Acrescentar um tipo novo é acrescentar uma entrada na tabela — nunca um
 * componente novo aqui.
 */

type Props = {
  nome: string
  campos: Campo[]
  hoje: string
  inicial?: Record<string, unknown>
  /** Rótulo do botão principal. Muda para "Salvar alterações" na edição. */
  acao?: string
  aoSalvar: (valores: Record<string, unknown>) => void | Promise<void>
  aoFechar: () => void
}

const vazioDe = (c: Campo, hoje: string): unknown => {
  if (c.tipo === 'data') return hoje
  if (c.tipo === 'bool') return false
  if (c.tipo === 'select') return c.opcoes?.[0] ?? ''
  if (c.tipo === 'dias') return [...DIAS_SEMANA.map(d => d.id)]
  if (c.tipo === 'itens') return []
  return ''
}

export function ModalFormulario({ nome, campos, hoje, inicial, acao, aoSalvar, aoFechar }: Props) {
  const [v, setV] = useState<Record<string, unknown>>(() => {
    const base: Record<string, unknown> = { ...inicial }
    for (const c of campos) {
      if (base[c.k] !== undefined && base[c.k] !== null) continue
      base[c.k] = vazioDe(c, hoje)
    }
    return base
  })
  const [salvando, setSalvando] = useState(false)
  const [verSenha, setVerSenha] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aoFechar])

  const set = (k: string, valor: unknown): void => setV(o => ({ ...o, [k]: valor }))

  const faltando = campos.filter(c => c.obrigatorio && !String(v[c.k] ?? '').trim())
  const podeSalvar = faltando.length === 0 && !salvando

  const enviar = async (): Promise<void> => {
    if (!podeSalvar) return
    setSalvando(true)
    // Campo vazio não vira frontmatter: uma chave com string vazia polui a
    // nota e atrapalha a leitura fora do app. Na EDIÇÃO, porém, esvaziar um
    // campo precisa apagá-lo de verdade — por isso o `null`, que é o que
    // `note:patch` entende como "remova esta chave".
    const limpo: Record<string, unknown> = {}
    for (const c of campos) {
      const bruto = v[c.k]

      if (c.tipo === 'bool') { limpo[c.k] = bruto === true ? true : (inicial ? null : undefined); continue }

      if (c.tipo === 'dias' || c.tipo === 'itens') {
        const arr = Array.isArray(bruto) ? bruto : []
        const util = c.tipo === 'itens'
          ? arr.filter(i => i && typeof i === 'object' && Object.values(i).some(x => String(x ?? '').trim()))
          : arr
        limpo[c.k] = util.length ? util : (inicial ? null : undefined)
        continue
      }

      const s = String(bruto ?? '').trim()
      if (!s) { if (inicial) limpo[c.k] = null; continue }
      limpo[c.k] = c.tipo === 'numero' ? Number(s.replace(',', '.')) : s
    }
    for (const k of Object.keys(limpo)) if (limpo[k] === undefined) delete limpo[k]

    try { await aoSalvar(limpo) } finally { setSalvando(false) }
  }

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <form
        className="form"
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); void enviar() }}
      >
        <div className="form-topo">{nome}</div>

        <div className="form-corpo">
          {campos.map(c => (
            <label key={c.k} className="form-campo" data-largo={c.tipo === 'itens' || c.tipo === 'longo'}>
              <span className="form-rotulo">
                {c.rotulo}{c.obrigatorio && <i> obrigatório</i>}
              </span>

              {c.tipo === 'select' ? (
                <select value={String(v[c.k] ?? '')} onChange={e => set(c.k, e.target.value)}>
                  {c.opcoes?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>

              ) : c.tipo === 'bool' ? (
                <input
                  type="checkbox"
                  className="form-check"
                  checked={v[c.k] === true}
                  onChange={e => set(c.k, e.target.checked)}
                />

              ) : c.tipo === 'longo' ? (
                <textarea
                  rows={4}
                  value={String(v[c.k] ?? '')}
                  placeholder={c.placeholder}
                  onChange={e => set(c.k, e.target.value)}
                />

              ) : c.tipo === 'senha' ? (
                <span className="form-senha">
                  <input
                    type={verSenha ? 'text' : 'password'}
                    value={String(v[c.k] ?? '')}
                    autoComplete="off"
                    onChange={e => set(c.k, e.target.value)}
                  />
                  <button type="button" className="btn-fantasma" onClick={() => setVerSenha(s => !s)}>
                    {verSenha ? 'esconder' : 'ver'}
                  </button>
                </span>

              ) : c.tipo === 'dias' ? (
                <SeletorDias
                  valor={Array.isArray(v[c.k]) ? v[c.k] as string[] : []}
                  aoMudar={d => set(c.k, d)}
                />

              ) : c.tipo === 'itens' ? (
                <ListaItens
                  subcampos={c.subcampos ?? []}
                  valor={Array.isArray(v[c.k]) ? v[c.k] as Record<string, unknown>[] : []}
                  aoMudar={itens => set(c.k, itens)}
                />

              ) : (
                <input
                  type={c.tipo === 'data' ? 'date' : c.tipo === 'hora' ? 'time' : c.tipo === 'numero' ? 'number' : 'text'}
                  step={c.tipo === 'numero' ? 'any' : undefined}
                  value={String(v[c.k] ?? '')}
                  placeholder={c.placeholder}
                  onChange={e => set(c.k, e.target.value)}
                />
              )}

              {c.dica && <span className="form-dica">{c.dica}</span>}
            </label>
          ))}
        </div>

        <div className="form-rodape">
          {faltando.length > 0 && (
            <span className="form-aviso">Falta {faltando.map(f => f.rotulo.toLowerCase()).join(', ')}</span>
          )}
          <button type="button" className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="btn" disabled={!podeSalvar}>
            {salvando ? 'Salvando…' : (acao ?? 'Salvar')}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ---------- campos compostos ---------- */

function SeletorDias({ valor, aoMudar }: { valor: string[]; aoMudar: (d: string[]) => void }) {
  const todos = valor.length === DIAS_SEMANA.length
  return (
    <span className="dias">
      {DIAS_SEMANA.map(d => (
        <button
          key={d.id}
          type="button"
          className="dia-btn"
          aria-pressed={valor.includes(d.id)}
          title={d.id}
          onClick={() => aoMudar(valor.includes(d.id) ? valor.filter(x => x !== d.id) : [...valor, d.id])}
        >
          {d.nome}
        </button>
      ))}
      <button
        type="button"
        className="btn-fantasma"
        onClick={() => aoMudar(todos ? [] : DIAS_SEMANA.map(d => d.id))}
      >
        {todos ? 'nenhum' : 'todos'}
      </button>
    </span>
  )
}

/**
 * Lista editável de sub-objetos — exercícios de um treino, refeições de um
 * plano. Cada linha é um objeto; a ordem em tela é a ordem no arquivo.
 */
function ListaItens({ subcampos, valor, aoMudar }: {
  subcampos: Campo[]
  valor: Record<string, unknown>[]
  aoMudar: (itens: Record<string, unknown>[]) => void
}) {
  const mudar = (i: number, k: string, x: unknown): void =>
    aoMudar(valor.map((it, j) => (j === i ? { ...it, [k]: x } : it)))

  const mover = (i: number, delta: number): void => {
    const j = i + delta
    if (j < 0 || j >= valor.length) return
    const copia = [...valor]
    const guarda = copia[i]
    copia[i] = copia[j]
    copia[j] = guarda
    aoMudar(copia)
  }

  return (
    <span className="itens">
      {valor.length === 0 && <span className="form-dica">Nenhuma linha ainda.</span>}
      {valor.map((it, i) => (
        <span key={i} className="item-linha">
          {subcampos.map(sc => (
            <input
              key={sc.k}
              type={sc.tipo === 'numero' ? 'number' : sc.tipo === 'hora' ? 'time' : 'text'}
              step={sc.tipo === 'numero' ? 'any' : undefined}
              className={`item-campo campo-${sc.tipo}`}
              value={String(it[sc.k] ?? '')}
              placeholder={sc.placeholder ?? sc.rotulo}
              title={sc.rotulo}
              onChange={e => mudar(i, sc.k, e.target.value)}
            />
          ))}
          <button type="button" className="btn-icone" title="Subir" onClick={() => mover(i, -1)}>↑</button>
          <button type="button" className="btn-icone" title="Descer" onClick={() => mover(i, 1)}>↓</button>
          <button
            type="button" className="btn-icone perigo" title="Remover"
            onClick={() => aoMudar(valor.filter((_, j) => j !== i))}
          >×</button>
        </span>
      ))}
      <button type="button" className="btn-add" onClick={() => aoMudar([...valor, {}])}>
        + linha
      </button>
    </span>
  )
}
