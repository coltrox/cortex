import { useState } from 'react'
import type { Evento } from '@compartilhado/eventos'
import { guardadoDoNavegador } from '../guardado'
import { diaLocal, eventoSuplemento, eventoRefeicaoPlano } from '../montar'
import { suplementosDoDia, refeicoesDoPlano } from '../cardapio'
import { jaFeitos, marcarFeito } from '../feitos'
import { Cabecalho, Check, Botao, Aviso } from '../componentes'
import type { useEnvio, UsoDoCardapio } from '../envio'
import type { Tela } from '../App'

/** Junta os pedaços de detalhe que existem, sem deixar separador solto. */
function linhaDeDetalhe(...partes: unknown[]): string {
  return partes.filter(p => typeof p === 'string' && p !== '').join(' · ')
}

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
    <>
      <Cabecalho
        titulo="Hoje"
        direita={enviando ? 'enviando…' : naFila > 0 ? `${naFila} na fila` : 'tudo enviado'}
      />

      {avisos.length > 0 && (
        <Aviso grave aoFechar={p.envio.limparAvisos}>
          {avisos.length} registro(s) recusado(s). O primeiro: {avisos[0]}
        </Aviso>
      )}
      {p.cardapio.erro && <Aviso>{p.cardapio.erro}</Aviso>}

      <div className="secao">
        {suplementos.length > 0 && <h2>Suplementos</h2>}
        {suplementos.map(s => (
          <Check
            key={s.nome}
            rotulo={s.nome}
            detalhe={linhaDeDetalhe(s.detalhe.dose, s.detalhe.quando)}
            feito={feitos.includes(`suplemento:${s.nome}`)}
            aoMarcar={() => marcar(`suplemento:${s.nome}`, () => eventoSuplemento(s.nome, dia))}
          />
        ))}

        {refeicoes.length > 0 && <h2>Refeições</h2>}
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
          <p className="nota">
            Nada no cardápio ainda. Cadastre suplementos e um plano de dieta no
            Cortex — eles aparecem aqui sozinhos.
          </p>
        )}

        <h2>Registrar</h2>
        <div className="grade">
          <Botao aoClicar={() => p.irPara('treino')}>Treino</Botao>
          <Botao aoClicar={() => p.irPara('cardio')}>Cardio</Botao>
          <Botao aoClicar={() => p.irPara('medidas')}>Peso e medidas</Botao>
          <Botao aoClicar={() => p.irPara('gasto')}>Gasto</Botao>
          <Botao aoClicar={() => p.irPara('anotacao')}>Anotação</Botao>
          <Botao aoClicar={() => p.irPara('agenda')}>Chegando</Botao>
        </div>
      </div>
    </>
  )
}
