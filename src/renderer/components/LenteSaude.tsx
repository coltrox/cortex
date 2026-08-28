import type { NoteComCampos } from '../tipos'
import { DIAS_SEMANA } from '../formularios'
import {
  Cartao, Serie, Secao, Check, Titulo, Linha, ListaNotas, Vazio, Progresso,
  nf, num, txt, lista, textos, porData, type PropsLente
} from './base'
import { suplementosDoDia, seriePeso, totaisDoDia } from '../dados'

/**
 * Saúde.
 *
 * Três ideias sustentam esta lente:
 *
 * 1. Treino tem MODELO e SESSÃO. O modelo é a estrutura ("Push A tem supino,
 *    desenvolvimento, tríceps"); a sessão é o que aconteceu hoje, com as
 *    cargas. Mexer numa sessão nunca mexe no modelo — foi pedido explícito, e
 *    é o que permite variar um treino sem reescrever a rotina.
 *
 * 2. Dieta tem PLANO e DIA. O plano ativo define as refeições; o dia só
 *    guarda quais você marcou. Como cada dia é um arquivo, virar o dia limpa
 *    os checks sozinho e o dia anterior fica gravado para consulta futura.
 *
 * 3. Suplemento sabe em que dias da semana entra, então o app sabe quais são
 *    os de hoje sem você dizer.
 */

const APARELHOS = ['esteira', 'bike', 'escada', 'elíptico', 'rua']

const MEDIDAS = [
  ['peso', 'Peso', 'kg'], ['gordura', 'Gordura', '%'], ['cintura', 'Cintura', 'cm'],
  ['peito', 'Peito', 'cm'], ['braco', 'Braço', 'cm'], ['antebraco', 'Antebraço', 'cm'],
  ['coxa', 'Coxa', 'cm'], ['panturrilha', 'Panturrilha', 'cm'], ['quadril', 'Quadril', 'cm']
] as const

