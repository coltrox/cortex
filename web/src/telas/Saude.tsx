import { useEffect, useState } from 'react'
import type { Tela } from '../App'
import type { useEnvio, UsoDoCardapio } from '../envio'
import { suplementosDoDia, hidratacao, litros, momentoDe, areaLigada } from '../cardapio'
import { diaLocal, eventoSuplemento, eventoAgua } from '../montar'
import { guardadoDoNavegador } from '../guardado'
import { jaFeitos, marcarFeito, desmarcarFeito } from '../feitos'
import { lerPendente, somarPendente, conciliarPendente, totalNaTela } from '../agua'
import { Cabecalho, Check, Detalhe, Aviso, Secao } from '../componentes'

/**
 * A área Saúde inteira, com sub-navegação.
 *
 * Eram três abas na barra de baixo — Dieta, Corpo e Treino — e as três
 * respondiam à mesma pergunta. Três abas vizinhas do mesmo assunto gastam
 * metade da barra para dizer "saúde" de três jeitos, e ainda empurram Dinheiro
 * e Notas para o canto.
 *
 * Agora é uma aba com quatro segmentos. O primeiro, "Dia", é o que se marca
 * todo dia: água e suplemento. Os outros três são o conteúdo de cada assunto.
 */

/** Os segmentos, e a tela de cada um. */
const SEGMENTOS: { id: Tela; nome: string }[] = [
  { id: 'saude',  nome: 'Dia' },
  { id: 'dieta',  nome: 'Dieta' },
  { id: 'corpo',  nome: 'Corpo' },
  { id: 'treino', nome: 'Treino' }
]

/**
 * A barra de segmentos, desenhada por todas as telas da área.
 *
 * Cada tela a desenha, em vez de um invólucro comum desenhar por todas: o
 * invólucro exigiria que as quatro abrissem mão do próprio cabeçalho e
 * recebessem uma prop para isso — quatro arquivos mexidos para não mudar nada
 * na tela. Aqui é uma linha em cada.
 */
export function SubNavSaude(p: { atual: Tela; irPara: (t: Tela) => void }) {
  return (
    <div className="subnav-saude" role="tablist">
      {SEGMENTOS.map(s => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={p.atual === s.id}
          className={`subnav-item ${p.atual === s.id ? 'ligado' : ''}`}
          onClick={() => p.irPara(s.id)}
        >
          {s.nome}
        </button>
      ))}
    </div>
  )
}

