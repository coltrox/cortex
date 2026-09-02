import { useState } from 'react'
import { AREAS } from './Abertura'
import type { Config } from '../useVault'

/**
 * Proteger áreas com senha — como passo a passo, não como formulário.
 *
 * Antes isto era um bloco só, com o campo da senha atual, o da nova, o de
 * repetir e a lista de painéis, tudo na tela ao mesmo tempo. Quem só queria
 * proteger a Vida tinha de entender a relação entre quatro controles para
 * descobrir em que ordem mexer neles — e redigitar a senha a cada ajuste.
 *
 * Agora há um caminho: escolher a área, escolher a senha, repetir, escrever a
 * frase de lembrete. Depois disso a tela mostra o que está protegido e oferece
 * as três coisas que se pode querer — mudar as áreas, trocar a senha, tirar a
 * proteção —, cada uma pedindo a senha uma vez, no seu próprio passo.
 *
 * A senha só existe em estado dentro de um fluxo em andamento, e some quando
 * ele termina ou é cancelado.
 */

type Passo =
  | { nome: 'resumo' }
  /* criar: área → senha → dica */
  | { nome: 'nova-area'; areas: string[] }
  | { nome: 'nova-senha'; areas: string[] }
  | { nome: 'nova-dica'; areas: string[]; senha: string }
  /* mudar as áreas: senha → seleção */
  | { nome: 'conferir-para-areas' }
  | { nome: 'editar-areas'; senha: string; areas: string[] }
  /* trocar a senha, e tirar a proteção */
  | { nome: 'trocar-senha' }
  | { nome: 'remover' }

