# Cortex — Fundação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o núcleo do Cortex sem interface — parser de markdown, camada de vault com escrita atômica, índice SQLite e superfície IPC — terminando num app Electron que abre um vault real, indexa, busca e salva uma nota.

**Architecture:** Processo main (Node) é o único dono do disco e do banco; renderer só desenha e conversa por IPC validado com zod. `parser` e `index` são bibliotecas puras, testadas sem Electron e sem UI. O SQLite é derivado e descartável: apagar `index.db` reconstrói tudo a partir dos `.md`.

**Tech Stack:** Electron, electron-vite, React, TypeScript, better-sqlite3, gray-matter, chokidar, zod, vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-vault-pessoal-design.md`

## Global Constraints

- **Os arquivos são a verdade. O banco é descartável.** Nenhum dado pode existir apenas no SQLite. Toda tabela é reconstruível a partir dos `.md`.
- **O renderer nunca acessa `fs` nem o SQLite.** Todo acesso passa por IPC até o main. Sem exceção.
- **Segurança da janela:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Sem `@electron/remote`.
- **Path traversal:** todo caminho vindo do renderer é resolvido e verificado como descendente da raiz do vault **antes** de qualquer leitura ou escrita.
- **Todo payload de IPC é validado com zod** antes de ser usado. A fronteira renderer→main é tratada como entrada hostil.
- **Caminhos relativos são sempre POSIX** (`/` como separador), inclusive no Windows. A conversão para caminho de sistema acontece só dentro da camada `vault`.
- **Escrita é sempre atômica:** grava em arquivo temporário e faz `rename`. Um `.md` nunca pode ficar parcial.
- **Datas em ISO `YYYY-MM-DD`.**
- **O app nunca reescreve frontmatter digitado pelo autor.** Só `created` (na criação) e `updated` (em salvamento feito pelo app).
- **Vault de desenvolvimento:** usar uma cópia de `C:\Users\PH\obsidian`, nunca o vault real, até o Task 11 passar.
- **Nenhuma chamada de rede, nenhuma telemetria.**

---

### Task 1: Scaffold do projeto

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`
- Create: `src/shared/types.ts`
- Test: `src/shared/types.test.ts`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: projeto que roda com `npm run dev` e testa com `npm test`; tipos `WikiLink`, `TaskItem`, `ParsedNote`, `NoteRow` importáveis de `src/shared/types.ts`

- [ ] **Step 1: Criar o projeto e instalar dependências**

```bash
cd C:/Users/PH/Desktop/Cortex
npm init -y
npm i react react-dom better-sqlite3 gray-matter chokidar zod
npm i -D electron electron-vite electron-builder @vitejs/plugin-react vitest typescript @types/react @types/react-dom @types/better-sqlite3 @types/node
```

`better-sqlite3` é módulo nativo: precisa ser rebuildado para a versão do Electron. Ajustar `package.json`:

```json
{
  "name": "cortex",
  "productName": "Cortex",
  "version": "0.1.0",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "postinstall": "electron-builder install-app-deps"
  }
}
```

Rodar `npm run postinstall` uma vez após instalar.

- [ ] **Step 2: Configurar electron-vite, TypeScript e vitest**

`electron.vite.config.ts` — `better-sqlite3` precisa ficar fora do bundle do main:

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react()] }
})
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] }
})
```

- [ ] **Step 3: Escrever os tipos compartilhados**

`src/shared/types.ts`:

```ts
export interface WikiLink {
  target: string
  alias?: string
  anchor?: string
  line: number
}

export interface TaskItem {
  text: string
  done: boolean
  line: number
  due?: string
}

export interface ParsedNote {
  frontmatter: Record<string, unknown>
  body: string
  parseError: string | null
  links: WikiLink[]
  tasks: TaskItem[]
}

export interface NoteRow {
  path: string
  title: string
  tipo: string
  project: string | null
  status: string | null
  created: string | null
  updated: string | null
  date: string | null
  mtime: number
  size: number
  parseError: string | null
}
```

- [ ] **Step 4: Escrever um teste de fumaça e rodar**

`src/shared/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { ParsedNote } from './types'

describe('tipos compartilhados', () => {
  it('aceita uma nota parseada mínima', () => {
    const nota: ParsedNote = {
      frontmatter: { tipo: 'nota' },
      body: 'oi',
      parseError: null,
      links: [],
      tasks: []
    }
    expect(nota.frontmatter.tipo).toBe('nota')
  })
})
```

Run: `npm test`
Expected: PASS, 1 teste.

- [ ] **Step 5: Janela em branco que abre**

`src/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Cortex',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

`src/preload/index.ts`:

```ts
// preenchido no Task 10
export {}
```

`src/renderer/index.html`:

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Cortex</title></head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

`src/renderer/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
```

`src/renderer/App.tsx`:

```tsx
export function App() {
  return <div style={{ fontFamily: 'system-ui', padding: 24 }}>Cortex</div>
}
```

Run: `npm run dev`
Expected: janela abre mostrando "Cortex".

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite + react + typescript + vitest"
```

---

### Task 2: Parser de frontmatter

**Files:**
- Create: `src/main/parser/frontmatter.ts`
- Test: `src/main/parser/frontmatter.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string; parseError: string | null }`

- [ ] **Step 1: Escrever os testes que falham**

`src/main/parser/frontmatter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from './frontmatter'

describe('parseFrontmatter', () => {
  it('extrai frontmatter válido e devolve o corpo', () => {
    const raw = `---
tipo: projeto
tags: [tech, seguranca]
created: 2026-08-02
---

# Nima

Conteúdo.`
    const r = parseFrontmatter(raw)
    expect(r.parseError).toBeNull()
    expect(r.frontmatter.tipo).toBe('projeto')
    expect(r.frontmatter.tags).toEqual(['tech', 'seguranca'])
    expect(r.body.trim().startsWith('# Nima')).toBe(true)
  })

  it('trata nota sem frontmatter', () => {
    const r = parseFrontmatter('só texto')
    expect(r.parseError).toBeNull()
    expect(r.frontmatter).toEqual({})
    expect(r.body).toBe('só texto')
  })

  it('não quebra com YAML inválido: devolve parseError e corpo cru', () => {
    const raw = `---
tipo: [nao, fechado
---
corpo`
    const r = parseFrontmatter(raw)
    expect(r.parseError).not.toBeNull()
    expect(r.frontmatter).toEqual({})
    expect(r.body).toContain('corpo')
  })

  it('normaliza datas para string ISO, não Date', () => {
    const raw = `---
created: 2026-08-02
---
x`
    const r = parseFrontmatter(raw)
    expect(r.frontmatter.created).toBe('2026-08-02')
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/main/parser/frontmatter.test.ts`
Expected: FAIL — "Failed to resolve import './frontmatter'".

- [ ] **Step 3: Implementar**

`src/main/parser/frontmatter.ts`:

```ts
import matter from 'gray-matter'

function isoDates(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) return value.map(isoDates)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, isoDates(v)])
    )
  }
  return value
}

export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>
  body: string
  parseError: string | null
} {
  try {
    const parsed = matter(raw)
    return {
      frontmatter: isoDates(parsed.data) as Record<string, unknown>,
      body: parsed.content,
      parseError: null
    }
  } catch (err) {
    // YAML inválido não pode derrubar a indexação: devolve o texto cru.
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    return { frontmatter: {}, body, parseError: (err as Error).message }
  }
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/main/parser/frontmatter.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/main/parser/frontmatter.ts src/main/parser/frontmatter.test.ts
git commit -m "feat(parser): parse de frontmatter tolerante a YAML inválido"
```

---

### Task 3: Parser de wikilinks e tarefas

**Files:**
- Create: `src/main/parser/wikilinks.ts`, `src/main/parser/tasks.ts`, `src/main/parser/index.ts`
- Test: `src/main/parser/wikilinks.test.ts`, `src/main/parser/tasks.test.ts`, `src/main/parser/index.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter` (Task 2); tipos `WikiLink`, `TaskItem`, `ParsedNote` (Task 1)
- Produces:
  - `extractWikiLinks(body: string): WikiLink[]`
  - `extractTasks(body: string): TaskItem[]`
  - `parseNote(raw: string): ParsedNote`

- [ ] **Step 1: Escrever os testes de wikilinks que falham**

`src/main/parser/wikilinks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractWikiLinks } from './wikilinks'

