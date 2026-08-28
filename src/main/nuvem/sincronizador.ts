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

/** Os únicos tipos de nota que `montarCardapio` usa — ver `publicar()` abaixo. */
const TIPOS_CARDAPIO = ['treino-modelo', 'suplemento', 'plano'] as const

/**
 * Vaults com uma sincronização em andamento agora mesmo, por raiz absoluta.
 *
 * Não é um campo de instância porque `Sincronizador` não é de vida longa —
 * quem chama (abrir o vault, timer de 2 minutos, botão manual; ver
 * `recebidos.ts` sobre esses três gatilhos poderem se sobrepor) instancia um
 * novo a cada disparo. Travar dentro da instância não protegeria nada, já
 * que duas instâncias diferentes não compartilhariam o cadeado. O que
 * precisa ser único é o VAULT, não a instância — daí este `Set` a nível de
 * módulo, chaveado pela raiz do vault.
 *
 * Sem isto, dois lotes concorrentes leem a mesma lista de eventos de
 * `cliente.listarEventos` e cada um vê o mesmo evento como "ainda não
 * aplicado" (o outro ainda não chamou `recebidos.marcar`) — os dois aplicam,
 * e `gasto`/`refeicao_extra` (não idempotentes) duplicam no vault. É o
 * mesmo defeito que a colisão de `proximoCaminhoLivre` em `executar.ts`
 * resolve para duas anotações diferentes; aqui a causa raiz é uma camada
 * acima, então a correção também precisa ser.
 *
 * Escolha: DESISTIR, não esperar. Enfileirar a chamada N+1 (como
 * `serializarPorCaminho` em `ipc/handlers.ts` faz para escritas de nota)
 * resolveria a corrida também, mas o timer de 2 minutos dispara de novo
 * mesmo que a rodada anterior ainda esteja rodando (rede lenta, lote
 * grande) — encadear indefinidamente empilha rodadas redundantes que fazem
 * o trabalho de novo assim que rodarem. Como cada rodada busca TUDO dentro
 * de `janelaDias`, a próxima chamada natural (2 minutos depois, ou a
 * próxima abertura do vault) cobre os mesmos eventos sem perda — desistir
 * agora e deixar o próximo disparo pegar o que ficou de fora é seguro e
 * mais barato que empilhar.
 */
const sincronizandoAgora = new Set<string>()

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

  async sincronizar(): Promise<{ aplicados: number; ignorados: number; falhas: number; pulado: boolean }> {
    const vaultRoot = this.session.vault.root
    // Checagem e marcação síncronas, antes de qualquer `await`: duas
    // chamadas a `sincronizar()` disparadas sem `await` entre elas (mesmo
    // padrão de teste usado em `serializarPorCaminho`) executam este trecho
    // em ordem determinística — a primeira reserva o vault e segue; a
    // segunda já encontra a reserva feita e desiste imediatamente. Ver
    // comentário de `sincronizandoAgora` acima para a escolha de desistir.
    if (sincronizandoAgora.has(vaultRoot)) {
      // `pulado: true` é o que distingue esta desistência de uma rodada que
      // rodou de verdade e não achou nada novo — as duas, sem este campo,
      // devolveriam o mesmo `{ aplicados: 0, ignorados: 0, falhas: 0 }`. A
      // Task 9 liga um botão "Sincronizar agora" na interface: sem o campo,
      // um clique nesse botão bem no meio da rodada do timer de 2 minutos
      // mostraria "0 registros novos" e o usuário concluiria (errado) que
      // está tudo em dia, quando a rodada em andamento pode estar trazendo
      // dezenas de eventos. Loga também — uma rodada pulada sem rastro
      // nenhum é difícil de diagnosticar depois (mesmo padrão de log do
      // resto deste arquivo).
      console.error(`[cortex] sincronização pulada: outra rodada já está em andamento para ${vaultRoot}`)
      return { aplicados: 0, ignorados: 0, falhas: 0, pulado: true }
    }
    sincronizandoAgora.add(vaultRoot)
    try {
      return await this.sincronizarAgora()
    } finally {
      sincronizandoAgora.delete(vaultRoot)
    }
  }

  private async sincronizarAgora(): Promise<{ aplicados: number; ignorados: number; falhas: number; pulado: boolean }> {
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
      // `pulado: false` de propósito: esta rodada tentou rodar e abortou por
      // um problema de I/O, bem diferente de desistir por já haver outra
      // rodada em andamento (ver `sincronizar()`). Só o caso de concorrência
      // é o que a interface precisa distinguir de "rodou e não achou nada".
      return { aplicados: 0, ignorados: 0, falhas: 0, pulado: false }
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
    return { aplicados, ignorados, falhas, pulado: false }
  }

  async publicar(): Promise<number> {
    // `montarCardapio` só usa três tipos ('treino-modelo', 'suplemento',
    // 'plano'); `listNotesWithFields` já aceita filtrar por `tipo` (só um por
    // vez, sem API nova pra isso), então chamamos uma vez por tipo em vez de
    // trazer o vault inteiro — senha, finanças e documento nem chegam perto
    // do processo de filtragem. `montarCardapio` continua sendo quem decide
    // o que publica; isto só reduz o que passa por perto dela.
    const notas = TIPOS_CARDAPIO.flatMap(tipo => listNotesWithFields(this.session.db, { tipo }))
    return this.cliente.publicarCardapio(montarCardapio(notas))
  }
}
