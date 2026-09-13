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
  const [rascunho, setRascunho] = useState<Record<string, { nivel: NivelRefeicao; troca: string }>>({})

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
        if (nivel === r.nivel && troca === r.troca) continue
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
  const detalheDe = (nome: string): { nivel: NivelRefeicao; troca: string } => {
    if (rascunho[nome]) return rascunho[nome]
    const d = refeicoes.find(x => x.nome === nome)?.detalhe
    const nivel = txt(d?.nivel)
    return {
      nivel: nivel === 'metade' || nivel === 'pouco' ? nivel : 'tudo',
      troca: txt(d?.troca)
    }
  }

  /** Manda o evento com o detalhe que vale agora. Marcar e detalhar são o mesmo. */
  const registrar = (nome: string, feito: boolean, d: { nivel: NivelRefeicao; troca: string }): void => {
    p.envio.registrar(eventoRefeicaoPlano(nome, dia, feito, d.nivel, d.troca))
  }

  /** Responder no painel marca a refeição junto: dizer quanto comeu é comer. */
  const detalhar = (nome: string, mudanca: Partial<{ nivel: NivelRefeicao; troca: string }>): void => {
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
      setRascunho(r => ({ ...r, [nome]: { nivel: 'tudo', troca: '' } }))
    } else {
      marcarFeito(guardadoDoNavegador, dia, chave)
      desmarcarFeito(guardadoDoNavegador, dia, anti)
    }
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    // Ao marcar, leva junto o que já foi respondido antes; ao desmarcar, o
    // construtor do evento descarta o detalhe sozinho.
    registrar(nome, !estava, estava ? { nivel: 'tudo', troca: '' } : detalheDe(nome))
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
  const comidas = Math.round(refeicoes.reduce(
    (a, r) => a + (marcada(r.nome, r.detalhe.feito === true)
      ? num(r.detalhe.kcal) * fatorDe(r.nome) : 0), 0))
  const proteina = Math.round(refeicoes.reduce(
    (a, r) => a + (marcada(r.nome, r.detalhe.feito === true)
      ? num(r.detalhe.prot) * fatorDe(r.nome) : 0), 0))
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
                  feito && d.troca ? `troquei por ${d.troca}` : txt(r.detalhe.itens),
                  num(r.detalhe.kcal) > 0
                    ? `${Math.round(num(r.detalhe.kcal) * (feito ? FATOR_NIVEL[d.nivel] : 1))} kcal`
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
