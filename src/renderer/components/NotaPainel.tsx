import { useEffect, useRef, useState } from 'react'
import type { NoteComCampos } from '../tipos'
import type { Link, Backlink } from '../useVault'
import { Markdown } from './Markdown'
import { NotaTreino, NotaCardio } from './NotaTreino'
import { ProvaSimulado, questoesDe } from './ProvaSimulado'
import { corpoAlinhado, semDependenciasDaRede, camposExibiveis, textoDoCampo, separarFrontmatter, type CampoExibido } from '../dados'

/**
 * A nota aberta.
 *
 * Aparece POR CIMA da lente em que você estava — Estudos continua Estudos, Dev
 * continua Dev. Antes existia uma lente "Notas" para onde o app te jogava ao
 * clicar em qualquer coisa; era desorientador, e resolver isso é o motivo
 * deste componente existir.
 *
 * Dois modos: ler (markdown renderizado, com fórmulas) e escrever (texto cru).
 * O markdown é a verdade em disco nos dois.
 */

type Props = {
  nota: NoteComCampos | null
  caminho: string
  conteudo: string
  editando: boolean
  sujo: boolean
  saindo: Link[]
  entrando: Backlink[]
  voltarPara: string
  aoVoltar: () => void
  aoEditar: (v: boolean) => void
  aoMudar: (texto: string) => void
  aoSalvar: () => void
  /**
   * Salva um texto JÁ PRONTO, sem passar pelo estado.
   *
   * Existe por causa da checkbox: marcar uma tarefa deixava a nota "não
   * salva", e ele precisava clicar em salvar para não perder. Chamar `aoMudar`
   * e `aoSalvar` em sequência não resolve — o estado do React ainda não mudou
   * quando o segundo roda, e o que iria para o disco era o texto anterior.
   */
  aoSalvarTexto?: (texto: string) => void
  /**
   * Relê a nota do disco, sem fechar e abrir.
   *
   * Vale para qualquer nota, mas nasceu da redação: o Claude grava a correção
   * no arquivo e a tela continuava mostrando o texto de antes.
   */
  aoRecarregar?: () => void
  /** `novaAba` vem do Ctrl no clique — ver `AoAbrirLink` no Markdown. */
  aoAbrirNome: (alvo: string, novaAba?: boolean) => void
  aoAbrirPath: (p: string, novaAba?: boolean) => void
  aoExcluir?: () => void
  /** Grava campos no frontmatter da nota — é por aqui que o acerto dos
      exercícios volta para o arquivo. */
  aoGravarCampos?: (campos: Record<string, unknown>) => void
}

/**
 * Os exercícios da nota, logo abaixo da teoria.
 *
 * Pedido do dono, ao pé da letra: "não quero só estudar teoria, quero
 * exercícios junto dos conteúdos". Por isso ficam NA NOTA do conteúdo, e não
 * numa aba separada — a hora de responder é agora, logo depois de ler.
 *
 * É a mesma tela do simulado, de propósito: questão por questão, alternativas,
 * correção com o que errou e o comentário. Duas telas diferentes para a mesma
 * coisa divergiriam na primeira melhoria que uma delas recebesse.
 */
