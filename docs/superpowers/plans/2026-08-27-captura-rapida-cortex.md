# Captura rápida — lado do Cortex

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam `- [ ]` para acompanhamento.

**Objetivo:** fazer o Cortex puxar eventos de captura rápida de um banco na nuvem e escrevê-los no vault, e publicar o cardápio que o celular precisa para montar suas telas.

**Arquitetura:** um contrato de eventos compartilhado entre desktop e web; um cliente HTTP fino contra funções RPC do Supabase; uma camada pura que traduz evento em operações no vault, separada de um executor que as aplica. Nada de novo no caminho de escrita: as operações terminam nos mesmos utilitários de patch que os formulários já usam.

**Stack:** TypeScript, Electron 43 (Node 22, `fetch` nativo — sem biblioteca HTTP), zod, vitest, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-08-27-captura-rapida-design.md`

## Restrições globais

- **Nada de biblioteca HTTP nova.** Node 22 tem `fetch` global; foi verificado nesta máquina.
- **O Cortex nunca escreve na tabela `eventos`.** Só lê. A única escrita é o cardápio.
- **O cardápio publica só:** `treino → {grupo, exercicios:[{nome,series,reps}]}` (sem carga), `suplemento → {dose, quando, dias}`, `refeicao → {hora, itens, kcal, prot}`. Qualquer campo além destes é defeito, e existe teste para isso.
- **Datas em ISO `YYYY-MM-DD`**, sempre no fuso local — nunca `toISOString()`, que a partir das 21h em GMT-3 devolve o dia seguinte.
- **Split de linhas sempre `/\r\n|\n/`.** CRLF já quebrou o parser deste projeto duas vezes.
- **Comentários em português**, explicando o *porquê*, no estilo do código existente.
- **Nenhum caminho novo de escrita no vault.** Reutilizar `patchFrontmatter` e `appendToFrontmatterList` de `src/main/vault/patch.ts`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/eventos.ts` | Contrato: tipos de evento e de cardápio, validação zod. Usado pelo desktop e, no plano 2, pelo app web. |
| `src/main/nuvem/cardapio.ts` | `montarCardapio` — a fronteira do que sobe. Puro. |
| `src/main/nuvem/planejar.ts` | Evento → lista de operações no vault. Puro, sem disco. |
| `src/main/nuvem/executar.ts` | Aplica as operações usando o Vault e o Indexer. |
| `src/main/nuvem/recebidos.ts` | Quais eventos já foram aplicados (`.vault/recebidos.json`). |
| `src/main/nuvem/cliente.ts` | HTTP contra as RPC do Supabase. |
| `src/main/nuvem/sincronizador.ts` | Orquestra: puxa, filtra, planeja, executa, registra. |
| `supabase/schema.sql` | Tabelas, RLS e funções. Rodado uma vez no painel do Supabase. |
| `src/main/config.ts` | +`vaultId`, +`nuvem` |
| `src/main/ipc/handlers.ts` | Canais `nuvem:*` |
| `src/renderer/components/Nuvem.tsx` | Aba de configuração da nuvem |

Separar `planejar` de `executar` é a decisão de design que sustenta os testes: decidir "este evento vira qual mudança" fica puro e testável sem tocar em disco, e o executor fica fino demais para esconder defeito.

---

### Task 1: Contrato de eventos

**Arquivos:**
- Criar: `src/shared/eventos.ts`
- Teste: `src/shared/eventos.test.ts`

**Interfaces:**
- Consome: nada
- Produz: `TIPOS_EVENTO`, `type TipoEvento`, `type Evento`, `type ItemCardapio`, `EVENTO_SCHEMA`, `validarEvento(bruto: unknown): Evento`

- [ ] **Passo 1: escrever o teste que falha**

```ts
// src/shared/eventos.test.ts
import { describe, it, expect } from 'vitest'
import { validarEvento, TIPOS_EVENTO } from './eventos'

describe('validarEvento', () => {
  it('aceita um evento bem formado', () => {
    const e = validarEvento({
      tipo: 'suplemento', dia: '2026-08-27', dados: { nome: 'Whey' }
    })
    expect(e.tipo).toBe('suplemento')
    expect(e.dia).toBe('2026-08-27')
  })

  it('recusa tipo que nao esta na lista', () => {
    expect(() => validarEvento({ tipo: 'inventado', dia: '2026-08-27', dados: {} }))
      .toThrow(/inválido/)
  })

  it('recusa data fora do formato ISO', () => {
    expect(() => validarEvento({ tipo: 'peso', dia: '27/08/2026', dados: { peso: 78 } }))
      .toThrow(/inválido/)
  })

  it('recusa dados acima de 8 KB — o limite que o banco tambem aplica', () => {
    const gigante = { texto: 'x'.repeat(9000) }
    expect(() => validarEvento({ tipo: 'anotacao', dia: '2026-08-27', dados: gigante }))
      .toThrow(/grande/)
  })

  it('cobre todos os tipos que a spec define', () => {
    expect([...TIPOS_EVENTO].sort()).toEqual([
      'anotacao', 'cardio', 'gasto', 'medida', 'peso',
      'refeicao_extra', 'refeicao_plano', 'sessao', 'suplemento'
    ])
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run src/shared/eventos.test.ts`
Esperado: FAIL — o módulo `./eventos` não existe.

- [ ] **Passo 3: implementar**

```ts
// src/shared/eventos.ts
import { z } from 'zod'

/**
 * O contrato entre o celular e o Cortex.
 *
 * Vive em `shared/` porque os dois lados dependem dele: mudar um campo aqui
 * quebra a compilação do desktop E do app web, que é exatamente o que se quer
 * — a alternativa é os dois divergirem em silêncio e o dado chegar torto.
 */

export const TIPOS_EVENTO = [
  'suplemento', 'refeicao_plano', 'refeicao_extra', 'gasto',
  'sessao', 'cardio', 'medida', 'peso', 'anotacao'
] as const

export type TipoEvento = (typeof TIPOS_EVENTO)[number]

/** Data no fuso local, nunca `toISOString()` (que vira o dia seguinte à noite). */
const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dia deve ser ISO YYYY-MM-DD')

export const EVENTO_SCHEMA = z.object({
  tipo: z.enum(TIPOS_EVENTO),
  dia: DIA,
  dados: z.record(z.string().max(64), z.unknown())
}).strict()

export type Evento = z.infer<typeof EVENTO_SCHEMA>

/** Um item do cardápio: o que existe, nunca o que foi feito. */
export type ItemCardapio = {
  especie: 'treino' | 'suplemento' | 'refeicao'
  nome: string
  detalhe: Record<string, unknown>
}

const LIMITE_DADOS = 8 * 1024

export function validarEvento(bruto: unknown): Evento {
  const r = EVENTO_SCHEMA.safeParse(bruto)
  if (!r.success) throw new Error(`evento inválido: ${r.error.message}`)
  // O mesmo teto que a função no banco aplica. Checar dos dois lados evita
  // que um app desatualizado descubra o limite só quando o INSERT falha.
  if (JSON.stringify(r.data.dados).length > LIMITE_DADOS) {
    throw new Error('dados do evento grande demais (máx. 8 KB)')
  }
  return r.data
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run src/shared/eventos.test.ts`
Esperado: PASS, 5 testes.

- [ ] **Passo 5: commitar**

```bash
git add src/shared/eventos.ts src/shared/eventos.test.ts
git commit -m "Contrato de eventos compartilhado entre desktop e app web"
```

---

### Task 2: ID do vault na configuração

**Arquivos:**
- Modificar: `src/main/config.ts`
- Modificar: `src/main/session.ts` (dentro de `open`, após `lerConfig`)
- Teste: `src/main/config.test.ts` (acrescentar ao arquivo existente)

**Interfaces:**
- Consome: `Config`, `normalizarConfig`, `lerConfig`, `gravarConfig` de `src/main/config.ts`
- Produz: `Config` com `vaultId: string` e `nuvem: { url: string; chave: string } | null`; `novoVaultId(): string`

- [ ] **Passo 1: escrever o teste que falha**

```ts
// acrescentar ao fim de src/main/config.test.ts
// (o import do topo do arquivo passa a incluir `novoVaultId`)

describe('vaultId', () => {
  it('gera um UUID valido', () => {
    expect(novoVaultId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('dois vaults nunca recebem o mesmo id', () => {
    expect(novoVaultId()).not.toBe(novoVaultId())
  })

  it('config sem vaultId ganha um ao normalizar', () => {
    const c = normalizarConfig({ areas: [], pastasDev: [] })
    expect(c.vaultId).toMatch(/^[0-9a-f]{8}-/)
  })

  it('preserva o vaultId que ja existe — trocar sozinho orfanaria o celular', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(normalizarConfig({ vaultId: id }).vaultId).toBe(id)
  })

  it('descarta vaultId que nao e UUID', () => {
    const c = normalizarConfig({ vaultId: 'sou-um-id-inventado' })
    expect(c.vaultId).not.toBe('sou-um-id-inventado')
    expect(c.vaultId).toMatch(/^[0-9a-f]{8}-/)
  })

  it('nuvem comeca vazia e aceita url e chave', () => {
    expect(normalizarConfig({}).nuvem).toBeNull()
    const c = normalizarConfig({ nuvem: { url: 'https://x.supabase.co', chave: 'k' } })
    expect(c.nuvem).toEqual({ url: 'https://x.supabase.co', chave: 'k' })
  })

  it('descarta nuvem sem url ou sem chave', () => {
    expect(normalizarConfig({ nuvem: { url: 'https://x' } }).nuvem).toBeNull()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run src/main/config.test.ts`
