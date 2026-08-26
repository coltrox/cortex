import type { NoteComCampos } from '../tipos'
import { diasAte, urgencia, rotuloPrazo, type Sub } from '../subnav'

/**
 * Views das lentes de vida.
 *
 * Cada uma é uma leitura sobre as mesmas notas — nada aqui tem tabela própria
 * nem pasta própria. Uma nota `tipo: treino` aparece na lente Saúde, no
 * Calendário e no Hoje sem estar duplicada em lugar nenhum.
 */

const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const moeda = (v: number) => `R$ ${nf.format(v)}`

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v) || 0
}

function lista(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter(i => i && typeof i === 'object') as Record<string, unknown>[] : []
}

function txt(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

const porData = (a: NoteComCampos, b: NoteComCampos) => (a.date ?? '').localeCompare(b.date ?? '')

type Props = {
  notas: NoteComCampos[]
  sub: Sub
  hoje: string
  aoAbrir: (p: string) => void
  aoAdicionar: (tipo: string) => void
  aoLancar: (item: string) => void
  aoAlternar: (path: string, feito: boolean) => void
}

/* ---------- blocos reutilizáveis ---------- */

export function Cartao({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="cartao">
      <div className="cartao-rotulo">{rotulo}</div>
      <div className="cartao-valor">{valor}</div>
      {nota && <div className="cartao-nota">{nota}</div>}
    </div>
  )
}

export function Serie({ pontos, rotulo }: { pontos: { x: string; y: number }[]; rotulo: string }) {
  if (pontos.length < 2) return <div className="vazio">Faltam dados para desenhar {rotulo}.</div>
  const ys = pontos.map(p => p.y)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const faixa = max - min || 1
  const larg = 100 / (pontos.length - 1)
  const d = pontos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * larg).toFixed(2)} ${(100 - ((p.y - min) / faixa) * 100).toFixed(2)}`)
    .join(' ')

  return (
    <div className="serie">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="serie-svg">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Eixo temporal: data à esquerda, data à direita. A faixa de valores fica
          no meio — min e max nas pontas fazia os números subirem com a linha descendo. */}
      <div className="serie-eixo">
        <span>{pontos[0].x}</span>
        <span>{nf.format(min)}–{nf.format(max)} {rotulo}</span>
        <span>{pontos[pontos.length - 1].x}</span>
      </div>
    </div>
  )
}

/** Contador de prazo. Esquenta conforme a data chega; esfria quando marcado feito. */
export function Prazo({ data, hoje, feito }: { data: string; hoje: string; feito: boolean }) {
  const d = diasAte(data, hoje)
  return (
    <span className="prazo" data-u={urgencia(d, feito)}>
      {feito ? 'feito' : rotuloPrazo(d)}
    </span>
  )
}

export function ListaNotas({
  notas, aoAbrir, vazio, hoje, comPrazo
}: {
  notas: NoteComCampos[]
  aoAbrir: (p: string) => void
  vazio: string
  hoje?: string
  comPrazo?: boolean
}) {
  if (notas.length === 0) return vazio ? <div className="vazio">{vazio}</div> : null
  return (
    <div className="lista-notas">
      {notas.map(n => (
        <button key={n.path} className="linha" onClick={() => aoAbrir(n.path)}>
          <span className="linha-data">{n.date ?? '—'}</span>
          <span className="linha-titulo">{n.title}</span>
          {comPrazo && hoje && n.date && (
            <Prazo data={n.date} hoje={hoje} feito={n.campos.feito === true} />
          )}
          <span className="tipo" data-t={n.tipo}>{n.tipo}</span>
        </button>
      ))}
    </div>
  )
}

function Barras({ itens, formato }: { itens: [string, number][]; formato?: (v: number) => string }) {
  const maior = Math.max(...itens.map(i => i[1]), 0)
  if (itens.length === 0) return <div className="vazio">Nada para mostrar.</div>
  return (
    <div className="barras">
      {itens.sort((a, b) => b[1] - a[1]).map(([r, v]) => (
        <div key={r} className="barra-linha">
          <span className="barra-rotulo">{r}</span>
          <span className="barra" style={{ width: `${maior ? (v / maior) * 100 : 0}%` }} />
          <span className="barra-valor">{formato ? formato(v) : v}</span>
        </div>
      ))}
    </div>
  )
}


/** Cabecalho de secao com acao. O botao some quando a secao nao cria nada. */
function Secao({ nome, acao, aoClicar }: { nome: string; acao?: string; aoClicar?: () => void }) {
  return (
    <div className="secao-linha">
      <h3 className="secao">{nome}</h3>
      {acao && aoClicar && (
        <button className="btn-add" onClick={aoClicar}>+ {acao}</button>
      )}
    </div>
  )
}

/** Caixa de marcar, para tarefas e itens de compra. */
function Check({ feito, aoAlternar }: { feito: boolean; aoAlternar: () => void }) {
  return (
    <span
      className="check"
      role="checkbox"
      aria-checked={feito}
      onClick={e => { e.stopPropagation(); aoAlternar() }}
    >
      {feito ? '✓' : ''}
    </span>
  )
}

function Titulo({ nome, sub }: { nome: string; sub?: string }) {
  return (
    <>
      <h2 className="lente-titulo">{nome}</h2>
      {sub && <div className="lente-data">{sub}</div>}
    </>
  )
}

/* ---------- Hoje ---------- */

export function LenteHoje({ notas, hoje, aoAbrir, aoAdicionar, aoLancar }: Omit<Props, 'sub'>) {
  const doDia = notas.filter(n => n.date === hoje)
  const diario = doDia.find(n => n.tipo === 'diario')
  const treino = doDia.find(n => n.tipo === 'treino')
  const proximos = notas.filter(n => n.date && n.date > hoje).sort(porData).slice(0, 8)

  const gastos = lista(diario?.campos.gastos)
  const totalGasto = gastos.reduce((s, g) => s + num(g.valor), 0)
  const refeicoes = lista(diario?.campos.refeicoes)
  const kcal = refeicoes.reduce((s, r) => s + num(r.kcal), 0)
  const prot = refeicoes.reduce((s, r) => s + num(r.prot), 0)

  const suplementos = notas.filter(n => n.tipo === 'suplemento')
  const prioridade = notas.find(n => n.tipo === 'objetivo' && n.campos.prioridade === true)

  return (
    <div className="lente">
      <Titulo nome="Hoje" sub={hoje} />

      <div className="cartoes">
        <Cartao rotulo="Peso" valor={diario?.campos.peso ? `${nf.format(num(diario.campos.peso))} kg` : '—'} />
        <Cartao rotulo="Calorias" valor={kcal ? String(kcal) : '—'} nota={prot ? `${prot} g de proteína` : `${refeicoes.length} refeições`} />
        <Cartao rotulo="Gasto do dia" valor={totalGasto ? moeda(totalGasto) : '—'} nota={`${gastos.length} lançamentos`} />
        <Cartao rotulo="Treino" valor={treino ? txt(treino.campos.grupo) || 'sim' : '—'} nota={treino ? 'registrado' : 'nada hoje'} />
      </div>

      {prioridade && (
        <>
          <h3 className="secao">Prioridade</h3>
          <ListaNotas notas={[prioridade]} aoAbrir={aoAbrir} vazio="" />
        </>
      )}

      <Secao nome="Suplementos de hoje" acao="Suplemento" aoClicar={() => aoAdicionar('suplemento')} />
      {suplementos.length === 0
        ? <div className="vazio">Nenhum suplemento cadastrado.</div>
        : <ListaNotas notas={suplementos} aoAbrir={aoAbrir} vazio="" />}

      <Secao nome="Dieta" acao="Refeicao" aoClicar={() => aoLancar('refeicao')} />
      {refeicoes.length === 0 ? <div className="vazio">Nada registrado hoje.</div> : (
        <div className="lista-notas">
          {refeicoes.map((r, i) => (
            <div key={i} className="linha">
              <span className="linha-data">{txt(r.hora)}</span>
              <span className="linha-titulo">{txt(r.item)}</span>
              <span className="linha-valor">{num(r.kcal)} kcal</span>
            </div>
          ))}
        </div>
      )}

      <Secao nome="Do dia" acao="Gasto" aoClicar={() => aoLancar('gasto')} />
      <ListaNotas notas={doDia} aoAbrir={aoAbrir} vazio="Nada registrado hoje ainda." />

      <h3 className="secao">Vem por aí</h3>
      <ListaNotas notas={proximos} aoAbrir={aoAbrir} vazio="Nenhuma data futura marcada." hoje={hoje} comPrazo />
    </div>
  )
}

/* ---------- Saúde ---------- */

export function LenteSaude({ notas, sub, hoje, aoAbrir, aoAdicionar, aoLancar }: Props) {
  const treinos = notas.filter(n => n.tipo === 'treino').sort(porData)
  const cardio = treinos.filter(n => txt(n.campos.modalidade) === 'cardio')
  const forca = treinos.filter(n => txt(n.campos.modalidade) !== 'cardio')
  const consultas = notas.filter(n => n.tipo === 'consulta')
  const suplementos = notas.filter(n => n.tipo === 'suplemento')
  const diarios = notas.filter(n => n.tipo === 'diario').sort(porData)

  const pesos = notas
    .filter(n => n.date && typeof n.campos.peso !== 'undefined')
    .sort(porData)
    .map(n => ({ x: n.date as string, y: num(n.campos.peso) }))

  const ultimo = pesos[pesos.length - 1]
  const primeiro = pesos[0]
  const delta = ultimo && primeiro ? ultimo.y - primeiro.y : 0

  const porGrupo = new Map<string, number>()
  for (const t of forca) {
    const g = txt(t.campos.grupo) || 'sem grupo'
    porGrupo.set(g, (porGrupo.get(g) ?? 0) + 1)
  }

  return (
    <div className="lente">
      <Titulo nome="Saúde" />

      {sub === 'overview' && (
        <>
          <div className="cartoes">
            <Cartao rotulo="Peso atual" valor={ultimo ? `${nf.format(ultimo.y)} kg` : '—'} nota={ultimo?.x} />
            <Cartao
              rotulo="Variação"
              valor={pesos.length > 1 ? `${delta > 0 ? '+' : ''}${nf.format(delta)} kg` : '—'}
              nota={pesos.length > 1 ? `desde ${primeiro.x}` : undefined}
            />
            <Cartao rotulo="Treinos" valor={String(treinos.length)} nota={`${cardio.length} de cardio`} />
            <Cartao rotulo="Consultas" valor={String(consultas.length)} />
          </div>
          <h3 className="secao">Peso ao longo do tempo</h3>
          <Serie pontos={pesos} rotulo="kg" />
          <Secao nome="Consultas" acao="Consulta" aoClicar={() => aoAdicionar('consulta')} />
          <ListaNotas notas={consultas} aoAbrir={aoAbrir} vazio="Nenhuma consulta marcada." hoje={hoje} comPrazo />
        </>
      )}

      {sub === 'treinos' && (
        <>
          <h3 className="secao">Por grupo</h3>
          <Barras itens={[...porGrupo.entries()]} />
          <Secao nome="Histórico" acao="Treino" aoClicar={() => aoAdicionar('treino')} />
          <ListaNotas notas={[...forca].reverse()} aoAbrir={aoAbrir} vazio="Nenhum treino de força registrado." />
        </>
      )}

      {sub === 'cardio' && (
        <>
          <Secao nome="Sessões de cardio" acao="Cardio" aoClicar={() => aoAdicionar('treino')} />
          <ListaNotas notas={[...cardio].reverse()} aoAbrir={aoAbrir}
            vazio="Nada aqui. Um treino vira cardio com o campo modalidade: cardio." />
        </>
      )}

      {sub === 'medidas' && (
        <>
          <h3 className="secao">Peso</h3>
          <Serie pontos={pesos} rotulo="kg" />
          <h3 className="secao">Registros</h3>
          <div className="lista-notas">
            {diarios.filter(d => typeof d.campos.peso !== 'undefined').reverse().map(d => (
              <button key={d.path} className="linha" onClick={() => aoAbrir(d.path)}>
                <span className="linha-data">{d.date}</span>
                <span className="linha-titulo">{nf.format(num(d.campos.peso))} kg</span>
                {typeof d.campos.cintura !== 'undefined' && (
                  <span className="linha-valor">cintura {txt(d.campos.cintura)}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {sub === 'dieta' && (
        <>
          <Secao nome="Refeições por dia" acao="Refeicao" aoClicar={() => aoLancar('refeicao')} />
          {diarios.length === 0 && <div className="vazio">Nenhum diário com refeições.</div>}
          {[...diarios].reverse().map(d => {
            const rs = lista(d.campos.refeicoes)
            if (rs.length === 0) return null
            const kcal = rs.reduce((s, r) => s + num(r.kcal), 0)
            return (
              <div key={d.path} className="dia">
                <div className="dia-data">{d.date} · {kcal} kcal</div>
                <div className="lista-notas">
                  {rs.map((r, i) => (
                    <div key={i} className="linha">
                      <span className="linha-data">{txt(r.hora)}</span>
                      <span className="linha-titulo">{txt(r.item)}</span>
                      <span className="linha-valor">{num(r.kcal)} kcal · {num(r.prot)} g</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}

      {sub === 'suplementos' && (
        <>
          <Secao nome="Cadastrados" acao="Suplemento" aoClicar={() => aoAdicionar('suplemento')} />
          {suplementos.length === 0
            ? <div className="vazio">Nenhum suplemento. Uma nota tipo: suplemento com dose e dias entra aqui.</div>
            : (
              <div className="lista-notas">
                {suplementos.map(s => (
                  <button key={s.path} className="linha" onClick={() => aoAbrir(s.path)}>
                    <span className="linha-titulo">{s.title}</span>
                    <span className="linha-valor">{txt(s.campos.dose)}</span>
                    <span className="tipo">{txt(s.campos.dias) || 'todo dia'}</span>
                  </button>
                ))}
              </div>
            )}
        </>
      )}
    </div>
  )
}

/* ---------- Estudos ---------- */

export function LenteEstudos({ notas, sub, hoje, aoAbrir, aoAdicionar, aoAlternar }: Props) {
  const materias = notas.filter(n => n.tipo === 'materia')
  const provas = notas.filter(n => n.tipo === 'prova' && n.date).sort(porData)
  const simulados = notas.filter(n => n.tipo === 'simulado').sort(porData)
  const redacoes = notas.filter(n => n.tipo === 'redacao').sort(porData)
  const tarefas = notas.filter(n => n.tipo === 'tarefa').sort(porData)
  const livros = notas.filter(n => n.tipo === 'livro')
  const questoes = notas.filter(n => n.tipo === 'questao')
  const erradas = questoes.filter(q => q.campos.acertou === false)

  const futuras = provas.filter(p => (p.date ?? '') >= hoje)

  return (
    <div className="lente">
      <Titulo nome="Estudos" />

      {sub === 'overview' && (
        <>
          <div className="cartoes">
            <Cartao rotulo="Conteúdos" valor={String(materias.length)} />
            <Cartao
              rotulo="Próxima prova"
              valor={futuras[0]?.date ?? '—'}
              nota={futuras[0] ? rotuloPrazo(diasAte(futuras[0].date as string, hoje)) : undefined}
            />
            <Cartao rotulo="Questões" valor={String(questoes.length)} nota={`${erradas.length} erradas`} />
            <Cartao rotulo="Tarefas abertas" valor={String(tarefas.filter(t => t.campos.feito !== true).length)} />
          </div>
          <h3 className="secao">Prazos</h3>
          <ListaNotas notas={[...futuras, ...tarefas.filter(t => t.campos.feito !== true)].sort(porData)}
            aoAbrir={aoAbrir} vazio="Nenhum prazo à vista." hoje={hoje} comPrazo />
          <h3 className="secao">Para revisar</h3>
          <ListaNotas notas={erradas} aoAbrir={aoAbrir} vazio="Nada errado — ou nada registrado ainda." />
        </>
      )}

      {sub === 'conteudos' && (
        <>
          <Secao nome="Conteúdos" acao="Conteudo" aoClicar={() => aoAdicionar('materia')} />
          {materias.length === 0
            ? <div className="vazio">Nenhum conteúdo cadastrado.</div>
            : (
              <div className="lista-notas">
                {materias.map(m => (
                  <button key={m.path} className="linha" onClick={() => aoAbrir(m.path)}>
                    <span className="linha-titulo">{m.title}</span>
                    {typeof m.campos.dominio !== 'undefined' && (
                      <span className="nivel" data-n={num(m.campos.dominio)}>
                        domínio {num(m.campos.dominio)}/5
                      </span>
                    )}
                    <span className="tipo">{txt(m.campos.status) || 'sem status'}</span>
                  </button>
                ))}
              </div>
            )}
        </>
      )}

      {sub === 'provas' && (
        <>
          <Secao nome="Marcadas" acao="Prova" aoClicar={() => aoAdicionar('prova')} />
          <ListaNotas notas={futuras} aoAbrir={aoAbrir} vazio="Nenhuma prova marcada." hoje={hoje} comPrazo />
          <h3 className="secao">Passadas</h3>
          <ListaNotas notas={provas.filter(p => (p.date ?? '') < hoje).reverse()} aoAbrir={aoAbrir} vazio="Nenhuma." />
        </>
      )}

      {sub === 'simulados' && (
        <>
          <Secao nome="Simulados" acao="Simulado" aoClicar={() => aoAdicionar('simulado')} />
          {simulados.length === 0
            ? <div className="vazio">Nenhum simulado. Uma nota tipo: simulado com acertos e total entra aqui.</div>
            : (
              <div className="lista-notas">
                {[...simulados].reverse().map(s => {
                  const a = num(s.campos.acertos)
                  const t = num(s.campos.total)
                  return (
                    <button key={s.path} className="linha" onClick={() => aoAbrir(s.path)}>
                      <span className="linha-data">{s.date ?? '—'}</span>
                      <span className="linha-titulo">{s.title}</span>
                      <span className="linha-valor">
                        {t ? `${a}/${t} · ${Math.round((a / t) * 100)}%` : `${a} acertos`}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
        </>
      )}

      {sub === 'redacoes' && (
        <>
          <Secao nome="Redações" acao="Redacao" aoClicar={() => aoAdicionar('redacao')} />
          <ListaNotas notas={[...redacoes].reverse()} aoAbrir={aoAbrir}
            vazio="Nenhuma redação. Repertórios entram no corpo da nota." />
        </>
      )}

      {sub === 'tarefas' && (
        <>
          <Secao nome="Abertas" acao="Tarefa" aoClicar={() => aoAdicionar('tarefa')} />
          <ListaNotas notas={tarefas.filter(t => t.campos.feito !== true)} aoAbrir={aoAbrir}
            vazio="Nenhuma tarefa aberta." hoje={hoje} comPrazo />
          <h3 className="secao">Concluídas</h3>
          <ListaNotas notas={tarefas.filter(t => t.campos.feito === true).reverse()} aoAbrir={aoAbrir} vazio="Nenhuma." />
        </>
      )}

      {sub === 'livros' && (
        <>
          <Secao nome="Livros" acao="Livro" aoClicar={() => aoAdicionar('livro')} />
          {livros.length === 0
            ? <div className="vazio">Nenhum livro. Nome, resumo e link de aula entram na nota.</div>
            : (
              <div className="lista-notas">
                {livros.map(l => (
                  <button key={l.path} className="linha" onClick={() => aoAbrir(l.path)}>
                    <span className="linha-titulo">{l.title}</span>
                    <span className="linha-valor">{txt(l.campos.autor)}</span>
                    <span className="tipo">{txt(l.campos.status) || 'na fila'}</span>
                  </button>
                ))}
              </div>
            )}
        </>
      )}
    </div>
  )
}

/* ---------- Grana ---------- */

export function LenteGrana({ notas, sub, aoAbrir, aoAdicionar, aoLancar }: Props) {
  const comGastos = notas.filter(n => lista(n.campos.gastos).length > 0).sort((a, b) => porData(b, a))

  const todos: Record<string, unknown>[] = comGastos.flatMap(n =>
    lista(n.campos.gastos).map(g => ({ ...g, _data: n.date ?? '', _path: n.path }))
  )

  const total = todos.reduce((s, g) => s + num(g.valor), 0)
  const porCat = new Map<string, number>()
  for (const g of todos) {
    const c = txt(g.cat) || 'sem categoria'
    porCat.set(c, (porCat.get(c) ?? 0) + num(g.valor))
  }

  const mov = notas.filter(n => n.tipo === 'porquinho').sort(porData)
  const saldo = mov.reduce(
    (s, m) => s + (txt(m.campos.direcao) === 'saida' ? -num(m.campos.valor) : num(m.campos.valor)),
    0
  )

  return (
    <div className="lente">
      <Titulo nome="Grana" />

      {sub === 'overview' && (
        <>
          <div className="cartoes">
            <Cartao rotulo="Gasto total" valor={moeda(total)} nota={`${todos.length} lançamentos`} />
            <Cartao rotulo="Dias com registro" valor={String(comGastos.length)} />
            <Cartao rotulo="Média por dia" valor={comGastos.length ? moeda(total / comGastos.length) : '—'} />
            <Cartao rotulo="Porquinho" valor={moeda(saldo)} nota={`${mov.length} movimentos`} />
          </div>
          <h3 className="secao">Por categoria</h3>
          <Barras itens={[...porCat.entries()]} formato={moeda} />
        </>
      )}

      {sub === 'transacoes' && (
        <>
          <Secao nome="Lançamentos" acao="Gasto" aoClicar={() => aoLancar('gasto')} />
          {todos.length === 0 && <div className="vazio">Nada lançado.</div>}
          <div className="lista-notas">
            {todos.slice(0, 120).map((g, i) => (
              <button key={i} className="linha" onClick={() => aoAbrir(txt(g._path))}>
                <span className="linha-data">{txt(g._data)}</span>
                <span className="seta" data-d="saida">↓</span>
                <span className="linha-titulo">{txt(g.item) || '—'}</span>
                <span className="tipo">{txt(g.cat)}</span>
                <span className="linha-valor">{moeda(num(g.valor))}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {sub === 'porquinho' && (
        <>
          <div className="cartoes">
            <Cartao rotulo="Saldo" valor={moeda(saldo)} nota={`${mov.length} movimentos`} />
            <Cartao
              rotulo="Depositado"
              valor={moeda(mov.filter(m => txt(m.campos.direcao) !== 'saida').reduce((s, m) => s + num(m.campos.valor), 0))}
            />
            <Cartao
              rotulo="Sacado"
              valor={moeda(mov.filter(m => txt(m.campos.direcao) === 'saida').reduce((s, m) => s + num(m.campos.valor), 0))}
            />
          </div>
          <Secao nome="Movimentos" acao="Movimento" aoClicar={() => aoAdicionar('porquinho')} />
          {mov.length === 0
            ? <div className="vazio">Nenhum movimento. Cada depósito ou saque é uma nota tipo: porquinho, e o texto dela é a sua anotação sobre o movimento.</div>
            : (
              <div className="lista-notas">
                {[...mov].reverse().map(m => {
                  const saida = txt(m.campos.direcao) === 'saida'
                  return (
                    <button key={m.path} className="linha" onClick={() => aoAbrir(m.path)}>
                      <span className="linha-data">{m.date ?? '—'}</span>
                      <span className="seta" data-d={saida ? 'saida' : 'entrada'}>{saida ? '↓' : '↑'}</span>
                      <span className="linha-titulo">{m.title}</span>
                      <span className="linha-valor" data-d={saida ? 'saida' : 'entrada'}>
                        {saida ? '−' : '+'}{moeda(num(m.campos.valor))}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
        </>
      )}
    </div>
  )
}

/* ---------- Vida ---------- */

export function LenteVida({ notas, sub, hoje, aoAbrir, aoAdicionar, aoAlternar }: Props) {
  const objetivos = notas.filter(n => n.tipo === 'objetivo')
  const anotacoes = notas.filter(n => n.tipo === 'anotacao')
  const pessoas = notas.filter(n => n.tipo === 'pessoa')
  const compras = notas.filter(n => n.tipo === 'compra')
  const docs = notas.filter(n => n.tipo === 'documento')
  const diarios = notas.filter(n => n.tipo === 'diario').sort((a, b) => porData(b, a))

  const porCategoria = new Map<string, NoteComCampos[]>()
  for (const c of compras) {
    const cat = txt(c.campos.categoria) || 'sem categoria'
    const atual = porCategoria.get(cat)
    if (atual) atual.push(c)
    else porCategoria.set(cat, [c])
  }

  return (
    <div className="lente">
      <Titulo nome="Vida" />

      {sub === 'overview' && (
        <>
          <div className="cartoes">
            <Cartao rotulo="Metas" valor={String(objetivos.length)} />
            <Cartao rotulo="Anotações" valor={String(anotacoes.length)} />
            <Cartao rotulo="Para comprar" valor={String(compras.filter(c => c.campos.feito !== true).length)} />
            <Cartao rotulo="Dias no diário" valor={String(diarios.length)} />
          </div>
          <Secao nome="Metas" acao="Meta" aoClicar={() => aoAdicionar('objetivo')} />
          <ListaNotas notas={objetivos} aoAbrir={aoAbrir} vazio="Nenhuma meta escrita." hoje={hoje} comPrazo />
          <h3 className="secao">Diário</h3>
          <ListaNotas notas={diarios.slice(0, 10)} aoAbrir={aoAbrir} vazio="Nenhum dia registrado." />
        </>
      )}

      {sub === 'anotacoes' && (
        <>
          <Secao nome="Anotações rápidas" acao="Anotacao" aoClicar={() => aoAdicionar('anotacao')} />
          <ListaNotas notas={anotacoes} aoAbrir={aoAbrir}
            vazio="Nenhuma anotação. Uma nota tipo: anotacao entra aqui." />
        </>
      )}

      {sub === 'metas' && (
        <>
          <Secao nome="Metas" acao="Meta" aoClicar={() => aoAdicionar('objetivo')} />
          <ListaNotas notas={objetivos} aoAbrir={aoAbrir} vazio="Nenhuma meta." hoje={hoje} comPrazo />
        </>
      )}

      {sub === 'compras' && (
        <>
          {porCategoria.size === 0 && (
            <div className="vazio">Nada para comprar. Uma nota tipo: compra com o campo categoria entra aqui.</div>
          )}
          {[...porCategoria.entries()].map(([cat, itens]) => (
            <div key={cat}>
              <h3 className="secao">{cat}</h3>
              <div className="lista-notas">
                {itens.map(c => (
                  <button key={c.path} className="linha" onClick={() => aoAbrir(c.path)}>
                    <span className="linha-titulo" data-feito={c.campos.feito === true}>{c.title}</span>
                    {typeof c.campos.valor !== 'undefined' && (
                      <span className="linha-valor">{moeda(num(c.campos.valor))}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {sub === 'pessoas' && (
        <>
          <Secao nome="Pessoas" acao="Pessoa" aoClicar={() => aoAdicionar('pessoa')} />
          {pessoas.length === 0
            ? <div className="vazio">Ninguém cadastrado — nutricionista, médico e fisio entram aqui.</div>
            : (
              <div className="lista-notas">
                {pessoas.map(p => (
                  <button key={p.path} className="linha" onClick={() => aoAbrir(p.path)}>
                    <span className="linha-titulo">{p.title}</span>
                    <span className="tipo">{txt(p.campos.papel)}</span>
                  </button>
                ))}
              </div>
            )}
        </>
      )}

      {sub === 'documentos' && (
        <>
          <Secao nome="Documentos" acao="Documento" aoClicar={() => aoAdicionar('documento')} />
          <p className="lente-sub">
            Busque por nome no <code>Ctrl+K</code>. Arquivos ficam em <code>Anexos/</code> e a
            nota de documento aponta para eles.
          </p>
          <ListaNotas notas={docs} aoAbrir={aoAbrir}
            vazio="Nenhum documento. Uma nota tipo: documento com o campo arquivo entra aqui." />
        </>
      )}
    </div>
  )
}
