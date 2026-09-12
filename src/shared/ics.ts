/**
 * O calendário do Cortex, no formato que Google e iPhone sabem assinar.
 *
 * ## Por que um arquivo, e não a API do Google
 *
 * A API do Google exigiria um aplicativo registrado, tela de consentimento,
 * chave secreta e token que expira — e serviria só ao Google: o iPhone não a
 * entende. Um endereço que devolve `text/calendar` os dois assinam, sem login
 * nenhum, e é o mesmo endereço.
 *
 * O preço é honesto: a assinatura é de MÃO ÚNICA. O que está no Cortex aparece
 * no calendário; o que for criado no calendário não volta. E a atualização
 * fica a cargo de quem assina — o Google costuma reler de 8 em 8 horas, o
 * iPhone deixa escolher.
 *
 * ## O formato
 *
 * RFC 5545. É antigo e cheio de regras bobas, e as três que importam aqui são:
 * linha termina em CRLF, linha não passa de 75 octetos (dobra-se com um espaço
 * no começo da seguinte), e vírgula, ponto e vírgula, barra invertida e quebra
 * de linha precisam de escape. Errar qualquer uma faz o calendário inteiro ser
 * recusado em silêncio — e é por isso que isto tem teste.
 */

export type EventoIcs = {
  /** Estável entre publicações: é como o calendário sabe que é o mesmo evento. */
  id: string
  titulo: string
  /** ISO `AAAA-MM-DD`. Dia inteiro, sem hora. */
  data: string
  /** `HH:MM`, quando há. Sem ela o evento ocupa o dia. */
  hora?: string
  descricao?: string
  /** Repete todo ano, na mesma data: aniversário e afins. */
  anual?: boolean
}

/** Escapa o que o formato reserva. A barra invertida vem primeiro, sempre. */
function escapar(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Dobra a linha em 75 octetos, como manda o formato.
 *
 * Conta OCTETOS, e não caracteres: "Aniversário" tem 11 letras e 12 bytes em
 * UTF-8, e cortar por caractere estoura o limite em qualquer título com
 * acento — que aqui é quase todos. A continuação começa com um espaço, e o
 * corte nunca cai no meio de um caractere de vários bytes.
 */
function dobrar(linha: string): string[] {
  const cod = new TextEncoder()
  if (cod.encode(linha).length <= 75) return [linha]

  const out: string[] = []
  let atual = ''
  let tamanho = 0
  // O limite da primeira linha é 75; o das seguintes é 74, porque elas gastam
  // um octeto com o espaço da continuação.
  let teto = 75
  for (const ch of linha) {
    const n = cod.encode(ch).length
    if (tamanho + n > teto) {
      out.push(atual)
      atual = ''
      tamanho = 0
      teto = 74
    }
    atual += ch
    tamanho += n
  }
  if (atual !== '') out.push(atual)
  return out.map((l, i) => (i === 0 ? l : ' ' + l))
}

/** `2026-10-18` → `20261018`. O formato não quer os hífens. */
const soNumeros = (iso: string): string => iso.replace(/-/g, '')

/** `2026-10-18` + `14:30` → `20261018T143000`. Hora local, sem fuso. */
function comHora(data: string, hora: string): string {
  return `${soNumeros(data)}T${hora.replace(':', '')}00`
}

/**
 * O dia seguinte, no formato compacto.
 *
 * Evento de dia inteiro termina no dia SEGUINTE ao que ocupa: `DTEND` é
 * exclusivo no formato. Sem isto o Google desenha um evento de zero dias e
 * alguns clientes simplesmente não o mostram.
 */
function diaSeguinte(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const data = new Date(Date.UTC(a, m - 1, d))
  data.setUTCDate(data.getUTCDate() + 1)
  const dois = (n: number): string => String(n).padStart(2, '0')
  return `${data.getUTCFullYear()}${dois(data.getUTCMonth() + 1)}${dois(data.getUTCDate())}`
}

/** O carimbo obrigatório de cada evento, em UTC. */
function carimboDe(d: Date): string {
  const dois = (n: number): string => String(n).padStart(2, '0')
  return [
    d.getUTCFullYear(), dois(d.getUTCMonth() + 1), dois(d.getUTCDate()), 'T',
    dois(d.getUTCHours()), dois(d.getUTCMinutes()), dois(d.getUTCSeconds()), 'Z'
  ].join('')
}

/**
 * Monta o calendário inteiro.
 *
 * `agora` entra por parâmetro para o teste não depender do relógio: o campo
 * `DTSTAMP` é obrigatório e mudaria a cada execução.
 */
export function montarIcs(
  eventos: EventoIcs[],
  opcoes: { nome?: string; agora?: Date } = {}
): string {
  const carimbo = carimboDe(opcoes.agora ?? new Date())

  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cortex//Agenda//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(opcoes.nome ?? 'Cortex')}`,
    // Sugestão de intervalo de releitura. É uma dica, não uma ordem: quem
    // assina decide, e o Google costuma reler quando quer.
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H'
  ]

  for (const e of eventos) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data)) continue
    if (!e.titulo.trim()) continue

    linhas.push('BEGIN:VEVENT')
    linhas.push(`UID:${escapar(e.id)}@cortex`)
    linhas.push(`DTSTAMP:${carimbo}`)

    if (e.hora && /^\d{2}:\d{2}$/.test(e.hora)) {
      linhas.push(`DTSTART:${comHora(e.data, e.hora)}`)
    } else {
      linhas.push(`DTSTART;VALUE=DATE:${soNumeros(e.data)}`)
      linhas.push(`DTEND;VALUE=DATE:${diaSeguinte(e.data)}`)
    }

    if (e.anual) linhas.push('RRULE:FREQ=YEARLY')
    linhas.push(`SUMMARY:${escapar(e.titulo.trim())}`)
    if (e.descricao?.trim()) linhas.push(`DESCRIPTION:${escapar(e.descricao.trim())}`)
    linhas.push('END:VEVENT')
  }

  linhas.push('END:VCALENDAR')
  // CRLF, e com quebra no fim: o formato exige, e alguns clientes recusam o
  // arquivo inteiro sem ela.
  return linhas.flatMap(dobrar).join('\r\n') + '\r\n'
}
