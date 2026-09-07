import { useEffect, useState } from 'react'
import { guardadoDoNavegador } from '../guardado'
import { diaLocal, eventoProvaEstudada, eventoProvaEtapa, eventoItemApagado } from '../montar'
import type { Evento } from '@compartilhado/eventos'
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
  /** O "+ Marcar" foi tocado e a tela está perguntando de que tipo. */
  const [escolhendo, setEscolhendo] = useState(false)
  /** O caminho da nota cujas ações estão abertas — uma de cada vez. */
  const [aberto, setAberto] = useState<string | null>(null)

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
        {/* Um botão só, e a escolha do tipo em seguida.
            Três chips lado a lado ocupavam a largura inteira da tela para uma
            coisa que se faz de vez em quando, e empurravam para baixo o que a
            aba existe para mostrar: o que está chegando. */}
        <Secao nome="Marcar" />
        {escolhendo ? (
          <div className="chips">
            {([
              ['compromisso', 'Compromisso'],
              ['prova', 'Prova'],
              ['tarefa', 'Tarefa']
            ] as [TipoNovo, string][]).map(([t, rotulo]) => (
              <button key={t} className="chip" type="button"
                onClick={() => { setEscolhendo(false); p.aoMarcar(t) }}>
                {rotulo}
              </button>
            ))}
            <button className="chip" type="button" onClick={() => setEscolhendo(false)}>
              cancelar
            </button>
          </div>
        ) : (
          <div className="chips">
            <button className="chip chip-ligado" type="button"
              onClick={() => setEscolhendo(true)}>
              + Marcar
            </button>
          </div>
        )}

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
          const etapa = etapaDe(i, path)
          const travado = apagada || path === ''
          return (
            <div
              className={`item item-acao ${etapa.feito || apagada ? 'item-feito' : ''}`}
              key={path || i.nome}
            >
              <div className="item-corpo">
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
