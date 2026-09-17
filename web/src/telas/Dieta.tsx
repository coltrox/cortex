import { useEffect, useState } from 'react'
import type { Tela } from '../App'
import { SubNavSaude } from './Saude'
import type { useEnvio, useCardapio } from '../envio'
import { refeicoesDoPlano, areaLigada } from '../cardapio'
import {
  eventoRefeicaoPlano, diaLocal, NIVEIS_REFEICAO, FATOR_NIVEL, type NivelRefeicao
} from '../montar'
import { guardadoDoNavegador } from '../guardado'
import { jaFeitos, marcarFeito, desmarcarFeito } from '../feitos'
import { Cabecalho, Check, Detalhe, Aviso } from '../componentes'

/**
 * A dieta do dia.
 *
 * Era uma seção no fim da tela Hoje, atrás de suplementos, tarefas e
 * anotações. Virou aba própria no desenho `Rotina` por um motivo prático: o
 * plano tem cinco ou seis refeições, cada uma com uma lista de itens, e isso
 * é meia tela — dentro de Hoje, empurrava todo o resto para baixo da dobra.
 *
 * Hoje continua mostrando o resumo com o toque de marcar. Aqui está o que não
 * cabia lá: quanto do plano já foi comido, em caloria e em contagem, e o que
 * cada refeição tem dentro.
 */

/** Como cada nível se chama na tela. */
const ROTULO_NIVEL: Record<NivelRefeicao, string> = {
  tudo: 'tudo', metade: 'metade', pouco: 'pouco'
}

/** Um número só quando é número de verdade e maior que zero. */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

