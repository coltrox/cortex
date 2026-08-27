import { join } from 'node:path'
import type { Session } from '../session'
import { listNotesWithFields } from '../index/queries'
import { montarCardapio } from './cardapio'
import { planejar } from './planejar'
import { executar } from './executar'
import { Recebidos } from './recebidos'
import type { ClienteNuvem } from './cliente'

/** De quanto tempo para trás buscar, por padrão. O banco só guarda 90 dias mesmo. */
const JANELA_DIAS_PADRAO = 30
const RETENCAO_DIAS_PADRAO = 90

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
    private readonly cliente: ClienteNuvem,
    private readonly janelaDias: number = JANELA_DIAS_PADRAO,
    private readonly retencaoDias: number = RETENCAO_DIAS_PADRAO
  ) {
    // A segurança do dedupe depende desta desigualdade: `Recebidos.podar`
    // esquece um id depois de `retencaoDias`, e `listarEventos` busca até
    // `janelaDias` para trás. Se `retencaoDias` fosse menor ou igual a
    // `janelaDias`, um id podado ainda cairia dentro da janela de busca na
    // rodada seguinte — o evento voltaria do banco, `jaAplicado` diria que
    // não, e `gasto`/`sessao` seriam reaplicados em dobro no vault.
    //
    // A checagem mora no construtor, não no topo do módulo: um `throw` ao
    // importar derrubaria qualquer código que só precisasse do tipo
    // `Sincronizador`, sem nunca instanciar um — e não tem precedente em
    // `src/main` (todo outro `throw` do projeto mora dentro de uma função).
    // Aqui ela dispara só quando alguém de fato tenta montar um
    // sincronizador com números inconsistentes, o efeito fica contido em
    // quem chamou `new Sincronizador(...)`, e o próprio construtor aceita
    // `janelaDias`/`retencaoDias` como parâmetros — o que também é o que
    // torna a guarda testável sem depender das constantes de produção.
    if (retencaoDias <= janelaDias) {
      throw new Error(
        `retencaoDias (${retencaoDias}) precisa ser maior que janelaDias (${janelaDias}): ` +
        'caso contrário um evento pode ser esquecido em recebidos.json enquanto ainda está ' +
        'dentro da janela de busca, e ser reaplicado (gasto em dobro, por exemplo).'
      )
    }
    this.recebidos = new Recebidos(join(session.vault.root, '.vault', 'recebidos.json'))
  }

  async sincronizar(): Promise<{ aplicados: number; ignorados: number; falhas: number }> {
    try {
      await this.recebidos.carregar()
    } catch (err) {
      // `Recebidos.carregar()` só deixa o erro escapar até aqui quando o
      // problema é transitório (EPERM/EBUSY do Windows, por exemplo colidindo
      // com uma gravação concorrente) — ENOENT e JSON corrompido já viram
      // mapa vazio lá dentro, então quem chegou aqui não é "primeira vez" nem
      // "arquivo ruim".
      //
      // Duas saídas ruins para descartar primeiro: seguir em frente com a
      // memória vazia reaplicaria todo evento dos últimos `janelaDias` —
      // pior que não fazer nada, já que `gasto` e `refeicao_extra` não são
      // idempotentes e dobrariam no vault. E deixar a exceção subir crua
      // depende de quem agenda o timer de 2 minutos sempre envolver a chamada
      // em try/catch; como este método roda sozinho em segundo plano sem
      // ninguém supervisionando, um único ponto de chamada sem isso vira
      // unhandled rejection e pode derrubar o processo principal.
      //
      // Por isso a política é: aborta esta rodada inteira sem tocar em nada
      // (nem em `eventos`, nem no vault) e devolve zero. A causa é transitória
      // por definição — a próxima rodada, 2 minutos depois, tenta de novo com
      // a mesma janela de busca, e nada foi perdido nesse meio-tempo.
      console.error('[cortex] recebidos.json ilegível nesta rodada, sincronização adiada:', err)
      return { aplicados: 0, ignorados: 0, falhas: 0 }
    }

    const desde = new Date(Date.now() - this.janelaDias * 86400000).toISOString()
    const eventos = await this.cliente.listarEventos(desde)

    let aplicados = 0
    let ignorados = 0
    let falhas = 0
    for (const e of eventos) {
      if (this.recebidos.jaAplicado(e.id)) { ignorados++; continue }
      try {
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
      } catch (err) {
        // Isola o evento: uma falha aqui (YAML que o patch não conseguiu
        // aplicar numa nota que já estava corrompida, disco cheio, o que
        // for) não pode abortar o lote inteiro — os eventos seguintes
        // continuam sendo tentados, e `podar()` ainda roda no fim.
        //
        // Não marca como aplicado: o problema pode ser transitório e merece
        // ser tentado de novo na próxima rodada, mesma lógica de "marca só
        // depois de aplicar" acima. O risco óbvio é um evento
        // permanentemente quebrado (bug em `planejar`, por exemplo) tentar
        // para sempre a cada 2 minutos — mas isso se autolimita: o cliente
        // só devolve o que está dentro de `janelaDias`, então depois desse
        // prazo o evento para de voltar, mesmo sem nunca ter sido marcado.
        console.error(
          `[cortex] evento ${e.id} (${e.tipo}) falhou ao sincronizar, tentando de novo na próxima rodada:`,
          err
        )
        falhas++
      }
    }

    await this.recebidos.podar(this.retencaoDias)
    return { aplicados, ignorados, falhas }
  }

  async publicar(): Promise<number> {
    const notas = listNotesWithFields(this.session.db, {})
    return this.cliente.publicarCardapio(montarCardapio(notas))
  }
}
