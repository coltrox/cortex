import type { ReactNode } from 'react'
import type { NoteComCampos } from '../tipos'
import { diasAte, urgencia, rotuloPrazo } from '../subnav'

/**
 * Peças compartilhadas pelas lentes.
 *
 * Toda lente é uma leitura sobre as mesmas notas — nada aqui tem tabela nem
 * pasta própria. O que muda de lente para lente é o recorte e o formulário;
 * cartão, série, prazo e linha são os mesmos.
 */

export const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const moeda = (v: number): string => `R$ ${nf.format(v)}`

/**
 * Data ISO em forma legivel: `2026-11-08` vira `8 nov`.
 *
 * Cartao de numero mostra numero; uma data ISO ali e a maquina falando com
 * ela mesma. O ano so aparece quando nao e o corrente -- num painel do dia a
 * dia ele e ruido, mas escondê-lo sempre faria "8 nov" de 2027 parecer deste
 * ano.
 *
 * Monta a data com os campos separados, e nao `new Date(iso)`, que interpreta
 * a string como UTC e volta um dia atras em fuso negativo.
 */
export function dataCurta(iso: string | null | undefined, hoje?: string): string {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return iso
  const data = new Date(a, m - 1, d)
  if (Number.isNaN(data.getTime())) return iso
  const mes = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  const anoAtual = hoje ? Number(hoje.slice(0, 4)) : new Date().getFullYear()
  return a === anoAtual ? `${d} ${mes}` : `${d} ${mes} ${a}`
}

// Os helpers de leitura moram em `dados.ts`, que é testado. Reexportar daqui
// evita que existam duas versões de `num()` divergindo em silêncio.
export { num, txt, lista, textos } from '../dados'

export const porData = (a: NoteComCampos, b: NoteComCampos): number =>
  (a.date ?? '').localeCompare(b.date ?? '')

/** Tudo que uma lente pode pedir para o App fazer. */
export type Acoes = {
  aoAbrir: (p: string) => void
  /** Abre o formulário de criação; `inicial` pré-preenche campos (ex.: a data do dia clicado). */
  aoAdicionar: (tipo: string, inicial?: Record<string, unknown>) => void
  aoEditar: (nota: NoteComCampos) => void
  aoExcluir: (nota: NoteComCampos) => void
  aoLancar: (item: string, dia?: string) => void
  aoAlterar: (path: string, campos: Record<string, unknown>) => void
  /**
   * Grava no diário de um dia. É o que faz o registro diário resetar sozinho:
   * cada dia é um arquivo, então virar o dia começa do zero e o dia que passou
   * fica gravado do jeito que ficou.
   */
  aoMarcarDia: (dia: string, campos: Record<string, unknown>) => void
  /** Abre um modal especializado (registro de treino, mover nota, nova pasta). */
  aoModal: (id: string, ctx?: Record<string, unknown>) => void
}

export type PropsLente = {
  notas: NoteComCampos[]
  sub: string
  hoje: string
} & Acoes

/* ---------- blocos ---------- */

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="vazio">{children}</div>
}

export function Cartao({ rotulo, valor, nota, tom }: {
  rotulo: string; valor: string; nota?: string; tom?: 'entrada' | 'saida' | 'alerta'
}) {
  return (
    <div className="cartao" data-tom={tom}>
      <div className="cartao-rotulo">{rotulo}</div>
      <div className="cartao-valor">{valor}</div>
      {nota && <div className="cartao-nota">{nota}</div>}
    </div>
  )
}