function txt(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Número do dia: `null` quando não foi ajustado (vale o do plano). */
function numDia(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

/**
 * O que foi respondido sobre uma refeição hoje: quanto comeu, o que trocou,
 * e — quando a refeição mudou do plano — os itens e os números do dia.
 * `itens` vazio e números `null` querem dizer "igual ao plano".
 */
type DetalheDia = { nivel: NivelRefeicao; troca: string; itens: string; kcal: number | null; prot: number | null }
const SEM_DETALHE: DetalheDia = { nivel: 'tudo', troca: '', itens: '', kcal: null, prot: null }

export function Dieta(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: ReturnType<typeof useCardapio>
  irPara: (t: Tela) => void
}) {
  const dia = diaLocal()
  const [feitos, setFeitos] = useState<string[]>(() => jaFeitos(guardadoDoNavegador, dia))
  /** Qual refeição está com o painel aberto — uma de cada vez. */
  const [aberta, setAberta] = useState<string | null>(null)
  /**
   * O que foi respondido agora, antes de o Cortex confirmar.
   *
   * Mesma ideia das marcas locais logo abaixo, e pelo mesmo motivo: entre o
   * toque e o cardápio voltar do banco passam segundos ou minutos, e sem isto
   * o chip escolhido voltaria ao lugar anterior na frente da pessoa.
   */
  const [rascunho, setRascunho] = useState<Record<string, DetalheDia>>({})

  const temSaude = areaLigada(p.cardapio.cardapio, 'saude')
  // Com o dia: o pré-treino de segunda a sexta não aparece no fim de semana.
  const refeicoes = temSaude ? refeicoesDoPlano(p.cardapio.cardapio, dia) : []

  /*
   * A marca local só existe até o Cortex confirmar.
   *
   * É o mesmo mecanismo da tela Hoje, e de propósito: as duas mexem na MESMA
   * refeição, e duas regras diferentes fariam marcar aqui e ver desmarcado
   * lá. Quando o cardápio já traz `feito`, a marca local sai do disco — ela
   * cumpriu o papel de adiantar a resposta enquanto o evento subia.
   */
  useEffect(() => {
    const guardadas = jaFeitos(guardadoDoNavegador, dia)
    for (const r of refeicoes) {
      const chave = `refeicao:${r.nome}`
      const confirmado = r.detalhe.feito === true
      if (confirmado && guardadas.includes(chave)) desmarcarFeito(guardadoDoNavegador, dia, chave)
      if (!confirmado && guardadas.includes(`nao-${chave}`)) {
        desmarcarFeito(guardadoDoNavegador, dia, `nao-${chave}`)
      }
    }
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    // O rascunho cai fora assim que o cardápio diz a mesma coisa: passado
    // esse ponto ele deixaria de adiantar a resposta e passaria a esconder o
    // que o vault tem, inclusive uma correção feita no computador.
    setRascunho(atual => {
      const out: typeof atual = {}
      for (const [nome, r] of Object.entries(atual)) {
        const doCardapio = refeicoes.find(x => x.nome === nome)?.detalhe
        const nivel = txt(doCardapio?.nivel) || 'tudo'
        const troca = txt(doCardapio?.troca)
        if (nivel === r.nivel && troca === r.troca && txt(doCardapio?.itensDia) === r.itens &&
          numDia(doCardapio?.kcalDia) === r.kcal && numDia(doCardapio?.protDia) === r.prot) continue
        out[nome] = r
      }
      return out
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cardapio.cardapio, dia])

  const estaFeito = (chave: string, doCardapio: boolean): boolean =>
    !feitos.includes(`nao-${chave}`) && (doCardapio || feitos.includes(chave))

  /**
   * Quanto foi comido e o que entrou no lugar — o que a tela deve mostrar.
   *
   * O rascunho vence enquanto existe; depois vale o cardápio; e o padrão é
   * "tudo", que é o que marcar sem abrir o painel sempre quis dizer.
   */
  const detalheDe = (nome: string): DetalheDia => {
    if (rascunho[nome]) return rascunho[nome]
    const d = refeicoes.find(x => x.nome === nome)?.detalhe
    const nivel = txt(d?.nivel)
    return {
      nivel: nivel === 'metade' || nivel === 'pouco' ? nivel : 'tudo',
      troca: txt(d?.troca),
      itens: txt(d?.itensDia),
      kcal: numDia(d?.kcalDia),
      prot: numDia(d?.protDia)
    }
  }

  /** Manda o evento com o detalhe que vale agora. Marcar e detalhar são o mesmo. */
  const registrar = (nome: string, feito: boolean, d: DetalheDia): void => {
    p.envio.registrar(eventoRefeicaoPlano(nome, dia, feito, d.nivel, d.troca, { itens: d.itens, kcal: d.kcal, prot: d.prot }))
  }

  /** Responder no painel marca a refeição junto: dizer quanto comeu é comer. */
  const detalhar = (nome: string, mudanca: Partial<DetalheDia>): void => {
    const novo = { ...detalheDe(nome), ...mudanca }
    setRascunho(r => ({ ...r, [nome]: novo }))
    const chave = `refeicao:${nome}`
    marcarFeito(guardadoDoNavegador, dia, chave)
    desmarcarFeito(guardadoDoNavegador, dia, `nao-${chave}`)
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    registrar(nome, true, novo)
  }

  const alternar = (nome: string, estava: boolean): void => {
    const chave = `refeicao:${nome}`
    const anti = `nao-${chave}`
    if (estava) {
      marcarFeito(guardadoDoNavegador, dia, anti)
      desmarcarFeito(guardadoDoNavegador, dia, chave)
      // Desmarcou: o detalhe morre junto, aqui e no diário.
      setRascunho(r => ({ ...r, [nome]: SEM_DETALHE }))
    } else {
      marcarFeito(guardadoDoNavegador, dia, chave)
      desmarcarFeito(guardadoDoNavegador, dia, anti)
    }
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    // Ao marcar, leva junto o que já foi respondido antes; ao desmarcar, o
    // construtor do evento descarta o detalhe sozinho.
    registrar(nome, !estava, estava ? SEM_DETALHE : detalheDe(nome))
  }

  /*
   * A conta do topo.
   *
   * `planejadas` é o total do plano; `comidas` é o que foi marcado. Refeição
   * sem `kcal` cadastrada conta zero nas duas — e é por isso que a barra some
   * quando o plano inteiro está sem caloria: barra parada em zero não informa
   * nada e ainda parece defeito.
   */
  const marcada = (nome: string, doCardapio: boolean): boolean =>
    estaFeito(`refeicao:${nome}`, doCardapio)

  /*
   * Comer metade conta metade.
   *
   * É o que faz "comi quanto" valer a pena responder: sem isto, marcar meio
   * prato somaria a caloria do prato inteiro, e o número do topo — que existe
   * para ser confiável — passaria a mentir a favor de quem responde.
   */
  const planejadas = refeicoes.reduce((a, r) => a + num(r.detalhe.kcal), 0)
  const fatorDe = (nome: string): number => FATOR_NIVEL[detalheDe(nome).nivel]
  /** Calorias e proteína desta refeição hoje: as do dia quando ajustadas, senão as do plano. */
  const kcalDe = (r: { nome: string; detalhe: Record<string, unknown> }): number => detalheDe(r.nome).kcal ?? num(r.detalhe.kcal)
  const protDe = (r: { nome: string; detalhe: Record<string, unknown> }): number => detalheDe(r.nome).prot ?? num(r.detalhe.prot)
  const comidas = Math.round(refeicoes.reduce(
    (a, r) => a + (marcada(r.nome, r.detalhe.feito === true)
      ? kcalDe(r) * fatorDe(r.nome) : 0), 0))
  const proteina = Math.round(refeicoes.reduce(
    (a, r) => a + (marcada(r.nome, r.detalhe.feito === true)
      ? protDe(r) * fatorDe(r.nome) : 0), 0))
  const marcadas = refeicoes.filter(r => marcada(r.nome, r.detalhe.feito === true)).length
  const fracao = planejadas > 0 ? Math.min(1, comidas / planejadas) : 0


  return (
    <div className="tema-hoje">
      <Cabecalho
        titulo="Dieta"
      />

      <div className="bloco">
        <SubNavSaude atual="dieta" irPara={p.irPara} />
        {!temSaude && (
          <Aviso tom="neutro">
            A área Saúde está desligada no Cortex. Ligue lá para a dieta
            aparecer aqui.
          </Aviso>
        )}

        {refeicoes.length > 0 && (
          <div className="dieta-topo">
            <div className="dieta-conta">
              <span className="dieta-numero">{marcadas}</span>
              <span className="dieta-de">
                de {refeicoes.length} {refeicoes.length === 1 ? 'refeição' : 'refeições'}
              </span>
            </div>
            {planejadas > 0 && (
              <div className="dieta-conta dieta-conta-dir">
                <span className="dieta-numero">{comidas}</span>
                <span className="dieta-de">de {planejadas} kcal</span>
              </div>
            )}
          </div>
        )}

        {planejadas > 0 && (
          <div
            className="dieta-barra"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={planejadas}
            aria-valuenow={comidas}
            aria-label="calorias do plano já comidas"
          >
            <div className="dieta-barra-cheia" style={{ width: `${Math.round(fracao * 100)}%` }} />
          </div>
        )}

        {proteina > 0 && <p className="dieta-nota">{proteina} g de proteína até agora.</p>}

        {refeicoes.map(r => {
          const feito = marcada(r.nome, r.detalhe.feito === true)
          const d = detalheDe(r.nome)
          const aberto = aberta === r.nome
          return (
            // Aberta, a linha dos itens deixa de cortar com reticências: a seta
            // é o jeito de ler a refeição inteira, e não só de responder.
            <div key={r.nome} className={`refeicao ${aberto ? 'refeicao-aberta' : ''}`}>
              <Check
                rotulo={r.nome}
                detalhe={<Detalhe partes={[
                  txt(r.detalhe.hora),
                  // O que foi respondido vem na frente dos itens do plano:
                  // depois de responder, é isso que a pessoa volta para ver.
                  feito && d.nivel !== 'tudo' ? `comi ${ROTULO_NIVEL[d.nivel]}` : '',
                  feito && d.troca ? `troquei por ${d.troca}` : (feito && d.itens) || txt(r.detalhe.itens),
                  (feito ? kcalDe(r) : num(r.detalhe.kcal)) > 0
                    ? `${Math.round((feito ? kcalDe(r) : num(r.detalhe.kcal)) * (feito ? FATOR_NIVEL[d.nivel] : 1))} kcal`
                    : ''
                ]} />}
                feito={feito}
                aoMarcar={() => alternar(r.nome, feito)}
                acao={
                  // A mesma seta das tarefas de Hoje e das anotações: é o
                  // gesto que já existe no app para "tem mais aqui dentro".
                  <button
                    className="item-ver"
                    type="button"
                    aria-expanded={aberto}
                    aria-label={`${aberto ? 'Esconder' : 'Detalhar'} ${r.nome}`}
                    onClick={() => setAberta(aberto ? null : r.nome)}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5.5 7 9 10.5 12.5 7" />
                    </svg>
                  </button>
                }
              />

              {aberto && (
                <div className="refeicao-painel">
                  <span className="refeicao-pergunta">Comi quanto</span>
                  <div className="chips">
                    {NIVEIS_REFEICAO.map(n => (
                      <button
                        key={n}
                        type="button"
                        className={`chip ${d.nivel === n && feito ? 'chip-ligado' : ''}`}
                        onClick={() => detalhar(r.nome, { nivel: n })}
                      >
                        {ROTULO_NIVEL[n]}
                      </button>
                    ))}
                  </div>

                  <span className="refeicao-pergunta">Troquei por</span>
                  <TrocaCampo
                    valor={d.troca}
                    aoSalvar={troca => { detalhar(r.nome, { troca }); setAberta(null) }}
                  />

                  <span className="refeicao-pergunta">Ajustar só hoje</span>
                  <AjusteDoDia
                    planoItens={txt(r.detalhe.itens)}
                    planoKcal={num(r.detalhe.kcal)}
                    planoProt={num(r.detalhe.prot)}
                    atual={d}
                    aoSalvar={aj => { detalhar(r.nome, aj); setAberta(null) }}
                  />
                </div>
              )}
            </div>
          )
        })}

        {temSaude && refeicoes.length === 0 && !p.cardapio.erro && (
          <p className="secao-vazia">
            Nenhum plano alimentar no Cortex ainda. Crie uma nota do tipo plano
            em Saúde e as refeições aparecem aqui sozinhas.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * O campo da troca, com estado próprio.
 *
 * Próprio, e não ligado ao rascunho da tela: cada letra digitada viraria um
 * evento na fila, e a dieta do dia sairia do celular vinte vezes para dizer
 * "sanduíche". O texto sobe quando a pessoa termina — no botão, no Enter ou
 * ao sair do campo.
 */
function TrocaCampo({ valor, aoSalvar }: { valor: string; aoSalvar: (t: string) => void }) {
  const [texto, setTexto] = useState(valor)
  const mudou = texto.trim() !== valor.trim()

  const salvar = (): void => { if (mudou) aoSalvar(texto.trim()) }

  return (
    <div className="refeicao-troca">
      <input
        className="troca-campo"
        type="text"
        value={texto}
        maxLength={120}
        placeholder="o que comi no lugar"
        onChange={e => setTexto(e.target.value)}
        onBlur={salvar}
        onKeyDown={e => { if (e.key === 'Enter') salvar() }}
      />
      <button className="troca-salvar" type="button" disabled={!mudou} onClick={salvar}>
        Salvar
      </button>
    </div>
  )
}

/**
 * A refeição de hoje, quando ela não foi como o plano manda.
 *
 * Edita os itens e os números SÓ do dia: vai para o diário, e o plano da
 * nutricionista continua igual amanhã. Estado próprio, pelo mesmo motivo do
 * campo de troca — cada letra não pode virar um evento na fila.
 */
function AjusteDoDia({ planoItens, planoKcal, planoProt, atual, aoSalvar }: {
  planoItens: string
  planoKcal: number
  planoProt: number
  atual: DetalheDia
  aoSalvar: (aj: Pick<DetalheDia, 'itens' | 'kcal' | 'prot'>) => void
}) {
  const [itens, setItens] = useState(atual.itens || planoItens)
  const [kcal, setKcal] = useState(String(atual.kcal ?? (planoKcal || '')))
  const [prot, setProt] = useState(String(atual.prot ?? (planoProt || '')))
  const ajustado = atual.itens !== '' || atual.kcal !== null || atual.prot !== null

  const numero = (t: string): number | null => {
    const n = Number(t.replace(',', '.'))
    return t.trim() === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n)
  }

  const salvar = (): void => {
    const k = numero(kcal)
    const pr = numero(prot)
    aoSalvar({
      // Igual ao plano não é ajuste: não viaja, e a refeição segue o plano.
      itens: itens.trim() === planoItens.trim() ? '' : itens.trim(),
      kcal: k === planoKcal ? null : k,
      prot: pr === planoProt ? null : pr
    })
  }

  return (
    <div className="refeicao-ajuste">
      <textarea
        className="troca-campo ajuste-itens"
        rows={3}
        maxLength={300}
        value={itens}
        placeholder="o que teve nesta refeição hoje"
        onChange={e => setItens(e.target.value)}
      />
      <div className="ajuste-numeros">
        <label>
          <input className="troca-campo" inputMode="numeric" value={kcal}
            onChange={e => setKcal(e.target.value)} />
          <span>kcal</span>
        </label>
        <label>
          <input className="troca-campo" inputMode="numeric" value={prot}
            onChange={e => setProt(e.target.value)} />
          <span>g prot</span>
        </label>
      </div>
      <div className="ajuste-botoes">
        {ajustado && (
          <button type="button" className="btn"
            onClick={() => aoSalvar({ itens: '', kcal: null, prot: null })}>
            Voltar ao plano
          </button>
        )}
        <button type="button" className="btn btn-principal" onClick={salvar}>
          Salvar hoje
        </button>
      </div>
    </div>
  )
}
