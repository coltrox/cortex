import { useState } from 'react'
import { Cabecalho, Botao } from '../componentes'
import type { UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

/**
 * Estudar fora de casa.
 *
 * O celular já sabia REGISTRAR estudo; esta tela é o outro lado — o material
 * em si. O plano do dia, os resumos de conteúdo e as redações já escritas:
 * tudo que mora no vault e antes só existia na tela do computador.
 *
 * Três abas porque são três perguntas diferentes, e na reta final elas se
 * alternam: "o que eu faço hoje", "como era mesmo essa fórmula" e "o que eu
 * escrevi na última redação".
 *
 * Só leitura. O texto de verdade mora no vault, e um editor aqui criaria uma
 * segunda fonte da mesma coisa — a mesma regra do resto do cardápio.
 */
export function Estudar(p: {
  cardapio: UsoDoCardapio
  hoje: string
  irPara: (t: Tela) => void
}) {
  const [aba, setAba] = useState<'plano' | 'conteudos' | 'redacoes'>('plano')
  const [aberto, setAberto] = useState<string | null>(null)

  const itens = p.cardapio.cardapio.itens
  const dias = itens
    .filter(i => i.especie === 'plano-dia')
    .sort((a, b) => txt(a.detalhe.data).localeCompare(txt(b.detalhe.data)))

  /*
   * A ordem dos conteúdos é a mesma do computador: reta final primeiro,
   * depois o que ele domina menos. Ordem diferente em cada aparelho faria a
   * mesma lista parecer duas listas.
   */
  const conteudos = [...itens.filter(i => i.especie === 'materia')].sort((a, b) => {
    const pa = a.detalhe.prioridade === true ? 0 : 1
    const pb = b.detalhe.prioridade === true ? 0 : 1
    if (pa !== pb) return pa - pb
    return (Number(a.detalhe.dominio) || 3) - (Number(b.detalhe.dominio) || 3)
  })

  const redacoes = itens
    .filter(i => i.especie === 'redacao')
    .sort((a, b) => txt(b.detalhe.data).localeCompare(txt(a.detalhe.data)))

  const lista = aba === 'plano' ? dias : aba === 'conteudos' ? conteudos : redacoes
  const escolhido = lista.find(i => i.nome === aberto)

  if (escolhido) {
    const corpo = txt(escolhido.detalhe.corpo)
    return (
      <div>
        <Cabecalho titulo={escolhido.nome} aoVoltar={() => setAberto(null)} />
        <div className="bloco">
          <pre className="redacao-corpo">{corpo || 'Esta nota ainda não tem conteúdo.'}</pre>
        </div>
      </div>
    )
  }

  /* O que vem pela frente primeiro: na reta final, rolar a tela para achar o
     dia de hoje é atrito puro. */
  const daquiPraFrente = dias.filter(d => txt(d.detalhe.data) >= p.hoje)
  const passados = dias.filter(d => txt(d.detalhe.data) < p.hoje).reverse()

  return (
    <div>
      <Cabecalho titulo="Estudar" aoVoltar={() => p.irPara('hoje')} />
      <div className="bloco">
        <div className="abas-redacao">
          <button type="button" className="btn-aba" data-ativa={aba === 'plano'}
            onClick={() => { setAba('plano'); setAberto(null) }}>Plano</button>
          <button type="button" className="btn-aba" data-ativa={aba === 'conteudos'}
            onClick={() => { setAba('conteudos'); setAberto(null) }}>Conteúdos</button>
          <button type="button" className="btn-aba" data-ativa={aba === 'redacoes'}
            onClick={() => { setAba('redacoes'); setAberto(null) }}>Redações</button>
        </div>

        {aba === 'plano' && (
          dias.length === 0
            ? <p className="vazio">Nenhum dia planejado. O cronograma é montado no Cortex, no computador.</p>
            : (
              <>
                {daquiPraFrente.map(d => (
                  <CartaoDia key={d.nome} item={d} hoje={p.hoje} aoAbrir={() => setAberto(d.nome)} />
                ))}
                {passados.length > 0 && (
                  <>
                    <h2 className="titulo-grupo">Dias que passaram</h2>
                    {passados.map(d => (
                      <CartaoDia key={d.nome} item={d} hoje={p.hoje} aoAbrir={() => setAberto(d.nome)} />
                    ))}
                  </>
                )}
              </>
            )
        )}

        {aba === 'conteudos' && (
          conteudos.length === 0
            ? <p className="vazio">Nenhum conteúdo. Eles são escritos no Cortex, no computador.</p>
            : conteudos.map(c => (
              <button key={c.nome} type="button" className="cartao cartao-redacao"
                onClick={() => setAberto(c.nome)}>
                <span className="redacao-nome">{c.nome}</span>
                {txt(c.detalhe.materia) && <span className="redacao-quando">{txt(c.detalhe.materia)}</span>}
                <span className="seta">›</span>
              </button>
            ))
        )}

        {aba === 'redacoes' && (
          redacoes.length === 0
            ? <p className="vazio">Nenhuma redação ainda.</p>
            : redacoes.map(r => (
              <button key={r.nome} type="button" className="cartao cartao-redacao"
                onClick={() => setAberto(r.nome)}>
                <span className="redacao-nome">{r.nome}</span>
                {txt(r.detalhe.status) && <span className="redacao-quando">{txt(r.detalhe.status)}</span>}
                <span className="seta">›</span>
              </button>
            ))
        )}

        <Botao tipo="secundario" aoClicar={() => p.irPara('estudo')}>
          Registrar uma sessão de estudo
        </Botao>
      </div>
    </div>
  )
}

/** Texto de um campo do detalhe, que é `unknown` por vir da nuvem. */
function txt(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function CartaoDia(p: {
  item: { nome: string; detalhe: Record<string, unknown> }
  hoje: string
  aoAbrir: () => void
}) {
  const data = txt(p.item.detalhe.data)
  const eHoje = data === p.hoje
  return (
    <button type="button" className="cartao cartao-redacao" data-hoje={eHoje || undefined}
      onClick={p.aoAbrir}>
      <span className="redacao-nome">{p.item.nome}</span>
      {eHoje && <span className="chip">hoje</span>}
      {p.item.detalhe.redacao === true && <span className="chip">redação</span>}
      {p.item.detalhe.feito === true && <span className="redacao-quando">✓</span>}
      <span className="seta">›</span>
    </button>
  )
}
