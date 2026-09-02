import { useState } from 'react'
import {
  diaLocal, eventoCompromisso, eventoItemEditado, eventoProvaNova, eventoTarefaNova
} from '../montar'
import { Cabecalho, Botao, Campo, Aviso } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

/** O que se pode marcar do celular na agenda. */
export type TipoNovo = 'compromisso' | 'prova' | 'tarefa'

/**
 * O item que a tela abre preenchido, quando é edição e não criação.
 *
 * Vale para os três: compromisso, prova e tarefa. Quais campos aparecem quem
 * decide é a `FORMA` do tipo, abaixo — uma prova mostra matéria e não mostra
 * hora, e o objeto carrega todos porque quem preenche é a lista, que não sabe
 * qual tipo está mandando.
 */
export type EdicaoItem = {
  path: string
  titulo: string
  data: string
  hora: string
  local: string
  materia: string
}

/**
 * A forma de cada tipo.
 *
 * Uma tabela, e não três telas: os três são título mais data, e o que muda é
 * o rótulo e um ou dois campos. Três arquivos quase iguais divergiriam na
 * primeira correção feita em só um deles.
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
  }
}

export function NovoItem(p: {
  envio: ReturnType<typeof useEnvio>
  tipo: TipoNovo
  editando?: EdicaoItem | null
  irPara: (t: Tela) => void
}) {
  const e = p.editando
  const f = FORMA[p.tipo]

  const [titulo, setTitulo] = useState(e?.titulo ?? '')
  // Já nasce com hoje: a maioria do que se marca no celular é para hoje ou
  // amanhã, e um campo de data vazio é um teclado a mais.
  const [data, setData] = useState(e?.data || diaLocal())
  const [hora, setHora] = useState(e?.hora ?? '')
  const [local, setLocal] = useState(e?.local ?? '')
  const [materia, setMateria] = useState(e?.materia ?? '')
  const [erro, setErro] = useState<string | null>(null)

  const enviar = (): void => {
    try {
      const hoje = diaLocal()
      if (e) {
        p.envio.registrar(eventoItemEditado(
          e.path, { titulo, data, hora, local, materia }, hoje
        ))
      } else if (p.tipo === 'prova') {
        p.envio.registrar(eventoProvaNova(titulo, data, { materia, local }, hoje))
      } else if (p.tipo === 'tarefa') {
        p.envio.registrar(eventoTarefaNova(titulo, data, { materia }, hoje))
      } else {
        p.envio.registrar(eventoCompromisso(titulo, data, {
          hora: hora || undefined, local: local || undefined
        }, hoje))
      }
      p.irPara('agenda')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'não deu para registrar')
    }
  }

  return (
    <div className="tema-agenda">
      <Cabecalho
        titulo={e ? f.tituloEdicao : f.titulo}
        aoVoltar={() => p.irPara('agenda')}
      />
      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="bloco">
        <Campo rotulo={f.rotuloNome} valor={titulo} aoMudar={setTitulo} dica={f.dicaNome} />

        {f.temHora ? (
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

        <Botao tipo="principal" aoClicar={enviar} desligado={titulo.trim() === ''}>
          {e ? 'Salvar mudança' : 'Marcar'}
        </Botao>
      </div>
    </div>
  )
}
