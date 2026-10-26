import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useVault, type Lente } from './useVault'
import { TIPOS_NOTA_CARDAPIO } from '../shared/eventos'
import type { NoteComCampos } from './tipos'
import { hojeISO } from './tipos'
import { SUBS, subPadrao } from './subnav'
import {
  aplicarOrdem, reordenar, soltarPerto, lerOrdem, gravarOrdem,
  lerOrdemSubs, gravarOrdemSubs
} from './ordemLentes'
import {
  criarAba, destinoDe, mesmoDestino, navegar, andar, podeVoltar, podeAvancar,
  abrirEmNova, fecharAba, girar, tituloAba, type Aba, type Destino
} from './abas'
import { subAreaDaAba } from '../shared/subareas'
import { lentesVisiveis, lenteDeAbertura } from './lentes'
import { FORMULARIOS, ITENS } from './formularios'
import {
  IconeHoje, IconeVida, IconeSaude, IconeDev,
  IconeConhecimento, IconeFinancas, IconeCalendario, IconeCerebro
} from './icons'
import { Abertura } from './components/Abertura'
import { Configuracoes } from './components/Configuracoes'
import { Tranca } from './components/Tranca'
import { Confirmar } from './components/Confirmar'
import { Nuvem } from './components/Nuvem'
import { Paleta } from './components/Paleta'
import { Calendario } from './components/Calendario'
import { Cerebro } from './components/Cerebro'
import { NotaPainel } from './components/NotaPainel'
import { ModalFormulario } from './components/ModalFormulario'
import { RegistroTreino } from './components/RegistroTreino'
import { LenteHoje } from './components/LenteHoje'
import { LenteVida } from './components/LenteVida'
import { LenteSaude } from './components/LenteSaude'
import { LenteEstudos } from './components/LenteEstudos'
import { RedeAnimada } from '../shared/RedeAnimada'
import { LenteGrana } from './components/LenteGrana'
import { LenteDev } from './components/LenteDev'
import { TerminalFlutuante } from './components/TerminalFlutuante'
import { IconeLateral } from './components/IconeLateral'

