import { useState } from 'react'
import type { Tela } from '../App'
import type { useEnvio, UsoDoCardapio } from '../envio'
import {
  transacoes, totaisDoMes, porquinho, reais, areaLigada, type Transacao
} from '../cardapio'
import { diaLocal, eventoGasto, eventoPorquinho } from '../montar'
import { Cabecalho, Aviso, Secao, Selecao } from '../componentes'

/**
 * Dinheiro: o mês, o porquinho e o lançamento, numa tela só.
 *
 * Eram duas telas de formulário — `gasto` e `porquinho` — e nenhuma delas
 * respondia à pergunta que traz alguém aqui, que é "como está o mês?". As duas
 * continuam existindo para quem chega pelo atalho; esta é a tela da aba.
 *
 * Os números vêm do Cortex desde 10/09/2026, quando o dono liberou os
 * lançamentos para a nuvem. Antes disso o celular só sabia ENVIAR gasto, e uma
 * tela como esta era impossível de montar.
 */

/** As categorias do lançamento. A vazia existe para "sem categoria". */
const CATEGORIAS = ['', 'comida', 'transporte', 'lazer', 'estudo', 'saúde', 'outros']

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

/** Uma linha da lista do dia. */
function Linha({ t }: { t: Transacao }) {
  return (
    <div className="lanc-linha">
      <span className="lanc-ponto" data-entrada={t.entrada ? 'sim' : undefined} />
      <span className="lanc-txt">
        <strong>{t.item || (t.entrada ? 'Entrada' : 'Gasto')}</strong>
        {t.cat && <span>{t.cat}</span>}
      </span>
      <span className="lanc-valor" data-entrada={t.entrada ? 'sim' : undefined}>
        {t.entrada ? '+' : '−'} {reais(t.valor)}
      </span>
    </div>
  )
}

