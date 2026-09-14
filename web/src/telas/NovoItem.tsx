import { useState } from 'react'
import {
  diaLocal, dadosComemorativa, eventoCompromisso, eventoItemEditado, eventoProvaNova,
  eventoTarefaNova, eventoDataComemorativa
} from '../montar'
import { guardadoDoNavegador } from '../guardado'
import { guardarPendenteAgenda, pendenteComemorativo } from '../agendaLocal'
import { dataCurta, faltam } from '../cardapio'
import { proximaOcorrencia, anosCompletados, OQUE_COMEMORATIVA } from '@compartilhado/datas'
import { Cabecalho, Botao, Campo, CampoNumero, Selecao, Aviso } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

/** O que se pode marcar do celular na agenda. */
export type TipoNovo = 'compromisso' | 'prova' | 'tarefa' | 'comemorativa'

/**
 * O item que a tela abre preenchido, quando é edição e não criação.
 *
 * Vale para os quatro: compromisso, prova, tarefa e data comemorativa. Quais
 * campos aparecem quem decide é a `FORMA` do tipo, abaixo — uma prova mostra
 * matéria e não mostra hora, e o objeto carrega todos porque quem preenche é a
 * lista, que não sabe qual tipo está mandando.
 */
export type EdicaoItem = {
  path: string
  titulo: string
  data: string
  hora: string
  local: string
  materia: string
  /** Data comemorativa: dia, mês e o ano de começo, como estão na nota. */
  dia?: number
  mes?: number
  ano?: number
  /** Data comemorativa: o que ela é ("aniversário"…). */
  oque?: string
  /** O aniversário de uma pessoa cadastrada: a data vai para a ficha dela. */
  pessoa?: boolean
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

type Quando = { dia: number; mes: number; ano?: number; oque?: string }

/**
 * "O que é" a data: a neutra primeiro, depois a lista do Cortex.
 *
 * "outro" não aparece: ele é a própria "Data comemorativa". O valor vazio não
 * vira etiqueta — o cartão continua dizendo "Data comemorativa".
 */
const OQUE_OPCOES: [valor: string, nome: string][] = [
  ['', 'Data comemorativa'],
  ...OQUE_COMEMORATIVA
    .filter(o => o !== 'outro')
    .map((o): [string, string] => [o, o[0].toUpperCase() + o.slice(1)])
]

/**
 * A forma de cada tipo.
 *
 * Uma tabela, e não quatro telas: todos são título mais data, e o que muda é
 * o rótulo e um ou dois campos. Telas quase iguais divergiriam na primeira
 * correção feita em só uma delas.
 */
const FORMA: Record<TipoNovo, {
  titulo: string
  tituloEdicao: string
  rotuloNome: string
  dicaNome: string
  rotuloData: string
  temHora: boolean
  temLocal: boolean
  temMateria: boolean
}> = {
  compromisso: {
    titulo: 'Novo compromisso', tituloEdicao: 'Mudar compromisso',
    rotuloNome: 'O quê', dicaNome: 'Dentista',
    rotuloData: 'Quando', temHora: true, temLocal: true, temMateria: false
  },
  prova: {
    titulo: 'Nova prova', tituloEdicao: 'Mudar prova',
    rotuloNome: 'Qual prova', dicaNome: 'P1 de física',
    rotuloData: 'Quando', temHora: false, temLocal: true, temMateria: true
  },
  tarefa: {
    titulo: 'Nova tarefa', tituloEdicao: 'Mudar tarefa',
    rotuloNome: 'O quê', dicaNome: 'Trabalho de história',
    rotuloData: 'Prazo', temHora: false, temLocal: false, temMateria: true
  },
  /*
   * Aniversário e afins.
   *
   * Dia, mês e ano em campos separados, como no formulário do Cortex. Antes
   * era uma data inteira com o rótulo "use o ano de quando começou": o seletor
   * nascia com o ano atual, não dava para saber se aquele ano contava, e o
   * Cortex jogava fora o ano corrente — o namoro de 12/01/2026 ficava sem
   * "vai fazer 1 ano", e editar mostrava 2027 como começo. Agora o ano é um
   * campo próprio, em branco quando não se sabe, e a prévia embaixo mostra o
   * que vai aparecer na lista antes de marcar.
   */
  comemorativa: {
    titulo: 'Nova data comemorativa', tituloEdicao: 'Mudar data comemorativa',
    rotuloNome: 'De quem, ou de quê', dicaNome: 'Aniversário de namoro',
    rotuloData: 'Dia',
    temHora: false, temLocal: false, temMateria: false
  }
}

/** O que está errado na data comemorativa, na língua da tela — ou nada. */
function problemaDa(q: Quando, hoje: string): string | null {
  try {
    dadosComemorativa(q, hoje)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'data inválida'
  }
}

/**
 * "Próxima: 12 jan 2027 · em 121 dias · vai fazer 1 ano".
 *
 * A mesma conta da lista (`proximaOcorrencia` e `anosCompletados`), para a
 * prévia nunca prometer uma coisa e a lista mostrar outra.
 */
function previaDa(q: Quando, hoje: string): string {
  const proxima = proximaOcorrencia(q.dia, q.mes, hoje)
  if (!proxima) return ''
  const partes = [`Próxima: ${dataCurta(proxima, hoje)}`, faltam(proxima, hoje)]
  const anos = anosCompletados(q.ano, proxima)
  if (anos !== null && anos > 0) {
    partes.push(`${proxima === hoje ? 'faz' : 'vai fazer'} ${anos} ${anos === 1 ? 'ano' : 'anos'}`)
  }
  return partes.join(' · ')
}

export function NovoItem(p: {
  envio: ReturnType<typeof useEnvio>
  tipo: TipoNovo
  editando?: EdicaoItem | null
  irPara: (t: Tela) => void
}) {
  const e = p.editando
  const f = FORMA[p.tipo]
  const comemorativa = p.tipo === 'comemorativa'

  const [titulo, setTitulo] = useState(e?.titulo ?? '')
  // Já nasce com hoje: a maioria do que se marca no celular é para hoje ou
  // amanhã, e um campo de data vazio é um teclado a mais.
  const [data, setData] = useState(e?.data || diaLocal())
  const [hora, setHora] = useState(e?.hora ?? '')
  const [local, setLocal] = useState(e?.local ?? '')
  const [materia, setMateria] = useState(e?.materia ?? '')
  // A data comemorativa: dia e mês nascem com os da nota (ou com os de hoje,
  // numa criação), e o ano só vem se a nota tiver um.
  const [diaC, setDiaC] = useState(() => String(e?.dia ?? Number((e?.data || diaLocal()).slice(8, 10))))
  const [mesC, setMesC] = useState(() => e?.mes ?? Number((e?.data || diaLocal()).slice(5, 7)))
  const [anoC, setAnoC] = useState(e?.ano !== undefined ? String(e.ano) : '')
  const [oqueC, setOqueC] = useState(e?.oque && e.oque !== 'outro' ? e.oque : '')
  const [erro, setErro] = useState<string | null>(null)

  const hoje = diaLocal()
  const quando: Quando = {
    dia: Number(diaC), mes: mesC, ano: anoC === '' ? undefined : Number(anoC), oque: oqueC || undefined
  }
  const problema = comemorativa ? problemaDa(quando, hoje) : null
  // Ano pela metade é digitação, não erro: nada de aviso no "20" de "2026".
  const digitando = diaC === '' || (anoC !== '' && anoC.length < 4)

  const enviar = (): void => {
    try {
      if (e) {
        p.envio.registrar(eventoItemEditado(
          e.path,
          comemorativa
            // Só o que o formulário dela tem. A marca faz o Cortex gravar
            // dia, mês e ano, e não uma data que a nota não lê.
            ? {
              titulo, ...dadosComemorativa(quando, hoje), comemorativa: true,
              // Aniversário de pessoa: a marca leva a data para a ficha dela,
              // e "o que é" não viaja — aniversário é aniversário.
              ...(e.pessoa ? { pessoa: true, oque: undefined } : {})
            }
            : { titulo, data, hora, local, materia },
          hoje
        ))
      } else if (p.tipo === 'prova') {
        p.envio.registrar(eventoProvaNova(titulo, data, { materia, local }, hoje))
      } else if (p.tipo === 'tarefa') {
        p.envio.registrar(eventoTarefaNova(titulo, data, { materia }, hoje))
      } else if (comemorativa) {
        p.envio.registrar(eventoDataComemorativa(titulo, quando, hoje))
      } else {
        p.envio.registrar(eventoCompromisso(titulo, data, {
          hora: hora || undefined, local: local || undefined
        }, hoje))
      }
      /*
       * Guarda uma cópia local antes de sair da tela.
       *
       * É o que faz o item aparecer na lista NO MESMO TOQUE. Sem isto, ele
       * só nasce depois da volta inteira pelo computador — e quem marcava
       * um compromisso voltava para uma lista idêntica à de antes, concluía
       * que não tinha ido, e marcava de novo.
       *
       * Só na criação: editar já mexe num item que está na tela.
       */
      if (!e) {
        // `p.tipo`, e não o booleano `comemorativa`: é a comparação que estreita
        // o tipo, e o ramo de baixo só aceita os três tipos da agenda comum.
        const pendente = p.tipo === 'comemorativa'
          // A data comemorativa entra na lista na próxima vez que cai.
          ? pendenteComemorativo(titulo, quando, hoje)
          : {
            tipo: p.tipo,
            titulo: titulo.trim(),
            data,
            hora: hora || undefined,
            local: local || undefined,
            materia: materia || undefined
          }
        if (pendente) guardarPendenteAgenda(guardadoDoNavegador, hoje, pendente)
      }
      p.irPara('agenda')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'não deu para registrar')
    }
  }

  return (
    <div className="tema-agenda">
      <Cabecalho
        titulo={e ? (e.pessoa ? 'Mudar aniversário' : f.tituloEdicao) : f.titulo}

      />
      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="bloco">
        <Campo rotulo={f.rotuloNome} valor={titulo} aoMudar={setTitulo} dica={f.dicaNome} />

        {comemorativa ? (
          <>
            {/* Pedido do dono: escolher "Aniversário" faz o cartão dizer
                aniversário em vez de "data comemorativa". */}
            {/* Aniversário de pessoa cadastrada não pergunta o que é. */}
            {!e?.pessoa && (
              <Selecao rotulo="O que é" opcoes={OQUE_OPCOES.map(o => o[1])}
                valor={(OQUE_OPCOES.find(o => o[0] === oqueC) ?? OQUE_OPCOES[0])[1]}
                aoMudar={nome => setOqueC(OQUE_OPCOES.find(o => o[1] === nome)?.[0] ?? '')} />
            )}
            <div className="par-campos">
              <CampoNumero rotulo="Dia" valor={diaC} dica="12"
                aoMudar={v => setDiaC(v.replace(/\D/g, '').slice(0, 2))} />
              <Selecao rotulo="Mês" opcoes={MESES} valor={MESES[mesC - 1] ?? MESES[0]}
                aoMudar={v => setMesC(MESES.indexOf(v) + 1)} />
            </div>
            <CampoNumero
              rotulo={e?.pessoa ? 'Ano de nascimento (se souber)' : 'Ano em que começou (se souber)'}
              valor={anoC} dica="2026"
              aoMudar={v => setAnoC(v.replace(/\D/g, '').slice(0, 4))} />
            {!digitando && (
              <p className={`previa-comemorativa ${problema ? 'previa-erro' : ''}`}>
                {problema ?? previaDa(quando, hoje)}
              </p>
            )}
          </>
        ) : f.temHora ? (
          <div className="par-campos">
            <Campo rotulo={f.rotuloData} tipo="date" valor={data} aoMudar={setData} />
            <Campo rotulo="Hora" tipo="time" valor={hora} aoMudar={setHora} />
          </div>
        ) : (
          <Campo rotulo={f.rotuloData} tipo="date" valor={data} aoMudar={setData} />
        )}

        {/* Sem `&& !e`: a matéria agora também é editável, e escondê-la na
            edição fazia trocar a matéria de uma prova exigir o computador. */}
        {f.temMateria && (
          <Campo rotulo="Matéria" valor={materia} aoMudar={setMateria} dica="física" />
        )}
        {f.temLocal && (
          <Campo rotulo="Onde" valor={local} aoMudar={setLocal} dica="Centro" />
        )}

        <Botao
          tipo="principal"
          aoClicar={enviar}
          desligado={titulo.trim() === '' || problema !== null}
        >
          {e ? 'Salvar mudança' : 'Marcar'}
        </Botao>
      </div>
    </div>
  )
}
