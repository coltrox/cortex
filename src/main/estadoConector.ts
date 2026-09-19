import { readFile } from 'node:fs/promises'

/**
 * Se o conector do Cortex já está registrado no Claude Code.
 *
 * - `conectado`: há um "cortex" apontando para ESTE Cortex.exe.
 * - `outra-instalacao`: há um "cortex", mas de outro caminho (uma instalação
 *   antiga, o app de desenvolvimento) — "Conectar" atualiza.
 * - `desconectado`: não há.
 *
 * Pedido do dono: com o conector já registrado, a tela tem que dizer
 * "Conectado" em vez de oferecer conectar de novo.
 */
export type EstadoConector = 'conectado' | 'outra-instalacao' | 'desconectado'

/** O caminho do jeito que o Windows compara: sem aspas, barra invertida, sem caixa. */
const normalizar = (p: string): string => p.trim().replace(/^"|"$/g, '').replace(/\//g, '\\').toLowerCase()

/**
 * Lê a entrada de escopo "user" do Claude Code (`mcpServers.cortex`, no topo
 * do `~/.claude.json`). Só lê: quem registra é o `claude mcp add`.
 */
export function estadoDoConector(config: unknown, execPath: string): EstadoConector {
  const servidores = (config as { mcpServers?: unknown } | null)?.mcpServers
  const s = servidores && typeof servidores === 'object' ? (servidores as Record<string, unknown>).cortex : undefined
  if (!s || typeof s !== 'object') return 'desconectado'
  const comando = (s as { command?: unknown }).command
  if (typeof comando !== 'string' || !comando) return 'desconectado'
  return normalizar(comando) === normalizar(execPath) ? 'conectado' : 'outra-instalacao'
}

/** O mesmo, lendo o arquivo. Sem arquivo, ou ilegível, é "desconectado" — nunca um erro na tela. */
export async function lerEstadoDoConector(arquivo: string, execPath: string): Promise<EstadoConector> {
  try {
    return estadoDoConector(JSON.parse(await readFile(arquivo, 'utf8')), execPath)
  } catch {
    return 'desconectado'
  }
}
