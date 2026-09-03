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
