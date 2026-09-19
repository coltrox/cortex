import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

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
 *
 * O visual segue a referência que o dono mandou: cartão escuro, cadeado em
 * contorno, título grande em serifa num degradê da cor da área, a senha em
 * pontos grandes numa pílula escura, o botão de seta metálico e a dica como
 * etiqueta, sem itálico.
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
  const [ver, setVer] = useState(false)
  const [caps, setCaps] = useState(false)
  /** Muda a cada senha errada: é o que reinicia a animação de tremor. */
  const [tremor, setTremor] = useState(0)
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
      setTremor(t => t + 1)
      // Limpar o campo evita o caso de apertar Enter de novo sem querer e
      // achar que a senha certa é que foi recusada.
      setSenha('')
      campo.current?.focus()
    } catch {
      setErro('Não deu para conferir a senha.')
    } finally {
      setConferindo(false)
    }
  }

  const tecla = (e: KeyboardEvent<HTMLInputElement>): void => {
    setCaps(e.getModifierState('CapsLock'))
    if (e.key === 'Enter') void tentar()
  }

  return (
    <div className="tranca">
      <div key={tremor} className="tranca-cartao" data-tremer={tremor > 0}>
        <svg className="tranca-cadeado" width="26" height="26" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="10.5" width="14" height="10" rx="2" />
          <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
          <path d="M12 14.5v2" />
        </svg>
        <span className="tranca-sobre">Área Trancada</span>
        <h2 className="tranca-titulo">{nome}</h2>
        <p className="tranca-sub">Digite a senha para abrir.</p>

        <div className="tranca-pilula" data-erro={!!erro}>
          <input
            ref={campo}
            type={ver ? 'text' : 'password'}
            value={senha}
            placeholder="Senha"
            aria-label={`Senha de ${nome}`}
            autoComplete="current-password"
            onChange={e => { setSenha(e.target.value); setErro(null) }}
            onKeyDown={tecla}
            onKeyUp={e => setCaps(e.getModifierState('CapsLock'))}
          />
          <button
            type="button"
            className="tranca-olho"
            title={ver ? 'Esconder a senha' : 'Mostrar a senha'}
            aria-pressed={ver}
            onClick={() => { setVer(v => !v); campo.current?.focus() }}
          >
            {ver ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3l18 18" /><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.1 4" />
                <path d="M6.6 6.6C3.9 8.4 2.5 12 2.5 12s3.5 7 9.5 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="tranca-seta"
            title="Abrir (Enter)"
            aria-label="Abrir"
            onClick={() => void tentar()}
            disabled={senha === '' || conferindo}
          >
            {conferindo ? <span className="tranca-girando" aria-hidden="true" /> : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </div>

        <div className="tranca-aviso" aria-live="polite">
          {erro ? <span className="tranca-aviso-erro">{erro}</span>
            : caps ? <span className="tranca-aviso-caps">Caps Lock está ligado</span>
              : null}
        </div>

        {dica && (
          <p className="tranca-dica">
            <span className="tranca-dica-rotulo">Dica</span>
            <span className="tranca-dica-texto">{dica}</span>
          </p>
        )}
      </div>
    </div>
  )
}
