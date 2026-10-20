import { useState } from 'react'
import { Botao, Aviso } from '../componentes'
import { guardadoDoNavegador } from '../guardado'
import type { useEnvio } from '../envio'

/**
 * Escrever a redação no celular ou no tablet.
 *
 * Era o último pedaço que obrigava a abrir o computador: a folha já vinha do
 * vault com tema, banca e data, mas o texto só dava para digitar no Cortex.
 * Agora ele escreve aqui — no tablet, com o teclado acoplado — e entrega.
 *
 * O texto NÃO vira nota nova: ele preenche a folha que já existe, pelo `path`
 * que o próprio Cortex publicou. Entregar muda o status para "aguardando
 * correção", exatamente como o botão do computador.
 *
 * O rascunho fica guardado neste aparelho a cada tecla. É o que protege de
 * fechar a aba sem querer no meio de uma redação de 30 linhas — e some assim
 * que o texto é entregue.
 */
const CHAVE_RASCUNHO = 'cortex.redacao-rascunho'

export function EscreverRedacao({ item, envio, aoVoltar }: {
  item: { nome: string; detalhe: Record<string, unknown> }
  envio: ReturnType<typeof useEnvio>
  aoVoltar: () => void
}) {
  const path = typeof item.detalhe.path === 'string' ? item.detalhe.path : ''
  const chave = `${CHAVE_RASCUNHO}:${item.nome}`
  const jaEscrito = typeof item.detalhe.corpo === 'string' ? item.detalhe.corpo : ''

  const [texto, setTexto] = useState(() => guardadoDoNavegador.ler(chave) ?? jaEscrito)
  const [entregue, setEntregue] = useState(false)

  const status = typeof item.detalhe.status === 'string' ? item.detalhe.status : ''
  const linhas = texto.split('\n').filter(l => l.trim() !== '').length
  const palavras = texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length

  const guardar = (v: string): void => {
    setTexto(v)
    guardadoDoNavegador.gravar(chave, v)
  }

  const mandar = (novoStatus: string): void => {
    if (!path) return
    envio.registrar({
      tipo: 'nota_escrita',
      // Data local, nunca `toISOString` do fuso: à noite viraria o dia
      // seguinte, e o evento cairia no diário errado.
      dia: diaLocal(),
      dados: { path, texto, tipo: 'redacao', campos: { status: novoStatus } }
    })
    if (novoStatus === 'aguardando correção') {
      guardadoDoNavegador.apagar(chave)
      setEntregue(true)
    }
  }

  if (!path) {
    return (
      <Aviso tom="erro">
        Esta folha não trouxe o caminho da nota, então não dá para gravar daqui.
        Abra o Cortex no computador uma vez para ele republicar.
      </Aviso>
    )
  }

  if (entregue) {
    return (
      <div className="redacao-escrita">
        <Aviso tom="ok">
          Entregue. O texto vai para o vault assim que houver sinal, e a folha
          fica como <b>aguardando correção</b>.
        </Aviso>
        <Botao tipo="secundario" aoClicar={aoVoltar}>Voltar</Botao>
      </div>
    )
  }

  return (
    <div className="redacao-escrita">
      <textarea
        className="redacao-campo"
        value={texto}
        onChange={e => guardar(e.target.value)}
        placeholder="Escreva a redação aqui."
        spellCheck
      />

      <div className="redacao-conta">
        <span>{linhas} {linhas === 1 ? 'linha' : 'linhas'}</span>
        <span>{palavras} {palavras === 1 ? 'palavra' : 'palavras'}</span>
        {status && <span className="etiqueta">{status}</span>}
      </div>

      <p className="treino-dica">
        O rascunho fica guardado neste aparelho enquanto você escreve. Entregar
        manda o texto para o vault e marca a folha como aguardando correção.
      </p>

      <Botao
        tipo="principal"
        aoClicar={() => mandar('aguardando correção')}
        desligado={texto.trim() === ''}
      >
        Entregar para correção
      </Botao>

      <Botao tipo="secundario" aoClicar={() => mandar('rascunho')}>
        Só salvar, sem entregar
      </Botao>
    </div>
  )
}

/** O dia de hoje no fuso do aparelho. */
function diaLocal(): string {
  const d = new Date()
  const dois = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}
