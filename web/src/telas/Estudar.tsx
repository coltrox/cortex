import { useState } from 'react'
import { Cabecalho, Botao } from '../componentes'
import type { UsoDoCardapio } from '../envio'
import type { Tela } from '../App'
import { rotuloData, tituloCurto } from '../rotulos'
import { CorpoDaNota } from './Nota'
import { ExerciciosDaNota } from './Exercicios'
import type { Questao } from '../exercicios'

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
    // As questões vêm do cardápio como dado; o celular as roda igual ao
    // computador, logo abaixo da teoria.
    const questoes = Array.isArray(escolhido.detalhe.questoes)
      ? (escolhido.detalhe.questoes as Questao[])
      : []
    return (
      <div>
        <Cabecalho titulo={escolhido.nome} aoVoltar={() => setAberto(null)} />
        <div className="bloco">
          <CorpoDaNota texto={corpo} />
          <ExerciciosDaNota questoes={questoes} />
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
        {/* Primeiro botão da tela, antes das abas: é o gesto de quem abriu o
            app na fila do ônibus e tem cinco minutos. Ler vem depois. */}
        <Botao tipo="principal" aoClicar={() => p.irPara('treinar')}>
          Treinar exercícios
        </Botao>

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
              <CartaoEstudo
                key={c.nome}
                titulo={c.nome}
                acima={txt(c.detalhe.materia)}
                etiquetas={[
                  c.detalhe.prioridade === true ? 'reta final' : '',
                  quantasQuestoes(c) > 0 ? `${quantasQuestoes(c)} exercícios` : ''
                ]}
                aoAbrir={() => setAberto(c.nome)}
              />
            ))
        )}

        {aba === 'redacoes' && (
          redacoes.length === 0
            ? <p className="vazio">Nenhuma redação ainda.</p>
            : redacoes.map(r => (
              <CartaoEstudo
                key={r.nome}
                titulo={tituloCurto(r.nome)}
                acima={rotuloData(txt(r.detalhe.data))}
                etiquetas={[txt(r.detalhe.status)]}
                aoAbrir={() => setAberto(r.nome)}
              />
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

/** Quantos exercícios o item traz — 0 quando não traz nenhum. */
function quantasQuestoes(i: { detalhe: Record<string, unknown> }): number {
  return Array.isArray(i.detalhe.questoes) ? i.detalhe.questoes.length : 0
}

function CartaoDia(p: {
  item: { nome: string; detalhe: Record<string, unknown> }
  hoje: string
  aoAbrir: () => void
}) {
  const data = txt(p.item.detalhe.data)
  const eHoje = data === p.hoje
  const questoes = quantasQuestoes(p.item)
  return (
    <CartaoEstudo
      destaque={eHoje}
      acima={rotuloData(data)}
      titulo={tituloCurto(p.item.nome)}
      etiquetas={[
        eHoje ? 'hoje' : '',
        p.item.detalhe.redacao === true ? 'redação' : '',
        questoes > 0 ? `${questoes} exercícios` : '',
        p.item.detalhe.feito === true ? '✓ feito' : ''
      ]}
      aoAbrir={p.aoAbrir}
    />
  )
}

/**
 * O cartão de uma coisa para estudar.
 *
 * Três linhas empilhadas, e não uma só: data em cima, título com a largura
 * inteira, etiquetas embaixo. Numa linha só, as etiquetas (que são pílulas de
 * 44 px, para caber o dedo) espremiam o título em 122 px dos 343 do cartão, e
 * "Matemática: razão, proporção e %" virava três linhas picadas.
 *
 * As etiquetas vêm como lista com buracos — `''` para o que não se aplica —
 * porque quem chama fica mais legível assim do que com quatro condicionais no
 * meio do JSX. O filtro é aqui.
 */
function CartaoEstudo(p: {
  acima?: string
  titulo: string
  etiquetas?: string[]
  destaque?: boolean
  aoAbrir: () => void
}) {
  const etiquetas = (p.etiquetas ?? []).filter(e => e !== '')
  return (
    <button
      type="button"
      className="cartao cartao-estudo"
      data-hoje={p.destaque || undefined}
      onClick={p.aoAbrir}
    >
      {p.acima && <span className="cartao-estudo-acima">{p.acima}</span>}
      <span className="cartao-estudo-titulo">{p.titulo}</span>
      {etiquetas.length > 0 && (
        <span className="cartao-estudo-etiquetas">
          {etiquetas.map(e => <span key={e} className="etiqueta">{e}</span>)}
        </span>
      )}
    </button>
  )
}
