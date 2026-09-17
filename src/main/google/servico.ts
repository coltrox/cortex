import type { Session } from '../session'
import { listNotesWithFields, type NoteComCampos } from '../index/queries'
import { patchFrontmatter } from '../vault/patch'
import { pastasProtegidas } from '../config'
import { ApiAgenda, autorizar, ESCOPO_LEITURA, lerArquivoCliente, clienteDoBuild, ErroDeLogin, CalendarioSumiu, type Cliente } from './api'
import type { Guarda, DadosGoogle } from './guarda'
import {
  planejarSincronia, corpoDoCortex, hashDoCorpo, itemDepoisDoGoogle, somarDias,
  planejarImportacao,
  type ItemCortex, type Mapa, type CamposDoGoogle, type EventoGoogle, type Importados, type EventoDeFora
} from './logica'

/**
 * O Google Agenda do Cortex: conectar, sincronizar, desconectar.
 *
 * Quem decide o que muda é `logica.ts`; aqui só se lê o índice, fala com o
 * Google e grava no vault. Uma rodada de cada vez — o relógio e o botão
 * "Sincronizar agora" podem chegar juntos, e duas rodadas simultâneas
 * criariam o mesmo evento duas vezes.
 */

export type EstadoGoogle = {
  /** O arquivo do cliente OAuth já foi escolhido. */
  temCliente: boolean
  conectado: boolean
  /** O login autorizou ler a agenda do Google (logins antigos só escreviam no calendário "Cortex"). */
  podeLer: boolean
  sincronizando: boolean
  /** ISO da última rodada que terminou sem erro. */
  ultima: string | null
  erro: string | null
  /** Quantos itens estão ligados a eventos neste vault. */
  ligados: number
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const mapaTem = (mapa: Mapa, id: string): boolean => Object.values(mapa).some(l => l.id === id)

/** Hoje no fuso de quem usa o PC, sem passar por UTC. */
function diaLocal(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) ? n : null
}