describe('extractWikiLinks', () => {
  it('extrai link simples com número da linha', () => {
    const links = extractWikiLinks('primeira\nver [[MOC - Segurança]]')
    expect(links).toEqual([{ target: 'MOC - Segurança', line: 2 }])
  })

  it('extrai alias e âncora', () => {
    const links = extractWikiLinks('[[Nima|o projeto]] e [[REQ - Validação#XSS]]')
    expect(links[0]).toEqual({ target: 'Nima', alias: 'o projeto', line: 1 })
    expect(links[1]).toEqual({ target: 'REQ - Validação', anchor: 'XSS', line: 1 })
  })

  it('ignora links dentro de bloco de código cercado', () => {
    const body = 'antes\n```js\nconst x = "[[nao-e-link]]"\n```\ndepois [[real]]'
    const links = extractWikiLinks(body)
    expect(links.map(l => l.target)).toEqual(['real'])
  })

  it('ignora links dentro de código inline', () => {
    expect(extractWikiLinks('use `[[assim]]` no texto')).toEqual([])
  })

  it('devolve lista vazia quando não há links', () => {
    expect(extractWikiLinks('texto puro')).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/main/parser/wikilinks.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar wikilinks**

`src/main/parser/wikilinks.ts`:

```ts
import type { WikiLink } from '../../shared/types'

const LINK = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

/** Substitui trechos de código por espaços, preservando posições e quebras de linha. */
function blankOutCode(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, m => ' '.repeat(m.length))
}

export function extractWikiLinks(body: string): WikiLink[] {
  const out: WikiLink[] = []
  const lines = blankOutCode(body).split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(LINK)) {
      const link: WikiLink = { target: m[1].trim(), line: i + 1 }
      if (m[2]) link.anchor = m[2].trim()
      if (m[3]) link.alias = m[3].trim()
      out.push(link)
    }
  })
  return out
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/main/parser/wikilinks.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Escrever os testes de tarefas que falham**

`src/main/parser/tasks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractTasks } from './tasks'

describe('extractTasks', () => {
  it('extrai tarefa aberta e concluída', () => {
    const tasks = extractTasks('- [ ] rate limiting\n- [x] segredos em .env')
    expect(tasks).toEqual([
      { text: 'rate limiting', done: false, line: 1 },
      { text: 'segredos em .env', done: true, line: 2 }
    ])
  })

  it('aceita indentação e marcador com asterisco', () => {
    const tasks = extractTasks('  * [ ] aninhada')
    expect(tasks).toEqual([{ text: 'aninhada', done: false, line: 1 }])
  })

  it('extrai data de vencimento no formato 📅 YYYY-MM-DD', () => {
    const tasks = extractTasks('- [ ] testar RLS 📅 2026-09-02')
    expect(tasks[0].due).toBe('2026-09-02')
    expect(tasks[0].text).toBe('testar RLS')
  })

  it('ignora item de lista que não é tarefa', () => {
    expect(extractTasks('- só um item')).toEqual([])
  })
})
```

- [ ] **Step 6: Rodar para ver falhar, implementar, rodar até passar**

Run: `npx vitest run src/main/parser/tasks.test.ts` → FAIL (módulo não encontrado).

`src/main/parser/tasks.ts`:

```ts
import type { TaskItem } from '../../shared/types'

const TASK = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/
const DUE = /📅\s*(\d{4}-\d{2}-\d{2})/

export function extractTasks(body: string): TaskItem[] {
  const out: TaskItem[] = []
  body.split('\n').forEach((line, i) => {
    const m = line.match(TASK)
    if (!m) return
    let text = m[2].trim()
    const due = text.match(DUE)?.[1]
    if (due) text = text.replace(DUE, '').trim()
    const task: TaskItem = { text, done: m[1].toLowerCase() === 'x', line: i + 1 }
    if (due) task.due = due
    out.push(task)
  })
  return out
}
```

Run: `npx vitest run src/main/parser/tasks.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 7: Compor `parseNote` com teste**

`src/main/parser/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseNote } from './index'

describe('parseNote', () => {
  it('junta frontmatter, links e tarefas', () => {
    const raw = `---
tipo: projeto
project: Nima
---

Ver [[MOC - Segurança]].

- [ ] rate limiting`
    const n = parseNote(raw)
    expect(n.parseError).toBeNull()
    expect(n.frontmatter.tipo).toBe('projeto')
    expect(n.links.map(l => l.target)).toEqual(['MOC - Segurança'])
    expect(n.tasks[0].text).toBe('rate limiting')
  })

  it('com YAML inválido ainda extrai links do corpo', () => {
    const raw = `---
tipo: [quebrado
---
[[Nima]]`
    const n = parseNote(raw)
    expect(n.parseError).not.toBeNull()
    expect(n.links.map(l => l.target)).toEqual(['Nima'])
  })
})
```

`src/main/parser/index.ts`:

```ts
import type { ParsedNote } from '../../shared/types'
import { parseFrontmatter } from './frontmatter'
import { extractWikiLinks } from './wikilinks'
import { extractTasks } from './tasks'

export { parseFrontmatter, extractWikiLinks, extractTasks }

export function parseNote(raw: string): ParsedNote {
  const { frontmatter, body, parseError } = parseFrontmatter(raw)
  return {
    frontmatter,
    body,
    parseError,
    links: extractWikiLinks(body),
    tasks: extractTasks(body)
  }
}
```

Run: `npm test`
Expected: PASS, todos os testes do parser.

- [ ] **Step 8: Commit**

```bash
git add src/main/parser
git commit -m "feat(parser): wikilinks com alias/âncora, tarefas com vencimento, parseNote"
```

---

### Task 4: Camada de vault com escrita atômica

**Files:**
- Create: `src/main/vault/vault.ts`
- Test: `src/main/vault/vault.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: classe `Vault` com
  - `constructor(root: string)` e campo `readonly root: string`
  - `toAbsolute(rel: string): string` — lança `Error('caminho fora do vault')` em traversal
  - `listMarkdown(): Promise<string[]>` — caminhos relativos POSIX, ignora `.vault/` e pastas ocultas
  - `read(rel: string): Promise<string>`
  - `writeAtomic(rel: string, content: string): Promise<void>`
  - `stat(rel: string): Promise<{ mtimeMs: number; size: number }>`
  - `exists(rel: string): Promise<boolean>`

- [ ] **Step 1: Escrever os testes que falham**

`src/main/vault/vault.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from './vault'

let root: string
let vault: Vault

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('Vault', () => {
  it('lista .md em caminho relativo POSIX, recursivamente', async () => {
    await mkdir(join(root, 'Projetos'), { recursive: true })
    await writeFile(join(root, 'Projetos', 'Nima.md'), '# Nima')
    await writeFile(join(root, 'raiz.md'), 'x')
    const files = await vault.listMarkdown()
    expect(files.sort()).toEqual(['Projetos/Nima.md', 'raiz.md'])
  })

  it('ignora .vault/ e arquivos que não são .md', async () => {
    await mkdir(join(root, '.vault'), { recursive: true })
    await writeFile(join(root, '.vault', 'nota.md'), 'x')
    await writeFile(join(root, 'imagem.png'), 'x')
    expect(await vault.listMarkdown()).toEqual([])
  })

  it('lê e escreve preservando o conteúdo', async () => {
    await vault.writeAtomic('a.md', 'conteúdo com acento')
    expect(await vault.read('a.md')).toBe('conteúdo com acento')
  })

  it('cria diretórios intermediários ao escrever', async () => {
    await vault.writeAtomic('Saúde/Treinos/2026-08-24.md', 'treino')
    expect(await readFile(join(root, 'Saúde', 'Treinos', '2026-08-24.md'), 'utf8')).toBe('treino')
  })

  it('não deixa arquivo temporário para trás', async () => {
    await vault.writeAtomic('a.md', 'x')
    expect(await vault.listMarkdown()).toEqual(['a.md'])
  })

  it('recusa path traversal com ..', () => {
    expect(() => vault.toAbsolute('../fora.md')).toThrow('caminho fora do vault')
    expect(() => vault.toAbsolute('Projetos/../../fora.md')).toThrow('caminho fora do vault')
  })

  it('recusa caminho absoluto', () => {
    expect(() => vault.toAbsolute('C:/Windows/system32/x.md')).toThrow('caminho fora do vault')
  })

  it('devolve mtime e size', async () => {
    await vault.writeAtomic('a.md', 'abc')
    const s = await vault.stat('a.md')
    expect(s.size).toBe(3)
    expect(s.mtimeMs).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/main/vault/vault.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/main/vault/vault.ts`:

```ts
import { readFile, writeFile, rename, mkdir, stat, readdir } from 'node:fs/promises'
import { join, resolve, relative, dirname, sep, isAbsolute } from 'node:path'

export class Vault {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  toAbsolute(rel: string): string {
    if (isAbsolute(rel)) throw new Error('caminho fora do vault')
    const abs = resolve(this.root, rel)
    const rel2 = relative(this.root, abs)
    if (rel2.startsWith('..') || isAbsolute(rel2)) throw new Error('caminho fora do vault')
    return abs
  }

  private toPosix(p: string): string {
    return p.split(sep).join('/')
  }

  async listMarkdown(): Promise<string[]> {
    const out: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const abs = join(dir, entry.name)
        if (entry.isDirectory()) await walk(abs)
        else if (entry.name.toLowerCase().endsWith('.md')) {
          out.push(this.toPosix(relative(this.root, abs)))
        }
      }
    }
    await walk(this.root)
    return out
  }

  async read(rel: string): Promise<string> {
    return readFile(this.toAbsolute(rel), 'utf8')
  }

  /** Grava em .tmp e renomeia: o .md nunca fica parcial. */
  async writeAtomic(rel: string, content: string): Promise<void> {
    const abs = this.toAbsolute(rel)
    await mkdir(dirname(abs), { recursive: true })
    const tmp = `${abs}.${process.pid}.tmp`
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, abs)
  }

  async stat(rel: string): Promise<{ mtimeMs: number; size: number }> {
    const s = await stat(this.toAbsolute(rel))
    return { mtimeMs: s.mtimeMs, size: s.size }
  }

  async exists(rel: string): Promise<boolean> {
    try { await stat(this.toAbsolute(rel)); return true } catch { return false }
  }
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/main/vault/vault.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/main/vault
git commit -m "feat(vault): leitura, escrita atômica e guarda de path traversal"
```

---

### Task 5: Schema do índice SQLite

**Files:**
- Create: `src/main/index/schema.ts`, `src/main/index/db.ts`
- Test: `src/main/index/db.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `openIndex(dbPath: string): Db`, `SCHEMA_VERSION: number`, tipo `Db`; tabelas `notes`, `note_tags`, `links`, `tasks`, `fields`, `notes_fts`, `checklist_state`, `meta`

- [ ] **Step 1: Escrever os testes que falham**

`src/main/index/db.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { openIndex, SCHEMA_VERSION } from './db'

describe('openIndex', () => {
  it('cria todas as tabelas em banco em memória', () => {
    const db = openIndex(':memory:')
    const names = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all().map((r: any) => r.name)
    for (const t of ['notes', 'note_tags', 'links', 'tasks', 'fields', 'checklist_state', 'meta']) {
      expect(names).toContain(t)
    }
  })

  it('grava a versão do schema', () => {
    const db = openIndex(':memory:')
    const row = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as any
    expect(Number(row.value)).toBe(SCHEMA_VERSION)
  })

  it('é idempotente: abrir duas vezes não quebra', () => {
    const db = openIndex(':memory:')
    expect(() => openIndex(':memory:')).not.toThrow()
    expect(db.prepare('SELECT count(*) c FROM notes').get()).toEqual({ c: 0 })
  })

  it('busca full-text funciona pela tabela FTS', () => {
    const db = openIndex(':memory:')
    db.prepare('INSERT INTO notes (path,title,tipo,mtime,size) VALUES (?,?,?,?,?)')
      .run('a.md', 'Nima', 'projeto', 1, 1)
    db.prepare('INSERT INTO notes_fts (path,title,body) VALUES (?,?,?)')
      .run('a.md', 'Nima', 'rate limiting no login')
    const hits = db.prepare("SELECT path FROM notes_fts WHERE notes_fts MATCH 'limiting'").all()
    expect(hits).toEqual([{ path: 'a.md' }])
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/main/index/db.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar schema e abertura**

`src/main/index/schema.ts`:

```ts
export const SCHEMA_VERSION = 1

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nota',
  project TEXT,
  status TEXT,
  created TEXT,
  updated TEXT,
  date TEXT,
  mtime REAL NOT NULL,
  size INTEGER NOT NULL,
  body_hash TEXT,
  parse_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_notes_tipo ON notes(tipo);
CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project);
CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(date);

CREATE TABLE IF NOT EXISTS note_tags (
  path TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (path, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON note_tags(tag);

CREATE TABLE IF NOT EXISTS links (
  src TEXT NOT NULL,
  dst TEXT NOT NULL,
  resolved_path TEXT,
  line INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_src ON links(src);
CREATE INDEX IF NOT EXISTS idx_links_resolved ON links(resolved_path);

CREATE TABLE IF NOT EXISTS tasks (
  path TEXT NOT NULL,
  line INTEGER NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL,
  due TEXT,
  PRIMARY KEY (path, line)
);

CREATE TABLE IF NOT EXISTS fields (
  path TEXT NOT NULL,
  key TEXT NOT NULL,
  value_text TEXT,
  value_num REAL,
  value_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_fields_key ON fields(key);
CREATE INDEX IF NOT EXISTS idx_fields_path ON fields(path);

CREATE TABLE IF NOT EXISTS checklist_state (
  project TEXT NOT NULL,
  item_id TEXT NOT NULL,
  done INTEGER NOT NULL,
  updated TEXT NOT NULL,
  PRIMARY KEY (project, item_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(path, title, body);
`
```

`src/main/index/db.ts`:

```ts
import Database from 'better-sqlite3'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema'

export { SCHEMA_VERSION }
export type Db = Database.Database

export function openIndex(dbPath: string): Db {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  db.prepare("INSERT INTO meta (key,value) VALUES ('schema_version',?) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(SCHEMA_VERSION))
  return db
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/main/index/db.test.ts`
Expected: PASS, 4 testes.

Se `better-sqlite3` falhar com erro de versão de módulo nativo (`NODE_MODULE_VERSION`), rodar `npm run postinstall` e repetir. O vitest roda em Node, o Electron roda na própria ABI — `electron-builder install-app-deps` resolve as duas.

- [ ] **Step 5: Commit**

```bash
git add src/main/index/schema.ts src/main/index/db.ts src/main/index/db.test.ts
git commit -m "feat(index): schema sqlite com fts5, links, fields e checklist"
```

---

### Task 6: Indexador incremental

**Files:**
- Create: `src/main/index/indexer.ts`
- Test: `src/main/index/indexer.test.ts`

**Interfaces:**
- Consumes: `Vault` (Task 4), `parseNote` (Task 3), `openIndex`/`Db` (Task 5)
- Produces: classe `Indexer` com
  - `constructor(db: Db, vault: Vault)`
  - `indexFile(rel: string): Promise<void>`
  - `removeFile(rel: string): void`
  - `syncAll(): Promise<{ indexed: number; removed: number; skipped: number }>`

- [ ] **Step 1: Escrever os testes que falham**

`src/main/index/indexer.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from '../vault/vault'
import { openIndex, type Db } from './db'
import { Indexer } from './indexer'

let root: string, vault: Vault, db: Db, ix: Indexer

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
  db = openIndex(':memory:')
  ix = new Indexer(db, vault)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const NOTA = `---
tipo: projeto
project: Nima
tags: [tech, seguranca]
created: 2026-08-02
date: 2026-09-02
---

Ver [[MOC - Segurança]].

- [ ] rate limiting
`

describe('Indexer', () => {
  it('indexa uma nota com metadados, tags, links e tarefas', async () => {
    await vault.writeAtomic('Projetos/Nima.md', NOTA)
    await ix.indexFile('Projetos/Nima.md')

    const note = db.prepare('SELECT * FROM notes WHERE path=?').get('Projetos/Nima.md') as any
    expect(note.tipo).toBe('projeto')
    expect(note.project).toBe('Nima')
    expect(note.date).toBe('2026-09-02')
    expect(note.title).toBe('Nima')

    const tags = db.prepare('SELECT tag FROM note_tags WHERE path=? ORDER BY tag')
      .all('Projetos/Nima.md')
    expect(tags).toEqual([{ tag: 'seguranca' }, { tag: 'tech' }])

    const links = db.prepare('SELECT dst FROM links WHERE src=?').all('Projetos/Nima.md')
    expect(links).toEqual([{ dst: 'MOC - Segurança' }])

    const tasks = db.prepare('SELECT text, done FROM tasks WHERE path=?').all('Projetos/Nima.md')
    expect(tasks).toEqual([{ text: 'rate limiting', done: 0 }])
  })

  it('usa tipo "nota" quando o frontmatter não tem tipo', async () => {
    await vault.writeAtomic('a.md', 'só texto')
    await ix.indexFile('a.md')
    const note = db.prepare('SELECT tipo FROM notes WHERE path=?').get('a.md') as any
    expect(note.tipo).toBe('nota')
  })

  it('grava campos arbitrários em fields, separando número, data e texto', async () => {
    await vault.writeAtomic('t.md', `---
tipo: treino
date: 2026-08-24
peso: 78.4
grupo: peito
---
x`)
    await ix.indexFile('t.md')
    const rows = db.prepare('SELECT key,value_text,value_num,value_date FROM fields WHERE path=?')
      .all('t.md') as any[]
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]))
    expect(byKey.peso.value_num).toBe(78.4)
    expect(byKey.grupo.value_text).toBe('peito')
    expect(byKey.date.value_date).toBe('2026-08-24')
  })

  it('reindexar substitui, não duplica', async () => {
    await vault.writeAtomic('a.md', '[[X]]')
    await ix.indexFile('a.md')
    await vault.writeAtomic('a.md', '[[Y]]')
    await ix.indexFile('a.md')
    const links = db.prepare('SELECT dst FROM links WHERE src=?').all('a.md')
    expect(links).toEqual([{ dst: 'Y' }])
    const n = db.prepare('SELECT count(*) c FROM notes').get() as any
    expect(n.c).toBe(1)
  })

  it('guarda parse_error sem derrubar a indexação', async () => {
    await vault.writeAtomic('bad.md', `---
tipo: [quebrado
---
[[Nima]]`)
    await ix.indexFile('bad.md')
    const note = db.prepare('SELECT parse_error FROM notes WHERE path=?').get('bad.md') as any
    expect(note.parse_error).not.toBeNull()
    const links = db.prepare('SELECT dst FROM links WHERE src=?').all('bad.md')
    expect(links).toEqual([{ dst: 'Nima' }])
  })

  it('removeFile apaga a nota e tudo que depende dela', async () => {
    await vault.writeAtomic('a.md', '[[X]]\n- [ ] t')
    await ix.indexFile('a.md')
    ix.removeFile('a.md')
    expect(db.prepare('SELECT count(*) c FROM notes').get()).toEqual({ c: 0 })
    expect(db.prepare('SELECT count(*) c FROM links').get()).toEqual({ c: 0 })
    expect(db.prepare('SELECT count(*) c FROM tasks').get()).toEqual({ c: 0 })
  })

  it('syncAll pula arquivos não modificados', async () => {
    await vault.writeAtomic('a.md', 'x')
    const first = await ix.syncAll()
    expect(first.indexed).toBe(1)
    const second = await ix.syncAll()
    expect(second.indexed).toBe(0)
    expect(second.skipped).toBe(1)
  })

  it('syncAll remove do índice nota apagada do disco', async () => {
    await vault.writeAtomic('a.md', 'x')
    await ix.syncAll()
    await rm(join(root, 'a.md'))
    const r = await ix.syncAll()
    expect(r.removed).toBe(1)
    expect(db.prepare('SELECT count(*) c FROM notes').get()).toEqual({ c: 0 })
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/main/index/indexer.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/main/index/indexer.ts`:

```ts
import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import type { Db } from './db'
import type { Vault } from '../vault/vault'
import { parseNote } from '../parser'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

export class Indexer {
  constructor(private db: Db, private vault: Vault) {}

  private clear(rel: string): void {
    this.db.prepare('DELETE FROM notes WHERE path = ?').run(rel)
    this.db.prepare('DELETE FROM note_tags WHERE path = ?').run(rel)
    this.db.prepare('DELETE FROM links WHERE src = ?').run(rel)
    this.db.prepare('DELETE FROM tasks WHERE path = ?').run(rel)
    this.db.prepare('DELETE FROM fields WHERE path = ?').run(rel)
    this.db.prepare('DELETE FROM notes_fts WHERE path = ?').run(rel)
  }

  removeFile(rel: string): void {
    this.db.transaction(() => this.clear(rel))()
  }

  async indexFile(rel: string): Promise<void> {
    const raw = await this.vault.read(rel)
    const { mtimeMs, size } = await this.vault.stat(rel)
    const note = parseNote(raw)
    const fm = note.frontmatter

    const title = asString(fm.titulo) ?? asString(fm.title) ?? basename(rel, '.md')
    const hash = createHash('sha1').update(note.body).digest('hex')

    this.db.transaction(() => {
      this.clear(rel)

      this.db.prepare(`INSERT INTO notes
        (path,title,tipo,project,status,created,updated,date,mtime,size,body_hash,parse_error)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        rel, title,
        asString(fm.tipo) ?? 'nota',
        asString(fm.project), asString(fm.status),
        asString(fm.created), asString(fm.updated), asString(fm.date),
        mtimeMs, size, hash, note.parseError
      )

      const tags = Array.isArray(fm.tags) ? fm.tags : []
      const insTag = this.db.prepare('INSERT OR IGNORE INTO note_tags (path,tag) VALUES (?,?)')
      for (const t of tags) if (typeof t === 'string') insTag.run(rel, t)

      const insLink = this.db.prepare(
        'INSERT INTO links (src,dst,resolved_path,line) VALUES (?,?,NULL,?)')
      for (const l of note.links) insLink.run(rel, l.target, l.line)

      const insTask = this.db.prepare(
        'INSERT OR REPLACE INTO tasks (path,line,text,done,due) VALUES (?,?,?,?,?)')
      for (const t of note.tasks) insTask.run(rel, t.line, t.text, t.done ? 1 : 0, t.due ?? null)

      const insField = this.db.prepare(
        'INSERT INTO fields (path,key,value_text,value_num,value_date) VALUES (?,?,?,?,?)')
      for (const [key, value] of Object.entries(fm)) {
        if (typeof value === 'number') insField.run(rel, key, null, value, null)
        else if (typeof value === 'string' && ISO_DATE.test(value)) insField.run(rel, key, null, null, value)
        else if (typeof value === 'string') insField.run(rel, key, value, null, null)
        else insField.run(rel, key, JSON.stringify(value), null, null)
      }

      this.db.prepare('INSERT INTO notes_fts (path,title,body) VALUES (?,?,?)')
        .run(rel, title, note.body)
    })()
  }

  async syncAll(): Promise<{ indexed: number; removed: number; skipped: number }> {
    const onDisk = await this.vault.listMarkdown()
    const known = new Map(
      (this.db.prepare('SELECT path,mtime,size FROM notes').all() as any[])
        .map(r => [r.path as string, r])
    )

    let indexed = 0, skipped = 0
    for (const rel of onDisk) {
      const prev = known.get(rel)
      const { mtimeMs, size } = await this.vault.stat(rel)
      if (prev && prev.mtime === mtimeMs && prev.size === size) { skipped++; continue }
      await this.indexFile(rel)
      indexed++
    }

    let removed = 0
    const present = new Set(onDisk)
    for (const rel of known.keys()) {
      if (!present.has(rel)) { this.removeFile(rel); removed++ }
    }

    return { indexed, removed, skipped }
  }
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/main/index/indexer.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/main/index/indexer.ts src/main/index/indexer.test.ts
git commit -m "feat(index): indexação incremental por mtime com fields, tags, links e tarefas"
```

---

### Task 7: Resolução de wikilinks

**Files:**
- Create: `src/main/index/resolver.ts`
- Modify: `src/main/index/indexer.ts` — chamar `resolveLinks` ao fim de `indexFile` e `syncAll`
- Test: `src/main/index/resolver.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 5), `Indexer` (Task 6)
- Produces: `resolveLinks(db: Db): void` — preenche `links.resolved_path`; deixa `NULL` quando não existe nota correspondente

Regra, em ordem: (1) `dst` bate com um `path` sem extensão; (2) `dst` bate com o nome do arquivo sem `.md`; ambas ignorando maiúsculas; (3) não resolve.

- [ ] **Step 1: Escrever os testes que falham**

`src/main/index/resolver.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from '../vault/vault'
import { openIndex, type Db } from './db'
import { Indexer } from './indexer'
import { resolveLinks } from './resolver'

let root: string, vault: Vault, db: Db, ix: Indexer

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
  db = openIndex(':memory:')
  ix = new Indexer(db, vault)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const resolved = (src: string) =>
  db.prepare('SELECT dst,resolved_path FROM links WHERE src=?').all(src) as any[]

describe('resolveLinks', () => {
  it('resolve pelo nome do arquivo, em qualquer pasta', async () => {
    await vault.writeAtomic('Segurança/MOC - Segurança.md', 'x')
    await vault.writeAtomic('Projetos/Nima.md', 'ver [[MOC - Segurança]]')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('Projetos/Nima.md')[0].resolved_path).toBe('Segurança/MOC - Segurança.md')
  })

  it('resolve por caminho completo quando informado', async () => {
    await vault.writeAtomic('Projetos/Nima.md', 'x')
    await vault.writeAtomic('a.md', 'ver [[Projetos/Nima]]')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('a.md')[0].resolved_path).toBe('Projetos/Nima.md')
  })

  it('ignora diferença de maiúsculas', async () => {
    await vault.writeAtomic('Nima.md', 'x')
    await vault.writeAtomic('a.md', '[[nima]]')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('a.md')[0].resolved_path).toBe('Nima.md')
  })

  it('deixa NULL quando a nota não existe', async () => {
    await vault.writeAtomic('a.md', '[[Fantasma]]')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('a.md')[0].resolved_path).toBeNull()
  })

  it('link quebrado passa a resolver quando a nota é criada', async () => {
    await vault.writeAtomic('a.md', '[[Depois]]')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('a.md')[0].resolved_path).toBeNull()

    await vault.writeAtomic('Depois.md', 'x')
    await ix.syncAll()
    resolveLinks(db)
    expect(resolved('a.md')[0].resolved_path).toBe('Depois.md')
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/main/index/resolver.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/main/index/resolver.ts`:

```ts
import type { Db } from './db'

/**
 * Preenche links.resolved_path. Recalcula tudo: é barato no tamanho de vault
 * esperado (milhares de notas) e elimina estado inconsistente entre reindexações.
 */
export function resolveLinks(db: Db): void {
  const paths = (db.prepare('SELECT path FROM notes').all() as { path: string }[]).map(r => r.path)

  const byFull = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const p of paths) {
    const noExt = p.replace(/\.md$/i, '')
    byFull.set(noExt.toLowerCase(), p)
    const name = noExt.split('/').pop()!.toLowerCase()
    if (!byName.has(name)) byName.set(name, p)
  }

  const upd = db.prepare('UPDATE links SET resolved_path = ? WHERE rowid = ?')
  const rows = db.prepare('SELECT rowid, dst FROM links').all() as { rowid: number; dst: string }[]

  db.transaction(() => {
    for (const { rowid, dst } of rows) {
      const key = dst.replace(/\.md$/i, '').toLowerCase()
      upd.run(byFull.get(key) ?? byName.get(key) ?? null, rowid)
    }
  })()
}
```

- [ ] **Step 4: Chamar a resolução após indexar**

Em `src/main/index/indexer.ts`, adicionar o import:

```ts
import { resolveLinks } from './resolver'
```

No fim de `indexFile`, depois da transação, e no fim de `syncAll`, antes do `return`:

```ts
    resolveLinks(this.db)
```

- [ ] **Step 5: Rodar a suíte inteira até passar**

Run: `npm test`
Expected: PASS em parser, vault, db, indexer e resolver.

- [ ] **Step 6: Commit**

```bash
git add src/main/index
git commit -m "feat(index): resolução de wikilinks por nome e caminho, com links quebrados"
```

---

### Task 8: Queries do índice

**Files:**
- Create: `src/main/index/queries.ts`
- Test: `src/main/index/queries.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 5), `NoteRow` (Task 1)
- Produces:
  - `getNote(db: Db, path: string): NoteRow | undefined`
  - `listNotes(db: Db, filter?: { tipo?: string; project?: string }): NoteRow[]`
  - `searchFullText(db: Db, q: string, limit?: number): { path: string; title: string; snippet: string }[]`
  - `getBacklinks(db: Db, path: string): { path: string; title: string; line: number }[]`
  - `getOutlinks(db: Db, path: string): { dst: string; resolvedPath: string | null; line: number }[]`
  - `getBrokenLinks(db: Db): { src: string; dst: string; line: number }[]`

- [ ] **Step 1: Escrever os testes que falham**

`src/main/index/queries.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from '../vault/vault'
import { openIndex, type Db } from './db'
import { Indexer } from './indexer'
import {
  getNote, listNotes, searchFullText, getBacklinks, getOutlinks, getBrokenLinks
} from './queries'

let root: string, vault: Vault, db: Db, ix: Indexer

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
  db = openIndex(':memory:')
  ix = new Indexer(db, vault)

  await vault.writeAtomic('Segurança/MOC - Segurança.md',
    '---\ntipo: moc\n---\nchecklist de rate limiting')
  await vault.writeAtomic('Projetos/Nima.md',
    '---\ntipo: projeto\nproject: Nima\n---\nver [[MOC - Segurança]] e [[Fantasma]]')
  await vault.writeAtomic('Projetos/LCKP.md', '---\ntipo: projeto\nproject: LCKP\n---\noutro')
  await ix.syncAll()
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('queries', () => {
  it('getNote mapeia parse_error para parseError', () => {
    const n = getNote(db, 'Projetos/Nima.md')!
    expect(n.tipo).toBe('projeto')
    expect(n.title).toBe('Nima')
    expect(n.parseError).toBeNull()
  })

  it('getNote devolve undefined para caminho inexistente', () => {
    expect(getNote(db, 'nao/existe.md')).toBeUndefined()
  })

  it('listNotes filtra por tipo', () => {
    expect(listNotes(db, { tipo: 'projeto' }).map(r => r.title).sort()).toEqual(['LCKP', 'Nima'])
  })

  it('listNotes filtra por projeto', () => {
    expect(listNotes(db, { project: 'Nima' }).map(r => r.title)).toEqual(['Nima'])
  })

  it('listNotes sem filtro devolve tudo', () => {
    expect(listNotes(db).length).toBe(3)
  })

  it('searchFullText acha pelo corpo e devolve trecho', () => {
    const hits = searchFullText(db, 'limiting')
    expect(hits.map(h => h.path)).toEqual(['Segurança/MOC - Segurança.md'])
    expect(hits[0].snippet.toLowerCase()).toContain('limiting')
  })

  it('searchFullText respeita o limite', () => {
    expect(searchFullText(db, 'outro OR limiting OR ver', 1).length).toBe(1)
  })

  it('getBacklinks lista quem aponta para a nota', () => {
    expect(getBacklinks(db, 'Segurança/MOC - Segurança.md').map(b => b.path))
      .toEqual(['Projetos/Nima.md'])
  })

  it('getOutlinks lista os links de saída, resolvidos e quebrados', () => {
    const out = getOutlinks(db, 'Projetos/Nima.md')
    expect(out.map(o => o.dst).sort()).toEqual(['Fantasma', 'MOC - Segurança'])
    expect(out.find(o => o.dst === 'Fantasma')!.resolvedPath).toBeNull()
  })

  it('getBrokenLinks lista só os não resolvidos', () => {
    expect(getBrokenLinks(db)).toEqual([{ src: 'Projetos/Nima.md', dst: 'Fantasma', line: 1 }])
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/main/index/queries.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/main/index/queries.ts`:

```ts
import type { Db } from './db'
import type { NoteRow } from '../../shared/types'

const NOTE_COLS = `path, title, tipo, project, status, created, updated, date,
  mtime, size, parse_error as parseError`

export function getNote(db: Db, path: string): NoteRow | undefined {
  return db.prepare(`SELECT ${NOTE_COLS} FROM notes WHERE path = ?`).get(path) as NoteRow | undefined
}

export function listNotes(db: Db, filter: { tipo?: string; project?: string } = {}): NoteRow[] {
  const where: string[] = []
  const args: string[] = []
  if (filter.tipo) { where.push('tipo = ?'); args.push(filter.tipo) }
  if (filter.project) { where.push('project = ?'); args.push(filter.project) }
  const sql = `SELECT ${NOTE_COLS} FROM notes
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY title COLLATE NOCASE`
  return db.prepare(sql).all(...args) as NoteRow[]
}

export function searchFullText(
  db: Db, q: string, limit = 50
): { path: string; title: string; snippet: string }[] {
  return db.prepare(`
    SELECT path, title, snippet(notes_fts, 2, '«', '»', '…', 12) AS snippet
    FROM notes_fts WHERE notes_fts MATCH ? LIMIT ?
  `).all(q, limit) as { path: string; title: string; snippet: string }[]
}

export function getBacklinks(
  db: Db, path: string
): { path: string; title: string; line: number }[] {
  return db.prepare(`
    SELECT l.src AS path, n.title AS title, l.line AS line
    FROM links l JOIN notes n ON n.path = l.src
    WHERE l.resolved_path = ?
    ORDER BY n.title COLLATE NOCASE
  `).all(path) as { path: string; title: string; line: number }[]
}

export function getOutlinks(
  db: Db, path: string
): { dst: string; resolvedPath: string | null; line: number }[] {
  return db.prepare(`
    SELECT dst, resolved_path AS resolvedPath, line FROM links WHERE src = ? ORDER BY line
  `).all(path) as { dst: string; resolvedPath: string | null; line: number }[]
}

export function getBrokenLinks(db: Db): { src: string; dst: string; line: number }[] {
  return db.prepare(`
    SELECT src, dst, line FROM links WHERE resolved_path IS NULL ORDER BY src, line
  `).all() as { src: string; dst: string; line: number }[]
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/main/index/queries.test.ts`
Expected: PASS, 10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/main/index/queries.ts src/main/index/queries.test.ts
git commit -m "feat(index): queries de nota, busca full-text, backlinks e links quebrados"
```

---

### Task 9: Watcher do vault

**Files:**
- Create: `src/main/vault/watcher.ts`
- Test: `src/main/vault/watcher.test.ts`

**Interfaces:**
- Consumes: `Vault` (Task 4), `Indexer` (Task 6)
- Produces: classe `VaultWatcher` com
  - `constructor(vault: Vault, indexer: Indexer, onChange: (rel: string, kind: 'add' | 'change' | 'unlink') => void)`
  - `start(): Promise<void>`
  - `stop(): Promise<void>`

- [ ] **Step 1: Escrever os testes que falham**

`src/main/vault/watcher.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault } from './vault'
import { VaultWatcher } from './watcher'
import { openIndex, type Db } from '../index/db'
import { Indexer } from '../index/indexer'

let root: string, vault: Vault, db: Db, ix: Indexer, w: VaultWatcher
const eventos: { rel: string; kind: string }[] = []

const esperar = (cond: () => boolean, ms = 5000) => new Promise<void>((ok, fail) => {
  const t0 = Date.now()
  const tick = (): void => {
    if (cond()) return ok()
    if (Date.now() - t0 > ms) return fail(new Error('timeout esperando o watcher'))
    setTimeout(tick, 50)
  }
  tick()
})

beforeEach(async () => {
  eventos.length = 0
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  vault = new Vault(root)
  db = openIndex(':memory:')
  ix = new Indexer(db, vault)
  w = new VaultWatcher(vault, ix, (rel, kind) => eventos.push({ rel, kind }))
  await w.start()
})
afterEach(async () => { await w.stop(); await rm(root, { recursive: true, force: true }) })

describe('VaultWatcher', () => {
  it('indexa nota criada por fora do app', async () => {
    await vault.writeAtomic('novo.md', '---\ntipo: nota\n---\ncriado por fora')
    await esperar(() => eventos.some(e => e.rel === 'novo.md'))
    const n = db.prepare('SELECT tipo FROM notes WHERE path=?').get('novo.md') as any
    expect(n.tipo).toBe('nota')
  })

  it('reindexa nota alterada por fora', async () => {
    await vault.writeAtomic('a.md', '[[Antes]]')
    await esperar(() => eventos.some(e => e.rel === 'a.md'))
    eventos.length = 0
    await vault.writeAtomic('a.md', '[[Depois]]')
    await esperar(() => eventos.some(e => e.rel === 'a.md'))
    expect(db.prepare('SELECT dst FROM links WHERE src=?').all('a.md')).toEqual([{ dst: 'Depois' }])
  })

  it('remove do índice nota apagada por fora', async () => {
    await vault.writeAtomic('a.md', 'x')
    await esperar(() => eventos.some(e => e.rel === 'a.md'))
    await rm(join(root, 'a.md'))
    await esperar(() => eventos.some(e => e.kind === 'unlink'))
    expect(db.prepare('SELECT count(*) c FROM notes').get()).toEqual({ c: 0 })
  })

  it('não emite evento para arquivo que não é .md', async () => {
    await writeFile(join(root, 'imagem.png'), 'x')
    await new Promise(r => setTimeout(r, 800))
    expect(eventos.some(e => e.rel.endsWith('.png'))).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/main/vault/watcher.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/main/vault/watcher.ts`:

```ts
import chokidar, { type FSWatcher } from 'chokidar'
import { relative, sep } from 'node:path'
import type { Vault } from './vault'
import type { Indexer } from '../index/indexer'

type Kind = 'add' | 'change' | 'unlink'

export class VaultWatcher {
  private watcher: FSWatcher | null = null
  private fila = new Map<string, Kind>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private vault: Vault,
    private indexer: Indexer,
    private onChange: (rel: string, kind: Kind) => void
  ) {}

  async start(): Promise<void> {
    this.watcher = chokidar.watch(this.vault.root, {
      ignoreInitial: true,
      ignored: (p: string) => {
        const rel = relative(this.vault.root, p)
        return rel.startsWith('.') || rel.includes(`${sep}.`) || rel.endsWith('.tmp')
      },
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 }
    })
    for (const kind of ['add', 'change', 'unlink'] as Kind[]) {
      this.watcher.on(kind, (abs: string) => this.enfileirar(abs, kind))
    }
    await new Promise<void>(ok => this.watcher!.once('ready', () => ok()))
  }

  private enfileirar(abs: string, kind: Kind): void {
    const rel = relative(this.vault.root, abs).split(sep).join('/')
    if (!rel.toLowerCase().endsWith('.md')) return
    this.fila.set(rel, kind)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.drenar(), 100)
  }

  /** Agrupa rajadas: salvar um arquivo pode disparar vários eventos seguidos. */
  private async drenar(): Promise<void> {
    const lote = [...this.fila.entries()]
    this.fila.clear()
    for (const [rel, kind] of lote) {
      try {
        if (kind === 'unlink') this.indexer.removeFile(rel)
        else await this.indexer.indexFile(rel)
      } catch {
        // Arquivo pode ter sumido entre o evento e a leitura: ignorar.
        continue
      }
      this.onChange(rel, kind)
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    await this.watcher?.close()
    this.watcher = null
  }
}
```

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run src/main/vault/watcher.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/main/vault/watcher.ts src/main/vault/watcher.test.ts
git commit -m "feat(vault): watcher com agrupamento de rajada e reindexação incremental"
```

---

### Task 10: Superfície IPC validada

**Files:**
- Create: `src/shared/ipc.ts`, `src/main/session.ts`, `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`, `src/shared/types.ts`
- Test: `src/shared/ipc.test.ts`, `src/main/ipc/handlers.test.ts`

**Interfaces:**
- Consumes: `Vault` (4), `Indexer` (6), queries (8), `VaultWatcher` (9)
- Produces:
  - `IPC_SCHEMAS`, tipos `IpcChannel` e `IpcPayload<C>`
  - classe `Session` com `open(root, onChange?)`, `close()`, campos `vault`/`db`/`indexer`, getter `isOpen`
  - `handle(session, canal, payload): Promise<unknown>` e `registerIpc(session): void`
  - `window.vaultApi` com `invoke`, `pickVault`, `onVaultChange`

Canais: `vault:open`, `note:read`, `note:write`, `note:list`, `search:fulltext`, `links:backlinks`, `links:outlinks`, `links:broken`.

- [ ] **Step 1: Escrever os schemas com teste**

`src/shared/ipc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { IPC_SCHEMAS } from './ipc'

describe('IPC_SCHEMAS', () => {
  it('rejeita caminho vazio em note:read', () => {
    expect(IPC_SCHEMAS['note:read'].safeParse({ path: '' }).success).toBe(false)
  })

  it('aceita payload válido de note:write', () => {
    expect(IPC_SCHEMAS['note:write'].safeParse({ path: 'a.md', content: 'x' }).success).toBe(true)
  })

  it('aplica limite padrão na busca', () => {
    expect(IPC_SCHEMAS['search:fulltext'].parse({ q: 'nima' }).limit).toBe(50)
  })

  it('recusa limite acima do teto', () => {
    expect(IPC_SCHEMAS['search:fulltext'].safeParse({ q: 'x', limit: 5000 }).success).toBe(false)
  })

  it('recusa campo desconhecido', () => {
    expect(IPC_SCHEMAS['note:read'].safeParse({ path: 'a.md', extra: 1 }).success).toBe(false)
  })
})
```

`src/shared/ipc.ts`:

```ts
import { z } from 'zod'

const caminho = z.string().min(1).max(1024)

export const IPC_SCHEMAS = {
  'vault:open': z.object({ root: z.string().min(1) }).strict(),
  'note:read': z.object({ path: caminho }).strict(),
  'note:write': z.object({ path: caminho, content: z.string().max(5_000_000) }).strict(),
  'note:list': z.object({
    tipo: z.string().max(64).optional(),
    project: z.string().max(200).optional()
  }).strict(),
  'search:fulltext': z.object({
    q: z.string().min(1).max(200),
    limit: z.number().int().positive().max(200).default(50)
  }).strict(),
  'links:backlinks': z.object({ path: caminho }).strict(),
  'links:outlinks': z.object({ path: caminho }).strict(),
  'links:broken': z.object({}).strict()
} as const

export type IpcChannel = keyof typeof IPC_SCHEMAS
export type IpcPayload<C extends IpcChannel> = z.input<(typeof IPC_SCHEMAS)[C]>
```

Run: `npx vitest run src/shared/ipc.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 2: Escrever o teste dos handlers que falha**

`src/main/ipc/handlers.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session } from '../session'
import { handle } from './handlers'

let root: string, session: Session

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-'))
  session = new Session()
  await session.open(root)
})
afterEach(async () => { await session.close(); await rm(root, { recursive: true, force: true }) })

describe('handle', () => {
  it('escreve e lê uma nota', async () => {
    await handle(session, 'note:write', { path: 'a.md', content: '# oi' })
    const r = await handle(session, 'note:read', { path: 'a.md' }) as { content: string }
    expect(r.content).toBe('# oi')
  })

  it('indexa imediatamente após escrever', async () => {
    await handle(session, 'note:write', { path: 'a.md', content: '---\ntipo: projeto\n---\nx' })
    const lista = await handle(session, 'note:list', { tipo: 'projeto' }) as any[]
    expect(lista.map(n => n.path)).toEqual(['a.md'])
  })

  it('rejeita payload inválido antes de tocar no disco', async () => {
    await expect(handle(session, 'note:read', { path: '' })).rejects.toThrow(/inválido/i)
  })

  it('rejeita path traversal', async () => {
    await expect(
      handle(session, 'note:read', { path: '../../fora.md' })
    ).rejects.toThrow(/fora do vault/)
  })

  it('rejeita canal desconhecido', async () => {
    await expect(handle(session, 'canal:falso' as any, {})).rejects.toThrow(/desconhecido/)
  })

  it('busca full-text encontra a nota escrita', async () => {
    await handle(session, 'note:write', { path: 'a.md', content: 'rate limiting no login' })
    const hits = await handle(session, 'search:fulltext', { q: 'limiting' }) as any[]
    expect(hits.map(h => h.path)).toEqual(['a.md'])
  })
})
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `npx vitest run src/main/ipc/handlers.test.ts`
Expected: FAIL — módulos `../session` e `./handlers` não encontrados.

- [ ] **Step 4: Implementar sessão e handlers**

`src/main/session.ts`:

```ts
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { Vault } from './vault/vault'
import { VaultWatcher } from './vault/watcher'
import { openIndex, type Db } from './index/db'
import { Indexer } from './index/indexer'

export class Session {
  vault!: Vault
  db!: Db
  indexer!: Indexer
  private watcher: VaultWatcher | null = null
  private aberta = false

  get isOpen(): boolean { return this.aberta }

  async open(root: string, onChange: (rel: string) => void = () => {}): Promise<void> {
    await this.close()
    this.vault = new Vault(root)
    const dir = join(this.vault.root, '.vault')
    await mkdir(dir, { recursive: true })
    this.db = openIndex(join(dir, 'index.db'))
    this.indexer = new Indexer(this.db, this.vault)
    await this.indexer.syncAll()
    this.watcher = new VaultWatcher(this.vault, this.indexer, rel => onChange(rel))
    await this.watcher.start()
    this.aberta = true
  }

  async close(): Promise<void> {
    await this.watcher?.stop()
    this.watcher = null
    if (this.aberta) this.db.close()
    this.aberta = false
  }
}
```

`src/main/ipc/handlers.ts`:

```ts
import { ipcMain } from 'electron'
import { IPC_SCHEMAS, type IpcChannel } from '../../shared/ipc'
import type { Session } from '../session'
import {
  getNote, listNotes, searchFullText, getBacklinks, getOutlinks, getBrokenLinks
} from '../index/queries'

export async function handle(
  session: Session, canal: IpcChannel, bruto: unknown
): Promise<unknown> {
  const schema = IPC_SCHEMAS[canal]
  if (!schema) throw new Error(`canal desconhecido: ${canal}`)

  const parsed = schema.safeParse(bruto ?? {})
  if (!parsed.success) throw new Error(`payload inválido em ${canal}: ${parsed.error.message}`)
  const p = parsed.data as any

  switch (canal) {
    case 'vault:open':
      await session.open(p.root)
      return { root: session.vault.root }

    case 'note:read': {
      const content = await session.vault.read(p.path)
      return { content, meta: getNote(session.db, p.path) ?? null }
    }

    case 'note:write':
      await session.vault.writeAtomic(p.path, p.content)
      await session.indexer.indexFile(p.path)
      return { ok: true }

    case 'note:list':
      return listNotes(session.db, { tipo: p.tipo, project: p.project })

    case 'search:fulltext':
      return searchFullText(session.db, p.q, p.limit)

    case 'links:backlinks': return getBacklinks(session.db, p.path)
    case 'links:outlinks':  return getOutlinks(session.db, p.path)
    case 'links:broken':    return getBrokenLinks(session.db)
  }
}

export function registerIpc(session: Session): void {
  for (const canal of Object.keys(IPC_SCHEMAS) as IpcChannel[]) {
    ipcMain.handle(canal, (_e, payload) => handle(session, canal, payload))
  }
}
```

- [ ] **Step 5: Rodar até passar**

Run: `npx vitest run src/main/ipc/handlers.test.ts`
Expected: PASS, 6 testes.

Os testes chamam `handle` diretamente, sem Electron. `registerIpc` só amarra `handle` ao `ipcMain` e é exercitado manualmente no Task 11.

- [ ] **Step 6: Expor a API no preload**

`src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcPayload } from '../shared/ipc'

const api = {
  invoke<C extends IpcChannel>(canal: C, payload: IpcPayload<C>): Promise<unknown> {
    return ipcRenderer.invoke(canal, payload)
  },
  pickVault(): Promise<{ root: string } | null> {
    return ipcRenderer.invoke('vault:pick')
  },
  onVaultChange(cb: (rel: string) => void): () => void {
    const h = (_e: unknown, rel: string): void => cb(rel)
    ipcRenderer.on('vault:changed', h)
    return () => { ipcRenderer.off('vault:changed', h) }
  }
}

contextBridge.exposeInMainWorld('vaultApi', api)
export type VaultApi = typeof api
```

Acrescentar ao fim de `src/shared/types.ts`:

```ts
declare global {
  interface Window {
    vaultApi: {
      invoke(canal: string, payload: unknown): Promise<unknown>
      pickVault(): Promise<{ root: string } | null>
      onVaultChange(cb: (rel: string) => void): () => void
    }
  }
}
export {}
```

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc.ts src/shared/ipc.test.ts src/shared/types.ts src/main/session.ts src/main/ipc src/preload/index.ts
git commit -m "feat(ipc): superfície de comandos validada com zod e preload isolado"
```

---

### Task 11: App mínimo ponta a ponta

**Files:**
- Modify: `src/main/index.ts`, `src/renderer/App.tsx`
- Create: `src/renderer/useVault.ts`

**Interfaces:**
- Consumes: `Session` + `registerIpc` (Task 10), `window.vaultApi` (Task 10), `NoteRow` (Task 1)
- Produces: app que abre uma pasta, indexa, lista notas, abre uma em `<textarea>`, salva e reflete mudança externa. **Fim da Fundação.**

- [ ] **Step 1: Ligar sessão, IPC e diálogo de pasta no main**

`src/main/index.ts` — substituir o conteúdo do Task 1 por:

```ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { Session } from './session'
import { registerIpc } from './ipc/handlers'

const session = new Session()
let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Cortex',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

// Escolher pasta é privilégio do main: o renderer nunca informa caminho de vault.
ipcMain.handle('vault:pick', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (r.canceled || !r.filePaths[0]) return null
  await session.open(r.filePaths[0], rel => win?.webContents.send('vault:changed', rel))
  return { root: session.vault.root }
})

app.whenReady().then(() => {
  registerIpc(session)
  createWindow()
})

app.on('window-all-closed', async () => {
  await session.close()
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Escrever o hook do renderer**

`src/renderer/useVault.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import type { NoteRow } from '../shared/types'

export function useVault() {
  const [root, setRoot] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const [conteudo, setConteudo] = useState('')

  const recarregar = useCallback(async () => {
    if (!root) return
    setNotes(await window.vaultApi.invoke('note:list', {}) as NoteRow[])
  }, [root])

  useEffect(() => { void recarregar() }, [recarregar])
  useEffect(() => window.vaultApi.onVaultChange(() => void recarregar()), [recarregar])

  const escolher = async (): Promise<void> => {
    const r = await window.vaultApi.pickVault()
    if (r) setRoot(r.root)
  }

  const abrir = async (path: string): Promise<void> => {
    const r = await window.vaultApi.invoke('note:read', { path }) as { content: string }
    setAberta(path)
    setConteudo(r.content)
  }

  const salvar = async (): Promise<void> => {
    if (!aberta) return
    await window.vaultApi.invoke('note:write', { path: aberta, content: conteudo })
    await recarregar()
  }

  return { root, notes, aberta, conteudo, setConteudo, escolher, abrir, salvar }
}
```

- [ ] **Step 3: Escrever a UI mínima**

`src/renderer/App.tsx`:

```tsx
import { useVault } from './useVault'

export function App() {
  const { root, notes, aberta, conteudo, setConteudo, escolher, abrir, salvar } = useVault()

  if (!root) {
    return (
      <div style={{ fontFamily: 'system-ui', padding: 32 }}>
        <h1>Cortex</h1>
        <button onClick={() => void escolher()}>Abrir pasta do vault…</button>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'system-ui', display: 'flex', height: '100vh' }}>
      <aside style={{ width: 280, borderRight: '1px solid #ccc', overflow: 'auto', padding: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>{notes.length} notas</div>
        {notes.map(n => (
          <div
            key={n.path}
            onClick={() => void abrir(n.path)}
            style={{
              padding: '4px 6px', cursor: 'pointer', borderRadius: 4,
              background: n.path === aberta ? '#dde6ff' : undefined
            }}
          >
            {n.title} <span style={{ opacity: 0.5, fontSize: 11 }}>{n.tipo}</span>
          </div>
        ))}
      </aside>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12 }}>
        <div style={{ marginBottom: 8 }}>
          <strong>{aberta ?? 'nenhuma nota aberta'}</strong>
          <button onClick={() => void salvar()} disabled={!aberta} style={{ marginLeft: 12 }}>
            Salvar
          </button>
        </div>
        <textarea
          value={conteudo}
          onChange={e => setConteudo(e.target.value)}
          disabled={!aberta}
          style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 13, padding: 10 }}
        />
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Verificação manual ponta a ponta**

Copiar o vault para uma pasta de trabalho — **nunca usar o vault real ainda**:

```bash
cp -r "/c/Users/PH/obsidian" "/c/Users/PH/Desktop/vault-teste"
```

Run: `npm run dev`

Conferir, um a um:
1. "Abrir pasta do vault…" → escolher `vault-teste` → a lista mostra as 81 notas
2. Clicar em `MOC - Segurança` → o conteúdo aparece no textarea
3. Editar, clicar em Salvar → abrir o arquivo no bloco de notas e confirmar a alteração
4. Conferir que não sobrou nenhum arquivo `.tmp` na pasta
5. Com o app aberto, criar `teste-externo.md` pelo Explorer → a nota aparece na lista sozinha, em até ~1 segundo
6. Apagar esse arquivo pelo Explorer → some da lista sozinho
7. Fechar o app, apagar `vault-teste/.vault/index.db`, reabrir → tudo é reconstruído e a lista volta idêntica

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: PASS em todos os arquivos (types, parser, vault, watcher, db, indexer, resolver, queries, ipc, handlers).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: app mínimo abre vault, indexa, lista, edita e salva"
```

---

## Fim da Fundação

Ao final do Task 11 existe um app Electron que abre um vault real, indexa 81 notas, resolve wikilinks, busca full-text e salva com escrita atômica — tudo coberto por testes que rodam sem abrir janela.

**O que vem no plano seguinte (Cortex — Shell):** editor CodeMirror 6 com wikilinks clicáveis e autocomplete de `[[`, rail de lentes, sidebar em árvore, painéis fixos por lente, painel de Dependências da Rede, painel de links quebrados, Ctrl+K, templates por tipo, validação de protocolo, checklist de segurança por projeto, `AGENT.md` e anexos.

**Requisitos da spec cobertos aqui:** §5 (arquitetura e fronteiras), §6 (modelo de dados completo, incluindo `fields` e FTS), §6.4 (indexação incremental e reconstrução), §10 (YAML inválido, link quebrado, escrita atômica, `index.db` reconstruível), §11 (testes unitários e de integração), §12 (contextIsolation, sandbox, path traversal, zod no IPC, sem rede).

**Requisitos da spec deliberadamente adiados para o plano Shell:** §7 (contrato de agente e validação de protocolo), §7.1 (checklist de segurança), §8 (interface), §9 itens 2–10, §13 (distribuição).
