import { useState } from 'react'
import type { Tela } from '../App'
import { SubNavSaude } from './Saude'
import type { useEnvio, UsoDoCardapio } from '../envio'
import { medidas, cardios, areaLigada, type Medida } from '../cardapio'
import { diaLocal, eventoPeso } from '../montar'
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

  const temSaude = areaLigada(p.cardapio.cardapio, 'saude')
  const todas = temSaude ? medidas(p.cardapio.cardapio) : []
  // As oito últimas, que é o que cabe em barras num celular sem virar risco.
  const serie = todas.filter(m => m.peso !== null).slice(-8)
  const ultima = todas.length > 0 ? todas[todas.length - 1] : null
  const penultima = todas.length > 1 ? todas[todas.length - 2] : null
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
      p.envio.registrar(eventoPeso(Number(rascunho.replace(',', '.')), dia))
      setRascunho('')
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

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

          {/* O gráfico. Só com três ou mais pontos: duas barras não são uma
              evolução, são dois números lado a lado. */}
          {serie.length >= 3 && (
            <div className="peso-barras">
              {serie.map((m, i) => (
                <div key={m.data} className="peso-col">
                  <div
                    className={`peso-barra ${i === serie.length - 1 ? 'ultima' : ''}`}
                    style={{ height: `${(((m.peso as number) - base) / alcance) * 100}%` }}
                  />
                  <span className="peso-rot">
                    {i === serie.length - 1 ? 'hoje' : diaCurto(m.data)}
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

        {/* As quatro medidas, duas a duas. Cada uma some quando nunca foi
            medida: um cartão escrito "—" ocupa o mesmo espaço de um com dado
            e não diz nada. */}
        {ultima && ACOMPANHADAS.some(m => ultima[m.chave] !== null) && (
          <div className="medidas-grade">
            {ACOMPANHADAS.filter(m => ultima[m.chave] !== null).map(m => (
              <div key={m.chave} className="medida-cartao">
                <span className="medida-nome">{m.nome}</span>
                <span className="medida-valor">
                  {(ultima[m.chave] as number).toLocaleString('pt-BR')}
                  <i>{m.unidade}</i>
                </span>
                {penultima && (
                  <span className="medida-delta">
                    {delta(ultima[m.chave] as number, penultima[m.chave] as number | null, m.unidade)}
                  </span>
                )}
              </div>
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
