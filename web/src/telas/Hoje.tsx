import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { Evento } from '@compartilhado/eventos'
import { guardadoDoNavegador } from '../guardado'
import { diaLocal, eventoSuplemento, eventoRefeicaoPlano, eventoRotina, eventoAgua } from '../montar'
import {
  suplementosDoDia, refeicoesDoPlano, rotinasDoDia, hidratacao, litros, anotacoesDoDia
} from '../cardapio'
import { jaFeitos, marcarFeito, desmarcarFeito } from '../feitos'
import { lerAnotacoes, conciliarAnotacoes } from '../anotacoes'
import { lerPendente, somarPendente, conciliarPendente, totalNaTela } from '../agua'
import { usePuxarParaAtualizar, progresso, LIMITE } from '../puxar'
import { Cabecalho, Check, Botao, Aviso, Secao, Detalhe } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'


/*
 * Os atalhos de registro.
 *
 * Numa lista, e nao seis blocos de JSX iguais: acrescentar um destino passa a
 * ser uma linha. Os icones vem desenhados aqui em vez de uma biblioteca --
 * sao seis, de meia duzia de tracos cada, e uma dependencia de icones traria
 * centenas junto para dentro do pacote que o celular baixa.
 */
const ATALHOS: { tela: Tela; nome: string; icone: ReactElement }[] = [
  { tela: 'treino', nome: 'Treino', icone: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="1" y="6" width="3" height="6" rx="1" /><rect x="14" y="6" width="3" height="6" rx="1" />
      <path d="M4 9h10" />
    </svg>) },
  { tela: 'cardio', nome: 'Cardio', icone: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="9" r="7" /><path d="M9 5v4l3 2" />
    </svg>) },
  { tela: 'medidas', nome: 'Peso e medidas', icone: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="9" r="7" /><path d="M9 9l3.5-3.5" />
    </svg>) },
  { tela: 'gasto', nome: 'Gasto', icone: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="1.5" y="4" width="15" height="10" rx="2" /><path d="M1.5 8h15" />
    </svg>) },
  { tela: 'porquinho', nome: 'Porquinho', icone: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 9.5a5.5 5.5 0 0 1 5.5-5.5h3a5.5 5.5 0 0 1 5.5 5.5v1.5a2 2 0 0 1-2 2h-.5v1.5h-2V13h-4v1.5h-2V13H4a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="8.5" r=".9" fill="currentColor" stroke="none" />
    </svg>) },
  { tela: 'anotacao', nome: 'Anotação', icone: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="2" width="12" height="14" rx="2" /><path d="M6 6h6M6 9.5h6M6 13h3" />
    </svg>) }
]

/**
 * Uma anotação na lista do Hoje.
 *
 * Mora aqui, e não em `componentes.tsx`, porque é usada só nesta tela — o
 * arquivo de componentes é para o que se repete entre telas.
 *
 * `soAqui` diz que esta ainda não deu a volta pelo Cortex. É informação, não
 * erro: sem sinal, ou com o computador desligado, é o estado normal por horas
 * — e omitir isso faria a anotação parecer guardada no vault quando ela está
 * só no aparelho.
 */
function Anotada(p: { texto: string; prioridade: boolean; soAqui?: boolean }) {
  return (
    <div className="anotada" data-prioridade={p.prioridade ? 'sim' : undefined}>
      {p.prioridade && <span className="anotada-estrela" aria-label="prioridade">★</span>}
      {/* `pre-wrap` no CSS: a anotação foi escrita num campo de 8 linhas, e
          amassar as quebras faria a lista de recados virar um parágrafo só. */}
      <p className="anotada-texto">{p.texto}</p>
      {p.soAqui && <span className="anotada-marca">só neste aparelho</span>}
    </div>
  )
}

