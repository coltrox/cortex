import {
  Bloco, Cartao, Secao, Titulo, Linha, ListaNotas, Check, Vazio, Progresso, Prazo,
  moeda, nf, num, txt, lista, textos, porData, type PropsLente
} from './base'
import {
  suplementosDoDia, rotinasDoDia, anotacoesDoDia, datasComemorativas, totaisDoDia, refeicoesDoDia
} from '../dados'
import { diasAte } from '../subnav'

/**
 * Hoje.
 *
 * Não é uma lente a mais: é o corte transversal de todas as outras no dia de
 * hoje. Nada aqui tem tipo próprio — tudo já existe em Saúde, Grana, Estudos
 * e Vida, e esta tela só pergunta "o que disso é de hoje?".
 *
 * Por isso ela também é o lugar certo para marcar as coisas: o suplemento que
 * você tomou, a refeição que fez, o treino que rolou. Marcar aqui grava no
 * diário do dia, o mesmo arquivo que as outras lentes leem.
 *
 * Redesign: os quatro números do dia no topo e, abaixo, duas trilhas. A
 * principal é o que se FAZ hoje, uma seção embaixo da outra; a lateral é o
 * que se CONSULTA — prioridades, agenda, datas, provas. Cada seção mora num
 * bloco próprio, para dar para ver onde uma termina e a outra começa. Pedido
 * do dono depois da primeira versão em grade: "muita coisa na tela, estou
 * ficando perdido".
 */

const DIA_EXTENSO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

