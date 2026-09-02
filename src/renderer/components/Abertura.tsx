import { useEffect, useState } from 'react'
import { Qr, conteudoDoQr } from './Qr'

/**
 * Primeiro acesso.
 *
 * Três passos: onde o vault vive, o que você quer usar, e o celular.
 *
 * O segundo existe porque o app tem sete áreas e ninguém precisa de todas —
 * quem só quer estudar não deveria abrir o app e ver uma aba de treino vazia.
 *
 * O terceiro existe porque o app do celular só é descoberto por quem vai
 * procurar. Ele é metade do sistema: é onde o treino é registrado série a
 * série, na academia, longe do computador. Deixar isso escondido em
 * Configurações fazia a metade que registra o dia depender de alguém
 * adivinhar que ela existe.
 *
 * `escolheu` só vira verdadeiro no fim do terceiro passo, e não no segundo:
 * é ele que marca "a abertura terminou". Fechar o app no meio recomeça a
 * abertura — o que é o certo, já que ela não terminou.
 *
 * Nenhum caminho é digitado aqui: criar e escolher passam pelo diálogo nativo
 * do processo principal. O renderer nunca nomeia uma pasta do disco.
 */

/** Uma linha por área, curta o bastante para não quebrar na grade. */
export const AREAS = [
  { id: 'conhecimento', nome: 'Estudos', linha: 'Conteúdos, provas, simulados e redações' },
  { id: 'saude', nome: 'Saúde', linha: 'Treinos, cardio, medidas e dieta' },
  { id: 'financas', nome: 'Grana', linha: 'Transações, categorias e porquinho' },
  { id: 'vida', nome: 'Vida', linha: 'Anotações, metas, compras e senhas' },
  { id: 'dev', nome: 'Dev', linha: 'Código, editor, terminal e projetos' },
  { id: 'calendario', nome: 'Agenda', linha: 'Calendário com tudo que tem data' }
]

type Props = {
  root: string | null
  escolheu: boolean
  areasAtuais: string[]
  erro: string | null
  aoCriar: () => void
  aoEscolher: () => void
  aoConfirmarAreas: (areas: string[]) => void
}

