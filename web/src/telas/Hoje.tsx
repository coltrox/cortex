import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react'
import type { Evento } from '@compartilhado/eventos'
import { guardadoDoNavegador } from '../guardado'
import { Marcacao } from '../marcacao'
import { corpoVisivel } from '@compartilhado/corpo'
import { EditarItemDoDia } from './EditarItemDoDia'
import {
  diaLocal, eventoSuplemento, eventoRefeicaoPlano, eventoRotina, eventoAgua, eventoItemEditado
} from '../montar'
import {
  suplementosDoDia, refeicoesDoPlano, rotinasDoDia, hidratacao, litros,
  anotacoesDoDia, momentoDe, areaLigada,
  provas, compromissos, tarefas, dataDe, dataCurta, faltam
} from '../cardapio'
import { jaFeitos, marcarFeito, desmarcarFeito } from '../feitos'
import { lerAnotacoes, conciliarAnotacoes } from '../anotacoes'
import { lerPendente, somarPendente, conciliarPendente, totalNaTela } from '../agua'
import { usePuxarParaAtualizar, progresso, LIMITE } from '../puxar'
import { Cabecalho, Check, Botao, Aviso, Secao, Detalhe } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'


/**
 * Uma anotação na lista do Hoje.
 *
 * Mora aqui, e não em `componentes.tsx`, porque é usada só nesta tela — o
 * arquivo de componentes é para o que se repete entre telas.
 *
 * `soAqui` diz que esta ainda não deu a volta pelo Cortex. É informação, não
 * erro: sem sinal, ou com o computador desligado, é o estado normal por horas
 * — e omitir isso faria a anotação parecer guardada no vault quando ela está
 * só no aparelho.
 */
function Anotada(p: {
  texto: string; prioridade: boolean; soAqui?: boolean
  corpo?: string; permanente?: boolean
}) {
  return (
    <div className="anotada" data-prioridade={p.prioridade ? 'sim' : undefined}>
      {p.prioridade && <span className="anotada-estrela" aria-label="prioridade">★</span>}
      {/* `pre-wrap` no CSS: a anotação foi escrita num campo de 8 linhas, e
          amassar as quebras faria a lista de recados virar um parágrafo só. */}
      <p className="anotada-texto">{p.texto}</p>
      {p.permanente && <span className="anotada-marca">fixa</span>}
      {/* O corpo escrito no Cortex, com os links clicáveis. Fica embaixo e
          ocupa a linha toda: é onde moram as observações e o passo a passo,
          e antes nada disso saía do computador.
          `corpoVisivel`, e não `p.corpo` cru: toda nota nascida no celular tem
          corpo, mas só com o rodapé de links, e a caixa aparecia vazia embaixo
          de todas elas. */}
      {corpoVisivel(p.corpo) && (
        <div className="anotada-corpo"><Marcacao texto={p.corpo ?? ''} /></div>
      )}
    </div>
  )
}

/**
 * A tarefa do dia: marcar à esquerda, abrir à direita.
 *
 * O texto fica recolhido, e não aberto: a lista do Hoje é para bater o olho e
 * marcar. Uma tarefa com dez passos aberta o tempo todo empurraria as outras
 * para fora da tela — e quem quer o passo a passo quer no momento de fazer,
 * não o dia inteiro.
 *
 * O que abre é uma seta DENTRO do cartão, encostada na direita, e não mais um
 * botão de largura inteira embaixo dele: aquele ficava boiando entre duas
 * tarefas e não se lia como parte de nenhuma das duas.
 *
 * Sem texto, o cartão volta a ser o item simples — sem seta que não abre nada.
 */