function ExerciciosDaNota({ nota, aoGravar }: {
  nota: NoteComCampos
  aoGravar: (campos: Record<string, unknown>) => void
}) {
  const [fazendo, setFazendo] = useState(false)
  const questoes = questoesDe(nota)
  const acertos = textoDoCampo(nota.campos?.acertos)
  const total = textoDoCampo(nota.campos?.total)
  // `respostas`, e não `total`: `total` existe desde que a nota foi escrita,
  // e checá-lo diria "já fez" para quem nunca respondeu nada.
  const jaFez = textoDoCampo(nota.campos?.respostas) !== ''
  const historico = Array.isArray(nota.campos?.tentativas)
    ? nota.campos.tentativas.filter((x): x is string => typeof x === 'string')
    : []

  if (fazendo) {
    return (
      <div className="nota-exercicios">
        <ProvaSimulado nota={nota} aoSair={() => setFazendo(false)} aoGravar={aoGravar} />
      </div>
    )
  }

  return (
    <div className="nota-exercicios">
      <h2 className="secao">Exercícios</h2>
      <p className="form-dica">
        {questoes.length} {questoes.length === 1 ? 'questão' : 'questões'} sobre o que
        está aqui em cima. Uma por vez, com correção e comentário no fim.
        {jaFez && total !== '' && (
          <> Na última vez: <b>{acertos}/{total}</b>.</>
        )}
      </p>
      <button className="btn" onClick={() => setFazendo(true)}>
        {jaFez ? 'Fazer de novo' : 'Fazer os exercícios'}
      </button>
      {/* O histórico fica à vista, e não só no arquivo: ele pediu o acerto
          "sem sumir" justamente para comparar as tentativas e saber em quais
          questões errou. */}
      {historico.length > 0 && (
        <div className="nota-tentativas">
          <h3 className="secao-menor">O que já fez aqui</h3>
          <ul>
            {historico.map(linha => <li key={linha}>{linha}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * A lixeira do botão de excluir.
 *
 * Desenhada em SVG, e não em caractere: o `×` que estava ali antes ficava
 * colado ao botão de ler e parecia fechar a nota. Herda a cor por
 * `currentColor`, então a classe `perigo` do botão continua mandando.
 */
/** Seta circular do recarregar. Mesmo tamanho e cor da lixeira. */
function IconeRecarregar() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

function IconeLixeira() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

/** Junta links repetidos e conta — três menções à mesma nota são uma linha. */
function agrupar(links: Link[]): { dst: string; alvo: string | null; vezes: number }[] {
  const m = new Map<string, { dst: string; alvo: string | null; vezes: number }>()
  for (const l of links) {
    const atual = m.get(l.dst)
    if (atual) atual.vezes++
    else m.set(l.dst, { dst: l.dst, alvo: l.resolvedPath, vezes: 1 })
  }
  return [...m.values()]
}

/**
 * Uma linha de campo da nota.
 *
 * A senha nasce escondida e sai com um clique. Não é teatro: a nota aberta
 * fica POR CIMA da lente, e a busca do Ctrl+K chega a ela de qualquer lugar —
 * inclusive com a Vida trancada. Mostrar a senha em texto puro assim que a
 * nota abre a deixaria na tela de quem só queria ver qual era o serviço.
 *
 * O botão de copiar existe pelo mesmo motivo: dá para usar a senha sem nunca
 * mostrá-la.
 */
function LinhaCampo({ campo }: { campo: CampoExibido }) {
  const [aberto, setAberto] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const texto = textoDoCampo(campo.valor)
  if (texto === '') return null

  const copiar = (): void => {
    void navigator.clipboard.writeText(texto)
      .then(() => {
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1400)
      })
      // Área de transferência negada pelo sistema: o botão simplesmente não
      // confirma. Um erro na tela aqui seria pior que o silêncio.
      .catch(() => {})
  }

  const segredo = campo.tipo === 'senha'
  return (
    <div className="campo-nota">
      <span className="campo-rotulo">{campo.rotulo}</span>
      <span className="campo-valor">
        <span className={segredo && !aberto ? 'campo-oculto' : 'campo-texto'}>
          {segredo && !aberto
            // Comprimento fixo, e não o da senha: a quantidade de pontinhos
            // já entregaria quantos caracteres ela tem.
            ? '••••••••••'
            : texto}
        </span>
        {segredo && (
          <button className="campo-acao" onClick={() => setAberto(v => !v)}>
            {aberto ? 'esconder' : 'ver'}
          </button>
        )}
        <button className="campo-acao" onClick={copiar}>
          {copiado ? 'copiado' : 'copiar'}
        </button>
      </span>
    </div>
  )
}

export function NotaPainel({
  nota, caminho, conteudo, editando, sujo, saindo, entrando,
  voltarPara, aoVoltar, aoEditar, aoMudar, aoSalvar, aoSalvarTexto, aoRecarregar,
  aoAbrirNome, aoAbrirPath, aoExcluir, aoGravarCampos
}: Props) {
  const area = useRef<HTMLTextAreaElement>(null)

  /*
   * A pasta desta nota, para resolver o caminho dos anexos.
   *
   * `Vida/Oracao.md` → `Vida`. Nota na raiz do vault vira string vazia, e aí
   * `resolverAnexo` trata o `..` como saída do vault e devolve `null` — que é
   * o certo: não há pasta acima da raiz.
   */
  const pastaDaNota = caminho.split('/').slice(0, -1).join('/')

  /**
   * Escrevendo uma redação: a tela vira folha de papel.
   *
   * Só aqui o cabeçalho (tema, banca, cobrança) continua à vista durante a
   * escrita, e só aqui a área da nota para de rolar — quem rola é a caixa de
   * texto. Com as duas rolando, o tema saía da tela conforme o texto crescia,
   * que foi a queixa dele: "quanto mais texto tem, mais vai cobrindo as
   * informações que ficam em cima".
   */
  const escrevendoRedacao = editando && nota?.tipo === 'redacao'

  /** Abre o anexo no programa padrão do sistema. Quem valida é o main. */
  const abrirAnexo = (rel: string): void => {
    void window.vaultApi.invoke('vault:abrir-anexo', { path: rel }).catch((e: unknown) => {
      // Falhar em silêncio aqui seria um clique que não faz nada e não diz
      // por quê — o caso comum é o arquivo ter sido movido ou renomeado.
      window.alert(e instanceof Error ? e.message : 'não consegui abrir o arquivo')
    })
  }

  useEffect(() => {
    if (editando) area.current?.focus()
  }, [editando])

  /** Marca/desmarca `- [ ]` na linha exata, sem tocar no resto do arquivo. */
  const marcarTarefa = (linha: number, feito: boolean): void => {
    const linhas = conteudo.split(/\r\n|\n/)
    if (linha >= linhas.length) return
    linhas[linha] = linhas[linha].replace(/\[([ xX])\]/, feito ? '[x]' : '[ ]')
    const novo = linhas.join('\n')
    aoMudar(novo)
    /* Marcar tarefa SALVA na hora. Clicar numa checkbox é um gesto completo —
       ninguém marca e depois procura um botão de salvar; e, no celular, o
       mesmo clique já salva. Vai o texto pronto, e não o estado, porque o
       estado só muda no render seguinte. */
    aoSalvarTexto?.(novo)
  }

  /**
   * Salva o conteúdo aberto como PDF.
   *
   * Marca o `body` antes de chamar o main: é essa marca que o CSS de
   * impressão usa para esconder a lateral, a trilha e os botões, deixando só
   * a nota na folha. A marca sai no `finally` — se ficasse presa por um erro,
   * a tela continuaria escondendo metade de si mesma.
   */
  const salvarPdf = async (titulo: string): Promise<void> => {
    document.body.dataset.imprimindo = 'nota'
    try {
      await window.vaultApi.pdfDaNota(titulo)
    } finally {
      delete document.body.dataset.imprimindo
    }
  }

  const links = agrupar(saindo)

  return (
    <div className="nota-painel">
      <div className="nota-trilha">
        <button className="btn-fantasma" onClick={aoVoltar}>‹ {voltarPara}</button>
        <span className="nota-caminho">{caminho}</span>
        <span className="nota-trilha-dir">
          {sujo && <span className="salvo" data-sujo>não salvo</span>}

          {/*
            * Entregar a redação.
            *
            * Pedido do dono: depois de salvar, um botão que tire o texto de
            * `rascunho` e o ponha como `aguardando correção`. Fica aqui, ao
            * lado do Salvar, porque é o gesto SEGUINTE ao dele — e não num
            * formulário, que exigiria reabrir a nota para trocar um campo.
            *
            * Desabilitado enquanto houver texto não salvo: entregar o que
            * ainda não está em disco pediria correção de uma versão que o
            * corretor não vai ler.
            */}
          {nota?.tipo === 'redacao' && aoGravarCampos && (() => {
            const status = textoDoCampo(nota.campos?.status)
            if (status === 'aguardando correção' || status === 'corrigida') {
              return <span className="salvo">{status}</span>
            }
            return (
              <button
                className="btn"
                disabled={sujo}
                title={sujo ? 'Salve o texto antes de entregar' : 'Marca como aguardando correção'}
                onClick={() => aoGravarCampos({ status: 'aguardando correção' })}
              >
                Entregar
              </button>
            )
          })()}
          {/* PDF só na leitura, e só em nota de conteúdo: é o material de
              estudo que ele quis levar impresso. No modo de escrita a tela é
              o markdown cru, que não serve para imprimir. */}
          {!editando && nota?.tipo === 'materia' && (
            <button className="btn-fantasma" title="Salvar este conteúdo como PDF"
              onClick={() => void salvarPdf(nota.title)}>
              PDF
            </button>
          )}
          {/*
            * Recarregar: relê o arquivo do disco.
            *
            * Desabilitado enquanto houver texto não salvo, porque reler
            * sobrescreve o que está na tela — e perder o que ele acabou de
            * escrever seria pior do que mostrar a versão velha.
            */}
          {aoRecarregar && (
            <button className="btn-icone" onClick={aoRecarregar} disabled={sujo}
              title={sujo
                ? 'Salve antes de recarregar — reler o arquivo descarta o que não foi salvo'
                : 'Recarregar do disco'}>
              <IconeRecarregar />
            </button>
          )}
          <button className="btn-fantasma" onClick={() => aoEditar(!editando)}>
            {editando ? 'Ler' : 'Editar'}
          </button>
          {editando && (
            <button className="btn" onClick={aoSalvar} disabled={!sujo}>Salvar</button>
          )}
          {aoExcluir && (
            /* Lixeira, e não `×`: o X fica ao lado do botão de ler e parecia
               fechar a nota, não apagá-la — e apagar é irreversível. */
            <button className="btn-icone perigo" title="Excluir nota" onClick={aoExcluir}>
              <IconeLixeira />
            </button>
          )}
        </span>
      </div>

      <div className="nota-corpo">
        <div className="nota-texto" data-escrevendo={escrevendoRedacao || undefined}>
          {nota && (
            <>
              <h1 className="titulo-nota">{nota.title}</h1>
              <div className="meta-nota">
                {nota.tipo}
                {nota.project ? ` · ${nota.project}` : ''}
                {nota.date ? ` · ${nota.date}` : ''}
              </div>
            </>
          )}

          {/* Os campos do frontmatter, desenhados.
              Na leitura, sempre. No modo de escrita, só na REDAÇÃO — e por
              uma razão exata: nas outras notas o YAML está ali em cima, no
              texto cru, e a mesma coisa duas vezes confunde qual das duas
              vale; na redação o frontmatter é retirado da caixa (`soTexto`),
              então não há duplicata nenhuma, e sem isto o tema desaparecia
              justamente enquanto ele escreve sobre ele. Pedido dele: "não é
              para esconder o tema, não". */}
          {nota && (!editando || escrevendoRedacao) && (() => {
            // Treino e cardio têm desenho próprio: o genérico enfileirava as
            // séries como uma lista de números sem rótulo.
            if (nota.tipo === 'sessao') return <NotaTreino campos={nota.campos ?? {}} />
            if (nota.tipo === 'cardio') return <NotaCardio campos={nota.campos ?? {}} />
            const campos = camposExibiveis(nota)
            if (campos.length === 0) return null
            return (
              <div className="campos-nota">
                {campos.map(c => <LinhaCampo key={c.k} campo={c} />)}
              </div>
            )
          })()}

          {editando ? (() => {
            /*
             * Escrever redação é escrever texto corrido, e só.
             *
             * Nas outras notas o markdown cru É o conteúdo, e esconder o
             * frontmatter atrapalharia. Numa redação ele é ruído: o cabeçalho
             * vem do formulário, e quem está escrevendo precisa da folha em
             * branco. O que sai da caixa volta colado ao cabeçalho original.
             */
            const soTexto = nota?.tipo === 'redacao'
            const { cabecalho, corpo } = separarFrontmatter(conteudo)
            return (
              <textarea
                ref={area}
                className="editor"
                data-redacao={soTexto || undefined}
                value={soTexto ? corpo : conteudo}
                onChange={e => aoMudar(
                  soTexto ? `${cabecalho}\n\n${e.target.value}` : e.target.value
                )}
                placeholder={soTexto ? 'Escreva a redação aqui.' : undefined}
                spellCheck={soTexto}
              />
            )
          })() : (
            <Markdown
              // Sem a seção "Dependências da Rede": ela já aparece na lateral
              // (a pedido do dono). As linhas viram vazias, e não somem, para
              // o número de cada linha continuar batendo com o arquivo.
              texto={semDependenciasDaRede(corpoAlinhado(conteudo))}
              aoAbrirLink={aoAbrirNome}
              aoMarcarTarefa={marcarTarefa}
              // A pasta da nota vai junto porque o caminho escrito nela é
              // relativo a ela: `../Anexos/audio.mp4` numa nota de `Vida/`
              // é `Anexos/audio.mp4` a partir da raiz do vault.
              aoAbrirAnexo={{ pasta: pastaDaNota, chamar: abrirAnexo }}
            />
          )}

          {/* Os exercícios vêm DEPOIS do texto, e só na leitura: no modo de
              escrita a nota é o markdown cru, e uma prova interativa no meio
              do que está sendo editado atrapalharia. */}
          {nota && !editando && aoGravarCampos && questoesDe(nota).length > 0 && (
            <ExerciciosDaNota nota={nota} aoGravar={aoGravarCampos} />
          )}
        </div>

        <aside className="nota-lado">
          <div className="aside-titulo">Dependências da rede</div>
          {links.length === 0 && <div className="vazio">Nenhum link de saída.</div>}
          {links.map(l => (
            <button
              key={l.dst}
              className="link"
              data-quebrado={l.alvo === null}
              onClick={e => (l.alvo ? aoAbrirPath(l.alvo, e.ctrlKey || e.metaKey) : aoAbrirNome(l.dst, e.ctrlKey || e.metaKey))}
              title={l.alvo ?? 'esta nota ainda não existe'}
            >
              <span>{l.dst}</span>
              {l.vezes > 1 && <span className="link-vezes">{l.vezes}</span>}
            </button>
          ))}

          <div className="aside-titulo">Apontam para esta</div>
          {entrando.length === 0 && <div className="vazio">Nenhum backlink.</div>}
          {entrando.map(b => (
            <button key={b.path} className="link" onClick={() => aoAbrirPath(b.path)}>
              <span>{b.title}</span>
            </button>
          ))}
        </aside>
      </div>
    </div>
  )
}
