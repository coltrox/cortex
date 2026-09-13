import { useMemo, useState } from 'react'
import type { Tela } from '../App'
import type { useEnvio, UsoDoCardapio } from '../envio'
import {
  transacoes, totaisDoMes, porquinho, reais, areaLigada, type Transacao
} from '../cardapio'
import { diaLocal, eventoGasto, eventoPorquinho, eventoLancamentoAlterado } from '../montar'
import { guardadoDoNavegador } from '../guardado'
import {
  comAlteracoes, guardarAlteracao, listaOcupada, type Alteracao
} from '../lancamentosLocais'
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

/** Uma linha da lista do dia, com o "⋯" que abre editar e excluir. */
function Linha({ t, aberta, travada, aoAbrir, aoEditar, aoExcluir }: {
  t: Transacao
  aberta: boolean
  travada: boolean
  aoAbrir: () => void
  aoEditar: () => void
  aoExcluir: () => void
}) {
  return (
    <div className="lanc-bloco">
      <div className="lanc-linha">
        <span className="lanc-ponto" data-entrada={t.entrada ? 'sim' : undefined} />
        <span className="lanc-txt">
          <strong>{t.item || (t.entrada ? 'Entrada' : 'Gasto')}</strong>
          {t.cat && <span>{t.cat}</span>}
        </span>
        <span className="lanc-valor" data-entrada={t.entrada ? 'sim' : undefined}>
          {t.entrada ? '+' : '−'} {reais(t.valor)}
        </span>
        <button
          type="button"
          className="lanc-mais"
          aria-label={`ações de ${t.item || 'lançamento'}`}
          aria-expanded={aberta}
          onClick={aoAbrir}
        >
          ⋯
        </button>
      </div>
      {aberta && (
        <div className="lanc-acoes">
          <button type="button" className="acao-lado" disabled={travada} onClick={aoEditar}>
            editar
          </button>
          <button type="button" className="acao-lado acao-destrutiva" disabled={travada} onClick={aoExcluir}>
            excluir
          </button>
          {/* Outra linha deste dia mudou e ainda não voltou do Cortex. A
              posição desta pode andar, e a mudança cairia em vão. */}
          {travada && (
            <span className="lanc-espera">Esperando o Cortex confirmar a outra mudança deste dia.</span>
          )}
        </div>
      )}
    </div>
  )
}

/** O lançamento aberto para editar, no lugar da própria linha. */
function EditarLancamento({ t, aoSalvar, aoCancelar }: {
  t: Transacao
  aoSalvar: (novo: NonNullable<Alteracao['novo']>) => void
  aoCancelar: () => void
}) {
  const [item, setItem] = useState(t.item)
  const [valor, setValor] = useState(String(t.valor).replace('.', ','))
  const [cat, setCat] = useState(t.cat)
  const [entrada, setEntrada] = useState(t.entrada)
  const numero = Number(valor.replace(',', '.'))
  const valido = item.trim() !== '' && Number.isFinite(numero) && numero > 0

  return (
    <div className="lanc-editar">
      <div className="lanc-campos">
        <input
          className="lanc-desc"
          value={item}
          placeholder="Descrição"
          aria-label="descrição"
          onChange={e => setItem(e.target.value)}
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
      <Selecao rotulo="Categoria" opcoes={CATEGORIAS} valor={cat} aoMudar={setCat} />
      <div className="lanc-botoes lanc-direcao">
        <button type="button" className="btn btn-secundario" aria-pressed={!entrada}
          onClick={() => setEntrada(false)}>
          Gasto
        </button>
        <button type="button" className="btn btn-secundario" aria-pressed={entrada}
          onClick={() => setEntrada(true)}>
          Ganho
        </button>
      </div>
      <div className="lanc-botoes">
        <button type="button" className="btn btn-principal" disabled={!valido}
          onClick={() => aoSalvar({ item: item.trim(), valor: numero, cat, entrada })}>
          Salvar
        </button>
        <button type="button" className="btn btn-secundario" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
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
  /** O lançamento com as ações abertas, e o que está sendo editado. */
  const [aberta, setAberta] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  /** Muda a cada alteração guardada, para a lista recalcular na hora. */
  const [versao, setVersao] = useState(0)

  const temGrana = areaLigada(p.cardapio.cardapio, 'financas')
  // O publicado, com as edições e exclusões feitas aqui por cima até o Cortex
  // devolvê-las — ver `lancamentosLocais`.
  const todas = useMemo(
    () => temGrana ? comAlteracoes(guardadoDoNavegador, transacoes(p.cardapio.cardapio)) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.cardapio.cardapio, temGrana, versao]
  )
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

  /**
   * Edita (`novo`) ou exclui (`null`) um lançamento.
   *
   * O `antes` que vai para o Cortex é o que a tela mostra — já com uma edição
   * anterior ainda pendente, se houver: o Cortex aplica os eventos na ordem,
   * e é esse o estado da linha quando este chegar.
   */
  const alterar = (t: Transacao, novo: Alteracao['novo']): void => {
    try {
      p.envio.registrar(eventoLancamentoAlterado(t, novo, dia))
      guardarAlteracao(guardadoDoNavegador, { chave: t.chave, antes: { item: t.item, valor: t.valor }, novo })
      setVersao(v => v + 1)
      setAberta(null)
      setEditando(null)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para alterar')
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
            {doDia.map(t => editando === t.chave ? (
              <EditarLancamento
                key={t.chave}
                t={t}
                aoSalvar={novo => alterar(t, novo)}
                aoCancelar={() => setEditando(null)}
              />
            ) : (
              <Linha
                key={t.chave}
                t={t}
                aberta={aberta === t.chave}
                travada={listaOcupada(guardadoDoNavegador, t)}
                aoAbrir={() => setAberta(aberta === t.chave ? null : t.chave)}
                aoEditar={() => { setEditando(t.chave); setAberta(null) }}
                aoExcluir={() => {
                  // Excluir no vault não tem desfazer pelo celular.
                  if (!window.confirm(`Excluir "${t.item || 'lançamento'}"?`)) return
                  alterar(t, null)
                }}
              />
            ))}
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
