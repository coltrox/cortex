import { useEffect, useState } from 'react'
import { guardadoDoNavegador } from '../guardado'
import { diaLocal, eventoProvaEstudada, eventoItemApagado } from '../montar'
import { provas, compromissos, tarefas, caminhoDe, dataDe, faltam, dataCurta } from '../cardapio'
import { jaFeitos, marcarFeito, desmarcarFeito } from '../feitos'
import { Cabecalho, Botao, Aviso, Secao, Detalhe } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'
import type { ItemCardapio } from '@compartilhado/eventos'
import type { EdicaoItem, TipoNovo } from './NovoItem'

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
    for (const i of provas(p.cardapio.cardapio)) {
      const path = caminhoDe(i)
      if (!path) continue
      const confirmado = i.detalhe.estudado === true ? `prova:${path}` : `nao-prova:${path}`
      if (atuais.includes(confirmado)) {
        desmarcarFeito(guardadoDoNavegador, dia, confirmado)
        mexeu = true
      }
    }
    if (mexeu) setFeitos(jaFeitos(guardadoDoNavegador, dia))
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
  const alternarEstudei = (path: string, estava: boolean): void => {
    const chave = `prova:${path}`
    const anti = `nao-${chave}`
    if (estava) {
      marcarFeito(guardadoDoNavegador, dia, anti)
      desmarcarFeito(guardadoDoNavegador, dia, chave)
    } else {
      marcarFeito(guardadoDoNavegador, dia, chave)
      desmarcarFeito(guardadoDoNavegador, dia, anti)
    }
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    p.envio.registrar(eventoProvaEstudada(path, dia, !estava))
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
        {/* Os mesmos chips do Cortex: marcar algo daqui e um toque, e a
            fileira mostra de uma vez o que da para marcar. */}
        <Secao nome="Marcar" />
        <div className="chips">
          {([
            ['compromisso', '+ Compromisso'],
            ['prova', '+ Prova'],
            ['tarefa', '+ Tarefa']
          ] as [TipoNovo, string][]).map(([t, rotulo]) => (
            <button key={t} className="chip" type="button" onClick={() => p.aoMarcar(t)}>
              {rotulo}
            </button>
          ))}
        </div>

        {vazio && !p.cardapio.erro && (
          <p className="secao-vazia">
            Nada marcado nos próximos dias. Provas, compromissos e tarefas
            aparecem aqui assim que existirem no Cortex.
          </p>
        )}

        {ps.length > 0 && <Secao nome="Provas" />}
        {ps.map(i => {
          const path = caminhoDe(i)
          const apagada = feitos.includes(`apagar:${path}`)
          const feito = !feitos.includes(`nao-prova:${path}`)
            && (i.detalhe.estudado === true || feitos.includes(`prova:${path}`))
          return (
            <div className={`item item-acao ${feito || apagada ? 'item-feito' : ''}`}
              key={path || i.nome}>
              <div className="item-corpo">
                <div className="item-nome">{i.nome}</div>
                <Quando data={dataCurta(dataDe(i), dia)} falta={faltam(dataDe(i), dia)} />
                <Sobre partes={[i.detalhe.materia, i.detalhe.local]} />
              </div>
              <div className="item-acoes">
                <button
                  className={`acao-lado ${feito ? 'acao-feita' : ''}`}
                  type="button"
                  // Sem `disabled` quando feito: é o mesmo botão que desmarca.
                  disabled={apagada || path === ''}
                  aria-pressed={feito}
                  onClick={() => alternarEstudei(path, feito)}
                >
                  {feito ? 'estudei ✓' : 'estudei'}
                </button>
                <button
                  className="acao-lado"
                  type="button"
                  disabled={apagada || path === ''}
                  onClick={() => p.aoEditar('prova', paraEditar(i))}
                >
                  editar
                </button>
                <button
                  className="acao-lado acao-destrutiva"
                  type="button"
                  disabled={apagada || path === ''}
                  onClick={() => {
                    if (!window.confirm(`Apagar "${i.nome}" do seu Cortex?`)) return
                    marcar(`apagar:${path}`, () => eventoItemApagado(path, dia))
                  }}
                >
                  {apagada ? 'excluída' : 'excluir'}
                </button>
              </div>
            </div>
          )
        })}

        {cs.length > 0 && <Secao nome="Compromissos" />}
        {cs.map(i => {
          const path = caminhoDe(i)
          const apagado = feitos.includes(`apagar:${path}`)
          return (
            <div className={`item item-acao ${apagado ? 'item-feito' : ''}`}
              key={path || i.nome}>
              <div className="item-corpo">
                <div className="item-nome">{i.nome}</div>
                <Quando
                  data={dataCurta(dataDe(i), dia)}
                  falta={faltam(dataDe(i), dia)}
                  hora={txt(i.detalhe.hora)}
                />
                <Sobre partes={[i.detalhe.local]} />
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
        })}

        {ts.length > 0 && <Secao nome="Tarefas" />}
        {ts.map(i => (
          <div className="item item-acao" key={caminhoDe(i) || i.nome}>
            <div className="item-corpo">
              <div className="item-nome">{i.nome}</div>
              <Quando data={dataCurta(dataDe(i), dia)} falta={faltam(dataDe(i), dia)} />
              <Sobre partes={[i.detalhe.materia]} />
            </div>
          </div>
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
