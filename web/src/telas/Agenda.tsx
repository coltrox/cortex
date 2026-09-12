import { Fragment, useEffect, useState } from 'react'
import { guardadoDoNavegador } from '../guardado'
import { diaLocal, eventoProvaEstudada, eventoProvaEtapa, eventoItemApagado } from '../montar'
import type { Evento } from '@compartilhado/eventos'
import { dobra, pontuar } from '@compartilhado/busca'
import {
  provas, compromissos, tarefas, caminhoDe, dataDe, faltam, dataCurta, diasAte, areaLigada
} from '../cardapio'
import { jaFeitos, marcarFeito, desmarcarFeito } from '../feitos'
import { lerPendentesAgenda, conciliarAgenda } from '../agendaLocal'
import { Cabecalho, Aviso, Secao, Detalhe, Selecao } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'
import type { ItemCardapio } from '@compartilhado/eventos'
import type { EdicaoItem, TipoNovo } from './NovoItem'

/** Um item da agenda sabendo de que tipo é: a lista mistura os três. */
type Linha = { tipo: 'prova' | 'compromisso' | 'tarefa'; item: ItemCardapio }

/** Como cada tipo se chama na tela. */
const ROTULO: Record<Linha['tipo'], string> = {
  prova: 'Prova',
  compromisso: 'Compromisso',
  tarefa: 'Tarefa'
}

/**
 * As formas em que uma data pode ser procurada.
 *
 * A busca comparava só a forma ISO (`2026-10-18`), que é como a data viaja e
 * não como alguém a escreve. Quem procura a prova de outubro digita `18/10`,
 * ou `out`, ou `outubro` — e não achava nada, o que fazia a busca parecer
 * quebrada quando ela só estava surda para o vocabulário certo.
 *
 * Sem `Date`: a string ISO já tem os três números, e construir um `Date` a
 * partir dela devolveria o dia anterior num fuso negativo.
 */
const MESES_BUSCA = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

export function formasDaData(iso: string, hoje: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return []
  const ano = iso.slice(0, 4)
  const mes = Number(iso.slice(5, 7))
  const dia = Number(iso.slice(8, 10))
  const dd = String(dia).padStart(2, '0')
  const mm = String(mes).padStart(2, '0')
  const nome = MESES_BUSCA[mes - 1] ?? ''
  return [
    iso,
    // Com zero e sem zero: quem digita "5/9" e quem digita "05/09" procuram a
    // mesma coisa, e a comparação é por texto.
    `${dd}/${mm}`, `${dia}/${mes}`,
    `${dd}/${mm}/${ano}`, `${dia}/${mes}/${ano}`,
    `${dia} ${nome.slice(0, 3)}`, nome,
    // "hoje" e "amanhã" achando o que está marcado para eles: é como se fala
    // da agenda, e o texto já existe pronto na própria tela.
    faltam(iso, hoje)
  ].filter(x => x !== '')
}

/** O que dá para marcar, na ordem em que aparece no seletor. */
const TIPOS_MARCAR: [TipoNovo, string][] = [
  ['compromisso', 'Compromisso'],
  ['prova', 'Prova'],
  ['tarefa', 'Tarefa'],
  ['comemorativa', 'Data comemorativa']
]

/**
 * O que a lista mostra.
 *
 * `comemorativa` é filtro próprio mesmo sendo, por dentro, um compromisso
 * com uma marca: para quem procura o aniversário da tia, "compromisso" não
 * é a palavra.
 */
type Filtro = 'todos' | 'compromisso' | 'prova' | 'tarefa' | 'comemorativa'

const FILTROS: [Filtro, string][] = [
  ['todos', 'Tudo'],
  ['compromisso', 'Compromissos'],
  ['prova', 'Provas'],
  ['tarefa', 'Tarefas'],
  ['comemorativa', 'Datas comemorativas']
]

/**
 * O que está chegando.
 *
 * Só leitura e dois botões. Marcar "estudei" e cancelar são os dois únicos
 * casos em que o celular mexe numa nota que já existe — os outros registros
 * todos criam coisa nova. Por isso os dois mandam o caminho da nota, e não o
 * título: dois "Dentista" em semanas diferentes têm o mesmo título.
 */
