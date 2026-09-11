import { useEffect, useMemo, useState } from 'react'
import { dobra } from '@compartilhado/busca'
import { diaLocal, eventoAnotacao, eventoItemEditado, eventoItemApagado } from '../montar'
import { guardadoDoNavegador } from '../guardado'
import { guardarAnotacao, lerAnotacoes, conciliarAnotacoes } from '../anotacoes'
import { todasAnotacoes, type AnotacaoPublicada } from '../cardapio'
import { Cabecalho, Aviso, Secao } from '../componentes'
import type { UsoDoCardapio, useEnvio } from '../envio'
import type { Tela } from '../App'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

const dois = (n: number): string => String(n).padStart(2, '0')

/**
 * O cabeçalho do grupo: "hoje", "ontem" ou a data por extenso.
 *
 * A string ISO é cortada direto para o dia e o mês. `Date` entra só na conta
 * de "ontem", e mesmo aí construído a partir dos números — nunca de
 * `new Date(iso)`, que interpreta a string como UTC e devolve o dia anterior
 * num fuso negativo.
 */
export function tituloDoGrupo(data: string, hoje: string): string {
  if (data === hoje) return 'hoje'

  const ontem = new Date(
    Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1, Number(hoje.slice(8, 10))
  )
  ontem.setDate(ontem.getDate() - 1)
  const isoOntem = `${ontem.getFullYear()}-${dois(ontem.getMonth() + 1)}-${dois(ontem.getDate())}`
  if (data === isoOntem) return 'ontem'

  const [a, m, d] = data.split('-').map(Number)
  // O ano só aparece quando não é o corrente: escrever "2026" em toda linha
  // de um app usado em 2026 é ruído.
  return String(a) === hoje.slice(0, 4)
    ? `${d} de ${MESES[m - 1]}`
    : `${d} de ${MESES[m - 1]} de ${a}`
}

/**
 * Uma nota da lista.
 *
 * A barrinha à esquerda faz o trabalho que a estrela fazia: diz o que a nota é
 * sem gastar uma linha para isso. Azul é prioridade, escura é de hoje, cinza é
 * o resto — e como ela corre a altura inteira do cartão, funciona também
 * quando o texto tem cinco linhas, o que um ícone no topo não faz.
 */
