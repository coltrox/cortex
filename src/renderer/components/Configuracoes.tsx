import { useEffect, useState } from 'react'
import { SeletorAreas } from './Abertura'
import { ProtecaoSenha } from './ProtecaoSenha'
import { lerTema, salvarTema, aplicarTema, type Tema } from '../tema'
import type { Config } from '../useVault'
import { mensagemDeErro } from '../useVault'
import type { ProcessoInfo } from '../../shared/types'
import { SaidaProcesso } from './PainelRodar'
import { AvisoErro } from './NovoProjeto'

/*
 * Abas na lateral: o painel cresceu a ponto de virar rolagem, e quem abre as
 * configurações quase sempre sabe o que veio mudar. Cada aba monta só o seu
 * bloco — os componentes são os mesmos de antes, só mudaram de endereço.
 */
type Aba = 'geral' | 'aparencia' | 'areas' | 'seguranca' | 'celular' | 'google' | 'claude'

const ABAS: { id: Aba; nome: string }[] = [
  { id: 'geral', nome: 'Geral' },
  { id: 'aparencia', nome: 'Aparência' },
  { id: 'areas', nome: 'Áreas' },
  { id: 'seguranca', nome: 'Segurança' },
  { id: 'celular', nome: 'Celular' },
  { id: 'google', nome: 'Google Agenda' },
  { id: 'claude', nome: 'Claude' }
]

/**
 * O painel de Configurações — o único item do rodapé do rail.
 *
 * Tudo que era botão solto ali dentro mora aqui: quais áreas aparecem, a
 * senha dos painéis, e a conexão com o celular. O rail volta a ser só a
 * lista de lentes, que é o que ele deveria ser.
 */
export function Configuracoes({
  root, quantasNotas, config, aoSalvarAreas, aoTrocarConfig, aoAbrirNuvem, aoFechar,
  aoTrocarVault, sincronizacaoFalhando
}: {
  root: string | null
  /** Quantas notas o vault aberto tem. Zero denuncia pasta errada. */
  quantasNotas: number
  config: Config
  aoSalvarAreas: (areas: string[]) => void
  aoTrocarConfig: (c: Config) => void
  aoAbrirNuvem: () => void
  aoFechar: () => void
  /** Some sozinho: o app volta à tela de criar/escolher no próximo render. */
  aoTrocarVault: () => void
  sincronizacaoFalhando: boolean
}) {
  const [marcadas, setMarcadas] = useState<string[]>(config.areas)
  const [aba, setAba] = useState<Aba>('geral')
  /*
   * A versão vem do processo principal, e não de uma constante aqui.
   *
   * `app.getVersion()` lê o `package.json` empacotado — a mesma fonte que o
   * instalador e o atualizador usam. Um número escrito à mão no renderer
   * viraria mentira na primeira release em que alguém trocasse num lugar e
   * esquecesse do outro. E versão errada na tela é pior do que versão
   * nenhuma: é o primeiro dado que se olha quando algo dá errado.
   */
  const [versao, setVersao] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aoFechar])

  useEffect(() => {
    // Falha em silêncio: sem a versão a linha some, e nada mais nas
    // Configurações depende dela.
    void window.vaultApi.versaoDoApp().then(setVersao).catch(() => {})
  }, [])

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="form largo" onClick={e => e.stopPropagation()}>
        <div className="form-topo">
          Configurações
          {/* Junto do título, e não escondida no fim: é o dado que se procura
              primeiro quando algo não funciona, e o primeiro que alguém pede
              quando você conta que algo não funcionou. */}
          {versao && <span className="config-versao">Cortex {versao}</span>}
        </div>
        <div className="config-abas">
          <nav className="config-nav" aria-label="Seções das configurações">
            {ABAS.map(a => (
              <button
                key={a.id}
                className={`config-aba ${aba === a.id ? 'config-aba-ativa' : ''}`}
                aria-current={aba === a.id ? 'page' : undefined}
                onClick={() => setAba(a.id)}
              >
                {a.nome}
                {a.id === 'celular' && sincronizacaoFalhando && <span className="config-alerta"> ·</span>}
              </button>
            ))}
          </nav>
        <div className="form-corpo config-corpo">

          {aba === 'geral' && (
          <section className="config-bloco">
            <h3>Vault</h3>
            <p className="form-dica">Onde estas notas vivem no disco.</p>
            <p className="config-caminho"><code>{root}</code></p>
            {/* A contagem não é enfeite: é o que denuncia pasta errada. Um
                vault apontado para o lugar errado abre sem erro nenhum e
                deixa todas as telas em branco — aqui isso vira "0 notas". */}
            <p className="config-contagem" data-vazio={quantasNotas === 0}>
              {quantasNotas === 0
                ? '0 notas — esta pasta está vazia. Se não era ela, troque abaixo.'
                : `${quantasNotas} notas carregadas.`}
            </p>
            <button className="btn-fantasma" onClick={() => { aoFechar(); aoTrocarVault() }}>
              Trocar de vault
            </button>
          </section>
          )}

          {aba === 'geral' && <BlocoAtualizacao versaoAtual={versao} />}

          {aba === 'areas' && (
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
          )}

          {aba === 'seguranca' && <ProtecaoSenha config={config} aoTrocarConfig={aoTrocarConfig} />}

          {aba === 'aparencia' && <BlocoTema />}

          {aba === 'celular' && (
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
          )}

          {aba === 'google' && <BlocoGoogle />}

          {aba === 'claude' && <BlocoClaude />}

        </div>
        </div>
        <div className="form-rodape">
          <button className="btn" onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

