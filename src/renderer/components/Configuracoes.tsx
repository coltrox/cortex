import { useEffect, useState } from 'react'
import { SeletorAreas } from './Abertura'
import { ProtecaoSenha } from './ProtecaoSenha'
import { lerTema, salvarTema, aplicarTema, type Tema } from '../tema'
import type { Config } from '../useVault'

/**
 * O painel de Configurações — o único item do rodapé do rail.
 *
 * Tudo que era botão solto ali dentro mora aqui: quais áreas aparecem, a
 * senha dos painéis, e a conexão com o celular. O rail volta a ser só a
 * lista de lentes, que é o que ele deveria ser.
 */
export function Configuracoes({
  config, aoSalvarAreas, aoTrocarConfig, aoAbrirNuvem, aoRecarregar, aoFechar,
  sincronizacaoFalhando
}: {
  config: Config
  aoSalvarAreas: (areas: string[]) => void
  aoTrocarConfig: (c: Config) => void
  aoAbrirNuvem: () => void
  /** Relê as notas depois de reindexar — ver `BlocoIndice`. */
  aoRecarregar: () => void
  aoFechar: () => void
  sincronizacaoFalhando: boolean
}) {
  const [marcadas, setMarcadas] = useState<string[]>(config.areas)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aoFechar])

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="form largo" onClick={e => e.stopPropagation()}>
        <div className="form-topo">Configurações</div>
        <div className="form-corpo config-corpo">

          <section className="config-bloco">
            <h3>Áreas do app</h3>
            <p className="form-dica">
              Desmarcar não apaga nada: as notas continuam no vault e a área
              volta a aparecer quando você marcar de novo.
            </p>
            <SeletorAreas
              marcadas={marcadas}
              aoAlternar={id =>
                setMarcadas(m => (m.includes(id) ? m.filter(x => x !== id) : [...m, id]))}
            />
            <button className="btn" onClick={() => aoSalvarAreas(marcadas)}>
              Salvar áreas
            </button>
          </section>

          <ProtecaoSenha config={config} aoTrocarConfig={aoTrocarConfig} />

          <BlocoTema />

          <BlocoIndice aoRecarregar={aoRecarregar} />

          <section className="config-bloco">
            <h3>Celular</h3>
            <p className="form-dica">
              O id deste vault, o QR para conectar o app do celular e o estado
              da sincronização.
            </p>
            <button className="btn-fantasma" onClick={aoAbrirNuvem}>
              Abrir conexão com o celular
              {sincronizacaoFalhando && <span className="config-alerta"> · falhando</span>}
            </button>
          </section>

        </div>
        <div className="form-rodape">
          <button className="btn" onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Reconstruir o índice.
 *
 * O Cortex desenha a partir do índice, e a varredura do vault só acontecia ao
 * ABRIR o vault. Quem apontasse o app para uma pasta e acrescentasse notas por
 * fora — copiando de outro cofre, restaurando um backup, sincronizando por
 * outro programa — via a tela vazia, sem nada dizendo por quê, e sem como
 * forçar. Aconteceu de verdade, com 88 notas no disco e o índice em zero.
 *
 * Não escreve nota nenhuma: só relê o que está no disco. Por isso é seguro
 * apertar quando a tela parece errada — o pior caso é não mudar nada.
 */
function BlocoIndice({ aoRecarregar }: { aoRecarregar: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  const [recado, setRecado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const reconstruir = async (): Promise<void> => {
    if (ocupado) return
    setOcupado(true); setRecado(null); setErro(null)
    try {
      const r = await window.vaultApi.invoke('indice:reconstruir', {}) as {
        indexed: number; removed: number; skipped: number; trancados: number
      }
      // Relê a lista na tela: reindexar não escreve arquivo, então o watcher
      // não dispara e a lente continuaria mostrando o que mostrava antes.
      aoRecarregar()
      const partes = [`${r.indexed + r.skipped} nota(s) no índice`]
      if (r.indexed > 0) partes.push(`${r.indexed} relida(s)`)
      if (r.removed > 0) partes.push(`${r.removed} que não existe(m) mais, fora`)
      // Painel trancado com o cofre fechado fica de fora, e isso não é falha:
      // dizer o número evita a conclusão de que o reindexar não funcionou.
      if (r.trancados > 0) partes.push(`${r.trancados} em painel trancado, só ao abrir com a senha`)
      setRecado(partes.join(' · '))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para reconstruir o índice')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="config-bloco">
      <h3>Índice do vault</h3>
      <p className="form-dica">
        O Cortex monta as telas a partir de um índice das notas. Se você
        acrescentou arquivos na pasta por fora do app — copiando de outro
        cofre, restaurando um backup — e eles não aparecem, é isto que falta.
        Nada é escrito: ele só relê o que está no disco.
      </p>
      <button className="btn" onClick={() => void reconstruir()} disabled={ocupado}>
        {ocupado ? 'Relendo o vault…' : 'Reconstruir o índice'}
      </button>
      {erro && <p className="config-erro">{erro}</p>}
      {recado && <p className="config-recado">{recado}</p>}
    </section>
  )
}

/**
 * Claro, escuro, ou seguir o sistema.
 *
 * Três opções e não um interruptor de dois estados: "seguir o sistema" é o
 * padrão, e é o que a maioria quer sem saber que quer — quem já deixou o
 * Windows no escuro não deveria ter de dizer de novo aqui.
 *
 * A escolha vale na hora, sem salvar nem fechar nada: trocar o tema é uma
 * decisão que se avalia olhando, e um botão "salvar" no meio disso obrigaria
 * a pessoa a confirmar o que ela já está vendo.
 */
function BlocoTema() {
  const [tema, setTema] = useState<Tema>(() => lerTema())

  const escolher = (t: Tema): void => {
    setTema(t)
    aplicarTema(t)
    salvarTema(t)
  }

  const opcoes: { id: Tema; nome: string; dica: string }[] = [
    { id: 'sistema', nome: 'Do sistema', dica: 'Acompanha o Windows, inclusive quando ele muda sozinho à noite.' },
    { id: 'claro', nome: 'Claro', dica: 'Sempre claro, mesmo com o sistema no escuro.' },
    { id: 'escuro', nome: 'Escuro', dica: 'Sempre escuro, mesmo com o sistema no claro.' }
  ]

  return (
    <section className="config-bloco">
      <h3>Aparência</h3>
      <div className="config-temas">
        {opcoes.map(o => (
          <button
            key={o.id}
            className={`config-tema ${tema === o.id ? 'config-tema-ativo' : ''}`}
            onClick={() => escolher(o.id)}
            aria-pressed={tema === o.id}
          >
            <span className={`config-tema-amostra amostra-${o.id}`} aria-hidden="true" />
            <span>{o.nome}</span>
          </button>
        ))}
      </div>
      <p className="form-dica">{opcoes.find(o => o.id === tema)?.dica}</p>
    </section>
  )
}
