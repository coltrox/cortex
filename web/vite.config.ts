import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const daqui = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // O root do Vite e o diretorio de onde ele foi chamado, nao o do arquivo de
  // config. Sem esta linha o build procura o index.html na raiz do repositorio.
  root: daqui('.'),
  plugins: [react()],
  // `src/shared` mora fora de `web/`. O alias dá um nome estável para ele, e o
  // `fs.allow` autoriza o servidor de desenvolvimento a servir de lá — sem
  // isso o Vite recusa qualquer arquivo acima da raiz do projeto.
  resolve: { alias: { '@compartilhado': daqui('../src/shared') } },
  server: { host: true, fs: { allow: [daqui('..')] } },
  build: { outDir: daqui('../dist-web'), emptyOutDir: true }
})
