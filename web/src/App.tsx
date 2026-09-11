import { lazy, Suspense, useState } from 'react'
import './estilo.css'
import { guardadoDoNavegador } from './guardado'
import { lerVaultId, gravarVaultId, idDoFragmento } from './ajustes'
import { useEnvio, useCardapio } from './envio'
import { faltaCredencial } from './credencial'
import { areaLigada } from './cardapio'
import { Aviso } from './componentes'
import { Hoje } from './telas/Hoje'
import { Treino } from './telas/Treino'
import { Cardio } from './telas/Cardio'
import { Medidas } from './telas/Medidas'
import { Gasto } from './telas/Gasto'
import { Anotacao } from './telas/Anotacao'
import { Notas } from './telas/Notas'
import { Estudo } from './telas/Estudo'
import { Agenda } from './telas/Agenda'
import { NovoItem, type EdicaoItem, type TipoNovo } from './telas/NovoItem'
import { Porquinho } from './telas/Porquinho'
import { Ajustes } from './telas/Ajustes'
import { Dieta } from './telas/Dieta'
import { Saude } from './telas/Saude'

/**
 * A tela da câmera vem em separado, e só quando alguém abre.
 *
 * Ela carrega um decodificador de QR de ~50 KB — necessário porque o Safari
 * do iPhone não traz um. Ele no pacote principal seria metade de um segundo a
 * mais em TODA abertura do app, para um recurso usado uma vez na vida, na
 * hora de conectar o celular ao Cortex.
 *
 * O service worker guarda todo GET do mesmo domínio, então o pedaço fica em
 * cache depois da primeira vez. Sem rede na primeira abertura desta tela ela
 * não carrega — e tudo bem: conectar exige rede de qualquer jeito.
 */
const LerQr = lazy(() => import('./telas/LerQr').then(m => ({ default: m.LerQr })))

export type Tela =
  | 'hoje' | 'agenda' | 'compromisso' | 'treino' | 'cardio'
  | 'medidas' | 'gasto' | 'porquinho' | 'anotacao' | 'ajustes' | 'lerqr' | 'novo'
  // A sessão de estudo, e a lista de todas as notas. `anotacao` continua
  // sendo a tela de ESCREVER uma; `notas` é a de LER as que existem.
  | 'estudo' | 'notas'
  // As abas do desenho `Rotina` que ainda não tinham tela própria.
  | 'saude' | 'dieta' | 'corpo' | 'dinheiro'

/**
 * As abas de baixo, na ordem do desenho `Rotina`.
 *
 * `area` é a área do Cortex que precisa estar ligada para a aba existir.
 * `null` é aba que não pertence a área nenhuma — Hoje é o resumo do que
 * sobrou, e sem ela o app poderia abrir sem aba nenhuma.
 *
 * `forma` é o `border-radius` do quadradinho do ícone. O desenho não usa
 * pictograma: usa a MESMA caixa de 20 px com um canto diferente em cada aba,
 * cheia quando a aba está ativa. Isso resolve duas coisas de uma vez — não há
 * seis desenhos para manter, e nenhum ícone fica ambíguo, porque a diferença
 * é de forma pura e não de metáfora.
 */
const ABAS: { id: Tela; nome: string; area: string | null; forma: string }[] = [
  { id: 'hoje',     nome: 'Hoje',     area: null,         forma: '7px' },
  // Saúde junta dieta, corpo e treino, mais hidratação e suplementos. Eram
  // três abas; viraram uma com sub-navegação, porque as três respondem à
  // mesma pergunta e três abas vizinhas do mesmo assunto gastam metade da
  // barra para dizer "saúde" de três jeitos.
  { id: 'saude',    nome: 'Saúde',    area: 'saude',      forma: '50%' },
  { id: 'dinheiro', nome: 'Dinheiro', area: 'financas',   forma: '4px' },
  { id: 'notas',    nome: 'Notas',    area: 'vida',       forma: '3px 10px 3px 3px' },
  // O desenho chama esta aba de "Chegando"; a tela sempre se chamou `agenda`.
  // O rótulo é do desenho, o id é o que já existe — renomear a tela seria
  // mexer em doze arquivos para trocar uma palavra que só aparece aqui.
  { id: 'agenda',   nome: 'Chegando', area: 'calendario', forma: '50% 7px 50% 7px' }
]

