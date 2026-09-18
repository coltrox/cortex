import { describe, it, expect } from 'vitest'
import { projetoDoFoco } from './projetoAtual'

const arq = (nome: string) => ({ nome, pasta: false })
const pasta = (nome: string) => ({ nome, pasta: true })

describe('projeto de onde os scripts rodam', () => {
  // A pasta autorizada "projetos", com um projeto Node e um Python dentro.
  const projetos = {
    '': [pasta('cco-landing'), pasta('robo')],
    'cco-landing': [pasta('public'), pasta('src'), arq('package.json')],
    'cco-landing/src': [pasta('lib'), arq('main.tsx')],
    'cco-landing/src/lib': [arq('util.ts')],
    robo: [arq('main.py')]
  }

  it('sobe do arquivo aberto até o package.json mais perto', () => {
    expect(projetoDoFoco({ rel: 'cco-landing/src/lib/util.ts', pasta: false }, projetos)).toBe('cco-landing')
    expect(projetoDoFoco({ rel: 'cco-landing/src', pasta: true }, projetos)).toBe('cco-landing')
    expect(projetoDoFoco({ rel: 'cco-landing', pasta: true }, projetos)).toBe('cco-landing')
  })

  it('sem package.json, fica na pasta de primeiro nível (o projeto dentro de projetos)', () => {
    expect(projetoDoFoco({ rel: 'robo/main.py', pasta: false }, projetos)).toBe('robo')
  })

  it('sem nada escolhido, é a raiz', () => {
    expect(projetoDoFoco(null, projetos)).toBe('')
  })

  it('a raiz que já é um projeto fica na raiz, mesmo dentro de uma subpasta', () => {
    const cortex = {
      '': [pasta('src'), pasta('web'), arq('package.json')],
      src: [pasta('main')],
      'src/main': [arq('index.ts')],
      web: [arq('package.json'), pasta('src')],
      'web/src': [arq('App.tsx')]
    }
    expect(projetoDoFoco({ rel: 'src/main/index.ts', pasta: false }, cortex)).toBe('')
    // Um projeto dentro do projeto (o app web) roda os scripts dele.
    expect(projetoDoFoco({ rel: 'web/src/App.tsx', pasta: false }, cortex)).toBe('web')
  })

  it('pasta ainda não lida não trava: cai na de primeiro nível', () => {
    expect(projetoDoFoco({ rel: 'outro', pasta: true }, projetos)).toBe('outro')
  })
})