export function Hoje(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const dia = diaLocal()
  const [feitos, setFeitos] = useState<string[]>(() => jaFeitos(guardadoDoNavegador, dia))

  const suplementos = suplementosDoDia(p.cardapio.cardapio, dia)
  const refeicoes = refeicoesDoPlano(p.cardapio.cardapio)
  const rotinas = rotinasDoDia(p.cardapio.cardapio, dia)
  /*
   * A água do dia.
   *
   * O total mora no vault, e o pendente é a distância entre o que já foi
   * tocado e o que o Cortex confirmou — ver `agua.ts`. Não é uma segunda
   * contagem: com o computador desligado, que é onde o Pedro está quando bebe
   * água, a volta pelo Cortex não acontece hoje, e sem o pendente o número
   * ficaria parado a manhã inteira por mais que ele tocasse.
   */
  const agua = hidratacao(p.cardapio.cardapio)
  const [pendente, setPendente] = useState<number>(() => lerPendente(guardadoDoNavegador, dia))
  const bebido = totalNaTela(agua?.ml ?? 0, pendente)

  /*
   * As anotações do dia, de duas fontes que dizem a mesma coisa.
   *
   * As do Cortex são as que já viraram nota no vault. As locais são as que
   * este aparelho escreveu e ainda não voltaram — com o computador desligado,
   * que é o caso normal quando ele escreve alguma no ônibus, são todas.
   *
   * Somar as duas listas sem mais nada duplicaria cada anotação assim que ela
   * desse a volta; quem tira a cópia local é `conciliarAnotacoes`, no efeito
   * abaixo. A local aparece marcada "só neste aparelho", que é a verdade
   * enquanto o Cortex não a recebeu.
   */
  const publicadas = anotacoesDoDia(p.cardapio.cardapio)
  const [locais, setLocais] = useState(() => lerAnotacoes(guardadoDoNavegador, dia))

  /*
   * Quem manda é o Cortex; a marca local só cobre o intervalo.
   *
   * O check agora vem no cardápio (`detalhe.feito`), lido do diário do dia lá
   * no computador. A marca em `localStorage` existe só para a tela responder
   * na hora do toque, enquanto o evento não deu a volta — e some assim que o
   * cardápio volta dizendo a mesma coisa.
   *
   * Sem essa limpeza, desmarcar aqui e remarcar NO CORTEX deixaria este
   * celular mostrando desmarcado até a virada do dia, contra o que o vault diz.
   */
  useEffect(() => {
    const atuais = jaFeitos(guardadoDoNavegador, dia)
    let mexeu = false
    const conferir = (chave: string, doCardapio: boolean): void => {
      const confirmado = doCardapio ? chave : `nao-${chave}`
      if (atuais.includes(confirmado)) {
        desmarcarFeito(guardadoDoNavegador, dia, confirmado)
        mexeu = true
      }
    }
    for (const s of suplementos) conferir(`suplemento:${s.nome}`, s.detalhe.feito === true)
    for (const r of refeicoes) conferir(`refeicao:${r.nome}`, r.detalhe.feito === true)
    for (const t of rotinas) conferir(`rotina:${t.nome}`, t.detalhe.feito === true)
    if (mexeu) setFeitos(jaFeitos(guardadoDoNavegador, dia))
    // A água acerta a conta pelo mesmo gatilho, só que somando em vez de
    // comparar: o que o Cortex absorveu sai do pendente.
    setPendente(conciliarPendente(guardadoDoNavegador, dia, agua?.ml ?? 0))
    // E a anotação que voltou do vault deixa de ser mostrada pela cópia local.
    setLocais(conciliarAnotacoes(guardadoDoNavegador, dia, publicadas.map(a => a.texto)))
    // `feitos` fora das dependências de propósito: o efeito lê do disco, não
    // do estado, e listá-lo o faria rodar por causa da própria limpeza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cardapio.cardapio, dia])

  /** O item está marcado? O cardápio decide; a marca local só adianta. */
  const estaFeito = (chave: string, doCardapio: boolean): boolean =>
    !feitos.includes(`nao-${chave}`) && (doCardapio || feitos.includes(chave))

  /** Marcar e desmarcar são o mesmo toque, com o sinal trocado. */
  const alternar = (chave: string, estava: boolean, montar: (feito: boolean) => Evento): void => {
    const anti = `nao-${chave}`
    if (estava) {
      marcarFeito(guardadoDoNavegador, dia, anti)
      desmarcarFeito(guardadoDoNavegador, dia, chave)
    } else {
      marcarFeito(guardadoDoNavegador, dia, chave)
      desmarcarFeito(guardadoDoNavegador, dia, anti)
    }
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    p.envio.registrar(montar(!estava))
  }
  /*
   * Puxar para atualizar.
   *
   * "O app todo": o cardápio DESCE e a fila SOBE. Só buscar deixaria o gesto
   * pela metade — quem puxa depois de marcar coisas sem sinal quer ver a fila
   * esvaziar tanto quanto quer ver a novidade chegar.
   */
  const puxar = usePuxarParaAtualizar(useCallback(async () => {
    await Promise.all([p.cardapio.atualizar(), p.envio.drenar()])
  }, [p.cardapio, p.envio]))

  const { naFila, enviando, avisos } = p.envio.estado
  const vazio = suplementos.length === 0 && refeicoes.length === 0
    && rotinas.length === 0 && !agua
    // Uma anotação escrita aqui já é conteúdo na tela: dizer "nada no
    // cardápio ainda" logo abaixo dela seria o app contradizendo o que
    // está mostrando.
    && publicadas.length === 0 && locais.length === 0

  return (
    <div className="tema-hoje">
      {/* Duas camadas de propósito: a de fora desce com o dedo, a de dentro
          gira. Numa só, a animação de girar (que é `transform`) apagaria o
          `translateY` da descida.

          A página em si NÃO desce: `transform` num ancestral faz todo
          `position: fixed` de dentro virar `absolute`, e o cabeçalho fixo
          desceria junto, deixando de ser cabeçalho. */}
      <div
        className="puxar-cova"
        style={{
          transform: `translateY(${puxar.distancia}px)`,
          opacity: puxar.atualizando ? 1 : progresso(puxar.distancia),
          transition: puxar.distancia === 0 ? 'transform .25s ease, opacity .2s ease' : 'none'
        }}
        aria-hidden="true"
      >
        <div
          className={`puxar-anel ${puxar.atualizando ? 'puxar-girando' : ''}`}
          // Enquanto se puxa, o anel gira acompanhando o dedo — é o que diz
          // que falta pouco. Ao soltar, a animação do CSS assume.
          style={puxar.atualizando
            ? undefined
            : { transform: `rotate(${(puxar.distancia / LIMITE) * 270}deg)` }}
        />
      </div>

      <Cabecalho
        titulo="Hoje"
        estado={
          enviando
            ? { texto: 'enviando…', tom: 'envia' as const }
            : naFila > 0
              ? { texto: `${naFila} na fila`, tom: 'fila' as const }
              : { texto: 'tudo enviado', tom: 'ok' as const }
        }
      />

      {/* Só o conteúdo desce com o dedo — o cabeçalho fica fora deste div de
          propósito. `transform` num ancestral faz `position: fixed` virar
          `absolute`, e o cabeçalho desceria junto, deixando de ser fixo. */}
      <div
        style={{
          transform: `translateY(${puxar.distancia}px)`,
          transition: puxar.distancia === 0 ? 'transform .25s ease' : 'none'
        }}
      >
      {avisos.length > 0 && (
        <Aviso tom="erro" aoFechar={p.envio.limparAvisos}>
          {avisos.length} registro(s) recusado(s). O primeiro: {avisos[0]}
        </Aviso>
      )}
      {p.cardapio.erro && <Aviso>{p.cardapio.erro}</Aviso>}

      <div className="bloco">
        {suplementos.length > 0 && <Secao nome="Suplementos" />}
        {suplementos.map(s => (
          <Check
            key={s.nome}
            rotulo={s.nome}
            detalhe={<Detalhe partes={[s.detalhe.dose, s.detalhe.quando]} />}
            feito={estaFeito(`suplemento:${s.nome}`, s.detalhe.feito === true)}
            aoMarcar={() => alternar(
              `suplemento:${s.nome}`,
              estaFeito(`suplemento:${s.nome}`, s.detalhe.feito === true),
              feito => eventoSuplemento(s.nome, dia, feito)
            )}
          />
        ))}

        {agua && (
          <>
            <Secao nome="Hidratação" contagem={agua.meta > 0
              ? `${litros(bebido)} de ${litros(agua.meta)}`
              : litros(bebido)} />
            <div className="agua">
              {/* A barra trava em 100%: beber a mais que a meta é bom, e uma
                  barra que vaza para fora da caixa parece defeito. O número
                  ao lado continua contando a verdade. */}
              {agua.meta > 0 && (
                <div className="agua-barra">
                  <i style={{ width: `${Math.min(100, (bebido / agua.meta) * 100)}%` }} />
                </div>
              )}
              <div className="agua-acoes">
                <button
                  className="btn btn-principal"
                  type="button"
                  onClick={() => {
                    setPendente(somarPendente(guardadoDoNavegador, dia, agua.copo))
                    p.envio.registrar(eventoAgua(agua.copo, dia))
                  }}
                >
                  + {agua.copo} ml
                </button>
                {/* Desfazer o toque a mais. Some quando não há o que desfazer:
                    um botão que não faz nada é pior do que botão nenhum. */}
                {bebido > 0 && (
                  <button
                    className="btn btn-fantasma agua-tirar"
                    type="button"
                    aria-label={`tirar ${agua.copo} ml`}
                    onClick={() => {
                      // Nunca tira mais do que há: o total na tela não pode
                      // dizer 0 enquanto um "−800" a mais viaja para o vault.
                      const quanto = Math.min(agua.copo, bebido)
                      setPendente(somarPendente(guardadoDoNavegador, dia, -quanto))
                      p.envio.registrar(eventoAgua(-quanto, dia))
                    }}
                  >
                    −
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Logo abaixo dos suplementos: é o mesmo gesto, e separar as duas
            listas por uma seção de outra coisa quebraria a sequência de
            toques de quem abre o app de manhã e desce marcando. */}
        {rotinas.length > 0 && <Secao nome="Tarefas do dia" />}
        {rotinas.map(t => (
          <Check
            key={t.nome}
            rotulo={t.nome}
            detalhe={<Detalhe partes={[t.detalhe.quando]} />}
            feito={estaFeito(`rotina:${t.nome}`, t.detalhe.feito === true)}
            aoMarcar={() => alternar(
              `rotina:${t.nome}`,
              estaFeito(`rotina:${t.nome}`, t.detalhe.feito === true),
              feito => eventoRotina(t.nome, dia, feito)
            )}
          />
        ))}

        {/* Logo abaixo das tarefas: o que estava para fazer, e em seguida o
            que aconteceu. As duas metades da mesma pergunta — "como foi
            hoje?" — e é por isso que a lista fica aqui, e não numa aba
            própria que ninguém abriria. */}
        {(publicadas.length > 0 || locais.length > 0) && <Secao nome="Anotações de hoje" />}
        {publicadas.map(a => (
          <Anotada key={`vault:${a.titulo}`} texto={a.texto} prioridade={a.prioridade} />
        ))}
        {locais.map((a, i) => (
          <Anotada key={`aqui:${i}:${a.texto}`} texto={a.texto} prioridade={a.prioridade} soAqui />
        ))}

        {refeicoes.length > 0 && <Secao nome="Refeições" />}
        {refeicoes.map(r => (
          <Check
            key={r.nome}
            rotulo={r.nome}
            detalhe={<Detalhe partes={[r.detalhe.hora, r.detalhe.itens]} />}
            feito={estaFeito(`refeicao:${r.nome}`, r.detalhe.feito === true)}
            aoMarcar={() => alternar(
              `refeicao:${r.nome}`,
              estaFeito(`refeicao:${r.nome}`, r.detalhe.feito === true),
              feito => eventoRefeicaoPlano(r.nome, dia, feito)
            )}
          />
        ))}

        {vazio && !p.cardapio.erro && (
          <p className="secao-vazia">
            Nada no cardápio ainda. Cadastre suplementos e um plano de dieta no
            Cortex — eles aparecem aqui sozinhos.
          </p>
        )}

        <Secao nome="Registrar" />
        <div className="grade-registrar">
          {ATALHOS.map(a => (
            <button key={a.tela} className="btn-registrar" type="button"
              onClick={() => p.irPara(a.tela)}>
              {a.icone}
              {a.nome}
            </button>
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}
