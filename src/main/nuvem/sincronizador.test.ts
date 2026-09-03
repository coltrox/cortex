import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session } from '../session'
import { Sincronizador } from './sincronizador'
import { parseFrontmatter } from '../parser/frontmatter'
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

  it('anotacao com dois-pontos e quebra de linha no texto nao corrompe o YAML', async () => {
    const texto = 'Nota: comprar leite\nE também pão'
    const r = await sinc(new ClienteFalso([ev('e1', 'anotacao', { texto })])).sincronizar()
    expect(r.aplicados).toBe(1)

    const notas = session.db.prepare("SELECT path FROM notes WHERE tipo='anotacao'").all() as { path: string }[]
    expect(notas).toHaveLength(1)

    const md = await session.vault.read(notas[0].path)
    const { frontmatter, parseError } = parseFrontmatter(md)
    expect(parseError).toBeNull()
    expect(frontmatter.texto).toBe(texto)
  })

  it('duas anotacoes com a mesma primeira linha viram dois arquivos, sem perder texto', async () => {
    const t1 = 'Lembrar de pagar conta\nDetalhe da primeira'
    const t2 = 'Lembrar de pagar conta\nDetalhe da segunda, bem diferente'

    await sinc(new ClienteFalso([ev('e1', 'anotacao', { texto: t1 })])).sincronizar()
    await sinc(new ClienteFalso([ev('e2', 'anotacao', { texto: t2 })])).sincronizar()

    const notas = session.db.prepare("SELECT path FROM notes WHERE tipo='anotacao'").all() as { path: string }[]
    expect(notas).toHaveLength(2)

    const textos = await Promise.all(notas.map(n => session.vault.read(n.path)))
    expect(textos.some(md => md.includes('Detalhe da primeira'))).toBe(true)
    expect(textos.some(md => md.includes('Detalhe da segunda'))).toBe(true)
  })

  it('falha ao indexar nao impede a escrita nem forca reprocessamento', async () => {
    const original = session.indexer.indexFile.bind(session.indexer)
    session.indexer.indexFile = async () => { throw new Error('indice bloqueado') }

    try {
      const r = await sinc(new ClienteFalso([ev('e1', 'suplemento', { nome: 'Creatina' })])).sincronizar()
      expect(r.aplicados).toBe(1)
      expect(r.falhas).toBe(0)
      expect(await session.vault.read('Diario/2026-08-27.md')).toContain('Creatina')
    } finally {
      session.indexer.indexFile = original
    }

    // Se a falha de indexar tivesse impedido `marcar`, o mesmo evento
    // voltaria nesta segunda rodada e "Creatina" apareceria duas vezes.
    const segunda = await sinc(new ClienteFalso([ev('e1', 'suplemento', { nome: 'Creatina' })])).sincronizar()
    expect(segunda.aplicados).toBe(0)
    expect(segunda.ignorados).toBe(1)
    const md = await session.vault.read('Diario/2026-08-27.md')
    expect(md.split('Creatina').length - 1).toBe(1)
  })

  it('falha no meio do lote nao trava os eventos seguintes', async () => {
    const caminhoQuebrado = 'Saude/Treinos/Quebrado — 2026-08-27.md'
    const yamlInvalido = '---\ntipo: [nao, fechado\n---\ncorpo original'
    await session.vault.writeAtomic(caminhoQuebrado, yamlInvalido)

    const r = await sinc(new ClienteFalso([
      ev('e1', 'sessao', { modelo: 'Quebrado', exercicios: [] }),
      ev('e2', 'suplemento', { nome: 'Creatina' })
    ])).sincronizar()

    expect(r.falhas).toBe(1)
    expect(r.aplicados).toBe(1)
    expect(await session.vault.read('Diario/2026-08-27.md')).toContain('Creatina')
    // O arquivo quebrado continua exatamente como estava — nada tentou
    // reescrevê-lo por cima do erro.
    expect(await session.vault.read(caminhoQuebrado)).toBe(yamlInvalido)
  })

  it('recusa construir quando a retencao nao e maior que a janela de busca', () => {
    const clienteQualquer = new ClienteFalso([]) as unknown as ClienteNuvem
    expect(() => new Sincronizador(session, clienteQualquer, 30, 30)).toThrow()
    expect(() => new Sincronizador(session, clienteQualquer, 30, 20)).toThrow()
    expect(() => new Sincronizador(session, clienteQualquer, 30, 31)).not.toThrow()
  })

  it('duas sincronizacoes concorrentes no mesmo vault nao aplicam o mesmo evento duas vezes', async () => {
    // Mesmo cliente, mesma lista: representa duas rodadas (timer de 2min +
    // botao manual, por exemplo) que buscariam exatamente os mesmos eventos
    // do servidor por estarem perto uma da outra no tempo.
    const cliente = new ClienteFalso([ev('e1', 'gasto', { item: 'Marmita', valor: 25 })])

    // Disparadas sem await entre elas: as duas comecam a rodar antes de
    // qualquer uma terminar.
    const [r1, r2] = await Promise.all([
      sinc(cliente).sincronizar(),
      sinc(cliente).sincronizar()
    ])

    // Sem a trava, as duas rodadas veriam 'e1' como nao aplicado (nenhuma
    // marcou ainda, cada uma com seu proprio `Recebidos` em memoria) e as
    // duas tentariam aplicar ao mesmo tempo — na pratica, no Windows, isso
    // aparece como um `rename` EPERM (duas escritas atomicas concorrentes
    // para o mesmo `Diario/2026-08-27.md`), contado como `falhas`, nao como
    // duplicacao silenciosa; em outra interleaving teria duplicado o texto
    // ou perdido uma escrita por cima da outra. As tres saidas sao sintomas
    // da mesma causa raiz. Com a trava, a segunda rodada nem chega a tocar
    // o vault: zero falhas, exatamente uma aplicacao.
    expect(r1.falhas + r2.falhas).toBe(0)
    expect(r1.aplicados + r2.aplicados).toBe(1)
    expect(r1.aplicados === 1 || r2.aplicados === 1).toBe(true)

    // A chamada que roda de verdade (a primeira, deterministicamente — as
    // duas comecam sincronamente na mesma ordem do Promise.all) nao vem
    // marcada como pulada; a segunda, barrada pela trava, vem.
    expect(r1.pulado).toBe(false)
    expect(r2.pulado).toBe(true)

    const md = await session.vault.read('Diario/2026-08-27.md')
    // Nem duplicado (a trava evitou a corrida) nem ausente (uma das duas
    // rodadas realmente aplicou o evento) — exatamente uma ocorrencia.
    expect(md.split('Marmita').length - 1).toBe(1)
  })

  it('rodada sem eventos novos nao vem marcada como pulada', async () => {
    // Sem isto, o campo `pulado` nao distingue nada: "rodou e nao achou
    // nada" e "nem chegou a rodar" ficariam com a mesma cara pra quem
    // consome o retorno.
    const r = await sinc(new ClienteFalso([])).sincronizar()
    expect(r.aplicados).toBe(0)
    expect(r.pulado).toBe(false)
  })

  it('sincronizacao concorrente desiste em vez de perder o evento — proxima rodada aplica', async () => {
    // Duas anotacoes DIFERENTES que comecam com a mesma primeira linha —
    // o cenario exato descrito na correcao: sem trava, as duas rodadas
    // concorrentes veem 'Ideia solta.md' livre ao mesmo tempo e as duas
    // escrevem nele, uma apagando a outra em silencio.
    const t1 = 'Ideia solta\nPrimeira anotacao'
    const t2 = 'Ideia solta\nSegunda anotacao, bem diferente'
    const c1 = new ClienteFalso([ev('e1', 'anotacao', { texto: t1 })])
    const c2 = new ClienteFalso([ev('e2', 'anotacao', { texto: t2 })])

    const [r1, r2] = await Promise.all([
      sinc(c1).sincronizar(),
      sinc(c2).sincronizar()
    ])

    // Uma das duas rodadas aplicou; a outra desistiu (0/0/0) sem tocar no
    // vault — o evento dela continua pendente, nao perdido. Sem a trava, as
    // duas tentam ao mesmo tempo: ou as duas "conseguem" (uma sobrescreve o
    // arquivo da outra por cima — texto perdido em silencio, sem nenhuma
    // falha reportada) ou uma delas esbarra num erro real de SO (EPERM/EBUSY
    // no Windows). As duas checagens abaixo pegam os dois casos.
    expect(r1.falhas + r2.falhas).toBe(0)
    const totalAplicados = r1.aplicados + r2.aplicados
    expect(totalAplicados).toBe(1)
    // Exatamente uma das duas veio marcada como pulada pela trava — a outra,
    // que realmente rodou, nao.
    expect(r1.pulado).toBe(!r2.pulado)

    // A rodada que desistiu nao criou (nem sobrescreveu) nenhum arquivo.
    let notas = session.db.prepare("SELECT path FROM notes WHERE tipo='anotacao'").all() as { path: string }[]
    expect(notas).toHaveLength(1)

    // A proxima chamada (sequencial, sem concorrencia) e livre para rodar e
    // pega o evento que ficou de fora — nada foi perdido de vez.
    const clienteQueFicouDeFora = r1.aplicados === 1 ? c2 : c1
    await sinc(clienteQueFicouDeFora).sincronizar()

    notas = session.db.prepare("SELECT path FROM notes WHERE tipo='anotacao'").all() as { path: string }[]
    expect(notas).toHaveLength(2)
    const textos = await Promise.all(notas.map(n => session.vault.read(n.path)))
    expect(textos.some(md => md.includes('Primeira anotacao'))).toBe(true)
    expect(textos.some(md => md.includes('Segunda anotacao'))).toBe(true)
  })
})

