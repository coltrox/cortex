import { useMemo, useState } from 'react'
import { dobra } from '@compartilhado/busca'
import { Marcacao } from '../marcacao'
import { diaLocal, eventoAnotacao } from '../montar'
import { guardadoDoNavegador } from '../guardado'
import { guardarAnotacao } from '../anotacoes'
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

/** Uma nota da lista. Abre e fecha pela seta, como a tarefa do Hoje. */
function Nota({ a }: { a: AnotacaoPublicada }) {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="nota" data-prioridade={a.prioridade ? 'sim' : undefined}>
      <div className="nota-linha">
        <div className="nota-corpo">
          {a.prioridade && <span className="anotada-estrela" aria-label="prioridade">★</span>}
          <p className="anotada-texto">{a.texto}</p>
          {a.permanente && <span className="anotada-marca">fixa</span>}
        </div>
        {/* Mesma seta da tarefa do Hoje, pelo mesmo motivo: o texto longo
            fica guardado até alguém pedir, e a lista continua sendo lista. */}
        {a.corpo && (
          <button
            className="item-ver"
            type="button"
            aria-expanded={aberto}
            aria-label={`${aberto ? 'Esconder' : 'Ver'} ${a.titulo}`}
            onClick={() => setAberto(v => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5.5 7 9 10.5 12.5 7" />
            </svg>
          </button>
        )}
      </div>
      {aberto && a.corpo && (
        <div className="corpo-texto"><Marcacao texto={a.corpo} /></div>
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
    guardarAnotacao(guardadoDoNavegador, hoje, texto, prioridade)
    setRascunho('')
    setPrioridade(false)
  }
  const todas = todasAnotacoes(p.cardapio.cardapio)

  const achadas = useMemo(() => {
    const termo = dobra(busca.trim())
    if (termo === '') return todas
    return todas.filter(a =>
      dobra(a.titulo).includes(termo) ||
      dobra(a.texto).includes(termo) ||
      dobra(a.corpo ?? '').includes(termo))
  }, [todas, busca])

  const fixas = achadas.filter(a => a.data === undefined)
  const comData = achadas.filter(a => a.data !== undefined)

  /*
   * Os grupos, na ordem em que vieram.
   *
   * `todasAnotacoes` já devolve da mais nova para a mais velha, então basta
   * quebrar quando a data muda — sem reordenar aqui, que seria uma segunda
   * regra de ordem para a mesma lista.
   */
  const grupos: { data: string; itens: AnotacaoPublicada[] }[] = []
  for (const a of comData) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.data === a.data) ultimo.itens.push(a)
    else grupos.push({ data: a.data as string, itens: [a] })
  }

  return (
    <div className="tema-vida">
      <Cabecalho titulo="Notas" aoVoltar={() => p.irPara('hoje')} />
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

        {fixas.length > 0 && <Secao nome="Fixas" />}
        {fixas.map(a => <Nota key={`fixa:${a.titulo}`} a={a} />)}

        {grupos.map(g => (
          <div key={g.data}>
            <Secao nome={tituloDoGrupo(g.data, hoje)} contagem={String(g.itens.length)} />
            {g.itens.map(a => <Nota key={`${g.data}:${a.titulo}`} a={a} />)}
          </div>
        ))}

        {achadas.length === 0 && (
          <p className="secao-vazia">
            {todas.length === 0
              ? 'Nenhuma nota ainda. As que você escrever aqui ou no Cortex aparecem nesta lista.'
              : `Nada com "${busca.trim()}".`}
          </p>
        )}
      </div>
    </div>
  )
}