/*
 * Não há mais botão de reconstruir o índice.
 *
 * Ele existia porque a varredura do vault só acontecia ao ABRIR o vault, e
 * quem acrescentasse notas por fora do app não tinha como forçar a releitura.
 * Mas isso já é automático: `session.open()` roda `syncAll()` em toda
 * abertura, e o `VaultWatcher` cobre o que muda com o app aberto. O botão só
 * dava a impressão de que manter a tela em dia era trabalho de quem usa.
 *
 * O que restava dele — dizer quantas notas o vault tem — virou uma linha no
 * bloco Vault acima, que é onde a informação responde a pergunta certa:
 * "esta pasta é a certa?".
 */

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

/**
 * A atualização do app, à vista.
 *
 * Ela sempre aconteceu sozinha, mas calada: quem esperava uma versão nova não
 * tinha como saber se o Cortex já tinha procurado, se estava baixando ou se
 * havia algum problema. Relido a cada 2 s enquanto a aba está aberta.
 */
function BlocoAtualizacao({ versaoAtual }: { versaoAtual: string }) {
  const [e, setE] = useState<import('../../shared/types').EstadoAtualizacao | null>(null)

  useEffect(() => {
    let vivo = true
    const ler = (): void => {
      void window.vaultApi.atualizacao.estado().then(x => { if (vivo) setE(x) }).catch(() => {})
    }
    ler()
    const t = setInterval(ler, 2000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  if (!e || e.fase === 'desligada') return null

  const quando = e.ultimaVerificacao
    ? new Date(e.ultimaVerificacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null
  const frase =
    e.fase === 'procurando' ? 'Procurando versão nova…'
      : e.fase === 'baixando' ? `Baixando a versão ${e.versao ?? 'nova'}${e.progresso !== null ? ` — ${e.progresso}%` : ''}…`
        : e.fase === 'pronta' ? `A versão ${e.versao} está pronta para instalar.`
          : e.fase === 'em-dia' ? `Você está na versão mais nova (${versaoAtual}).`
            : e.fase === 'erro' ? 'Não deu para procurar agora (sem internet?). Tenta de novo sozinho daqui a pouco.'
              : 'A primeira procura acontece logo depois de abrir o app.'

  return (
    <section className="config-bloco">
      <h3>Atualização</h3>
      <p className="form-dica">
        {frase}
        {quando && e.fase !== 'baixando' && e.fase !== 'pronta' ? ` Última procura às ${quando}.` : ''}
      </p>
      <div className="google-botoes">
        {e.fase === 'pronta' ? (
          <button className="btn" onClick={() => void window.vaultApi.atualizacao.reiniciar()}>
            Reiniciar e atualizar
          </button>
        ) : (
          <button className="btn-fantasma" disabled={e.fase === 'procurando' || e.fase === 'baixando'}
            onClick={() => void window.vaultApi.atualizacao.procurar().then(setE)}>
            Procurar agora
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * Google Agenda, de duas vias.
 *
 * Três passos na ordem em que acontecem: escolher o JSON do cliente (uma vez),
 * entrar com a conta Google (abre o navegador), e depois só acompanhar. O
 * estado é relido a cada poucos segundos enquanto a aba está aberta — a
 * sincronia roda sozinha no processo principal.
 */
function BlocoGoogle() {
  const [estado, setEstado] = useState<import('../../shared/types').EstadoGoogle | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const ler = (): void => {
      void window.vaultApi.google.estado().then(e => { if (vivo) setEstado(e) }).catch(() => {})
    }
    ler()
    const t = setInterval(ler, 4000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  const fazer = async (rotulo: string, acao: () => Promise<import('../../shared/types').EstadoGoogle>): Promise<void> => {
    setOcupado(rotulo)
    setErro(null)
    try {
      setEstado(await acao())
    } catch (e) {
      // O Electron embrulha o erro do main: fica só a frase que importa.
      setErro(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setOcupado(null)
    }
  }

  const quando = estado?.ultima
    ? new Date(estado.ultima).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <section className="config-bloco">
      <h3>Google Agenda</h3>
      <p className="form-dica">
        Compromissos, provas e datas comemorativas vão para um calendário
        chamado “Cortex” na sua conta Google — e aparecem no iPhone e no
        Android com a mesma conta. O que você criar ou editar nesse calendário
        volta para cá. Os compromissos dos seus outros calendários (de 7 dias
        atrás a 90 dias à frente) também entram no Cortex, só para leitura —
        o Cortex nunca mexe neles.
      </p>

      {!estado ? (
        <p className="form-dica">Carregando…</p>
      ) : !estado.temCliente ? (
        <>
          <p className="form-dica">
            Passo 1: escolha o arquivo JSON do cliente “App para computador”
            baixado do Google Cloud. Ele fica guardado cifrado neste PC.
          </p>
          <button className="btn" disabled={ocupado !== null}
            onClick={() => void fazer('arquivo', () => window.vaultApi.google.importarCliente())}>
            Escolher arquivo do cliente
          </button>
        </>
      ) : !estado.conectado ? (
        <>
          <p className="form-dica">
            Entre com a conta Google do seu calendário. O login abre no
            navegador; depois é só voltar para cá.
          </p>
          <div className="google-botoes">
            <button className="btn" disabled={ocupado !== null}
              onClick={() => void fazer('conectar', () => window.vaultApi.google.conectar())}>
              {ocupado === 'conectar' ? 'Esperando o login no navegador…' : 'Conectar com o Google'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="config-contagem">
            <span className="google-ponto" aria-hidden="true" /> Conectado
            {estado.sincronizando || ocupado === 'sincronizar'
              ? ' · sincronizando…'
              : quando ? ` · última sincronia ${quando}` : ''}
            {estado.ligados > 0 && ` · ${estado.ligados} itens no calendário`}
          </p>
          <div className="google-botoes">
            <button className="btn" disabled={ocupado !== null || estado.sincronizando}
              onClick={() => void fazer('sincronizar', () => window.vaultApi.google.sincronizar())}>
              Sincronizar agora
            </button>
            <button className="btn-fantasma" disabled={ocupado !== null}
              onClick={() => {
                if (!window.confirm('Desconectar o Google Agenda? O calendário “Cortex” continua na sua conta, mas para de atualizar.')) return
                void fazer('desconectar', () => window.vaultApi.google.desconectar())
              }}>
              Desconectar
            </button>
          </div>
          {!estado.podeLer && (
            <p className="config-alerta google-erro">
              {/*
                Só aparece para quem conectou antes de o Cortex ler os outros
                calendários: a permissão nova precisa ser aprovada UMA vez.
                Dizer isso evita a impressão de que é preciso reconectar sempre.
              */}
              Falta uma permissão, só desta vez: quando você conectou, o Cortex ainda não
              lia os seus outros calendários. Clique em “Conectar de novo” e, na tela do
              Google, deixe marcada a opção de ver os seus calendários. Depois disso tudo
              sincroniza sozinho.{' '}
              <button className="btn-fantasma" disabled={ocupado !== null}
                onClick={() => void fazer('conectar', () => window.vaultApi.google.conectar())}>
                {ocupado === 'conectar' ? 'Esperando o login…' : 'Conectar de novo'}
              </button>
            </p>
          )}
          <p className="form-dica">Confere sozinho a cada 3 minutos, e logo depois de você mexer na agenda.</p>
        </>
      )}

      {(erro || estado?.erro) && (
        <p className="config-alerta google-erro">{erro ?? estado?.erro}</p>
      )}
    </section>
  )
}

/**
 * O conector do Cortex para o Claude (MCP).
 *
 * Um botão "Conectar" (pedido do dono): abre um terminal aqui mesmo, roda o
 * registro no Claude Code e fecha sozinho quando dá certo. Registrar continua
 * sendo decisão de quem usa — nada roda sem o clique —, e o comando
 * continua à vista, para conferir ou rodar à mão.
 */
function BlocoClaude() {
  const [comando, setComando] = useState('')
  const [copiado, setCopiado] = useState(false)
  /** O processo do "Conectar" enquanto a saída dele está na tela. */
  const [proc, setProc] = useState<ProcessoInfo | null>(null)
  const [estado, setEstado] = useState<'parado' | 'rodando' | 'ok' | 'falhou'>('parado')
  const [erro, setErro] = useState<string | null>(null)
  /** O que o Claude Code tem registrado agora — lido ao abrir o bloco. */
  const [conexao, setConexao] = useState<'conectado' | 'outra-instalacao' | 'desconectado' | null>(null)
  useEffect(() => {
    void window.vaultApi.estadoConector().then(r => setConexao(r.estado)).catch(() => setConexao('desconectado'))
  }, [])

  // Acompanha o processo; deu certo, o terminal fecha sozinho em 1,5 s.
  useEffect(() => {
    if (!proc || estado !== 'rodando') return
    const t = setInterval(() => {
      void window.vaultApi.listarProcessos().then(r => {
        const p = r.processos.find(x => x.id === proc.id)
        if (!p || p.saiu === null) return
        setProc(p)
        if (p.saiu === 0) {
          setEstado('ok')
          setConexao('conectado')
          setTimeout(() => {
            setProc(null)
            void window.vaultApi.esquecerProcesso(p.id).catch(() => {})
          }, 1500)
        } else setEstado('falhou')
      }).catch(() => {})
    }, 700)
    return () => clearInterval(t)
  }, [proc, estado])

  const conectar = async (): Promise<void> => {
    setErro(null)
    try {
      const r = await window.vaultApi.conectarClaude()
      setProc(r.processo)
      setEstado('rodando')
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEstado('parado')
    }
  }

  useEffect(() => {
    void window.vaultApi.conectorClaude().then(r => setComando(r.comando)).catch(() => {})
  }, [])

  const copiar = (): void => {
    void navigator.clipboard.writeText(comando).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    })
  }

  return (
    <section className="config-bloco">
      <h3>Conector do Claude</h3>
      <p className="form-dica">
        Deixa o Claude Code consultar o vault aberto por último: buscar e ler
        notas, ver o que tem para hoje, criar anotação e marcar tarefa do dia.
        Contas, senhas, documentos e painéis trancados ficam de fora.
      </p>
      <div className="config-conectar">
        {conexao === 'conectado' && estado !== 'rodando' ? (
          <>
            <span className="config-conectado"><span className="config-conectado-ponto" />Conectado</span>
            <button className="btn-fantasma pequeno" onClick={() => void conectar()}>Conectar de novo</button>
          </>
        ) : (
          <button className="btn" onClick={() => void conectar()} disabled={estado === 'rodando' || conexao === null}>
            {estado === 'rodando' ? 'Conectando…' : conexao === 'outra-instalacao' ? 'Atualizar conexão' : 'Conectar'}
          </button>
        )}
        {conexao === 'outra-instalacao' && estado !== 'rodando' && (
          <span className="form-dica">Registrado para outra instalação do Cortex — atualize para apontar para esta.</span>
        )}
        {estado === 'ok' && <span className="form-dica">Pronto: o Claude Code já enxerga o Cortex (abra uma conversa nova).</span>}
        {estado === 'falhou' && <span className="config-conectar-falhou">Não conectou — veja a saída abaixo.</span>}
      </div>
      {erro && <AvisoErro erro={erro} />}
      {proc && <div className="config-terminal"><SaidaProcesso key={proc.id} proc={proc} /></div>}
      <details className="config-manual">
        <summary>Ou rode à mão no terminal</summary>
        <pre className="config-comando"><code>{comando || '…'}</code></pre>
        <button className="btn-fantasma pequeno" onClick={copiar} disabled={!comando}>
          {copiado ? 'Copiado' : 'Copiar comando'}
        </button>
      </details>
    </section>
  )
}

/*
 * Não há mais bloco "Claude Code" aqui.
 *
 * O CLAUDE.md era gravado por um botão, na raiz do vault. Agora o processo
 * principal grava sozinho na pasta de dados do Cortex (`AppData\Roaming\
 * Cortex`) toda vez que um vault abre e quando as áreas mudam — ver
 * `atualizarInstrucoesClaude` em `main/index.ts`. Um botão para algo que
 * sempre deve estar lá e em dia era trabalho à toa para quem usa.
 */
