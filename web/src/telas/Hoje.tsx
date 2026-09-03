import { useEffect, useState, type ReactElement } from 'react'
import type { Evento } from '@compartilhado/eventos'
import { guardadoDoNavegador } from '../guardado'
import { diaLocal, eventoSuplemento, eventoRefeicaoPlano } from '../montar'
import { suplementosDoDia, refeicoesDoPlano } from '../cardapio'
import { jaFeitos, marcarFeito, desmarcarFeito } from '../feitos'
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

export function Hoje(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const dia = diaLocal()
  const [feitos, setFeitos] = useState<string[]>(() => jaFeitos(guardadoDoNavegador, dia))

  const suplementos = suplementosDoDia(p.cardapio.cardapio, dia)
  const refeicoes = refeicoesDoPlano(p.cardapio.cardapio)

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
    if (mexeu) setFeitos(jaFeitos(guardadoDoNavegador, dia))
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
  const { naFila, enviando, avisos } = p.envio.estado
  const vazio = suplementos.length === 0 && refeicoes.length === 0

  return (
    <div className="tema-hoje">
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
  )
}