function Tarefa(p: {
  nome: string
  detalhe: ReactNode
  feito: boolean
  aoMarcar: () => void
  corpo: string
  /** Abre o painel de alterar. Ausente quando não há nota para alcançar. */
  aoAlterar?: () => void
  alterando?: boolean
}) {
  const [aberto, setAberto] = useState(false)

  /* O "⋯" de alterar, quando há o que alterar. Mesmo botão da tela Notas. */
  const botaoAlterar = p.aoAlterar ? (
    <button
      className="item-ver nota-mais"
      type="button"
      aria-expanded={p.alterando === true}
      aria-label={`alterar ${p.nome}`}
      onClick={p.aoAlterar}
    >
      ⋯
    </button>
  ) : undefined

  if (!p.corpo) {
    return (
      <Check rotulo={p.nome} detalhe={p.detalhe} feito={p.feito} aoMarcar={p.aoMarcar}
        acao={botaoAlterar} />
    )
  }

  return (
    <div className="com-corpo">
      <Check
        rotulo={p.nome}
        detalhe={p.detalhe}
        feito={p.feito}
        aoMarcar={p.aoMarcar}
        acao={
          <>
          {botaoAlterar}
          <button
            className="item-ver"
            type="button"
            aria-expanded={aberto}
            // O nome vai no rótulo porque numa lista de oito tarefas há oito
            // destas setas, e "abrir" sozinho não diz qual delas é.
            aria-label={`${aberto ? 'Esconder' : 'Ver'} ${p.nome}`}
            onClick={() => setAberto(v => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5.5 7 9 10.5 12.5 7" />
            </svg>
          </button>
          </>
        }
      />
      {aberto && (
        <div className="corpo-texto">
          {/* O rotulo diz o que e aquele bloco. Sem ele, o texto aberto
              parecia continuacao do nome da tarefa. */}
          <div className="corpo-rotulo">descrição</div>
          <Marcacao texto={p.corpo} />
        </div>
      )}
    </div>
  )
}

/** O que veio do banco pode não ser texto. */
const txtDe = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * O perímetro do anel, `2πr` com r=47 no `viewBox` de 110.
 *
 * Constante calculada uma vez: é o comprimento total do traço, e `dashoffset`
 * conta a partir dele o quanto ainda falta.
 */
const PERIMETRO = 2 * Math.PI * 47

/** `quinta, 10 set` — a linha miúda acima da saudação, como no desenho. */
function dataPorExtenso(d: Date): string {
  const s = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })
  // O `pt-BR` devolve "quinta-feira, 10 de set." — a forma curta do desenho
  // tira o "-feira", o "de" e o ponto da abreviação do mês.
  return s.replace('-feira', '').replace(' de ', ' ').replace('.', '')
}

/**
 * Bom dia, boa tarde, boa noite.
 *
 * Sem nome depois. O desenho escreve "Bom dia, Ju" porque a maquete precisava
 * de um nome de exemplo; aqui o nome seria mais uma preferência para cadastrar
 * e manter, e não diria nada a quem está olhando o próprio celular.
 */
