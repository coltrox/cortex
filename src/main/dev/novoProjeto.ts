import { join } from 'node:path'
import type { Etapa } from './processos'
import type { ModeloProjeto, LinguagemProjeto } from '../../shared/types'

/**
 * Criar um projeto novo pela lente Dev.
 *
 * A guarda é a mesma dos scripts do `package.json`: a tela escolhe entre
 * opções FECHADAS (modelo, linguagem) e dá um nome — e os comandos saem desta
 * tabela, montados no processo principal. Não existe caminho para a tela
 * mandar um comando.
 *
 * O nome vai como argumento de um `npx`, que no Windows passa pelo shell
 * (`npx` é um .cmd). Por isso o formato é estreito de propósito: letra
 * minúscula no começo, depois letras, números, `-` e `_`. Nada que o cmd.exe
 * leia como operador, aspas ou caminho — e é também o que o npm aceita como
 * nome de pacote.
 */

export const MODELOS_PROJETO: readonly ModeloProjeto[] = ['expo', 'vite']
export const LINGUAGENS_PROJETO: readonly LinguagemProjeto[] = ['ts', 'js']

export function nomeDeProjetoValido(nome: unknown): nome is string {
  return typeof nome === 'string' && /^[a-z][a-z0-9_-]{0,59}$/.test(nome)
}

/**
 * Os comandos que criam o projeto, na ordem.
 *
 * `base` é a pasta `projetos` da Área de Trabalho, resolvida pelo processo
 * principal — nunca vem da tela.
 */
export function etapasNovoProjeto(
  modelo: ModeloProjeto, linguagem: LinguagemProjeto, nome: string, base: string
): Etapa[] {
  if (!nomeDeProjetoValido(nome)) {
    throw new Error('nome inválido: comece com letra minúscula e use só letras, números, - e _')
  }
  const ts = linguagem === 'ts'
  // Sem terminal de verdade do outro lado, um criador que parasse para
  // perguntar alguma coisa ficaria esperando para sempre. `CI=1` é o jeito que
  // os dois criadores entendem de "não pergunte, use o padrão".
  const semPerguntas = { CI: '1' }

  if (modelo === 'expo') {
    // O create-expo-app já instala as dependências no fim.
    return [{
      comando: 'npx',
      args: ['--yes', 'create-expo-app@latest', nome, '--template', ts ? 'blank-typescript' : 'blank'],
      cwd: base,
      env: semPerguntas
    }]
  }

  return [
    {
      comando: 'npx',
      args: ['--yes', 'create-vite@latest', nome, '--template', ts ? 'react-ts' : 'react'],
      cwd: base,
      env: semPerguntas
    },
    // O create-vite só monta os arquivos; a instalação é um passo à parte.
    { comando: 'npm', args: ['install'], cwd: join(base, nome), env: semPerguntas }
  ]
}