/**
 * Que aba fica acesa quando a tela aberta não é uma aba.
 *
 * Registrar um cardio é a aba Corpo; escrever uma anotação é a aba Notas. Sem
 * este mapa a barra apagava inteira ao entrar numa tela de registro, e quem
 * estivesse lá perdia a referência de onde estava.
 */
const ABA_DE: Partial<Record<Tela, Tela>> = {
  novo: 'agenda', compromisso: 'agenda',
  treino: 'saude', cardio: 'saude', medidas: 'saude',
  dieta: 'saude', corpo: 'saude',
  gasto: 'dinheiro', porquinho: 'dinheiro',
  anotacao: 'notas', estudo: 'hoje',
  // Ajustes saiu da barra: no desenho ele é um botão no cabeçalho de Hoje.
  ajustes: 'hoje', lerqr: 'hoje'
}

/**
 * O id que a câmera trouxe no endereço, gravado antes de qualquer tela abrir.
 *
 * Roda uma vez, no módulo, e não dentro de um efeito: o `useState` inicial de
 * `App` decide entre "Hoje" e "Ajustes" olhando se existe id, e um efeito
 * rodaria depois dessa decisão — o primeiro quadro seria a tela de Ajustes
 * pedindo o que já tinha acabado de chegar.
 *
 * O fragmento é limpo do endereço em seguida, para o id não ficar no
 * histórico do navegador nem reaparecer num F5 depois de trocado.
 */
