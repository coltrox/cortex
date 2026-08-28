import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // O app web importa `@compartilhado/eventos`; o vitest precisa do mesmo
  // apelido que o Vite do `web/` usa, senão os testes de `web/src` não
  // resolvem o contrato compartilhado.
  resolve: {
    alias: { '@compartilhado': fileURLToPath(new URL('./src/shared', import.meta.url)) }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'web/src/**/*.test.ts']
  }
})
