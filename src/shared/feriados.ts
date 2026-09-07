/**
 * Os feriados — calculados, não baixados.
 *
 * ## Por que não uma API
 *
 * O plano antigo era consultar uma API de feriados. Três problemas mataram a
 * ideia, nesta ordem:
 *
 * 1. A janela do Cortex tem `connect-src 'none'` na CSP. Buscar de fora
 *    obrigaria a passar pelo processo principal e a guardar cache em disco —
 *    subsistema inteiro para uma informação que não muda.
 * 2. Nenhuma API pública tem dado MUNICIPAL confiável, e é justamente o
 *    municipal que ninguém sabe de cabeça.
 * 3. Feriado brasileiro é função fechada do ano. Dez datas fixas mais cinco
 *    derivadas da Páscoa, e a Páscoa se calcula desde 1582.
 *
 * Então aqui não há rede, não há cache, não há chave de API e não há nada
 * para quebrar em 2031 porque um site saiu do ar.
 *
 * ## Feriado não é nota
 *
 * Nada disto vira arquivo no vault. É camada de leitura: o calendário
 * pergunta "o que tem neste dia" e recebe a resposta calculada na hora. Se
 * virasse nota, o vault ganharia trinta arquivos por ano que ninguém
 * escreveu — e um deles um dia seria editado à mão e passaria a mentir.
 *
 * ## Feriado, facultativo e data comemorativa são três coisas
 *
 * A distinção não é preciosismo: uma delas fecha fórum e suspende prazo, a
 * outra depende de decreto, e a terceira não fecha nada. Misturar as três é
 * o erro que quase todo site de feriado comete.
 *
 * - `feriado`     — a lei manda fechar.
 * - `facultativo` — costuma fechar, mas depende de decreto do ano.
 * - data comemorativa — NÃO está aqui. É o tipo de nota `data-comemorativa`,
 *   que o dono cadastra, porque é dele decidir de quem é o aniversário.
 */

export type Abrangencia = 'nacional' | 'estadual' | 'municipal'

export type Feriado = {
  /** ISO `AAAA-MM-DD`. */
  data: string
  nome: string
  abrangencia: Abrangencia
  /** `feriado` fecha por lei; `facultativo` depende de decreto do ano. */
  especie: 'feriado' | 'facultativo'
  /**
   * A base legal.
   *
   * Está aqui para que ninguém "conserte" o que é escolha. Sem ela, a
   * primeira pessoa que estranhar a ausência de 14 de julho acrescenta a
   * data e ninguém nunca mais sabe por que ela está lá.
   */
  lei: string
}

const dois = (n: number): string => String(n).padStart(2, '0')

const iso = (ano: number, mes: number, dia: number): string =>
  `${ano}-${dois(mes)}-${dois(dia)}`

/**
 * O domingo de Páscoa, pelo algoritmo de Meeus/Jones/Butcher (gregoriano).
 *
 * Cinco feriados do ano dependem dele, e nenhum tem data fixa. As contas são
 * as do algoritmo publicado; não tente simplificá-las lendo linha a linha —
 * elas só fazem sentido juntas.
 *
 * Devolve mês (1–12) e dia, e não um `Date`, porque `Date` traz fuso junto e
 * fuso é como uma data vira o dia anterior sem ninguém pedir.
 */
export function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const total = h + l - 7 * m + 114
  return { mes: Math.floor(total / 31), dia: (total % 31) + 1 }
}

/**
 * Uma data a `dias` de distância da Páscoa, em ISO.
 *
 * Aqui `Date` é seguro porque a conta é feita e desfeita em horário local, e
 * a data nunca passa por `toISOString` — que é onde mora a viagem de fuso que
 * faz 1º de janeiro virar 31 de dezembro.
 */
