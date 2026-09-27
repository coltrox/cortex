import { useState } from 'react'

/**
 * A janela de "Abrir projeto": a lista da pasta de projetos, com caixinhas.
 *
 * Pedido do dono: em vez de a árvore viver mostrando todas as pastas de
 * `projetos`, ele aperta **Abrir projeto**, marca os que quer e a lista sai da
 * frente — a tela fica com o projeto aberto, não com o catálogo.
 *
 * Aceita mais de um de uma vez porque as abas já existiam: abrir três e ir
 * pulando entre elas é o uso normal dele.
 */
export function EscolherProjetos({ nomes, jaAbertos, aoAbrir, aoFechar }: {
  /** As pastas de primeiro nível da pasta de projetos, em ordem. */
  nomes: string[]
  /** Os que já estão abertos: vêm marcados, para não parecer que sumiram. */
  jaAbertos: string[]
  aoAbrir: (escolhidos: string[]) => void
  aoFechar: () => void
}) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(jaAbertos))
  const [busca, setBusca] = useState('')

  const visiveis = nomes.filter(n => n.toLowerCase().includes(busca.trim().toLowerCase()))

  const virar = (nome: string): void => {
    setMarcados(m => {
      const novo = new Set(m)
      if (novo.has(nome)) novo.delete(nome)
      else novo.add(nome)
      return novo
    })
  }

  const abrir = (): void => {
    if (marcados.size === 0) return
    // Na ordem da pasta, e não na ordem dos cliques: é a ordem que ele vê.
    aoAbrir(nomes.filter(n => marcados.has(n)))
  }

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="novo-projeto" role="dialog" aria-label="Abrir projeto" onClick={e => e.stopPropagation()}>
        <div className="novo-projeto-topo">
          <strong>Abrir projeto</strong>
          <button className="btn-icone" title="Fechar" onClick={aoFechar}>×</button>
        </div>
        {nomes.length > 8 && (
          <input
            className="busca"
            autoFocus
            value={busca}
            placeholder="Procurar pelo nome"
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') abrir() }}
          />
        )}
        {nomes.length === 0 ? (
          <p className="form-dica">Nenhum projeto na pasta ainda. Crie um, ou clone do GitHub.</p>
        ) : (
          <div className="escolher-projetos">
            {visiveis.map(n => (
              <label key={n} className="escolher-projeto">
                <input type="checkbox" checked={marcados.has(n)} onChange={() => virar(n)} />
                <span>{n}</span>
                {jaAbertos.includes(n) && <em>já aberto</em>}
              </label>
            ))}
            {visiveis.length === 0 && <p className="form-dica">Nenhum com esse nome.</p>}
          </div>
        )}
        <div className="novo-projeto-rodape">
          <button className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button className="btn" onClick={abrir} disabled={marcados.size === 0}>
            {marcados.size > 1 ? `Abrir ${marcados.size}` : 'Abrir'}
          </button>
        </div>
      </div>
    </div>
  )
}
