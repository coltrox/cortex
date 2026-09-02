import type { ReactNode } from 'react'

/**
 * Os componentes compartilhados, na marcação do sistema de design.
 *
 * Nenhum deles decide cor: todos leem `--acento`, que vem de uma classe
 * `tema-*` na raiz da tela. Trocar o assunto de uma tela é trocar essa
 * classe, e nada aqui muda.
 */

export function Botao({ children, aoClicar, tipo = 'secundario', desligado }: {
  children: ReactNode
  aoClicar: () => void
  tipo?: 'principal' | 'secundario' | 'fantasma' | 'perigo'
  desligado?: boolean
}) {
  return (
    <button className={`btn btn-${tipo}`} onClick={aoClicar} disabled={desligado} type="button">
      {children}
    </button>
  )
}

export function Campo({ rotulo, valor, aoMudar, dica, linhas, tipo = 'text', grande }: {
  rotulo?: string
  valor: string
  aoMudar: (v: string) => void
  dica?: string
  linhas?: number
  tipo?: 'text' | 'date' | 'time'
  grande?: boolean
}) {
  return (
    <label className="campo">
      {rotulo && <span className="campo-rotulo">{rotulo}</span>}
      {linhas
        ? <textarea className="entrada" rows={linhas} value={valor} placeholder={dica}
            onChange={e => aoMudar(e.target.value)} />
        : <input className={`entrada ${grande ? 'entrada-grande' : ''}`} type={tipo}
            value={valor} placeholder={dica} onChange={e => aoMudar(e.target.value)} />}
    </label>
  )
}

/**
 * Campo de número que guarda texto.
 *
 * O estado é a string digitada, não um número: com `number` no estado, apagar
 * o campo para trocar o valor vira `NaN` e o cursor pula. A conversão
 * acontece só na hora de montar o evento.
 *
 * `inputMode="decimal"` abre o teclado numérico; a vírgula vira ponto porque
 * é assim que se digita em português.
 */
export function CampoNumero({ rotulo, valor, aoMudar, dica, grande }: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  dica?: string
  grande?: boolean
}) {
  return (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      <input
        className={`entrada ${grande ? 'entrada-grande' : ''}`}
        type="text"
        inputMode="decimal"
        value={valor}
        placeholder={dica}
        onChange={e => aoMudar(e.target.value.replace(',', '.'))}
      />
    </label>
  )
}

export function Check({ rotulo, detalhe, feito, aoMarcar }: {
  rotulo: string
  detalhe?: ReactNode
  feito: boolean
  aoMarcar: () => void
}) {
  return (
    <button
      className={`item ${feito ? 'item-feito' : ''}`}
      onClick={aoMarcar}
      disabled={feito}
      type="button"
      aria-pressed={feito}
    >
      <span className="caixa">✓</span>
      <span className="item-corpo">
        <span className="item-nome">{rotulo}</span>
        {detalhe && <span className="item-meta">{detalhe}</span>}
      </span>
    </button>
  )
}

/** Junta pedaços de detalhe com o separador do design, pulando os vazios. */
export function Detalhe({ partes }: { partes: unknown[] }) {
  const uteis = partes.filter(p => typeof p === 'string' && p !== '') as string[]
  return (
    <>
      {uteis.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="sep">·</span>}
          {p}
        </span>
      ))}
    </>
  )
}

export type TomEstado = 'ok' | 'fila' | 'envia'

export function Cabecalho({ titulo, aoVoltar, estado, direita }: {
  titulo: string
  aoVoltar?: () => void
  estado?: { texto: string; tom: TomEstado }
  direita?: ReactNode
}) {
  return (
    <header className="cabecalho">
      {aoVoltar && (
        <button className="voltar" onClick={aoVoltar} aria-label="voltar" type="button">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 4.5 7 11l6.5 6.5" />
          </svg>
        </button>
      )}
      <h1>{titulo}</h1>
      {estado && (
        <span className={`estado estado-${estado.tom}`}>
          <span className="ponto" />
          {estado.texto}
        </span>
      )}
      {direita}
    </header>
  )
}

export function Aviso({ children, tom = 'info', titulo, aoFechar }: {
  children: ReactNode
  tom?: 'info' | 'erro' | 'ok' | 'neutro'
  titulo?: string
  aoFechar?: () => void
}) {
  const classe = tom === 'info' ? '' : `aviso-${tom}`
  return (
    <div className={`aviso ${classe}`}>
      <span>
        {titulo && <b>{titulo}</b>}
        {children}
      </span>
      {aoFechar && (
        <button className="aviso-fechar" onClick={aoFechar} aria-label="fechar aviso" type="button">
          ×
        </button>
      )}
    </div>
  )
}

/** Rótulo de seção, com contagem opcional à direita. */
export function Secao({ nome, contagem }: { nome: string; contagem?: string }) {
  return (
    <div className="rotulo-secao">
      <span>{nome}</span>
      {contagem && <span className="contagem">{contagem}</span>}
    </div>
  )
}

export function Chips({ opcoes, escolhida, aoEscolher }: {
  opcoes: string[]
  escolhida: string
  aoEscolher: (o: string) => void
}) {
  return (
    <div className="chips">
      {opcoes.map(o => (
        <button
          key={o}
          className={`chip ${o === escolhida ? 'chip-ligado' : ''}`}
          onClick={() => aoEscolher(o)}
          type="button"
          aria-pressed={o === escolhida}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
