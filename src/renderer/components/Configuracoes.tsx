import { useEffect, useState } from 'react'
import { AREAS, SeletorAreas } from './Abertura'
import type { Config } from '../useVault'

/**
 * O painel de Configurações — o único item do rodapé do rail.
 *
 * Tudo que era botão solto ali dentro mora aqui: quais áreas aparecem, a
 * senha dos painéis, e a conexão com o celular. O rail volta a ser só a
 * lista de lentes, que é o que ele deveria ser.
 */
export function Configuracoes({
  config, aoSalvarAreas, aoTrocarConfig, aoAbrirNuvem, aoFechar, sincronizacaoFalhando
}: {
  config: Config
  aoSalvarAreas: (areas: string[]) => void
  aoTrocarConfig: (c: Config) => void
  aoAbrirNuvem: () => void
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

          <BlocoSenha config={config} aoTrocarConfig={aoTrocarConfig} />

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
 * A senha dos painéis.
 *
 * Duas operações que parecem uma: criar/trocar a senha, e escolher quais
 * painéis ela tranca. As duas pedem a senha atual quando já existe uma —
 * senão quem senta na máquina com um painel aberto destranca o resto.
 */
function BlocoSenha({ config, aoTrocarConfig }: {
  config: Config
  aoTrocarConfig: (c: Config) => void
}) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
  const [trancados, setTrancados] = useState<string[]>(config.paineisTrancados)
  const [erro, setErro] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)

  const limpar = (): void => { setAtual(''); setNova(''); setRepetida('') }

  const definir = async (): Promise<void> => {
    setErro(null); setRecado(null)
    if (nova !== repetida) { setErro('as duas senhas não são iguais'); return }
    try {
      const c = await window.vaultApi.invoke('senha:definir', {
        atual: config.temSenha ? atual : null, nova
      }) as Config
      aoTrocarConfig(c); limpar()
      setRecado(config.temSenha ? 'Senha trocada.' : 'Senha criada.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para salvar a senha')
    }
  }

  const salvarPaineis = async (): Promise<void> => {
    setErro(null); setRecado(null)
    try {
      const c = await window.vaultApi.invoke('senha:paineis', {
        atual, paineis: trancados
      }) as Config
      aoTrocarConfig(c); limpar()
      setRecado('Painéis trancados atualizados.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para salvar')
    }
  }

  const remover = async (): Promise<void> => {
    setErro(null); setRecado(null)
    try {
      const c = await window.vaultApi.invoke('senha:remover', { atual }) as Config
      aoTrocarConfig(c); setTrancados([]); limpar()
      setRecado('Senha removida. Nenhum painel está trancado.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para remover')
    }
  }

  return (
    <section className="config-bloco">
      <h3>Senha para acessar painéis</h3>
      <p className="form-dica">
        Trancar um painel faz o Cortex pedir a senha toda vez que você entra
        nele — inclusive ao voltar depois de sair. Isto é uma tranca de tela:
        o vault continua em markdown legível no disco, e quem abrir a pasta
        pelo Explorer lê tudo. A cifra dos painéis trancados vem depois.
      </p>

      {config.temSenha && (
        <label className="campo-linha">
          <span>Senha atual</span>
          <input type="password" value={atual} onChange={e => setAtual(e.target.value)}
            autoComplete="current-password" />
        </label>
      )}

      <label className="campo-linha">
        <span>{config.temSenha ? 'Nova senha' : 'Criar senha'}</span>
        <input type="password" value={nova} onChange={e => setNova(e.target.value)}
          autoComplete="new-password" />
      </label>
      <label className="campo-linha">
        <span>Repetir</span>
        <input type="password" value={repetida} onChange={e => setRepetida(e.target.value)}
          autoComplete="new-password" />
      </label>

      <div className="config-botoes">
        <button className="btn" onClick={() => void definir()} disabled={nova === ''}>
          {config.temSenha ? 'Trocar senha' : 'Criar senha'}
        </button>
        {config.temSenha && (
          <button className="btn-fantasma" onClick={() => void remover()} disabled={atual === ''}>
            Remover senha
          </button>
        )}
      </div>

      {config.temSenha && (
        <>
          <p className="form-dica">Quais painéis pedem a senha:</p>
          <div className="config-paineis">
            {AREAS.map(a => (
              <label key={a.id} className="config-painel">
                <input
                  type="checkbox"
                  checked={trancados.includes(a.id)}
                  onChange={() => setTrancados(t =>
                    t.includes(a.id) ? t.filter(x => x !== a.id) : [...t, a.id])}
                />
                <span>{a.nome}</span>
              </label>
            ))}
          </div>
          <button className="btn" onClick={() => void salvarPaineis()} disabled={atual === ''}>
            Salvar painéis trancados
          </button>
          {atual === '' && (
            <p className="form-dica">Digite a senha atual acima para poder salvar.</p>
          )}
        </>
      )}

      {erro && <p className="config-erro">{erro}</p>}
      {recado && <p className="config-recado">{recado}</p>}
    </section>
  )
}
