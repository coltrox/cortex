export type Tipo = 'nota' | 'projeto' | 'diario' | 'treino' | 'exercicio'
                 | 'consulta' | 'materia' | 'prova' | 'questao' | 'objetivo'
                 | 'habito' | 'pessoa' | 'viagem'

// Protocolo do autor: toda nota carrega esta seção, independente do tipo.
// Exportada porque `src/main/nuvem/executar.ts` também monta notas novas e
// precisa do mesmo rodapé — sem isto o texto ficava duplicado à mão nos dois
// lugares, e um dia divergiria.
export const DEPENDENCIAS = '### 🕸️ Dependências da Rede\n-'

/**
 * Devolve o markdown (frontmatter + corpo) de uma nota nova para `tipo`,
 * com `date` sempre igual a `hoje` (ISO `YYYY-MM-DD`).
 */
export function template(tipo: Tipo, hoje: string): string {
  switch (tipo) {
    case 'nota':
      return `---
tipo: nota
date: ${hoje}
---

${DEPENDENCIAS}
`
    case 'projeto':
      return `---
tipo: projeto
date: ${hoje}
project:
status: ativo
---

${DEPENDENCIAS}

## Objetivo

## Tarefas
- [ ]
`
    case 'diario':
      return `---
tipo: diario
date: ${hoje}
peso:
refeicoes:
  - { hora: , item: , cal: }
gastos:
  - { hora: , item: , valor: , cat: }
---

${DEPENDENCIAS}

## Como foi o dia
`
    case 'treino':
      return `---
tipo: treino
date: ${hoje}
grupo:
exercicios:
  - { nome: , series: , reps: , carga: }
---

${DEPENDENCIAS}

## Como foi
`
    case 'exercicio':
      return `---
tipo: exercicio
date: ${hoje}
nome:
series:
reps:
carga:
---

${DEPENDENCIAS}
`
    case 'consulta':
      return `---
tipo: consulta
date: ${hoje}
especialidade:
profissional:
local:
---

${DEPENDENCIAS}

## Resumo
`
    case 'materia':
      return `---
tipo: materia
date: ${hoje}
disciplina:
---

${DEPENDENCIAS}

## Conteúdo
`
    case 'prova':
      return `---
tipo: prova
date: ${hoje}
disciplina:
nota:
---

${DEPENDENCIAS}

## Revisão
`
    case 'questao':
      return `---
tipo: questao
date: ${hoje}
disciplina:
acertou:
---

${DEPENDENCIAS}

## Enunciado

## Resolução
`
    case 'objetivo':
      return `---
tipo: objetivo
date: ${hoje}
prazo:
status: em andamento
---

${DEPENDENCIAS}

## Descrição
`
    case 'habito':
      return `---
tipo: habito
date: ${hoje}
frequencia:
---

${DEPENDENCIAS}
`
    case 'pessoa':
      return `---
tipo: pessoa
date: ${hoje}
relacao:
---

${DEPENDENCIAS}
`
    case 'viagem':
      return `---
tipo: viagem
date: ${hoje}
destino:
inicio:
fim:
---

${DEPENDENCIAS}

## Roteiro
`
    default: {
      // Guarda de exaustividade: novo Tipo sem template quebra o build, não o runtime.
      const exaustivo: never = tipo
      throw new Error(`tipo sem template: ${exaustivo}`)
    }
  }
}

/** Pasta padrão do vault onde uma nota deste tipo deve ser criada. */
export function pastaSugerida(tipo: Tipo): string {
  switch (tipo) {
    case 'diario': return 'Diario'
    case 'treino':
    case 'exercicio':
    case 'consulta': return 'Saude'
    case 'materia':
    case 'prova':
    case 'questao': return 'Estudos'
    case 'objetivo':
    case 'habito':
    case 'pessoa': return 'Vida'
    case 'viagem': return 'Viagens'
    case 'projeto': return 'Projetos'
    case 'nota': return 'Notas'
    default: {
      const exaustivo: never = tipo
      throw new Error(`tipo sem pasta: ${exaustivo}`)
    }
  }
}

/** Remove separadores de caminho e ":" — título vira nome de arquivo seguro. */
function sanitizarTitulo(titulo: string): string {
  return titulo.replace(/[\\/:]/g, '').trim()
}

/**
 * Nome de arquivo sugerido (sem pasta). Para `diario` e `treino` é sempre a
 * data — uma por dia. Para os demais, o título higienizado, ou o próprio
 * tipo quando não há título.
 */
export function nomeSugerido(tipo: Tipo, hoje: string, titulo?: string): string {
  if (tipo === 'diario' || tipo === 'treino') return `${hoje}.md`
  const limpo = titulo ? sanitizarTitulo(titulo) : ''
  const base = limpo.length > 0 ? limpo : tipo
  return `${base}.md`
}