export function Dinheiro(p: {
  envio: ReturnType<typeof useEnvio>
  cardapio: UsoDoCardapio
  irPara: (t: Tela) => void
}) {
  const dia = diaLocal()
  // Prefixo `AAAA-MM`: a data já vem em ISO, e comparar por texto evita o
  // `new Date('2026-09-01')`, que é lido como UTC e num fuso negativo vira
  // 31 de agosto — o primeiro dia do mês cairia fora da conta do próprio mês.
  const mes = dia.slice(0, 7)

  const [desc, setDesc] = useState('')
  const [valor, setValor] = useState('')
  const [cat, setCat] = useState('')
  const [cofre, setCofre] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const temGrana = areaLigada(p.cardapio.cardapio, 'financas')
  const todas = temGrana ? transacoes(p.cardapio.cardapio) : []
  const doMes = totaisDoMes(todas, mes)
  const doDia = todas.filter(t => t.data === dia)
  const saldoDoDia = doDia.reduce((a, t) => a + (t.entrada ? t.valor : -t.valor), 0)
  const cofrinho = temGrana ? porquinho(p.cardapio.cardapio) : null

  /*
   * O mês NÃO tem meta, e por isso não tem barra.
   *
   * O desenho mostra "de R$ 3.000" com uma barra de orçamento. Não existe
   * orçamento em lugar nenhum do vault — nem nota, nem campo — e inventar um
   * número para a barra ter o que preencher seria a tela mentindo. A única
   * meta real é a do porquinho, e é só ela que ganha anel.
   */
  const alvo = cofrinho?.alvo ?? null
  const fracaoCofre = alvo && alvo > 0 ? Math.min(1, (cofrinho?.saldo ?? 0) / alvo) : null

  const lancar = (entrada: boolean): void => {
    try {
      p.envio.registrar(eventoGasto(desc, Number(valor.replace(',', '.')), {
        cat: cat || undefined,
        dir: entrada ? 'entrada' : 'saida'
      }, dia))
      setDesc('')
      setValor('')
      setCat('')
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  const mexerNoCofre = (direcao: 'deposito' | 'sangria'): void => {
    try {
      p.envio.registrar(eventoPorquinho(
        cofrinho?.nome ?? 'Porquinho', Number(cofre.replace(',', '.')), direcao, dia
      ))
      setCofre('')
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para registrar')
    }
  }

  const semLancamento = desc.trim() === '' || valor.trim() === ''

  return (
    <div className="tema-dinheiro">
      <Cabecalho
        titulo="Dinheiro"
      />

      <div className="bloco">
        {erro && <Aviso tom="erro" aoFechar={() => setErro(null)}>{erro}</Aviso>}
        {!temGrana && (
          <Aviso tom="neutro">
            A área Grana está desligada no Cortex. Ligue lá para esta tela ter
            conteúdo.
          </Aviso>
        )}

        {/* O mês: o número grande responde sozinho à pergunta da tela. */}
        <div className="cartao-ajuste">
          <div className="dinheiro-rotulo">
            Gasto de {MESES[Number(mes.slice(5, 7)) - 1]}
          </div>
          <div className="dinheiro-grande">{reais(doMes.saiu)}</div>
          {doMes.entrou > 0 && (
            <div className="dinheiro-sub">
              Entrou {reais(doMes.entrou)} · saldo {reais(doMes.entrou - doMes.saiu)}
            </div>
          )}
        </div>

        {/* O porquinho, no cartão escuro do desenho. */}
        {cofrinho && (
          <div className="cofre">
            <div className="cofre-topo">
              <div className="cofre-txt">
                <div className="cofre-nome">Porquinho — {cofrinho.nome}</div>
                <div className="cofre-saldo">{reais(cofrinho.saldo)}</div>
              </div>
              {fracaoCofre !== null && (
                <div className="cofre-anel">
                  <span>{Math.round(fracaoCofre * 100)}%</span>
                </div>
              )}
            </div>
            {alvo && <div className="cofre-alvo">meta {reais(alvo)}</div>}
            <div className="cofre-acoes">
              <input
                className="cofre-campo"
                value={cofre}
                inputMode="decimal"
                placeholder="R$ 0,00"
                aria-label="valor"
                onChange={e => setCofre(e.target.value)}
              />
              <button
                type="button"
                className="cofre-btn cofre-guardar"
                disabled={cofre.trim() === ''}
                onClick={() => mexerNoCofre('deposito')}
              >
                Guardei
              </button>
              {/* Tirar, que o desenho não tinha e o dono pediu. Guardar sem
                  poder tirar transforma o porquinho num ralo. */}
              <button
                type="button"
                className="cofre-btn cofre-tirar"
                disabled={cofre.trim() === ''}
                onClick={() => mexerNoCofre('sangria')}
              >
                Tirei
              </button>
            </div>
          </div>
        )}

        {/* O lançamento rápido: descrição, valor e CATEGORIA. */}
        <div className="cartao-ajuste">
          <div className="dinheiro-rotulo">Novo lançamento</div>
          <div className="lanc-campos">
            <input
              className="lanc-desc"
              value={desc}
              placeholder="Descrição"
              aria-label="descrição"
              onChange={e => setDesc(e.target.value)}
            />
            <input
              className="lanc-val"
              value={valor}
              inputMode="decimal"
              placeholder="R$ 0,00"
              aria-label="valor"
              onChange={e => setValor(e.target.value)}
            />
          </div>
          {/* A etiqueta, que o dono pediu: sem ela o gasto entra no vault sem
              categoria e some do relatório por assunto lá no Cortex. */}
          <Selecao rotulo="Categoria" opcoes={CATEGORIAS} valor={cat} aoMudar={setCat} />
          <div className="lanc-botoes">
            <button type="button" className="btn btn-principal"
              disabled={semLancamento} onClick={() => lancar(false)}>
              Lançar gasto
            </button>
            <button type="button" className="btn btn-secundario"
              disabled={semLancamento} onClick={() => lancar(true)}>
              Lançar ganho
            </button>
          </div>
        </div>

        {doDia.length > 0 && (
          <div className="grupo">
            <Secao
              nome="Hoje"
              contagem={`${saldoDoDia < 0 ? '−' : '+'} ${reais(Math.abs(saldoDoDia))}`}
            />
            {doDia.map((t, i) => <Linha key={`${t.data}:${i}:${t.item}`} t={t} />)}
          </div>
        )}

        {temGrana && todas.length === 0 && !p.cardapio.erro && (
          <p className="secao-vazia">
            Nenhum lançamento ainda. O que você registrar aqui aparece nesta
            lista depois de dar a volta pelo Cortex.
          </p>
        )}
      </div>
    </div>
  )
}