/** Higieniza um título para virar nome de arquivo, igual ao resto do app. */
const nomeArquivo = (s: string): string =>
  s.replace(/[/:*?"<>|\\]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Compromisso'

export class ServicoAgenda {
  private rodando: Promise<EstadoGoogle> | null = null

  constructor(
    private session: Session,
    private guarda: Guarda,
    private abrirNavegador: (url: string) => Promise<void>
  ) {}

  /** O cliente escolhido à mão vale mais que o do build: é a saída para trocar sem recompilar. */
  private clienteDe(d: DadosGoogle): Cliente | null {
    return d.cliente ?? clienteDoBuild()
  }

  private vaultId(): string {
    const id = this.session.isOpen ? this.session.config.vaultId : ''
    if (!id) throw new Error('abra um vault antes de conectar o Google Agenda')
    return id
  }

  async estado(): Promise<EstadoGoogle> {
    const d = await this.guarda.ler()
    const id = this.session.isOpen ? this.session.config.vaultId : ''
    return {
      temCliente: Boolean(this.clienteDe(d)),
      conectado: Boolean(this.clienteDe(d) && d.refreshToken),
      podeLer: Boolean(d.refreshToken && (d.escopos ?? '').split(' ').includes(ESCOPO_LEITURA)),
      sincronizando: this.rodando !== null,
      ultima: d.ultima ?? null,
      erro: d.erro ?? null,
      ligados: id ? Object.keys(d.vaults[id]?.mapa ?? {}).length : 0
    }
  }

  /** Guarda o cliente OAuth lido do JSON baixado do Google Cloud. */
  async importarCliente(conteudo: string): Promise<EstadoGoogle> {
    const cliente = lerArquivoCliente(conteudo)
    if (!cliente) {
      throw new Error('esse arquivo não é o JSON de um cliente "App para computador" do Google Cloud')
    }
    const d = await this.guarda.ler()
    // Cliente trocado invalida o login antigo: ele pertencia ao outro cliente.
    const mesmo = d.cliente?.clientId === cliente.clientId
    await this.guarda.gravar({ ...d, cliente, refreshToken: mesmo ? d.refreshToken : undefined, erro: undefined })
    return this.estado()
  }

  async conectar(): Promise<EstadoGoogle> {
    const d = await this.guarda.ler()
    const cliente = this.clienteDe(d)
    if (!cliente) throw new Error('este Cortex foi compilado sem o cliente do Google — escolha o arquivo JSON')
    this.vaultId()
    const { refreshToken, escopos } = await autorizar(cliente, this.abrirNavegador)
    await this.guarda.gravar({ ...(await this.guarda.ler()), refreshToken, escopos, erro: undefined })
    return this.sincronizar()
  }

  /** Tira o acesso na conta Google e esquece o login. O calendário "Cortex" fica lá. */
  async desconectar(): Promise<EstadoGoogle> {
    const d = await this.guarda.ler()
    const cliente = this.clienteDe(d)
    if (cliente && d.refreshToken) await new ApiAgenda(cliente, d.refreshToken).revogar()
    await this.guarda.gravar({ ...d, refreshToken: undefined, vaults: {}, erro: undefined, ultima: undefined })
    return this.estado()
  }

  sincronizar(): Promise<EstadoGoogle> {
    if (this.rodando) return this.rodando
    this.rodando = this.rodada().finally(() => { this.rodando = null })
    return this.rodando
  }

  private async rodada(): Promise<EstadoGoogle> {
    const d = await this.guarda.ler()
    const cliente = this.clienteDe(d)
    if (!cliente || !d.refreshToken || !this.session.isOpen) return this.estado()
    const id = this.vaultId()
    const api = new ApiAgenda(cliente, d.refreshToken)
    const doVault = d.vaults[id] ?? { mapa: {} }
    const mapa: Mapa = { ...doVault.mapa }
    const importados: Importados = { ...(doVault.importados ?? {}) }
    let calendarioId = doVault.calendarioId

    const salvar = async (extra: Partial<DadosGoogle>): Promise<void> => {
      const atual = await this.guarda.ler()
      await this.guarda.gravar({
        ...atual,
        vaults: { ...atual.vaults, [id]: { calendarioId, mapa, importados } },
        ...extra
      })
    }

    try {
      if (!calendarioId) {
        calendarioId = await api.criarCalendario()
        await salvar({})
      }
      let eventos: EventoGoogle[]
      try {
        eventos = await api.listarEventos(calendarioId)
      } catch (err) {
        if (!(err instanceof CalendarioSumiu)) throw err
        // Apagaram o calendário "Cortex" no Google: cria outro e sobe tudo de novo.
        calendarioId = await api.criarCalendario()
        for (const k of Object.keys(mapa)) delete mapa[k]
        await salvar({})
        eventos = []
      }
      const cal = calendarioId

      // Ocorrências de eventos repetidos criados fora do Cortex, de ontem a 60
      // dias. As das datas comemorativas do próprio Cortex ficam de fora: elas
      // já são uma nota só, que se repete.
      const hoje = diaLocal()
      const porId = new Map(eventos.map(e => [e.id, e]))
      for (const ev of await api.listarRepeticoes(cal, somarDias(hoje, -1), somarDias(hoje, 60))) {
        if (ev.extendedProperties?.private?.cortex === '1' && !mapaTem(mapa, ev.id)) continue
        porId.set(ev.id, ev)
      }
      eventos = [...porId.values()]

      const itens = this.itensDoCortex()
      const porPath = new Map(itens.map(i => [i.path, i]))
      const anoAtual = new Date().getFullYear()
      const plano = planejarSincronia({ itens, eventos, mapa, anoAtual, hoje })

      for (const path of plano.desligar) delete mapa[path]

      for (const op of plano.paraGoogle) {
        if (op.acao === 'inserir') {
          const r = await api.inserir(cal, op.corpo)
          mapa[op.path] = { id: r.id, hash: hashDoCorpo(op.corpo), atualizado: r.atualizado }
        } else if (op.acao === 'atualizar' || op.acao === 'religar') {
          const r = await api.atualizar(cal, op.id, op.corpo)
          mapa[op.path] = { id: op.id, hash: hashDoCorpo(op.corpo), atualizado: r.atualizado }
        } else {
          await api.apagar(cal, op.id)
          delete mapa[op.path]
        }
      }

      for (const op of plano.paraCortex) {
        if (op.acao === 'atualizar') {
          const item = porPath.get(op.path)
          if (!item) continue
          await this.atualizarNota(op.path, op.campos)
          const corpo = corpoDoCortex(itemDepoisDoGoogle(item, op.campos), anoAtual)
          if (corpo) {
            mapa[op.path] = {
              id: op.id, hash: hashDoCorpo(corpo), atualizado: op.atualizado,
              ...(mapa[op.path]?.instancia ? { instancia: true } : {})
            }
          }
        } else if (op.acao === 'cancelar') {
          await this.patch(op.path, { cancelado: true })
        } else {
          const path = await this.criarNota(op.campos)
          const item: ItemCortex = {
            path, tipo: 'evento', titulo: op.campos.titulo, date: op.campos.date, hora: op.campos.hora,
            local: op.campos.local, dia: null, mes: null, ano: null, mtime: Date.now()
          }
          const corpo = corpoDoCortex(item, anoAtual)
          if (!corpo) continue
          // O evento ganha a marca do Cortex, para a próxima rodada saber de quem ele é.
          const r = await api.atualizar(cal, op.id, { extendedProperties: corpo.extendedProperties })
          mapa[path] = { id: op.id, hash: hashDoCorpo(corpo), atualizado: r.atualizado, ...(op.instancia ? { instancia: true } : {}) }
        }
      }

      // A agenda do Google para dentro do Cortex — só quando o login autorizou ler.
      if ((d.escopos ?? '').split(' ').includes(ESCOPO_LEITURA)) {
        await this.puxarAgenda(api, cal, importados, hoje)
      }

      await salvar({ ultima: new Date().toISOString(), erro: undefined })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // O que já foi feito fica no mapa: a próxima rodada não repete.
      await salvar(err instanceof ErroDeLogin ? { refreshToken: undefined, erro: msg } : { erro: msg })
    }
    return this.estado()
  }

  /**
   * Puxa os outros calendários da conta: de 7 dias atrás a 90 dias à frente.
   *
   * O que vem vira compromisso com `origem: google` — e é essa marca que
   * impede a nota de voltar para o Google pelo calendário "Cortex", o que a
   * duplicaria na agenda de quem usa.
   */
  private async puxarAgenda(api: ApiAgenda, calendarioDoCortex: string, importados: Importados, hoje: string): Promise<void> {
    const de = somarDias(hoje, -7)
    const ate = somarDias(hoje, 90)
    const eventos: EventoDeFora[] = []
    for (const c of await api.listarCalendarios()) {
      if (c.id === calendarioDoCortex) continue
      for (const ev of await api.listarDoCalendario(c.id, de, ate)) {
        // Evento que o próprio Cortex pôs lá (calendário compartilhado etc.): não volta.
        if (ev.extendedProperties?.private?.cortex === '1') continue
        eventos.push({ ...ev, calendario: c.id })
      }
    }
    const { ops, desligar } = planejarImportacao({ eventos, importados, de, ate })
    for (const op of ops) {
      if (op.acao === 'criar') {
        const path = await this.criarNota(op.campos, { origem: 'google' })
        importados[op.chave] = { path, atualizado: op.atualizado, date: op.campos.date }
      } else if (op.acao === 'atualizar') {
        if (await this.session.vault.exists(op.path)) {
          await this.atualizarNota(op.path, op.campos)
          importados[op.chave] = { path: op.path, atualizado: op.atualizado, date: op.campos.date }
        } else {
          const path = await this.criarNota(op.campos, { origem: 'google' })
          importados[op.chave] = { path, atualizado: op.atualizado, date: op.campos.date }
        }
      } else if (await this.session.vault.exists(op.path)) {
        await this.patch(op.path, { cancelado: true })
      }
    }
    for (const chave of desligar) delete importados[chave]
  }

  /**
   * Compromissos, provas e datas comemorativas — menos o que está em painel
   * trancado: o que o dono trancou no Cortex não sai para o Google.
   */
  private itensDoCortex(): ItemCortex[] {
    const trancadas = pastasProtegidas(this.session.config.paineisTrancados)
    const livre = (n: NoteComCampos): boolean =>
      !trancadas.some(p => n.path === p || n.path.startsWith(`${p}/`))
    const out: ItemCortex[] = []
    for (const tipo of ['evento', 'prova', 'data-comemorativa'] as const) {
      for (const n of listNotesWithFields(this.session.db, { tipo })) {
        if (!livre(n)) continue
        if (tipo === 'evento' && n.campos.cancelado === true) continue
        // Veio da agenda do Google: já está lá, não sobe de novo pelo "Cortex".
        if (n.campos.origem === 'google') continue
        out.push({
          path: n.path,
          tipo,
          titulo: n.title,
          date: n.date,
          hora: texto(n.campos.hora) || null,
          local: texto(n.campos.local) || null,
          dia: numero(n.campos.dia),
          mes: numero(n.campos.mes),
          ano: numero(n.campos.ano),
          mtime: n.mtime
        })
      }
    }
    return out
  }

  private async patch(path: string, campos: Record<string, unknown>): Promise<void> {
    const raw = await this.session.vault.read(path)
    await this.session.vault.writeAtomic(path, patchFrontmatter(raw, campos))
    await this.session.indexer.indexFile(path)
  }

  /** O título mora em `titulo` (formulário do PC) ou `title` (celular): escreve no que existe. */
  private async atualizarNota(path: string, campos: CamposDoGoogle): Promise<void> {
    const raw = await this.session.vault.read(path)
    const chave = /^titulo:/m.test(raw) || !/^title:/m.test(raw) ? 'titulo' : 'title'
    await this.session.vault.writeAtomic(path, patchFrontmatter(raw, {
      [chave]: campos.titulo,
      date: campos.date,
      hora: campos.hora,
      local: campos.local
    }))
    await this.session.indexer.indexFile(path)
  }

  /** Compromisso novo, criado no calendário pelo celular. */
  private async criarNota(campos: CamposDoGoogle, extra: Record<string, unknown> = {}): Promise<string> {
    const base = `Agenda/${nomeArquivo(campos.titulo)}`
    let path = `${base}.md`
    for (let n = 2; await this.session.vault.exists(path); n++) path = `${base} (${n}).md`
    await this.session.vault.writeAtomic(path, patchFrontmatter('---\n---\n\n', {
      tipo: 'evento',
      titulo: campos.titulo,
      date: campos.date,
      hora: campos.hora,
      local: campos.local,
      ...extra
    }))
    await this.session.indexer.indexFile(path)
    return path
  }
}