export function Serie({ pontos, rotulo }: { pontos: { x: string; y: number }[]; rotulo: string }) {
  if (pontos.length < 2) return <Vazio>Faltam dados para desenhar {rotulo}.</Vazio>
  const ys = pontos.map(p => p.y)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const faixa = max - min || 1
  const larg = 100 / (pontos.length - 1)
  const d = pontos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * larg).toFixed(2)} ${(100 - ((p.y - min) / faixa) * 100).toFixed(2)}`)
    .join(' ')

  return (
    <div className="serie">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="serie-svg">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Eixo temporal: data à esquerda, data à direita. A faixa de valores fica
          no meio — min e max nas pontas fazia os números subirem com a linha descendo. */}
      <div className="serie-eixo">
        <span>{pontos[0].x}</span>
        <span>{nf.format(min)}–{nf.format(max)} {rotulo}</span>
        <span>{pontos[pontos.length - 1].x}</span>
      </div>
    </div>
  )
}

/** Contador de prazo. Esquenta conforme a data chega; esfria quando marcado feito. */
export function Prazo({ data, hoje, feito }: { data: string; hoje: string; feito: boolean }) {
  const d = diasAte(data, hoje)
  return (
    <span className="prazo" data-u={urgencia(d, feito)}>
      {feito ? 'feito' : rotuloPrazo(d)}
    </span>
  )
}

export function Barras({ itens, formato, aoClicar, ativo }: {
  itens: [string, number][]
  formato?: (v: number) => string
  aoClicar?: (rotulo: string) => void
  ativo?: string
}) {
  if (itens.length === 0) return <Vazio>Nada para mostrar.</Vazio>
  const ordenados = [...itens].sort((a, b) => b[1] - a[1])
  const maior = Math.max(...ordenados.map(i => i[1]), 0)
  return (
    <div className="barras">
      {ordenados.map(([r, v]) => (
        <div
          key={r}
          className="barra-linha"
          data-clicavel={!!aoClicar}
          data-ativo={ativo === r}
          onClick={aoClicar ? () => aoClicar(r) : undefined}
        >
          <span className="barra-rotulo">{r}</span>
          <span className="barra" style={{ width: `${maior ? (v / maior) * 100 : 0}%` }} />
          <span className="barra-valor">{formato ? formato(v) : v}</span>
        </div>
      ))}
    </div>
  )
}

/** Cabeçalho de seção com ação. O botão some quando a seção não cria nada. */
export function Secao({ nome, acao, aoClicar, direita }: {
  nome: string; acao?: string; aoClicar?: () => void; direita?: ReactNode
}) {
  return (
    <div className="secao-linha">
      <h3 className="secao">{nome}</h3>
      {direita}
      {acao && aoClicar && <button className="btn-add" onClick={aoClicar}>+ {acao}</button>}
    </div>
  )
}

/** Caixa de marcar. */
export function Check({ feito, aoAlternar, rotulo }: {
  feito: boolean; aoAlternar: () => void; rotulo?: string
}) {
  return (
    <span
      className="check"
      role="checkbox"
      aria-checked={feito}
      aria-label={rotulo}
      tabIndex={0}
      onClick={e => { e.stopPropagation(); aoAlternar() }}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); aoAlternar() } }}
    >
      {feito ? '✓' : ''}
    </span>
  )
}

export function Titulo({ nome, sub }: { nome: string; sub?: string }) {
  return (
    <>
      <h2 className="lente-titulo">{nome}</h2>
      {sub && <div className="lente-data">{sub}</div>}
    </>
  )
}

/**
 * Linha de lista.
 *
 * É `div` com `role="button"`, e não `<button>`, porque carrega os botões de
 * editar e excluir dentro — botão dentro de botão é HTML inválido e o
 * navegador desmonta a árvore de um jeito imprevisível.
 */
export function Linha({ children, aoAbrir, aoEditar, aoExcluir, titulo }: {
  children: ReactNode
  aoAbrir?: () => void
  aoEditar?: () => void
  aoExcluir?: () => void
  titulo?: string
}) {
  return (
    <div
      className="linha"
      role={aoAbrir ? 'button' : undefined}
      tabIndex={aoAbrir ? 0 : undefined}
      title={titulo}
      onClick={aoAbrir}
      onKeyDown={e => { if (aoAbrir && e.key === 'Enter') aoAbrir() }}
    >
      {children}
      {(aoEditar || aoExcluir) && (
        <span className="linha-acoes">
          {aoEditar && (
            <button className="btn-icone" title="Editar"
              onClick={e => { e.stopPropagation(); aoEditar() }}>✎</button>
          )}
          {aoExcluir && (
            <button className="btn-icone perigo" title="Excluir"
              onClick={e => { e.stopPropagation(); aoExcluir() }}>×</button>
          )}
        </span>
      )}
    </div>
  )
}

export function ListaNotas({
  notas, aoAbrir, aoEditar, aoExcluir, vazio, hoje, comPrazo, comTipo = true
}: {
  notas: NoteComCampos[]
  aoAbrir: (p: string) => void
  aoEditar?: (n: NoteComCampos) => void
  aoExcluir?: (n: NoteComCampos) => void
  vazio: string
  hoje?: string
  comPrazo?: boolean
  comTipo?: boolean
}) {
  if (notas.length === 0) return vazio ? <Vazio>{vazio}</Vazio> : null
  return (
    <div className="lista-notas">
      {notas.map(n => (
        <Linha
          key={n.path}
          aoAbrir={() => aoAbrir(n.path)}
          aoEditar={aoEditar ? () => aoEditar(n) : undefined}
          aoExcluir={aoExcluir ? () => aoExcluir(n) : undefined}
        >
          <span className="linha-data">{n.date ?? '—'}</span>
          <span className="linha-titulo">{n.title}</span>
          {comPrazo && hoje && n.date && (
            <Prazo data={n.date} hoje={hoje} feito={n.campos.feito === true || n.campos.revisada === true} />
          )}
          {comTipo && <span className="tipo" data-t={n.tipo}>{n.tipo}</span>}
        </Linha>
      ))}
    </div>
  )
}

/** Barra de progresso simples — usada por meta do porquinho e leitura de livro. */
export function Progresso({ feito, total, rotulo }: { feito: number; total: number; rotulo?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((feito / total) * 100)) : 0
  return (
    <div className="progresso">
      <div className="progresso-trilho"><span style={{ width: `${pct}%` }} /></div>
      <span className="progresso-num">{rotulo ?? `${pct}%`}</span>
    </div>
  )
}
