import { useState } from 'react'
import { diaLocal, eventoSessao, type ExercicioFeito } from '../montar'
import { treinos, exerciciosDoTreino } from '../cardapio'
import { Cabecalho, Botao, CampoNumero, Aviso } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

export function Treino(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const modelos = treinos(p.cardapio.cardapio)
  const [escolhido, setEscolhido] = useState<string | null>(null)
  // A carga é o único dado que o celular acrescenta ao treino: o cardápio
  // publica séries e reps, e de propósito não publica carga.
  const [cargas, setCargas] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  const modelo = modelos.find(m => m.nome === escolhido)

  if (!modelo) {
    return (
      <>
        <Cabecalho titulo="Treino" aoVoltar={() => p.irPara('hoje')} />
        {modelos.length === 0 && (
          <Aviso>
            Nenhum treino no cardápio. Publique o cardápio no Cortex, na aba Nuvem.
          </Aviso>
        )}
        <div className="secao">
          {modelos.map(m => (
            <Botao key={m.nome} aoClicar={() => setEscolhido(m.nome)}>{m.nome}</Botao>
          ))}
        </div>
      </>
    )
  }

  const exercicios = exerciciosDoTreino(modelo)

  const enviar = () => {
    try {
      const feitos: ExercicioFeito[] = exercicios.map(e => ({
        nome: e.nome,
        series: e.series,
        reps: e.reps,
        carga: cargas[e.nome] ? Number(cargas[e.nome]) : undefined
      }))
      p.envio.registrar(eventoSessao(modelo.nome, feitos, diaLocal()))
      p.irPara('hoje')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  return (
    <>
      <Cabecalho titulo={modelo.nome} aoVoltar={() => setEscolhido(null)} />
      {erro && <Aviso grave aoFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="secao">
        {exercicios.length === 0 && (
          <p className="nota">Este treino não tem exercícios no cardápio.</p>
        )}
        {exercicios.map(e => (
          <CampoNumero
            key={e.nome}
            rotulo={e.series ? `${e.nome} — ${e.series}x${e.reps ?? ''}` : e.nome}
            valor={cargas[e.nome] ?? ''}
            dica="carga (kg)"
            aoMudar={v => setCargas(c => ({ ...c, [e.nome]: v }))}
          />
        ))}
        <Botao tipo="principal" aoClicar={enviar} desligado={exercicios.length === 0}>
          Registrar treino
        </Botao>
      </div>
    </>
  )
}
