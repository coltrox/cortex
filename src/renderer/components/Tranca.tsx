import { useEffect, useRef, useState } from 'react'

/**
 * A tela que aparece no lugar de um painel trancado.
 *
 * Ela substitui o conteúdo da lente — não é um modal por cima. A diferença
 * importa: um modal deixa o que está atrás renderizado no DOM, e bastaria
 * fechar o modal pelo devtools para ler tudo. Aqui o painel não chega a ser
 * montado enquanto a senha não confere.
 *
 * A conferência acontece no processo principal. Este componente manda a
 * senha e recebe um sim ou não — ele nunca vê o segredo guardado.
 */
export function Tranca({ nome, dica, aoDestrancar }: {
  nome: string
  /**
   * A frase que o dono escreveu para lembrar a senha.
   *
   * Aparece aqui porque é aqui que ela serve — e é o único socorro que
   * existe: não há recuperação, e uma senha esquecida leva o conteúdo junto.
   * Quem chega a esta tela sem lembrar a senha não tem para onde ir.
   */
  dica?: string
  aoDestrancar: () => void
}) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => { campo.current?.focus() }, [])

  const tentar = async (): Promise<void> => {
    if (senha === '' || conferindo) return
    setConferindo(true)
    setErro(null)
    try {
      const ok = await window.vaultApi.invoke('senha:conferir', { senha }) as boolean
      if (ok) {
        aoDestrancar()
        return
      }
      setErro('Senha incorreta.')
      // Limpar o campo evita o caso de apertar Enter de novo sem querer e
      // achar que a senha certa é que foi recusada.
      setSenha('')
    } catch {
      setErro('Não deu para conferir a senha.')
    } finally {
      setConferindo(false)
    }
  }

  return (
    <div className="tranca">
      <div className="tranca-caixa">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        <h2>{nome} está trancado</h2>
        <p>Digite a senha para abrir.</p>
        {dica && <p className="tranca-dica">Sua dica: <span>{dica}</span></p>}
        <input
          ref={campo}
          type="password"
          value={senha}
          autoComplete="current-password"
          onChange={e => { setSenha(e.target.value); setErro(null) }}
          onKeyDown={e => { if (e.key === 'Enter') void tentar() }}
        />
        <button className="btn" onClick={() => void tentar()} disabled={senha === '' || conferindo}>
          {conferindo ? 'Conferindo…' : 'Abrir'}
        </button>
        {erro && <p className="tranca-erro">{erro}</p>}
      </div>
    </div>
  )
}
