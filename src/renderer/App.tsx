import { useVault } from './useVault'

export function App() {
  const { root, notes, aberta, conteudo, setConteudo, escolher, abrir, salvar, erro } = useVault()

  if (!root) {
    return (
      <div style={{ fontFamily: 'system-ui', padding: 32 }}>
        <h1>Cortex</h1>
        {erro && <div style={{ color: 'red', marginBottom: 12 }}>{erro}</div>}
        <button onClick={() => void escolher()}>Abrir pasta do vault…</button>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'system-ui', display: 'flex', height: '100vh' }}>
      <aside style={{ width: 280, borderRight: '1px solid #ccc', overflow: 'auto', padding: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>{notes.length} notas</div>
        {notes.map(n => (
          <div
            key={n.path}
            onClick={() => void abrir(n.path)}
            style={{
              padding: '4px 6px', cursor: 'pointer', borderRadius: 4,
              background: n.path === aberta ? '#dde6ff' : undefined
            }}
          >
            {n.title} <span style={{ opacity: 0.5, fontSize: 11 }}>{n.tipo}</span>
          </div>
        ))}
      </aside>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12 }}>
        <div style={{ marginBottom: 8 }}>
          <strong>{aberta ?? 'nenhuma nota aberta'}</strong>
          <button onClick={() => void salvar()} disabled={!aberta} style={{ marginLeft: 12 }}>
            Salvar
          </button>
        </div>
        {erro && <div style={{ color: 'red', marginBottom: 8 }}>{erro}</div>}
        <textarea
          value={conteudo}
          onChange={e => setConteudo(e.target.value)}
          disabled={!aberta}
          style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 13, padding: 10 }}
        />
      </main>
    </div>
  )
}
