import { describe, it, expect } from 'vitest'
import { projetoDoFoco, lerEstadoDev, processoEhDoProjeto } from './projetoAtual'

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

describe('onde a pessoa estava no Dev (guardado nas preferências)', () => {
  it('lê o que foi guardado', () => {
    const e = { raiz: 'C:/p', base: 'app', abertas: ['app/src'], arquivo: 'app/src/App.tsx' }
    expect(lerEstadoDev(JSON.stringify(e))).toEqual({ ...e, abertos: [] })
    expect(lerEstadoDev(JSON.stringify({ ...e, arquivo: null }))?.arquivo).toBeNull()
  })

  it('desconfia do arquivo: formato estranho ou quebrado não restaura nada', () => {
    expect(lerEstadoDev(undefined)).toBeNull()
    expect(lerEstadoDev('{ quebrado')).toBeNull()
    expect(lerEstadoDev(JSON.stringify({ base: 'x' }))).toBeNull()
    expect(lerEstadoDev(JSON.stringify({ raiz: 'C:/p', base: 1, abertas: 'x', arquivo: 2 })))
      .toEqual({ raiz: 'C:/p', base: '', abertas: [], arquivo: null, abertos: [] })
    expect(lerEstadoDev(JSON.stringify({ raiz: 'C:/p', abertas: ['a', 3, 'b'] }))?.abertas).toEqual(['a', 'b'])
  })
})

describe('abas de projetos abertos', () => {
  it('guarda e lê as abas abertas, descartando as estranhas', () => {
    const e = { raiz: 'C:/p', base: 'a', abertas: [], arquivo: null, abertos: [{ raiz: 'C:/p', base: 'a' }, { raiz: 'C:/p', base: 'b' }] }
    expect(lerEstadoDev(JSON.stringify(e))?.abertos).toEqual(e.abertos)
    expect(lerEstadoDev(JSON.stringify({ raiz: 'C:/p', abertos: [{ raiz: 'C:/p' }, 3, { raiz: 'C:/p', base: 'ok' }] }))?.abertos)
      .toEqual([{ raiz: 'C:/p', base: 'ok' }])
    expect(lerEstadoDev(JSON.stringify({ raiz: 'C:/p' }))?.abertos).toEqual([])
  })

  it('o processo é do projeto quando roda na pasta dele (ou dentro dela)', () => {
    // Montado com join('\\') para as barras invertidas do Windows sobreviverem.
    const win = (...p: string[]): string => p.join('\\')
    const raiz = win('C:', 'Users', 'x', 'AppData', 'Roaming', 'Cortex', 'projetos')
    expect(processoEhDoProjeto(win(raiz, 'cco-landing'), raiz, 'cco-landing')).toBe(true)
    expect(processoEhDoProjeto(win(raiz, 'CCO-LANDING', 'web'), raiz, 'cco-landing')).toBe(true)
    expect(processoEhDoProjeto(raiz.split('\\').join('/') + '/cco-landing', raiz, 'cco-landing')).toBe(true)
    // Um projeto com nome que começa igual não é o mesmo.
    expect(processoEhDoProjeto(win(raiz, 'cco-landing-2'), raiz, 'cco-landing')).toBe(false)
    // Criar projeto roda na pasta de fora: não é de nenhuma aba.
    expect(processoEhDoProjeto(raiz, raiz, 'cco-landing')).toBe(false)
  })
})
