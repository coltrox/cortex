import { useMemo, useState } from 'react'
import {
  Cartao, Secao, Titulo, Linha, Barras, Vazio, Progresso,
  moeda, num, txt, porData, type PropsLente,
  dataCurta
} from './base'
import {
  extrairTransacoes, porCategoria, saldoPorquinho, ehSangria, type Transacao
} from '../dados'

/**
 * Grana.
 *
 * Uma transação é um item na lista `transacoes` do diário do dia — não um
 * arquivo por gasto. Trezentos e sessenta e cinco arquivos por ano em vez de
 * mil e oitocentos, e o dia inteiro se lê de uma vez.
 *
 * A lista antiga `gastos` continua sendo lida como saída: quem já tinha
 * lançamentos não os perde por causa de uma mudança de nome.
 */

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

const rotuloDia = (iso: string): string => {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}

export function LenteGrana({
  notas, sub, hoje, aoAbrir, aoAdicionar, aoEditar, aoExcluir, aoLancar
}: PropsLente) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [visao, setVisao] = useState<'lista' | 'dia'>('lista')
  const [diaAberto, setDiaAberto] = useState<string | null>(hoje)

  const todas = useMemo(() => extrairTransacoes(notas), [notas])

  const mesAtual = hoje.slice(0, 7)
  const doMes = todas.filter(t => t.data.startsWith(mesAtual))
  const saiuMes = doMes.filter(t => t.dir === 'saida').reduce((s, t) => s + t.valor, 0)
  const entrouMes = doMes.filter(t => t.dir === 'entrada').reduce((s, t) => s + t.valor, 0)

  const categorias = useMemo(() => porCategoria(todas), [todas])

  const filtradas = useMemo(() => {
    const busca = q.trim().toLowerCase()
    return todas.filter(t =>
      (!cat || t.cat === cat) &&
      (!busca || t.item.toLowerCase().includes(busca) || t.cat.toLowerCase().includes(busca)))
  }, [todas, q, cat])

  const porDia = useMemo(() => {
    const m = new Map<string, Transacao[]>()
    for (const t of filtradas) {
      const atual = m.get(t.data)
      if (atual) atual.push(t)
      else m.set(t.data, [t])
    }
    return [...m.entries()]
  }, [filtradas])

  /* ---------- porquinho ---------- */

  const mov = notas.filter(n => n.tipo === 'porquinho').sort(porData)
  const { depositado, sangrado, saldo } = saldoPorquinho(mov)
  const metas = notas.filter(n => n.tipo === 'meta-cofre')
  const meta = metas.find(m => m.campos.ativa === true) ?? metas[0]

  return (
    <div className="lente">
      <Titulo nome="Grana" />

      {sub === 'overview' && (
        <>
          <div className="cartoes">
            <Cartao
              rotulo={`Saldo de ${MESES[Number(mesAtual.slice(5)) - 1]}`}
              valor={moeda(entrouMes - saiuMes)}
              tom={entrouMes - saiuMes < 0 ? 'saida' : 'entrada'}
            />
            <Cartao rotulo="Entrou no mês" valor={moeda(entrouMes)} tom="entrada" />
            <Cartao rotulo="Saiu no mês" valor={moeda(saiuMes)} tom="saida"
              nota={`${doMes.filter(t => t.dir === 'saida').length} lançamentos`} />
            <Cartao rotulo="Porquinho" valor={moeda(saldo)} nota={`${mov.length} movimentos`} />
          </div>

          <Secao
            nome="Gastos por categoria"
            acao="Transação"
            aoClicar={() => aoLancar('transacao', hoje)}
          />
          <Barras
            itens={[...categorias.entries()]}
            formato={moeda}
            ativo={cat ?? undefined}
            aoClicar={c => setCat(cat === c ? null : c)}
          />
          {cat && (
            <>
              <h3 className="secao">{cat}</h3>
              <ListaTx txs={todas.filter(t => t.cat === cat).slice(0, 40)} aoAbrir={aoAbrir} comData />
            </>
          )}
        </>
      )}

      {sub === 'transacoes' && (
        <>
          <Secao
            nome="Transações"
            acao="Transação"
            aoClicar={() => aoLancar('transacao', diaAberto ?? hoje)}
            direita={
              <span className="alternador">
                <button aria-pressed={visao === 'lista'} onClick={() => setVisao('lista')}>Lista</button>
                <button aria-pressed={visao === 'dia'} onClick={() => setVisao('dia')}>Por dia</button>
              </span>
            }
          />

          <div className="filtros">
            <input
              className="busca"
              placeholder="Buscar por item ou categoria…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <div className="chips">
              <button className="chip" aria-pressed={cat === null} onClick={() => setCat(null)}>
                todas
              </button>
              {[...categorias.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => (
                <button key={c} className="chip" aria-pressed={cat === c}
                  onClick={() => setCat(cat === c ? null : c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="resumo-filtro">
            {filtradas.length} {filtradas.length === 1 ? 'lançamento' : 'lançamentos'}
            {' · '}
            <strong>{moeda(filtradas.filter(t => t.dir === 'saida').reduce((s, t) => s + t.valor, 0))}</strong> em saídas
            {filtradas.some(t => t.dir === 'entrada') && (
              <> · <strong>{moeda(filtradas.filter(t => t.dir === 'entrada').reduce((s, t) => s + t.valor, 0))}</strong> em entradas</>
            )}
          </div>

          {filtradas.length === 0 && <Vazio>Nada com esse filtro.</Vazio>}

          {visao === 'lista'
            ? <ListaTx txs={filtradas.slice(0, 200)} aoAbrir={aoAbrir} comData />
            : (
              <div className="dias-lista">
                {porDia.map(([dia, txs]) => {
                  const aberto = diaAberto === dia
                  const total = txs.filter(t => t.dir === 'saida').reduce((s, t) => s + t.valor, 0)
                  return (
                    <div key={dia} className="dia-bloco" data-aberto={aberto}>
                      <button className="dia-cab" onClick={() => setDiaAberto(aberto ? null : dia)}>
                        <span className="dia-seta">{aberto ? '▾' : '▸'}</span>
                        <span className="dia-nome">
                          {rotuloDia(dia)}{dia === hoje ? ' · hoje' : ''}
                        </span>
                        <span className="dia-conta">{txs.length}</span>
                        <span className="dia-total">{moeda(total)}</span>
                      </button>
                      {aberto && <ListaTx txs={txs} aoAbrir={aoAbrir} />}
                    </div>
                  )
                })}
              </div>
            )}
        </>
      )}

      {sub === 'porquinho' && (
        <>
          <div className="cartoes">
            <Cartao rotulo="Saldo" valor={moeda(saldo)} nota={`${mov.length} movimentos`} />
            <Cartao rotulo="Depositado" valor={moeda(depositado)} tom="entrada" />
            <Cartao rotulo="Sangrado" valor={moeda(sangrado)} tom="saida" />
          </div>

          <Secao nome="Meta" acao="Meta" aoClicar={() => aoAdicionar('meta-cofre')} />
          {!meta ? (
            <Vazio>Sem meta definida. Uma meta transforma o saldo numa barra que enche.</Vazio>
          ) : (
            <div className="meta-caixa">
              <div className="meta-topo">
                <strong>{meta.title}</strong>
                <span className="linha-acoes">
                  <button className="btn-icone" title="Editar" onClick={() => aoEditar(meta)}>✎</button>
                  <button className="btn-icone perigo" title="Excluir" onClick={() => aoExcluir(meta)}>×</button>
                </span>
              </div>
              <Progresso
                feito={saldo} total={num(meta.campos.alvo)}
                rotulo={`${moeda(saldo)} de ${moeda(num(meta.campos.alvo))}`}
              />
              <div className="meta-nota">
                {saldo >= num(meta.campos.alvo)
                  ? 'Meta batida.'
                  : `Faltam ${moeda(num(meta.campos.alvo) - saldo)}`}
                {meta.date ? ` · até ${meta.date}` : ''}
              </div>
            </div>
          )}

          <Secao nome="Movimentos" acao="Movimento" aoClicar={() => aoAdicionar('porquinho')} />
          {mov.length === 0 ? (
            <Vazio>
              Nenhum movimento. Cada depósito ou sangria é uma nota, e o campo
              &quot;por quê&quot; é a sua anotação sobre ele.
            </Vazio>
          ) : (
            <div className="lista-notas">
              {[...mov].reverse().map(m => {
                const sangria = ehSangria(m)
                return (
                  <Linha key={m.path} aoAbrir={() => aoAbrir(m.path)}
                    aoEditar={() => aoEditar(m)} aoExcluir={() => aoExcluir(m)}>
                    <span className="linha-data">{dataCurta(m.date, hoje)}</span>
                    <span className="seta" data-d={sangria ? 'saida' : 'entrada'}>{sangria ? '↓' : '↑'}</span>
                    <span className="linha-titulo">
                      {m.title}
                      {txt(m.campos.nota) && <em> — {txt(m.campos.nota)}</em>}
                    </span>
                    <span className="linha-valor" data-d={sangria ? 'saida' : 'entrada'}>
                      {sangria ? '−' : '+'}{moeda(num(m.campos.valor))}
                    </span>
                  </Linha>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ListaTx({ txs, aoAbrir, comData }: {
  txs: Transacao[]; aoAbrir: (p: string) => void; comData?: boolean
}) {
  if (txs.length === 0) return null
  return (
    <div className="lista-notas">
      {txs.map((t, i) => (
        <Linha key={`${t.path}-${t.campo}-${t.i}-${i}`} aoAbrir={() => aoAbrir(t.path)}
          titulo="Abrir o diário deste dia">
          {comData && <span className="linha-data">{t.data}</span>}
          <span className="seta" data-d={t.dir}>{t.dir === 'saida' ? '↓' : '↑'}</span>
          <span className="linha-titulo">{t.item}</span>
          <span className="tipo">{t.cat}</span>
          <span className="linha-valor" data-d={t.dir}>
            {t.dir === 'saida' ? '−' : '+'}{moeda(t.valor)}
          </span>
        </Linha>
      ))}
    </div>
  )
}
