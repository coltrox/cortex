import { useEffect, useState } from 'react'
import type { Tela } from '../App'
import { SubNavSaude } from './Saude'
import type { useEnvio, useCardapio } from '../envio'
import { refeicoesDoPlano, areaLigada } from '../cardapio'
import { eventoRefeicaoPlano, diaLocal } from '../montar'
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

  const temSaude = areaLigada(p.cardapio.cardapio, 'saude')
  const refeicoes = temSaude ? refeicoesDoPlano(p.cardapio.cardapio) : []

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cardapio.cardapio, dia])

  const estaFeito = (chave: string, doCardapio: boolean): boolean =>
    !feitos.includes(`nao-${chave}`) && (doCardapio || feitos.includes(chave))

  const alternar = (nome: string, estava: boolean): void => {
    const chave = `refeicao:${nome}`
    const anti = `nao-${chave}`
    if (estava) {
      marcarFeito(guardadoDoNavegador, dia, anti)
      desmarcarFeito(guardadoDoNavegador, dia, chave)
    } else {
      marcarFeito(guardadoDoNavegador, dia, chave)
      desmarcarFeito(guardadoDoNavegador, dia, anti)
    }
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    p.envio.registrar(eventoRefeicaoPlano(nome, dia, !estava))
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

  const planejadas = refeicoes.reduce((a, r) => a + num(r.detalhe.kcal), 0)
  const comidas = refeicoes.reduce(
    (a, r) => a + (marcada(r.nome, r.detalhe.feito === true) ? num(r.detalhe.kcal) : 0), 0)
  const proteina = refeicoes.reduce(
    (a, r) => a + (marcada(r.nome, r.detalhe.feito === true) ? num(r.detalhe.prot) : 0), 0)
  const marcadas = refeicoes.filter(r => marcada(r.nome, r.detalhe.feito === true)).length
  const fracao = planejadas > 0 ? Math.min(1, comidas / planejadas) : 0

  const { naFila, enviando } = p.envio.estado

  return (
    <div className="tema-hoje">
      <Cabecalho
        titulo="Dieta"
        estado={
          enviando
            ? { texto: 'enviando…', tom: 'envia' as const }
            : naFila > 0
              ? { texto: `${naFila} na fila`, tom: 'fila' as const }
              : undefined
        }
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

        {refeicoes.map(r => (
          <Check
            key={r.nome}
            rotulo={r.nome}
            detalhe={<Detalhe partes={[
              txt(r.detalhe.hora),
              txt(r.detalhe.itens),
              num(r.detalhe.kcal) > 0 ? `${num(r.detalhe.kcal)} kcal` : ''
            ]} />}
            feito={marcada(r.nome, r.detalhe.feito === true)}
            aoMarcar={() => alternar(r.nome, marcada(r.nome, r.detalhe.feito === true))}
          />
        ))}

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
