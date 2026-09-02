import { z } from 'zod'

/**
 * Barra invertida, montada por código de caractere.
 *
 * É o separador de caminho do Windows e é proibida em qualquer caminho que o
 * renderer envie: o vault fala POSIX, e aceitar os dois separadores abriria
 * duas gramáticas de caminho para o mesmo guarda validar.
 */
const BARRA_INVERTIDA = String.fromCharCode(92)

/** Caminho de nota: POSIX, dentro do vault, terminando em `.md`. */
const caminho = z.string().min(1).max(1024)
  .refine(p => !p.includes(BARRA_INVERTIDA), { message: 'caminho deve usar apenas "/" (POSIX)' })
  .refine(p => p.toLowerCase().endsWith('.md'), { message: 'caminho deve terminar em .md' })
  .refine(p => p.split('/').every(seg => !seg.startsWith('.')), {
    message: 'caminho não pode conter segmentos que comecem com "." (ex.: .vault, ou ".." usado para escapar da raiz)'
  })

/**
 * Caminho de pasta dentro do vault. Mesmas regras do caminho de nota menos a
 * extensão — e a mesma recusa a segmentos com ponto, que é o que impede
 * `..` de escapar da raiz e `.vault` de ser mexido pelo renderer.
 */
const pastaVault = z.string().min(1).max(1024)
  .refine(p => !p.includes(BARRA_INVERTIDA), { message: 'pasta deve usar apenas "/" (POSIX)' })
  .refine(p => p.split('/').every(seg => seg.length > 0 && !seg.startsWith('.')), {
    message: 'pasta não pode ter segmentos vazios nem começar com "."'
  })

/**
 * Raiz de pasta de código da lente Dev — caminho ABSOLUTO do sistema.
 *
 * Aqui o renderer nomeia um caminho absoluto, coisa que ele nunca faz para o
 * vault. A validação de formato não é o guarda de segurança: o guarda é
 * `PastasDev.resolver`, que só aceita raízes presentes em `config.pastasDev`,
 * lista que cresce exclusivamente por diálogo nativo no processo principal.
 */
const raizDev = z.string().min(1).max(4096)

/** Caminho relativo dentro de uma raiz Dev, em POSIX. Vazio = a própria raiz. */
const relDev = z.string().max(4096)
  .refine(p => !p.includes(BARRA_INVERTIDA), { message: 'use "/" para separar' })
  .refine(p => !p.split('/').includes('..'), { message: 'caminho não pode subir de nível' })

