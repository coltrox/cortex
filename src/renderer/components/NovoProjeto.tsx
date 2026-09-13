import { useEffect, useState } from 'react'
import type { LinguagemProjeto, ModeloProjeto } from '../../shared/types'

const MODELOS: { id: ModeloProjeto; nome: string; descricao: string }[] = [
  { id: 'expo', nome: 'Expo', descricao: 'App de celular com React Native. Abre no Expo Go pelo QR code.' },
  { id: 'vite', nome: 'React + Vite', descricao: 'Site ou app web com React. Abre no navegador.' }
]

/** O mesmo formato que o processo principal confere — ver `main/dev/novoProjeto.ts`. */
export const NOME_VALIDO = /^[a-z][a-z0-9_-]{0,59}$/

/**
 * O que a pessoa digita vira um nome aceitável enquanto digita: minúsculas,
 * sem acento, espaço vira hífen, e o resto some. Melhor do que deixar digitar
 * "Meu App" e recusar no botão.
 */
export function normalizarNome(bruto: string): string {
  return bruto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 60)
}

/** O comando que vai rodar, para a pessoa ver antes de apertar. */
export function comandoDe(modelo: ModeloProjeto, linguagem: LinguagemProjeto, nome: string): string {
  const ts = linguagem === 'ts'
  return modelo === 'expo'
    ? `npx create-expo-app@latest ${nome} --template ${ts ? 'blank-typescript' : 'blank'}`
    : `npx create-vite@latest ${nome} --template ${ts ? 'react-ts' : 'react'}\nnpm install`
}

/**
 * Criar um projeto novo: tipo, linguagem, nome — e o Cortex roda o resto.
 *
 * `aoCriar` devolve se deu certo; só aí a janela fecha. Com erro (nome que já
 * existe, por exemplo), ela fica aberta com o que foi escolhido.
 */
export function NovoProjeto({ aoCriar, aoFechar }: {
  aoCriar: (modelo: ModeloProjeto, linguagem: LinguagemProjeto, nome: string) => Promise<boolean>
  aoFechar: () => void
}) {
  const [modelo, setModelo] = useState<ModeloProjeto>('expo')
  const [linguagem, setLinguagem] = useState<LinguagemProjeto>('ts')
  const [nome, setNome] = useState('')
  const [enviando, setEnviando] = useState(false)
  const valido = NOME_VALIDO.test(nome)

  useEffect(() => {
    const k = (e: KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [aoFechar])

  const criar = async (): Promise<void> => {
    if (!valido || enviando) return
    setEnviando(true)
    try {
      if (await aoCriar(modelo, linguagem, nome)) aoFechar()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div
        className="novo-projeto"
        role="dialog"
        aria-label="Novo projeto"
        onClick={e => e.stopPropagation()}
      >
        <div className="novo-projeto-topo">
          <strong>Novo projeto</strong>
          <button className="btn-icone" title="Fechar" onClick={aoFechar}>×</button>
        </div>

        <span className="form-rotulo">Tipo de aplicação</span>
        <div className="novo-projeto-modelos">
          {MODELOS.map(m => (
            <button
              key={m.id}
              type="button"
              className="novo-projeto-modelo"
              aria-pressed={modelo === m.id}
              onClick={() => setModelo(m.id)}
            >
              <strong>{m.nome}</strong>
              <span>{m.descricao}</span>
            </button>
          ))}
        </div>

        <span className="form-rotulo">Linguagem</span>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={linguagem === 'ts'}
            onClick={() => setLinguagem('ts')}>
            TypeScript (.tsx)
          </button>
          <button type="button" className="chip" aria-pressed={linguagem === 'js'}
            onClick={() => setLinguagem('js')}>
            JavaScript (.jsx)
          </button>
        </div>

        <label className="novo-projeto-campo">
          <span className="form-rotulo">Nome do projeto</span>
          <input
            autoFocus
            value={nome}
            placeholder="meu-app"
            onChange={e => setNome(normalizarNome(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') void criar() }}
          />
        </label>
        <p className="form-dica">
          Vai para <code>Área de Trabalho\projetos\{nome || 'meu-app'}</code>. A pasta
          projetos é criada se ainda não existir, e a instalação aparece no terminal.
        </p>
        <pre className="novo-projeto-comando">{comandoDe(modelo, linguagem, nome || 'meu-app')}</pre>

        <div className="novo-projeto-rodape">
          <button className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button className="btn" disabled={!valido || enviando} onClick={() => void criar()}>
            {enviando ? 'Começando…' : 'Criar e instalar'}
          </button>
        </div>
      </div>
    </div>
  )
}