Esperado: FAIL — `novoVaultId` não é exportado.

- [ ] **Passo 3: implementar**

Em `src/main/config.ts`, acrescentar no topo:

```ts
import { randomUUID } from 'node:crypto'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/**
 * O identificador do vault, gerado OFFLINE.
 *
 * É a única credencial da captura rápida: quem tem o id escreve neste vault.
 * Nasce aqui, e não no banco, porque assim o Cortex não precisa escrever nada
 * lá nem para se registrar — o que mantém de pé a regra de que só o cardápio
 * sobe.
 */
export function novoVaultId(): string {
  return randomUUID()
}
```

Estender o tipo:

```ts
export type Config = {
  areas: string[]
  pastasDev: string[]
  escolheu: boolean
  /** Identificador deste vault para a captura rápida. Ver `novoVaultId`. */
  vaultId: string
  /** Credenciais do Supabase. `null` enquanto a nuvem não foi configurada. */
  nuvem: { url: string; chave: string } | null
}
```

Em `CONFIG_PADRAO`, **não** chamar `novoVaultId()` — uma constante de módulo congelaria o mesmo id para todos os vaults:

```ts
export const CONFIG_PADRAO: Config = {
  areas: [...IDS_AREAS], pastasDev: [], escolheu: false, vaultId: '', nuvem: null
}
```

Substituir o `return` de `normalizarConfig` por:

```ts
  // Um id ausente ou corrompido é substituído; um id válido é sagrado —
  // trocá-lo sozinho deixaria todos os celulares apontando para o vazio.
  const idBruto = typeof o.vaultId === 'string' ? o.vaultId : ''
  const vaultId = UUID.test(idBruto) ? idBruto : novoVaultId()

  const n = o.nuvem as { url?: unknown; chave?: unknown } | undefined
  const nuvem = n && typeof n.url === 'string' && n.url && typeof n.chave === 'string' && n.chave
    ? { url: n.url, chave: n.chave }
    : null

  return { areas, pastasDev, escolheu: o.escolheu === true, vaultId, nuvem }
```

- [ ] **Passo 4: persistir o id gerado**

Em `src/main/session.ts`, dentro de `open`, logo após `this.config = await lerConfig(this.configPath)`:

```ts
    // `lerConfig` gera um vaultId quando não havia; gravar de volta para que
    // ele seja o mesmo na próxima abertura. Sem isto, cada início de sessão
    // inventaria um id novo e o celular pararia de entregar.
    if (!existsSync(this.configPath)) await gravarConfig(this.configPath, this.config)
```

`existsSync` já está importado de `node:fs` em `session.ts`; acrescentar `gravarConfig` ao import de `./config`.

- [ ] **Passo 5: rodar tudo**

Rodar: `npx vitest run && npx tsc --noEmit`
Esperado: PASS. Os testes existentes de `config.test.ts` que comparam o objeto inteiro com `toEqual` vão falhar por causa dos campos novos — corrigir cada um para incluir `vaultId: expect.any(String)` e `nuvem: null`.

- [ ] **Passo 6: commitar**

```bash
git add src/main/config.ts src/main/config.test.ts src/main/session.ts
git commit -m "Config ganha vaultId gerado offline e credenciais da nuvem"
```

---

### Task 3: O cardápio — a fronteira do que sobe

**Arquivos:**
- Criar: `src/main/nuvem/cardapio.ts`
- Teste: `src/main/nuvem/cardapio.test.ts`

**Interfaces:**
- Consome: `ItemCardapio` de `src/shared/eventos.ts`; `NoteComCampos` de `src/main/index/queries.ts`
- Produz: `montarCardapio(notas: NoteComCampos[]): ItemCardapio[]`

Esta é a tarefa mais importante do plano. O teste de vazamento é o que transforma "prometo que só isso sobe" em algo verificável.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// src/main/nuvem/cardapio.test.ts
import { describe, it, expect } from 'vitest'
import type { NoteComCampos } from '../index/queries'
import { montarCardapio } from './cardapio'

const nota = (p: Partial<NoteComCampos> & { path: string }): NoteComCampos => ({
  path: p.path, title: p.title ?? p.path, tipo: p.tipo ?? 'nota',
  project: null, status: null, created: null, updated: null, date: p.date ?? null,
  mtime: 0, size: 0, parseError: null, campos: p.campos ?? {}
})

