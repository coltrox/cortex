import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { ProcessoInfo } from '../../shared/types'

/** De quanto em quanto tempo a tela busca a saída de quem está rodando. */
const INTERVALO_MS = 800
/** De quanto em quanto tempo a lista de processos é conferida. */
const INTERVALO_LISTA_MS = 1500

/**
 * Os scripts que viram botão, e em que ordem.
 *
 * Um projeto Expo traz `android`, `ios`, `web`, `lint`, `reset-project`… O dono
 * pediu só os três do dia a dia. O processo principal continua aceitando
 * qualquer script do package.json — isto decide só o que aparece.
 */
const SCRIPTS_MOSTRADOS = ['dev', 'start', 'build']

const rotuloDoScript = (s: string): string => (s === 'start' ? 'npm start' : `npm run ${s}`)

/** A mesma saída de antes? O anel de linhas mantém o tamanho, então olha as pontas. */
const mesmas = (a: string[], b: string[]): boolean =>
  a.length === b.length && a[0] === b[0] && a[a.length - 1] === b[b.length - 1]

/**
 * A saída de um processo, com o topo (endereço, Parar).
 *
 * Usada no painel da lente Dev e no terminal flutuante — a mesma tela nos
 * dois lugares.
 */
export function SaidaProcesso({ proc }: { proc: ProcessoInfo }) {
  const [linhas, setLinhas] = useState<string[]>([])
  const caixa = useRef<HTMLPreElement>(null)
  /** O fim está à vista? Só aí a tela acompanha as linhas novas. */
  const colado = useRef(true)

  useEffect(() => { setLinhas([]); colado.current = true }, [proc.id])

  useEffect(() => {
    let vivo = true
    const tique = async (): Promise<void> => {
      try {
        const s = await window.vaultApi.saidaDoProcesso(proc.id)
        // A mesma saída não vira estado novo. Era cada busca de 800 ms criando
        // uma lista nova e mandando a tela para o fim — o "desço e volta
        // sozinho".
        if (vivo) setLinhas(atual => (mesmas(atual, s.linhas) ? atual : s.linhas))
      } catch {
        // A janela pode estar fechando. Nada a fazer, e nada a mostrar.
      }
    }
    void tique()
    // Encerrado não imprime mais: a busca acima é a última.
    if (proc.saiu !== null) return () => { vivo = false }
    const t = setInterval(() => void tique(), INTERVALO_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [proc.id, proc.saiu])

  // Rola a CAIXA, e não a página — `scrollIntoView` rolava a lente inteira —,
  // e só quando a pessoa já está no fim. Quem subiu para ler fica onde está.
  useLayoutEffect(() => {
    const el = caixa.current
    if (el && colado.current) el.scrollTop = el.scrollHeight
  }, [linhas])

  return (
    <div className="rodar-saida">
      <div className="rodar-saida-topo">
        {proc.url ? (
          // O endereço só aparece depois que o servidor o imprime — é o sinal
          // de que ele subiu de verdade, melhor do que um "iniciado".
          <a href={proc.url} target="_blank" rel="noreferrer" className="rodar-url">{proc.url}</a>
        ) : (
          <span className="rodar-saida-nome">{proc.script}</span>
        )}
        {proc.saiu === null && (
          <button className="btn-fantasma" onClick={() => void window.vaultApi.pararProcesso(proc.id)}>
            Parar
          </button>
        )}
      </div>
      <pre
        ref={caixa}
        className="rodar-linhas"
        onScroll={e => {
          const el = e.currentTarget
          colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {linhas.join('\n') || 'esperando a primeira linha…'}
      </pre>
    </div>
  )
}

/**
 * Rodar o projeto de dentro do Cortex.
 *
 * Os botões vêm dos scripts do `package.json` daquele projeto — não há campo
 * de comando livre, e o processo principal recusa qualquer script que não
 * esteja lá. É o que separa "botão de atalho" de "executar o que a tela
 * mandar".
 *
 * Quando o servidor sobe e imprime um endereço, ele vira um link. É o caminho
 * curto: aperta rodar, aparece na tela.
 *
 * `aoTerminar` avisa quando um processo desta pasta acaba — é o que faz um
 * projeto recém-criado aparecer na árvore sem ninguém recarregar.
 */
export function PainelRodar({ raiz, sub, aoTerminar }: {
  raiz: string
  sub: string
  aoTerminar?: () => void
}) {
  const [scripts, setScripts] = useState<string[]>([])
  const [rodando, setRodando] = useState<ProcessoInfo[]>([])
  const [aberto, setAberto] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  /** Muda quando algo termina, para os scripts serem lidos de novo. */
  const [versao, setVersao] = useState(0)
  const estados = useRef(new Map<string, number | null>())
  const aoTerminarRef = useRef(aoTerminar)
  aoTerminarRef.current = aoTerminar

  useEffect(() => {
    let vivo = true
    void window.vaultApi.scriptsDoProjeto(raiz, sub)
      .then(r => { if (vivo) setScripts(SCRIPTS_MOSTRADOS.filter(s => r.scripts.includes(s))) })
      .catch(() => { if (vivo) setScripts([]) })
    return () => { vivo = false }
  }, [raiz, sub, versao])

  /*
   * A lista dos processos desta pasta, conferida enquanto o painel existe.
   *
   * Antes ela só era buscada depois de apertar um botão AQUI — um processo
   * iniciado de outro jeito (criar projeto) ou antes de sair e voltar para a
   * lente não aparecia.
   */
  useEffect(() => {
    let vivo = true
    const tique = async (): Promise<void> => {
      try {
        const r = await window.vaultApi.listarProcessos()
        if (!vivo) return
        const daqui = r.processos.filter(p => p.raiz === raiz)
        let terminou = false
        for (const p of daqui) {
          if (estados.current.get(p.id) === null && p.saiu !== null) terminou = true
          estados.current.set(p.id, p.saiu)
        }
        setRodando(daqui)
        // Sem aba aberta, abre a do que está rodando agora.
        setAberto(a => (a && daqui.some(p => p.id === a))
          ? a
          : (daqui.filter(p => p.saiu === null).pop()?.id ?? null))
        if (terminou) {
          setVersao(v => v + 1)
          aoTerminarRef.current?.()
        }
      } catch {
        // A janela pode estar fechando.
      }
    }
    void tique()
    const t = setInterval(() => void tique(), INTERVALO_LISTA_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [raiz])

  const rodar = async (script: string): Promise<void> => {
    setAviso(null)
    try {
      const p = await window.vaultApi.rodarScript(raiz, script, sub)
      estados.current.set(p.id, p.saiu)
      setRodando(r => [...r.filter(x => x.id !== p.id), p])
      setAberto(p.id)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'não deu para rodar')
    }
  }

  const abrirVsCode = async (): Promise<void> => {
    setAviso(null)
    const r = await window.vaultApi.abrirNoVsCode(raiz, sub)
    if (!r.ok) setAviso(r.motivo ?? 'não deu para abrir o VS Code')
  }

  const ativos = rodando.filter(p => p.saiu === null)
  const proc = rodando.find(p => p.id === aberto) ?? null

  return (
    <div className="rodar">
      <div className="rodar-botoes">
        {scripts.length === 0 && (
          <span className="form-dica">Sem dev, start ou build no package.json desta pasta.</span>
        )}
        {scripts.map(s => (
          <button key={s} className="btn" onClick={() => void rodar(s)}>
            {rotuloDoScript(s)}
          </button>
        ))}
        <button className="btn-fantasma" onClick={() => void abrirVsCode()}>
          Abrir no VS Code
        </button>
      </div>

      {aviso && <div className="aviso">{aviso}</div>}

      {rodando.length > 0 && (
        <div className="rodar-lista">
          {rodando.map(p => (
            <button
              key={p.id}
              className={'rodar-aba ' + (p.id === aberto ? 'ativa' : '')}
              onClick={() => setAberto(p.id)}
            >
              <span className={'rodar-ponto ' + (p.saiu === null ? 'vivo' : '')} />
              {p.script}
              {p.saiu !== null && <em> · saiu ({p.saiu})</em>}
            </button>
          ))}
          {ativos.length < rodando.length && (
            <button
              className="btn-fantasma"
              onClick={() => void window.vaultApi.limparEncerrados()
                .then(r => {
                  setRodando(r.processos.filter(x => x.raiz === raiz))
                  setAberto(null)
                })}
            >
              limpar
            </button>
          )}
        </div>
      )}

      {proc && <SaidaProcesso key={proc.id} proc={proc} />}
    </div>
  )
}