function daPascoa(ano: number, dias: number): string {
  const p = pascoa(ano)
  const d = new Date(ano, p.mes - 1, p.dia)
  d.setDate(d.getDate() + dias)
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/**
 * Os feriados nacionais.
 *
 * Carnaval, Cinzas e Corpus Christi NÃO estão nesta lista: são ponto
 * facultativo por portaria, e não feriado por lei. Todo mundo fecha, e mesmo
 * assim a diferença importa — é ela que decide se um prazo corre.
 */
export function nacionais(ano: number): Feriado[] {
  const f = (data: string, nome: string, lei: string): Feriado =>
    ({ data, nome, abrangencia: 'nacional', especie: 'feriado', lei })

  return [
    f(iso(ano, 1, 1), 'Confraternização Universal', 'Lei 662/1949'),
    f(daPascoa(ano, -2), 'Sexta-feira Santa', 'Lei 662/1949'),
    f(iso(ano, 4, 21), 'Tiradentes', 'Lei 662/1949'),
    f(iso(ano, 5, 1), 'Dia do Trabalho', 'Lei 662/1949'),
    f(iso(ano, 9, 7), 'Independência', 'Lei 662/1949'),
    f(iso(ano, 10, 12), 'Nossa Senhora Aparecida', 'Lei 6.802/1980'),
    f(iso(ano, 11, 2), 'Finados', 'Lei 662/1949'),
    f(iso(ano, 11, 15), 'Proclamação da República', 'Lei 662/1949'),
    // Nacional desde 2024; antes disso valia só onde havia lei local.
    f(iso(ano, 11, 20), 'Consciência Negra', 'Lei 14.759/2023'),
    f(iso(ano, 12, 25), 'Natal', 'Lei 662/1949')
  ]
}

/** Os pontos facultativos nacionais que fecham quase tudo na prática. */
export function facultativos(ano: number): Feriado[] {
  const f = (data: string, nome: string): Feriado =>
    ({ data, nome, abrangencia: 'nacional', especie: 'facultativo', lei: 'portaria anual' })

  return [
    f(daPascoa(ano, -48), 'Carnaval (segunda)'),
    f(daPascoa(ano, -47), 'Carnaval'),
    f(daPascoa(ano, -46), 'Quarta-feira de Cinzas'),
    f(daPascoa(ano, 60), 'Corpus Christi')
  ]
}

/** Feriado estadual de São Paulo. */
export function estaduaisSP(ano: number): Feriado[] {
  return [{
    data: iso(ano, 7, 9),
    nome: 'Revolução Constitucionalista',
    abrangencia: 'estadual',
    especie: 'feriado',
    lei: 'Lei estadual 9.497/1997'
  }]
}

/**
 * Feriados municipais de Campinas.
 *
 * Uma data só, e é a que quase todo calendário de internet erra.
 *
 * **14 de julho NÃO está aqui.** É o aniversário da cidade e é data
 * comemorativa, não feriado: comércio abre, prazo corre, fórum funciona. Um
 * projeto para transformá-lo em feriado civil foi aprovado em comissão na
 * Câmara — enquanto não virar lei, o lugar dele é o tipo de nota
 * `data-comemorativa`, que o dono cadastra.
 *
 * Quem mudar de cidade troca esta função. É o único lugar do arquivo que
 * depende de onde a pessoa mora.
 */
export function municipaisCampinas(ano: number): Feriado[] {
  return [{
    data: iso(ano, 12, 8),
    nome: 'Nossa Senhora da Conceição',
    abrangencia: 'municipal',
    especie: 'feriado',
    lei: 'Lei municipal 173/1949'
  }]
}

/**
 * Tudo do ano, indexado por data.
 *
 * Um mapa, e não uma lista, porque quem chama é uma grade de calendário
 * perguntando dia a dia — e varrer trinta itens por célula, trinta e cinco
 * vezes por mês, para achar zero ou um, é trabalho à toa.
 *
 * O valor é uma LISTA porque duas coisas podem cair no mesmo dia: um
 * facultativo pode encostar num feriado estadual, e ficar com o último seria
 * perder o outro.
 *
 * Feriado antes de facultativo dentro do dia, e não por acaso: quando os dois
 * caem juntos, quem manda no prazo é o feriado.
 */
export function feriadosDoAno(ano: number): Map<string, Feriado[]> {
  const todos = [
    ...nacionais(ano),
    ...estaduaisSP(ano),
    ...municipaisCampinas(ano),
    ...facultativos(ano)
  ]
  const m = new Map<string, Feriado[]>()
  for (const f of todos) {
    const atual = m.get(f.data)
    if (atual) atual.push(f)
    else m.set(f.data, [f])
  }
  return m
}