/*
 * A operacao `marcar`, ponta a ponta.
 *
 * Ela e a unica que escreve numa nota escolhida por um caminho vindo de fora.
 * O que estes testes protegem e a guarda de tipo: sem ela, um evento marcaria
 * qualquer nota do vault -- um documento, uma senha, um projeto.
 */
describe('marcar nota existente', () => {
  const ler = async (path: string) =>
    parseFrontmatter(await session.vault.read(path)).frontmatter

  it('marca a prova como estudada', async () => {
    await session.vault.writeAtomic(
      'Estudos/Provas/ENEM.md', '---\ntipo: prova\ndate: 2026-09-10\n---\n\n## O que cai\n'
    )
    await sinc(new ClienteFalso([
      ev('e1', 'prova_estudada', { path: 'Estudos/Provas/ENEM.md' })
    ])).sincronizar()

    const fm = await ler('Estudos/Provas/ENEM.md')
    expect(fm.estudado).toBe(true)
    expect(fm.estudado_em).toBe('2026-08-27')
    // O resto da nota continua de pe.
    expect(fm.date).toBe('2026-09-10')
    expect(await session.vault.read('Estudos/Provas/ENEM.md')).toContain('## O que cai')
  })

  it('desmarcar apaga os campos, e nao grava estudado: false', async () => {
    await session.vault.writeAtomic(
      'Estudos/Provas/ENEM.md',
      '---\ntipo: prova\ndate: 2026-09-10\nestudado: true\nestudado_em: 2026-08-27\n---\n\n## O que cai\n'
    )
    await sinc(new ClienteFalso([
      ev('e1', 'prova_estudada', { path: 'Estudos/Provas/ENEM.md', estudado: false })
    ])).sincronizar()

    const fm = await ler('Estudos/Provas/ENEM.md')
    // Ausentes, e nao `false`: a nota volta a ser a de quem nunca estudou. Uma
    // data de quando NAO se estudou nao quer dizer nada, e `montarCardapio` so
    // publica `estudado` quando ele e exatamente `true` -- entao deixar
    // `false` ali dentro seria lixo que ninguem le.
    expect(fm.estudado).toBeUndefined()
    expect(fm.estudado_em).toBeUndefined()
    // O resto da nota continua de pe.
    expect(fm.date).toBe('2026-09-10')
    expect(await session.vault.read('Estudos/Provas/ENEM.md')).toContain('## O que cai')
  })

  it('editar do celular alcanca a nota da prova', async () => {
    await session.vault.writeAtomic(
      'Estudos/Provas/ENEM.md',
      '---\ntipo: prova\ntitle: ENEM\ndate: 2026-09-10\nmateria: geral\n---\n\n## O que cai\n'
    )
    await sinc(new ClienteFalso([
      ev('e1', 'compromisso_editado', {
        path: 'Estudos/Provas/ENEM.md', data: '2026-09-12', materia: 'fisica'
      })
    ])).sincronizar()

    const fm = await ler('Estudos/Provas/ENEM.md')
    expect(fm.date).toBe('2026-09-12')
    expect(fm.materia).toBe('fisica')
    // O que nao veio no evento fica como estava.
    expect(fm.title).toBe('ENEM')
    expect(fm.tipo).toBe('prova')
    expect(await session.vault.read('Estudos/Provas/ENEM.md')).toContain('## O que cai')
  })

  it('apagar do celular apaga o arquivo do vault', async () => {
    await session.vault.writeAtomic('Agenda/Dentista.md', '---\ntipo: evento\n---\n')
    await sinc(new ClienteFalso([
      ev('e1', 'item_apagado', { path: 'Agenda/Dentista.md' })
    ])).sincronizar()

    expect(await session.vault.exists('Agenda/Dentista.md')).toBe(false)
  })

  it('apagar NAO alcanca nota de outro tipo, mesmo com o caminho certo', async () => {
    // A guarda que mais importa aqui: o caminho vem do celular, e sem
    // conferir o tipo no disco este evento apagaria a nota de senha.
    await session.vault.writeAtomic('Vida/Contas/Gmail.md', '---\ntipo: senha\nusuario: pedro\n---\n')
    await sinc(new ClienteFalso([
      ev('e1', 'item_apagado', { path: 'Vida/Contas/Gmail.md' })
    ])).sincronizar()

    expect(await session.vault.exists('Vida/Contas/Gmail.md')).toBe(true)
    expect((await ler('Vida/Contas/Gmail.md')).usuario).toBe('pedro')
  })

  it('apagar duas vezes o mesmo item nao e erro', async () => {
    // Um evento reprocessado e o caso normal, nao a excecao.
    await session.vault.writeAtomic('Agenda/X.md', '---\ntipo: evento\n---\n')
    const r = await sinc(new ClienteFalso([
      ev('e1', 'item_apagado', { path: 'Agenda/X.md' }),
      ev('e2', 'item_apagado', { path: 'Agenda/X.md' })
    ])).sincronizar()
    expect(r.aplicados).toBe(2)
    expect(await session.vault.exists('Agenda/X.md')).toBe(false)
  })

  it('editar NAO alcanca nota de outro tipo, mesmo com o caminho certo', async () => {
    // Sem a guarda de tipo, este evento escreveria dentro da nota de senha.
    await session.vault.writeAtomic('Vida/Contas/Gmail.md', '---\ntipo: senha\nusuario: pedro\n---\n')
    const r = await sinc(new ClienteFalso([
      ev('e1', 'compromisso_editado', { path: 'Vida/Contas/Gmail.md', titulo: 'invadido' })
    ])).sincronizar()

    const fm = await ler('Vida/Contas/Gmail.md')
    expect(fm.title).toBeUndefined()
    expect(fm.tipo).toBe('senha')
    expect(fm.usuario).toBe('pedro')
    // O evento conta como aplicado: repetir nao adianta, e deixa-lo pendente
    // faria o sincronizador reprocessa-lo para sempre.
    expect(r.aplicados).toBe(1)
  })

  it('prova_estudada tambem nao escapa do tipo permitido', async () => {
    await session.vault.writeAtomic('Vida/Documentos/RG.md', '---\ntipo: documento\n---\n')
    await sinc(new ClienteFalso([
      ev('e1', 'prova_estudada', { path: 'Vida/Documentos/RG.md' })
    ])).sincronizar()
    expect((await ler('Vida/Documentos/RG.md')).estudado).toBeUndefined()
  })

  it('nota que nao existe nao e criada', async () => {
    // Criar aqui ressuscitaria, como arquivo vazio, algo que o dono apagou.
    await sinc(new ClienteFalso([
      ev('e1', 'compromisso_cancelado', { path: 'Agenda/Sumiu.md' })
    ])).sincronizar()
    expect(await session.vault.exists('Agenda/Sumiu.md')).toBe(false)
  })

  it('compromisso novo vindo do celular vira nota na Agenda', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'compromisso', { titulo: 'Dentista', data: '2026-09-10', hora: '14:00' })
    ])).sincronizar()

    expect(await session.vault.exists('Agenda/Dentista.md')).toBe(true)
    const fm = await ler('Agenda/Dentista.md')
    expect(fm.tipo).toBe('evento')
    expect(fm.date).toBe('2026-09-10')
    expect(fm.hora).toBe('14:00')
  })

  it('dois compromissos de mesmo nome viram dois arquivos', async () => {
    // Mesclar apagaria a data do primeiro.
    await sinc(new ClienteFalso([
      ev('e1', 'compromisso', { titulo: 'Dentista', data: '2026-09-10' }),
      ev('e2', 'compromisso', { titulo: 'Dentista', data: '2026-10-10' })
    ])).sincronizar()

    expect(await session.vault.exists('Agenda/Dentista.md')).toBe(true)
    expect(await session.vault.exists('Agenda/Dentista (2).md')).toBe(true)
  })
})