export function ProtecaoSenha({ config, aoTrocarConfig }: {
  config: Config
  aoTrocarConfig: (c: Config) => void
}) {
  const [passo, setPasso] = useState<Passo>({ nome: 'resumo' })
  const [erro, setErro] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const voltarAoResumo = (msg?: string): void => {
    setPasso({ nome: 'resumo' })
    setErro(null)
    setRecado(msg ?? null)
  }

  /**
   * Roda uma operação de senha e cuida do que todas elas precisam: não
   * disparar duas vezes, mostrar a falha, e voltar ao resumo quando dá certo.
   *
   * `ocupado` não é enfeite: definir a senha faz scrypt e converte pastas
   * inteiras, e um duplo clique dispararia duas conversões concorrentes sobre
   * os mesmos arquivos.
   */
  const executar = async (fn: () => Promise<Config>, sucesso: string): Promise<void> => {
    if (ocupado) return
    setOcupado(true)
    setErro(null)
    setRecado(null)
    try {
      aoTrocarConfig(await fn())
      voltarAoResumo(sucesso)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para salvar')
    } finally {
      setOcupado(false)
    }
  }

  const nomesProtegidos = AREAS
    .filter(a => config.paineisTrancados.includes(a.id))
    .map(a => a.nome)

  return (
    <section className="config-bloco">
      <h3>Proteger com senha e criptografia</h3>

      {passo.nome === 'resumo' && (
        <Resumo
          config={config}
          nomes={nomesProtegidos}
          aoProteger={() => { setRecado(null); setPasso({ nome: 'nova-area', areas: [] }) }}
          aoMudarAreas={() => { setRecado(null); setPasso({ nome: 'conferir-para-areas' }) }}
          aoTrocarSenha={() => { setRecado(null); setPasso({ nome: 'trocar-senha' }) }}
          aoRemover={() => { setRecado(null); setPasso({ nome: 'remover' }) }}
        />
      )}

      {passo.nome === 'nova-area' && (
        <EscolherAreas
          titulo="Passo 1 de 3 · Qual área proteger"
          dica="Tudo que estiver nas pastas dessa área passa a ser cifrado no disco. O Diário e os Anexos ficam de fora: eles são de todas as áreas, e cifrá-los esconderia o treino e o gasto do mesmo dia."
          marcadas={passo.areas}
          aoAlternar={id => setPasso({
            nome: 'nova-area',
            areas: passo.areas.includes(id)
              ? passo.areas.filter(x => x !== id)
              : [...passo.areas, id]
          })}
          rotulo="Continuar"
          desligado={passo.areas.length === 0}
          aoSeguir={() => setPasso({ nome: 'nova-senha', areas: passo.areas })}
          aoCancelar={() => voltarAoResumo()}
        />
      )}

      {passo.nome === 'nova-senha' && (
        <EscolherSenha
          titulo="Passo 2 de 3 · A senha"
          aoSeguir={senha => setPasso({ nome: 'nova-dica', areas: passo.areas, senha })}
          aoCancelar={() => setPasso({ nome: 'nova-area', areas: passo.areas })}
        />
      )}

      {passo.nome === 'nova-dica' && (
        <EscolherDica
          ocupado={ocupado}
          aoSeguir={dica => void executar(async () => {
            // A senha primeiro, as áreas depois: `senha:paineis` recusa
            // trancar painel num vault sem senha, e é ele que dispara a
            // cifragem das pastas.
            await window.vaultApi.invoke('senha:definir', {
              atual: null, nova: passo.senha, dica
            })
            return await window.vaultApi.invoke('senha:paineis', {
              atual: passo.senha, paineis: passo.areas
            }) as Config
          }, 'Pronto. As pastas dessa área foram cifradas.')}
          aoCancelar={() => setPasso({ nome: 'nova-senha', areas: passo.areas })}
        />
      )}

      {passo.nome === 'conferir-para-areas' && (
        <PedirSenha
          titulo="Digite a senha para mudar as áreas"
          ocupado={ocupado}
          aoConferir={async senha => {
            const ok = await window.vaultApi.invoke('senha:conferir', { senha }) as boolean
            if (!ok) { setErro('Senha incorreta.'); return }
            setErro(null)
            setPasso({ nome: 'editar-areas', senha, areas: config.paineisTrancados })
          }}
          aoCancelar={() => voltarAoResumo()}
        />
      )}

      {passo.nome === 'editar-areas' && (
        <EscolherAreas
          titulo="Áreas protegidas"
          dica="Marcar cifra as pastas da área. Desmarcar decifra — o conteúdo volta a ser legível fora do Cortex."
          marcadas={passo.areas}
          aoAlternar={id => setPasso({
            ...passo,
            areas: passo.areas.includes(id)
              ? passo.areas.filter(x => x !== id)
              : [...passo.areas, id]
          })}
          rotulo={ocupado ? 'Salvando…' : 'Salvar'}
          desligado={ocupado}
          aoSeguir={() => void executar(
            async () => await window.vaultApi.invoke('senha:paineis', {
              atual: passo.senha, paineis: passo.areas
            }) as Config,
            'Áreas protegidas atualizadas.'
          )}
          aoCancelar={() => voltarAoResumo()}
        />
      )}

      {passo.nome === 'trocar-senha' && (
        <TrocarSenha
          ocupado={ocupado}
          aoSalvar={(atual, nova, dica) => void executar(
            async () => await window.vaultApi.invoke('senha:definir', {
              atual, nova, dica
            }) as Config,
            'Senha trocada. Nada precisou ser recifrado.'
          )}
          aoCancelar={() => voltarAoResumo()}
        />
      )}

      {passo.nome === 'remover' && (
        <PedirSenha
          titulo="Tirar a proteção"
          aviso="As pastas voltam a ser texto puro no disco, legíveis pelo Explorer e pelo Obsidian. Nada é apagado."
          ocupado={ocupado}
          rotulo="Tirar a proteção"
          aoConferir={async senha => {
            await executar(
              async () => await window.vaultApi.invoke('senha:remover', { atual: senha }) as Config,
              'Proteção removida. Tudo voltou a ser legível.'
            )
          }}
          aoCancelar={() => voltarAoResumo()}
        />
      )}

      {erro && <p className="config-erro">{erro}</p>}
      {recado && <p className="config-recado">{recado}</p>}
    </section>
  )
}