export function Saude(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const dia = diaLocal()
  const [feitos, setFeitos] = useState<string[]>(() => jaFeitos(guardadoDoNavegador, dia))

  const temSaude = areaLigada(p.cardapio.cardapio, 'saude')
  const suplementos = temSaude ? suplementosDoDia(p.cardapio.cardapio, dia) : []
  const agua = temSaude ? hidratacao(p.cardapio.cardapio) : null
  const [pendente, setPendente] = useState<number>(() => lerPendente(guardadoDoNavegador, dia))
  const bebido = totalNaTela(agua?.ml ?? 0, pendente)

  /*
   * A marca local some quando o Cortex confirma.
   *
   * Mesmo mecanismo do Hoje, e de propósito: as duas telas mexem no MESMO
   * suplemento e na MESMA água, e duas regras diferentes fariam marcar aqui e
   * ver desmarcado lá.
   */
  useEffect(() => {
    const atuais = jaFeitos(guardadoDoNavegador, dia)
    let mexeu = false
    for (const s of suplementos) {
      const chave = `suplemento:${s.nome}`
      const confirmado = s.detalhe.feito === true ? chave : `nao-${chave}`
      if (atuais.includes(confirmado)) {
        desmarcarFeito(guardadoDoNavegador, dia, confirmado)
        mexeu = true
      }
    }
    if (mexeu) setFeitos(jaFeitos(guardadoDoNavegador, dia))
    setPendente(conciliarPendente(guardadoDoNavegador, dia, agua?.ml ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cardapio.cardapio, dia])

  const estaFeito = (chave: string, doCardapio: boolean): boolean =>
    !feitos.includes(`nao-${chave}`) && (doCardapio || feitos.includes(chave))

  const alternar = (nome: string, estava: boolean): void => {
    const chave = `suplemento:${nome}`
    const anti = `nao-${chave}`
    if (estava) {
      marcarFeito(guardadoDoNavegador, dia, anti)
      desmarcarFeito(guardadoDoNavegador, dia, chave)
    } else {
      marcarFeito(guardadoDoNavegador, dia, chave)
      desmarcarFeito(guardadoDoNavegador, dia, anti)
    }
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    p.envio.registrar(eventoSuplemento(nome, dia, !estava))
  }

  const beber = (ml: number): void => {
    setPendente(somarPendente(guardadoDoNavegador, dia, ml))
    p.envio.registrar(eventoAgua(ml, dia))
  }

  const { naFila, enviando } = p.envio.estado

  return (
    <div className="tema-hoje">
      <Cabecalho
        titulo="Saúde"
        estado={
          enviando
            ? { texto: 'enviando…', tom: 'envia' as const }
            : naFila > 0
              ? { texto: `${naFila} na fila`, tom: 'fila' as const }
              : undefined
        }
      />

      <div className="bloco">
        <SubNavSaude atual="saude" irPara={p.irPara} />

        {!temSaude && (
          <Aviso tom="neutro">
            A área Saúde está desligada no Cortex. Ligue lá para esta tela ter
            conteúdo.
          </Aviso>
        )}

        {agua && (
          <div className="grupo">
            <Secao
              nome="Hidratação"
              contagem={agua.meta > 0
                ? `${litros(bebido)} de ${litros(agua.meta)}`
                : litros(bebido)}
            />
            <div className="agua">
              {agua.meta > 0 && (
                <div className="agua-garrafas" aria-hidden="true">
                  {Array.from({ length: Math.min(12, Math.ceil(agua.meta / agua.copo)) }, (_, i) => {
                    const parte = Math.max(0, Math.min(1, bebido / agua.copo - i))
                    return (
                      <div key={i} className="agua-garrafa">
                        <i style={{ height: `${parte * 100}%` }} />
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="agua-nota">garrafa de {agua.copo} ml · definida no Cortex</div>
              <div className="agua-acoes">
                <button className="btn btn-principal" type="button"
                  onClick={() => beber(agua.copo)}>+ 1 garrafa</button>
                <button className="btn btn-secundario" type="button"
                  onClick={() => beber(Math.round(agua.copo / 2))}>+ ½ garrafa</button>
                {bebido > 0 && (
                  <button
                    className="btn btn-fantasma agua-tirar"
                    type="button"
                    aria-label={`tirar ${agua.copo} ml`}
                    onClick={() => beber(-Math.min(agua.copo, bebido))}
                  >
                    −
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {suplementos.length > 0 && (
          <div className="grupo">
            <Secao nome="Suplementos" />
            {suplementos.map(s => (
              <Check
                key={s.nome}
                rotulo={s.nome}
                detalhe={<Detalhe partes={[s.detalhe.dose, momentoDe(s)]} />}
                feito={estaFeito(`suplemento:${s.nome}`, s.detalhe.feito === true)}
                aoMarcar={() => alternar(
                  s.nome,
                  estaFeito(`suplemento:${s.nome}`, s.detalhe.feito === true)
                )}
              />
            ))}
          </div>
        )}

        {temSaude && !agua && suplementos.length === 0 && !p.cardapio.erro && (
          <p className="secao-vazia">
            Nada de saúde no cardápio ainda. Cadastre suplementos e a meta de
            água no Cortex — eles aparecem aqui sozinhos.
          </p>
        )}
      </div>
    </div>
  )
}
