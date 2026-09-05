import {
  Cartao, Secao, Titulo, Linha, ListaNotas, Check, Vazio, Progresso,
  moeda, nf, num, txt, lista, textos, porData, type PropsLente
} from './base'
import { suplementosDoDia, rotinasDoDia, anotacoesDoDia, totaisDoDia } from '../dados'

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
 */

const DIA_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

function porExtenso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${DIA_EXTENSO[new Date(a, m - 1, d).getDay()]}, ${d} de ${MESES[m - 1]}`
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
  const refeicoes = lista(planoAtivo?.campos.refeicoes)
  const feitas = textos(diario?.campos.dieta_feitas)
  const extras = lista(diario?.campos.extras)
  const { kcal } = totaisDoDia(planoAtivo, diario)

  const suplementos = suplementosDoDia(notas, hoje)
  const tomados = textos(diario?.campos.suplementos_feitos)

  /*
   * Tarefas do dia e anotações: as duas metades de "como foi hoje?".
   *
   * As duas nascem no celular e viviam só lá. A tarefa vinha marcada do
   * cardápio, mas quem trabalha no computador não tinha onde marcar; e a
   * anotação escrita de manhã caía em `Vida/`, misturada com objetivo e
   * compra, e só reaparecia para quem fosse procurar.
   *
   * `rotinas_feitas` é o mesmo conjunto que o celular usa — marcar aqui
   * desmarca lá, e o contrário também. Ver `montarCardapio`.
   */
  const rotinas = rotinasDoDia(notas, hoje)
  const rotinasFeitas = textos(diario?.campos.rotinas_feitas)
  // Conta só as de hoje: o conjunto do diário pode guardar o nome de uma
  // rotina de outro dia da semana, e "4/3 feitas" seria um número impossível.
  const rotinasDeHojeFeitas = rotinas.filter(r => rotinasFeitas.includes(r.title)).length
  const anotacoes = anotacoesDoDia(notas, hoje)

  const compromissosHoje = doDia.filter(n =>
    n.tipo === 'evento' || n.tipo === 'consulta' || n.tipo === 'prova')
  const proximos = notas
    .filter(n => n.date && n.date > hoje &&
      (n.tipo === 'evento' || n.tipo === 'consulta' || n.tipo === 'tarefa'))
    .sort(porData).slice(0, 6)
  const provas = notas.filter(n => n.tipo === 'prova' && n.date && n.date >= hoje).sort(porData)

  const lendo = notas.filter(n => n.tipo === 'livro' && txt(n.campos.status) === 'lendo')
  const prioridade = notas.find(n => n.tipo === 'objetivo' && n.campos.prioridade === true)
  const modelos = notas.filter(n => n.tipo === 'treino-modelo')

  return (
    <div className="lente">
      <Titulo nome="Hoje" sub={porExtenso(hoje)} />

      <div className="cartoes">
        <Cartao
          rotulo="Treino"
          valor={sessao ? txt(sessao.campos.modelo) || 'feito' : (cardio ? txt(cardio.campos.aparelho) : '—')}
          nota={sessao
            ? `${lista(sessao.campos.exercicios).length} exercícios`
            : (cardio ? `${num(cardio.campos.minutos)} min` : 'nada ainda')}
        />
        <Cartao
          rotulo="Calorias"
          valor={kcal ? String(kcal) : '—'}
          nota={planoAtivo && num(planoAtivo.campos.kcal)
            ? `meta ${num(planoAtivo.campos.kcal)}`
            : `${feitas.length} refeições`}
        />
        <Cartao rotulo="Gasto do dia" valor={saiu ? moeda(saiu) : '—'} tom={saiu ? 'saida' : undefined}
          nota={`${transacoes.length} lançamentos`} />
        <Cartao
          rotulo="Suplementos"
          valor={suplementos.length ? `${tomados.length}/${suplementos.length}` : '—'}
        />
        <Cartao
          rotulo="Tarefas do dia"
          valor={rotinas.length ? `${rotinasDeHojeFeitas}/${rotinas.length}` : '—'}
          nota={rotinas.length === 0
            ? 'nenhuma para hoje'
            : rotinasDeHojeFeitas === rotinas.length ? 'tudo feito' : undefined}
        />
      </div>

      {prioridade && (
        <>
          <h3 className="secao">Prioridade do momento</h3>
          <div className="lista-notas">
            <Linha aoAbrir={() => aoAbrir(prioridade.path)} aoEditar={() => aoEditar(prioridade)}>
              <span className="pin">★</span>
              <span className="linha-titulo">{prioridade.title}</span>
              <span className="linha-data">{prioridade.date ?? ''}</span>
            </Linha>
          </div>
        </>
      )}

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
          ? <Vazio>Nenhum treino montado ainda — monte um em Saúde › Treinos.</Vazio>
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

      <Secao nome="Suplementos de hoje" acao="Suplemento" aoClicar={() => aoAdicionar('suplemento')} />
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

      {/* Logo abaixo dos suplementos: é o mesmo gesto, e a mesma pergunta de
          manhã. Mesma ordem do celular, de propósito — as duas telas mostram
          a mesma lista, e trocar a ordem faria uma parecer outra coisa. */}
      <Secao nome="Tarefas do dia" acao="Tarefa diária" aoClicar={() => aoAdicionar('rotina')} />
      {rotinas.length === 0 ? <Vazio>Nenhuma tarefa para hoje.</Vazio> : (
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

      {/* E em seguida o que aconteceu. A tarefa é o que estava para fazer; a
          anotação é o resto do dia — juntas respondem "como foi hoje?". */}
      <Secao nome="Anotações de hoje" acao="Anotação" aoClicar={() => aoAdicionar('anotacao', { date: hoje })} />
      {anotacoes.length === 0 ? <Vazio>Nada anotado hoje.</Vazio> : (
        <div className="lista-notas">
          {anotacoes.map(a => (
            <Linha key={a.path} aoAbrir={() => aoAbrir(a.path)}
              aoEditar={() => aoEditar(a)} aoExcluir={() => aoExcluir(a)}>
              {/* A estrela ocupa a coluna do check das listas de cima, para as
                  linhas não dançarem de indentação entre uma seção e outra. */}
              <span className="pin" data-vazio={a.campos.prioridade === true ? undefined : 'sim'}>★</span>
              <span className="linha-titulo">{a.title}</span>
              {/* O texto completo só quando ele diz mais do que o título — o
                  celular usa a primeira linha como título, então na maioria
                  das anotações curtas os dois são a mesma frase. */}
              <span className="linha-valor">
                {txt(a.campos.texto) !== a.title ? txt(a.campos.texto) : ''}
              </span>
            </Linha>
          ))}
        </div>
      )}

      <Secao nome="Dieta" acao="Comi algo a mais" aoClicar={() => aoLancar('refeicao', hoje)} />
      {!planoAtivo ? (
        <Vazio>Nenhum plano ativo. Ative um em Saúde › Dieta.</Vazio>
      ) : (
        <>
          {num(planoAtivo.campos.kcal) > 0 && (
            <Progresso feito={kcal} total={num(planoAtivo.campos.kcal)}
              rotulo={`${kcal} de ${num(planoAtivo.campos.kcal)} kcal`} />
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

      <Secao nome="Gastos de hoje" acao="Transação" aoClicar={() => aoLancar('transacao', hoje)} />
      {transacoes.length === 0 ? <Vazio>Nada lançado hoje.</Vazio> : (
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

      <Secao nome="Compromissos de hoje" acao="Compromisso"
        aoClicar={() => aoAdicionar('evento', { date: hoje })} />
      <ListaNotas notas={compromissosHoje} aoAbrir={aoAbrir} aoEditar={aoEditar} aoExcluir={aoExcluir}
        vazio="Nada marcado para hoje." />

      <h3 className="secao">Vem por aí</h3>
      <ListaNotas notas={proximos} aoAbrir={aoAbrir} aoEditar={aoEditar}
        vazio="Nenhuma data futura marcada." hoje={hoje} comPrazo />

      {provas.length > 0 && (
        <>
          <h3 className="secao">Provas</h3>
          <ListaNotas notas={provas} aoAbrir={aoAbrir} vazio="" hoje={hoje} comPrazo />
        </>
      )}

      {lendo.length > 0 && (
        <>
          <h3 className="secao">Lendo</h3>
          <div className="lista-notas">
            {lendo.map(l => {
              const total = num(l.campos.paginas)
              const atual = num(l.campos.pagina)
              return (
                <Linha key={l.path} aoAbrir={() => aoAbrir(l.path)} aoEditar={() => aoEditar(l)}>
                  <span className="linha-titulo">{l.title}</span>
                  <span className="linha-valor">
                    {total ? `${atual} de ${total} (${nf.format((atual / total) * 100)}%)` : `página ${atual}`}
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
        </>
      )}
    </div>
  )
}
