import { useState } from 'react'
import {
  Cartao, Secao, Titulo, Linha, ListaNotas, Vazio, Check,
  moeda, num, txt, porData, type PropsLente
} from './base'

/**
 * Vida.
 *
 * Sobre a aba de contas: a senha fica em texto puro dentro do `.md`, como
 * todo o resto do vault. A tela esconde por padrão e revela sob clique, o que
 * resolve o ombro de quem passa atrás de você — e não resolve nada além
 * disso. Quem tiver acesso à pasta lê o arquivo. O aviso na tela existe para
 * que isso nunca seja uma surpresa.
 */

export function LenteVida({
  notas, sub, hoje, aoAbrir, aoAdicionar, aoEditar, aoExcluir, aoAlterar
}: PropsLente) {
  const [catCompra, setCatCompra] = useState<string | null>(null)
  const [verSenha, setVerSenha] = useState<string | null>(null)
  /** A conta cuja senha acabou de ser copiada — o botão diz "copiada" por um instante. */
  const [copiada, setCopiada] = useState<string | null>(null)

  /** Copia a senha sem abrir a nota nem mostrar a senha na tela. */
  const copiarSenha = (path: string, senha: string): void => {
    void navigator.clipboard.writeText(senha).then(() => {
      setCopiada(path)
      setTimeout(() => setCopiada(c => (c === path ? null : c)), 1500)
    }).catch(() => window.alert('não consegui copiar a senha'))
  }
  const [buscaConta, setBuscaConta] = useState('')

  const objetivos = notas.filter(n => n.tipo === 'objetivo')
  // Prioridade primeiro — é o que a estrela promete, e é o motivo de existir
  // o botão no celular. Dentro de cada grupo a mais recente vem antes: uma
  // anotação antiga marcada continua no topo, que é justamente o ponto.
  const anotacoes = notas.filter(n => n.tipo === 'anotacao').sort((a, b) => {
    const pa = a.campos.prioridade === true ? 0 : 1
    const pb = b.campos.prioridade === true ? 0 : 1
    return pa !== pb ? pa - pb : porData(b, a)
  })
  const pessoas = notas.filter(n => n.tipo === 'pessoa')
  const compras = notas.filter(n => n.tipo === 'compra')
  const docs = notas.filter(n => n.tipo === 'documento')
  const contas = notas.filter(n => n.tipo === 'conta')
  const diarios = notas.filter(n => n.tipo === 'diario').sort((a, b) => porData(b, a))

  const abertas = compras.filter(c => c.campos.feito !== true)
  const categorias = [...new Set(compras.map(c => txt(c.campos.categoria) || 'sem categoria'))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const contasFiltradas = contas.filter(c => {
    const q = buscaConta.trim().toLowerCase()
    if (!q) return true
    return c.title.toLowerCase().includes(q) ||
      txt(c.campos.categoria).toLowerCase().includes(q) ||
      txt(c.campos.usuario).toLowerCase().includes(q)
  })

  /**
   * Marca ou desmarca a prioridade de uma meta.
   *
   * Era uma por vez — marcar uma desmarcava as outras, porque o Hoje só tinha
   * lugar para um destaque. O dono pediu mais de uma, e o Hoje agora lista
   * todas na lateral; então cada meta decide só por si.
   */
  const priorizar = (path: string, jaEra: boolean): void => {
    aoAlterar(path, { prioridade: jaEra ? null : true })
  }

  return (
    <div className="lente">
      <Titulo nome="Vida" />

      {sub === 'overview' && (
        <>
          <div className="cartoes">
            <Cartao rotulo="Metas" valor={String(objetivos.length)} />
            <Cartao rotulo="Anotações" valor={String(anotacoes.length)} />
            <Cartao rotulo="Para comprar" valor={String(abertas.length)}
              nota={abertas.length ? moeda(abertas.reduce((s, c) => s + num(c.campos.valor), 0)) : undefined} />
            <Cartao rotulo="Contas guardadas" valor={String(contas.length)} />
          </div>

          <div className="grade-2">
            <section className="col">
              <Secao nome="Metas" acao="Meta" aoClicar={() => aoAdicionar('objetivo')} />
              <ListaNotas notas={objetivos} aoAbrir={aoAbrir} aoEditar={aoEditar} aoExcluir={aoExcluir}
                vazio="Nenhuma meta escrita." hoje={hoje} comPrazo />

              <Secao nome="Para comprar" acao="Item" aoClicar={() => aoAdicionar('compra')} />
              <ListaNotas notas={abertas.slice(0, 6)} aoAbrir={aoAbrir} aoEditar={aoEditar}
                vazio="Nada na lista de compras." comTipo={false} />
            </section>

            <section className="col">
              <Secao nome="Anotações recentes" acao="Anotação" aoClicar={() => aoAdicionar('anotacao')} />
              <ListaNotas notas={anotacoes.slice(0, 6)} aoAbrir={aoAbrir} aoEditar={aoEditar}
                vazio="Nenhuma anotação ainda." comTipo={false} />

              <h3 className="secao">Diário</h3>
              <ListaNotas notas={diarios.slice(0, 8)} aoAbrir={aoAbrir} vazio="Nenhum dia registrado." comTipo={false} />
            </section>
          </div>
        </>
      )}

      {sub === 'anotacoes' && (
        <>
          <Secao nome="Anotações rápidas" acao="Anotação" aoClicar={() => aoAdicionar('anotacao')} />
          {anotacoes.length === 0 ? <Vazio>Nenhuma anotação ainda.</Vazio> : (
            <div className="lista-notas">
              {anotacoes.map(a => (
                <Linha key={a.path} aoAbrir={() => aoAbrir(a.path)}
                  aoEditar={() => aoEditar(a)} aoExcluir={() => aoExcluir(a)}>
                  {a.campos.prioridade === true && (
                    <span className="pin" title="Prioridade">★</span>
                  )}
                  <span className="linha-titulo">{a.title}</span>
                  {txt(a.campos.texto) && (
                    <span className="linha-valor">{txt(a.campos.texto).slice(0, 80)}</span>
                  )}
                </Linha>
              ))}
            </div>
          )}
        </>
      )}

      {sub === 'metas' && (
        <>
          <Secao nome="Metas" acao="Meta" aoClicar={() => aoAdicionar('objetivo')} />
          {objetivos.length === 0 ? <Vazio>Nenhuma meta.</Vazio> : (
            <div className="lista-notas">
              {objetivos.map(o => {
                const prioridade = o.campos.prioridade === true
                return (
                  <Linha key={o.path} aoAbrir={() => aoAbrir(o.path)}
                    aoEditar={() => aoEditar(o)} aoExcluir={() => aoExcluir(o)}>
                    {prioridade && <span className="pin" title="Prioridade">★</span>}
                    <span className="linha-titulo">{o.title}</span>
                    <span className="linha-data">{o.date ?? ''}</span>
                    <button
                      className={prioridade ? 'btn-mini ativo' : 'btn-mini'}
                      title="A prioridade aparece no Hoje"
                      onClick={e => { e.stopPropagation(); priorizar(o.path, prioridade) }}
                    >
                      {prioridade ? 'prioridade' : 'priorizar'}
                    </button>
                  </Linha>
                )
              })}
            </div>
          )}
        </>
      )}

      {sub === 'compras' && (
        <>
          <Secao nome="Para comprar" acao="Item" aoClicar={() => aoAdicionar('compra')} />

          {categorias.length > 1 && (
            <div className="chips">
              <button className="chip" aria-pressed={catCompra === null}
                onClick={() => setCatCompra(null)}>todas</button>
              {categorias.map(c => (
                <button key={c} className="chip" aria-pressed={catCompra === c}
                  onClick={() => setCatCompra(catCompra === c ? null : c)}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {compras.length === 0 && (
            <Vazio>
              Nada na lista. Cada item vira uma nota com categoria, valor e observação.
            </Vazio>
          )}

          {categorias
            .filter(c => !catCompra || c === catCompra)
            .map(cat => {
              const itens = compras.filter(c => (txt(c.campos.categoria) || 'sem categoria') === cat)
              if (itens.length === 0) return null
              const total = itens.filter(i => i.campos.feito !== true)
                .reduce((s, i) => s + num(i.campos.valor), 0)
              return (
                <div key={cat}>
                  <Secao
                    nome={cat}
                    acao="Item"
                    aoClicar={() => aoAdicionar('compra', { categoria: cat })}
                    direita={total > 0 ? <span className="secao-total">{moeda(total)}</span> : undefined}
                  />
                  <div className="lista-notas">
                    {itens.map(c => {
                      const feito = c.campos.feito === true
                      return (
                        <Linha key={c.path} aoAbrir={() => aoAbrir(c.path)}
                          aoEditar={() => aoEditar(c)} aoExcluir={() => aoExcluir(c)}>
                          <Check feito={feito} rotulo={c.title}
                            aoAlternar={() => aoAlterar(c.path, { feito: feito ? null : true })} />
                          <span className="linha-titulo" data-feito={feito}>
                            {c.title}
                            {txt(c.campos.nota) && <em> — {txt(c.campos.nota)}</em>}
                          </span>
                          {txt(c.campos.onde) && <span className="tipo">{txt(c.campos.onde)}</span>}
                          {typeof c.campos.valor !== 'undefined' && (
                            <span className="linha-valor">{moeda(num(c.campos.valor))}</span>
                          )}
                        </Linha>
                      )
                    })}
                  </div>
                </div>
              )
            })}
        </>
      )}

      {sub === 'contas' && (
        <>
          <Secao nome="Contas e senhas" acao="Conta" aoClicar={() => aoAdicionar('conta')} />
          {contas.length > 4 && (
            <input
              className="busca"
              placeholder="Buscar conta…"
              value={buscaConta}
              onChange={e => setBuscaConta(e.target.value)}
            />
          )}

          {contas.length === 0 ? (
            <Vazio>Nenhuma conta guardada.</Vazio>
          ) : (
            <div className="lista-notas">
              {contasFiltradas.map(c => {
                const revelada = verSenha === c.path
                const senha = txt(c.campos.senha)
                return (
                  <Linha key={c.path} aoAbrir={() => aoAbrir(c.path)}
                    aoEditar={() => aoEditar(c)} aoExcluir={() => aoExcluir(c)}>
                    <span className="linha-titulo">{c.title}</span>
                    {txt(c.campos.categoria) && <span className="tipo">{txt(c.campos.categoria)}</span>}
                    <span className="conta-usuario">{txt(c.campos.usuario) || '—'}</span>
                    <span className="conta-senha">
                      <code>{senha ? (revelada ? senha : '••••••••') : 'sem senha'}</code>
                      {senha && (
                        <button
                          className="btn-mini"
                          onClick={e => { e.stopPropagation(); setVerSenha(revelada ? null : c.path) }}
                        >
                          {revelada ? 'esconder' : 'ver'}
                        </button>
                      )}
                      {/* Copiar direto da lista, sem abrir a nota e sem precisar
                          revelar a senha na tela — pedido do dono. */}
                      {senha && (
                        <button
                          className={copiada === c.path ? 'btn-mini ativo' : 'btn-mini'}
                          title="Copiar a senha"
                          onClick={e => { e.stopPropagation(); copiarSenha(c.path, senha) }}
                        >
                          {copiada === c.path ? 'copiada ✓' : 'copiar'}
                        </button>
                      )}
                    </span>
                  </Linha>
                )
              })}
            </div>
          )}
        </>
      )}

      {sub === 'pessoas' && (
        <>
          <Secao nome="Pessoas" acao="Pessoa" aoClicar={() => aoAdicionar('pessoa')} />
          {pessoas.length === 0 ? (
            <Vazio>Ninguém cadastrado — nutricionista, médico e fisio entram aqui.</Vazio>
          ) : (
            // Cartões, e não linhas: nome, papel e telefone numa linha só não
            // cabiam — o nome virava "Adri…" e o telefone quebrava em três.
            <div className="pessoas-grade">
              {[...pessoas].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')).map(p => (
                <div
                  key={p.path}
                  className="pessoa-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => aoAbrir(p.path)}
                  onKeyDown={e => { if (e.key === 'Enter') aoAbrir(p.path) }}
                >
                  <div className="pessoa-topo">
                    <span className="pessoa-avatar" aria-hidden="true">{p.title.slice(0, 1).toUpperCase()}</span>
                    <strong className="pessoa-nome">{p.title}</strong>
                    <span className="linha-acoes">
                      <button className="btn-icone" title="Editar"
                        onClick={e => { e.stopPropagation(); aoEditar(p) }}>✎</button>
                      <button className="btn-icone perigo" title="Excluir"
                        onClick={e => { e.stopPropagation(); aoExcluir(p) }}>×</button>
                    </span>
                  </div>
                  {txt(p.campos.papel) && <div className="pessoa-papel">{txt(p.campos.papel)}</div>}
                  {txt(p.campos.telefone) && <div className="pessoa-tel">{txt(p.campos.telefone)}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {sub === 'documentos' && (
        <>
          <Secao nome="Documentos" acao="Documento" aoClicar={() => aoAdicionar('documento')} />
          <p className="lente-sub">
            Digite o nome no <code>Ctrl+K</code> para achar direto — &quot;rg&quot;,
            &quot;cnh&quot;, &quot;contrato&quot;. Os arquivos ficam em <code>Anexos/</code>.
          </p>
          {docs.length === 0 ? (
            <Vazio>Nenhum documento cadastrado.</Vazio>
          ) : (
            <div className="lista-notas">
              {docs.map(d => (
                <Linha key={d.path} aoAbrir={() => aoAbrir(d.path)}
                  aoEditar={() => aoEditar(d)} aoExcluir={() => aoExcluir(d)}>
                  <span className="linha-titulo">{d.title}</span>
                  {txt(d.campos.numero) && <span className="conta-usuario">{txt(d.campos.numero)}</span>}
                  {txt(d.campos.arquivo) && <span className="tipo">{txt(d.campos.arquivo)}</span>}
                  {txt(d.campos.validade) && (
                    <span className="linha-valor">vence {txt(d.campos.validade)}</span>
                  )}
                </Linha>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
