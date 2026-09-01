import { useState } from 'react'
import { guardadoDoNavegador } from '../guardado'
import { diaLocal, eventoProvaEstudada, eventoCompromissoCancelado } from '../montar'
import { provas, compromissos, tarefas, caminhoDe, dataDe, faltam } from '../cardapio'
import { jaFeitos, marcarFeito } from '../feitos'
import { Cabecalho, Botao, Aviso } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

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
}) {
  const dia = diaLocal()
  const [feitos, setFeitos] = useState<string[]>(() => jaFeitos(guardadoDoNavegador, dia))

  const marcar = (chave: string, montar: () => ReturnType<typeof eventoProvaEstudada>): void => {
    marcarFeito(guardadoDoNavegador, dia, chave)
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    p.envio.registrar(montar())
  }

  const ps = provas(p.cardapio.cardapio)
  const cs = compromissos(p.cardapio.cardapio)
  const ts = tarefas(p.cardapio.cardapio)
  const vazio = ps.length === 0 && cs.length === 0 && ts.length === 0

  return (
    <>
      <Cabecalho titulo="Chegando" aoVoltar={() => p.irPara('hoje')} />
      {p.cardapio.erro && <Aviso>{p.cardapio.erro}</Aviso>}

      <div className="secao">
        <Botao aoClicar={() => p.irPara('compromisso')}>Novo compromisso</Botao>

        {vazio && !p.cardapio.erro && (
          <p className="nota">
            Nada marcado nos próximos dias. Provas, compromissos e tarefas
            aparecem aqui assim que existirem no Cortex.
          </p>
        )}

        {ps.length > 0 && <h2>Provas</h2>}
        {ps.map(i => {
          const path = caminhoDe(i)
          const feito = i.detalhe.estudado === true || feitos.includes(`prova:${path}`)
          return (
            <div className={`item ${feito ? 'feito' : ''}`} key={path || i.nome}>
              <div className="item-texto">
                <strong>{i.nome}</strong>
                <small>
                  {[faltam(dataDe(i), dia), i.detalhe.materia, i.detalhe.local]
                    .filter(x => typeof x === 'string' && x !== '').join(' · ')}
                </small>
              </div>
              <button
                className="item-acao"
                disabled={feito || path === ''}
                onClick={() => marcar(`prova:${path}`, () => eventoProvaEstudada(path, dia))}
              >
                {feito ? 'estudei ✓' : 'estudei'}
              </button>
            </div>
          )
        })}

        {cs.length > 0 && <h2>Compromissos</h2>}
        {cs.map(i => {
          const path = caminhoDe(i)
          const cancelado = feitos.includes(`cancelar:${path}`)
          return (
            <div className={`item ${cancelado ? 'feito' : ''}`} key={path || i.nome}>
              <div className="item-texto">
                <strong>{i.nome}</strong>
                <small>
                  {[faltam(dataDe(i), dia), i.detalhe.hora, i.detalhe.local]
                    .filter(x => typeof x === 'string' && x !== '').join(' · ')}
                </small>
              </div>
              <button
                className="item-acao perigo"
                disabled={cancelado || path === ''}
                onClick={() => marcar(
                  `cancelar:${path}`, () => eventoCompromissoCancelado(path, dia)
                )}
              >
                {cancelado ? 'cancelado' : 'cancelar'}
              </button>
            </div>
          )
        })}

        {ts.length > 0 && <h2>Tarefas</h2>}
        {ts.map(i => (
          <div className="item" key={caminhoDe(i) || i.nome}>
            <div className="item-texto">
              <strong>{i.nome}</strong>
              <small>
                {[faltam(dataDe(i), dia), i.detalhe.materia]
                  .filter(x => typeof x === 'string' && x !== '').join(' · ')}
              </small>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