/**
 * Desmarcar de verdade, no disco.
 *
 * O `planejar` decide `diario-tirar`; aqui se prova que o arquivo do diario
 * fica como deve ficar -- inclusive quando o conjunto esvazia.
 */
describe('desmarcar o check no diario', () => {
  const ler = async (path: string) =>
    parseFrontmatter(await session.vault.read(path)).frontmatter

  it('tira o suplemento do conjunto e mantem os outros', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'suplemento', { nome: 'Whey' }),
      ev('e2', 'suplemento', { nome: 'Creatina' })
    ])).sincronizar()

    await sinc(new ClienteFalso([
      ev('e3', 'suplemento', { nome: 'Whey', feito: false })
    ])).sincronizar()

    expect((await ler('Diario/2026-08-27.md')).suplementos_feitos).toEqual(['Creatina'])
  })

  it('conjunto vazio APAGA a chave, em vez de deixar uma lista vazia', async () => {
    // `suplementos_feitos: []` pendurado no diario e uma linha que nao diz
    // nada e que aparece em toda nota do dia.
    await sinc(new ClienteFalso([ev('e1', 'suplemento', { nome: 'Whey' })])).sincronizar()
    await sinc(new ClienteFalso([
      ev('e2', 'suplemento', { nome: 'Whey', feito: false })
    ])).sincronizar()

    const fm = await ler('Diario/2026-08-27.md')
    expect(fm).not.toHaveProperty('suplementos_feitos')
  })

  it('desmarcar o que nunca foi marcado nao quebra nem cria diario', async () => {
    // Acontece de verdade: o celular reenvia a fila depois de a pessoa ja ter
    // desmarcado no Cortex. Criar um diario vazio so para registrar que nada
    // foi feito seria pior do que nao fazer nada.
    const r = await sinc(new ClienteFalso([
      ev('e1', 'suplemento', { nome: 'Whey', feito: false })
    ])).sincronizar()

    expect(r.aplicados).toBe(1)
    expect(await session.vault.exists('Diario/2026-08-27.md')).toBe(false)
  })

  it('o resto do diario continua de pe', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'suplemento', { nome: 'Whey' }),
      ev('e2', 'gasto', { item: 'Almoço', valor: 32 })
    ])).sincronizar()
    await sinc(new ClienteFalso([
      ev('e3', 'suplemento', { nome: 'Whey', feito: false })
    ])).sincronizar()

    const fm = await ler('Diario/2026-08-27.md')
    expect(fm).not.toHaveProperty('suplementos_feitos')
    // O gasto do dia nao pode sair junto: sao campos vizinhos no mesmo arquivo.
    expect(JSON.stringify(fm)).toContain('Almoço')
  })
})