function Nota({ a, etiqueta, hoje, aoEditar, aoExcluir }: {
  a: AnotacaoPublicada
  /** `PRIORIDADE`, `DE HOJE` — a faixa miúda dentro do cartão. */
  etiqueta?: string
  hoje: string
  /** Só quem tem `path` pode ser mexida: é a referência da nota no vault. */
  aoEditar: (path: string, texto: string) => void
  aoExcluir: (path: string) => void
}) {
    const [acoes, setAcoes] = useState(false)
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(a.texto)
  const tom = a.prioridade ? 'pri' : a.data === hoje ? 'hoje' : 'normal'

  /*
   * Sem `path` não há o que editar nem o que apagar.
   *
   * É o caso da anotação que ainda está só neste aparelho: ela não existe no
   * vault, então não há arquivo para alcançar. Mostrar os botões ali seria
   * oferecer duas ações que não teriam efeito nenhum.
   */
  const podeMexer = Boolean(a.path)

  /*
   * Anotação não abre.
   *
   * Não há o que revelar: ela é o recado inteiro, escrito numa linha para não
   * esquecer de resolver alguma coisa. Houve uma seta de expandir aqui, e ela
   * era o resto de uma ideia errada — a de que a anotação teria um "dentro".
   * O texto aparece por completo, e o único botão do cartão é o que mexe nela.
   */

  return (
    <div className="nota" data-tom={tom}>
      <div className="nota-linha">
        <span className="nota-barra" aria-hidden="true" />
        <div className="nota-corpo">
          {etiqueta && <span className="nota-etiqueta">{etiqueta}</span>}
          <p className="anotada-texto">{a.texto}</p>
          <span className="nota-quando">
            {a.data === undefined
              ? 'fixa'
              : a.data === hoje
                ? 'hoje'
                : tituloDoGrupo(a.data, hoje)}
          </span>
        </div>
        {/* Mexer na nota fica atrás do "⋯", como nos cartões de Chegando.
            Editar e excluir lado a lado com o texto convidariam ao toque
            errado numa lista que existe para ser lida, não operada. */}
        {podeMexer && (
          <button
            className="item-ver nota-mais"
            type="button"
            aria-expanded={acoes}
            aria-label={`ações de ${a.titulo}`}
            onClick={() => setAcoes(v => !v)}
          >
            ⋯
          </button>
        )}
      </div>

      {editando ? (
        <div className="nota-editar">
          <textarea
            className="nota-editar-campo"
            value={rascunho}
            rows={3}
            autoFocus
            aria-label={`editar ${a.titulo}`}
            onChange={e => setRascunho(e.target.value)}
          />
          <div className="nota-editar-acoes">
            <button
              className="btn btn-principal"
              type="button"
              disabled={rascunho.trim() === '' || rascunho.trim() === a.texto.trim()}
              onClick={() => {
                if (a.path) aoEditar(a.path, rascunho.trim())
                setEditando(false)
                setAcoes(false)
              }}
            >
              Salvar
            </button>
            <button className="btn-fantasma" type="button"
              onClick={() => { setEditando(false); setRascunho(a.texto) }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : acoes && (
        <div className="nota-acoes">
          <button className="acao-lado" type="button"
            onClick={() => { setRascunho(a.texto); setEditando(true) }}>
            editar
          </button>
          <button
            className="acao-lado acao-destrutiva"
            type="button"
            onClick={() => {
              // Apagar no vault não tem desfazer pelo celular, e por isso a
              // confirmação está aqui e não numa desmarcação reversível.
              if (!a.path) return
              if (!window.confirm(`Apagar "${a.texto.slice(0, 40)}" do seu Cortex?`)) return
              aoExcluir(a.path)
              setAcoes(false)
            }}
          >
            excluir
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Todas as notas do vault, no celular.
 *
 * O Hoje mostra as do dia; esta mostra o conjunto. A separação é do dono:
 * "em notas mostra todas as minhas notas, mas fora mostra as notas de hoje".
 *
 * Agrupadas por dia, da mais nova para a mais velha, com as fixas em cima —
 * elas não pertencem a dia nenhum, e enfiá-las na data de criação faria a
 * "senha do wifi" descer para o fundo da lista com o tempo.
 */
export function Notas(p: {
  cardapio: UsoDoCardapio
  envio: ReturnType<typeof useEnvio>
  irPara: (t: Tela) => void
}) {
  const hoje = diaLocal()
  const [busca, setBusca] = useState('')
  const [rascunho, setRascunho] = useState('')
  const [prioridade, setPrioridade] = useState(false)

  /*
   * Salva e limpa o campo na hora.
   *
   * A nota aparece na lista quando o Cortex a devolver; enquanto isso ela
   * fica na cópia local, que é a mesma que a tela Hoje usa. Esperar a volta
   * para limpar o campo faria quem escreve sem sinal achar que não salvou.
   */
  const salvarNota = (): void => {
    const texto = rascunho.trim()
    if (texto === '') return
    p.envio.registrar(eventoAnotacao(texto, hoje, prioridade))
    // O retorno entra no estado na hora. Sem isto a nota era gravada e a tela
    // continuava igual — ela só reaparecia quando o Cortex a devolvesse, o
    // que com o computador desligado é no dia seguinte, ou nunca.
    setLocais(guardarAnotacao(guardadoDoNavegador, hoje, texto, prioridade))
    setRascunho('')
    setPrioridade(false)
  }
  /*
   * Editar e apagar mandam o CAMINHO da nota, nunca o título.
   *
   * Duas anotações podem ter o mesmo texto, e casar por título alcançaria a
   * errada. O caminho vem publicado no cardápio junto de cada uma.
   *
   * O texto viaja duas vezes, como `titulo` e como `texto`: na anotação ele
   * mora nos dois lugares — o nome do arquivo e o campo — e mudar só um
   * deixaria a nota dizendo duas coisas diferentes sobre si mesma.
   */
  const editarNota = (path: string, texto: string): void => {
    p.envio.registrar(eventoItemEditado(path, { titulo: texto, texto }, hoje))
  }
  const excluirNota = (path: string): void => {
    p.envio.registrar(eventoItemApagado(path, hoje))
  }

  const todas = todasAnotacoes(p.cardapio.cardapio)

  /*
   * As que este aparelho escreveu e o Cortex ainda não devolveu.
   *
   * A tela Hoje sempre mostrou as duas fontes; esta lia só o cardápio, e por
   * isso engolia a nota recém-escrita. Mesma função de conciliação das duas,
   * de propósito: duas regras para a mesma cópia local dariam telas que
   * discordam sobre a mesma anotação.
   */
  const [locais, setLocais] = useState(() => lerAnotacoes(guardadoDoNavegador, hoje))
  useEffect(() => {
    setLocais(conciliarAnotacoes(
      guardadoDoNavegador, hoje,
      todas.filter(a => a.data === hoje).map(a => a.texto)
    ))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cardapio.cardapio, hoje])

  /* A cópia local no mesmo formato da publicada, para a lista ser uma só. */
  const comoPublicada = (a: { texto: string; prioridade: boolean }): AnotacaoPublicada => ({
    titulo: a.texto.split('\n')[0].slice(0, 80),
    texto: a.texto,
    prioridade: a.prioridade,
    data: hoje
  })
  const termoBusca = dobra(busca.trim())
  const locaisAchadas = locais
    .filter(a => termoBusca === '' || dobra(a.texto).includes(termoBusca))
    .map(comoPublicada)
  const locaisPri = locaisAchadas.filter(a => a.prioridade)
  const locaisComuns = locaisAchadas.filter(a => !a.prioridade)

  const achadas = useMemo(() => {
    const termo = dobra(busca.trim())
    if (termo === '') return todas
    return todas.filter(a =>
      dobra(a.titulo).includes(termo) ||
      dobra(a.texto).includes(termo) ||
      dobra(a.corpo ?? '').includes(termo))
  }, [todas, busca])

  /*
   * A ordem: prioridade, hoje, fixas, o resto por dia.
   *
   * Antes eram as fixas e depois os dias. O problema é que prioridade e "de
   * hoje" são as duas razões para alguém ABRIR esta tela, e as duas ficavam
   * espalhadas no meio da cronologia — uma nota marcada como prioridade na
   * terça descia para o fundo na quinta, justamente por ser de terça.
   *
   * Cada nota aparece uma vez só: quem entrou em prioridade sai das outras
   * listas, e quem é de hoje sai dos grupos por dia. Repetir a mesma nota em
   * duas seções faria a contagem mentir e o toque de apagar virar adivinhação.
   */
  const prioritarias = achadas.filter(a => a.prioridade)
  const usadas = new Set(prioritarias)

  const deHoje = achadas.filter(a => !usadas.has(a) && a.data === hoje)
  for (const a of deHoje) usadas.add(a)

  const fixas = achadas.filter(a => !usadas.has(a) && a.data === undefined)
  for (const a of fixas) usadas.add(a)

  /*
   * Os grupos, na ordem em que vieram.
   *
   * `todasAnotacoes` já devolve da mais nova para a mais velha, então basta
   * quebrar quando a data muda — sem reordenar aqui, que seria uma segunda
   * regra de ordem para a mesma lista.
   */
  const grupos: { data: string; itens: AnotacaoPublicada[] }[] = []
  for (const a of achadas) {
    if (usadas.has(a) || a.data === undefined) continue
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.data === a.data) ultimo.itens.push(a)
    else grupos.push({ data: a.data, itens: [a] })
  }

  return (
    <div className="tema-vida">
      <Cabecalho titulo="Notas" />
      {p.cardapio.erro && <Aviso>{p.cardapio.erro}</Aviso>}

      <div className="bloco">
        {/*
          * Escrever e ler na mesma tela.
          *
          * Eram duas: `anotacao` para escrever, `notas` para ler. O desenho
          * junta, e tem razão — a lista é o melhor lugar para escrever, porque
          * o que já está ali é o que lembra o que falta anotar. A tela de
          * escrever continua existindo para o atalho do Hoje, que abre com o
          * campo grande e o teclado pronto.
          */}
        <div className="cartao-ajuste nota-nova">
          <div className="nota-nova-tag">anotação rápida</div>
          <input
            className="nota-nova-campo"
            value={rascunho}
            placeholder="Escreve e aperta Enter…"
            onChange={e => setRascunho(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') salvarNota() }}
          />
          <div className="nota-nova-pe">
            <button
              type="button"
              className={`nota-pri ${prioridade ? 'ligada' : ''}`}
              aria-pressed={prioridade}
              onClick={() => setPrioridade(v => !v)}
            >
              <i />Prioridade
            </button>
            <button
              type="button"
              className="btn btn-principal nota-salvar"
              disabled={rascunho.trim() === ''}
              onClick={salvarNota}
            >
              Salvar
            </button>
          </div>
        </div>

        {/* A busca só aparece quando há o que procurar: um campo de busca
            sobre quatro itens é um campo que atrapalha. */}
        {todas.length > 4 && (
          <div className="busca">
            <input
              className="busca-campo"
              type="search"
              value={busca}
              placeholder="procurar nas notas"
              onChange={e => setBusca(e.target.value)}
            />
          </div>
        )}

        {/* As locais entram nas mesmas duas seções das publicadas, e em cima:
            são as mais novas, e são as que a pessoa acabou de escrever. */}
        {(prioritarias.length + locaisPri.length) > 0 && <Secao nome="Prioridade" />}
        {locaisPri.map((a, i) => (
          <Nota key={`pri-local:${i}`} a={a} hoje={hoje} etiqueta="prioridade" aoEditar={editarNota} aoExcluir={excluirNota} />
        ))}
        {prioritarias.map(a => <Nota key={`pri:${a.titulo}`} a={a} hoje={hoje} etiqueta="prioridade" aoEditar={editarNota} aoExcluir={excluirNota} />)}

        {(deHoje.length + locaisComuns.length) > 0 && (
          <Secao nome="De hoje" contagem={String(deHoje.length + locaisComuns.length)} />
        )}
        {locaisComuns.map((a, i) => (
          <Nota key={`hoje-local:${i}`} a={a} hoje={hoje} etiqueta="de hoje" aoEditar={editarNota} aoExcluir={excluirNota} />
        ))}
        {deHoje.map(a => <Nota key={`hoje:${a.titulo}`} a={a} hoje={hoje} etiqueta="de hoje" aoEditar={editarNota} aoExcluir={excluirNota} />)}

        {fixas.length > 0 && <Secao nome="Fixas" />}
        {fixas.map(a => <Nota key={`fixa:${a.titulo}`} a={a} hoje={hoje} aoEditar={editarNota} aoExcluir={excluirNota} />)}

        {grupos.map(g => (
          <div key={g.data}>
            <Secao nome={tituloDoGrupo(g.data, hoje)} contagem={String(g.itens.length)} />
            {g.itens.map(a => <Nota key={`${g.data}:${a.titulo}`} a={a} hoje={hoje} aoEditar={editarNota} aoExcluir={excluirNota} />)}
          </div>
        ))}

        {achadas.length === 0 && locaisAchadas.length === 0 && (
          <p className="secao-vazia">
            {todas.length === 0 && locais.length === 0
              ? 'Nenhuma nota ainda. As que você escrever aqui ou no Cortex aparecem nesta lista.'
              : `Nada com "${busca.trim()}".`}
          </p>
        )}
      </div>
    </div>
  )
}
