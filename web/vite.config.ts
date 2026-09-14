import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const daqui = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/*
 * O número desta publicação do app web.
 *
 * Vai em dois lugares que precisam concordar: dentro do pacote, como
 * `__VERSAO_WEB__`, e fora dele, em `/versao.json`. O app aberto compara os
 * dois para descobrir que saiu versão nova — ver `src/versao.ts`. No Vercel é
 * o commit publicado; fora dele, a hora do build, que também muda a cada
 * publicação.
 */
const VERSAO = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || Date.now().toString(36)

/** Grava `/versao.json` junto do build, com o mesmo número que vai no pacote. */
function versaoPublicada(): Plugin {
  return {
    name: 'cortex-versao',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'versao.json', source: JSON.stringify({ versao: VERSAO }) })
    }
  }
}

export default defineConfig({
  // O root do Vite e o diretorio de onde ele foi chamado, nao o do arquivo de
  // config. Sem esta linha o build procura o index.html na raiz do repositorio.
  root: daqui('.'),
  plugins: [react(), versaoPublicada()],
  define: { __VERSAO_WEB__: JSON.stringify(VERSAO) },
  // `src/shared` mora fora de `web/`. O alias dá um nome estável para ele, e o
  // `fs.allow` autoriza o servidor de desenvolvimento a servir de lá — sem
  // isso o Vite recusa qualquer arquivo acima da raiz do projeto.
  resolve: { alias: { '@compartilhado': daqui('../src/shared') } },
  server: { host: true, fs: { allow: [daqui('..')] } },
  build: { outDir: daqui('../dist-web'), emptyOutDir: true }
})