function porExtenso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${DIA_EXTENSO[new Date(a, m - 1, d).getDay()]}, ${d} de ${MESES[m - 1]}`
}

/** "Bom dia", "Boa tarde" ou "Boa noite", pela hora do computador. */
function cumprimento(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function LenteHoje({
  notas, hoje, aoAbrir, aoAdicionar, aoEditar, aoExcluir, aoLancar, aoAlterar,
  aoMarcarDia, aoModal
}: PropsLente) {
  const doDia = notas.filter(n => n.date === hoje)
  const diario = doDia.find(n => n.tipo === 'diario')
  const sessao = doDia.find(n => n.tipo === 'sessao')
  const cardio = doDia.find(n => n.tipo === 'cardio')

  const transacoes = [...lista(diario?.campos.transacoes), ...lista(diario?.campos.gastos)]
  const saiu = transacoes
    .filter(t => txt(t.dir) !== 'entrada')
    .reduce((s, t) => s + num(t.valor), 0)

  const planoAtivo = notas.find(n => n.tipo === 'plano' && n.campos.ativo === true)
  // Só as de hoje: o pré-treino de segunda a sexta some no fim de semana.
  const refeicoes = refeicoesDoDia(planoAtivo, hoje)
  const feitas = textos(diario?.campos.dieta_feitas)
  const extras = lista(diario?.campos.extras)
  const { kcal } = totaisDoDia(planoAtivo, diario)
  const metaKcal = planoAtivo ? num(planoAtivo.campos.kcal) : 0

  const suplementos = suplementosDoDia(notas, hoje)
  const tomados = textos(diario?.campos.suplementos_feitos)

  /*
   * Tarefas do dia e anotações: as duas metades de "como foi hoje?".
   *
   * `rotinas_feitas` é o mesmo conjunto que o celular usa — marcar aqui
   * desmarca lá, e o contrário também. Ver `montarCardapio`.
   */
  const rotinas = rotinasDoDia(notas, hoje)
  const rotinasFeitas = textos(diario?.campos.rotinas_feitas)
  // Conta só as de hoje: o conjunto do diário pode guardar o nome de uma
  // rotina de outro dia da semana, e "4/3 feitas" seria um número impossível.
  const rotinasDeHojeFeitas = rotinas.filter(r => rotinasFeitas.includes(r.title)).length
  const pctTarefas = rotinas.length ? Math.round((rotinasDeHojeFeitas / rotinas.length) * 100) : 0
  const anotacoes = anotacoesDoDia(notas, hoje)
  const comemorativas = datasComemorativas(notas, hoje)

  const compromissosHoje = doDia.filter(n =>
    n.tipo === 'evento' || n.tipo === 'consulta' || n.tipo === 'prova')
  const proximos = notas
    .filter(n => n.date && n.date > hoje &&
      (n.tipo === 'evento' || n.tipo === 'consulta' || n.tipo === 'tarefa'))
    .sort(porData).slice(0, 6)
  const provas = notas.filter(n => n.tipo === 'prova' && n.date && n.date >= hoje).sort(porData)

  const lendo = notas.filter(n => n.tipo === 'livro' && txt(n.campos.status) === 'lendo')
  // Mais de uma, a pedido do dono: cada meta marcada como prioridade aparece.
  const prioridades = notas.filter(n => n.tipo === 'objetivo' && n.campos.prioridade === true)
  const modelos = notas.filter(n => n.tipo === 'treino-modelo')

  /*
   * A saudação diz o que falta, com o que existe — nada inventado. Cada pedaço
   * só entra quando tem dado: sem tarefa para hoje, ele não fala de tarefa.
   */
  const pendentes = rotinas.length - rotinasDeHojeFeitas
  const proximaProva = provas[0]
  const contexto = [
    rotinas.length > 0 && (pendentes === 0
      ? 'tarefas do dia feitas'
      : `${pendentes} ${pendentes === 1 ? 'tarefa' : 'tarefas'} para hoje`),
    compromissosHoje.length > 0 &&
      `${compromissosHoje.length} ${compromissosHoje.length === 1 ? 'compromisso' : 'compromissos'} hoje`,
    proximaProva?.date && (() => {
      const d = diasAte(proximaProva.date, hoje)
      return d === 0 ? `${proximaProva.title} é hoje` : `${proximaProva.title} em ${d} ${d === 1 ? 'dia' : 'dias'}`
    })()
  ].filter((x): x is string => typeof x === 'string')
  const saudacao = `${cumprimento()}.${contexto.length ? ` ${contexto.join(' · ')}.` : ''}`

  return (
    <div className="lente lente-hoje">
      <Titulo nome="Hoje" sub={porExtenso(hoje)} saudacao={saudacao} />

      {/* Resumo: os quatro números do dia. */}
      <div className="cartoes hoje-resumo">
        <Cartao
          rotulo="Treino"
          valor={sessao ? txt(sessao.campos.modelo) || 'feito' : (cardio ? txt(cardio.campos.aparelho) : '—')}
          nota={sessao
            ? `${lista(sessao.campos.exercicios).length} exercícios`
            : (cardio ? `${num(cardio.campos.minutos)} min` : 'nada registrado ainda')}
        />
        <Cartao
          rotulo="Calorias"
          valor={kcal ? `${nf.format(kcal).replace(/,00$/, '')} kcal` : '—'}
          nota={metaKcal ? `meta diária ${metaKcal} kcal` : `${feitas.length} refeições`}
        />
        <Cartao
          rotulo="Gasto do dia"
          valor={saiu ? moeda(saiu) : '—'}
          tom={saiu ? 'saida' : undefined}
          nota={transacoes.length === 1 ? '1 lançamento' : `${transacoes.length} lançamentos`}
        />
        <Cartao
          rotulo="Tarefas"
          valor={rotinas.length ? `${rotinasDeHojeFeitas} / ${rotinas.length}` : '—'}
          nota={rotinas.length === 0
            ? 'nenhuma para hoje'
            : rotinasDeHojeFeitas === rotinas.length ? 'tudo feito' : `${pctTarefas}%`}
        />
      </div>

      <div className="hoje-layout">
        {/* ---------- O que se faz hoje ---------- */}
        <div className="hoje-principal">
          <Bloco>
            <Secao
              nome="Treino de hoje"
              acao="Cardio"
              aoClicar={() => aoAdicionar('cardio', { date: hoje })}
              direita={
                <button className="btn" onClick={() => aoModal('registro-treino')}>
                  {sessao ? 'Registrar outro' : 'Registrar treino'}
                </button>
              }
            />
            {!sessao && !cardio ? (
              modelos.length === 0
                ? <Vazio titulo="Nenhum treino montado">Monte um em Saúde › Treinos para registrar aqui.</Vazio>
                : (
                  <div className="chips">
                    {modelos.map(m => (
                      <button key={m.path} className="chip"
                        onClick={() => aoModal('registro-treino', { modelo: m.path })}>
                        {m.title}
                      </button>
                    ))}
                  </div>
                )
            ) : (
              <div className="lista-notas">
                {sessao && (
                  <Linha aoAbrir={() => aoAbrir(sessao.path)} aoEditar={() => aoEditar(sessao)}
                    aoExcluir={() => aoExcluir(sessao)}>
                    <span className="linha-titulo">{txt(sessao.campos.modelo) || sessao.title}</span>
                    <span className="linha-valor">
                      {lista(sessao.campos.exercicios)
                        .filter(e => txt(e.carga))
                        .map(e => `${txt(e.nome)} ${txt(e.carga)}`).join(' · ') || 'sem cargas anotadas'}
                    </span>
                  </Linha>
                )}
                {cardio && (
                  <Linha aoAbrir={() => aoAbrir(cardio.path)} aoEditar={() => aoEditar(cardio)}
                    aoExcluir={() => aoExcluir(cardio)}>
                    <span className="tipo" data-t="cardio">{txt(cardio.campos.aparelho)}</span>
                    <span className="linha-titulo">{num(cardio.campos.minutos)} min</span>
                    <span className="linha-valor">{txt(cardio.campos.pace)}</span>
                  </Linha>
                )}
              </div>
            )}
          </Bloco>

          <Bloco>
            <Secao nome="Tarefas do dia" acao="Tarefa diária" aoClicar={() => aoAdicionar('rotina')}
              direita={rotinas.length > 0
                ? <span className="secao-total">{rotinasDeHojeFeitas}/{rotinas.length}</span>
                : undefined} />
            {rotinas.length === 0 ? (
              <Vazio titulo="Nenhuma tarefa para hoje" acao="Criar tarefa diária" aoClicar={() => aoAdicionar('rotina')}>
                Tarefas diárias aparecem aqui nos dias da semana escolhidos.
              </Vazio>
            ) : (
              <div className="lista-notas">
                {rotinas.map(r => {
                  const feito = rotinasFeitas.includes(r.title)
                  return (
                    <Linha key={r.path} aoAbrir={() => aoAbrir(r.path)} aoEditar={() => aoEditar(r)}>
                      <Check feito={feito} rotulo={r.title}
                        aoAlternar={() => aoMarcarDia(hoje, {
                          rotinas_feitas: feito
                            ? rotinasFeitas.filter(f => f !== r.title)
                            : [...rotinasFeitas, r.title]
                        })} />
                      <span className="linha-titulo" data-feito={feito}>{r.title}</span>
                      <span className="tipo">{txt(r.campos.quando)}</span>
                    </Linha>
                  )
                })}
              </div>
            )}
          </Bloco>

          <Bloco>
            <Secao
              nome="Suplementos"
              acao="Suplemento"
              aoClicar={() => aoAdicionar('suplemento')}
              direita={suplementos.length > 0
                ? <span className="secao-total">{tomados.filter(t => suplementos.some(s => s.title === t)).length}/{suplementos.length}</span>
                : undefined}
            />
            {suplementos.length === 0 ? <Vazio>Nenhum suplemento para hoje.</Vazio> : (
              <div className="lista-notas">
                {suplementos.map(s => {
                  const feito = tomados.includes(s.title)
                  return (
                    <Linha key={s.path} aoAbrir={() => aoAbrir(s.path)}>
                      <Check feito={feito} rotulo={s.title}
                        aoAlternar={() => aoMarcarDia(hoje, {
                          suplementos_feitos: feito ? tomados.filter(t => t !== s.title) : [...tomados, s.title]
                        })} />
                      <span className="linha-titulo" data-feito={feito}>{s.title}</span>
                      <span className="linha-valor">{txt(s.campos.dose)}</span>
                      <span className="tipo">{txt(s.campos.quando)}</span>
                    </Linha>
                  )
                })}
              </div>
            )}
          </Bloco>

          <Bloco>
            <Secao nome="Dieta" acao="Comi algo a mais" aoClicar={() => aoLancar('refeicao', hoje)} />
            {!planoAtivo ? (
              <Vazio titulo="Nenhum plano ativo">Ative um plano em Saúde › Dieta para acompanhar as refeições.</Vazio>
            ) : (
              <>
                {metaKcal > 0 && (
                  <Progresso feito={kcal} total={metaKcal} rotulo={`${kcal} de ${metaKcal} kcal`} />
                )}
                <div className="lista-notas">
                  {refeicoes.map((r, i) => {
                    const nome = txt(r.nome) || `Refeição ${i + 1}`
                    const feito = feitas.includes(nome)
                    return (
                      <Linha key={i}>
                        <Check feito={feito} rotulo={nome}
                          aoAlternar={() => aoMarcarDia(hoje, {
                            dieta_feitas: feito ? feitas.filter(f => f !== nome) : [...feitas, nome]
                          })} />
                        <span className="linha-data">{txt(r.hora)}</span>
                        <span className="linha-titulo" data-feito={feito}>{nome}</span>
                        <span className="linha-valor">{num(r.kcal)} kcal</span>
                      </Linha>
                    )
                  })}
                  {extras.map((e, i) => (
                    <Linha key={`x${i}`}>
                      <span className="tipo" data-t="alerta">extra</span>
                      <span className="linha-titulo">{txt(e.item)}</span>
                      <span className="linha-valor">{num(e.kcal)} kcal</span>
                    </Linha>
                  ))}
                </div>
              </>
            )}
          </Bloco>

          <Bloco>
            <Secao nome="Anotações de hoje" acao="Anotação" aoClicar={() => aoAdicionar('anotacao', { date: hoje })} />
            {anotacoes.length === 0 ? (
              <Vazio titulo="Nada anotado hoje" acao="Nova anotação" aoClicar={() => aoAdicionar('anotacao', { date: hoje })}>
                Uma ideia, algo que aconteceu, um lembrete — fica guardado no dia.
              </Vazio>
            ) : (
              <div className="lista-notas">
                {anotacoes.map(a => (
                  <Linha key={a.path} aoAbrir={() => aoAbrir(a.path)}
                    aoEditar={() => aoEditar(a)} aoExcluir={() => aoExcluir(a)}>
                    {/* A estrela ocupa a coluna do check das listas de cima, para as
                        linhas não dançarem de indentação entre uma seção e outra. */}
                    <span className="pin" data-vazio={a.campos.prioridade === true ? undefined : 'sim'}>★</span>
                    <span className="linha-titulo">{a.title}</span>
                    <span className="linha-valor">
                      {txt(a.campos.texto) !== a.title ? txt(a.campos.texto) : ''}
                    </span>
                  </Linha>
                ))}
              </div>
            )}
          </Bloco>

          <Bloco>
            <Secao nome="Gastos de hoje" acao="Transação" aoClicar={() => aoLancar('transacao', hoje)} />
            {transacoes.length === 0 ? (
              <Vazio titulo="Nenhuma transação hoje" acao="Registrar transação" aoClicar={() => aoLancar('transacao', hoje)}>
                Registre um gasto ou uma entrada para acompanhar o dia.
              </Vazio>
            ) : (
              <div className="lista-notas">
                {transacoes.map((t, i) => {
                  const entrada = txt(t.dir) === 'entrada'
                  return (
                    <Linha key={i} aoAbrir={diario ? () => aoAbrir(diario.path) : undefined}>
                      <span className="seta" data-d={entrada ? 'entrada' : 'saida'}>{entrada ? '↑' : '↓'}</span>
                      <span className="linha-titulo">{txt(t.item)}</span>
                      <span className="tipo">{txt(t.cat)}</span>
                      <span className="linha-valor" data-d={entrada ? 'entrada' : 'saida'}>
                        {entrada ? '+' : '−'}{moeda(num(t.valor))}
                      </span>
                    </Linha>
                  )
                })}
              </div>
            )}
          </Bloco>
        </div>

        {/* ---------- O que se consulta ---------- */}
        <aside className="hoje-lado" aria-label="Agenda e prioridades">
          {prioridades.length > 0 && (
            <Bloco>
              <Secao nome={prioridades.length === 1 ? 'Prioridade' : 'Prioridades'} />
              <div className="lista-notas">
                {prioridades.map(p => (
                  <Linha key={p.path} aoAbrir={() => aoAbrir(p.path)} aoEditar={() => aoEditar(p)}>
                    <span className="pin">★</span>
                    <span className="linha-titulo">{p.title}</span>
                    {p.date && <Prazo data={p.date} hoje={hoje} feito={false} />}
                  </Linha>
                ))}
              </div>
            </Bloco>
          )}

          <Bloco>
            <Secao nome="Compromissos de hoje" acao="Compromisso"
              aoClicar={() => aoAdicionar('evento', { date: hoje })} />
            <ListaNotas notas={compromissosHoje} aoAbrir={aoAbrir} aoEditar={aoEditar} aoExcluir={aoExcluir}
              vazio="Nada marcado para hoje." comTipo={false} />
          </Bloco>

          <Bloco>
            <Secao nome="Próximos eventos" />
            <ListaNotas notas={proximos} aoAbrir={aoAbrir} aoEditar={aoEditar}
              vazio="Nenhuma data futura marcada." hoje={hoje} comPrazo comTipo={false} />
          </Bloco>

          {/* Datas comemorativas ficam em lista própria, e não misturadas com
              consulta médica e reunião: são a única coisa da agenda que volta
              todo ano, e a única em que "faz 18 anos" quer dizer alguma coisa. */}
          <Bloco>
            <Secao nome="Datas comemorativas" acao="Data"
              aoClicar={() => aoAdicionar('data-comemorativa')} />
            {comemorativas.length === 0 ? (
              <Vazio>Nenhuma nos próximos dois meses.</Vazio>
            ) : (
              <div className="lista-notas">
                {comemorativas.map(d => (
                  <Linha key={`${d.path}:${d.quando}`} aoAbrir={() => aoAbrir(d.path)}>
                    <span className="pin">🎂</span>
                    <span className="linha-titulo">{d.titulo}</span>
                    <span className="linha-valor">
                      {d.anos === null ? '' : d.oque === 'falecimento'
                        ? `há ${d.anos} anos`
                        : `faz ${d.anos}`}
                    </span>
                    <Prazo data={d.quando} hoje={hoje} feito={false} />
                  </Linha>
                ))}
              </div>
            )}
          </Bloco>

          {provas.length > 0 && (
            <Bloco>
              <Secao nome="Provas" />
              <ListaNotas notas={provas} aoAbrir={aoAbrir} vazio="" hoje={hoje} comPrazo comTipo={false} />
            </Bloco>
          )}

          {lendo.length > 0 && (
            <Bloco>
              <Secao nome="Lendo" />
              <div className="lista-notas">
                {lendo.map(l => {
                  const total = num(l.campos.paginas)
                  const atual = num(l.campos.pagina)
                  return (
                    <Linha key={l.path} aoAbrir={() => aoAbrir(l.path)} aoEditar={() => aoEditar(l)}>
                      <span className="linha-titulo">{l.title}</span>
                      <span className="linha-valor">
                        {total ? `${nf.format((atual / total) * 100).replace(/,00$/, '')}%` : `p. ${atual}`}
                      </span>
                      <button className="btn-mini"
                        title="Avançar uma página"
                        onClick={e => { e.stopPropagation(); aoAlterar(l.path, { pagina: atual + 1 }) }}>
                        +1
                      </button>
                    </Linha>
                  )
                })}
              </div>
            </Bloco>
          )}
        </aside>
      </div>
    </div>
  )
}