describe('montarCardapio', () => {
  it('publica o treino com exercicios, series e reps', () => {
    const c = montarCardapio([nota({
      path: 'Saude/Treinos/Push A.md', title: 'Push A', tipo: 'treino-modelo',
      campos: { grupo: 'push', exercicios: [{ nome: 'Supino', series: 4, reps: '8-10' }] }
    })])
    expect(c).toEqual([{
      especie: 'treino', nome: 'Push A',
      detalhe: { grupo: 'push', exercicios: [{ nome: 'Supino', series: 4, reps: '8-10' }] }
    }])
  })

  it('NAO publica a carga — ela e historico, nao estrutura', () => {
    const c = montarCardapio([nota({
      path: 't.md', title: 'Push A', tipo: 'treino-modelo',
      campos: { exercicios: [{ nome: 'Supino', series: 4, reps: '8', carga: '60 kg' }] }
    })])
    expect(JSON.stringify(c)).not.toContain('60 kg')
    expect(JSON.stringify(c)).not.toContain('carga')
  })

  it('publica suplemento com dose, quando e dias', () => {
    const c = montarCardapio([nota({
      path: 's.md', title: 'Whey', tipo: 'suplemento',
      campos: { dose: '30 g', quando: 'pós-treino', dias: ['seg', 'qua'], estoque: 42 }
    })])
    expect(c[0]).toEqual({
      especie: 'suplemento', nome: 'Whey',
      detalhe: { dose: '30 g', quando: 'pós-treino', dias: ['seg', 'qua'] }
    })
  })

  it('publica so as refeicoes do plano ATIVO', () => {
    const ativo = nota({
      path: 'a.md', title: 'Cutting', tipo: 'plano',
      campos: { ativo: true, refeicoes: [{ nome: 'Café', hora: '07:00', itens: '2 ovos', kcal: 400, prot: 30 }] }
    })
    const inativo = nota({
      path: 'b.md', title: 'Bulking', tipo: 'plano',
      campos: { refeicoes: [{ nome: 'Ceia', kcal: 900 }] }
    })
    const c = montarCardapio([ativo, inativo])
    expect(c.filter(i => i.especie === 'refeicao').map(i => i.nome)).toEqual(['Café'])
  })

  it('ignora tipos que nao sao cardapio', () => {
    const c = montarCardapio([
      nota({ path: 'x.md', tipo: 'sessao', campos: { modelo: 'Push A' } }),
      nota({ path: 'y.md', tipo: 'diario', campos: { transacoes: [{ item: 'Almoço', valor: 32 }] } })
    ])
    expect(c).toEqual([])
  })

  it('NADA sensivel do vault aparece no que sobe', () => {
    const vault = [
      nota({ path: 'Vida/Contas/Netflix.md', title: 'Netflix', tipo: 'conta',
             campos: { usuario: 'pedro@mail', senha: 'SENHA-SECRETA-123' } }),
      nota({ path: 'Vida/Documentos/RG.md', title: 'RG', tipo: 'documento',
             campos: { numero: '99.999.999-9' } }),
      nota({ path: 'Diario/2026-08-27.md', tipo: 'diario', date: '2026-08-27',
             campos: { transacoes: [{ item: 'Almoço', valor: 32.5, cat: 'alimentacao' }] } }),
      nota({ path: 'Saude/Treinos/s.md', title: 'Push A — 2026-08-27', tipo: 'sessao',
             campos: { modelo: 'Push A', exercicios: [{ nome: 'Supino', carga: '60 kg' }] } }),
      nota({ path: 'Vida/n.md', title: 'Ideia', tipo: 'anotacao',
             campos: { texto: 'texto pessoal que nao pode vazar' } }),
      // e o que PODE subir, para o teste não passar por lista vazia
      nota({ path: 'Saude/Treinos/Push A.md', title: 'Push A', tipo: 'treino-modelo',
             campos: { grupo: 'push', exercicios: [{ nome: 'Supino', series: 4, reps: '8' }] } })
    ]
    const json = JSON.stringify(montarCardapio(vault))

    expect(json).toContain('Push A')          // o cardápio não veio vazio
    for (const proibido of [
      'SENHA-SECRETA-123', 'pedro@mail', '99.999.999-9',
      'Almoço', '32.5', '60 kg', 'texto pessoal'
    ]) {
      expect(json).not.toContain(proibido)
    }
  })

  it('nao quebra com nota malformada', () => {
    const c = montarCardapio([nota({
      path: 't.md', title: 'Sem nada', tipo: 'treino-modelo', campos: { exercicios: 'nao e lista' }
    })])
    expect(c).toEqual([{ especie: 'treino', nome: 'Sem nada', detalhe: { exercicios: [] } }])
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run src/main/nuvem/cardapio.test.ts`
Esperado: FAIL — módulo não existe.

- [ ] **Passo 3: implementar**

```ts
// src/main/nuvem/cardapio.ts
import type { ItemCardapio } from '../../shared/eventos'
import type { NoteComCampos } from '../index/queries'

/**
 * O que o Cortex publica — e nada além.
 *
 * Esta é a única função do app que envia dado do vault para fora. Ela é
 * escrita por LISTA BRANCA: cada espécie declara os campos que copia, um a
 * um. Nunca espalhe `...campos` aqui, e nunca copie um objeto inteiro vindo
 * do frontmatter: é assim que uma carga, um valor ou uma senha acabaria
 * subindo junto sem ninguém perceber.
 *
 * `cardapio.test.ts` monta um vault com senha, número de documento, valor de
 * gasto e carga, e falha se qualquer um deles aparecer no JSON publicado.
 */

const txt = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter(i => i && typeof i === 'object') as Record<string, unknown>[] : []

/** Só entra no detalhe o que tem valor — chave vazia polui a tela do celular. */
function comValor(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = v
  }
  return out
}

export function montarCardapio(notas: NoteComCampos[]): ItemCardapio[] {
  const out: ItemCardapio[] = []

  for (const n of notas.filter(x => x.tipo === 'treino-modelo')) {
    out.push({
      especie: 'treino',
      nome: n.title,
      detalhe: comValor({
        grupo: txt(n.campos.grupo),
        // Campo a campo: `series` e `reps` são estrutura, `carga` é histórico.
        exercicios: lista(n.campos.exercicios).map(e => comValor({
          nome: txt(e.nome),
          series: e.series,
          reps: txt(e.reps)
        }))
      })
    })
  }

  for (const n of notas.filter(x => x.tipo === 'suplemento')) {
    out.push({
      especie: 'suplemento',
      nome: n.title,
      detalhe: comValor({
        dose: txt(n.campos.dose),
        quando: txt(n.campos.quando),
        dias: Array.isArray(n.campos.dias) ? n.campos.dias : undefined
      })
    })
  }

  // Só o plano ativo: publicar todos os planos faria o celular perguntar qual
  // usar, e essa escolha já foi feita no Cortex.
  const ativo = notas.find(x => x.tipo === 'plano' && x.campos.ativo === true)
  for (const r of lista(ativo?.campos.refeicoes)) {
    const nome = txt(r.nome)
    if (!nome) continue
    out.push({
      especie: 'refeicao',
      nome,
      detalhe: comValor({ hora: txt(r.hora), itens: txt(r.itens), kcal: r.kcal, prot: r.prot })
    })
  }

  return out
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run src/main/nuvem/cardapio.test.ts`
Esperado: PASS, 7 testes. **Se o teste de vazamento falhar, não relaxe o teste — corrija a função.**

- [ ] **Passo 5: commitar**

```bash
git add src/main/nuvem/cardapio.ts src/main/nuvem/cardapio.test.ts
git commit -m "montarCardapio: a fronteira do que sobe, fechada por teste"
```

---

### Task 4: Evento vira operação no vault

**Arquivos:**
- Criar: `src/main/nuvem/planejar.ts`
- Teste: `src/main/nuvem/planejar.test.ts`

**Interfaces:**
- Consome: `Evento` de `src/shared/eventos.ts`
- Produz: `type Operacao`, `planejar(evento: Evento): Operacao[]`

- [ ] **Passo 1: escrever o teste que falha**

```ts
// src/main/nuvem/planejar.test.ts
import { describe, it, expect } from 'vitest'
import type { Evento } from '../../shared/eventos'
import { planejar } from './planejar'

const ev = (tipo: string, dados: Record<string, unknown>, dia = '2026-08-27'): Evento =>
  ({ tipo, dia, dados }) as Evento

describe('planejar', () => {
  it('suplemento entra no conjunto do diario do dia', () => {
    expect(planejar(ev('suplemento', { nome: 'Whey' }))).toEqual([
      { acao: 'diario-conjunto', dia: '2026-08-27', campo: 'suplementos_feitos', valor: 'Whey' }
    ])
  })

  it('refeicao do plano entra em dieta_feitas', () => {
    expect(planejar(ev('refeicao_plano', { nome: 'Café' }))).toEqual([
      { acao: 'diario-conjunto', dia: '2026-08-27', campo: 'dieta_feitas', valor: 'Café' }
    ])
  })

  it('refeicao extra entra na lista extras', () => {
    expect(planejar(ev('refeicao_extra', { item: 'Coxinha', kcal: 300 }))).toEqual([
      { acao: 'diario-lista', dia: '2026-08-27', campo: 'extras', item: { item: 'Coxinha', kcal: 300 } }
    ])
  })

  it('gasto entra em transacoes e assume saida quando nao dizem', () => {
    expect(planejar(ev('gasto', { item: 'Almoço', valor: 32, cat: 'alimentacao' }))).toEqual([
      { acao: 'diario-lista', dia: '2026-08-27', campo: 'transacoes',
        item: { dir: 'saida', item: 'Almoço', valor: 32, cat: 'alimentacao' } }
    ])
  })

  it('gasto respeita a direcao quando ela vem', () => {
    const [op] = planejar(ev('gasto', { item: 'Freela', valor: 500, dir: 'entrada' }))
    expect((op as { item: { dir: string } }).item.dir).toBe('entrada')
  })

  it('sessao cria uma nota de treino com o titulo previsivel', () => {
    expect(planejar(ev('sessao', {
      modelo: 'Push A', exercicios: [{ nome: 'Supino', carga: '60 kg' }]
    }))).toEqual([{
      acao: 'nota', tipo: 'sessao', path: 'Saude/Treinos/Push A — 2026-08-27.md',
      frontmatter: {
        tipo: 'sessao', date: '2026-08-27',
        exercicios: [{ nome: 'Supino', carga: '60 kg' }], modelo: 'Push A'
      }
    }])
  })

  it('cardio cria a nota do dia', () => {
    const [op] = planejar(ev('cardio', { aparelho: 'esteira', minutos: 30, pace: '5:45' }))
    expect(op).toEqual({
      acao: 'nota', tipo: 'cardio', path: 'Saude/Treinos/cardio-2026-08-27.md',
      frontmatter: { tipo: 'cardio', date: '2026-08-27', aparelho: 'esteira', minutos: 30, pace: '5:45' }
    })
  })

  it('peso e medida caem na MESMA nota do dia — o grafico de peso e um so', () => {
    const p = planejar(ev('peso', { peso: 78.4 }))
    const m = planejar(ev('medida', { peso: 78.4, cintura: 84 }))
    expect((p[0] as { path: string }).path).toBe('Saude/medida-2026-08-27.md')
    expect((m[0] as { path: string }).path).toBe('Saude/medida-2026-08-27.md')
    expect(p[0]).toMatchObject({ acao: 'nota-campos' })
  })

  it('anotacao vira nota com titulo tirado do texto', () => {
    const [op] = planejar(ev('anotacao', { texto: 'Comprar caderno novo para o cursinho' }))
    expect(op).toMatchObject({
      acao: 'nota', tipo: 'anotacao',
      frontmatter: { tipo: 'anotacao', texto: 'Comprar caderno novo para o cursinho' }
    })
    expect((op as { path: string }).path).toContain('Vida/')
  })

  it('tipo desconhecido nao gera operacao — Cortex velho + app novo nao quebra', () => {
    expect(planejar(ev('coisa-do-futuro', {}))).toEqual([])
  })

  it('suplemento sem nome nao vira operacao vazia', () => {
    expect(planejar(ev('suplemento', {}))).toEqual([])
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run src/main/nuvem/planejar.test.ts`
Esperado: FAIL — módulo não existe.

- [ ] **Passo 3: implementar**

```ts
// src/main/nuvem/planejar.ts
import type { Evento } from '../../shared/eventos'

/**
 * Traduz um evento vindo do celular nas mudanças que ele causa no vault.
 *
 * É puro de propósito: decidir "isto vira o quê" fica testável sem tocar em
 * disco, e o executor (`executar.ts`) fica fino demais para esconder defeito.
 */

export type Operacao =
  /** Acrescenta a um conjunto do diário (marcar suplemento, marcar refeição). */
  | { acao: 'diario-conjunto'; dia: string; campo: string; valor: string }
  /** Acrescenta a uma lista do diário (gasto, refeição extra). */
  | { acao: 'diario-lista'; dia: string; campo: string; item: Record<string, unknown> }
  /** Cria uma nota nova; se já existir, mescla o frontmatter. */
  | { acao: 'nota'; tipo: string; path: string; frontmatter: Record<string, unknown> }
  /** Cria a nota se faltar e mescla campos — usado por peso e medida. */
  | { acao: 'nota-campos'; tipo: string; path: string; campos: Record<string, unknown> }

/** Higieniza um título para virar nome de arquivo, igual ao renderer faz. */
const nomeArquivo = (s: string): string =>
  s.replace(/[/:*?"<>|\\]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)

const txt = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/** Copia só as chaves que têm valor — evita `pace: ""` sujando o frontmatter. */
function comValor(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = v
  }
  return out
}

export function planejar(evento: Evento): Operacao[] {
  const { tipo, dia, dados } = evento

  switch (tipo) {
    case 'suplemento': {
      const nome = txt(dados.nome)
      if (!nome) return []
      return [{ acao: 'diario-conjunto', dia, campo: 'suplementos_feitos', valor: nome }]
    }

    case 'refeicao_plano': {
      const nome = txt(dados.nome)
      if (!nome) return []
      return [{ acao: 'diario-conjunto', dia, campo: 'dieta_feitas', valor: nome }]
    }

    case 'refeicao_extra':
      return [{ acao: 'diario-lista', dia, campo: 'extras', item: comValor(dados) }]

    case 'gasto':
      // Sem direção declarada é saída: foi assim que a lista nasceu, e supor
      // entrada inflaria o saldo do mês por engano.
      return [{
        acao: 'diario-lista', dia, campo: 'transacoes',
        item: comValor({ dir: txt(dados.dir) === 'entrada' ? 'entrada' : 'saida', ...dados })
      }]

    case 'sessao': {
      const modelo = txt(dados.modelo) || 'Treino livre'
      return [{
        acao: 'nota', tipo: 'sessao',
        path: `Saude/Treinos/${nomeArquivo(`${modelo} — ${dia}`)}.md`,
        frontmatter: comValor({ tipo: 'sessao', date: dia, ...dados, modelo })
      }]
    }

    case 'cardio':
      return [{
        acao: 'nota', tipo: 'cardio',
        path: `Saude/Treinos/cardio-${dia}.md`,
        frontmatter: comValor({ tipo: 'cardio', date: dia, ...dados })
      }]

    // Peso e medida escrevem na mesma nota de propósito: o botão de peso é um
    // atalho, não um dado paralelo, e o gráfico de peso lê um lugar só.
    case 'peso':
    case 'medida':
      return [{
        acao: 'nota-campos', tipo: 'medida',
        path: `Saude/medida-${dia}.md`,
        campos: comValor({ tipo: 'medida', date: dia, ...dados })
      }]

    case 'anotacao': {
      const texto = txt(dados.texto).trim()
      if (!texto) return []
      const titulo = texto.split(/\r\n|\n/)[0].slice(0, 60)
      return [{
        acao: 'nota', tipo: 'anotacao',
        path: `Vida/${nomeArquivo(titulo)}.md`,
        frontmatter: { tipo: 'anotacao', date: dia, titulo, texto }
      }]
    }

    default:
      // Um app mais novo mandando um tipo que este Cortex não conhece não
      // pode derrubar a sincronização inteira. Ignora e segue.
      return []
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run src/main/nuvem/planejar.test.ts`
Esperado: PASS, 11 testes.

- [ ] **Passo 5: commitar**

```bash
git add src/main/nuvem/planejar.ts src/main/nuvem/planejar.test.ts
git commit -m "planejar: evento do celular vira operacao no vault, sem tocar disco"
```

---

### Task 5: Registro do que já foi aplicado

**Arquivos:**
- Criar: `src/main/nuvem/recebidos.ts`
- Teste: `src/main/nuvem/recebidos.test.ts`

**Interfaces:**
- Consome: nada
- Produz: `class Recebidos` com `carregar(): Promise<void>`, `jaAplicado(id: string): boolean`, `marcar(id: string): Promise<void>`, `podar(diasMax: number): Promise<number>`

- [ ] **Passo 1: escrever o teste que falha**

```ts
// src/main/nuvem/recebidos.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Recebidos } from './recebidos'

let dir: string, arq: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cortex-rec-'))
  arq = join(dir, 'recebidos.json')
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('Recebidos', () => {
  it('um id novo ainda nao foi aplicado', async () => {
    const r = new Recebidos(arq)
    await r.carregar()
    expect(r.jaAplicado('abc')).toBe(false)
  })

  it('depois de marcar, reconhece', async () => {
    const r = new Recebidos(arq)
    await r.carregar()
    await r.marcar('abc')
    expect(r.jaAplicado('abc')).toBe(true)
  })

  it('sobrevive a reabrir — e isto que impede o gasto duplicado', async () => {
    const r1 = new Recebidos(arq)
    await r1.carregar()
    await r1.marcar('abc')

    const r2 = new Recebidos(arq)
    await r2.carregar()
    expect(r2.jaAplicado('abc')).toBe(true)
  })

  it('arquivo corrompido nao impede sincronizar', async () => {
    await writeFile(arq, '{ isto nao e json', 'utf8')
    const r = new Recebidos(arq)
    await r.carregar()
    expect(r.jaAplicado('abc')).toBe(false)
    await r.marcar('abc')
    expect(r.jaAplicado('abc')).toBe(true)
  })

  it('poda ids mais velhos que o limite', async () => {
    const antigo = new Date(Date.now() - 100 * 86400000).toISOString()
    await writeFile(arq, JSON.stringify({ velho: antigo, novo: new Date().toISOString() }), 'utf8')
    const r = new Recebidos(arq)
    await r.carregar()
    expect(await r.podar(90)).toBe(1)
    expect(r.jaAplicado('velho')).toBe(false)
    expect(r.jaAplicado('novo')).toBe(true)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run src/main/nuvem/recebidos.test.ts`
Esperado: FAIL — módulo não existe.

- [ ] **Passo 3: implementar**

```ts
// src/main/nuvem/recebidos.ts
import { readFile, writeFile } from 'node:fs/promises'

/**
 * Quais eventos já viraram mudança no vault.
 *
 * Existe porque nem todo evento é idempotente: marcar o mesmo suplemento duas
 * vezes não muda nada (a lista é um conjunto), mas aplicar o mesmo gasto duas
 * vezes cobra duas vezes. E como o Cortex nunca escreve no banco — nem para
 * marcar como lido —, o controle tem que ser local.
 *
 * O arquivo é um mapa `id → data ISO em que foi aplicado`.
 */
export class Recebidos {
  private ids = new Map<string, string>()

  constructor(private readonly caminho: string) {}

  async carregar(): Promise<void> {
    try {
      const o = JSON.parse(await readFile(this.caminho, 'utf8')) as Record<string, unknown>
      this.ids = new Map(
        Object.entries(o).filter(([, v]) => typeof v === 'string') as [string, string][]
      )
    } catch {
      // Ausente ou corrompido: começa vazio. O custo é reaplicar eventos ainda
      // no banco — chato, mas melhor do que travar a sincronização para sempre.
      this.ids = new Map()
    }
  }

  jaAplicado(id: string): boolean {
    return this.ids.has(id)
  }

  async marcar(id: string): Promise<void> {
    this.ids.set(id, new Date().toISOString())
    await this.gravar()
  }

  /** Remove ids mais velhos que `diasMax`. Devolve quantos saíram. */
  async podar(diasMax: number): Promise<number> {
    const corte = Date.now() - diasMax * 86400000
    let removidos = 0
    for (const [id, quando] of this.ids) {
      const t = Date.parse(quando)
      if (Number.isNaN(t) || t < corte) { this.ids.delete(id); removidos++ }
    }
    if (removidos > 0) await this.gravar()
    return removidos
  }

  private async gravar(): Promise<void> {
    await writeFile(this.caminho, JSON.stringify(Object.fromEntries(this.ids), null, 2), 'utf8')
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run src/main/nuvem/recebidos.test.ts`
Esperado: PASS, 5 testes.

- [ ] **Passo 5: commitar**

```bash
git add src/main/nuvem/recebidos.ts src/main/nuvem/recebidos.test.ts
git commit -m "Recebidos: dedupe local, para um evento lido duas vezes nao virar dois gastos"
```

---

### Task 6: Cliente HTTP do Supabase

**Arquivos:**
- Criar: `src/main/nuvem/cliente.ts`
- Teste: `src/main/nuvem/cliente.test.ts`

**Interfaces:**
- Consome: `EVENTO_SCHEMA`, `Evento`, `ItemCardapio` de `src/shared/eventos.ts`
- Produz: `type EventoRemoto = Evento & { id: string; criadoEm: string }`; `class ClienteNuvem` com `listarEventos(desde: string): Promise<EventoRemoto[]>` e `publicarCardapio(itens: ItemCardapio[]): Promise<number>`

- [ ] **Passo 1: escrever o teste que falha**

O teste sobe um servidor HTTP de verdade em porta efêmera. Sem mock de `fetch`: um mock testaria o mock, e o que interessa aqui é o formato do que sai na rede.

```ts
// src/main/nuvem/cliente.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { ClienteNuvem } from './cliente'

let servidor: Server
let url: string
let recebido: { caminho: string; corpo: unknown; cabecalhos: Record<string, unknown> }[] = []
let responder: () => { status: number; corpo: unknown } = () => ({ status: 200, corpo: [] })

beforeEach(async () => {
  recebido = []
  servidor = createServer((req, res) => {
    let bruto = ''
    req.on('data', c => { bruto += c })
    req.on('end', () => {
      recebido.push({
        caminho: req.url ?? '',
        corpo: bruto ? JSON.parse(bruto) : null,
        cabecalhos: req.headers as Record<string, unknown>
      })
      const r = responder()
      res.writeHead(r.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(r.corpo))
    })
  })
  await new Promise<void>(ok => { servidor.listen(0, '127.0.0.1', ok) })
  const info = servidor.address() as { port: number }
  url = `http://127.0.0.1:${info.port}`
})
afterEach(async () => { await new Promise<void>(ok => { servidor.close(() => ok()) }) })

const cliente = (): ClienteNuvem =>
  new ClienteNuvem({ url, chave: 'chave-de-teste' }, '11111111-1111-4111-8111-111111111111')

describe('ClienteNuvem', () => {
  it('chama a funcao rpc certa e manda a chave nos cabecalhos', async () => {
    responder = () => ({ status: 200, corpo: [] })
    await cliente().listarEventos('2026-08-01T00:00:00Z')
    expect(recebido[0].caminho).toBe('/rest/v1/rpc/listar_eventos')
    expect(recebido[0].cabecalhos.apikey).toBe('chave-de-teste')
    expect(recebido[0].corpo).toEqual({
      p_vault: '11111111-1111-4111-8111-111111111111', p_desde: '2026-08-01T00:00:00Z'
    })
  })

  it('converte a resposta do banco para o formato do app', async () => {
    responder = () => ({
      status: 200,
      corpo: [{ id: 'e1', criado_em: '2026-08-27T10:00:00Z', dia: '2026-08-27',
                tipo: 'suplemento', dados: { nome: 'Whey' } }]
    })
    const [e] = await cliente().listarEventos('2026-08-01T00:00:00Z')
    expect(e).toEqual({
      id: 'e1', criadoEm: '2026-08-27T10:00:00Z', dia: '2026-08-27',
      tipo: 'suplemento', dados: { nome: 'Whey' }
    })
  })

  it('descarta evento invalido sem derrubar o resto', async () => {
    responder = () => ({
      status: 200,
      corpo: [
        { id: 'ruim', criado_em: 'x', dia: 'nao-e-data', tipo: 'suplemento', dados: {} },
        { id: 'bom', criado_em: 'x', dia: '2026-08-27', tipo: 'peso', dados: { peso: 78 } }
      ]
    })
    const es = await cliente().listarEventos('2026-08-01T00:00:00Z')
    expect(es.map(e => e.id)).toEqual(['bom'])
  })

  it('erro HTTP vira excecao com o texto do servidor', async () => {
    responder = () => ({ status: 401, corpo: { message: 'chave invalida' } })
    await expect(cliente().listarEventos('2026-08-01T00:00:00Z'))
      .rejects.toThrow(/401/)
  })

  it('publica o cardapio como uma chamada so', async () => {
    responder = () => ({ status: 200, corpo: 3 })
    const n = await cliente().publicarCardapio([
      { especie: 'treino', nome: 'Push A', detalhe: { grupo: 'push' } }
    ])
    expect(recebido[0].caminho).toBe('/rest/v1/rpc/publicar_cardapio')
    expect(recebido[0].corpo).toEqual({
      p_vault: '11111111-1111-4111-8111-111111111111',
      p_itens: [{ especie: 'treino', nome: 'Push A', detalhe: { grupo: 'push' } }]
    })
    expect(n).toBe(3)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run src/main/nuvem/cliente.test.ts`
Esperado: FAIL — módulo não existe.

- [ ] **Passo 3: implementar**

```ts
// src/main/nuvem/cliente.ts
import { EVENTO_SCHEMA, type Evento, type ItemCardapio } from '../../shared/eventos'

export type EventoRemoto = Evento & { id: string; criadoEm: string }

/**
 * Conversa com as funções RPC do Supabase.
 *
 * Usa `fetch` nativo do Node 22 — nenhuma biblioteca HTTP nova. Só chama
 * funções, nunca as tabelas: elas estão com RLS ligado e sem policy, e o
 * acesso passa por funções que exigem o id do vault.
 *
 * Note o que NÃO existe aqui: nenhum método que escreva em `eventos`. O
 * Cortex lê eventos e publica cardápio, e a ausência é intencional.
 */
export class ClienteNuvem {
  constructor(
    private readonly cred: { url: string; chave: string },
    private readonly vaultId: string
  ) {}

  private async rpc(funcao: string, corpo: Record<string, unknown>): Promise<unknown> {
    const r = await fetch(`${this.cred.url.replace(/\/$/, '')}/rest/v1/rpc/${funcao}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: this.cred.chave,
        authorization: `Bearer ${this.cred.chave}`
      },
      body: JSON.stringify(corpo)
    })
    const texto = await r.text()
    if (!r.ok) throw new Error(`nuvem respondeu ${r.status}: ${texto.slice(0, 200)}`)
    return texto ? JSON.parse(texto) : null
  }

  async listarEventos(desde: string): Promise<EventoRemoto[]> {
    const bruto = await this.rpc('listar_eventos', { p_vault: this.vaultId, p_desde: desde })
    if (!Array.isArray(bruto)) return []

    const out: EventoRemoto[] = []
    for (const linha of bruto as Record<string, unknown>[]) {
      // Uma linha malformada não derruba o lote: ela é descartada e as outras
      // seguem. O banco é entrada hostil como qualquer outra.
      const r = EVENTO_SCHEMA.safeParse({
        tipo: linha.tipo, dia: linha.dia, dados: linha.dados ?? {}
      })
      if (!r.success || typeof linha.id !== 'string') continue
      out.push({ ...r.data, id: linha.id, criadoEm: String(linha.criado_em ?? '') })
    }
    return out
  }

  async publicarCardapio(itens: ItemCardapio[]): Promise<number> {
    const n = await this.rpc('publicar_cardapio', { p_vault: this.vaultId, p_itens: itens })
    return typeof n === 'number' ? n : itens.length
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run src/main/nuvem/cliente.test.ts`
Esperado: PASS, 5 testes.

- [ ] **Passo 5: commitar**

```bash
git add src/main/nuvem/cliente.ts src/main/nuvem/cliente.test.ts
git commit -m "ClienteNuvem: RPC do Supabase com fetch nativo, sem biblioteca nova"
```

---

### Task 7: Executor e sincronizador

**Arquivos:**
- Criar: `src/main/nuvem/executar.ts`
- Criar: `src/main/nuvem/sincronizador.ts`
- Teste: `src/main/nuvem/sincronizador.test.ts`

**Interfaces:**
- Consome: `Operacao` e `planejar` (Task 4), `Recebidos` (Task 5), `EventoRemoto` e `ClienteNuvem` (Task 6), `montarCardapio` (Task 3); `Vault` de `src/main/vault/vault.ts`; `Indexer` de `src/main/index/indexer.ts`; `patchFrontmatter` e `appendToFrontmatterList` de `src/main/vault/patch.ts`; `parseFrontmatter` de `src/main/parser/frontmatter.ts`; `listNotesWithFields` de `src/main/index/queries.ts`; `Session` de `src/main/session.ts`
- Produz: `executar(vault: Vault, indexer: Indexer, ops: Operacao[]): Promise<void>`; `class Sincronizador` com `sincronizar(): Promise<{ aplicados: number; ignorados: number }>` e `publicar(): Promise<number>`

- [ ] **Passo 1: escrever o teste que falha**

```ts
// src/main/nuvem/sincronizador.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session } from '../session'
import { Sincronizador } from './sincronizador'
import type { ClienteNuvem, EventoRemoto } from './cliente'

let root: string, session: Session

/** Cliente de mentira: devolve o que o teste mandar, sem rede. */
class ClienteFalso {
  publicado: unknown[] = []
  constructor(public eventos: EventoRemoto[]) {}
  async listarEventos(): Promise<EventoRemoto[]> { return this.eventos }
  async publicarCardapio(itens: unknown[]): Promise<number> {
    this.publicado = itens
    return itens.length
  }
}

const ev = (id: string, tipo: string, dados: Record<string, unknown>): EventoRemoto =>
  ({ id, criadoEm: '2026-08-27T10:00:00Z', dia: '2026-08-27', tipo, dados }) as EventoRemoto

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cortex-sinc-'))
  session = new Session()
  await session.open(root)
})
afterEach(async () => { await session.close(); await rm(root, { recursive: true, force: true }) })

const sinc = (cliente: ClienteFalso): Sincronizador =>
  new Sincronizador(session, cliente as unknown as ClienteNuvem)

describe('Sincronizador', () => {
  it('aplica um suplemento no diario do dia', async () => {
    const r = await sinc(new ClienteFalso([ev('e1', 'suplemento', { nome: 'Whey' })])).sincronizar()
    expect(r.aplicados).toBe(1)

    const md = await session.vault.read('Diario/2026-08-27.md')
    expect(md).toContain('suplementos_feitos')
    expect(md).toContain('Whey')
  })

  it('nao duplica o mesmo evento em duas sincronizacoes', async () => {
    const cliente = new ClienteFalso([ev('e1', 'gasto', { item: 'Almoço', valor: 32 })])
    await sinc(cliente).sincronizar()
    const segunda = await sinc(cliente).sincronizar()

    expect(segunda.aplicados).toBe(0)
    expect(segunda.ignorados).toBe(1)

    const md = await session.vault.read('Diario/2026-08-27.md')
    expect(md.split('Almoço').length - 1).toBe(1)
  })

  it('marcar o mesmo suplemento duas vezes nao repete na lista', async () => {
    await sinc(new ClienteFalso([ev('e1', 'suplemento', { nome: 'Whey' })])).sincronizar()
    await sinc(new ClienteFalso([ev('e2', 'suplemento', { nome: 'Whey' })])).sincronizar()

    const md = await session.vault.read('Diario/2026-08-27.md')
    expect(md.split('Whey').length - 1).toBe(1)
  })

  it('cria a nota de treino e indexa', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'sessao', { modelo: 'Push A', exercicios: [{ nome: 'Supino', carga: '60 kg' }] })
    ])).sincronizar()

    expect(await session.vault.exists('Saude/Treinos/Push A — 2026-08-27.md')).toBe(true)
    const notas = session.db.prepare("SELECT path FROM notes WHERE tipo='sessao'").all()
    expect(notas).toHaveLength(1)
  })

  it('peso e medida do mesmo dia caem na mesma nota', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'peso', { peso: 78.4 }),
      ev('e2', 'medida', { cintura: 84 })
    ])).sincronizar()

    const md = await session.vault.read('Saude/medida-2026-08-27.md')
    expect(md).toContain('78.4')
    expect(md).toContain('84')
  })

  it('evento de tipo desconhecido e ignorado, sem quebrar os outros', async () => {
    const r = await sinc(new ClienteFalso([
      ev('e1', 'coisa-do-futuro', {}),
      ev('e2', 'suplemento', { nome: 'Creatina' })
    ])).sincronizar()

    expect(r.aplicados).toBe(1)
    expect(r.ignorados).toBe(1)
    expect(await session.vault.read('Diario/2026-08-27.md')).toContain('Creatina')
  })

  it('publicar manda so o cardapio, sem a carga', async () => {
    await session.vault.writeAtomic('Saude/Treinos/Push A.md',
      '---\ntipo: treino-modelo\nexercicios: [{"nome":"Supino","series":4,"carga":"60 kg"}]\n---\n')
    await session.indexer.syncAll()

    const cliente = new ClienteFalso([])
    await sinc(cliente).publicar()

    expect(JSON.stringify(cliente.publicado)).toContain('Push A')
    expect(JSON.stringify(cliente.publicado)).not.toContain('60 kg')
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run src/main/nuvem/sincronizador.test.ts`
Esperado: FAIL — módulos não existem.

- [ ] **Passo 3: implementar o executor**

```ts
// src/main/nuvem/executar.ts
import type { Vault } from '../vault/vault'
import type { Indexer } from '../index/indexer'
import { patchFrontmatter, appendToFrontmatterList } from '../vault/patch'
import { parseFrontmatter } from '../parser/frontmatter'
import type { Operacao } from './planejar'

/**
 * Aplica as operações no vault.
 *
 * Fino de propósito: toda a decisão está em `planejar`, e aqui só há escrita.
 * Usa exatamente os mesmos utilitários que os formulários da interface usam —
 * nenhum caminho novo de escrita entra no projeto por causa da nuvem.
 */

const cabecalhoDiario = (dia: string): string =>
  `---\ntipo: diario\ndate: ${dia}\n---\n\n## Como foi o dia\n`

async function garantir(vault: Vault, path: string, inicial: string): Promise<void> {
  if (!(await vault.exists(path))) await vault.writeAtomic(path, inicial)
}

function comoLista(v: unknown): string[] {
  return Array.isArray(v) ? v.map(x => String(x)) : []
}

export async function executar(
  vault: Vault, indexer: Indexer, ops: Operacao[]
): Promise<void> {
  for (const op of ops) {
    switch (op.acao) {
      case 'diario-conjunto': {
        const path = `Diario/${op.dia}.md`
        await garantir(vault, path, cabecalhoDiario(op.dia))
        const raw = await vault.read(path)
        // Conjunto, não lista: marcar o mesmo suplemento de novo não repete.
        const atual = comoLista(parseFrontmatter(raw).frontmatter[op.campo])
        if (atual.includes(op.valor)) break
        await vault.writeAtomic(path, patchFrontmatter(raw, { [op.campo]: [...atual, op.valor] }))
        await indexer.indexFile(path)
        break
      }

      case 'diario-lista': {
        const path = `Diario/${op.dia}.md`
        await garantir(vault, path, cabecalhoDiario(op.dia))
        const raw = await vault.read(path)
        await vault.writeAtomic(path, appendToFrontmatterList(raw, op.campo, op.item).raw)
        await indexer.indexFile(path)
        break
      }

      case 'nota': {
        // Já existir não é erro: dois cardios no mesmo dia caem no mesmo
        // caminho, e o segundo mescla em vez de estourar.
        if (await vault.exists(op.path)) {
          const raw = await vault.read(op.path)
          await vault.writeAtomic(op.path, patchFrontmatter(raw, op.frontmatter))
        } else {
          const linhas = Object.entries(op.frontmatter).map(([k, v]) =>
            `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
          await vault.writeAtomic(op.path,
            `---\n${linhas.join('\n')}\n---\n\n### 🕸️ Dependências da Rede\n-\n\n`)
        }
        await indexer.indexFile(op.path)
        break
      }

      case 'nota-campos': {
        await garantir(vault, op.path,
          `---\ntipo: ${op.tipo}\n---\n\n### 🕸️ Dependências da Rede\n-\n\n`)
        const raw = await vault.read(op.path)
        await vault.writeAtomic(op.path, patchFrontmatter(raw, op.campos))
        await indexer.indexFile(op.path)
        break
      }
    }
  }
}
```

- [ ] **Passo 4: implementar o sincronizador**

```ts
// src/main/nuvem/sincronizador.ts
import { join } from 'node:path'
import type { Session } from '../session'
import { listNotesWithFields } from '../index/queries'
import { montarCardapio } from './cardapio'
import { planejar } from './planejar'
import { executar } from './executar'
import { Recebidos } from './recebidos'
import type { ClienteNuvem } from './cliente'

/** De quanto tempo para trás buscar. O banco só guarda 90 dias mesmo. */
const JANELA_DIAS = 30
const RETENCAO_DIAS = 90

/**
 * Junta as peças: puxa do banco, descarta o que já foi aplicado, planeja,
 * executa e registra.
 *
 * Repare que não existe caminho daqui para escrever em `eventos`. O que já
 * foi processado mora em `.vault/recebidos.json`, no disco do usuário.
 */
export class Sincronizador {
  private readonly recebidos: Recebidos

  constructor(
    private readonly session: Session,
    private readonly cliente: ClienteNuvem
  ) {
    this.recebidos = new Recebidos(join(session.vault.root, '.vault', 'recebidos.json'))
  }

  async sincronizar(): Promise<{ aplicados: number; ignorados: number }> {
    await this.recebidos.carregar()
    const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString()
    const eventos = await this.cliente.listarEventos(desde)

    let aplicados = 0
    let ignorados = 0
    for (const e of eventos) {
      if (this.recebidos.jaAplicado(e.id)) { ignorados++; continue }
      const ops = planejar(e)
      if (ops.length === 0) {
        // Tipo desconhecido ou dado vazio: marca como visto para não voltar
        // toda rodada, mas conta como ignorado.
        await this.recebidos.marcar(e.id)
        ignorados++
        continue
      }
      await executar(this.session.vault, this.session.indexer, ops)
      // Marca só DEPOIS de aplicar: se a escrita falhar, o evento volta na
      // próxima rodada em vez de sumir.
      await this.recebidos.marcar(e.id)
      aplicados++
    }

    await this.recebidos.podar(RETENCAO_DIAS)
    return { aplicados, ignorados }
  }

  async publicar(): Promise<number> {
    const notas = listNotesWithFields(this.session.db, {})
    return this.cliente.publicarCardapio(montarCardapio(notas))
  }
}
```

- [ ] **Passo 5: rodar e ver passar**

Rodar: `npx vitest run src/main/nuvem && npx tsc --noEmit`
Esperado: PASS, 7 testes do sincronizador e todos os anteriores.

- [ ] **Passo 6: commitar**

```bash
git add src/main/nuvem/executar.ts src/main/nuvem/sincronizador.ts src/main/nuvem/sincronizador.test.ts
git commit -m "Sincronizador: puxa, aplica no vault e publica o cardapio"
```

---

### Task 8: SQL do Supabase

**Arquivos:**
- Criar: `supabase/schema.sql`
- Criar: `supabase/README.md`

Não há teste automatizado aqui — as funções vivem no Postgres do Supabase. A validação é o roteiro manual do passo 3, feito uma vez.

- [ ] **Passo 1: escrever o schema**

```sql
-- supabase/schema.sql
-- Captura rápida do Cortex. Rodar uma vez no SQL Editor do painel do Supabase.
--
-- Modelo de segurança: as duas tabelas ficam com RLS ligado e SEM policy
-- nenhuma, o que nega acesso direto a todo mundo, inclusive à chave anon.
-- Tudo passa pelas funções abaixo, que são SECURITY DEFINER e exigem o id do
-- vault. Sem o id, o banco não devolve uma linha.

create table if not exists eventos (
  id        uuid primary key default gen_random_uuid(),
  vault_id  uuid not null,
  criado_em timestamptz not null default now(),
  dia       date not null,
  tipo      text not null,
  dados     jsonb not null default '{}'::jsonb
);
create index if not exists eventos_busca on eventos (vault_id, criado_em);

create table if not exists cardapio (
  vault_id      uuid not null,
  especie       text not null,
  nome          text not null,
  detalhe       jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (vault_id, especie, nome)
);

alter table eventos  enable row level security;
alter table cardapio enable row level security;

-- Os tipos que o Cortex sabe aplicar. Um tipo fora desta lista é recusado no
-- INSERT: melhor falhar no celular, onde a pessoa vê, do que acumular lixo
-- que o Cortex vai ignorar em silêncio para sempre.
create or replace function tipos_validos() returns text[]
language sql immutable as $$
  select array['suplemento','refeicao_plano','refeicao_extra','gasto',
               'sessao','cardio','medida','peso','anotacao']
$$;

create or replace function registrar_evento(
  p_vault uuid, p_dia date, p_tipo text, p_dados jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare novo uuid;
begin
  if not (p_tipo = any(tipos_validos())) then
    raise exception 'tipo desconhecido: %', p_tipo;
  end if;
  if length(p_dados::text) > 8192 then
    raise exception 'dados grandes demais (max. 8 KB)';
  end if;
  -- Teto por vault. Não detém um atacante decidido; detém um laço com defeito
  -- no app enchendo o banco de graça.
  if (select count(*) from eventos
      where vault_id = p_vault and criado_em > now() - interval '1 hour') >= 500 then
    raise exception 'limite de eventos por hora atingido';
  end if;

  insert into eventos (vault_id, dia, tipo, dados)
  values (p_vault, p_dia, p_tipo, coalesce(p_dados, '{}'::jsonb))
  returning id into novo;
  return novo;
end $$;

create or replace function listar_eventos(p_vault uuid, p_desde timestamptz)
returns setof eventos
language sql security definer set search_path = public as $$
  select * from eventos
  where vault_id = p_vault and criado_em > p_desde
  order by criado_em
$$;

create or replace function publicar_cardapio(p_vault uuid, p_itens jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  -- Substitui o cardápio inteiro do vault: um treino apagado no Cortex tem
  -- que sumir do celular, e mesclar deixaria fantasmas para sempre.
  delete from cardapio where vault_id = p_vault;
  insert into cardapio (vault_id, especie, nome, detalhe)
  select p_vault, i->>'especie', i->>'nome', coalesce(i->'detalhe', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) i
  where i->>'especie' in ('treino','suplemento','refeicao')
    and coalesce(i->>'nome','') <> '';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function listar_cardapio(p_vault uuid)
returns setof cardapio
language sql security definer set search_path = public as $$
  select * from cardapio where vault_id = p_vault order by especie, nome
$$;

-- Retenção: o vault já é a verdade depois de 90 dias; o banco é caixa de
-- passagem. Agende no painel (Database > Cron) para rodar uma vez por dia.
create or replace function limpar_antigos() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from eventos where criado_em < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function registrar_evento(uuid, date, text, jsonb) to anon;
grant execute on function listar_eventos(uuid, timestamptz)        to anon;
grant execute on function publicar_cardapio(uuid, jsonb)           to anon;
grant execute on function listar_cardapio(uuid)                    to anon;
```

- [ ] **Passo 2: escrever o README**

```markdown
<!-- supabase/README.md -->
# Banco da captura rápida

## Instalar

1. Criar um projeto em [supabase.com](https://supabase.com) (plano grátis).
2. Abrir **SQL Editor**, colar `schema.sql` inteiro e executar.
3. Em **Settings > API**, copiar a **Project URL** e a chave **anon public**.
4. No Cortex, aba **Nuvem** das configurações, colar as duas.
5. Em **Database > Cron**, agendar `select limpar_antigos();` uma vez por dia.

## Por que a chave anon pode ser pública

Ela não dá acesso a nada sozinha. As tabelas estão com RLS ligado e sem
policy: nem leitura nem escrita direta são permitidas a ninguém. Todo acesso
passa pelas funções, que exigem o id do vault — e esse id nasce offline no
Cortex e nunca é publicado.

Quem tiver a chave e não tiver o id não lê nem escreve nada.
```

- [ ] **Passo 3: validar manualmente**

Depois de rodar o schema, no SQL Editor:

```sql
-- 1. registrar e ler de volta
select registrar_evento('11111111-1111-4111-8111-111111111111', current_date,
                        'suplemento', '{"nome":"Whey"}'::jsonb);
select count(*) from listar_eventos('11111111-1111-4111-8111-111111111111',
                                    now() - interval '1 day');
-- esperado: 1

-- 2. id diferente não enxerga nada
select count(*) from listar_eventos('22222222-2222-4222-8222-222222222222',
                                    now() - interval '1 day');
-- esperado: 0

-- 3. tipo inválido é recusado
select registrar_evento('11111111-1111-4111-8111-111111111111', current_date,
                        'invento', '{}'::jsonb);
-- esperado: erro "tipo desconhecido: invento"
```

- [ ] **Passo 4: commitar**

```bash
git add supabase/schema.sql supabase/README.md
git commit -m "Schema do Supabase: tabelas fechadas por RLS, acesso so por funcao com o id do vault"
```

---

### Task 9: Canais IPC e a aba Nuvem

**Arquivos:**
- Modificar: `src/shared/ipc.ts`
- Modificar: `src/main/ipc/handlers.ts`
- Criar: `src/renderer/components/Nuvem.tsx`
- Modificar: `src/renderer/App.tsx`
- Teste: `src/main/ipc/handlers.test.ts` (acrescentar)

**Interfaces:**
- Consome: `Sincronizador` e `ClienteNuvem` (Tasks 6 e 7); `novoVaultId` (Task 2)
- Produz: canais `nuvem:estado`, `nuvem:credenciais`, `nuvem:novo-id`, `nuvem:sincronizar`, `nuvem:publicar`

- [ ] **Passo 1: escrever o teste que falha**

```ts
// acrescentar ao fim de src/main/ipc/handlers.test.ts
describe('canais da nuvem', () => {
  it('estado devolve o id do vault e diz que nao ha credencial', async () => {
    const e = await handle(session, 'nuvem:estado', {}) as
      { vaultId: string; configurada: boolean }
    expect(e.vaultId).toMatch(/^[0-9a-f]{8}-/)
    expect(e.configurada).toBe(false)
  })

  it('guarda as credenciais', async () => {
    const e = await handle(session, 'nuvem:credenciais', {
      url: 'https://x.supabase.co', chave: 'chave-longa-o-suficiente'
    }) as { configurada: boolean }
    expect(e.configurada).toBe(true)
    expect(session.config.nuvem?.url).toBe('https://x.supabase.co')
  })

  it('gerar id novo troca o id', async () => {
    const antes = session.config.vaultId
    const e = await handle(session, 'nuvem:novo-id', {}) as { vaultId: string }
    expect(e.vaultId).not.toBe(antes)
    expect(session.config.vaultId).toBe(e.vaultId)
  })

  it('sincronizar sem credencial falha com mensagem clara, nao com stack', async () => {
    await expect(handle(session, 'nuvem:sincronizar', {}))
      .rejects.toThrow(/nuvem não configurada/)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run src/main/ipc/handlers.test.ts`
Esperado: FAIL — canais desconhecidos.

- [ ] **Passo 3: acrescentar os canais ao schema**

Em `src/shared/ipc.ts`, dentro de `IPC_SCHEMAS`:

```ts
  'nuvem:estado': z.object({}).strict(),
  'nuvem:credenciais': z.object({
    url: z.string().url().max(500),
    chave: z.string().min(10).max(2000)
  }).strict(),
  'nuvem:novo-id': z.object({}).strict(),
  'nuvem:sincronizar': z.object({}).strict(),
  'nuvem:publicar': z.object({}).strict(),
```

- [ ] **Passo 4: implementar os handlers**

No topo de `src/main/ipc/handlers.ts`:

```ts
import { novoVaultId } from '../config'
import { ClienteNuvem } from '../nuvem/cliente'
import { Sincronizador } from '../nuvem/sincronizador'

/** Monta o sincronizador na hora. Sem credencial, falha com mensagem legível. */
function sincronizadorDe(session: Session): Sincronizador {
  const cred = session.config.nuvem
  if (!cred) throw new Error('nuvem não configurada — cole a URL e a chave na aba Nuvem')
  return new Sincronizador(session, new ClienteNuvem(cred, session.config.vaultId))
}
```

Os `case` novos, antes do `default`:

```ts
    case 'nuvem:estado':
      return {
        vaultId: session.config.vaultId,
        configurada: session.config.nuvem !== null,
        url: session.config.nuvem?.url ?? null
      }

    case 'nuvem:credenciais': {
      const c = await session.salvarConfig({ nuvem: { url: p.url, chave: p.chave } })
      return { configurada: c.nuvem !== null, url: c.nuvem?.url ?? null }
    }

    case 'nuvem:novo-id': {
      // Trocar o id é o que revoga um celular cujo id vazou. Nada é apagado:
      // os eventos antigos simplesmente deixam de ser buscados.
      const c = await session.salvarConfig({ vaultId: novoVaultId() })
      return { vaultId: c.vaultId }
    }

    case 'nuvem:sincronizar':
      return sincronizadorDe(session).sincronizar()

    case 'nuvem:publicar':
      return { itens: await sincronizadorDe(session).publicar() }
```

**Atenção:** `normalizarConfig` (Task 2) recusa `vaultId` que não seja UUID. `novoVaultId()` gera UUID válido, então a troca sobrevive à normalização — o teste do passo 1 confirma.

- [ ] **Passo 5: rodar e ver passar**

Rodar: `npx vitest run && npx tsc --noEmit`
Esperado: PASS.

- [ ] **Passo 6: criar a aba Nuvem**

```tsx
// src/renderer/components/Nuvem.tsx
import { useEffect, useState } from 'react'

/**
 * Configuração da captura rápida.
 *
 * O id do vault aparece copiável porque é ele que se cola no celular. O botão
 * de gerar um novo existe para o dia em que ele vazar num print — e o aviso
 * diz o que acontece, para ninguém clicar sem saber.
 */
type Estado = { vaultId: string; configurada: boolean; url: string | null }

export function Nuvem({ aoFechar }: { aoFechar: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [url, setUrl] = useState('')
  const [chave, setChave] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = async (): Promise<void> => {
    const e = await window.vaultApi.invoke('nuvem:estado', {}) as Estado
    setEstado(e)
    setUrl(e.url ?? '')
  }
  useEffect(() => { void carregar() }, [])

  const fazer = async (o: () => Promise<string>): Promise<void> => {
    setOcupado(true)
    try {
      setAviso(await o())
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
      void carregar()
    }
  }

  if (!estado) return null

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="form largo" onClick={e => e.stopPropagation()}>
        <div className="form-topo">Nuvem — captura rápida</div>

        <div className="form-corpo">
          <label className="form-campo">
            <span className="form-rotulo">ID deste vault</span>
            <span className="form-senha">
              <input readOnly value={estado.vaultId} onFocus={e => e.currentTarget.select()} />
              <button className="btn-fantasma"
                onClick={() => void navigator.clipboard.writeText(estado.vaultId)}>
                copiar
              </button>
            </span>
            <span className="form-dica">
              Cole no app do celular. Qualquer aparelho com este ID envia para cá —
              e quem vir o ID também consegue. Se vazar, gere um novo.
            </span>
          </label>

          <div className="form-linha">
            <label className="form-campo">
              <span className="form-rotulo">URL do projeto Supabase</span>
              <input value={url} placeholder="https://xxx.supabase.co"
                onChange={e => setUrl(e.target.value)} />
            </label>
            <label className="form-campo">
              <span className="form-rotulo">Chave anon</span>
              <input value={chave} placeholder={estado.configurada ? '(guardada)' : ''}
                onChange={e => setChave(e.target.value)} />
            </label>
          </div>

          {aviso && <div className="aviso">{aviso}</div>}
        </div>

        <div className="form-rodape">
          <button className="btn-fantasma" disabled={ocupado} onClick={() => void fazer(async () => {
            const r = await window.vaultApi.invoke('nuvem:novo-id', {}) as { vaultId: string }
            return `ID novo gerado. Os celulares com o ID antigo pararam de entregar: cole ${r.vaultId.slice(0, 8)}… neles.`
          })}>Gerar ID novo</button>

          <button className="btn-fantasma" disabled={ocupado} onClick={() => void fazer(async () => {
            const r = await window.vaultApi.invoke('nuvem:publicar', {}) as { itens: number }
            return `${r.itens} itens do cardápio publicados.`
          })}>Publicar cardápio</button>

          <button className="btn-fantasma" disabled={ocupado} onClick={() => void fazer(async () => {
            const r = await window.vaultApi.invoke('nuvem:sincronizar', {}) as
              { aplicados: number; ignorados: number }
            return `${r.aplicados} registros novos, ${r.ignorados} já aplicados antes.`
          })}>Sincronizar agora</button>

          <button className="btn" disabled={ocupado || !url || (!chave && !estado.configurada)}
            onClick={() => void fazer(async () => {
              await window.vaultApi.invoke('nuvem:credenciais', { url, chave })
              setChave('')
              return 'Credenciais salvas.'
            })}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Passo 7: ligar no App**

Em `src/renderer/App.tsx`:

1. `import { Nuvem } from './components/Nuvem'`
2. `const [nuvem, setNuvem] = useState(false)`
3. No rodapé do rail, ao lado do botão de Áreas, um botão com `title="Nuvem"` que chama `setNuvem(true)`
4. Antes do fechamento do fragmento: `{nuvem && <Nuvem aoFechar={() => setNuvem(false)} />}`
5. O efeito de sincronização automática:

```tsx
  // Puxa ao abrir o vault e a cada 2 minutos. Falha de rede é silenciosa: a
  // próxima rodada resolve, e um aviso a cada perda de sinal seria ruído.
  useEffect(() => {
    if (!v.root) return
    const puxar = (): void => {
      void window.vaultApi.invoke('nuvem:sincronizar', {}).catch(() => {})
    }
    puxar()
    const t = setInterval(puxar, 120000)
    return () => clearInterval(t)
  }, [v.root])
```

- [ ] **Passo 8: publicar o cardápio sozinho quando ele muda**

A spec (§7.4) pede que mexer num treino, suplemento ou no plano ativo
republique sem o usuário ter que lembrar do botão. Ainda em `App.tsx`:

```tsx
  // Republica o cardápio quando a estrutura muda — criar um treino no Cortex
  // tem que fazer ele aparecer no celular sem ninguém apertar nada.
  //
  // A espera de 5 segundos existe porque `v.notas` muda a cada gravação do
  // watcher: digitar o nome de um treino dispararia uma publicação por tecla.
  // E a assinatura evita republicar quando mudou outra coisa qualquer do
  // vault — um gasto lançado não mexe no cardápio.
  const assinaturaCardapio = v.notas
    .filter(n => n.tipo === 'treino-modelo' || n.tipo === 'suplemento' || n.tipo === 'plano')
    .map(n => `${n.path}:${n.mtime}`)
    .join('|')

  useEffect(() => {
    if (!v.root || !assinaturaCardapio) return
    const t = setTimeout(() => {
      void window.vaultApi.invoke('nuvem:publicar', {}).catch(() => {})
    }, 5000)
    return () => clearTimeout(t)
  }, [v.root, assinaturaCardapio])
```

- [ ] **Passo 9: rodar tudo e conferir na tela**

Rodar: `npx vitest run && npx tsc --noEmit && npm run dev`
Conferir: a aba Nuvem abre, mostra um ID, o botão copiar funciona, e "Sincronizar agora" sem credencial mostra a mensagem legível em vez de um erro cru.

- [ ] **Passo 10: commitar**

```bash
git add -A
git commit -m "Aba Nuvem: id do vault, credenciais, sincronizar e publicar cardapio"
```

---

## Depois deste plano

O Cortex fala com o banco e o banco está de pé. O que falta é o app do celular
— plano 2, em `web/`: telas de captura, fila offline e PWA. Ele consome
`src/shared/eventos.ts` (Task 1) e as funções `registrar_evento` e
`listar_cardapio` (Task 8), que já existirão.

Para exercitar a cadeia inteira antes do app existir, dá para inserir um
evento pelo SQL Editor (roteiro da Task 8, passo 3) e clicar em **Sincronizar
agora** no Cortex: o registro tem que aparecer no vault.
