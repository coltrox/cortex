import { useEffect, useMemo, useRef, useState } from 'react'
import { Cabecalho, Botao } from '../componentes'
import type { UsoDoCardapio, useEnvio } from '../envio'
import type { Tela } from '../App'
import { guardadoDoNavegador } from '../guardado'
import {
  cartasDoCardapio, materiasDo, filtrarPorMateria, baralho, registrar,
  placarDoDia, pendentes, lerHistorico, gravarHistorico,
  paraTreinar, desfazer, feitas, type Carta, type Feita
} from '../exercicios'
import {
  iniciar, anotar, desfazerUltima, resumir, placares, totalGeral, destaques,
  porcentagem,
  rotuloDeHora, diaDaSessao,
  lerSessao, gravarSessao, limparSessao, type SessaoEstudo, type ResumoSessao
} from '../sessao'
import { Rascunho } from './Rascunho'

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
  envio: ReturnType<typeof useEnvio>
  hoje: string
  irPara: (t: Tela) => void
}) {
  const [historico, setHistorico] = useState(() => lerHistorico(guardadoDoNavegador))
  /* A sessão aberta, se houver. Sai do aparelho e não do estado inicial vazio
     porque fechar o app no meio do treino — ou o navegador descartar a aba —
     não pode perder meia hora de exercício já respondido. */
  const [sessao, setSessao] = useState<SessaoEstudo | null>(
    () => lerSessao(guardadoDoNavegador)
  )
  /* O relatório da sessão que acabou de ser encerrada, para ele ver na hora
     o que o Cortex vai escrever na nota. */
  const [fechada, setFechada] = useState<ResumoSessao | null>(null)
  /* A lista do que ele já respondeu, por cima do treino. */
  const [vendoFeitas, setVendoFeitas] = useState(false)
  const [materia, setMateria] = useState<string | null>(null)
  const [marcada, setMarcada] = useState<string | null>(null)
  /* Quantas cartas já passaram. Serve para forçar o próximo sorteio quando o
     histórico não distingue duas cartas. */
  const [rodada, setRodada] = useState(0)

  /* TODAS as cartas, inclusive as que o cronograma reservou. Esta lista é a
     do histórico: ele precisa reencontrar uma questão que respondeu no dia 26
     mesmo que ela não possa cair no treino livre. */
  const todasAsCartas = useMemo(
    () => cartasDoCardapio(p.cardapio.cardapio.itens, p.hoje),
    [p.cardapio.cardapio.itens, p.hoje]
  )

  /* O baralho do treino, sem o que está reservado para os dias que ainda vêm.
     Pedido dele: treinar hoje o que o cronograma guardou para o dia 11
     estragaria o dia 11. */
  const todas = useMemo(() => paraTreinar(todasAsCartas), [todasAsCartas])
  const materias = useMemo(() => materiasDo(todas), [todas])

  /*
   * A carta da vez vive em ESTADO, e não num valor derivado.
   *
   * Isto corrigiu um bug feio: o cardápio se atualiza sozinho a cada dois
   * minutos, e a carta era recalculada a partir dele. No meio de uma questão
   * — com a conta já feita no rascunho — a atualização trocava o enunciado e
   * o trabalho ia embora.
   *
   * Agora a carta só muda quando ALGUÉM MANDA: ao abrir a tela, ao tocar em
   * "próxima", ou ao trocar de matéria. Nada que chegue da nuvem mexe nela.
   */
  const [atual, setAtual] = useState<Carta | undefined>(undefined)

  /* O histórico num ref para o sorteio ler o valor mais recente sem virar
     dependência do efeito — se virasse, responder trocaria a carta na hora. */
  const historicoRef = useRef(historico)
  historicoRef.current = historico
  const todasRef = useRef(todas)
  todasRef.current = todas

  useEffect(() => {
    const candidatas = filtrarPorMateria(todasRef.current, materia)
    const escolhida = baralho(candidatas, historicoRef.current)[0]
    // Baralho vazio não apaga a carta na tela: o cardápio pode ter chegado
    // vazio por um instante, e sumir com a questão no meio seria o mesmo bug
    // de novo, por outro caminho.
    if (escolhida) setAtual(escolhida)
  }, [materia, rodada])

  const placar = placarDoDia(historico, p.hoje)
  const aRever = pendentes(todas, historico).length
  /* A lista sai de TODAS as cartas, e não só das de treino: ele respondeu
     questões do cronograma nos dias passados e precisa reencontrá-las. */
  const jaFeitas = feitas(todasAsCartas, historico)

  const responder = (letra: string): void => {
    if (!atual || marcada) return
    setMarcada(letra)
    const acertou = letra === atual.questao.gabarito

    const h = registrar(historico, atual.chave, acertou, p.hoje)
    gravarHistorico(guardadoDoNavegador, h)
    setHistorico(h)

    /* A resposta entra na sessão além do histórico. São duas contas
       diferentes: o histórico decide qual carta volta antes, a sessão é o
       recorte do treino de agora, que vira nota. */
    if (sessao) {
      const nova = anotar(sessao, {
        chave: atual.chave,
        materia: atual.materia,
        conteudo: atual.origem,
        acertou
      })
      gravarSessao(guardadoDoNavegador, nova)
      setSessao(nova)
    }
  }

  const abrirSessao = (): void => {
    const s = iniciar(new Date())
    gravarSessao(guardadoDoNavegador, s)
    setSessao(s)
    setFechada(null)
  }

  /**
   * Encerra a sessão: manda o relatório para o Cortex escrever a nota.
   *
   * Sessão sem resposta nenhuma é descartada em silêncio — foi o botão tocado
   * por engano, e um evento assim só criaria nota vazia no vault.
   */
  const encerrarSessao = (): void => {
    if (!sessao) return
    const agora = new Date()

    if (sessao.respostas.length === 0) {
      limparSessao(guardadoDoNavegador)
      setSessao(null)
      return
    }

    const r = resumir(sessao, agora)
    p.envio.registrar({
      tipo: 'sessao_estudo',
      dia: diaDaSessao(sessao),
      dados: {
        inicio: r.inicio,
        fim: r.fim,
        minutos: r.minutos,
        /* Só nome e contagem: o Cortex não precisa das respostas uma por uma
           para escrever o relatório, e mandar menos é mandar menos coisa que
           pode chegar torta. */
        materias: r.materias.map(m => ({ nome: m.nome, certas: m.certas, erradas: m.erradas })),
        conteudos: r.conteudos.map(c => ({ nome: c.nome, certas: c.certas, erradas: c.erradas }))
      }
    })

    limparSessao(guardadoDoNavegador)
    setSessao(null)
    setFechada(r)
  }

  const proxima = (): void => {
    setMarcada(null)
    setRodada(r => r + 1)
  }

  /**
   * "Cliquei sem querer": apaga a resposta e devolve a questão em branco.
   *
   * Desfaz nos DOIS lugares — no histórico, que decide o que volta antes no
   * baralho, e na sessão, que vira relatório. Corrigir só um deixaria o
   * relatório culpando uma matéria por um toque errado na tela.
   */
  const contestar = (): void => {
    if (!atual || marcada === null) return
    const acertou = marcada === atual.questao.gabarito

    const h = desfazer(historico, atual.chave, acertou)
    gravarHistorico(guardadoDoNavegador, h)
    setHistorico(h)

    if (sessao) {
      const nova = desfazerUltima(sessao, atual.chave)
      gravarSessao(guardadoDoNavegador, nova)
      setSessao(nova)
    }

    // A MESMA questão continua na tela, em branco: ele contestou para
    // responder de novo, não para pular.
    setMarcada(null)
  }

  /** Escolher uma questão específica do histórico para refazer. */
  const refazer = (c: Carta): void => {
    setMarcada(null)
    setAtual(c)
    setVendoFeitas(false)
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
        <PainelDaSessao
          sessao={sessao}
          fechada={fechada}
          aoIniciar={abrirSessao}
          aoEncerrar={encerrarSessao}
          aoDispensar={() => setFechada(null)}
        />

        {jaFeitas.length > 0 && (
          <button
            type="button"
            className="btn btn-fantasma treino-ver-feitas"
            onClick={() => setVendoFeitas(v => !v)}
          >
            {vendoFeitas
              ? '← Voltar ao treino'
              : `Meus exercícios (${jaFeitas.length})`}
          </button>
        )}

        {vendoFeitas && <ListaDeFeitas feitas={jaFeitas} aoRefazer={refazer} />}

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

            <Rascunho />

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
                <Formulas formulas={q?.formulas} />
              </div>
            )}

            {marcada === null ? (
              <p className="treino-dica">
                Faça a conta no papel quando a questão pedir — é assim que ela cai na prova.
              </p>
            ) : (
              <div className="treino-acoes">
                <Botao tipo="principal" aoClicar={proxima}>Próxima</Botao>
                {/* Antes de avançar, e não depois: uma vez que a questão
                    passa, ele não tem como voltar para corrigir o toque. */}
                <button type="button" className="btn btn-fantasma" onClick={contestar}>
                  Cliquei sem querer
                </button>
              </div>
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

/**
 * A faixa da sessão de estudos, no topo do treino.
 *
 * Três estados, e nunca dois ao mesmo tempo:
 *
 * 1. **sem sessão** — um convite para abrir uma;
 * 2. **sessão aberta** — o placar ao vivo e o botão de encerrar;
 * 3. **acabou de encerrar** — o relatório que foi para o Cortex.
 *
 * O treino funciona sem sessão nenhuma, e isso é de propósito: a tela nasceu
 * para responder uma questão na fila do ônibus, e obrigar a "iniciar sessão"
 * antes disso transformaria um gesto de dez segundos em burocracia. A sessão
 * é para quando ele senta para estudar de verdade.
 */
function PainelDaSessao(p: {
  sessao: SessaoEstudo | null
  fechada: ResumoSessao | null
  aoIniciar: () => void
  aoEncerrar: () => void
  aoDispensar: () => void
}) {
  if (p.fechada) {
    const r = p.fechada
    const geral = r.materias.reduce(
      (acc, m) => ({ certas: acc.certas + m.certas, erradas: acc.erradas + m.erradas }),
      { certas: 0, erradas: 0 }
    )
    const feitas = geral.certas + geral.erradas
    const d = destaques(r.conteudos.length > 0 ? r.conteudos : r.materias)

    return (
      <div className="sessao-painel" data-estado="fechada">
        <h2 className="sessao-titulo">Sessão encerrada</h2>
        <p className="sessao-resumo">
          {r.minutos > 0 && <><b>{r.minutos} min</b> · </>}
          <b>{feitas}</b> {feitas === 1 ? 'questão' : 'questões'} ·{' '}
          <b>{geral.certas} ✓</b> {geral.erradas} ✗
        </p>

        <ul className="sessao-lista">
          {r.materias.map(m => (
            <li key={m.nome}>
              <span>{m.nome}</span>
              <span className="sessao-nota">
                {m.certas}/{m.total} · {porcentagem(m.taxa)}%
              </span>
            </li>
          ))}
        </ul>

        {d.mal.length > 0 && (
          <p className="sessao-dica">
            Volte em <b>{d.mal.map(x => x.nome).join(', ')}</b>.
          </p>
        )}
        {d.bem.length > 0 && (
          <p className="sessao-dica">
            Foi bem em <b>{d.bem.map(x => x.nome).join(', ')}</b>.
          </p>
        )}

        <p className="sessao-dica">
          O relatório completo vai para <b>Estudos/Sessões</b> no Cortex, na
          próxima vez que o computador ligar.
        </p>
        <Botao tipo="secundario" aoClicar={p.aoDispensar}>Fechar</Botao>
      </div>
    )
  }

  if (!p.sessao) {
    return (
      <div className="sessao-painel">
        <Botao tipo="secundario" aoClicar={p.aoIniciar}>▶ Iniciar sessão de estudos</Botao>
        <p className="sessao-dica">
          Com a sessão aberta, tudo que você responder entra num relatório — por
          matéria e por conteúdo — que vira nota no Cortex.
        </p>
      </div>
    )
  }

  const total = totalGeral(p.sessao.respostas)
  const porMateria = placares(p.sessao.respostas, 'materia')

  return (
    <div className="sessao-painel" data-estado="aberta">
      <div className="sessao-cabeca">
        <span className="sessao-etiqueta">
          Sessão desde {rotuloDeHora(p.sessao.inicio)}
        </span>
        <span className="sessao-nota">
          {total.certas} ✓ · {total.erradas} ✗
          {total.total > 0 && ` · ${porcentagem(total.taxa)}%`}
        </span>
      </div>

      {porMateria.length > 0 && (
        <ul className="sessao-lista">
          {porMateria.map(m => (
            <li key={m.nome}>
              <span>{m.nome}</span>
              <span className="sessao-nota">{m.certas}/{m.total}</span>
            </li>
          ))}
        </ul>
      )}

      <Botao tipo="principal" aoClicar={p.aoEncerrar}>
        ■ Encerrar e registrar
      </Botao>
    </div>
  )
}

/**
 * As fórmulas que a questão cobrava.
 *
 * Aparece junto da correção, e não no enunciado: dizer a fórmula antes
 * entregaria metade da questão. Depois de responder, é o que faz o erro
 * virar aprendizado — "era esta que eu deveria ter usado".
 */
function Formulas({ formulas }: { formulas?: string[] }) {
  if (!formulas || formulas.length === 0) return null
  return (
    <div className="treino-formulas">
      <span className="treino-formulas-rotulo">
        {formulas.length === 1 ? 'Fórmula usada' : 'Fórmulas usadas'}
      </span>
      <ul>
        {formulas.map(f => <li key={f}><code>{f}</code></li>)}
      </ul>
    </div>
  )
}

/**
 * Tudo que ele já respondeu, para escolher o que refazer.
 *
 * Pedido: "quero poder ver todos que eu já fiz, separados em acertos e
 * erros". Os ERRADOS vêm primeiro e já abertos, porque são o motivo de a
 * lista existir — rever o que acertou é opcional, rever o que errou é o
 * treino.
 *
 * Cada linha é um botão: tocar põe aquela questão na tela, inclusive uma
 * reservada ao cronograma. Reservada é para não cair por SORTEIO; se ele
 * escolher de propósito, é escolha dele.
 */
function ListaDeFeitas(p: { feitas: Feita[]; aoRefazer: (c: Carta) => void }) {
  const [aba, setAba] = useState<'errei' | 'acertei'>('errei')
  const mostradas = p.feitas.filter(f => f.situacao === aba)
  const erradas = p.feitas.filter(f => f.situacao === 'errei').length
  const certas = p.feitas.length - erradas

  return (
    <div className="feitas">
      <div className="abas-redacao">
        <button
          type="button" className="btn-aba" data-ativa={aba === 'errei'}
          onClick={() => setAba('errei')}
        >Errei ({erradas})</button>
        <button
          type="button" className="btn-aba" data-ativa={aba === 'acertei'}
          onClick={() => setAba('acertei')}
        >Acertei ({certas})</button>
      </div>

      {mostradas.length === 0 ? (
        <p className="vazio">
          {aba === 'errei'
            ? 'Nenhuma questão errada por aqui. Bom sinal.'
            : 'Nenhuma acertada ainda.'}
        </p>
      ) : (
        <ul className="feitas-lista">
          {mostradas.map(f => (
            <li key={f.carta.chave}>
              <button type="button" onClick={() => p.aoRefazer(f.carta)}>
                <span className="feitas-enunciado">{f.carta.questao.enunciado}</span>
                <span className="feitas-rodape">
                  <span className="feitas-de">{f.carta.origem}</span>
                  <span className="feitas-placar">
                    {f.acertos} ✓ · {f.erros} ✗
                    {f.carta.pote === 'cronograma' && ' · do cronograma'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="treino-dica">
        Toque numa questão para refazê-la agora. As fórmulas aparecem na
        correção, depois de você responder.
      </p>
    </div>
  )
}
