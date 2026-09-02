import { useState } from 'react'
import { guardadoDoNavegador } from '../guardado'
import { diaLocal, eventoProvaEstudada, eventoCompromissoCancelado } from '../montar'
import { provas, compromissos, tarefas, caminhoDe, dataDe, faltam } from '../cardapio'
import { jaFeitos, marcarFeito } from '../feitos'
import { Cabecalho, Botao, Aviso, Secao, Detalhe } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'
import type { EdicaoCompromisso } from './Compromisso'

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
  aoEditar: (c: EdicaoCompromisso) => void
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
    <div className="tema-agenda">
      <Cabecalho titulo="Chegando" aoVoltar={() => p.irPara('hoje')} />
      {p.cardapio.erro && <Aviso>{p.cardapio.erro}</Aviso>}

      <div className="bloco">
        <Botao aoClicar={() => p.irPara('compromisso')}>Novo compromisso</Botao>

        {vazio && !p.cardapio.erro && (
          <p className="secao-vazia">
            Nada marcado nos próximos dias. Provas, compromissos e tarefas
            aparecem aqui assim que existirem no Cortex.
          </p>
        )}

        {ps.length > 0 && <Secao nome="Provas" />}
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

        {cs.length > 0 && <Secao nome="Compromissos" />}
        {cs.map(i => {
          const path = caminhoDe(i)
          const cancelado = feitos.includes(`cancelar:${path}`)
          const texto = (k: string): string =>
            typeof i.detalhe[k] === 'string' ? (i.detalhe[k] as string) : ''
          return (
            <div className={`item item-acao ${cancelado ? 'item-feito' : ''}`}
              key={path || i.nome}>
              <div className="item-corpo">
                <div className="item-nome">{i.nome}</div>
                <div className="item-meta">
                  <Detalhe partes={[faltam(dataDe(i), dia), i.detalhe.hora, i.detalhe.local]} />
                </div>
              </div>
              {/* Editar antes de excluir: mudar de horário é o que mais
                  acontece, e cancelar é a saída. */}
              <button
                className="acao-lado"
                type="button"
                disabled={cancelado || path === ''}
                onClick={() => p.aoEditar({
                  path,
                  titulo: i.nome,
                  data: dataDe(i),
                  hora: texto('hora'),
                  local: texto('local')
                })}
              >
                editar
              </button>
              <button
                className="acao-lado acao-destrutiva"
                type="button"
                disabled={cancelado || path === ''}
                onClick={() => marcar(
                  `cancelar:${path}`, () => eventoCompromissoCancelado(path, dia)
                )}
              >
                {cancelado ? 'excluído' : 'excluir'}
              </button>
            </div>
          )
        })}

        {ts.length > 0 && <Secao nome="Tarefas" />}
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
    </div>
  )
}