function absorverIdDoEndereco(): void {
  const id = idDoFragmento(window.location.hash)
  if (!id) return
  try {
    gravarVaultId(guardadoDoNavegador, id)
  } catch {
    // Id fora do formato já foi recusado por `idDoFragmento`; se ainda assim
    // falhar, seguir sem gravar é melhor do que uma tela branca.
  }
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

absorverIdDoEndereco()

/*
 * Icones da barra de baixo.
 *
 * Desenhados aqui, em vez de virem de uma biblioteca: sao tres, cada um tem
 * meia duzia de linhas, e uma dependencia de icones traria centenas junto
 * para dentro do pacote que o celular baixa. `currentColor` faz o estado
 * ativo vir do CSS, sem uma variante por icone.
 */
function IconeHoje() {
  return (
    <svg width="21" height="21" viewBox="0 0 21 21" fill="none" stroke="currentColor"
      strokeWidth="1.8" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="8" />
      <circle cx="10.5" cy="10.5" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconeChegando() {
  return (
    <svg width="21" height="21" viewBox="0 0 21 21" fill="none" stroke="currentColor"
      strokeWidth="1.8" aria-hidden="true">
      <rect x="2.5" y="4" width="16" height="14.5" rx="3" />
      <path d="M2.5 8.5h16M7 2v3.6M14 2v3.6" />
    </svg>
  )
}

function IconeAjustes() {
  return (
    <svg width="21" height="21" viewBox="0 0 21 21" fill="none" stroke="currentColor"
      strokeWidth="1.8" aria-hidden="true">
      <path d="M3 6h15M3 10.5h15M3 15h15" />
      <circle cx="7" cy="6" r="2" fill="#080b10" />
      <circle cx="13.5" cy="15" r="2" fill="#080b10" />
    </svg>
  )
}

export function App() {
  // Sem id configurado o app abre direto em Ajustes: qualquer outra tela seria
  // um formulário que não tem para onde enviar.
  const [tela, setTela] = useState<Tela>(() =>
    lerVaultId(guardadoDoNavegador) ? 'hoje' : 'ajustes')
  const envio = useEnvio()
  const cardapio = useCardapio()
  /**
   * O item que a tela de edicao vai abrir preenchido.
   *
   * Mora aqui, e nao dentro de `NovoItem`, porque quem escolhe e a tela
   * de Chegando: passar por cima do App e o unico caminho entre as duas sem
   * inventar um roteador.
   */
  const [editando, setEditando] = useState<EdicaoItem | null>(null)
  /** Qual chip da agenda foi tocado — compromisso, prova ou tarefa. */
  const [novoTipo, setNovoTipo] = useState<TipoNovo>('compromisso')

  /*
   * As abas que este vault liga.
   *
   * A regra é a mesma do resto do app: área desligada no Cortex não aparece
   * no celular. Enquanto o Cortex não publicar área nenhuma, `areaLigada`
   * responde que sim para todas — é o que impede o app de abrir vazio na mão
   * de quem só não atualizou o computador ainda.
   */
  const abas = ABAS.filter(a => a.area === null || areaLigada(cardapio.cardapio, a.area))

  if (faltaCredencial()) {
    return (
      <Aviso tom="erro">
        Este site foi publicado sem as variáveis VITE_SUPABASE_URL e
        VITE_SUPABASE_CHAVE. Configure as duas no painel do host e publique de
        novo — elas entram no pacote em tempo de build.
      </Aviso>
    )
  }

  return (
    <>
      {tela === 'hoje' && <Hoje envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'agenda' && (
        <Agenda
          envio={envio}
          cardapio={cardapio}
          irPara={setTela}
          aoEditar={(t, i) => { setEditando(i); setNovoTipo(t); setTela('novo') }}
          aoMarcar={t => { setEditando(null); setNovoTipo(t); setTela('novo') }}
        />
      )}
      {tela === 'novo' && (
        <NovoItem
          envio={envio}
          tipo={novoTipo}
          editando={editando}
          irPara={t => { setEditando(null); setTela(t) }}
        />
      )}
      {tela === 'treino' && <Treino envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'cardio' && <Cardio envio={envio} irPara={setTela} />}
      {/* As abas novas do desenho ainda apontam para as telas que já existiam
          e cobrem o mesmo assunto. É degrau, não destino: cada uma será
          trocada pela tela do desenho, uma por vez, para o app nunca ficar
          com aba que abre em branco no meio do caminho. */}
      {(tela === 'medidas' || tela === 'corpo') && <Medidas envio={envio} irPara={setTela} />}
      {(tela === 'gasto' || tela === 'dinheiro') && <Gasto envio={envio} irPara={setTela} />}
      {tela === 'porquinho' && <Porquinho envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'anotacao' && <Anotacao envio={envio} irPara={setTela} />}
      {tela === 'notas' && <Notas cardapio={cardapio} envio={envio} irPara={setTela} />}
      {tela === 'saude' && <Saude envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'dieta' && <Dieta envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'estudo' && <Estudo envio={envio} irPara={setTela} />}
      {tela === 'ajustes' && <Ajustes cardapio={cardapio} irPara={setTela} />}
      {tela === 'lerqr' && (
        <Suspense fallback={<Aviso>Abrindo a câmera…</Aviso>}>
          <LerQr
            aoLer={id => {
              gravarVaultId(guardadoDoNavegador, id)
              setTela('ajustes')
              void cardapio.atualizar()
            }}
            aoFechar={() => setTela('ajustes')}
          />
        </Suspense>
      )}

      <nav className="barra-baixo" style={{ gridTemplateColumns: `repeat(${abas.length}, 1fr)` }}>
        {abas.map(a => {
          const ativa = (ABA_DE[tela] ?? tela) === a.id
          return (
            <button
              key={a.id}
              className={`aba ${ativa ? 'aba-ativa' : ''}`}
              onClick={() => setTela(a.id)}
              aria-current={ativa}
            >
              <span className="aba-forma" style={{ borderRadius: a.forma }} aria-hidden="true" />
              {a.nome}
            </button>
          )
        })}
      </nav>
    </>
  )
}