export const IPC_SCHEMAS = {
  'note:read': z.object({ path: caminho }).strict(),
  'note:write': z.object({ path: caminho, content: z.string().max(5_000_000) }).strict(),
  'note:list': z.object({
    tipo: z.string().max(64).optional(),
    project: z.string().max(200).optional()
  }).strict(),
  'note:list-fields': z.object({
    tipo: z.string().max(64).optional(),
    project: z.string().max(200).optional(),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  }).strict(),
  'note:create': z.object({
    path: caminho,
    content: z.string().max(5_000_000)
  }).strict(),
  // O app passa a escrever frontmatter quando edita por formulário — ação
  // explícita, nunca automática (emenda à constraint original "o app nunca
  // reescreve frontmatter que o autor digitou"). Estes canais são essa ação
  // explícita; nada mais no app pode usá-los por conta própria.
  'note:patch': z.object({
    path: caminho,
    campos: z.record(z.string().max(64), z.unknown())
  }).strict(),
  'note:append': z.object({
    path: caminho,
    campo: z.string().max(64),
    item: z.record(z.string().max(64), z.unknown())
  }).strict(),
  'note:ensure': z.object({
    path: caminho,
    conteudoInicial: z.string().max(5_000_000)
  }).strict(),
  'note:delete': z.object({ path: caminho }).strict(),
  'note:move': z.object({ de: caminho, para: caminho }).strict(),

  'folder:list': z.object({}).strict(),
  'folder:create': z.object({ pasta: pastaVault }).strict(),

  'config:get': z.object({}).strict(),
  'config:areas': z.object({ areas: z.array(z.string().max(32)).max(32) }).strict(),

  // A senha dos painéis. O teto de 256 existe porque scrypt custa tempo
  // proporcional ao que recebe, e o renderer é entrada hostil: sem limite,
  // uma senha de megabytes travaria o processo principal.
  'senha:definir': z.object({
    atual: z.string().max(256).nullable(),
    nova: z.string().max(256),
    // A frase de lembrete. Teto menor que o da senha porque ela é MOSTRADA:
    // um texto de 256 caracteres viraria um parágrafo dentro do cadeado.
    dica: z.string().max(200)
  }).strict(),
  /*
   * Reconstrói o índice a partir dos arquivos que estão no disco.
   *
   * Existe porque a varredura só acontecia ao ABRIR o vault: quem apontasse o
   * Cortex para uma pasta e acrescentasse notas por fora — copiando de outro
   * cofre, restaurando um backup, sincronizando por outro programa — via a
   * tela vazia até fechar e abrir o app, sem nada dizendo por quê. E não
   * havia como forçar.
   *
   * Sem payload: reconstruir é sobre o vault aberto, e deixar o renderer
   * nomear um caminho aqui seria dar a ele o que o confinamento nega.
   */
  'indice:reconstruir': z.object({}).strict(),
  'senha:conferir': z.object({ senha: z.string().max(256) }).strict(),
  'senha:remover': z.object({ atual: z.string().max(256) }).strict(),
  'senha:paineis': z.object({
    atual: z.string().max(256),
    paineis: z.array(z.string().max(32)).max(32)
  }).strict(),

  'dev:folders': z.object({}).strict(),
  'dev:remove-folder': z.object({ raiz: raizDev }).strict(),
  'dev:tree': z.object({ raiz: raizDev, sub: relDev.default('') }).strict(),
  'dev:read': z.object({ raiz: raizDev, arquivo: relDev.min(1) }).strict(),
  'dev:write': z.object({
    raiz: raizDev,
    arquivo: relDev.min(1),
    conteudo: z.string().max(5_000_000)
  }).strict(),

  'search:fulltext': z.object({
    q: z.string().min(1).max(200),
    limit: z.number().int().positive().max(200).default(50)
  }).strict(),
  'links:backlinks': z.object({ path: caminho }).strict(),
  'links:outlinks': z.object({ path: caminho }).strict(),
  'links:broken': z.object({}).strict(),

  // Canais da captura rápida: id do vault, credenciais do Supabase, puxar
  // eventos e publicar o cardápio. Ver `Sincronizador`/`ClienteNuvem`.
  'nuvem:estado': z.object({}).strict(),
  'nuvem:credenciais': z.object({
    // Só https: esta URL alimenta `fetch` no processo principal, e um
    // `http://` mandaria a chave do Supabase em texto puro nos cabeçalhos da
    // rede — basta alguém colar o endereço errado, sem precisar de ataque
    // nenhum de fora.
    url: z.string().url().max(500)
      .refine(u => u.toLowerCase().startsWith('https://'), {
        message: 'url deve começar com https:// — http:// mandaria a chave do Supabase sem criptografia'
      }),
    chave: z.string().min(10).max(2000)
  }).strict(),
  'nuvem:novo-id': z.object({}).strict(),
  // Vazio limpa o endereço; o main recusa o que não for https.
  'nuvem:endereco': z.object({ endereco: z.string().max(300) }).strict(),
  'nuvem:sincronizar': z.object({}).strict(),
  'nuvem:publicar': z.object({}).strict()
} as const

export type IpcChannel = keyof typeof IPC_SCHEMAS
export type IpcPayload<C extends IpcChannel> = z.input<(typeof IPC_SCHEMAS)[C]>