/** Engrenagem do rodapé do rail — abre as Configurações. */
function IconeConfig({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

// A cada 2 minutos: 3 rodadas seguidas rejeitando são 4-6 minutos de nuvem
// fora do ar. Uma falha isolada (rede tremeu por um instante) não passa
// disso — só uma falha que se repete acende o indicador.
const LIMIAR_ALERTA_SYNC = 3

const LENTES: { id: Lente; nome: string; Icone: (p: { size?: number }) => ReactElement }[] = [
  // O cérebro em primeiro, como o dono pediu: é a visão do vault inteiro, e
  // as lentes abaixo dele são recortes dessa mesma rede.
  // O `id` continua `cerebro` mesmo com o rótulo virando Cortex: ele é chave
  // de `paineisTrancados` na config, e renomeá-lo destrancaria o painel de
  // quem já tivesse escolhido trancar esta lente.
  // Na sidebar ele se chama "Rede neural", a pedido do dono: "Cortex" já é o
  // nome do app, e repetido logo abaixo da marca confundia.
  { id: 'cerebro',      nome: 'Rede neural', Icone: IconeCerebro },
  { id: 'hoje',         nome: 'Hoje',    Icone: IconeHoje },
  { id: 'conhecimento', nome: 'Estudos', Icone: IconeConhecimento },
  { id: 'saude',        nome: 'Saúde',   Icone: IconeSaude },
  { id: 'financas',     nome: 'Grana',   Icone: IconeFinancas },
  { id: 'vida',         nome: 'Vida',    Icone: IconeVida },
  { id: 'dev',          nome: 'Dev',     Icone: IconeDev },
  { id: 'calendario',   nome: 'Agenda',  Icone: IconeCalendario }
]

export function App() {
  const v = useVault()
  const hoje = hojeISO()

  /*
   * Quais áreas estão abertas na sidebar.
   *
   * Abrir uma área só mostra as abas dela — não troca a tela. Pedido do dono:
   * poder abrir e fechar grupos continuando onde está, e ter mais de um aberto.
   * A tela só muda ao clicar numa aba.
   */
  /* A ordem das áreas na barra, escolhida arrastando. Preferência desta
     máquina: mora no localStorage, não na config do vault. */
  const [ordemAreas, setOrdemAreas] = useState<string[]>(() => lerOrdem())
  /** Qual área está na mão agora. `null` fora do arraste. */
  const [arrastando, setArrastando] = useState<string | null>(null)
  /**
   * Onde o item vai cair: em cima de quem, e de que lado dele.
   *
   * Existe porque arrastar sem isto era adivinhação — o dono disse que não
   * conseguia ter noção de onde o item ia ficar. A tela desenha uma linha
   * nesta borda, e o solte usa EXATAMENTE a mesma decisão.
   */
  const [alvo, setAlvo] = useState<{ id: string; depois: boolean } | null>(null)

  /** Em qual metade do item o cursor está. Decide de que lado a linha aparece. */
  const metadeDeBaixo = (ev: { clientY: number; currentTarget: Element }): boolean => {
    const r = ev.currentTarget.getBoundingClientRect()
    return ev.clientY > r.top + r.height / 2
  }
  /* A ordem das abas dentro de cada área, também escolhida arrastando. */
  const [ordemSubs, setOrdemSubs] = useState(() => lerOrdemSubs())
  /** Qual aba está na mão. Separado do de área: são dois arrastes diferentes. */
  const [subArrastando, setSubArrastando] = useState<string | null>(null)
  /** O mesmo alvo, para as abas de dentro de uma área. */
  const [alvoSub, setAlvoSub] = useState<{ id: string; depois: boolean } | null>(null)

  const [abertas, setAbertas] = useState<string[]>(() => [v.lente])

  /* ---------- abas e histórico ----------
   *
   * A lista nasce com UMA aba, e não vazia: o histórico de voltar/avançar vale
   * desde o primeiro clique, muito antes de alguém abrir uma segunda aba. A
   * barra de abas só aparece quando existe mais de uma — quem nunca deu
   * Ctrl+clique não ganha uma faixa a mais na tela.
   */
  const [abas, setAbas] = useState<Aba[]>(() =>
    [criarAba({ lente: v.lente, sub: v.sub, nota: null })])
  const [abaAtual, setAbaAtual] = useState(0)

  /** Onde a tela está AGORA, no formato que a aba guarda. */
  const destinoVivo: Destino = { lente: v.lente, sub: v.sub, nota: v.aberta }

  /**
   * O destino que acabamos de mandar para a tela, enquanto ela não chega lá.
   *
   * É um `ref` e não estado porque ninguém desenha isto — e porque ele existe
   * só para o efeito abaixo não registrar como "passo novo" a mudança que o
   * próprio voltar acabou de pedir. Sem ele, voltar gravaria o destino antigo
   * no histórico e o botão de avançar nunca sairia do lugar.
   */
  const aplicando = useRef<Destino | null>(null)

  /** Manda um destino para a tela. O histórico quem cuida é o chamador. */
  const aplicarDestino = (d: Destino): void => {
    aplicando.current = d
    v.setLente(d.lente as Lente)
    v.setSub(d.sub)
    if (d.nota) void v.abrir(d.nota)
    else v.fechar()
  }

  /*
   * Toda mudança de tela virá um passo no histórico da aba da vez.
   *
   * Aqui, e não em cada botão: a tela muda de dezenas de lugares (sidebar,
   * paleta, link dentro de uma nota, duplo clique do Windows), e pendurar o
   * registro em cada um deles deixaria metade dos caminhos fora do histórico.
   */
  useEffect(() => {
    if (aplicando.current) {
      // A tela ainda está indo para onde mandamos. Só volta a registrar
      // quando ela chegar — comparando, e não por tempo.
      if (mesmoDestino(destinoVivo, aplicando.current)) aplicando.current = null
      return
    }
    setAbas(a => navegar(a, abaAtual, destinoVivo))
  }, [v.lente, v.sub, v.aberta, abaAtual])

  const aba = abas[abaAtual]

  /** Volta ou avança DENTRO da aba da vez, sem tocar nas outras. */
  const andarNaAba = (passo: -1 | 1): void => {
    const r = andar(navegar(abas, abaAtual, destinoVivo), abaAtual, passo)
    if (!r) return
    setAbas(r.abas)
    aplicarDestino(r.destino)
  }

  /** Abre um destino em aba nova e vai para ela (o Ctrl+clique). */
  const abrirEmAbaNova = (d: Destino): void => {
    const r = abrirEmNova(abas, abaAtual, destinoVivo, d)
    setAbas(r.abas)
    setAbaAtual(r.atual)
    aplicarDestino(d)
  }

  const irParaAba = (i: number): void => {
    if (i === abaAtual || !abas[i]) return
    const base = navegar(abas, abaAtual, destinoVivo)
    setAbas(base)
    setAbaAtual(i)
    aplicarDestino(destinoDe(base[i]))
  }

  const fecharAbaEm = (i: number): void => {
    const base = navegar(abas, abaAtual, destinoVivo)
    const r = fecharAba(base, abaAtual, i)
    if (r.abas === base) return
    setAbas(r.abas)
    setAbaAtual(r.atual)
    // Aplica sempre: fechar a aba da vez muda a tela, e fechar outra não —
    // nesse caso o destino aplicado é o mesmo que já está no ar.
    aplicarDestino(destinoDe(r.abas[r.atual]))
  }

  /* Os botões laterais do mouse. Vêm do processo principal: no Windows eles
     não chegam à página como clique nenhum. */
  useEffect(() => window.vaultApi.onBotaoLateral(passo => andarNaAba(passo)))
  /**
   * A barra lateral escondida, para o Dev ocupar a tela toda (pedido do
   * dono). Some por inteiro — para ir a outra área, abre de novo pelo ☰ no
   * canto ou pelo Ctrl+B, como no VS Code.
   */
  const [semLateral, setSemLateral] = useState(false)
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSemLateral(s => !s)
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const alternarArea = (id: string): void =>
    setAbertas(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]))

  /*
   * A altura da barra de cima, medida e publicada como `--topo-h`.
   *
   * O editor ampliado do Dev é uma camada fixa. Ele subia até 12 px do topo
   * e cobria o caminho, o botão de esconder o menu e os botões da janela —
   * era a "parte de cima bugada". Agora ele começa embaixo da barra, e a
   * conta se refaz sozinha quando a janela muda de largura (o respiro da
   * barra cresce com a tela).
   */
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.topo')
    if (!el) return
    const medir = (): void =>
      document.documentElement.style.setProperty('--topo-h', `${Math.round(el.getBoundingClientRect().bottom)}px`)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener('resize', medir)
    return () => { ro.disconnect(); window.removeEventListener('resize', medir) }
  })

  /*
   * O arquivo que o Windows mandou abrir ("Abrir com o Cortex").
   *
   * Chega do processo principal com a pasta já autorizada. Guarda um número
   * junto: abrir DUAS vezes o mesmo arquivo tem que valer duas vezes, e sem
   * ele o segundo pedido pareceria o mesmo estado de antes.
   */
  const [doWindows, setDoWindows] = useState<{ raiz: string; rel: string; n: number } | null>(null)
  useEffect(() => window.vaultApi.onAbrirArquivo(e => {
    v.trocarConfig(c => ({ ...c, pastasDev: e.pastasDev }))
    v.setLente('dev')
    // `setLente` volta para a primeira aba (Projetos); quem abre um arquivo
    // quer o editor, que é a aba Código.
    v.setSub('codigo')
    setDoWindows(a => ({ raiz: e.raiz, rel: e.rel, n: (a?.n ?? 0) + 1 }))
  }), [v.trocarConfig, v.setLente, v.setSub])

  const [paleta, setPaleta] = useState(false)
  const [criando, setCriando] = useState<{ tipo: string; inicial?: Record<string, unknown> } | null>(null)
  const [alterando, setAlterando] = useState<NoteComCampos | null>(null)
  const [lancando, setLancando] = useState<{ item: string; dia: string } | null>(null)
  const [modal, setModal] = useState<{ id: string; ctx?: Record<string, unknown> } | null>(null)
  const [excluindo, setExcluindo] = useState<NoteComCampos | null>(null)
  const [excluindoVarias, setExcluindoVarias] = useState<NoteComCampos[] | null>(null)
  const [configurando, setConfigurando] = useState(false)
  const [nuvem, setNuvem] = useState(false)
  /**
   * Qual painel trancado está aberto agora — no máximo um, e só enquanto ele
   * estiver na tela.
   *
   * Guardar o id da lente, e não um booleano, é o que faz sair e voltar pedir
   * a senha de novo: a lente muda, este valor deixa de casar, e a tranca
   * reaparece sozinha. Nunca guarde isto no localStorage nem numa lista de
   * "já destrancados" — seria a tranca deixando de trancar.
   */
  const [destrancado, setDestrancado] = useState<string | null>(null)

  /*
   * Sair do painel tranca de novo.
   *
   * Sem isto, destrancar a Vida uma vez a deixava aberta ate fechar o app:
   * `destrancado` continuava valendo 'vida' enquanto o usuario passeava por
   * outras lentes, e voltar nao pedia nada. O efeito limpa assim que a lente
   * atual deixa de ser a destrancada -- que e o momento exato em que a pessoa
   * saiu.
   */
  /*
   * O que o token aberto precisa casar para continuar valendo.
   *
   * Destrancar a lente inteira vale em qualquer sub-aba dela — é o painel que
   * foi aberto. Destrancar uma sub-área vale só naquela aba: trocar de aba é
   * sair dali, e sair tranca de novo, pela mesma razão de trocar de lente.
   */
  const subAreaAtual = subAreaDaAba(v.lente, v.sub)
  useEffect(() => {
    const vale = destrancado === v.lente || destrancado === subAreaAtual?.pasta
    if (destrancado !== null && !vale) setDestrancado(null)
  }, [v.lente, subAreaAtual?.pasta, destrancado])
  // Quantas rodadas automáticas seguidas falharam (rejeitaram a promise —
  // credencial ausente/inválida, chave revogada, DNS que não resolve mais).
  // Zera a cada rodada que sequer conclui, mesmo pulada por concorrência: o
  // que importa aqui não é "achou eventos", é "conseguiu falar com a nuvem".
  const [falhasSincSeguidas, setFalhasSincSeguidas] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaleta(p => !p)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void v.salvar()
      }

      /*
       * Trocar de aba: Ctrl+Tab adiante, Ctrl+Shift+Tab atrás.
       *
       * Não é Alt+Tab, embora tenha sido o que o dono pediu: Alt+Tab é do
       * Windows, que troca de JANELA e nunca entrega a tecla ao app. Prometer
       * aquele atalho seria prometer um atalho que não funciona.
       */
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault()
        irParaAba(girar(abas.length, abaAtual, e.shiftKey ? -1 : 1))
      }

      // Fechar a aba da vez. A última não fecha — `fecharAba` cuida disso.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        fecharAbaEm(abaAtual)
      }

      // Voltar e avançar pelo teclado, o mesmo que os botões laterais do
      // mouse fazem. Alt+setas é o atalho que todo navegador usa.
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        andarNaAba(e.key === 'ArrowLeft' ? -1 : 1)
      }

      // Ctrl+1 a Ctrl+9: a aba daquela posição, como no navegador.
      if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1
        if (abas[i]) { e.preventDefault(); irParaAba(i) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Sem lista de dependências de propósito: os atalhos de aba leem `abas` e
    // `abaAtual`, e uma lista desatualizada faria o Ctrl+Tab girar sobre a
    // lista de abas de dois renders atrás. Trocar um ouvinte de teclado por
    // render não custa nada.
  })

  // Puxa ao abrir o vault e a cada 2 minutos. Uma falha isolada continua
  // silenciosa — rede caiu por um instante, a próxima rodada resolve, e um
  // aviso a cada soluço seria ruído. O que não pode ficar mudo é uma falha
  // que SE REPETE: credencial errada ou chave revogada faz toda rodada
  // rejeitar, e sem sinal nenhum o usuário só percebe abrindo a aba Nuvem por
  // acaso. `falhasSincSeguidas` conta isso; o indicador na aba usa o valor.
  useEffect(() => {
    if (!v.root) return
    const puxar = (): void => {
      void window.vaultApi.invoke('nuvem:sincronizar', {})
        .then(() => setFalhasSincSeguidas(0))
        .catch(() => setFalhasSincSeguidas(n => n + 1))
    }
    puxar()
    /*
     * 45 segundos, e não mais dois minutos.
     *
     * Este relógio é a REDE DE SEGURANÇA: o caminho normal é a campainha, que
     * traz o evento do celular no instante em que ele chega ao banco. Quando
     * ela falha — rede que bloqueia WebSocket, Realtime fora do ar, aparelho
     * que dormiu — é este número que vira a espera, e dois minutos olhando uma
     * tela que não muda é tempo demais para quem acabou de marcar algo.
     *
     * Uma rodada custa uma chamada que quase sempre volta vazia. Quatro vezes
     * mais chamadas vazias por minuto é barato; dois minutos de dúvida, não.
     */
    const t = setInterval(puxar, 45000)
    return () => clearInterval(t)
  }, [v.root])

  // Republica o cardápio quando a estrutura muda — criar um treino no Cortex
  // tem que fazer ele aparecer no celular sem ninguém apertar nada.
  //
  // A espera existe porque `v.notas` muda a cada gravação do watcher: digitar
  // o nome de um treino dispararia uma publicação por tecla. Um segundo e
  // meio ainda junta a rajada de um salvamento inteiro, e é curto o bastante
  // para que criar um compromisso aqui e olhar o celular pareça imediato — a
  // campainha avisa o celular no instante em que a publicação volta do banco.
  // E a assinatura evita republicar quando mudou outra coisa qualquer do
  // vault — um gasto lançado não mexe no cardápio.
  //
  // As áreas ligadas entram na assinatura junto das notas. É por elas que o
  // celular decide quais abas mostrar, e ele só descobre a mudança quando o
  // cardápio é republicado: sem esta parte, desligar Estudos aqui não tirava
  // o botão de lá até alguém editar uma nota qualquer — o que pode levar dias.
  const assinaturaCardapio = [
    v.config.areas.join(','),
    ...v.notas
      .filter(n => (TIPOS_NOTA_CARDAPIO as readonly string[]).includes(n.tipo))
      .map(n => `${n.path}:${n.mtime}`)
  ].join('|')

  useEffect(() => {
    if (!v.root) return
    const t = setTimeout(() => {
      void window.vaultApi.invoke('nuvem:publicar', {}).catch(() => {})
      // 900 ms, e nao 1500: continua juntando a rajada de um salvamento
      // inteiro (o watcher dispara em decimos de segundo), e corta meio
      // segundo da espera entre marcar no Cortex e ver no celular.
    }, 900)
    return () => clearTimeout(t)
  }, [v.root, assinaturaCardapio])

  /*
   * Enquanto não se sabe se existe vault, não se desenha nem uma coisa nem
   * outra.
   *
   * A tela de criar vault é uma AFIRMAÇÃO — "você não tem vault" — e durante
   * a sondagem ela é falsa na esmagadora maioria das aberturas. Mostrá-la por
   * meio segundo e trocar pelo app é pior que não mostrar nada.
   */
  if (v.sondando && !v.root) {
    return (
      <div className="abertura">
        {/* A rede ao fundo não é o SEU grafo — é um desenho do Cortex, e
            dura o que a abertura durar. Ver as ligações se formando enquanto
            o vault abre diz, sem texto, o que o app faz. */}
        <RedeAnimada className="abertura-rede" />
        <div className="abertura-caixa">
          <h1>Cortex</h1>
          <p className="abertura-sub">Abrindo seu vault…</p>
        </div>
      </div>
    )
  }

  // Abertura: escolher a pasta e, depois, as áreas. `escolheu` distingue
  // "marquei todas" de "nunca passei por aqui".
  if (!v.root || !v.config.escolheu) {
    return (
      <Abertura
        root={v.root}
        escolheu={v.config.escolheu}
        areasAtuais={v.config.areas}
        erro={v.erro}
        aoCriar={() => void v.criarVault()}
        aoEscolher={() => void v.escolher()}
        aoConfirmarAreas={areas => void v.salvarAreas(areas)}
      />
    )
  }

  // Quem decide é `lentes.ts`: `cerebro` e `hoje` não são áreas e vêm
  // sempre — menos no app só de Dev, onde o Hoje não teria o que mostrar.
  const visiveis = aplicarOrdem(lentesVisiveis(LENTES, v.config.areas), ordemAreas)
  const lenteAtual = lenteDeAbertura(visiveis, v.lente, v.config.areas) ?? visiveis[0]
  /* A lente da vez pode ter sumido (o dono desligou a área, ou passou a usar
     só o Dev): quem manda na tela é `lenteAtual`, e não o `v.lente` guardado. */
  const lente = lenteAtual?.id ?? v.lente
  const subs = SUBS[lente]

  const acoes = {
    aoAbrir: (p: string) => void v.abrir(p),
    aoAdicionar: (tipo: string, inicial?: Record<string, unknown>) => setCriando({ tipo, inicial }),
    aoEditar: (n: NoteComCampos) => setAlterando(n),
    aoExcluir: (n: NoteComCampos) => setExcluindo(n),
    aoLancar: (item: string, dia?: string) => setLancando({ item, dia: dia ?? hoje }),
    aoAlterar: (path: string, campos: Record<string, unknown>) => void v.alterar(path, campos),
    aoMarcarDia: (dia: string, campos: Record<string, unknown>) => void v.marcarNoDia(dia, campos),
    aoModal: (id: string, ctx?: Record<string, unknown>) => setModal({ id, ctx })
  }

  function view(): ReactElement {
    // A tranca substitui o painel, e não fica por cima dele: por cima, o
    // conteúdo continuaria montado no DOM e bastaria remover o elemento pelo
    // devtools para ler tudo.
    if (v.config.paineisTrancados.includes(v.lente) && destrancado !== v.lente) {
      const nome = LENTES.find(l => l.id === v.lente)?.nome ?? 'Este painel'
      return <Tranca nome={nome} dica={v.config.dicaSenha} aoDestrancar={() => setDestrancado(v.lente)} />
    }

    /*
     * A tranca de uma pasta só, dentro de uma lente aberta.
     *
     * Trancar a Vida inteira para proteger Contas e senhas escondia junto as
     * metas e a lista de compras. Aqui a lente abre normal e o cadeado fica
     * na aba — mesmo lugar, mesmo componente, pedaço menor.
     *
     * A lente destrancada vale por cima: quem digitou a senha para abrir o
     * painel inteiro não digita de novo para entrar numa aba dele.
     */
    if (
      subAreaAtual && v.config.paineisTrancados.includes(subAreaAtual.pasta)
      && destrancado !== subAreaAtual.pasta && destrancado !== v.lente
    ) {
      return (
        <Tranca
          nome={subAreaAtual.nome}
          dica={v.config.dicaSenha}
          aoDestrancar={() => setDestrancado(subAreaAtual.pasta)}
        />
      )
    }

    const comuns = { notas: v.notas, sub: v.sub, hoje, areas: v.config.areas, ...acoes }
    switch (lente) {
      // Fora de `comuns` de propósito: o cérebro não lê `v.notas`, porque
      // precisa das LIGAÇÕES, e essas não estão ali — vêm do índice pelo
      // canal `vault:grafo`.
      // `v.abrir` direto, e não `acoes.aoAbrir`: `acoes` é um objeto literal
      // recriado a cada render, então `acoes.aoAbrir` é uma função NOVA
      // sempre. Ela está nas dependências do efeito que monta o canvas, e
      // aquele efeito refaz o layout inteiro. Medido: 8,8 s de tela travada
      // a cada render do App. `v.abrir` é `useCallback` e não muda.
      case 'cerebro':      return <Cerebro aoAbrir={v.abrir} />
      case 'hoje':         return <LenteHoje {...comuns} />
      case 'vida':         return <LenteVida {...comuns} />
      case 'saude':        return <LenteSaude {...comuns} />
      case 'conhecimento': return <LenteEstudos {...comuns} />
      case 'financas':     return <LenteGrana {...comuns} />
      case 'calendario':
        return (
          <Calendario
            notas={v.notas} hoje={hoje}
            aoAbrir={acoes.aoAbrir} aoAdicionar={acoes.aoAdicionar} aoExcluir={acoes.aoExcluir}
            aoExcluirVarias={setExcluindoVarias}
          />
        )
      case 'dev':
        return (
          <LenteDev
            {...comuns}
            pastas={v.pastas}
            pastasDev={v.config.pastasDev}
            aoAutorizar={() => void v.autorizarPasta()}
            aoRemoverPastaDev={raiz => void v.removerPasta(raiz)}
            arvore={v.arvoreDev}
            lerArquivo={v.lerArquivo}
            gravarArquivo={v.gravarArquivo}
            aoTerminal={(raiz, sub) => void v.abrirTerminal(raiz, sub)}
            aoNovoProjeto={(modelo, linguagem, nome) => v.novoProjeto(modelo, linguagem, nome)}
            aoClonarRepo={(url, instalar) => v.clonarRepo(url, instalar)}
            abrirExterno={doWindows}
            aoRevelar={(raiz, sub) => void v.revelar(raiz, sub)}
            aoCriarPasta={p => void v.criarPasta(p)}
            aoMoverNota={(de, para) => void v.mover(de, para)}
            aoSoltarPastas={arquivos => void v.autorizarArrastadas(arquivos)}
          />
        )
      default: return <></>
    }
  }

  const formDe = (n: NoteComCampos) => FORMULARIOS[n.tipo]

  return (
    <>
      <div className="shell" data-lente={v.lente} data-sem-lateral={semLateral}>
        {/*
          * A sidebar única do redesign.
          *
          * Era um trilho de ícones mais uma coluna de abas da área aberta. Agora
          * é uma coluna só: cada área é um item, e a área aberta desdobra as
          * abas dela logo abaixo. As outras ficam recolhidas — abertas todas,
          * a lista não caberia numa tela de notebook.
          */}
        <aside className="sidebar-app">
          <div className="sb-marca">Cortex</div>
          {/*
            * O vão entre os itens também aceita o solte.
            *
            * Sem isto, passar o cursor por qualquer pedaço da coluna que não
            * fosse um item exato trocava o ponteiro pelo ícone de proibido —
            * era o "mouse com bloqueiozinho" de que o dono reclamou. O
            * destino continua sendo o último alvo que a linha mostrou; aqui só
            * se promete que arrastar ali é permitido.
            */}
          <nav
            className="sb-nav"
            aria-label="Áreas do Cortex"
            onDragOver={ev => {
              if (!arrastando && !subArrastando) return
              ev.preventDefault()
              ev.dataTransfer.dropEffect = 'move'
            }}
            onDragEnd={() => { setArrastando(null); setAlvo(null); setAlvoSub(null) }}
          >
            {visiveis.map(({ id, nome, Icone }) => {
              const abasDaArea = SUBS[id]
              const ativa = v.lente === id
              const aberta = abertas.includes(id)
              return (
                <div
                  key={id}
                  className="sb-grupo"
                  data-area={id}
                  data-com-abas={abasDaArea ? 'true' : undefined}
                  data-arrastando={arrastando === id || undefined}
                  data-alvo={
                    alvo?.id === id && arrastando && arrastando !== id
                      ? (alvo.depois ? 'depois' : 'antes')
                      : undefined
                  }
                  draggable
                  onDragStart={ev => {
                    setArrastando(id)
                    // Sem isto o Chromium recusa o arraste em alguns casos.
                    ev.dataTransfer.effectAllowed = 'move'
                    ev.dataTransfer.setData('text/plain', id)
                  }}
                  onDragOver={ev => {
                    ev.preventDefault()
                    ev.dataTransfer.dropEffect = 'move'
                    // Metade de cima do item: a linha fica acima dele; metade
                    // de baixo, abaixo. É assim que se alcança o fim da lista.
                    const depois = metadeDeBaixo(ev)
                    if (alvo?.id !== id || alvo.depois !== depois) setAlvo({ id, depois })
                  }}
                  onDrop={ev => {
                    ev.preventDefault()
                    const de = ev.dataTransfer.getData('text/plain') || arrastando
                    setArrastando(null)
                    setAlvo(null)
                    if (!de) return
                    /* A ordem guardada parte da ordem ATUAL da tela, e não da
                       lista salva: se ainda não havia nada salvo, a primeira
                       arrastada precisa preservar o resto como está. */
                    const atual = visiveis.map(l => l.id)
                    const nova = soltarPerto(atual, de, id, metadeDeBaixo(ev))
                    if (nova === atual) return
                    setOrdemAreas(nova)
                    gravarOrdem(nova)
                  }}
                  onDragEnd={() => { setArrastando(null); setAlvo(null) }}
                >
                  <button
                    className="sb-item"
                    data-ativa={ativa}
                    aria-current={ativa && !abasDaArea ? 'page' : undefined}
                    aria-expanded={abasDaArea ? aberta : undefined}
                    // Área com abas só abre e fecha; sem abas, é a própria tela.
                    // Com Ctrl, a área vai para uma aba NOVA — inclusive as que
                    // têm sub-abas, que de outro modo só abririam o grupo e não
                    // teriam como ser abertas ao lado.
                    onClick={ev => {
                      if (ev.ctrlKey || ev.metaKey) {
                        abrirEmAbaNova({ lente: id, sub: subPadrao(id), nota: null })
                        return
                      }
                      if (abasDaArea) alternarArea(id)
                      else v.setLente(id)
                    }}
                  >
                    <Icone size={17} />
                    <span>{nome}</span>
                    {abasDaArea && <span className="sb-seta" aria-hidden="true">▸</span>}
                  </button>
                  {abasDaArea && aberta && (
                    <div className="sb-subs">
                      {aplicarOrdem(abasDaArea, ordemSubs[id] ?? []).map(s => (
                        <button
                          key={s.id}
                          className="sb-sub"
                          aria-current={ativa && v.sub === s.id ? 'page' : undefined}
                          draggable
                          data-arrastando={subArrastando === `${id}:${s.id}` || undefined}
                          data-alvo={
                            alvoSub?.id === `${id}:${s.id}` && subArrastando
                              && subArrastando !== `${id}:${s.id}`
                              ? (alvoSub.depois ? 'depois' : 'antes')
                              : undefined
                          }
                          onDragStart={ev => {
                            // Sem isto, arrastar a aba arrastaria a área
                            // inteira junto — o grupo também é arrastável.
                            ev.stopPropagation()
                            setSubArrastando(`${id}:${s.id}`)
                            ev.dataTransfer.effectAllowed = 'move'
                            ev.dataTransfer.setData('text/plain', s.id)
                          }}
                          onDragOver={ev => {
                            ev.preventDefault()
                            ev.stopPropagation()
                            ev.dataTransfer.dropEffect = 'move'
                            const depois = metadeDeBaixo(ev)
                            const chave = `${id}:${s.id}`
                            if (alvoSub?.id !== chave || alvoSub.depois !== depois) {
                              setAlvoSub({ id: chave, depois })
                            }
                          }}
                          onDrop={ev => {
                            ev.preventDefault()
                            ev.stopPropagation()
                            const de = ev.dataTransfer.getData('text/plain')
                            const depois = metadeDeBaixo(ev)
                            setSubArrastando(null)
                            setAlvoSub(null)
                            if (!de) return
                            /* Parte da ordem ATUAL da tela: na primeira vez
                               não há nada salvo, e o resto tem de ficar como
                               está. */
                            const atual = aplicarOrdem(abasDaArea, ordemSubs[id] ?? []).map(x => x.id)
                            const ordenada = soltarPerto(atual, de, s.id, depois)
                            if (ordenada === atual) return
                            const nova = { ...ordemSubs, [id]: ordenada }
                            setOrdemSubs(nova)
                            gravarOrdemSubs(nova)
                          }}
                          onDragEnd={ev => {
                            ev.stopPropagation()
                            setSubArrastando(null)
                            setAlvoSub(null)
                          }}
                          onClick={ev => {
                            // Com Ctrl, a aba abre AO LADO em vez de trocar a
                            // tela: é o que deixa estrutura de redação,
                            // repertórios e pomodoro abertos ao mesmo tempo.
                            if (ev.ctrlKey || ev.metaKey) {
                              abrirEmAbaNova({ lente: id, sub: s.id, nota: null })
                              return
                            }
                            // `setLente` volta a aba para o panorama; a aba
                            // escolhida vem logo depois e é a que fica.
                            if (!ativa) v.setLente(id)
                            v.setSub(s.id)
                            v.fechar()
                          }}
                        >
                          {s.nome}
                          {/* O cadeado diz qual aba pede senha antes de a pessoa
                              clicar — depois que a tranca aparece já é tarde
                              para escolher outra aba. */}
                          {(() => {
                            const sa = subAreaDaAba(id, s.id)
                            return sa && v.config.paineisTrancados.includes(sa.pasta)
                              ? <span className="subnav-cadeado" aria-label="trancada">🔒</span>
                              : null
                          })()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
          <button
            className="sb-item sb-rodape"
            title={
              falhasSincSeguidas >= LIMIAR_ALERTA_SYNC
                ? 'Configurações — a sincronização com o celular está falhando'
                : 'Configurações'
            }
            onClick={() => setConfigurando(true)}
          >
            <IconeConfig size={17} />
            <span>Configurações</span>
            {falhasSincSeguidas >= LIMIAR_ALERTA_SYNC && (
              <span className="rail-alerta" aria-hidden="true" />
            )}
          </button>
        </aside>

        <main className="main">
          {/*
            * A barra de abas, estilo navegador.
            *
            * Só aparece com mais de uma aba: quem nunca deu Ctrl+clique não
            * precisa de uma faixa a mais na tela dizendo que tem uma aba
            * aberta. É também o que ensina o recurso — ela surge no momento em
            * que a segunda aba nasce.
            */}
          {abas.length > 1 && (
            <div className="abas" role="tablist" aria-label="Abas abertas">
              {abas.map((a, i) => {
                const d = destinoDe(a)
                const nome = tituloAba(a, {
                  lente: LENTES.find(l => l.id === d.lente)?.nome,
                  sub: SUBS[d.lente as Lente]?.find(s => s.id === d.sub)?.nome,
                  // O título da nota, quando ela já está no índice. Enquanto
                  // não estiver, a aba mostra a área — nunca o caminho cru.
                  nota: d.nota ? v.notas.find(n => n.path === d.nota)?.title : undefined
                })
                return (
                  <div key={a.id} className="aba" data-ativa={i === abaAtual || undefined}>
                    <button
                      className="aba-nome"
                      role="tab"
                      aria-selected={i === abaAtual}
                      title={nome}
                      onClick={() => irParaAba(i)}
                    >
                      {nome}
                    </button>
                    <button
                      className="aba-fechar"
                      title="Fechar esta aba (Ctrl+W)"
                      aria-label={`Fechar ${nome}`}
                      onClick={() => fecharAbaEm(i)}
                    >×</button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="topo">
            {/* Esconder e mostrar o menu, em qualquer tela (o mesmo que Ctrl+B).
                Escondido, o botão diz "Abrir menu" — é por ele que se volta. */}
            <button
              className="topo-menu"
              aria-pressed={semLateral}
              title={semLateral ? 'Abrir o menu (Ctrl+B)' : 'Esconder o menu (Ctrl+B)'}
              onClick={() => setSemLateral(s => !s)}
            >
              <IconeLateral aberta={!semLateral} />
              {semLateral && <span>Abrir menu</span>}
            </button>

            {/* Voltar e avançar, o mesmo caminho dos botões laterais do mouse.
                Desabilitados quando não há para onde ir — um botão que às
                vezes não faz nada é pior que um botão apagado. */}
            <span className="topo-nav">
              <button
                className="nav-botao"
                title="Voltar (Alt ←, ou o botão lateral do mouse)"
                aria-label="Voltar"
                disabled={!podeVoltar(aba)}
                onClick={() => andarNaAba(-1)}
              >‹</button>
              <button
                className="nav-botao"
                title="Avançar (Alt →, ou o botão lateral do mouse)"
                aria-label="Avançar"
                disabled={!podeAvancar(aba)}
                onClick={() => andarNaAba(1)}
              >›</button>
            </span>

            <span className="caminho">
              <strong>{lenteAtual?.nome}</strong>
              {subs && (
                <>
                  <span className="caminho-sep" aria-hidden="true">/</span>
                  {subs.find(s => s.id === v.sub)?.nome}
                </>
              )}
            </span>
            <div className="topo-dir">
              <button className="btn-fantasma" onClick={() => setPaleta(true)}>
                Buscar <kbd>Ctrl K</kbd>
              </button>
            </div>
          </div>

          {v.erro && (
            <div className="erro" onClick={v.limparErro} title="Clique para dispensar">{v.erro}</div>
          )}

          {v.aberta ? (
            <NotaPainel
              nota={v.notaAberta}
              caminho={v.aberta}
              conteudo={v.conteudo}
              editando={v.editando}
              sujo={v.sujo}
              saindo={v.saindo}
              entrando={v.entrando}
              voltarPara={lenteAtual?.nome ?? 'voltar'}
              aoVoltar={v.fechar}
              aoEditar={v.setEditando}
              aoMudar={v.setConteudo}
              aoSalvar={() => void v.salvar()}
              /* Ctrl+clique num [[link]] abre a nota numa aba nova. A aba
                 nasce no destino de agora e so entao recebe a nota: assim a
                 de origem fica intacta, que e o ponto de encadear leitura
                 sem perder de onde veio. */
              aoAbrirNome={(alvo, novaAba) => {
                if (novaAba) abrirEmAbaNova(destinoVivo)
                void v.abrirPorNome(alvo)
              }}
              aoAbrirPath={(caminho, novaAba) => {
                if (novaAba) abrirEmAbaNova(destinoVivo)
                void v.abrir(caminho)
              }}
              aoExcluir={v.notaAberta ? () => setExcluindo(v.notaAberta) : undefined}
              // O acerto dos exercícios volta para o frontmatter da própria
              // nota do conteúdo — mesmo caminho que o simulado usa.
              aoGravarCampos={campos => { if (v.aberta) void v.alterar(v.aberta, campos) }}
            />
          ) : view()}
        </main>
      </div>

      {/* Fora da lente Dev de propósito: os processos seguem rodando quando a
          pessoa troca de área, e a tela deles não pode sumir junto. */}
      <TerminalFlutuante />

      {paleta && (
        <Paleta
          notas={v.notas}
          aoEscolher={p => void v.abrir(p)}
          aoIrParaLente={id => v.setLente(id as Lente)}
          aoCriar={titulo => setCriando({ tipo: 'anotacao', inicial: { titulo } })}
          aoComando={id => {
            // Cada comando reusa o mesmo caminho que o botão da lente usa —
            // a paleta é um atalho, não uma segunda forma de gravar.
            if (id === 'treino') setModal({ id: 'registro-treino' })
            else if (id === 'gasto') setLancando({ item: 'transacao', dia: hoje })
            else if (id === 'pomodoro') { v.setLente('conhecimento'); v.setSub('pomodoro') }
            else if (id === 'configuracoes') setConfigurando(true)
            else if (id === 'acontecimento') setCriando({ tipo: id, inicial: { date: hoje } })
            else if (FORMULARIOS[id]) setCriando({ tipo: id })
          }}
          aoFechar={() => setPaleta(false)}
        />
      )}

      {criando && FORMULARIOS[criando.tipo] && (
        <ModalFormulario
          nome={FORMULARIOS[criando.tipo].nome}
          campos={FORMULARIOS[criando.tipo].campos}
          hoje={hoje}
          inicial={criando.inicial}
          aoFechar={() => setCriando(null)}
          aoSalvar={async campos => {
            // `pasta` é destino, não conteúdo: vem do navegador do Dev para
            // dizer ONDE criar, e não pode acabar escrita no frontmatter.
            const juntos = { ...criando.inicial, ...campos } as Record<string, unknown>
            const pasta = juntos.pasta
            delete juntos.pasta
            await v.criar(criando.tipo, juntos, typeof pasta === 'string' ? pasta : undefined)
            setCriando(null)
          }}
        />
      )}

      {alterando && formDe(alterando) && (
        <ModalFormulario
          nome={`Editar ${formDe(alterando).nome.toLowerCase()}`}
          campos={formDe(alterando).campos}
          hoje={hoje}
          inicial={{ ...alterando.campos, titulo: alterando.title }}
          acao="Salvar alterações"
          aoFechar={() => setAlterando(null)}
          aoSalvar={async campos => {
            await v.alterar(alterando.path, campos)
            setAlterando(null)
          }}
        />
      )}

      {alterando && !formDe(alterando) && (
        <Confirmar
          titulo="Sem formulário para este tipo"
          texto={`"${alterando.tipo}" não tem formulário. Abra a nota para editar o texto direto.`}
          rotulo="Abrir a nota"
          aoConfirmar={() => { void v.abrir(alterando.path); setAlterando(null) }}
          aoFechar={() => setAlterando(null)}
        />
      )}

      {lancando && ITENS[lancando.item] && (
        <ModalFormulario
          nome={`${ITENS[lancando.item].nome} · ${lancando.dia}`}
          campos={ITENS[lancando.item].campos}
          hoje={hoje}
          aoFechar={() => setLancando(null)}
          aoSalvar={async item => {
            await v.lancar(lancando.dia, ITENS[lancando.item].campo, item)
            setLancando(null)
          }}
        />
      )}

      {modal?.id === 'registro-treino' && (
        <RegistroTreino
          modelos={v.notas.filter(n => n.tipo === 'treino-modelo')}
          sessoes={v.notas.filter(n => n.tipo === 'sessao')}
          modeloInicial={typeof modal.ctx?.modelo === 'string' ? modal.ctx.modelo : undefined}
          hoje={hoje}
          aoFechar={() => setModal(null)}
          aoSalvar={async campos => {
            await v.criar('sessao', campos)
            setModal(null)
          }}
        />
      )}

      {configurando && (
        <Configuracoes
          root={v.root}
          quantasNotas={v.notas.length}
          config={v.config}
          aoSalvarAreas={areas => void v.salvarAreas(areas)}
          aoTrocarConfig={v.trocarConfig}
          aoAbrirNuvem={() => setNuvem(true)}
          aoFechar={() => setConfigurando(false)}
          aoTrocarVault={v.trocarVault}
          sincronizacaoFalhando={falhasSincSeguidas >= LIMIAR_ALERTA_SYNC}
        />
      )}

      {excluindoVarias && (
        <Confirmar
          titulo={`Apagar ${excluindoVarias.length} cópias?`}
          texto={`São cópias idênticas de compromissos que vieram do Google Agenda — de cada um fica uma nota, e o evento no Google não muda. Os arquivos somem de vez: isto não tem desfazer.`}
          rotulo="Apagar as cópias"
          perigo
          aoConfirmar={() => { void v.excluirVarias(excluindoVarias.map(n => n.path)); setExcluindoVarias(null) }}
          aoFechar={() => setExcluindoVarias(null)}
        />
      )}

      {excluindo && (
        <Confirmar
          titulo="Excluir esta nota?"
          texto={`"${excluindo.title}" será apagada do disco. O arquivo ${excluindo.path} some de vez — isto não tem desfazer.`}
          rotulo="Excluir"
          perigo
          aoConfirmar={() => { void v.excluir(excluindo.path); setExcluindo(null) }}
          aoFechar={() => setExcluindo(null)}
        />
      )}

      {nuvem && (
        <Nuvem
          aoFechar={() => setNuvem(false)}
          sincronizacaoAutomaticaFalhando={falhasSincSeguidas >= LIMIAR_ALERTA_SYNC}
        />
      )}
    </>
  )
}