/* ─────────────── os passos ─────────────── */

function Resumo({ config, nomes, aoProteger, aoMudarAreas, aoTrocarSenha, aoRemover }: {
  config: Config
  nomes: string[]
  aoProteger: () => void
  aoMudarAreas: () => void
  aoTrocarSenha: () => void
  aoRemover: () => void
}) {
  if (!config.temSenha) {
    return (
      <>
        <p className="form-dica">
          Uma área protegida pede a senha toda vez que você entra nela — e as
          notas daquelas pastas ficam <strong>cifradas no disco</strong>: o
          Explorer, o Obsidian e o bloco de notas param de conseguir lê-las.
        </p>
        <button className="btn" onClick={aoProteger}>Proteger uma área com senha</button>
      </>
    )
  }

  return (
    <>
      <p className="form-dica">
        {nomes.length > 0
          ? <>Protegido agora: <strong>{nomes.join(', ')}</strong>. Essas pastas
            estão cifradas no disco e pedem a senha para abrir.</>
          : <>Há uma senha cadastrada, mas nenhuma área está protegida no momento.</>}
      </p>
      <div className="config-botoes">
        <button className="btn" onClick={aoMudarAreas}>Alterar áreas protegidas</button>
        <button className="btn-fantasma" onClick={aoTrocarSenha}>Trocar a senha</button>
        <button className="btn-fantasma" onClick={aoRemover}>Tirar a proteção</button>
      </div>
    </>
  )
}

function EscolherAreas({ titulo, dica, marcadas, aoAlternar, rotulo, desligado, aoSeguir, aoCancelar }: {
  titulo: string
  dica: string
  marcadas: string[]
  aoAlternar: (id: string) => void
  rotulo: string
  desligado: boolean
  aoSeguir: () => void
  aoCancelar: () => void
}) {
  return (
    <>
      <p className="config-passo">{titulo}</p>
      <p className="form-dica">{dica}</p>
      <div className="config-paineis">
        {AREAS.map(a => (
          <label key={a.id} className="config-painel">
            <input type="checkbox" checked={marcadas.includes(a.id)}
              onChange={() => aoAlternar(a.id)} />
            <span>{a.nome}</span>
          </label>
        ))}
      </div>
      <div className="config-botoes">
        <button className="btn" onClick={aoSeguir} disabled={desligado}>{rotulo}</button>
        <button className="btn-fantasma" onClick={aoCancelar}>Cancelar</button>
      </div>
    </>
  )
}

function EscolherSenha({ titulo, aoSeguir, aoCancelar }: {
  titulo: string
  aoSeguir: (senha: string) => void
  aoCancelar: () => void
}) {
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const divergem = repetida !== '' && senha !== repetida

  return (
    <>
      <p className="config-passo">{titulo}</p>
      <label className="campo-linha">
        <span>Senha</span>
        <input type="password" value={senha} autoComplete="new-password"
          onChange={e => setSenha(e.target.value)} />
      </label>
      <label className="campo-linha">
        <span>Repetir</span>
        <input type="password" value={repetida} autoComplete="new-password"
          onChange={e => setRepetida(e.target.value)} />
      </label>
      {divergem && <p className="config-erro">As duas senhas não são iguais.</p>}
      <div className="config-botoes">
        <button className="btn" disabled={senha === '' || senha !== repetida}
          onClick={() => aoSeguir(senha)}>
          Continuar
        </button>
        <button className="btn-fantasma" onClick={aoCancelar}>Voltar</button>
      </div>
    </>
  )
}

