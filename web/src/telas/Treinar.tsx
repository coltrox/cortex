import { useMemo, useState } from 'react'
import { Cabecalho, Botao } from '../componentes'
import type { UsoDoCardapio } from '../envio'
import type { Tela } from '../App'
import { guardadoDoNavegador } from '../guardado'
import {
  cartasDoCardapio, materiasDo, filtrarPorMateria, baralho, registrar,
  placarDoDia, pendentes, lerHistorico, gravarHistorico, type Carta
} from '../exercicios'

/**
 * Treinar na rua.
 *
 * O pedido foi este, ao pé da letra: "tô sem nada pra fazer, tô na rua,
 * esperando o ônibus, e aí eu entro pra fazer um exercício pra ver se eu vou
 * acertando". Por isso a tela não tem começo nem fim — não existe "iniciar
 * simulado" nem tela de resultado final. Abre e já tem uma questão no ar;
 * fecha quando o ônibus chega.
 *
 * A correção é IMEDIATA, e é nisso que ela difere do simulado: marcou, já sabe
 * se acertou e já lê por quê. É o que faz disto um flashcard, e não uma prova.
 *
 * Tudo vem do cardápio guardado no aparelho, então funciona sem sinal. O
 * histórico também é local: ele decide qual questão volta antes, e some se o
 * navegador apagar os dados do site — aceitável, porque o material de verdade
 * mora no vault.
 */
export function Treinar(p: {
  cardapio: UsoDoCardapio
  hoje: string
  irPara: (t: Tela) => void
}) {
  const [historico, setHistorico] = useState(() => lerHistorico(guardadoDoNavegador))
  const [materia, setMateria] = useState<string | null>(null)
  const [marcada, setMarcada] = useState<string | null>(null)
  /* Quantas cartas já passaram. Serve para forçar o próximo sorteio quando o
     histórico não distingue duas cartas. */
  const [rodada, setRodada] = useState(0)

  const todas = useMemo(
    () => cartasDoCardapio(p.cardapio.cardapio.itens),
    [p.cardapio.cardapio.itens]
  )
  const materias = useMemo(() => materiasDo(todas), [todas])

  /*
   * A carta da vez.
   *
   * O baralho é refeito a cada rodada de propósito: responder muda o
   * histórico, e o histórico é o que decide a ordem. Refazer é barato — são
   * dezenas de cartas, não milhares — e evita guardar uma fila que envelhece.
   */
  const atual: Carta | undefined = useMemo(
    () => baralho(filtrarPorMateria(todas, materia), historico)[0],
    [todas, materia, historico, rodada]
  )

  const placar = placarDoDia(historico, p.hoje)
  const aRever = pendentes(todas, historico).length

  const responder = (letra: string): void => {
    if (!atual || marcada) return
    setMarcada(letra)
    const h = registrar(historico, atual.chave, letra === atual.questao.gabarito, p.hoje)
    gravarHistorico(guardadoDoNavegador, h)
    setHistorico(h)
  }

  const proxima = (): void => {
    setMarcada(null)
    setRodada(r => r + 1)
  }

  if (todas.length === 0) {
    return (
      <div>
        <Cabecalho titulo="Treinar" aoVoltar={() => p.irPara('estudar')} />
        <div className="bloco">
          <p className="vazio">
            Nenhuma questão chegou ainda. Os exercícios são escritos no Cortex, no
            computador, e vêm junto do conteúdo e do cronograma.
          </p>
        </div>
      </div>
    )
  }

  const q = atual?.questao
  const letras = (['a', 'b', 'c', 'd', 'e'] as const).filter(l => q?.[l])
  const acertou = marcada !== null && marcada === q?.gabarito

  return (
    <div>
      <Cabecalho
        titulo="Treinar"
        aoVoltar={() => p.irPara('estudar')}
        // O placar do dia vive no cabeçalho, onde o app já mostra estado.
        // Tom `ok` sempre: o número já diz como está indo, e pintar de
        // vermelho quem está treinando é desanimar quem está fazendo o certo.
        estado={{ texto: `${placar.certas} ✓ · ${placar.erradas} ✗`, tom: 'ok' }}
      />

      <div className="bloco">
        {/* O filtro de matéria. "Tudo" primeiro, porque é o modo normal: na
            espera do ônibus não se escolhe matéria, responde-se o que vier. */}
        <div className="abas-redacao treino-materias">
          <button type="button" className="btn-aba" data-ativa={materia === null}
            onClick={() => { setMateria(null); proxima() }}>Tudo</button>
          {materias.map(m => (
            <button key={m} type="button" className="btn-aba" data-ativa={materia === m}
              onClick={() => { setMateria(m); proxima() }}>{m}</button>
          ))}
        </div>

        {!atual ? (
          <p className="vazio">Nenhuma questão desta matéria chegou ao celular.</p>
        ) : (
          <>
            <div className="treino-de">{atual.origem}</div>
            <p className="treino-enunciado">{q?.enunciado}</p>

            <div className="treino-alternativas">
              {letras.map(l => {
                /* Depois de marcar, a certa acende SEMPRE — inclusive quando
                   ele acertou. Ver a resposta certa junto da sua é o que
                   fecha o ciclo do flashcard. */
                const estado = marcada === null
                  ? undefined
                  : l === q?.gabarito ? 'certa'
                    : l === marcada ? 'errada' : undefined
                return (
                  <button
                    key={l}
                    type="button"
                    className="treino-alternativa"
                    data-estado={estado}
                    disabled={marcada !== null}
                    onClick={() => responder(l)}
                  >
                    <span className="treino-letra">{l.toUpperCase()}</span>
                    <span>{q?.[l]}</span>
                  </button>
                )
              })}
            </div>

            {marcada !== null && (
              <div className="treino-correcao" data-acertou={acertou || undefined}>
                <strong>
                  {acertou ? 'Acertou.' : `Resposta: ${(q?.gabarito ?? '').toUpperCase()}`}
                </strong>
                {q?.comentario && <p>{q.comentario}</p>}
              </div>
            )}

            {marcada === null ? (
              <p className="treino-dica">
                Faça a conta no papel quando a questão pedir — é assim que ela cai na prova.
              </p>
            ) : (
              <Botao tipo="principal" aoClicar={proxima}>Próxima</Botao>
            )}
          </>
        )}

        {aRever > 0 && (
          <p className="treino-dica">
            {aRever} {aRever === 1 ? 'questão' : 'questões'} que você ainda erra mais do que
            acerta. Elas voltam primeiro.
          </p>
        )}
      </div>
    </div>
  )
}