/**
 * A agua do dia, no arquivo.
 *
 * O `planejar` decide `diario-somar`; aqui se prova o que sobra no diario --
 * inclusive quando o total zera e quando chega um "tirar" a mais.
 */
describe('somar a agua no diario', () => {
  const ler = async (path: string) =>
    parseFrontmatter(await session.vault.read(path)).frontmatter

  it('duas garrafas somam', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'agua', { ml: 800 }),
      ev('e2', 'agua', { ml: 800 })
    ])).sincronizar()

    expect((await ler('Diario/2026-08-27.md')).agua_ml).toBe(1600)
  })

  it('soma tambem entre sincronizacoes -- e o total do dia, nao da rodada', async () => {
    await sinc(new ClienteFalso([ev('e1', 'agua', { ml: 800 })])).sincronizar()
    await sinc(new ClienteFalso([ev('e2', 'agua', { ml: 800 })])).sincronizar()

    expect((await ler('Diario/2026-08-27.md')).agua_ml).toBe(1600)
  })

  it('ml negativo desfaz o toque a mais', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'agua', { ml: 800 }),
      ev('e2', 'agua', { ml: 800 }),
      ev('e3', 'agua', { ml: -800 })
    ])).sincronizar()

    expect((await ler('Diario/2026-08-27.md')).agua_ml).toBe(800)
  })

  it('zerar APAGA a chave, em vez de deixar agua_ml: 0', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'agua', { ml: 800 }),
      ev('e2', 'agua', { ml: -800 })
    ])).sincronizar()

    expect(await ler('Diario/2026-08-27.md')).not.toHaveProperty('agua_ml')
  })

  it('nao desce abaixo de zero', async () => {
    // Acontece quando a fila do celular reenvia um "tirar" depois de o total
    // ja ter sido zerado no Cortex. Menos que zero nao e um total de agua.
    await sinc(new ClienteFalso([
      ev('e1', 'agua', { ml: 800 }),
      ev('e2', 'agua', { ml: -800 }),
      ev('e3', 'agua', { ml: -800 })
    ])).sincronizar()

    expect(await ler('Diario/2026-08-27.md')).not.toHaveProperty('agua_ml')
  })

  it('tirar num dia sem diario nao cria arquivo nenhum', async () => {
    const r = await sinc(new ClienteFalso([
      ev('e1', 'agua', { ml: -800 })
    ])).sincronizar()

    expect(r.aplicados).toBe(1)
    expect(await session.vault.exists('Diario/2026-08-27.md')).toBe(false)
  })

  it('o resto do diario continua de pe', async () => {
    await sinc(new ClienteFalso([
      ev('e1', 'agua', { ml: 800 }),
      ev('e2', 'suplemento', { nome: 'Creatina' })
    ])).sincronizar()

    const fm = await ler('Diario/2026-08-27.md')
    expect(fm.agua_ml).toBe(800)
    expect(fm.suplementos_feitos).toEqual(['Creatina'])
  })
})