export function LenteSaude({
  notas, sub, hoje, aoAbrir, aoAdicionar, aoEditar, aoExcluir, aoLancar,
  aoAlterar, aoMarcarDia, aoModal
}: PropsLente) {
  const modelos = notas.filter(n => n.tipo === 'treino-modelo')
  const sessoes = notas.filter(n => n.tipo === 'sessao').sort(porData)
  const cardios = notas.filter(n => n.tipo === 'cardio').sort(porData)
  const consultas = notas.filter(n => n.tipo === 'consulta').sort(porData)
  const suplementos = notas.filter(n => n.tipo === 'suplemento')
  const planos = notas.filter(n => n.tipo === 'plano')
  const medidas = notas.filter(n => n.tipo === 'medida').sort(porData)
  const diarios = notas.filter(n => n.tipo === 'diario').sort(porData)
  const diarioHoje = diarios.find(d => d.date === hoje)

  const pesos = seriePeso(notas)
  const ultimo = pesos[pesos.length - 1]
  const primeiro = pesos[0]
  const delta = ultimo && primeiro ? ultimo.y - primeiro.y : 0

  const planoAtivo = planos.find(p => p.campos.ativo === true)
  const suplementosHoje = suplementosDoDia(notas, hoje)

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
            <Cartao rotulo="Treinos" valor={String(sessoes.length)} nota={`${cardios.length} de cardio`} />
            <Cartao
              rotulo="Plano ativo"
              valor={planoAtivo ? txt(planoAtivo.campos.objetivo) || 'ativo' : '—'}
              nota={planoAtivo?.title}
            />
          </div>

          <h3 className="secao">Peso ao longo do tempo</h3>
          <Serie pontos={pesos} rotulo="kg" />

          <Secao nome="Consultas" acao="Consulta" aoClicar={() => aoAdicionar('consulta')} />
          <ListaNotas
            notas={consultas.filter(c => (c.date ?? '') >= hoje)}
            aoAbrir={aoAbrir} aoEditar={aoEditar} aoExcluir={aoExcluir}
            vazio="Nenhuma consulta marcada." hoje={hoje} comPrazo
          />
        </>
      )}

      {sub === 'treinos' && (
        <>
          <Secao
            nome="Meus treinos"
            acao="Treino"
            aoClicar={() => aoAdicionar('treino-modelo')}
            direita={
              <button className="btn" onClick={() => aoModal('registro-treino')}>
                Registrar treino de hoje
              </button>
            }
          />
          {modelos.length === 0
            ? <Vazio>Nenhum treino montado. Crie um com os exercícios, séries e reps — as cargas você registra na hora.</Vazio>
            : (
              <div className="cards">
                {modelos.map(m => {
                  const exs = lista(m.campos.exercicios)
                  return (
                    <div key={m.path} className="card">
                      <div className="card-topo">
                        <strong>{m.title}</strong>
                        <span className="tipo">{txt(m.campos.grupo)}</span>
                        <span className="linha-acoes">
                          <button className="btn-icone" title="Editar" onClick={() => aoEditar(m)}>✎</button>
                          <button className="btn-icone perigo" title="Excluir" onClick={() => aoExcluir(m)}>×</button>
                        </span>
                      </div>
                      <ol className="card-lista">
                        {exs.map((e, i) => (
                          <li key={i}>
                            {txt(e.nome)}
                            <span>{num(e.series) || '—'}×{txt(e.reps) || '—'}</span>
                          </li>
                        ))}
                        {exs.length === 0 && <li className="vazio">Sem exercícios ainda.</li>}
                      </ol>
                      <button className="btn-fantasma largo"
                        onClick={() => aoModal('registro-treino', { modelo: m.path })}>
                        Treinar este
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

          <h3 className="secao">Histórico</h3>
          {sessoes.length === 0 ? <Vazio>Nenhum treino registrado.</Vazio> : (
            <div className="lista-notas">
              {[...sessoes].reverse().map(s => {
                const exs = lista(s.campos.exercicios)
                const cargas = exs.filter(e => txt(e.carga)).map(e => txt(e.carga))
                return (
                  <Linha key={s.path} aoAbrir={() => aoAbrir(s.path)}
                    aoEditar={() => aoEditar(s)} aoExcluir={() => aoExcluir(s)}>
                    <span className="linha-data">{s.date}</span>
                    <span className="linha-titulo">{txt(s.campos.modelo) || s.title}</span>
                    <span className="linha-valor">
                      {exs.length} exercícios{cargas.length ? ` · ${cargas.join(', ')}` : ''}
                    </span>
                  </Linha>
                )
              })}
            </div>
          )}
        </>
      )}

      {sub === 'cardio' && (
        <>
          <div className="cartoes">
            <Cartao rotulo="Sessões" valor={String(cardios.length)} />
            <Cartao
              rotulo="Tempo total"
              valor={`${cardios.reduce((s, c) => s + num(c.campos.minutos), 0)} min`}
            />
            <Cartao
              rotulo="Distância"
              valor={`${nf.format(cardios.reduce((s, c) => s + num(c.campos.distancia), 0))} km`}
            />
          </div>

          <Secao nome="Sessões" acao="Cardio" aoClicar={() => aoAdicionar('cardio')} />
          {cardios.length === 0 ? <Vazio>Nada registrado ainda.</Vazio> : (
            <div className="lista-notas">
              {[...cardios].reverse().map(c => (
                <Linha key={c.path} aoAbrir={() => aoAbrir(c.path)}
                  aoEditar={() => aoEditar(c)} aoExcluir={() => aoExcluir(c)}>
                  <span className="linha-data">{c.date}</span>
                  <span className="tipo" data-t="cardio">{txt(c.campos.aparelho) || 'cardio'}</span>
                  <span className="linha-titulo">{num(c.campos.minutos)} min</span>
                  <span className="linha-valor">
                    {num(c.campos.distancia) ? `${nf.format(num(c.campos.distancia))} km · ` : ''}
                    {txt(c.campos.pace) || '—'}
                  </span>
                </Linha>
              ))}
            </div>
          )}

          <h3 className="secao">Por aparelho</h3>
          <div className="chips">
            {APARELHOS.map(a => {
              const min = cardios.filter(c => txt(c.campos.aparelho) === a)
                .reduce((s, c) => s + num(c.campos.minutos), 0)
              return <span key={a} className="chip" data-vazio={min === 0}>{a} · {min} min</span>
            })}
          </div>
        </>
      )}

      {sub === 'medidas' && (
        <>
          <Secao nome="Peso" acao="Medida" aoClicar={() => aoAdicionar('medida')} />
          <Serie pontos={pesos} rotulo="kg" />

          <h3 className="secao">Registros</h3>
          {medidas.length === 0 ? <Vazio>Nenhuma medida registrada.</Vazio> : (
            <div className="md-tabela-caixa">
              <table className="md-tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    {MEDIDAS.map(([k, nome]) => <th key={k}>{nome}</th>)}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...medidas].reverse().map(m => (
                    <tr key={m.path}>
                      <td>{m.date}</td>
                      {MEDIDAS.map(([k, , un]) => (
                        <td key={k}>
                          {typeof m.campos[k] === 'undefined' ? '—' : `${nf.format(num(m.campos[k]))} ${un}`}
                        </td>
                      ))}
                      <td>
                        <span className="linha-acoes">
                          <button className="btn-icone" title="Editar" onClick={() => aoEditar(m)}>✎</button>
                          <button className="btn-icone perigo" title="Excluir" onClick={() => aoExcluir(m)}>×</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {sub === 'dieta' && (
        <Dieta
          planos={planos} planoAtivo={planoAtivo} diarioHoje={diarioHoje} diarios={diarios}
          hoje={hoje} aoAdicionar={aoAdicionar} aoEditar={aoEditar} aoExcluir={aoExcluir}
          aoAlterar={aoAlterar} aoMarcarDia={aoMarcarDia} aoLancar={aoLancar} aoAbrir={aoAbrir}
        />
      )}

      {sub === 'suplementos' && (
        <>
          <Secao nome="Hoje" acao="Suplemento" aoClicar={() => aoAdicionar('suplemento')} />
          {suplementosHoje.length === 0 ? <Vazio>Nenhum suplemento para hoje.</Vazio> : (
            <div className="lista-notas">
              {suplementosHoje.map(s => {
                const feitos = textos(diarioHoje?.campos.suplementos_feitos)
                const feito = feitos.includes(s.title)
                return (
                  <Linha key={s.path} aoAbrir={() => aoAbrir(s.path)}>
                    <Check
                      feito={feito}
                      rotulo={s.title}
                      aoAlternar={() => aoMarcarDia(hoje, {
                        suplementos_feitos: feito
                          ? feitos.filter(f => f !== s.title)
                          : [...feitos, s.title]
                      })}
                    />
                    <span className="linha-titulo" data-feito={feito}>{s.title}</span>
                    <span className="linha-valor">{txt(s.campos.dose)}</span>
                    <span className="tipo">{txt(s.campos.quando)}</span>
                  </Linha>
                )
              })}
            </div>
          )}

          <h3 className="secao">Todos</h3>
          {suplementos.length === 0 ? <Vazio>Nenhum suplemento cadastrado.</Vazio> : (
            <div className="lista-notas">
              {suplementos.map(s => {
                const dias = textos(s.campos.dias)
                return (
                  <Linha key={s.path} aoAbrir={() => aoAbrir(s.path)}
                    aoEditar={() => aoEditar(s)} aoExcluir={() => aoExcluir(s)}>
                    <span className="linha-titulo">{s.title}</span>
                    <span className="linha-valor">{txt(s.campos.dose)}</span>
                    <span className="dias-mini">
                      {DIAS_SEMANA.map(d => (
                        <span key={d.id} data-on={dias.length === 0 || dias.includes(d.id)}>{d.nome}</span>
                      ))}
                    </span>
                    {typeof s.campos.estoque !== 'undefined' && (
                      <span className="tipo" data-t={num(s.campos.estoque) < 7 ? 'alerta' : undefined}>
                        {num(s.campos.estoque)} doses
                      </span>
                    )}
                  </Linha>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------- dieta ---------- */

function Dieta({
  planos, planoAtivo, diarioHoje, diarios, hoje,
  aoAdicionar, aoEditar, aoExcluir, aoAlterar, aoMarcarDia, aoLancar, aoAbrir
}: {
  planos: NoteComCampos[]
  planoAtivo: NoteComCampos | undefined
  diarioHoje: NoteComCampos | undefined
  diarios: NoteComCampos[]
  hoje: string
} & Pick<PropsLente, 'aoAdicionar' | 'aoEditar' | 'aoExcluir' | 'aoAlterar' | 'aoMarcarDia' | 'aoLancar' | 'aoAbrir'>) {
  const refeicoes = lista(planoAtivo?.campos.refeicoes)
  const feitas = textos(diarioHoje?.campos.dieta_feitas)
  const extras = lista(diarioHoje?.campos.extras)

  const kcalPlano = refeicoes.reduce((s, r) => s + num(r.kcal), 0)
  const { kcal: kcalFeito, prot: protFeito } = totaisDoDia(planoAtivo, diarioHoje)

  /**
   * Ativar um plano desativa os outros. Sem isso dois planos ativos deixariam
   * a aba do dia sem saber qual lista mostrar — e escolher "o primeiro"
   * silenciosamente seria pior do que não deixar acontecer.
   */
  const ativar = (p: NoteComCampos): void => {
    for (const outro of planos) {
      if (outro.path === p.path) aoAlterar(outro.path, { ativo: true })
      else if (outro.campos.ativo === true) aoAlterar(outro.path, { ativo: null })
    }
  }

  const anteriores = [...diarios].reverse()
    .filter(d => d.date !== hoje && textos(d.campos.dieta_feitas).length > 0)

  return (
    <>
      <Secao
        nome={`Dieta de hoje${planoAtivo ? ` · ${planoAtivo.title}` : ''}`}
        acao="Comi algo a mais"
        aoClicar={() => aoLancar('refeicao', hoje)}
      />

      {!planoAtivo ? (
        <Vazio>
          Nenhum plano ativo. Monte um plano abaixo com as refeições do dia e ative
          — é ele que aparece aqui para você marcar.
        </Vazio>
      ) : (
        <>
          <div className="cartoes">
            <Cartao
              rotulo="Calorias"
              valor={`${kcalFeito}`}
              nota={num(planoAtivo.campos.kcal) ? `meta ${num(planoAtivo.campos.kcal)}` : `plano ${kcalPlano}`}
            />
            <Cartao
              rotulo="Proteína"
              valor={`${protFeito} g`}
              nota={num(planoAtivo.campos.prot) ? `meta ${num(planoAtivo.campos.prot)} g` : undefined}
            />
            <Cartao rotulo="Refeições" valor={`${feitas.length}/${refeicoes.length}`} />
            <Cartao rotulo="Objetivo" valor={txt(planoAtivo.campos.objetivo) || '—'} />
          </div>

          {num(planoAtivo.campos.kcal) > 0 && (
            <Progresso
              feito={kcalFeito} total={num(planoAtivo.campos.kcal)}
              rotulo={`${kcalFeito} de ${num(planoAtivo.campos.kcal)} kcal`}
            />
          )}

          <div className="lista-notas">
            {refeicoes.map((r, i) => {
              const nome = txt(r.nome) || `Refeição ${i + 1}`
              const feito = feitas.includes(nome)
              return (
                <Linha key={i}>
                  <Check
                    feito={feito}
                    rotulo={nome}
                    aoAlternar={() => aoMarcarDia(hoje, {
                      dieta_feitas: feito ? feitas.filter(f => f !== nome) : [...feitas, nome]
                    })}
                  />
                  <span className="linha-data">{txt(r.hora)}</span>
                  <span className="linha-titulo" data-feito={feito}>
                    {nome}
                    {txt(r.itens) && <em> — {txt(r.itens)}</em>}
                  </span>
                  <span className="linha-valor">{num(r.kcal)} kcal · {num(r.prot)} g</span>
                </Linha>
              )
            })}
            {refeicoes.length === 0 && <Vazio>O plano ativo não tem refeições. Edite-o para adicionar.</Vazio>}
          </div>

          {extras.length > 0 && (
            <>
              <h3 className="secao">Fora do plano hoje</h3>
              <div className="lista-notas">
                {extras.map((e, i) => (
                  <Linha key={i}>
                    <span className="linha-titulo">{txt(e.item)}</span>
                    <span className="linha-valor">{num(e.kcal)} kcal · {num(e.prot)} g</span>
                  </Linha>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Secao nome="Planos" acao="Plano" aoClicar={() => aoAdicionar('plano')} />
      {planos.length === 0 ? <Vazio>Nenhum plano montado.</Vazio> : (
        <div className="lista-notas">
          {planos.map(p => (
            <Linha key={p.path} aoAbrir={() => aoAbrir(p.path)}
              aoEditar={() => aoEditar(p)} aoExcluir={() => aoExcluir(p)}>
              <span className="linha-titulo">{p.title}</span>
              <span className="tipo">{txt(p.campos.objetivo)}</span>
              <span className="linha-valor">
                {num(p.campos.kcal) ? `${num(p.campos.kcal)} kcal` : ''}
                {lista(p.campos.refeicoes).length ? ` · ${lista(p.campos.refeicoes).length} refeições` : ''}
              </span>
              <button
                className={p.campos.ativo === true ? 'btn-mini ativo' : 'btn-mini'}
                onClick={e => { e.stopPropagation(); ativar(p) }}
              >
                {p.campos.ativo === true ? 'ativo' : 'ativar'}
              </button>
            </Linha>
          ))}
        </div>
      )}

      <h3 className="secao">Dias anteriores</h3>
      {anteriores.length === 0
        ? <Vazio>Nada guardado ainda — cada dia marcado fica registrado aqui.</Vazio>
        : (
          <div className="lista-notas">
            {anteriores.slice(0, 30).map(d => (
              <Linha key={d.path} aoAbrir={() => aoAbrir(d.path)}>
                <span className="linha-data">{d.date}</span>
                <span className="linha-titulo">{textos(d.campos.dieta_feitas).join(', ')}</span>
                <span className="linha-valor">
                  {lista(d.campos.extras).length ? `+${lista(d.campos.extras).length} fora do plano` : ''}
                </span>
              </Linha>
            ))}
          </div>
        )}
    </>
  )
}