export function Agenda(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
  aoEditar: (tipo: TipoNovo, item: EdicaoItem) => void
  aoMarcar: (t: TipoNovo) => void
}) {
  const dia = diaLocal()
  const [feitos, setFeitos] = useState<string[]>(() => jaFeitos(guardadoDoNavegador, dia))
  /** Que tipo o seletor de Marcar está mostrando. */
  const [aMarcar, setAMarcar] = useState<TipoNovo>('compromisso')
  /** O caminho da nota cujas ações estão abertas — uma de cada vez. */
  const [aberto, setAberto] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  /** O que a lista está mostrando — tudo, ou um tipo só. */
  const [filtro, setFiltro] = useState<Filtro>('todos')
  /** O que foi marcado aqui e o Cortex ainda nao devolveu. */
  const [locais, setLocais] = useState(() => lerPendentesAgenda(guardadoDoNavegador, dia))

  const txt = (v: unknown): string => (typeof v === 'string' ? v : '')

  /** O que a tela de edição precisa para abrir preenchida. */
  const paraEditar = (i: ItemCardapio): EdicaoItem => ({
    path: caminhoDe(i),
    titulo: i.nome,
    data: dataDe(i),
    hora: txt(i.detalhe.hora),
    local: txt(i.detalhe.local),
    materia: txt(i.detalhe.materia)
  })

  /*
   * As marcas locais valem só até o Cortex confirmar.
   *
   * Elas existem para cobrir o intervalo entre o toque e o cardápio voltar do
   * banco. Depois disso passam a atrapalhar: marquei "não estudei" no celular
   * hoje, o Cortex confirmou, e mais tarde marquei a prova como estudada NO
   * COMPUTADOR — a chave velha faria este celular continuar mostrando "não
   * estudei" até a virada do dia, contra o que o vault diz.
   *
   * Então, assim que o cardápio chega dizendo a mesma coisa que a marca local,
   * a marca é apagada. O que sobra é sempre "pendente de confirmação", nunca
   * uma segunda fonte da verdade concorrendo com o vault.
   */
  useEffect(() => {
    const atuais = jaFeitos(guardadoDoNavegador, dia)
    let mexeu = false
    const conferir = (chave: string, doCardapio: boolean): void => {
      const confirmado = doCardapio ? chave : `nao-${chave}`
      if (!atuais.includes(confirmado)) return
      desmarcarFeito(guardadoDoNavegador, dia, confirmado)
      mexeu = true
    }
    for (const i of provas(p.cardapio.cardapio)) {
      const path = caminhoDe(i)
      if (!path) continue
      conferir(`prova:${path}`, i.detalhe.estudado === true)
      conferir(`insc:${path}`, i.detalhe.inscrito === true)
      conferir(`pago:${path}`, i.detalhe.pago === true)
    }
    if (mexeu) setFeitos(jaFeitos(guardadoDoNavegador, dia))

    /*
     * E o item marcado aqui sai da cópia local assim que o Cortex o devolve.
     *
     * Sem isto ele apareceria DUAS vezes: uma vinda do cardápio e outra da
     * cópia local, que nunca seria apagada.
     */
    const publicados = [
      ...provas(p.cardapio.cardapio).map(i => ({ tipo: 'prova', titulo: i.nome, data: dataDe(i) })),
      ...compromissos(p.cardapio.cardapio)
        .map(i => ({ tipo: 'compromisso', titulo: i.nome, data: dataDe(i) })),
      ...tarefas(p.cardapio.cardapio).map(i => ({ tipo: 'tarefa', titulo: i.nome, data: dataDe(i) }))
    ]
    setLocais(conciliarAgenda(guardadoDoNavegador, dia, publicados))
    // `feitos` fora das dependências de propósito: o efeito lê do disco, não
    // do estado, e listá-lo faria ele rodar de novo por causa da própria
    // limpeza que acabou de fazer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cardapio.cardapio, dia])

  const marcar = (chave: string, montar: () => ReturnType<typeof eventoProvaEstudada>): void => {
    marcarFeito(guardadoDoNavegador, dia, chave)
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    p.envio.registrar(montar())
  }

  /**
   * "Estudei" é um interruptor: apertar de novo desfaz.
   *
   * A chave `nao-prova:…` existe porque quem diz se a prova foi estudada é o
   * cardápio, e ele só volta a dizer a verdade depois que o Cortex republicar.
   * Sem essa marca de "desfiz", a tela continuaria com o check nesse intervalo
   * e o toque seguinte não faria nada — o botão já se daria por marcado.
   */
  const alternar = (
    chave: string, estava: boolean, montar: (feito: boolean) => Evento
  ): void => {
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

  /**
   * A data já passou?
   *
   * O que passou sai desta aba, que é o que está CHEGANDO, e continua no
   * Cortex, no calendário de lá. Não precisa ser apagado: o dentista de
   * ontem aconteceu, e apagá-lo seria dizer que ele nunca existiu.
   */
  const jaPassou = (i: ItemCardapio): boolean => {
    const d = diasAte(dataDe(i), dia)
    return d !== null && d < 0
  }

  /** O estado de uma marca: o cardápio decide, a marca local só adianta. */
  const marcado = (chave: string, doCardapio: boolean): boolean =>
    !feitos.includes(`nao-${chave}`) && (doCardapio || feitos.includes(chave))

  /*
   * Em que pé está uma prova.
   *
   * `inscricao` no cardápio quer dizer "esta prova tem inscrição a fazer" —
   * é o que separa um vestibular de uma prova de cursinho. Sem ela, a prova
   * segue com o velho "estudei", que é o que serve para quem só precisa
   * lembrar de estudar.
   *
   * Com ela, a tela mostra UMA etapa de cada vez, na ordem em que a vida
   * acontece: inscrever, pagar, e depois nada — a partir daí a prova é só a
   * data se aproximando, e um botão a mais ali seria um botão que não tem o
   * que fazer.
   */
  const etapaDe = (i: ItemCardapio, path: string): {
    qual: 'estudo' | 'inscricao' | 'pagamento' | 'pronto'
    feito: boolean
  } => {
    if (i.detalhe.inscricao !== true) {
      return { qual: 'estudo', feito: marcado(`prova:${path}`, i.detalhe.estudado === true) }
    }
    if (!marcado(`insc:${path}`, i.detalhe.inscrito === true)) {
      return { qual: 'inscricao', feito: false }
    }
    if (!marcado(`pago:${path}`, i.detalhe.pago === true)) {
      return { qual: 'pagamento', feito: false }
    }
    return { qual: 'pronto', feito: true }
  }

  /*
   * A busca.
   *
   * Conforme a agenda enche, achar uma coisa vira rolagem — e no celular a
   * lista de provas sozinha já passa da tela. A regra vem de `shared/busca`,
   * a mesma do Ctrl+K do Cortex: digitar "unicamp" tem que achar o mesmo
   * item, na mesma ordem, nos dois lugares.
   *
   * Ordena pelo acerto, e não pela data: quem digitou um nome quer aquele
   * item na frente, não o mais próximo que também bateu.
   */
  const termo = dobra(busca.trim())
  const filtrar = (itens: ItemCardapio[]): ItemCardapio[] => {
    if (!termo) return itens
    return itens
      .map(i => ({
        i,
        // Nome primeiro; depois o que descreve o item; a data por último,
        // para "18 out" ainda achar, sem ganhar de um acerto no nome.
        nota: pontuar(
          [i.nome, txt(i.detalhe.materia), txt(i.detalhe.local), ...formasDaData(dataDe(i), dia)],
          termo
        )
      }))
      .filter((x): x is { i: ItemCardapio; nota: number } => x.nota !== null)
      .sort((a, b) => a.nota - b.nota)
      .map(x => x.i)
  }

  const ps = filtrar(provas(p.cardapio.cardapio))
  const cs = filtrar(compromissos(p.cardapio.cardapio))
  const ts = filtrar(tarefas(p.cardapio.cardapio))

  /*
   * O que foi marcado agora entra na lista no mesmo toque.
   *
   * Antes o item só aparecia depois da volta inteira pelo computador — e quem
   * marcava um compromisso voltava para uma lista idêntica à de antes,
   * concluía que não tinha ido, e marcava de novo.
   *
   * Vira `ItemCardapio` para a lista ser UMA só: dois formatos aqui dentro
   * espalhariam um `if` por cada cartão, e o cartão é o mesmo.
   *
   * Sem `path`, de propósito: a nota ainda não existe, e é isso que desliga
   * editar e excluir nestes cartões — não há arquivo para alcançar.
   */
  const pendentes = filtrar(locais.map(l => ({
    especie: l.tipo,
    nome: l.titulo,
    detalhe: {
      data: l.data,
      hora: l.hora,
      local: l.local,
      materia: l.materia,
      comemorativa: l.comemorativa
    }
  }) as ItemCardapio))


  /*
   * Tudo numa fila só, na ordem em que a vida vai cobrar.
   *
   * Três listas por tipo respondiam "quais provas eu tenho", que não é a
   * pergunta de quem abre esta aba — a pergunta é "o que vem agora". Provas,
   * compromissos e tarefas se misturam e a data manda; o tipo vira etiqueta.
   *
   * Com busca escrita, quem manda é o acerto, e `filtrar` já ordenou assim:
   * digitei um nome, quero aquele item na frente, não o mais próximo que
   * também bateu. Por isso a ordenação por data só acontece sem termo.
   */
  const linhas: Linha[] = [
    ...ps.map((item): Linha => ({ tipo: 'prova', item })),
    ...cs.map((item): Linha => ({ tipo: 'compromisso', item })),
    ...ts.map((item): Linha => ({ tipo: 'tarefa', item })),
    // Os marcados agora entram na mesma fila; a ordem por data cuida do resto.
    ...pendentes.map((item): Linha => ({
      tipo: item.especie === 'prova' || item.especie === 'tarefa'
        ? item.especie
        : 'compromisso',
      item
    }))
  ]
  if (!termo) {
    // Item sem data vai para o fim, e não para o começo: string vazia é o
    // menor texto que existe, e ordenar cru jogaria o indefinido na frente
    // do que tem dia marcado.
    const chave = (l: Linha): string => dataDe(l.item) || '9999-99-99'
    linhas.sort((a, b) => chave(a).localeCompare(chave(b)))
  }

  /*
   * Estudos ligado ou não decide se prova e tarefa existem nesta tela.
   *
   * Quem não acompanha estudos no Cortex não tem prova nem tarefa para ver,
   * e um filtro "Provas" que nunca mostra nada seria uma opção morta.
   */
  const temEstudos = areaLigada(p.cardapio.cardapio, 'conhecimento')

  /** O tipo que o filtro enxerga: a data comemorativa separada do compromisso. */
  const tipoDoFiltro = (l: Linha): Filtro =>
    l.item.detalhe.comemorativa === true ? 'comemorativa' : l.tipo

  /*
   * O que a lista mostra de fato.
   *
   * O que já passou NÃO entra. Antes ele aparecia aqui riscado, e ocupava o
   * topo da lista com o que não pede mais nada de ninguém.
   */
  const visiveis = linhas.filter(l => {
    if (jaPassou(l.item)) return false
    if (!temEstudos && (l.tipo === 'prova' || l.tipo === 'tarefa')) return false
    return filtro === 'todos' || tipoDoFiltro(l) === filtro
  })

  /* Só oferece o tipo que existe para este dono. */
  const cabeEstudos = <T extends string>([t]: [T, string]): boolean =>
    temEstudos || (t !== 'prova' && t !== 'tarefa')
  const filtros = FILTROS.filter(cabeEstudos)
  const tiposMarcar = TIPOS_MARCAR.filter(cabeEstudos)

  /*
   * As faixas.
   *
   * Semana corrida a partir de hoje, e não semana do calendário: na quinta,
   * "esta semana" tem que incluir a segunda que vem, senão a prova de segunda
   * cai em "semana que vem" e parece longe.
   */
  const FAIXAS: { nome: string; ate: number }[] = [
    { nome: 'Esta semana', ate: 7 },
    { nome: 'Semana que vem', ate: 14 },
    { nome: 'Depois', ate: Number.POSITIVE_INFINITY }
  ]
  const faixaDe = (l: Linha): string => {
    const d = diasAte(dataDe(l.item), dia)
    if (d === null) return 'Sem data'
    return (FAIXAS.find(f => d <= f.ate) ?? FAIXAS[FAIXAS.length - 1]).nome
  }

  /* Os grupos saem da lista já ordenada, então cada faixa aparece uma vez só. */
  const grupos: { nome: string; linhas: Linha[] }[] = []
  for (const l of visiveis) {
    const nome = termo ? 'Resultados' : faixaDe(l)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.nome === nome) ultimo.linhas.push(l)
    else grupos.push({ nome, linhas: [l] })
  }

  /* O destaque é o próximo que ainda não passou. Some durante a busca: com um
     termo digitado, o topo da tela é o resultado, não a agenda. */
  const destaque = termo
    ? undefined
    : visiveis.find(l => {
      const d = diasAte(dataDe(l.item), dia)
      return d !== null && d >= 0
    })

  /*
   * Um cartão por tipo.
   *
   * Eram três listas separadas, e para saber o que vem primeiro era preciso ler
   * as três e comparar as datas de cabeça. Agora quem ordena e agrupa é a tela;
   * estas funções só desenham, cada uma com as ações do seu tipo.
   */
  const cartaoProva = (i: ItemCardapio) => {
    const path = caminhoDe(i)
    const apagada = feitos.includes(`apagar:${path}`)
    const etapa = etapaDe(i, path)
    const travado = apagada || path === ''
    return (
      <div
        className={`item item-acao ${etapa.feito || apagada ? 'item-feito' : ''}`}
        key={path || i.nome}
      >
        <div className="item-corpo">
          <span className="item-tipo">{ROTULO.prova}</span>
          <div className="item-nome">{i.nome}</div>
          <Quando data={dataCurta(dataDe(i), dia)} falta={faltam(dataDe(i), dia)} />
          <Sobre partes={[i.detalhe.materia, i.detalhe.local]} />
        </div>

        {/* A etapa da vez ocupa a linha inteira, e o resto se recolhe
            atrás do "⋯". Antes eram três botões competindo pelo mesmo
            espaço em cada card, e o que a pessoa realmente vai fazer
            agora — se inscrever — ficava do tamanho de "excluir". */}
        <div className="item-acoes">
          {etapa.qual === 'estudo' && (
            <button
              className={`acao-lado ${etapa.feito ? 'acao-feita' : ''}`}
              type="button"
              // Sem `disabled` quando feito: é o mesmo botão que desmarca.
              disabled={travado}
              aria-pressed={etapa.feito}
              onClick={() => alternar(
                `prova:${path}`, etapa.feito,
                feito => eventoProvaEstudada(path, dia, feito)
              )}
            >
              {etapa.feito ? 'estudei ✓' : 'estudei'}
            </button>
          )}
          {etapa.qual === 'inscricao' && (
            <button
              className="acao-lado acao-etapa"
              type="button"
              disabled={travado}
              onClick={() => alternar(
                `insc:${path}`, false,
                feito => eventoProvaEtapa(path, 'inscrito', dia, feito)
              )}
            >
              fazer inscrição
            </button>
          )}
          {etapa.qual === 'pagamento' && (
            <button
              className="acao-lado acao-etapa"
              type="button"
              disabled={travado}
              onClick={() => alternar(
                `pago:${path}`, false,
                feito => eventoProvaEtapa(path, 'pago', dia, feito)
              )}
            >
              fazer pagamento
            </button>
          )}
          {/* `pronto` não ganha botão nenhum: inscrito e pago, o que
              sobra da prova é a data chegando. */}
          {etapa.qual === 'pronto' && (
            <span className="acao-pronta">inscrição paga ✓</span>
          )}
          <button
            className="acao-mais"
            type="button"
            aria-label={`ações de ${i.nome}`}
            aria-expanded={aberto === path}
            onClick={() => setAberto(aberto === path ? null : path)}
          >
            ⋯
          </button>
        </div>

        {aberto === path && (
          <div className="item-acoes item-acoes-abertas">
            <button className="acao-lado" type="button" disabled={travado}
              onClick={() => { setAberto(null); p.aoEditar('prova', paraEditar(i)) }}>
              editar
            </button>
            {/* Desfazer a etapa vive aqui, e não no botão da frente: o
                da frente é para andar, e um toque errado nele não pode
                custar o registro da inscrição. */}
            {i.detalhe.inscricao === true && etapa.qual !== 'inscricao' && (
              <button className="acao-lado" type="button" disabled={travado}
                onClick={() => {
                  setAberto(null)
                  const desfazPagamento = etapa.qual === 'pronto'
                  const chave = desfazPagamento ? `pago:${path}` : `insc:${path}`
                  alternar(chave, true, feito => eventoProvaEtapa(
                    path, desfazPagamento ? 'pago' : 'inscrito', dia, feito
                  ))
                }}>
                desfazer {etapa.qual === 'pronto' ? 'pagamento' : 'inscrição'}
              </button>
            )}
            <button
              className="acao-lado acao-destrutiva"
              type="button"
              disabled={travado}
              onClick={() => {
                if (!window.confirm(`Apagar "${i.nome}" do seu Cortex?`)) return
                setAberto(null)
                marcar(`apagar:${path}`, () => eventoItemApagado(path, dia))
              }}
            >
              {apagada ? 'excluída' : 'excluir'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const cartaoCompromisso = (i: ItemCardapio) => {
    const path = caminhoDe(i)
    const apagado = feitos.includes(`apagar:${path}`)
    return (
      <div className={`item item-acao ${apagado ? 'item-feito' : ''}`}
        key={path || i.nome}>
        <div className="item-corpo">
          {/* A data comemorativa sobe como compromisso — a espécie é a mesma
              para não precisar mexer no banco —, e é a marca no detalhe que
              faz a etiqueta dizer o que aquilo é de verdade. */}
          <span className="item-tipo">
            {i.detalhe.comemorativa === true
              ? (txt(i.detalhe.oque) || 'Data comemorativa')
              : ROTULO.compromisso}
          </span>
          <div className="item-nome">{i.nome}</div>
          <Quando
            data={dataCurta(dataDe(i), dia)}
            falta={faltam(dataDe(i), dia)}
            hora={txt(i.detalhe.hora)}
          />
          <Sobre partes={[
            i.detalhe.local,
            typeof i.detalhe.anos === 'number'
              // No dia é "faz"; antes é "vai fazer": a data é a próxima vez
              // que cai, então a idade é a que a pessoa ainda VAI completar.
              ? (dataDe(i) === dia
                ? `faz ${i.detalhe.anos} anos hoje`
                : `vai fazer ${i.detalhe.anos} anos`)
              : ''
          ]} />
        </div>
        {/* Editar antes de excluir: mudar de horário é o que mais
            acontece, e cancelar é a saída. */}
        <div className="item-acoes">
          <button
            className="acao-lado"
            type="button"
            disabled={apagado || path === ''}
            onClick={() => p.aoEditar('compromisso', paraEditar(i))}
          >
            editar
          </button>
          <button
            className="acao-lado acao-destrutiva"
            type="button"
            disabled={apagado || path === ''}
            onClick={() => {
              // Confirmar aqui e o que substitui o "marcar cancelado" de
              // antes: apagar no vault nao tem desfazer pelo celular.
              if (!window.confirm(`Apagar "${i.nome}" do seu Cortex?`)) return
              marcar(`apagar:${path}`, () => eventoItemApagado(path, dia))
            }}
          >
            {apagado ? 'excluído' : 'excluir'}
          </button>
        </div>
      </div>
    )
  }

  const cartaoTarefa = (i: ItemCardapio) => (
    <div className={`item item-acao`}
      key={caminhoDe(i) || i.nome}>
      <div className="item-corpo">
        <span className="item-tipo">{ROTULO.tarefa}</span>
        <div className="item-nome">{i.nome}</div>
        <Quando data={dataCurta(dataDe(i), dia)} falta={faltam(dataDe(i), dia)} />
        <Sobre partes={[i.detalhe.materia]} />
      </div>
    </div>
  )


  return (
    <div className="tema-agenda">
      <Cabecalho titulo="Chegando" />
      {p.cardapio.erro && <Aviso>{p.cardapio.erro}</Aviso>}

      <div className="bloco">
        {/* O que vem primeiro, em tamanho de quem vem primeiro.

            Antes a tela abria com tres listas e a coisa mais perto podia estar
            no fim da terceira. O cartao responde de uma olhada a pergunta que
            faz alguem abrir esta aba: o que e a proxima, e quanto falta. */}
        {destaque && (
          <div className="chegando-heroi">
            <span className="heroi-tipo">
              {destaque.item.detalhe.comemorativa === true
                ? (txt(destaque.item.detalhe.oque) || 'Data comemorativa')
                : ROTULO[destaque.tipo]}
            </span>
            <strong className="heroi-nome">{destaque.item.nome}</strong>
            {typeof destaque.item.detalhe.anos === 'number' && (
              <span className="heroi-quando">
                {dataDe(destaque.item) === dia
                  ? `faz ${destaque.item.detalhe.anos} anos hoje`
                  : `vai fazer ${destaque.item.detalhe.anos} anos`}
              </span>
            )}
            <span className="heroi-quando">
              {[dataCurta(dataDe(destaque.item), dia), txt(destaque.item.detalhe.hora)]
                .filter(x => x !== '').join(' · ')}
            </span>
            <span className="heroi-falta">{faltam(dataDe(destaque.item), dia)}</span>
          </div>
        )}
        {/* Escolher entre três coisas é um seletor, como no resto do app.
            Eram chips que apareciam em cascata depois de um primeiro toque:
            dois gestos, um vocabulário só desta tela, e a largura inteira
            ocupada por algo que se faz de vez em quando. */}
        <Secao nome="Marcar" />
        <div className="marcar">
          <Selecao
            rotulo="O que marcar"
            opcoes={tiposMarcar.map(t => t[1])}
            valor={TIPOS_MARCAR.find(t => t[0] === aMarcar)?.[1] ?? ''}
            aoMudar={nome => {
              const achado = TIPOS_MARCAR.find(t => t[1] === nome)
              if (achado) setAMarcar(achado[0])
            }}
          />
          <button className="btn btn-principal marcar-botao" type="button"
            onClick={() => p.aoMarcar(aMarcar)}>
            Marcar
          </button>
        </div>

        {/* A busca fica acima das listas e some quando não há o que buscar:
            com dois itens na agenda, um campo de procurar é só ruído. */}
        {(provas(p.cardapio.cardapio).length
          + compromissos(p.cardapio.cardapio).length
          + tarefas(p.cardapio.cardapio).length) > 4 && (
          <div className="busca">
            <input
              className="busca-campo"
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="procurar por nome, matéria ou local"
              aria-label="procurar na agenda"
            />
          </div>
        )}

        {/* Separar por tipo. Um seletor, como as outras escolhas do app. */}
        <div className="filtro-agenda">
          <Selecao
            rotulo="Mostrar"
            opcoes={filtros.map(f => f[1])}
            valor={FILTROS.find(f => f[0] === filtro)?.[1] ?? 'Tudo'}
            aoMudar={nome => {
              const achado = FILTROS.find(f => f[1] === nome)
              if (achado) setFiltro(achado[0])
            }}
          />
        </div>

        {visiveis.length === 0 && !p.cardapio.erro && (
          <p className="secao-vazia">
            {termo
              ? `Nada com "${busca.trim()}".`
              : filtro !== 'todos'
                ? 'Nada deste tipo chegando.'
                : `Nada marcado nos próximos dias. Provas, compromissos e tarefas
                 aparecem aqui assim que existirem no Cortex.`}
          </p>
        )}

        {grupos.length > 0 && grupos.map(g => (
          <Fragment key={g.nome}>
            <Secao nome={g.nome} />
            {g.linhas.map(l => (
              l.tipo === 'prova' ? cartaoProva(l.item)
                : l.tipo === 'compromisso' ? cartaoCompromisso(l.item)
                  : cartaoTarefa(l.item)
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/*
 * O detalhe da agenda em duas linhas, e não num fio só.
 *
 * Antes era um `Detalhe` com quatro pedaços colados por "·" — data, quanto
 * falta, matéria e local — numa linha que ainda dividia a largura com três
 * botões. Ela quebrava no meio, e a linha de baixo abria com um "·" órfão
 * ("· a divulgar"), que é o que se lê pior de tudo.
 *
 * Separadas, cada uma responde uma pergunta: `Quando` é quando, e é o que se
 * procura primeiro; `Sobre` é o resto, e pode ficar mais apagado.
 */
function Quando({ data, falta, hora }: { data: string; falta: string; hora?: string }) {
  const partes = [data, hora, falta].filter(x => typeof x === 'string' && x !== '') as string[]
  if (partes.length === 0) return null
  return (
    <div className="item-quando">
      {partes.map((x, i) => (
        // Quanto falta não é hora marcada: fica mais leve, para a data
        // continuar sendo o que salta aos olhos.
        <span key={i} className={x === falta ? 'item-falta' : undefined}>{x}</span>
      ))}
    </div>
  )
}

/** Matéria, local — o que a linha de cima não respondeu. Some quando vazio. */
function Sobre({ partes }: { partes: unknown[] }) {
  const uteis = partes.filter(x => typeof x === 'string' && x !== '') as string[]
  if (uteis.length === 0) return null
  return (
    <div className="item-meta">
      <Detalhe partes={uteis} />
    </div>
  )
}
