import { useEffect, useRef, useState, type ReactNode } from 'react'

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

/**
 * O item marcável, com um segundo botão à direita quando `acao` vem.
 *
 * Um botão dentro de outro é HTML inválido, e no dedo é pior do que inválido:
 * o toque fica ambíguo entre marcar e abrir. Então com `acao` o cartão deixa
 * de ser o próprio botão e passa a ser o contêiner — `.item-par` — com dois
 * botões irmãos dentro dele. Visualmente é o mesmo cartão de sempre; a
 * moldura só mudou de dono.
 *
 * Sem `acao` nada disso acontece: o item continua sendo um `<button>` só, que
 * é o caso da maioria das linhas.
 */
export function Check({ rotulo, detalhe, feito, aoMarcar, acao }: {
  rotulo: string
  detalhe?: ReactNode
  feito: boolean
  aoMarcar: () => void
  /** Botão à direita, dentro do mesmo cartão. */
  acao?: ReactNode
}) {
  const marcar = (
    <button
      // Com `acao`, quem fica verde é o cartão de fora: `item-feito` carrega
      // fundo e borda, e aqui dentro não há mais nem um nem outro. Os
      // seletores que dependem dele (`.item-feito .caixa`, `.item-feito
      // .item-nome`) continuam valendo — são de descendente.
      className={`item ${feito && !acao ? 'item-feito' : ''}`}
      onClick={aoMarcar}
      // Sem `disabled` quando feito: é o mesmo botão que desmarca. Antes,
      // marcar sem querer não tinha volta pelo celular — o item ficava morto
      // até a virada do dia.
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

  if (!acao) return marcar
  return (
    <div className={`item-par ${feito ? 'item-feito' : ''}`}>
      {marcar}
      {acao}
    </div>
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
export function Secao({ nome, contagem, acao }: {
  nome: string
  contagem?: string
  /** Um link à direita do título — "ver tudo", "ajustar". */
  acao?: ReactNode
}) {
  return (
    <div className="rotulo-secao">
      <span>{nome}</span>
      {contagem && <span className="contagem">{contagem}</span>}
      {acao}
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

/**
 * Escolha em cascata.
 *
 * Usa o `<select>` nativo porque no celular ele abre a roda do sistema — que
 * é maior, rola com o polegar e a pessoa já sabe usar. Uma lista desenhada
 * aqui ficaria melhor numa captura de tela e pior na mão.
 */
export function Selecao({ rotulo, opcoes, valor, aoMudar }: {
  rotulo: string
  opcoes: string[]
  valor: string
  aoMudar: (v: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  /*
   * Fecha ao tocar fora, e ao apertar Esc.
   *
   * Sem isto a lista ficaria aberta enquanto a pessoa rolasse a tela, por cima
   * do que ela foi ler — e o único jeito de fechar seria escolher alguma
   * coisa, que é justamente o que ela pode não querer fazer.
   */
  useEffect(() => {
    if (!aberto) return
    const fora = (e: Event): void => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    const tecla = (e: KeyboardEvent): void => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  return (
    <div className="campo" ref={caixa}>
      <span className="campo-rotulo">{rotulo}</span>
      {/*
        * Lista própria, e não `<select>`.
        *
        * A lista de um `select` é desenhada pelo SISTEMA: ela ignora fonte,
        * cor, raio e tema do app, e no Android abre branca com a faixa azul
        * do sistema sobre um app escuro. Não há CSS que alcance aquilo — o
        * único jeito de ela parecer deste app é ela ser deste app.
        *
        * O que se perde é a roda nativa do iPhone. O que se ganha é que as
        * opções tenham a mesma cara do resto da tela, que é o pedido.
        */}
      <button
        type="button"
        className={`selecao-botao ${aberto ? 'selecao-aberta' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto(v => !v)}
      >
        <span>{valor}</span>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.5 7 9 10.5 12.5 7" />
        </svg>
      </button>

      {aberto && (
        <ul className="selecao-lista" role="listbox" aria-label={rotulo}>
          {opcoes.map(o => (
            <li key={o}>
              <button
                type="button"
                role="option"
                aria-selected={o === valor}
                className={`selecao-opcao ${o === valor ? 'selecao-escolhida' : ''}`}
                onClick={() => { aoMudar(o); setAberto(false) }}
              >
                {o}
                {o === valor && <i aria-hidden="true">✓</i>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
