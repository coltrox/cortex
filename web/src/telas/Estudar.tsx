import { useRef, useState } from 'react'
import { Cabecalho, Botao } from '../componentes'
import type { UsoDoCardapio } from '../envio'
import type { Tela } from '../App'
import { rotuloData, tituloCurto, acharPorNome, daquiPraFrente, proximaAba, ordemDeEstudo } from '../rotulos'
import { CorpoDaNota } from './Nota'
import { ExerciciosDaNota } from './Exercicios'
import type { Questao } from '../exercicios'
import { EscreverRedacao } from './EscreverRedacao'
import type { useEnvio } from '../envio'

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
  envio: ReturnType<typeof useEnvio>
  hoje: string
  irPara: (t: Tela) => void
}) {
  const ABAS = ['plano', 'conteudos', 'redacoes'] as const
  const [aba, setAba] = useState<'plano' | 'conteudos' | 'redacoes'>('plano')

  /*
   * O CAMINHO andado, e não só a nota aberta.
   *
   * Clicar num link dentro de uma nota abre outra nota; voltar tem de cair na
   * anterior, e não pular para a lista. Antes a tela guardava um nome só, e
   * entrar em "Frases e conectivos" a partir do plano do dia e voltar jogava
   * direto para Estudar — perdendo o lugar.
   */
  const [pilha, setPilha] = useState<string[]>([])
  /* Marcado agora, antes de o Cortex devolver.
   *
   * O `feito` só volta no cardápio quando o computador republicar — o que
   * pode levar minutos. Sem esta marca, o botão parecia não ter funcionado e
   * ele clicaria de novo. */
  const [concluido, setConcluido] = useState<Record<string, boolean>>({})
  const aberto = pilha.length > 0 ? pilha[pilha.length - 1] : null
  const abrirNota = (nome: string): void => { setPilha(p => [...p, nome]); window.scrollTo(0, 0) }

  /*
   * Arrastar de lado troca de aba.
   *
   * Só conta o gesto claramente HORIZONTAL — mais de 60 px para o lado e pelo
   * menos o dobro do movimento vertical. Sem essa segunda condição, rolar a
   * lista com o dedo um pouco torto trocaria de aba no meio da leitura.
   */
  const gesto = useRef<{ x: number; y: number } | null>(null)
  const aoTocar = (e: React.TouchEvent): void => {
    const t = e.touches[0]
    gesto.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  const aoSoltarToque = (e: React.TouchEvent): void => {
    const inicio = gesto.current
    const t = e.changedTouches[0]
    gesto.current = null
    if (!inicio || !t) return
    const dx = t.clientX - inicio.x
    const dy = t.clientY - inicio.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return
    const destino = proximaAba(ABAS, aba, dx < 0 ? 1 : -1)
    if (destino !== aba) { setAba(destino); setPilha([]) }
  }
  const voltarUm = (): void => { setPilha(p => p.slice(0, -1)); window.scrollTo(0, 0) }

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

  /* Atrasada e não escrita vem PRIMEIRO, depois hoje e o futuro, e por fim
     as entregues. A folha de ontem que ficou em branco é a mais urgente da
     lista — e era justamente ela que ficava no fim. */
  const redacoes = ordemDeEstudo(
    itens.filter(i => i.especie === 'redacao'),
    p.hoje,
    i => txt(i.detalhe.data),
    i => {
      const st = txt(i.detalhe.status)
      return st === 'aguardando correção' || st === 'corrigida'
    }
  )

  const lista = aba === 'plano' ? dias : aba === 'conteudos' ? conteudos : redacoes
  /* A nota aberta é procurada em TODO o cardápio, e não só na aba da vez: um
     link dentro do plano do dia aponta para uma estrutura de redação ou um
     repertório, que moram em outra tela. Antes, clicar nele não achava nada. */
  const escolhido = itens.find(i => i.nome === aberto) ?? lista.find(i => i.nome === aberto)

  if (escolhido) {
    const corpo = txt(escolhido.detalhe.corpo)
    // As questões vêm do cardápio como dado; o celular as roda igual ao
    // computador, logo abaixo da teoria.
    const questoes = Array.isArray(escolhido.detalhe.questoes)
      ? (escolhido.detalhe.questoes as Questao[])
      : []
    return (
      <div>
        <Cabecalho titulo={escolhido.nome} aoVoltar={() => voltarUm()} />
        <div className="bloco">
          {/* Redação é para ESCREVER, não para ler: a folha abre direto no
              campo de texto. As outras notas abrem no conteúdo. */}
          {escolhido.especie === 'redacao' ? (
            <EscreverRedacao
              item={escolhido}
              envio={p.envio}
              aoVoltar={() => voltarUm()}
            />
          ) : (
            <>
              <CorpoDaNota
                texto={corpo}
                nota={escolhido.nome}
                aoAbrirNota={nome => {
                  const alvo = acharPorNome(itens, nome)
                  if (alvo) abrirNota(alvo.nome)
                }}
              />
              <ExerciciosDaNota questoes={questoes} />

              {/* Concluir o dia: o mesmo gesto de riscar a linha no papel,
                  e o único jeito de o Cortex saber, em casa, o que foi feito
                  na rua. Vai como evento e cai no `feito` da nota. */}
              {escolhido.especie === 'plano-dia' && (
                <div className="dia-concluir">
                  {escolhido.detalhe.feito === true ? (
                    <p className="treino-dica">✓ Dia marcado como concluído.</p>
                  ) : (
                    <Botao
                      tipo="secundario"
                      aoClicar={() => {
                        const caminho = txt(escolhido.detalhe.path)
                        if (!caminho) return
                        p.envio.registrar({
                          tipo: 'nota_escrita',
                          dia: txt(escolhido.detalhe.data) || p.hoje,
                          dados: { path: caminho, tipo: 'plano-dia', campos: { feito: true } }
                        })
                        setConcluido(c => ({ ...c, [escolhido.nome]: true }))
                      }}
                    >
                      {concluido[escolhido.nome] ? '✓ Concluído' : 'Marcar o dia como concluído'}
                    </Botao>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  /* O que vem pela frente primeiro: na reta final, rolar a tela para achar o
     dia de hoje é atrito puro. */
  const proximos = dias.filter(d => txt(d.detalhe.data) >= p.hoje)
  const passados = dias.filter(d => txt(d.detalhe.data) < p.hoje).reverse()

  return (
    <div>
      {/* Sem seta de voltar: Estudos e uma aba de primeiro nivel, como
          Saude e Notas. Quem troca de area e a barra de baixo — uma seta
          aqui sugeriria que esta tela esta DENTRO do Hoje. */}
      <Cabecalho titulo="Estudar" />
      <div
        className="bloco"
        onTouchStart={aoTocar}
        onTouchEnd={aoSoltarToque}
      >
        {/* Primeiro botão da tela, antes das abas: é o gesto de quem abriu o
            app na fila do ônibus e tem cinco minutos. Ler vem depois. */}
        <Botao tipo="principal" aoClicar={() => p.irPara('treinar')}>
          Treinar exercícios
        </Botao>

        <div className="abas-redacao">
          <button type="button" className="btn-aba" data-ativa={aba === 'plano'}
            onClick={() => { setAba('plano'); setPilha([]) }}>Plano</button>
          <button type="button" className="btn-aba" data-ativa={aba === 'conteudos'}
            onClick={() => { setAba('conteudos'); setPilha([]) }}>Conteúdos</button>
          <button type="button" className="btn-aba" data-ativa={aba === 'redacoes'}
            onClick={() => { setAba('redacoes'); setPilha([]) }}>Redações</button>
        </div>

        {aba === 'plano' && (
          dias.length === 0
            ? <p className="vazio">Nenhum dia planejado. O cronograma é montado no Cortex, no computador.</p>
            : (
              <>
                {proximos.map(d => (
                  <CartaoDia key={d.nome} item={d} hoje={p.hoje} aoAbrir={() => abrirNota(d.nome)} />
                ))}
                {passados.length > 0 && (
                  <>
                    <h2 className="titulo-grupo">Dias que passaram</h2>
                    {passados.map(d => (
                      <CartaoDia key={d.nome} item={d} hoje={p.hoje} aoAbrir={() => abrirNota(d.nome)} />
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
                aoAbrir={() => abrirNota(c.nome)}
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
                aoAbrir={() => abrirNota(r.nome)}
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
