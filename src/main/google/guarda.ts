import { safeStorage } from 'electron'
import { readFile, writeFile, rename } from 'node:fs/promises'
import type { Cliente } from './api'
import type { Mapa, Importados } from './logica'
import type { FeriadoDaAgenda } from '../../shared/types'

/**
 * Onde a conexão com o Google fica guardada: `userData/google-agenda.dat`.
 *
 * Fora do vault de propósito — o vault é copiado, zipado e às vezes vai para
 * outra máquina, e o acesso à conta Google não pode ir junto. E cifrado pelo
 * Windows (`safeStorage`): o arquivo só abre nesta conta deste PC. Sem cifra
 * disponível, o Cortex se recusa a guardar em texto puro.
 */

export type DadosGoogle = {
  cliente?: Cliente
  refreshToken?: string
  /** O que o login autorizou (separado por espaço), como o Google devolveu. */
  escopos?: string
  /** Por vault: cada vault tem o seu calendário e as suas ligações. */
  vaults: Record<string, { calendarioId?: string; mapa: Mapa; importados?: Importados }>
  ultima?: string
  erro?: string
  /**
   * Os feriados dos calendários de feriados da conta, do ano passado ao
   * próximo. Da conta, não do vault: são os mesmos em qualquer vault.
   */
  feriados?: FeriadoDaAgenda[]
}

export interface Guarda {
  ler(): Promise<DadosGoogle>
  gravar(d: DadosGoogle): Promise<void>
}

export class GuardaCifrada implements Guarda {
  constructor(private arquivo: string) {}

  async ler(): Promise<DadosGoogle> {
    try {
      const bruto = await readFile(this.arquivo)
      if (!safeStorage.isEncryptionAvailable()) return { vaults: {} }
      const o = JSON.parse(safeStorage.decryptString(bruto)) as DadosGoogle
      return o && typeof o === 'object' && o.vaults && typeof o.vaults === 'object' ? o : { vaults: {} }
    } catch {
      return { vaults: {} }
    }
  }

  async gravar(d: DadosGoogle): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('o Windows não liberou a cifra para guardar o acesso ao Google com segurança')
    }
    const tmp = `${this.arquivo}.tmp`
    await writeFile(tmp, safeStorage.encryptString(JSON.stringify(d)))
    await rename(tmp, this.arquivo)
  }
}