export function Abertura({
  root, escolheu, areasAtuais, erro, aoCriar, aoEscolher, aoConfirmarAreas
}: Props) {
  const [marcadas, setMarcadas] = useState<string[]>(() =>
    areasAtuais.length ? areasAtuais : AREAS.map(a => a.id))
  const [passo, setPasso] = useState<'areas' | 'celular'>('areas')

  const alternar = (id: string): void =>
    setMarcadas(m => (m.includes(id) ? m.filter(x => x !== id) : [...m, id]))

  if (!root) {
    return (
      <div className="abertura">
        <div className="abertura-caixa">
          <h1>Cortex</h1>
          <p className="abertura-sub">
            Tudo que você anota vira um arquivo markdown numa pasta sua. O app é a
            interface; os arquivos são a verdade — e continuam legíveis sem ele.
          </p>
          {erro && <div className="erro">{erro}</div>}
          <div className="abertura-acoes">
            <button className="btn grande" onClick={aoCriar}>Criar um vault</button>
            <button className="btn-fantasma grande" onClick={aoEscolher}>Já tenho uma pasta</button>
          </div>
          <p className="abertura-rodape">
            Criar já monta o vault na pasta do Cortex, sem perguntar onde.
            {' '}<b>Já tenho uma pasta</b> é para apontar um vault que já
            existe — inclusive um cofre do Obsidian.
          </p>
        </div>
      </div>
    )
  }

  if (escolheu) return null

  if (passo === 'celular') {
    return (
      <div className="abertura">
        <div className="abertura-caixa larga">
          <h1>Leve o Cortex no bolso</h1>
          <p className="abertura-sub">
            O app do celular registra o dia onde ele acontece — a série na academia,
            o gasto no caixa, o compromisso marcado na rua. Tudo cai neste vault
            como markdown, igual ao que você digitar aqui.
          </p>

          <PassoCelular />

          {erro && <div className="erro">{erro}</div>}

          <div className="abertura-acoes">
            <button className="btn grande" onClick={() => aoConfirmarAreas(marcadas)}>
              Começar a usar
            </button>
            <button className="btn-fantasma grande" onClick={() => setPasso('areas')}>
              Voltar
            </button>
          </div>
          <p className="abertura-rodape">
            Dá para fazer isso depois: o mesmo QR fica em Configurações → Celular.
            {' '}Documentos, senhas e contas bancárias nunca saem deste computador.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="abertura">
      <div className="abertura-caixa larga">
        <h1>O que você vai usar?</h1>
        <p className="abertura-sub">
          Só aparece o que você marcar. Dá para mudar depois — nada é apagado ao
          desmarcar uma área, ela só some da barra lateral.
        </p>

        <SeletorAreas marcadas={marcadas} aoAlternar={alternar} />

        {erro && <div className="erro">{erro}</div>}

        <div className="abertura-acoes">
          <button className="btn grande" onClick={() => setPasso('celular')}>
            Continuar
          </button>
          <span className="abertura-nota">
            O Hoje aparece sempre — ele é o resumo do que você marcar.
          </span>
        </div>
        <p className="abertura-rodape">Vault em <code>{root}</code></p>
      </div>
    </div>
  )
}

type EstadoCelular = { vaultId: string; configurada: boolean; enderecoApp: string }

/**
 * O QR do primeiro acesso, com o que fazer com ele.
 *
 * Busca o próprio estado por IPC em vez de receber por prop, como o painel
 * Celular já faz: `Abertura` é montada antes de existir vault em dois dos
 * três passos, e carregar o id do vault lá em cima seria carregar para um
 * passo que talvez nem apareça.
 *
 * Os passos de instalar estão escritos por extenso porque "instale o PWA" não
 * quer dizer nada para quem nunca instalou um, e o caminho é diferente em
 * cada telefone.
 */
function PassoCelular() {
  const [estado, setEstado] = useState<EstadoCelular | null>(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        setEstado(await window.vaultApi.invoke('nuvem:estado', {}) as EstadoCelular)
      } catch {
        // Não é motivo para travar a abertura: o vault já está pronto, e o
        // celular pode ser conectado depois em Configurações → Celular.
        setFalhou(true)
      }
    })()
  }, [])

  if (falhou) {
    return (
      <div className="erro">
        Não deu para montar o QR agora. O vault está pronto — conecte o celular
        depois em Configurações → Celular.
      </div>
    )
  }

  // Enquanto o id não chega. Sem a caixa, a tela salta de altura quando o QR
  // aparece e o botão de continuar muda de lugar debaixo do cursor.
  if (!estado) return <div className="qr-bloco qr-vazio" aria-hidden="true" />

  return (
    <>
      <div className="qr-bloco">
        <Qr conteudo={conteudoDoQr(estado.vaultId, estado.enderecoApp)} />
        <div className="qr-texto">
          <strong>Aponte a câmera do celular</strong>
          <ol className="passos">
            <li>Leia o QR. O navegador abre o app já conectado a este Cortex.</li>
            <li>
              Instale na tela de início: no iPhone, <b>Compartilhar → Adicionar à
              Tela de Início</b>; no Android, <b>menu do navegador → Instalar app</b>.
            </li>
            <li>Abra pelo ícone daqui em diante. A conexão fica salva — é uma vez só.</li>
          </ol>
        </div>
      </div>

      {!estado.configurada && (
        <div className="erro">
          Este Cortex saiu sem credencial da nuvem, então nada vai chegar do
          celular. Preencha o <code>.env</code> da raiz e recompile.
        </div>
      )}
    </>
  )
}

export function SeletorAreas({ marcadas, aoAlternar }: {
  marcadas: string[]
  aoAlternar: (id: string) => void
}) {
  return (
    <div className="areas">
      {AREAS.map(a => (
        <button
          key={a.id}
          className="area"
          aria-pressed={marcadas.includes(a.id)}
          onClick={() => aoAlternar(a.id)}
        >
          <span className="area-check">{marcadas.includes(a.id) ? '✓' : ''}</span>
          <span className="area-texto">
            <strong>{a.nome}</strong>
            <span>{a.linha}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * A mesma escolha, agora em modal.
 *
 * A tela de abertura promete "dá para mudar depois"; sem isto seria mentira,
 * e desligar uma área exigiria editar `.vault/config.json` na mão.
 */
export function ModalAreas({ areasAtuais, aoSalvar, aoFechar }: {
  areasAtuais: string[]
  aoSalvar: (areas: string[]) => void
  aoFechar: () => void
}) {
  const [marcadas, setMarcadas] = useState<string[]>(areasAtuais)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aoFechar])

  return (
    <div className="paleta-fundo" onClick={aoFechar}>
      <div className="form largo" onClick={e => e.stopPropagation()}>
        <div className="form-topo">Áreas do app</div>
        <div className="form-corpo">
          <p className="form-dica">
            Desmarcar não apaga nada: as notas continuam no vault e a área volta
            a aparecer quando você marcar de novo.
          </p>
          <SeletorAreas
            marcadas={marcadas}
            aoAlternar={id => setMarcadas(m => (m.includes(id) ? m.filter(x => x !== id) : [...m, id]))}
          />
        </div>
        <div className="form-rodape">
          <button className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button className="btn" onClick={() => { aoSalvar(marcadas); aoFechar() }}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
