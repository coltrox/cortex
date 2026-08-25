import type { NoteComCampos } from '../tipos'

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
      {/* O eixo é temporal: data à esquerda, data à direita. A faixa de valores
          fica no meio, rotulada — mostrar min e max nas pontas fazia os números
          subirem enquanto a linha descia. */}
      <div className="serie-eixo">
        <span>{pontos[0].x}</span>
        <span>{nf.format(min)}–{nf.format(max)} {rotulo}</span>
        <span>{pontos[pontos.length - 1].x}</span>
      </div>
    </div>
  )
}

export function ListaNotas({
  notas, aoAbrir, vazio
}: { notas: NoteComCampos[]; aoAbrir: (p: string) => void; vazio: string }) {
  if (notas.length === 0) return vazio ? <div className="vazio">{vazio}</div> : null
  return (
    <div className="lista-notas">
      {notas.map(n => (
        <button key={n.path} className="linha" onClick={() => aoAbrir(n.path)}>
          <span className="linha-data">{n.date ?? '—'}</span>
          <span className="linha-titulo">{n.title}</span>
          <span className="tipo" data-t={n.tipo}>{n.tipo}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------- Hoje ---------- */

export function LenteHoje({
  notas, hoje, aoAbrir
}: { notas: NoteComCampos[]; hoje: string; aoAbrir: (p: string) => void }) {
  const doDia = notas.filter(n => n.date === hoje)
  const diario = doDia.find(n => n.tipo === 'diario')
  const proximos = notas
    .filter(n => n.date && n.date > hoje)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .slice(0, 6)

  const gastos = lista(diario?.campos.gastos)
  const totalGasto = gastos.reduce((s, g) => s + num(g.valor), 0)
  const refeicoes = lista(diario?.campos.refeicoes)
  const kcal = refeicoes.reduce((s, r) => s + num(r.kcal), 0)

  return (
    <div className="lente">
      <h2 className="lente-titulo">Hoje</h2>
      <div className="lente-data">{hoje}</div>

      <div className="cartoes">
        <Cartao rotulo="Peso" valor={diario?.campos.peso ? `${nf.format(num(diario.campos.peso))} kg` : '—'} />
        <Cartao rotulo="Calorias" valor={kcal ? String(kcal) : '—'} nota={`${refeicoes.length} refeições`} />
        <Cartao rotulo="Gasto do dia" valor={totalGasto ? moeda(totalGasto) : '—'} nota={`${gastos.length} lançamentos`} />
        <Cartao rotulo="Registros" valor={String(doDia.length)} nota="notas com a data de hoje" />
      </div>

      <h3 className="secao">Do dia</h3>
      <ListaNotas notas={doDia} aoAbrir={aoAbrir} vazio="Nada registrado hoje ainda." />

      <h3 className="secao">Vem por aí</h3>
      <ListaNotas notas={proximos} aoAbrir={aoAbrir} vazio="Nenhuma data futura marcada." />
    </div>
  )
}

/* ---------- Saúde ---------- */

export function LenteSaude({
  notas, aoAbrir
}: { notas: NoteComCampos[]; aoAbrir: (p: string) => void }) {
  const treinos = notas.filter(n => n.tipo === 'treino').sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const consultas = notas.filter(n => n.tipo === 'consulta')
  const pesos = notas
    .filter(n => n.date && typeof n.campos.peso !== 'undefined')
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .map(n => ({ x: n.date as string, y: num(n.campos.peso) }))

  const ultimo = pesos[pesos.length - 1]
  const primeiro = pesos[0]
  const delta = ultimo && primeiro ? ultimo.y - primeiro.y : 0

  const porGrupo = new Map<string, number>()
  for (const t of treinos) {
    const g = String(t.campos.grupo ?? 'sem grupo')
    porGrupo.set(g, (porGrupo.get(g) ?? 0) + 1)
  }

  return (
    <div className="lente">
      <h2 className="lente-titulo">Saúde</h2>

      <div className="cartoes">
        <Cartao rotulo="Peso atual" valor={ultimo ? `${nf.format(ultimo.y)} kg` : '—'} nota={ultimo?.x} />
        <Cartao
          rotulo="Variação"
          valor={pesos.length > 1 ? `${delta > 0 ? '+' : ''}${nf.format(delta)} kg` : '—'}
          nota={pesos.length > 1 ? `desde ${primeiro.x}` : undefined}
        />
        <Cartao rotulo="Treinos" valor={String(treinos.length)} />
        <Cartao rotulo="Consultas" valor={String(consultas.length)} />
      </div>

      <h3 className="secao">Peso ao longo do tempo</h3>
      <Serie pontos={pesos} rotulo="kg" />

      <h3 className="secao">Treinos por grupo</h3>
      {porGrupo.size === 0 && <div className="vazio">Nenhum treino registrado.</div>}
      <div className="barras">
        {[...porGrupo.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => (
          <div key={g} className="barra-linha">
            <span className="barra-rotulo">{g}</span>
            <span className="barra" style={{ width: `${(n / treinos.length) * 100}%` }} />
            <span className="barra-valor">{n}</span>
          </div>
        ))}
      </div>

      <h3 className="secao">Histórico</h3>
      <ListaNotas notas={[...treinos].reverse()} aoAbrir={aoAbrir} vazio="Nenhum treino ainda." />
    </div>
  )
}

/* ---------- Grana ---------- */

export function LenteGrana({
  notas, aoAbrir
}: { notas: NoteComCampos[]; aoAbrir: (p: string) => void }) {
  const comGastos = notas
    .filter(n => lista(n.campos.gastos).length > 0)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  const todos: Record<string, unknown>[] = comGastos.flatMap(n =>
    lista(n.campos.gastos).map(g => ({ ...g, _data: n.date ?? '', _path: n.path }))
  )

  const total = todos.reduce((s, g) => s + num(g.valor), 0)
  const porCat = new Map<string, number>()
  for (const g of todos) {
    const c = String(g.cat ?? 'sem categoria')
    porCat.set(c, (porCat.get(c) ?? 0) + num(g.valor))
  }
  const maior = Math.max(...porCat.values(), 0)

  return (
    <div className="lente">
      <h2 className="lente-titulo">Grana</h2>

      <div className="cartoes">
        <Cartao rotulo="Total" valor={moeda(total)} nota={`${todos.length} lançamentos`} />
        <Cartao rotulo="Dias com registro" valor={String(comGastos.length)} />
        <Cartao
          rotulo="Média por dia"
          valor={comGastos.length ? moeda(total / comGastos.length) : '—'}
        />
        <Cartao rotulo="Categorias" valor={String(porCat.size)} />
      </div>

      <h3 className="secao">Por categoria</h3>
      {porCat.size === 0 && <div className="vazio">Nenhum gasto registrado ainda.</div>}
      <div className="barras">
        {[...porCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
          <div key={c} className="barra-linha">
            <span className="barra-rotulo">{c}</span>
            <span className="barra" style={{ width: `${(v / maior) * 100}%` }} />
            <span className="barra-valor">{moeda(v)}</span>
          </div>
        ))}
      </div>

      <h3 className="secao">Lançamentos</h3>
      {todos.length === 0 && <div className="vazio">Nada lançado.</div>}
      <div className="lista-notas">
        {todos.slice(0, 40).map((g, i) => (
          <button key={i} className="linha" onClick={() => aoAbrir(g._path as string)}>
            <span className="linha-data">{String(g._data)}</span>
            <span className="linha-titulo">{String(g.item ?? '—')}</span>
            <span className="tipo">{String(g.cat ?? '')}</span>
            <span className="linha-valor">{moeda(num(g.valor))}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- Estudos ---------- */

export function LenteEstudos({
  notas, hoje, aoAbrir
}: { notas: NoteComCampos[]; hoje: string; aoAbrir: (p: string) => void }) {
  const materias = notas.filter(n => n.tipo === 'materia')
  const provas = notas
    .filter(n => n.tipo === 'prova' && n.date)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const questoes = notas.filter(n => n.tipo === 'questao')
  const erradas = questoes.filter(q => q.campos.acertou === false)

  const dias = (d: string) =>
    Math.round((new Date(d).getTime() - new Date(hoje).getTime()) / 86400000)

  return (
    <div className="lente">
      <h2 className="lente-titulo">Estudos</h2>

      <div className="cartoes">
        <Cartao rotulo="Matérias" valor={String(materias.length)} />
        <Cartao
          rotulo="Próxima prova"
          valor={provas[0]?.date ?? '—'}
          nota={provas[0] ? `em ${dias(provas[0].date as string)} dias` : undefined}
        />
        <Cartao rotulo="Questões" valor={String(questoes.length)} />
        <Cartao
          rotulo="Erradas"
          valor={String(erradas.length)}
          nota={questoes.length ? `${Math.round((erradas.length / questoes.length) * 100)}% do total` : undefined}
        />
      </div>

      <h3 className="secao">Provas marcadas</h3>
      <ListaNotas notas={provas} aoAbrir={aoAbrir} vazio="Nenhuma prova marcada." />

      <h3 className="secao">Matérias</h3>
      <ListaNotas notas={materias} aoAbrir={aoAbrir} vazio="Nenhuma matéria cadastrada." />

      <h3 className="secao">Para revisar</h3>
      <ListaNotas notas={erradas} aoAbrir={aoAbrir} vazio="Nada errado — ou nada registrado ainda." />
    </div>
  )
}

/* ---------- Vida ---------- */

export function LenteVida({
  notas, aoAbrir
}: { notas: NoteComCampos[]; aoAbrir: (p: string) => void }) {
  const objetivos = notas.filter(n => n.tipo === 'objetivo')
  const habitos = notas.filter(n => n.tipo === 'habito')
  const pessoas = notas.filter(n => n.tipo === 'pessoa')
  const diarios = notas.filter(n => n.tipo === 'diario')
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  return (
    <div className="lente">
      <h2 className="lente-titulo">Vida</h2>

      <div className="cartoes">
        <Cartao rotulo="Objetivos" valor={String(objetivos.length)} />
        <Cartao rotulo="Hábitos" valor={String(habitos.length)} />
        <Cartao rotulo="Pessoas" valor={String(pessoas.length)} />
        <Cartao rotulo="Dias no diário" valor={String(diarios.length)} />
      </div>

      <h3 className="secao">Objetivos</h3>
      <ListaNotas notas={objetivos} aoAbrir={aoAbrir} vazio="Nenhum objetivo escrito." />

      <h3 className="secao">Pessoas</h3>
      <ListaNotas notas={pessoas} aoAbrir={aoAbrir} vazio="Ninguém cadastrado — nutricionista, médico e fisio entram aqui." />

      <h3 className="secao">Diário</h3>
      <ListaNotas notas={diarios} aoAbrir={aoAbrir} vazio="Nenhum dia registrado." />
    </div>
  )
}

/* ---------- Agenda ---------- */

export function LenteAgenda({
  notas, hoje, aoAbrir
}: { notas: NoteComCampos[]; hoje: string; aoAbrir: (p: string) => void }) {
  const comData = notas.filter(n => n.date).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const futuras = comData.filter(n => (n.date ?? '') >= hoje)
  const passadas = comData.filter(n => (n.date ?? '') < hoje).reverse()

  const porData = new Map<string, NoteComCampos[]>()
  for (const n of futuras) {
    const d = n.date as string
    const atual = porData.get(d)
    if (atual) atual.push(n)
    else porData.set(d, [n])
  }

  return (
    <div className="lente">
      <h2 className="lente-titulo">Agenda</h2>
      <p className="lente-sub">
        Qualquer nota com o campo <code>date:</code> aparece aqui — prova, consulta,
        treino, viagem e entrega de projeto no mesmo lugar, sem código por tipo.
      </p>

      <h3 className="secao">A partir de hoje</h3>
      {porData.size === 0 && <div className="vazio">Nada marcado daqui pra frente.</div>}
      {[...porData.entries()].map(([data, doDia]) => (
        <div key={data} className="dia">
          <div className="dia-data">{data}{data === hoje ? ' · hoje' : ''}</div>
          <ListaNotas notas={doDia} aoAbrir={aoAbrir} vazio="" />
        </div>
      ))}

      <h3 className="secao">Passado</h3>
      <ListaNotas notas={passadas.slice(0, 30)} aoAbrir={aoAbrir} vazio="Nada no passado." />
    </div>
  )
}
