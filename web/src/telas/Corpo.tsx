import { useEffect, useState } from 'react'
import type { Tela } from '../App'
import { SubNavSaude } from './Saude'
import type { useEnvio, UsoDoCardapio } from '../envio'
import { medidas, cardios, areaLigada, type Medida } from '../cardapio'
import { diaLocal, eventoPeso, eventoMedida } from '../montar'
import { guardadoDoNavegador } from '../guardado'
import {
  lerMedidasLocais, guardarMedidasLocais, conciliarMedidas
} from '../medidasLocais'
import { Cabecalho, Aviso, Secao } from '../componentes'

/**
 * Corpo: o peso, a evolução, as medidas e o cardio.
 *
 * A tela `medidas` continua sendo o formulário de registro completo — dez
 * campos, de gordura a panturrilha. Esta é a de OLHAR: o peso grande, as
 * últimas semanas em barras, as quatro medidas que mudam, e o cardio recente.
 *
 * Só existe desde que o Cortex passou a publicar histórico. Antes, o celular
 * sabia enviar peso e nunca recebê-lo de volta, e um gráfico aqui seria
 * inventado.
 */

/** Só as quatro que o dono acompanha, na ordem do desenho. */
const ACOMPANHADAS: { chave: keyof Medida; nome: string; unidade: string }[] = [
  { chave: 'cintura', nome: 'Cintura', unidade: 'cm' },
  { chave: 'quadril', nome: 'Quadril', unidade: 'cm' },
  { chave: 'braco',   nome: 'Braço',   unidade: 'cm' },
  { chave: 'coxa',    nome: 'Coxa',    unidade: 'cm' }
]

/** Um dia sem nenhuma medida publicada — a base sobre a qual a local entra. */
const medidaVazia = (data: string): Medida => ({
  data,
  peso: null, gordura: null, cintura: null, quadril: null,
  braco: null, coxa: null, peito: null, panturrilha: null
})

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                      'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** `2026-09-10` → `10 set`. Sem `Date`: a string ISO já tem tudo. */
function diaCurto(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}`
}

/**
 * O dia da semana de uma data ISO.
 *
 * Montado dos NÚMEROS, e nunca de `new Date(iso)`: aquela forma lê a string
 * como UTC e devolve o dia anterior num fuso negativo — a corrida de segunda
 * apareceria como domingo.
 */
function diaDaSemana(iso: string): string {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
  return DIAS[d.getDay()]
}

/** Uma diferença com sinal, ou vazio quando não há com o que comparar. */
function delta(agora: number | null, antes: number | null, unidade: string): string {
  if (agora === null || antes === null) return ''
  const d = Math.round((agora - antes) * 10) / 10
  if (d === 0) return 'igual'
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('pt-BR')} ${unidade}`
}

