import { useEffect, useState } from 'react'

/**
 * Tem versão nova do app publicada?
 *
 * O app instalado na tela de início fica aberto por dias: o celular só o
 * congela e descongela, e o navegador nunca recarrega a página sozinho. Uma
 * versão nova publicada no Vercel só aparecia fechando o app de verdade — e
 * ninguém sabe que precisa fazer isso. Não precisa desinstalar: o service
 * worker já busca da rede primeiro (`public/sw.js`); faltava o app PERCEBER.
 *
 * Cada build grava o próprio número em dois lugares — dentro do pacote e em
 * `/versao.json` (ver `vite.config.ts`). O app aberto confere o arquivo de
 * tempos em tempos e quando volta para a tela; se o número de lá é outro, a
 * tela oferece atualizar. Atualizar é só recarregar: a fila de envio mora no
 * `localStorage` e sobrevive.
 */

/** O número publicado agora — `null` sem rede, sem arquivo ou com arquivo torto. */
export async function versaoPublicada(
  buscar: typeof fetch = (...a) => fetch(...a)
): Promise<string | null> {
  try {
    // `no-store` e o carimbo na URL: um `versao.json` guardado em cache
    // diria "nada mudou" para sempre.
    const r = await buscar(`/versao.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const j: unknown = await r.json()
    const v = j && typeof j === 'object' ? (j as { versao?: unknown }).versao : undefined
    return typeof v === 'string' && v !== '' ? v : null
  } catch {
    return null
  }
}

/** O publicado é outro que o que está rodando? Sem resposta não é versão nova. */
export function temVersaoNova(atual: string, publicada: string | null): boolean {
  return publicada !== null && publicada !== atual
}

/** De quanto em quanto tempo conferir com o app aberto na tela. */
const INTERVALO_MS = 10 * 60 * 1000

/**
 * Confere ao abrir, ao voltar para a tela e a cada dez minutos.
 *
 * Voltar para a tela é o caso que importa no celular: o app sai do segundo
 * plano sem recarregar, e é aí que uma versão publicada horas antes precisa
 * ser notada. Só no app publicado — em desenvolvimento não há `versao.json`,
 * e o Vite já recarrega sozinho.
 */
export function useVersaoNova(atual: string): boolean {
  const [nova, setNova] = useState(false)
  useEffect(() => {
    if (!import.meta.env.PROD) return
    let vivo = true
    const conferir = (): void => {
      void versaoPublicada().then(p => { if (vivo && temVersaoNova(atual, p)) setNova(true) })
    }
    const aoVoltar = (): void => { if (document.visibilityState === 'visible') conferir() }
    conferir()
    const relogio = setInterval(conferir, INTERVALO_MS)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      vivo = false
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [atual])
  return nova
}
