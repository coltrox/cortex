import { montarIcs, type EventoIcs } from '../src/shared/ics'
import { diasNoMes } from '../src/shared/datas'

/**
 * O calendário do vault, para o Google e o iPhone assinarem.
 *
 * Roda no Vercel, ao lado do site. Recebe o id do vault, lê o cardápio que o
 * Cortex já publicou no Supabase e devolve um arquivo `text/calendar`.
 *
 * ## Por que assinar, e não integrar
 *
 * A API do Google exigiria aplicativo registrado, tela de consentimento,
 * chave secreta e token que expira — e serviria só ao Google. Um endereço que
 * devolve `text/calendar` os dois assinam, sem login, e é o MESMO endereço.
 *
 * O preço é de mão única: o que está no Cortex aparece no calendário, e o que
 * for criado no calendário não volta.
 *
 * ## Sobre o segredo
 *
 * O id do vault é a chave de tudo neste sistema, e aqui ele viaja na URL — que
 * fica salva na configuração do calendário de quem assina. É a mesma exposição
 * que o QR do app já tem, e o mesmo remédio serve: trocar o id no Cortex
 * revoga todas as assinaturas de uma vez.
 *
 * Por isso a resposta é sempre `private, no-store`: um calendário destes não
 * pode ficar guardado no cache de um intermediário.
 */

/** O contrato mínimo do Vercel, escrito à mão para não puxar dependência. */
type Req = { query: Record<string, string | string[] | undefined> }
type Res = {
  status: (n: number) => Res
  setHeader: (k: string, v: string) => void
  send: (corpo: string) => void
}

/**
 * Quantos anos de uma data comemorativa entram no calendario.
 *
 * Cinco, e nao um com repeticao: repeticao carrega uma descricao so, e a
 * idade mudaria de ano para ano sem o texto mudar junto. Cinco cobre o que
 * alguem olha para frente, e a janela anda sozinha porque o Cortex republica
 * o tempo todo.
 */
const ANOS_A_FRENTE = 5

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O que veio do banco pode não ser texto. */
const txt = (v: unknown): string => (typeof v === 'string' ? v : '')

type ItemCru = { especie?: unknown; nome?: unknown; detalhe?: unknown }

export default async function handler(req: Req, res: Res): Promise<void> {
  const bruto = req.query.vault
  const vault = Array.isArray(bruto) ? bruto[0] : bruto

  const url = process.env.VITE_SUPABASE_URL
  const chave = process.env.VITE_SUPABASE_CHAVE
  if (!url || !chave) {
    res.status(500).setHeader('content-type', 'text/plain; charset=utf-8')
    res.send('Este site foi publicado sem as variáveis do Supabase.')
    return
  }

  // Sem id válido não há o que servir — e responder com um calendário vazio
  // aqui faria quem errou a URL achar que a agenda dele é que está vazia.
  if (!vault || !UUID.test(vault)) {
    res.status(400).setHeader('content-type', 'text/plain; charset=utf-8')
    res.send('Informe o id do vault: /agenda.ics?vault=<id>')
    return
  }

  let itens: ItemCru[] = []
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/listar_cardapio`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: chave,
        authorization: `Bearer ${chave}`
      },
      body: JSON.stringify({ p_vault: vault })
    })
    if (!r.ok) throw new Error(`banco respondeu ${r.status}`)
    const dados: unknown = await r.json()
    itens = Array.isArray(dados) ? (dados as ItemCru[]) : []
  } catch {
    // 502, e não um calendário vazio: quem assina precisa distinguir "a agenda
    // está vazia" de "não deu para ler". Vazio faria o Google apagar tudo que
    // já tinha mostrado.
    res.status(502).setHeader('content-type', 'text/plain; charset=utf-8')
    res.send('Não deu para ler o cardápio agora.')
    return
  }

  /*
   * Só o que tem dia marcado vira evento.
   *
   * Prova, compromisso e tarefa — inclusive a data comemorativa, que sobe como
   * compromisso com a marca `comemorativa`. Suplemento, refeição e anotação
   * ficam de fora de propósito: nenhum deles é um compromisso com hora, e
   * jogá-los no calendário encheria o dia de linhas que ninguém marcou ali.
   */
  const ESPECIES = new Set(['prova', 'compromisso', 'tarefa'])
  const eventos: EventoIcs[] = []
  for (const i of itens) {
    const especie = txt(i.especie)
    if (!ESPECIES.has(especie)) continue
    const d = (i.detalhe ?? {}) as Record<string, unknown>
    const data = txt(d.data) || txt(d.prazo)
    if (!data) continue

    const partes = [txt(d.materia), txt(d.local)].filter(x => x !== '')
    // O caminho da nota é o id estável. Sem ele, o título: dois eventos de
    // mesmo nome virariam um só no calendário, o que ainda é melhor do que um
    // evento novo a cada leitura — que é o que um id sorteado causaria.
    const id = txt(d.path) || `${especie}:${txt(i.nome)}`

    /*
     * A data comemorativa vira UM EVENTO POR ANO, e não uma repetição.
     *
     * `RRULE:FREQ=YEARLY` parecia a resposta óbvia e estava errada: um evento
     * que se repete carrega UMA descrição para todas as vezes. O aniversário
     * de 1983 dizia "faz 43 anos" em 2026 — e continuava dizendo 43 em 2027,
     * em 2028 e para sempre, porque é o mesmo evento desenhado de novo.
     *
     * Com um evento por ano, cada um carrega a idade daquele ano. A janela é
     * curta de propósito: o Cortex republica o tempo todo, então ela anda
     * sozinha, e dez anos de aniversários de toda a família seria muito evento
     * para resolver um problema que não existe.
     */
    if (d.comemorativa === true) {
      const anoBase = Number(data.slice(0, 4))
      const mes = Number(data.slice(5, 7))
      const dia = Number(data.slice(8, 10))
      const naOcorrencia = typeof d.anos === 'number' ? d.anos : null
      const dois = (n: number): string => String(n).padStart(2, '0')

      for (let k = 0; k < ANOS_A_FRENTE; k++) {
        const ano = anoBase + k
        // 29 de fevereiro não existe todo ano. Cai no dia 28, e não em 1º de
        // março, porque quem nasceu em fevereiro comemora em fevereiro — a
        // mesma regra que `proximaOcorrencia` já usa no Cortex.
        const diaDoAno = Math.min(dia, diasNoMes(mes, ano))
        const idade = naOcorrencia === null ? null : naOcorrencia + k
        eventos.push({
          id: `${id}#${ano}`,
          titulo: txt(i.nome),
          data: `${ano}-${dois(mes)}-${dois(diaDoAno)}`,
          descricao: idade !== null && idade > 0 ? `faz ${idade} anos` : undefined
        })
      }
      continue
    }

    eventos.push({
      id,
      titulo: txt(i.nome),
      data,
      hora: txt(d.hora) || undefined,
      descricao: partes.length > 0 ? partes.join(' · ') : undefined
    })
  }

  res.status(200)
  res.setHeader('content-type', 'text/calendar; charset=utf-8')
  // O nome do arquivo importa para quem baixa em vez de assinar.
  res.setHeader('content-disposition', 'inline; filename="cortex.ics"')
  res.setHeader('cache-control', 'private, no-store')
  res.send(montarIcs(eventos, { nome: 'Cortex' }))
}