export function Corpo(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const dia = diaLocal()
  const [rascunho, setRascunho] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  /** O que foi registrado agora e o Cortex ainda não devolveu. */
  const [locais, setLocais] = useState(() => lerMedidasLocais(guardadoDoNavegador, dia))

  const temSaude = areaLigada(p.cardapio.cardapio, 'saude')
  const doCardapio = temSaude ? medidas(p.cardapio.cardapio) : []

  /*
   * O que o vault sabe, mais o que acabou de sair daqui.
   *
   * Sem esta mistura, registrar o peso não mudava nada na tela: o número, o
   * gráfico e os cartões vêm todos do cardápio, e o cardápio só muda depois da
   * volta inteira pelo computador. Quem tocou em Salvar via exatamente a tela
   * de antes — e concluía que não tinha salvado.
   */
  const doDia = doCardapio.find(m => m.data === dia)
  const todas: Medida[] = Object.keys(locais).length === 0
    ? doCardapio
    : [
      ...doCardapio.filter(m => m.data !== dia),
      // O local vem por cima do publicado do mesmo dia: ele é mais novo.
      { ...(doDia ?? medidaVazia(dia)), ...locais, data: dia } as Medida
    ]

  // As oito últimas, que é o que cabe em barras num celular sem virar risco.
  const serie = todas.filter(m => m.peso !== null).slice(-8)
  const ultima = todas.length > 0 ? todas[todas.length - 1] : null
  const penultima = todas.length > 1 ? todas[todas.length - 2] : null

  /*
   * Some daqui o que o Cortex já absorveu.
   *
   * Sem isto, o valor local passaria a esconder o do vault para sempre — e uma
   * correção feita no computador nunca apareceria neste celular.
   */
  useEffect(() => {
    const publicado: Record<string, number> = {}
    if (doDia) {
      for (const [k, v] of Object.entries(doDia)) {
        if (typeof v === 'number' && Number.isFinite(v)) publicado[k] = v
      }
    }
    setLocais(conciliarMedidas(guardadoDoNavegador, dia, publicado))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cardapio.cardapio, dia])
  const sessoes = temSaude ? cardios(p.cardapio.cardapio).slice(0, 5) : []

  /*
   * A escala das barras começa ABAIXO do menor peso, e não em zero.
   *
   * Em zero, uma variação de um quilo em sessenta some: todas as barras
   * ficariam do mesmo tamanho e o gráfico não diria nada. Com a base logo
   * abaixo do mínimo, a diferença que interessa é a que ocupa a altura.
   */
  const pesos = serie.map(m => m.peso as number)
  const menor = pesos.length > 0 ? Math.min(...pesos) : 0
  const maior = pesos.length > 0 ? Math.max(...pesos) : 0
  const base = menor - Math.max(0.4, (maior - menor) * 0.25)
  const alcance = Math.max(0.1, maior - base)

  const salvarPeso = (): void => {
    try {
      const peso = Number(rascunho.replace(',', '.'))
      p.envio.registrar(eventoPeso(peso, dia))
      // Guarda antes de limpar o campo: é o que faz o número grande e a barra
      // de hoje mudarem no mesmo toque, em vez de só amanhã.
      setLocais(guardarMedidasLocais(guardadoDoNavegador, dia, { peso }))
      setRascunho('')
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  /** Uma medida do corpo, corrigida ali mesmo no cartão. */
  const salvarMedida = (chave: string, valor: number): void => {
    try {
      p.envio.registrar(eventoMedida({ [chave]: valor }, dia))
      setLocais(guardarMedidasLocais(guardadoDoNavegador, dia, { [chave]: valor }))
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  /** Um valor ainda a caminho do Cortex ganha a marca de pendente. */
  const pendente = (chave: string): boolean => locais[chave] !== undefined

  return (
    <div className="tema-hoje">
      <Cabecalho titulo="Corpo" />

      <div className="bloco">
        <SubNavSaude atual="corpo" irPara={p.irPara} />

        {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
        {!temSaude && (
          <Aviso tom="neutro">
            A área Saúde está desligada no Cortex. Ligue lá para esta tela ter
            conteúdo.
          </Aviso>
        )}

        <div className="cartao-ajuste">
          <div className="peso-topo">
            <span className="peso-numero">
              {ultima && ultima.peso !== null ? ultima.peso.toLocaleString('pt-BR') : '—'}
            </span>
            <span className="peso-unidade">kg</span>
            {ultima && penultima && (
              <span className="peso-delta">{delta(ultima.peso, penultima.peso, 'kg')}</span>
            )}
          </div>

          {/* O gráfico, desde a primeira pesagem.
              Antes ele só nascia com três pontos, e a tela de quem está
              começando não tinha gráfico nenhum — sem sinal de que passaria a
              ter. Uma barra só já mostra onde ela vai ficar, e a segunda já
              compara. A última é a mais recente e vem destacada. */}
          {serie.length >= 1 && (
            <div className="peso-barras">
              {serie.map((m, i) => (
                <div key={m.data} className="peso-col">
                  <div
                    className={`peso-barra ${i === serie.length - 1 ? 'ultima' : ''}`}
                    style={{ height: `${(((m.peso as number) - base) / alcance) * 100}%` }}
                    title={`${(m.peso as number).toLocaleString('pt-BR')} kg`}
                  />
                  {/* "hoje" só quando é hoje mesmo: a última pesagem pode ser
                      de semana passada, e chamá-la de hoje seria mentira. */}
                  <span className="peso-rot">
                    {m.data === dia ? 'hoje' : diaCurto(m.data)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="peso-acoes">
            <input
              className="peso-campo"
              value={rascunho}
              inputMode="decimal"
              placeholder={ultima && ultima.peso !== null
                ? String(ultima.peso).replace('.', ',')
                : '62,4'}
              aria-label="peso em quilos"
              onChange={e => setRascunho(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salvarPeso() }}
            />
            <button
              type="button"
              className="btn btn-principal peso-salvar"
              disabled={rascunho.trim() === ''}
              onClick={salvarPeso}
            >
              Salvar
            </button>
          </div>
        </div>

        {/* As quatro medidas, duas a duas, SEMPRE visíveis.
            Antes cada cartão sumia enquanto aquela medida nunca tivesse sido
            tirada — e aí não havia onde registrá-la pela primeira vez: era
            preciso adivinhar que a tela de Medidas existia. Agora o cartão
            vazio é o convite, e o toque no número abre o campo. */}
        {temSaude && (
          <div className="medidas-grade">
            {ACOMPANHADAS.map(m => (
              <MedidaCartao
                key={m.chave}
                nome={m.nome}
                unidade={m.unidade}
                valor={ultima ? (ultima[m.chave] as number | null) : null}
                delta={ultima && penultima
                  ? delta(ultima[m.chave] as number | null, penultima[m.chave] as number | null, m.unidade)
                  : ''}
                pendente={pendente(m.chave)}
                aoSalvar={v => salvarMedida(m.chave, v)}
              />
            ))}
          </div>
        )}

        {sessoes.length > 0 && (
          <div className="grupo">
            <Secao nome="Cardio recente" />
            {sessoes.map(c => (
              <div key={`${c.data}-${c.aparelho}`} className="cardio-linha">
                <span className="cardio-dia">{diaDaSemana(c.data)}</span>
                <span className="cardio-txt">
                  <strong>{c.aparelho || 'Cardio'}</strong>
                  <span>
                    {[
                      c.distancia ? `${c.distancia.toLocaleString('pt-BR')} km` : '',
                      c.pace
                    ].filter(Boolean).join(' · ') || diaCurto(c.data)}
                  </span>
                </span>
                <span className="cardio-min">{c.minutos} min</span>
              </div>
            ))}
          </div>
        )}

        {temSaude && todas.length === 0 && sessoes.length === 0 && !p.cardapio.erro && (
          <p className="secao-vazia">
            Nenhuma medida ainda. O peso que você salvar aqui aparece no gráfico
            depois de dar a volta pelo Cortex.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Um cartão de medida que também é o lugar de registrá-la.
 *
 * Fechado, é o número que se lê de relance. Tocado, vira um campo — a mesma
 * ideia do peso logo acima, e a razão de não existir um segundo formulário
 * escondido noutra tela: a medida que se quer corrigir é a que está na sua
 * frente.
 */
function MedidaCartao(p: {
  nome: string
  unidade: string
  valor: number | null
  delta: string
  pendente: boolean
  aoSalvar: (v: number) => void
}) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState('')

  const salvar = (): void => {
    const v = Number(rascunho.replace(',', '.'))
    // Zero e negativo não são medida de corpo; texto solto vira NaN. Nos três
    // casos o certo é não mandar nada, e não mandar um número inventado.
    if (Number.isFinite(v) && v > 0) p.aoSalvar(v)
    setRascunho('')
    setEditando(false)
  }

  if (editando) {
    return (
      <div className="medida-cartao">
        <span className="medida-nome">{p.nome}</span>
        <div className="medida-edita">
          <input
            className="medida-campo"
            inputMode="decimal"
            autoFocus
            value={rascunho}
            placeholder={p.valor !== null ? String(p.valor).replace('.', ',') : p.unidade}
            aria-label={`${p.nome} em ${p.unidade}`}
            onChange={e => setRascunho(e.target.value)}
            onBlur={salvar}
            onKeyDown={e => {
              if (e.key === 'Enter') salvar()
              if (e.key === 'Escape') { setRascunho(''); setEditando(false) }
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <button className="medida-cartao medida-toque" type="button"
      onClick={() => setEditando(true)}
      aria-label={`alterar ${p.nome}`}>
      <span className="medida-nome">{p.nome}</span>
      <span className="medida-valor">
        {p.valor !== null ? p.valor.toLocaleString('pt-BR') : '—'}
        <i>{p.unidade}</i>
      </span>
      {p.pendente
        ? <span className="medida-delta medida-pendente">só neste aparelho</span>
        : p.delta && <span className="medida-delta">{p.delta}</span>}
    </button>
  )
}