function EscolherDica({ ocupado, aoSeguir, aoCancelar }: {
  ocupado: boolean
  aoSeguir: (dica: string) => void
  aoCancelar: () => void
}) {
  const [dica, setDica] = useState('')

  return (
    <>
      <p className="config-passo">Passo 3 de 3 · Uma frase para lembrar</p>
      <p className="form-dica config-atencao">
        Não existe recuperação. Se você esquecer esta senha, o conteúdo das
        áreas protegidas se perde — é o que criptografia significa. Esta frase
        é o único socorro, e ela aparece na tela do cadeado.
      </p>
      <label className="campo-linha">
        <span>Frase de lembrete</span>
        <input type="text" value={dica} maxLength={200}
          placeholder="o nome da rua da minha avó"
          onChange={e => setDica(e.target.value)} />
      </label>
      <p className="form-dica">
        Escreva o que faz <em>você</em> lembrar, não a senha em si — quem abrir
        o Cortex vê esta frase antes de digitar qualquer coisa.
      </p>
      <div className="config-botoes">
        <button className="btn" disabled={dica.trim() === '' || ocupado}
          onClick={() => aoSeguir(dica)}>
          {ocupado ? 'Cifrando…' : 'Proteger'}
        </button>
        <button className="btn-fantasma" onClick={aoCancelar} disabled={ocupado}>Voltar</button>
      </div>
    </>
  )
}

function PedirSenha({ titulo, aviso, ocupado, rotulo, aoConferir, aoCancelar }: {
  titulo: string
  aviso?: string
  ocupado: boolean
  rotulo?: string
  aoConferir: (senha: string) => Promise<void>
  aoCancelar: () => void
}) {
  const [senha, setSenha] = useState('')

  return (
    <>
      <p className="config-passo">{titulo}</p>
      {aviso && <p className="form-dica config-atencao">{aviso}</p>}
      <label className="campo-linha">
        <span>Senha</span>
        <input type="password" value={senha} autoComplete="current-password"
          onChange={e => setSenha(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && senha !== '') void aoConferir(senha) }} />
      </label>
      <div className="config-botoes">
        <button className="btn" disabled={senha === '' || ocupado}
          onClick={() => void aoConferir(senha)}>
          {ocupado ? 'Um momento…' : (rotulo ?? 'Continuar')}
        </button>
        <button className="btn-fantasma" onClick={aoCancelar} disabled={ocupado}>Cancelar</button>
      </div>
    </>
  )
}

function TrocarSenha({ ocupado, aoSalvar, aoCancelar }: {
  ocupado: boolean
  aoSalvar: (atual: string, nova: string, dica: string) => void
  aoCancelar: () => void
}) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
  const [dica, setDica] = useState('')
  const divergem = repetida !== '' && nova !== repetida

  return (
    <>
      <p className="config-passo">Trocar a senha</p>
      <p className="form-dica">
        Nada é recifrado: a chave que cifra os arquivos é reembrulhada com a
        senha nova. Uma escrita, não milhares.
      </p>
      <label className="campo-linha">
        <span>Senha atual</span>
        <input type="password" value={atual} autoComplete="current-password"
          onChange={e => setAtual(e.target.value)} />
      </label>
      <label className="campo-linha">
        <span>Nova senha</span>
        <input type="password" value={nova} autoComplete="new-password"
          onChange={e => setNova(e.target.value)} />
      </label>
      <label className="campo-linha">
        <span>Repetir</span>
        <input type="password" value={repetida} autoComplete="new-password"
          onChange={e => setRepetida(e.target.value)} />
      </label>
      <label className="campo-linha">
        <span>Nova frase de lembrete</span>
        <input type="text" value={dica} maxLength={200}
          onChange={e => setDica(e.target.value)} />
      </label>
      {divergem && <p className="config-erro">As duas senhas não são iguais.</p>}
      <div className="config-botoes">
        <button
          className="btn"
          disabled={atual === '' || nova === '' || nova !== repetida || dica.trim() === '' || ocupado}
          onClick={() => aoSalvar(atual, nova, dica)}
        >
          {ocupado ? 'Trocando…' : 'Trocar senha'}
        </button>
        <button className="btn-fantasma" onClick={aoCancelar} disabled={ocupado}>Cancelar</button>
      </div>
    </>
  )
}