function saudacao(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/**
 * O anel do dia: quanto do que estava marcado para hoje já foi feito.
 *
 * Conta suplemento, refeição e tarefa — as três listas de marcar. A água entra
 * como UM item, cumprido ao bater a meta: contada em ml, ela sozinha valeria
 * mais que todo o resto somado e o anel viraria o medidor de água.
 *
 * Sem nada para fazer não há fração: `null` diz à tela para não desenhar o
 * anel, em vez de desenhar um círculo em 0% que parece cobrança por um dia que
 * não pediu nada.
 */
function fracaoDoDia(
  feitosDeHoje: boolean[],
  agua: { meta: number } | null,
  bebido: number
): { feitos: number; total: number } | null {
  let feitos = feitosDeHoje.filter(Boolean).length
  let total = feitosDeHoje.length
  if (agua && agua.meta > 0) {
    total += 1
    if (bebido >= agua.meta) feitos += 1
  }
  return total === 0 ? null : { feitos, total }
}

export function Hoje(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const dia = diaLocal()
  /** Qual tarefa do dia está com o painel de alterar aberto — uma de cada vez. */
  const [alterando, setAlterando] = useState<string | null>(null)
  /*
   * A hora de agora, fixada no render.
   *
   * `new Date()` direto no JSX daria uma hora diferente a cada renderização,
   * e a saudação poderia trocar no meio de um toque. Uma leitura por render é
   * o bastante: ninguém fica com a tela aberta atravessando o meio-dia — e
   * quem ficar vê a saudação certa no próximo toque.
   */
  const agora = new Date()
  const [feitos, setFeitos] = useState<string[]>(() => jaFeitos(guardadoDoNavegador, dia))

  /*
   * Só o que o dono ligou no Cortex.
   *
   * `areaLigada` responde "sim" quando NÃO SABE — cardápio antigo, ou o SQL
   * da espécie `area` ainda não rodado. Ver `cardapio.ts`: ausência não pode
   * significar "desligue tudo", ou quem só esqueceu de atualizar o Cortex
   * abriria o celular e encontraria um app sem nada dentro.
   *
   * O corte é feito AQUI, na origem das listas, e não em cada `&&` do JSX lá
   * embaixo: assim `vazio` e tudo o mais que depende delas já nasce
   * concordando, em vez de existirem duas versões da mesma verdade.
   */
  const temSaude = areaLigada(p.cardapio.cardapio, 'saude')
  const temVida = areaLigada(p.cardapio.cardapio, 'vida')
  const temEstudos = areaLigada(p.cardapio.cardapio, 'conhecimento')
  const temAgenda = areaLigada(p.cardapio.cardapio, 'calendario')

  /*
   * As duas próximas coisas com data.
   *
   * Prova, compromisso e tarefa na mesma fila, ordenadas pela data — é assim
   * que elas chegam na vida, e separá-las por tipo aqui faria a mais próxima
   * das três ficar escondida atrás do cabeçalho da categoria dela.
   *
   * O que já passou fica de fora: "chegando" que mostra ontem não é chegando.
   */
  const proximos = temAgenda
    ? [
        ...provas(p.cardapio.cardapio),
        ...compromissos(p.cardapio.cardapio),
        ...tarefas(p.cardapio.cardapio)
      ]
      .filter(i => dataDe(i) >= dia)
      .sort((a, b) => dataDe(a).localeCompare(dataDe(b)))
      .slice(0, 2)
    : []

  const suplementos = temSaude ? suplementosDoDia(p.cardapio.cardapio, dia) : []
  const refeicoes = temSaude ? refeicoesDoPlano(p.cardapio.cardapio) : []
  const rotinas = temVida ? rotinasDoDia(p.cardapio.cardapio, dia) : []
  /*
   * A água do dia.
   *
   * O total mora no vault, e o pendente é a distância entre o que já foi
   * tocado e o que o Cortex confirmou — ver `agua.ts`. Não é uma segunda
   * contagem: com o computador desligado, que é onde o Pedro está quando bebe
   * água, a volta pelo Cortex não acontece hoje, e sem o pendente o número
   * ficaria parado a manhã inteira por mais que ele tocasse.
   */
  const agua = temSaude ? hidratacao(p.cardapio.cardapio) : null
  const [pendente, setPendente] = useState<number>(() => lerPendente(guardadoDoNavegador, dia))
  const bebido = totalNaTela(agua?.ml ?? 0, pendente)

  /*
   * As anotações do dia, de duas fontes que dizem a mesma coisa.
   *
   * As do Cortex são as que já viraram nota no vault. As locais são as que
   * este aparelho escreveu e ainda não voltaram — com o computador desligado,
   * que é o caso normal quando ele escreve alguma no ônibus, são todas.
   *
   * Somar as duas listas sem mais nada duplicaria cada anotação assim que ela
   * desse a volta; quem tira a cópia local é `conciliarAnotacoes`, no efeito
   * abaixo. A local aparece marcada "só neste aparelho", que é a verdade
   * enquanto o Cortex não a recebeu.
   */
  const publicadas = temVida ? anotacoesDoDia(p.cardapio.cardapio, dia) : []
  const [locais, setLocais] = useState(() => lerAnotacoes(guardadoDoNavegador, dia))

  /*
   * Quem manda é o Cortex; a marca local só cobre o intervalo.
   *
   * O check agora vem no cardápio (`detalhe.feito`), lido do diário do dia lá
   * no computador. A marca em `localStorage` existe só para a tela responder
   * na hora do toque, enquanto o evento não deu a volta — e some assim que o
   * cardápio volta dizendo a mesma coisa.
   *
   * Sem essa limpeza, desmarcar aqui e remarcar NO CORTEX deixaria este
   * celular mostrando desmarcado até a virada do dia, contra o que o vault diz.
   */
  useEffect(() => {
    const atuais = jaFeitos(guardadoDoNavegador, dia)
    let mexeu = false
    const conferir = (chave: string, doCardapio: boolean): void => {
      const confirmado = doCardapio ? chave : `nao-${chave}`
      if (atuais.includes(confirmado)) {
        desmarcarFeito(guardadoDoNavegador, dia, confirmado)
        mexeu = true
      }
    }
    for (const s of suplementos) conferir(`suplemento:${s.nome}`, s.detalhe.feito === true)
    for (const r of refeicoes) conferir(`refeicao:${r.nome}`, r.detalhe.feito === true)
    for (const t of rotinas) conferir(`rotina:${t.nome}`, t.detalhe.feito === true)
    if (mexeu) setFeitos(jaFeitos(guardadoDoNavegador, dia))
    // A água acerta a conta pelo mesmo gatilho, só que somando em vez de
    // comparar: o que o Cortex absorveu sai do pendente.
    setPendente(conciliarPendente(guardadoDoNavegador, dia, agua?.ml ?? 0))
    // E a anotação que voltou do vault deixa de ser mostrada pela cópia local.
    setLocais(conciliarAnotacoes(guardadoDoNavegador, dia, publicadas.map(a => a.texto)))
    // `feitos` fora das dependências de propósito: o efeito lê do disco, não
    // do estado, e listá-lo o faria rodar por causa da própria limpeza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cardapio.cardapio, dia])

  /** O item está marcado? O cardápio decide; a marca local só adianta. */
  const estaFeito = (chave: string, doCardapio: boolean): boolean =>
    !feitos.includes(`nao-${chave}`) && (doCardapio || feitos.includes(chave))

  /** Marcar e desmarcar são o mesmo toque, com o sinal trocado. */
  const alternar = (chave: string, estava: boolean, montar: (feito: boolean) => Evento): void => {
    const anti = `nao-${chave}`
    if (estava) {
      marcarFeito(guardadoDoNavegador, dia, anti)
      desmarcarFeito(guardadoDoNavegador, dia, chave)
    } else {
      marcarFeito(guardadoDoNavegador, dia, chave)
      desmarcarFeito(guardadoDoNavegador, dia, anti)
    }
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    p.envio.registrar(montar(!estava))
  }
  /*
   * Puxar para atualizar.
   *
   * "O app todo": o cardápio DESCE e a fila SOBE. Só buscar deixaria o gesto
   * pela metade — quem puxa depois de marcar coisas sem sinal quer ver a fila
   * esvaziar tanto quanto quer ver a novidade chegar.
   */
  const puxar = usePuxarParaAtualizar(useCallback(async () => {
    await Promise.all([p.cardapio.atualizar(), p.envio.drenar()])
  }, [p.cardapio, p.envio]))

  const { avisos } = p.envio.estado

  /*
   * A fração do dia, montada das MESMAS listas que a tela desenha.
   *
   * De propósito: se o anel contasse de outra fonte, ele diria uma coisa e a
   * lista logo abaixo diria outra — e a pessoa acreditaria na lista, que é o
   * que ela consegue conferir. Assim não há duas versões da mesma verdade.
   */
  const progressoDoDia = fracaoDoDia(
    [
      ...suplementos.map(s => estaFeito(`suplemento:${s.nome}`, s.detalhe.feito === true)),
      ...refeicoes.map(r => estaFeito(`refeicao:${r.nome}`, r.detalhe.feito === true)),
      ...rotinas.map(t => estaFeito(`rotina:${t.nome}`, t.detalhe.feito === true))
    ],
    agua,
    bebido
  )
  const vazio = suplementos.length === 0 && refeicoes.length === 0
    && rotinas.length === 0 && !agua
    // Uma anotação escrita aqui já é conteúdo na tela: dizer "nada no
    // cardápio ainda" logo abaixo dela seria o app contradizendo o que
    // está mostrando.
    && publicadas.length === 0 && locais.length === 0

  return (
    <div className="tema-hoje">
      {/* Duas camadas de propósito: a de fora desce com o dedo, a de dentro
          gira. Numa só, a animação de girar (que é `transform`) apagaria o
          `translateY` da descida.

          A página em si NÃO desce: `transform` num ancestral faz todo
          `position: fixed` de dentro virar `absolute`, e o cabeçalho fixo
          desceria junto, deixando de ser cabeçalho. */}
      <div
        className="puxar-cova"
        style={{
          transform: `translateY(${puxar.distancia}px)`,
          opacity: puxar.atualizando ? 1 : progresso(puxar.distancia),
          transition: puxar.distancia === 0 ? 'transform .25s ease, opacity .2s ease' : 'none'
        }}
        aria-hidden="true"
      >
        <div
          className={`puxar-anel ${puxar.atualizando ? 'puxar-girando' : ''}`}
          // Enquanto se puxa, o anel gira acompanhando o dedo — é o que diz
          // que falta pouco. Ao soltar, a animação do CSS assume.
          style={puxar.atualizando
            ? undefined
            : { transform: `rotate(${(puxar.distancia / LIMITE) * 270}deg)` }}
        />
      </div>

      {/*
        * Hoje não usa o cabeçalho fixo das outras telas.
        *
        * No desenho, a saudação ROLA junto com o conteúdo: ela é a abertura da
        * página, não uma barra. Uma barra fixa escrita "Hoje" repetiria o que
        * a aba acesa lá embaixo já diz, e comeria 58 px da primeira dobra —
        * que nesta tela é onde mora o anel.
        *
        * A margem negativa devolve o espaço que o `#raiz` reserva para o
        * cabeçalho. É desconto do MESMO token que cria a reserva, então os
        * dois nunca divergem.
        */}
      {/* Tudo desce com o dedo, saudação inclusive: aqui ela é a abertura da
          página e não uma barra, então ficar parada enquanto o resto escorrega
          a faria parecer presa. Nenhum `position: fixed` mora dentro deste
          div — o que havia era o cabeçalho, que esta tela não usa mais. */}
      <div
        style={{
          transform: `translateY(${puxar.distancia}px)`,
          transition: puxar.distancia === 0 ? 'transform .25s ease' : 'none'
        }}
      >
      <header className="hoje-abertura">
        <div className="hoje-abertura-txt">
          <div className="hoje-data">{dataPorExtenso(agora)}</div>
          <h1 className="hoje-saudacao">{saudacao(agora)}</h1>
        </div>
        <div className="hoje-abertura-dir">
          {/*
            * Sem selo de envio, a pedido do dono.
            *
            * Havia aqui "enviando…" e "N na fila". A fila continua existindo e
            * continua funcionando sem sinal — o que saiu foi só o aviso na
            * tela. O registro que falta subir não é problema de quem
            * registrou: ele sobe sozinho na próxima vez que houver rede, e
            * mostrar isso a cada toque transformava um detalhe de encanamento
            * em preocupação.
            *
            * O que CONTINUA aparecendo é o erro de verdade — registro
            * recusado —, logo abaixo, porque aí sim há o que fazer.
            */}
          <button
            className="hoje-ajustes"
            type="button"
            onClick={() => p.irPara('ajustes')}
          >
            <span className="hoje-ajustes-linhas" aria-hidden="true">
              <i /><i /><i />
            </span>
            Ajustes
          </button>
        </div>
      </header>

      {avisos.length > 0 && (
        <Aviso tom="erro" aoFechar={p.envio.limparAvisos}>
          {avisos.length} registro(s) recusado(s). O primeiro: {avisos[0]}
        </Aviso>
      )}
      {p.cardapio.erro && <Aviso>{p.cardapio.erro}</Aviso>}

      <div className="bloco">
        {/*
          * O anel do dia.
          *
          * O primeiro cartão da tela, e o único que não se toca: ele responde
          * "como está hoje?" antes de qualquer lista. `stroke-dasharray` é o
          * perímetro do círculo e o `dashoffset` é o quanto falta — é assim
          * que se desenha um anel de progresso sem biblioteca nenhuma.
          *
          * Some quando não há nada marcado para o dia: um anel em zero por um
          * dia que não pediu nada parece cobrança.
          */}
        {progressoDoDia && (
          <div className="anel-cartao">
            <div className="anel-roda">
              <svg viewBox="0 0 110 110" aria-hidden="true">
                <circle className="anel-trilho" cx="55" cy="55" r="47" />
                <circle
                  className="anel-cheio"
                  cx="55" cy="55" r="47"
                  strokeDasharray={PERIMETRO}
                  strokeDashoffset={
                    PERIMETRO * (1 - progressoDoDia.feitos / progressoDoDia.total)
                  }
                  transform="rotate(-90 55 55)"
                />
              </svg>
              <div className="anel-meio">
                <span className="anel-pct">
                  {Math.round((progressoDoDia.feitos / progressoDoDia.total) * 100)}%
                </span>
                <span className="anel-legenda">do dia</span>
              </div>
            </div>
            <div className="anel-txt">
              <strong>
                {progressoDoDia.feitos} de {progressoDoDia.total} {' '}
                {progressoDoDia.total === 1 ? 'coisa' : 'coisas'}
              </strong>
              <p>
                {progressoDoDia.feitos === progressoDoDia.total
                  ? 'Tudo o que estava marcado para hoje já foi feito.'
                  : `Faltam ${progressoDoDia.total - progressoDoDia.feitos}. Dá para ir marcando por aqui.`}
              </p>
            </div>
          </div>
        )}

        {agua && (
          <div className="grupo">
            <Secao nome="Hidratação" contagem={agua.meta > 0
              ? `${litros(bebido)} de ${litros(agua.meta)}`
              : litros(bebido)} />
            <div className="agua">
              {/*
                * As garrafas, e não uma barra.
                *
                * A barra dizia a proporção; as garrafas dizem QUANTAS FALTAM,
                * que é a pergunta de quem está com a garrafa na mão. Uma
                * caixa por garrafa da meta, cheias da esquerda para a
                * direita, e a última parcial mostra a metade quando foi meia
                * garrafa.
                *
                * Sem meta cadastrada não há quantas: aí fica só a contagem em
                * litros no cabeçalho da seção, sem caixas para preencher.
                */}
              {agua.meta > 0 && (
                <div className="agua-garrafas" aria-hidden="true">
                  {Array.from({ length: Math.min(12, Math.ceil(agua.meta / agua.copo)) }, (_, i) => {
                    const cheiaAte = bebido / agua.copo
                    const parte = Math.max(0, Math.min(1, cheiaAte - i))
                    return (
                      <div key={i} className="agua-garrafa">
                        <i style={{ height: `${parte * 100}%` }} />
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="agua-nota">
                garrafa de {agua.copo} ml · definida no Cortex
              </div>
              <div className="agua-acoes">
                <button
                  className="btn btn-principal"
                  type="button"
                  onClick={() => {
                    setPendente(somarPendente(guardadoDoNavegador, dia, agua.copo))
                    p.envio.registrar(eventoAgua(agua.copo, dia))
                  }}
                >
                  + 1 garrafa
                </button>
                {/* Meia garrafa: o desenho traz, e o app não tinha. Beber
                    metade e não ter como registrar fazia a conta do dia ficar
                    sempre atrasada ou sempre adiantada. */}
                <button
                  className="btn btn-secundario"
                  type="button"
                  onClick={() => {
                    const meia = Math.round(agua.copo / 2)
                    setPendente(somarPendente(guardadoDoNavegador, dia, meia))
                    p.envio.registrar(eventoAgua(meia, dia))
                  }}
                >
                  + ½ garrafa
                </button>
                {/* Desfazer o toque a mais. Some quando não há o que desfazer:
                    um botão que não faz nada é pior do que botão nenhum. */}
                {bebido > 0 && (
                  <button
                    className="btn btn-fantasma agua-tirar"
                    type="button"
                    aria-label={`tirar ${agua.copo} ml`}
                    onClick={() => {
                      // Nunca tira mais do que há: o total na tela não pode
                      // dizer 0 enquanto um "−800" a mais viaja para o vault.
                      const quanto = Math.min(agua.copo, bebido)
                      setPendente(somarPendente(guardadoDoNavegador, dia, -quanto))
                      p.envio.registrar(eventoAgua(-quanto, dia))
                    }}
                  >
                    −
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Logo abaixo dos suplementos: é o mesmo gesto, e separar as duas
            listas por uma seção de outra coisa quebraria a sequência de
            toques de quem abre o app de manhã e desce marcando. */}
        {suplementos.length > 0 && <div className="grupo">
        <Secao nome="Suplementos" />
        {/* Dose primeiro, momento sempre. A dose some quando ninguém escreveu
            uma; o momento cai para "qualquer hora" em vez de deixar a linha
            muda — ver `momentoDe`. */}
        {suplementos.map(s => (
          <Check
            key={s.nome}
            rotulo={s.nome}
            detalhe={<Detalhe partes={[s.detalhe.dose, momentoDe(s)]} />}
            feito={estaFeito(`suplemento:${s.nome}`, s.detalhe.feito === true)}
            aoMarcar={() => alternar(
              `suplemento:${s.nome}`,
              estaFeito(`suplemento:${s.nome}`, s.detalhe.feito === true),
              feito => eventoSuplemento(s.nome, dia, feito)
            )}
          />
        ))}
        </div>}

        {refeicoes.length > 0 && <div className="grupo">
        <Secao nome="Refeições" />
        {refeicoes.map(r => (
          <Check
            key={r.nome}
            rotulo={r.nome}
            detalhe={<Detalhe partes={[r.detalhe.hora, r.detalhe.itens]} />}
            feito={estaFeito(`refeicao:${r.nome}`, r.detalhe.feito === true)}
            aoMarcar={() => alternar(
              `refeicao:${r.nome}`,
              estaFeito(`refeicao:${r.nome}`, r.detalhe.feito === true),
              feito => eventoRefeicaoPlano(r.nome, dia, feito)
            )}
          />
        ))}
        {/* A ponte para a aba Dieta: aqui é a lista de marcar, lá é o plano
            inteiro com as calorias. Sem este atalho, quem quisesse conferir o
            plano teria de descobrir sozinho que existe uma aba para isso. */}
        <button className="grupo-mais" type="button" onClick={() => p.irPara('dieta')}>
          Ver o plano inteiro
        </button>
        </div>}

        {/*
          * Cardio e Estudo, lado a lado.
          *
          * O desenho mostra o número de hoje dentro de cada um. Aqui eles
          * saem SEM número, porque o Cortex não publica o cardio nem o estudo
          * do dia para o celular — e um número inventado num cartão é pior do
          * que cartão sem número. O que o par entrega é o que o desenho tem
          * de mais útil: os dois registros mais frequentes a um toque, sem
          * descer até a grade lá embaixo.
          */}
        {rotinas.length > 0 && <div className="grupo">
        <Secao
          nome="Tarefas do dia"
          contagem={`${rotinas.filter(t =>
            estaFeito(`rotina:${t.nome}`, t.detalhe.feito === true)).length}/${rotinas.length}`}
        />
        {/* Mesma regra do suplemento, logo acima: a tarefa sem hora marcada é
            "qualquer hora", e não uma linha sem resposta. */}
        {rotinas.map(t => {
          const caminho = txtDe(t.detalhe.path)
          return (
            <div key={t.nome}>
              <Tarefa
                nome={t.nome}
                detalhe={<Detalhe partes={[momentoDe(t)]} />}
                corpo={txtDe(t.detalhe.corpo)}
                feito={estaFeito(`rotina:${t.nome}`, t.detalhe.feito === true)}
                aoMarcar={() => alternar(
                  `rotina:${t.nome}`,
                  estaFeito(`rotina:${t.nome}`, t.detalhe.feito === true),
                  feito => eventoRotina(t.nome, dia, feito)
                )}
                // Sem caminho não há nota para alcançar — é o caso de um
                // cardápio publicado por um Cortex mais antigo.
                aoAlterar={caminho
                  ? () => setAlterando(alterando === t.nome ? null : t.nome)
                  : undefined}
                alterando={alterando === t.nome}
              />
              {alterando === t.nome && (
                <EditarItemDoDia
                  nome={t.nome}
                  temDose={false}
                  valores={{
                    quando: txtDe(t.detalhe.quando),
                    dias: Array.isArray(t.detalhe.dias) ? t.detalhe.dias.map(d => String(d)) : [],
                    descricao: txtDe(t.detalhe.corpo)
                  }}
                  aoSalvar={v => {
                    p.envio.registrar(eventoItemEditado(caminho, {
                      quando: v.quando, dias: v.dias, texto: v.descricao
                    }, dia))
                    setAlterando(null)
                  }}
                  aoCancelar={() => setAlterando(null)}
                />
              )}
            </div>
          )
        })}
        </div>}

        {/*
          * Estudo, comprido, antes do Chegando.
          *
          * É o único atalho que sobrou da grade de registro: treino, cardio,
          * peso, gasto e porquinho foram para as abas Saúde e Dinheiro, e
          * anotação para Notas. Estudo não tem aba — ele é a única coisa que
          * se registra e não mora em lugar nenhum —, então fica aqui.
          */}
        {temEstudos && (
          <button className="cartao-largo" type="button" onClick={() => p.irPara('estudo')}>
            <span className="cartao-largo-txt">
              <strong>Estudo</strong>
              <span>Matéria, tempo e questões</span>
            </span>
            <span className="cartao-largo-seta" aria-hidden="true">›</span>
          </button>
        )}

        {proximos.length > 0 && (
          <div className="grupo">
            <Secao nome="Chegando" acao={
              <button className="secao-link" type="button" onClick={() => p.irPara('agenda')}>
                ver tudo
              </button>
            } />
            {proximos.map(i => (
              <div key={`${i.especie}:${i.nome}`} className="chega-linha">
                <span className="chega-dia">
                  <b>{dataCurta(dataDe(i), dia).split(' ')[0]}</b>
                  <i>{dataCurta(dataDe(i), dia).split(' ')[1] ?? ''}</i>
                </span>
                <span className="chega-nome">{i.nome}</span>
                <span className="chega-falta">{faltam(dataDe(i), dia)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Logo abaixo: o que estava para fazer, e em seguida o que
            aconteceu. As duas metades da mesma pergunta — "como foi hoje?" */}
        {(publicadas.length > 0 || locais.length > 0) && <Secao nome="Anotações de hoje" />}
        {publicadas.map(a => (
          <Anotada key={`vault:${a.titulo}`} texto={a.texto} prioridade={a.prioridade}
            corpo={a.corpo} permanente={a.permanente} />
        ))}
        {locais.map((a, i) => (
          <Anotada key={`aqui:${i}:${a.texto}`} texto={a.texto} prioridade={a.prioridade} soAqui />
        ))}

        {vazio && !p.cardapio.erro && (
          <p className="secao-vazia">
            Nada no cardápio ainda. Cadastre suplementos e um plano de dieta no
            Cortex — eles aparecem aqui sozinhos.
          </p>
        )}

      </div>
      </div>
    </div>
  )
}
