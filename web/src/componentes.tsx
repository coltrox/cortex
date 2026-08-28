import type { ReactNode } from 'react'

export function Botao(p: {
  children: ReactNode
  aoClicar: () => void
  tipo?: 'principal' | 'comum'
  desligado?: boolean
}) {
  return (
    <button className={`botao ${p.tipo ?? 'comum'}`} onClick={p.aoClicar} disabled={p.desligado}>
      {p.children}
    </button>
  )
}

export function Campo(p: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  dica?: string
  linhas?: number
}) {
  return (
    <label className="campo">
      {p.rotulo && <span>{p.rotulo}</span>}
      {p.linhas
        ? <textarea rows={p.linhas} value={p.valor} placeholder={p.dica}
            onChange={e => p.aoMudar(e.target.value)} />
        : <input type="text" value={p.valor} placeholder={p.dica}
            onChange={e => p.aoMudar(e.target.value)} />}
    </label>
  )
}

/**
 * Campo de número que guarda texto.
 *
 * O estado é a string que a pessoa digitou, não um número: com `number` no
 * estado, apagar o campo para trocar o valor vira `NaN` e o cursor pula. A
 * conversão acontece só na hora de montar o evento.
 *
 * `inputMode="decimal"` é o que faz o teclado do celular abrir com números, e
 * a vírgula vira ponto porque é assim que o brasileiro digita.
 */
export function CampoNumero(p: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  dica?: string
}) {
  return (
    <label className="campo">
      <span>{p.rotulo}</span>
      <input
        type="text"
        inputMode="decimal"
        value={p.valor}
        placeholder={p.dica}
        onChange={e => p.aoMudar(e.target.value.replace(',', '.'))}
      />
    </label>
  )
}

export function Check(p: {
  rotulo: string
  detalhe?: string
  feito: boolean
  aoMarcar: () => void
}) {
  return (
    <button className={`check ${p.feito ? 'feito' : ''}`} onClick={p.aoMarcar} disabled={p.feito}>
      <span className="marca">{p.feito ? '✓' : ''}</span>
      <span className="texto">
        <strong>{p.rotulo}</strong>
        {p.detalhe && <small>{p.detalhe}</small>}
      </span>
    </button>
  )
}

export function Cabecalho(p: { titulo: string; aoVoltar?: () => void; direita?: ReactNode }) {
  return (
    <header className="cabecalho">
      {p.aoVoltar && <button className="voltar" onClick={p.aoVoltar} aria-label="voltar">‹</button>}
      <h1>{p.titulo}</h1>
      {p.direita !== undefined && <div className="direita">{p.direita}</div>}
    </header>
  )
}

export function Aviso(p: { children: ReactNode; grave?: boolean; aoFechar?: () => void }) {
  return (
    <div className={`aviso ${p.grave ? 'grave' : ''}`}>
      <span>{p.children}</span>
      {p.aoFechar && <button onClick={p.aoFechar} aria-label="fechar aviso">×</button>}
    </div>
  )
}
