import { dobra } from './busca'

/**
 * O corpo de uma nota, preparado para ser lido fora do Cortex.
 *
 * Mora em `shared/` porque a mesma regra roda em DOIS lugares: o Cortex, ao
 * publicar (para não mandar o que ninguém vai ler), e o celular, ao desenhar
 * (para o que já está publicado sumir na hora, sem esperar o computador
 * republicar). Duas implementações divergiriam — uma ganharia um caso, a
 * outra não, e o mesmo texto apareceria diferente nas duas pontas.
 *
 * As funções são idempotentes: rodar de novo sobre um texto já limpo não muda
 * nada. É o que permite aplicá-las nas duas pontas sem medo.
 */

/** O título é o da seção de links? Sem acento e sem caixa, como se digita. */
const ehDependencias = (titulo: string): boolean =>
  dobra(titulo).includes('dependencias da rede')

/**
 * Tira a seção "Dependências da Rede".
 *
 * Toda nota deste vault começa com esse bloco de `[[links]]` — é a rede que
 * dá sentido ao vault no computador, e o protocolo de escrita exige que ela
 * venha logo depois do frontmatter. Fora do Cortex ela não serve para nada:
 * os `[[links]]` não abrem coisa alguma, e por estarem no topo eram as
 * primeiras cinco linhas de TODA nota — abrir "Escada 30 min" no celular
 * mostrava quatro links antes de dizer o que fazer.
 *
 * O corte é APERTADO de propósito: depois do título, some só o que a seção
 * de fato contém — linha em branco e item de lista —, mais a régua `---` que
 * a fecha no formato das notas. Qualquer outra linha encerra o corte e fica.
 *
 * A primeira versão ia do título até o próximo título de nível igual ou mais
 * alto. Numa nota sem régua e sem outro título — que existe — isso comia o
 * texto inteiro e publicava a tarefa vazia. Perder conteúdo em silêncio é
 * muito pior do que deixar escapar um subtítulo perdido dentro do bloco de
 * links, então a regra passou a ser esta.
 */
export function semDependenciasDaRede(corpo: string): string {
  const linhas = corpo.split(/\r?\n/)
  const out: string[] = []
  let pulando = false

  for (const linha of linhas) {
    const t = linha.trim()

    if (pulando) {
      // A régua fecha a seção e sai junto: é o rodapé do bloco de links, e
      // sozinha no topo do texto seria lixo herdado de algo que não está lá.
      if (/^-{3,}$/.test(t)) { pulando = false; continue }
      if (t === '' || /^[-*+]\s+/.test(t)) continue
      // Qualquer outra coisa já é o texto da nota.
      pulando = false
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(t)
    if (titulo && ehDependencias(titulo[2])) { pulando = true; continue }
    out.push(linha)
  }

  return out.join('\n').trim()
}

/**
 * Troca `[[Nota]]` e `[[Nota|apelido]]` pelo texto que a pessoa lê.
 *
 * Os colchetes são sintaxe de link do vault e, fora do Cortex, não levam a
 * lugar nenhum — no celular são dois pares de colchetes em volta de um nome,
 * e nada mais. O NOME continua valendo, porque é a referência que a frase
 * faz; os colchetes, não.
 *
 * Com apelido, vence o apelido: foi ele que a pessoa escreveu para ser lido.
 * A âncora (`[[Nota#Seção]]`) some junto, pelo mesmo motivo — aponta para um
 * pedaço de um arquivo que não existe deste lado.
 */
export function semColchetesDeLink(texto: string): string {
  return texto.replace(/\[\[([^\]]+)\]\]/g, (_, dentro: string) => {
    const partes = dentro.split('|')
    if (partes.length > 1) return partes.slice(1).join('|').trim()
    return partes[0].split('#')[0].trim() || dentro.trim()
  })
}
