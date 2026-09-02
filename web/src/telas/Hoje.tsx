import { useState, type ReactElement } from 'react'
import type { Evento } from '@compartilhado/eventos'
import { guardadoDoNavegador } from '../guardado'
import { diaLocal, eventoSuplemento, eventoRefeicaoPlano } from '../montar'
import { suplementosDoDia, refeicoesDoPlano } from '../cardapio'
import { jaFeitos, marcarFeito } from '../feitos'
import { Cabecalho, Check, Botao, Aviso, Secao } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

/** Junta os pedaços de detalhe que existem, sem deixar separador solto. */
function linhaDeDetalhe(...partes: unknown[]): string {
  return partes.filter(p => typeof p === 'string' && p !== '').join(' · ')
}

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

  const marcar = (chave: string, montar: () => Evento) => {
    marcarFeito(guardadoDoNavegador, dia, chave)
    setFeitos(jaFeitos(guardadoDoNavegador, dia))
    p.envio.registrar(montar())
  }

  const suplementos = suplementosDoDia(p.cardapio.cardapio, dia)
  const refeicoes = refeicoesDoPlano(p.cardapio.cardapio)
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
            detalhe={linhaDeDetalhe(s.detalhe.dose, s.detalhe.quando)}
            feito={feitos.includes(`suplemento:${s.nome}`)}
            aoMarcar={() => marcar(`suplemento:${s.nome}`, () => eventoSuplemento(s.nome, dia))}
          />
        ))}

        {refeicoes.length > 0 && <Secao nome="Refeições" />}
        {refeicoes.map(r => (
          <Check
            key={r.nome}
            rotulo={r.nome}
            detalhe={linhaDeDetalhe(r.detalhe.hora, r.detalhe.itens)}
            feito={feitos.includes(`refeicao:${r.nome}`)}
            aoMarcar={() => marcar(`refeicao:${r.nome}`, () => eventoRefeicaoPlano(r.nome, dia))}
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
