import { useState } from 'react'
import { diaLocal, eventoCompromisso, eventoCompromissoEditado } from '../montar'
import { Cabecalho, Botao, Campo, Aviso } from '../componentes'
import type { useEnvio } from '../envio'
import type { Tela } from '../App'

/** O compromisso que a tela abre preenchido, quando é edição e não criação. */
export type EdicaoCompromisso = {
  path: string
  titulo: string
  data: string
  hora: string
  local: string
}

/**
 * Marcar ou mudar um compromisso.
 *
 * A mesma tela para os dois, porque os campos são os mesmos e a diferença é
 * só o que sai no fim: um compromisso novo, ou uma alteração no que já
 * existe. Editar manda apenas os campos preenchidos — o Cortex mexe neles e
 * deixa o resto da nota em paz.
 */
export function Compromisso(p: {
  envio: ReturnType<typeof useEnvio>
  editando?: EdicaoCompromisso | null
  irPara: (t: Tela) => void
}) {
  const e = p.editando
  const [titulo, setTitulo] = useState(e?.titulo ?? '')
  // Já nasce com hoje: a maioria do que se marca no celular é para hoje ou
  // amanhã, e um campo de data vazio é um teclado a mais.
  const [data, setData] = useState(e?.data || diaLocal())
  const [hora, setHora] = useState(e?.hora ?? '')
  const [local, setLocal] = useState(e?.local ?? '')
  const [erro, setErro] = useState<string | null>(null)

  const enviar = (): void => {
    try {
      p.envio.registrar(
        e
          ? eventoCompromissoEditado(e.path, { titulo, data, hora, local }, diaLocal())
          : eventoCompromisso(titulo, data, {
              hora: hora || undefined, local: local || undefined
            }, diaLocal())
      )
      p.irPara('agenda')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'não deu para registrar')
    }
  }

  return (
    <div className="tema-agenda">
      <Cabecalho
        titulo={e ? 'Mudar compromisso' : 'Novo compromisso'}
        aoVoltar={() => p.irPara('agenda')}
      />
      {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="bloco">
        <Campo rotulo="O quê" valor={titulo} aoMudar={setTitulo} dica="Dentista" />
        <div className="par-campos">
          <Campo rotulo="Quando" tipo="date" valor={data} aoMudar={setData} />
          <Campo rotulo="Hora" tipo="time" valor={hora} aoMudar={setHora} />
        </div>
        <Campo rotulo="Onde" valor={local} aoMudar={setLocal} dica="Centro" />
        <Botao tipo="principal" aoClicar={enviar} desligado={titulo.trim() === ''}>
          {e ? 'Salvar mudança' : 'Marcar'}
        </Botao>
      </div>
    </div>
  )
}
