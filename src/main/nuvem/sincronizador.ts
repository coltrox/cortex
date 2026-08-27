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

// A segurança do dedupe depende desta desigualdade: `Recebidos.podar` esquece
// um id depois de `RETENCAO_DIAS`, e `listarEventos` busca até `JANELA_DIAS`
// para trás. Se `RETENCAO_DIAS` fosse menor ou igual a `JANELA_DIAS`, um id
// podado ainda cairia dentro da janela de busca na rodada seguinte — o
// evento voltaria do banco, `jaAplicado` diria que não, e `gasto`/`sessao`
// seriam reaplicados em dobro no vault. Um comentário não trava sozinho
// contra alguém trocar um dos dois números sem ler o outro; este `throw` no
// carregamento do módulo trava: o app inteiro recusa a subir (e a suíte de
// testes recusa a rodar) se a relação for violada.
if (RETENCAO_DIAS <= JANELA_DIAS) {
  throw new Error(
    `RETENCAO_DIAS (${RETENCAO_DIAS}) precisa ser maior que JANELA_DIAS (${JANELA_DIAS}): ` +
    'caso contrário um evento pode ser esquecido em recebidos.json enquanto ainda está ' +
    'dentro da janela de busca, e ser reaplicado (gasto em dobro, por exemplo).'
  )
}

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
      // memória vazia reaplicaria todo evento dos últimos `JANELA_DIAS` —
      // pior que não fazer nada, porque `gasto` e `refeicao_extra` não são
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
      return { aplicados: 0, ignorados: 0 }
    }

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
