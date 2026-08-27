import { useState } from 'react'
import type { NoteComCampos } from '../tipos'
import {
  Cartao, Secao, Titulo, Linha, ListaNotas, Prazo, Vazio, Progresso, Check,
  num, txt, porData, type PropsLente
} from './base'
import { diasAte, rotuloPrazo } from '../subnav'

/**
 * Estudos.
 *
 * O contador de prazo é a peça central: uma prova esquenta conforme a data
 * chega, e o botão "revisei" a esfria. Não é decoração — é o mecanismo que
 * transforma uma lista de datas numa fila de trabalho, e foi por isso que ele
 * foi pedido também para as tarefas.
 *
 * Clicar em qualquer coisa abre a nota AQUI DENTRO, sobre esta lente. O app
 * não te joga mais para uma aba de notas.
 */

const MATERIAS = [
  'matemática', 'física', 'química', 'biologia', 'português', 'literatura',
  'história', 'geografia', 'filosofia', 'sociologia', 'inglês', 'redação'
]

/** Repertórios são escritos um por linha; ponto e vírgula também separa. */
const repertoriosDe = (v: unknown): string[] =>
  txt(v).split(/[\n;]/).map(s => s.trim()).filter(Boolean)

export function LenteEstudos({
  notas, sub, hoje, aoAbrir, aoAdicionar, aoEditar, aoExcluir, aoAlterar
}: PropsLente) {
  const [materiaFiltro, setMateriaFiltro] = useState<string | null>(null)

  const conteudos = notas.filter(n => n.tipo === 'materia')
  const provas = notas.filter(n => n.tipo === 'prova' && n.date).sort(porData)
  const simulados = notas.filter(n => n.tipo === 'simulado').sort(porData)
  const redacoes = notas.filter(n => n.tipo === 'redacao').sort(porData)
  const tarefas = notas.filter(n => n.tipo === 'tarefa').sort(porData)
  const livros = notas.filter(n => n.tipo === 'livro')

  const futuras = provas.filter(p => (p.date ?? '') >= hoje)
  const abertas = tarefas.filter(t => t.campos.feito !== true)

  // Reta final primeiro, depois o que você domina menos. É a ordem em que se
  // deve estudar, então é a ordem em que a tela mostra.
  const ordenados = [...conteudos]
    .filter(c => !materiaFiltro || txt(c.campos.materia) === materiaFiltro)
    .sort((a, b) => {
      const pa = a.campos.prioridade === true ? 0 : 1
      const pb = b.campos.prioridade === true ? 0 : 1
      if (pa !== pb) return pa - pb
      return (num(a.campos.dominio) || 3) - (num(b.campos.dominio) || 3)
    })

  const usadas = new Set(conteudos.map(c => txt(c.campos.materia)).filter(Boolean))

  const contagemRepertorios = (): [string, number][] => {
    const conta = new Map<string, number>()
    for (const r of redacoes) {
      for (const rep of repertoriosDe(r.campos.repertorios)) {
        conta.set(rep, (conta.get(rep) ?? 0) + 1)
      }
    }
    return [...conta.entries()].sort((a, b) => b[1] - a[1])
  }

  const ultimoSimulado = simulados[simulados.length - 1]
  const pctUltimo = ultimoSimulado && num(ultimoSimulado.campos.total)
    ? Math.round((num(ultimoSimulado.campos.acertos) / num(ultimoSimulado.campos.total)) * 100)
    : null

  return (
    <div className="lente">
      <Titulo nome="Estudos" />

      {sub === 'overview' && (
        <>
          <div className="cartoes">
            <Cartao rotulo="Conteúdos" valor={String(conteudos.length)}
              nota={`${conteudos.filter(c => c.campos.prioridade === true).length} na reta final`} />
            <Cartao
              rotulo="Próxima prova"
              valor={futuras[0]?.date ?? '—'}
              nota={futuras[0] ? rotuloPrazo(diasAte(futuras[0].date as string, hoje)) : undefined}
              tom={futuras[0] && diasAte(futuras[0].date as string, hoje) <= 7 ? 'alerta' : undefined}
            />
            <Cartao
              rotulo="Último simulado"
              valor={pctUltimo === null ? (ultimoSimulado ? String(num(ultimoSimulado.campos.acertos)) : '—') : `${pctUltimo}%`}
              nota={ultimoSimulado?.date ?? undefined}
            />
            <Cartao rotulo="Tarefas abertas" valor={String(abertas.length)} />
          </div>

          <h3 className="secao">Prazos</h3>
          <ListaNotas
            notas={[...futuras, ...abertas].sort(porData)}
            aoAbrir={aoAbrir} aoEditar={aoEditar} aoExcluir={aoExcluir}
            vazio="Nenhum prazo à vista." hoje={hoje} comPrazo
          />

          <h3 className="secao">Revisar agora</h3>
          <ListaConteudos
            conteudos={ordenados.slice(0, 8)} aoAbrir={aoAbrir}
            aoEditar={aoEditar} aoExcluir={aoExcluir}
            vazio="Nenhum conteúdo cadastrado."
          />
        </>
      )}

      {sub === 'conteudos' && (
        <>
          <Secao nome="Conteúdos" acao="Conteúdo" aoClicar={() => aoAdicionar('materia')} />
          <p className="lente-sub">
            Clique para abrir o resumo aqui mesmo — com fórmulas, tabelas e tudo
            que você escrever em markdown. A ordem é a da revisão: reta final no
            topo, depois o que você domina menos.
          </p>

          <div className="chips">
            <button className="chip" aria-pressed={materiaFiltro === null}
              onClick={() => setMateriaFiltro(null)}>todas</button>
            {MATERIAS.filter(m => usadas.has(m)).map(m => (
              <button key={m} className="chip" aria-pressed={materiaFiltro === m}
                onClick={() => setMateriaFiltro(materiaFiltro === m ? null : m)}>
                {m}
              </button>
            ))}
          </div>

          <ListaConteudos
            conteudos={ordenados} aoAbrir={aoAbrir}
            aoEditar={aoEditar} aoExcluir={aoExcluir}
            vazio="Nenhum conteúdo cadastrado."
          />
        </>
      )}

      {sub === 'provas' && (
        <>
          <Secao nome="Marcadas" acao="Prova" aoClicar={() => aoAdicionar('prova')} />
          {futuras.length === 0 ? <Vazio>Nenhuma prova marcada.</Vazio> : (
            <div className="lista-notas">
              {futuras.map(p => {
                const revisada = p.campos.revisada === true
                return (
                  <Linha key={p.path} aoAbrir={() => aoAbrir(p.path)}
                    aoEditar={() => aoEditar(p)} aoExcluir={() => aoExcluir(p)}>
                    <span className="linha-data">{p.date}</span>
                    <span className="linha-titulo">{p.title}</span>
                    {txt(p.campos.materia) && <span className="tipo">{txt(p.campos.materia)}</span>}
                    <Prazo data={p.date as string} hoje={hoje} feito={revisada} />
                    <button
                      className={revisada ? 'btn-mini ativo' : 'btn-mini'}
                      title="O contador esfria quando você marca que revisou"
                      onClick={e => {
                        e.stopPropagation()
                        aoAlterar(p.path, { revisada: revisada ? null : true })
                      }}
                    >
                      {revisada ? 'revisada' : 'revisei'}
                    </button>
                  </Linha>
                )
              })}
            </div>
          )}

          <h3 className="secao">Passadas</h3>
          <ListaNotas
            notas={provas.filter(p => (p.date ?? '') < hoje).reverse()}
            aoAbrir={aoAbrir} aoEditar={aoEditar} aoExcluir={aoExcluir} vazio="Nenhuma."
          />
        </>
      )}

      {sub === 'simulados' && (
        <>
          <Secao nome="Simulados" acao="Simulado" aoClicar={() => aoAdicionar('simulado')} />
          {simulados.length === 0 ? (
            <Vazio>Nenhum simulado registrado.</Vazio>
          ) : (
            <div className="lista-notas">
              {[...simulados].reverse().map(s => {
                const a = num(s.campos.acertos)
                const t = num(s.campos.total)
                const pct = t ? Math.round((a / t) * 100) : 0
                return (
                  <Linha key={s.path} aoAbrir={() => aoAbrir(s.path)}
                    aoEditar={() => aoEditar(s)} aoExcluir={() => aoExcluir(s)}>
                    <span className="linha-data">{s.date ?? '—'}</span>
                    <span className="linha-titulo">{s.title}</span>
                    {txt(s.campos.materia) && <span className="tipo">{txt(s.campos.materia)}</span>}
                    <span className="linha-valor">{t ? `${a}/${t}` : `${a} acertos`}</span>
                    {t > 0 && (
                      <span className="nivel" data-n={Math.max(1, Math.ceil(pct / 20))}>{pct}%</span>
                    )}
                  </Linha>
                )
              })}
            </div>
          )}
        </>
      )}

      {sub === 'redacoes' && (
        <>
          <Secao nome="Redações" acao="Redação" aoClicar={() => aoAdicionar('redacao')} />
          {redacoes.length === 0 ? (
            <Vazio>Nenhuma redação. O tema, a nota e os repertórios usados ficam aqui.</Vazio>
          ) : (
            <div className="cards">
              {[...redacoes].reverse().map(r => {
                const reps = repertoriosDe(r.campos.repertorios)
                return (
                  <div key={r.path} className="card">
                    <div className="card-topo">
                      <strong>{r.title}</strong>
                      {typeof r.campos.nota !== 'undefined' && (
                        <span className="nivel" data-n={Math.max(1, Math.ceil(num(r.campos.nota) / 200))}>
                          {num(r.campos.nota)}
                        </span>
                      )}
                      <span className="linha-acoes">
                        <button className="btn-icone" title="Editar" onClick={() => aoEditar(r)}>✎</button>
                        <button className="btn-icone perigo" title="Excluir" onClick={() => aoExcluir(r)}>×</button>
                      </span>
                    </div>
                    <div className="card-data">{r.date}</div>
                    <div className="chips">
                      {reps.length === 0
                        ? <span className="form-dica">Nenhum repertório anotado.</span>
                        : reps.map((rep, i) => <span key={i} className="chip">{rep}</span>)}
                    </div>
                    <button className="btn-fantasma largo" onClick={() => aoAbrir(r.path)}>
                      Abrir o texto
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <h3 className="secao">Repertórios que você mais usa</h3>
          <div className="chips">
            {contagemRepertorios().length === 0
              ? <span className="form-dica">Nada ainda.</span>
              : contagemRepertorios().map(([rep, n]) => (
                <span key={rep} className="chip">{rep}{n > 1 ? ` · ${n}` : ''}</span>
              ))}
          </div>
        </>
      )}

      {sub === 'tarefas' && (
        <>
          <Secao nome="Abertas" acao="Tarefa" aoClicar={() => aoAdicionar('tarefa')} />
          {abertas.length === 0 ? <Vazio>Nenhuma tarefa aberta.</Vazio> : (
            <div className="lista-notas">
              {abertas.map(t => (
                <Linha key={t.path} aoAbrir={() => aoAbrir(t.path)}
                  aoEditar={() => aoEditar(t)} aoExcluir={() => aoExcluir(t)}>
                  <Check feito={false} rotulo={t.title}
                    aoAlternar={() => aoAlterar(t.path, { feito: true })} />
                  <span className="linha-data">{t.date}</span>
                  <span className="linha-titulo">{t.title}</span>
                  {txt(t.campos.materia) && <span className="tipo">{txt(t.campos.materia)}</span>}
                  {t.date && <Prazo data={t.date} hoje={hoje} feito={false} />}
                </Linha>
              ))}
            </div>
          )}

          <h3 className="secao">Concluídas</h3>
          {tarefas.filter(t => t.campos.feito === true).length === 0 ? <Vazio>Nenhuma.</Vazio> : (
            <div className="lista-notas">
              {tarefas.filter(t => t.campos.feito === true).reverse().map(t => (
                <Linha key={t.path} aoAbrir={() => aoAbrir(t.path)} aoExcluir={() => aoExcluir(t)}>
                  <Check feito rotulo={t.title}
                    aoAlternar={() => aoAlterar(t.path, { feito: null })} />
                  <span className="linha-data">{t.date}</span>
                  <span className="linha-titulo" data-feito>{t.title}</span>
                </Linha>
              ))}
            </div>
          )}
        </>
      )}

      {sub === 'livros' && (
        <>
          <Secao nome="Livros" acao="Livro" aoClicar={() => aoAdicionar('livro')} />
          {livros.length === 0 ? (
            <Vazio>Nenhum livro. Nome, autor, páginas e o resumo entram na nota.</Vazio>
          ) : (
            <div className="cards">
              {livros.map(l => {
                const total = num(l.campos.paginas)
                const atual = num(l.campos.pagina)
                return (
                  <div key={l.path} className="card">
                    <div className="card-topo">
                      <strong>{l.title}</strong>
                      <span className="tipo">{txt(l.campos.status) || 'na fila'}</span>
                      <span className="linha-acoes">
                        <button className="btn-icone" title="Editar" onClick={() => aoEditar(l)}>✎</button>
                        <button className="btn-icone perigo" title="Excluir" onClick={() => aoExcluir(l)}>×</button>
                      </span>
                    </div>
                    <div className="card-data">{txt(l.campos.autor) || 'sem autor'}</div>
                    {total > 0
                      ? <Progresso feito={atual} total={total} rotulo={`${atual} de ${total} páginas`} />
                      : <div className="form-dica">Sem total de páginas.</div>}
                    <button className="btn-fantasma largo" onClick={() => aoAbrir(l.path)}>
                      Abrir o resumo
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ListaConteudos({ conteudos, aoAbrir, aoEditar, aoExcluir, vazio }: {
  conteudos: NoteComCampos[]
  aoAbrir: PropsLente['aoAbrir']
  aoEditar: PropsLente['aoEditar']
  aoExcluir: PropsLente['aoExcluir']
  vazio: string
}) {
  if (conteudos.length === 0) return <Vazio>{vazio}</Vazio>
  return (
    <div className="lista-notas">
      {conteudos.map(c => (
        <Linha key={c.path} aoAbrir={() => aoAbrir(c.path)}
          aoEditar={() => aoEditar(c)} aoExcluir={() => aoExcluir(c)}>
          {c.campos.prioridade === true && <span className="pin" title="Reta final">★</span>}
          <span className="linha-titulo">{c.title}</span>
          {txt(c.campos.materia) && <span className="tipo">{txt(c.campos.materia)}</span>}
          {typeof c.campos.dominio !== 'undefined' && (
            <span className="nivel" data-n={num(c.campos.dominio)}>
              domínio {num(c.campos.dominio)}/5
            </span>
          )}
          <span className="linha-valor">{txt(c.campos.status) || 'sem status'}</span>
        </Linha>
      ))}
    </div>
  )
}
