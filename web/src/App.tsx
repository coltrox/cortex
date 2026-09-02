import { useState } from 'react'
import './estilo.css'
import { guardadoDoNavegador } from './guardado'
import { lerVaultId, gravarVaultId, idDoFragmento } from './ajustes'
import { useEnvio, useCardapio, faltaCredencial } from './envio'
import { Aviso } from './componentes'
import { Hoje } from './telas/Hoje'
import { Treino } from './telas/Treino'
import { Cardio } from './telas/Cardio'
import { Medidas } from './telas/Medidas'
import { Gasto } from './telas/Gasto'
import { Anotacao } from './telas/Anotacao'
import { Agenda } from './telas/Agenda'
import { Compromisso, type EdicaoCompromisso } from './telas/Compromisso'
import { Porquinho } from './telas/Porquinho'
import { Ajustes } from './telas/Ajustes'
import { LerQr } from './telas/LerQr'

export type Tela =
  | 'hoje' | 'agenda' | 'compromisso' | 'treino' | 'cardio'
  | 'medidas' | 'gasto' | 'porquinho' | 'anotacao' | 'ajustes' | 'lerqr'

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
   * O compromisso que a tela de edicao vai abrir preenchido.
   *
   * Mora aqui, e nao dentro de `Compromisso`, porque quem escolhe e a tela
   * de Chegando: passar por cima do App e o unico caminho entre as duas sem
   * inventar um roteador.
   */
  const [editando, setEditando] = useState<EdicaoCompromisso | null>(null)

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
          aoEditar={c => { setEditando(c); setTela('compromisso') }}
        />
      )}
      {tela === 'compromisso' && (
        <Compromisso
          envio={envio}
          editando={editando}
          irPara={t => { setEditando(null); setTela(t) }}
        />
      )}
      {tela === 'treino' && <Treino envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'cardio' && <Cardio envio={envio} irPara={setTela} />}
      {tela === 'medidas' && <Medidas envio={envio} irPara={setTela} />}
      {tela === 'gasto' && <Gasto envio={envio} irPara={setTela} />}
      {tela === 'porquinho' && <Porquinho envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'anotacao' && <Anotacao envio={envio} irPara={setTela} />}
      {tela === 'ajustes' && <Ajustes cardapio={cardapio} irPara={setTela} />}
      {tela === 'lerqr' && (
        <LerQr
          aoLer={id => {
            gravarVaultId(guardadoDoNavegador, id)
            setTela('ajustes')
            void cardapio.atualizar()
          }}
          aoFechar={() => setTela('ajustes')}
        />
      )}

      <nav className="barra-baixo">
        <button
          className={`aba ${tela === 'hoje' ? 'aba-ativa' : ''}`}
          onClick={() => setTela('hoje')}
          aria-current={tela === 'hoje'}
        >
          <IconeHoje />
          Hoje
        </button>
        <button
          className={`aba ${tela === 'agenda' || tela === 'compromisso' ? 'aba-ativa' : ''}`}
          onClick={() => setTela('agenda')}
          aria-current={tela === 'agenda' || tela === 'compromisso'}
        >
          <IconeChegando />
          Chegando
        </button>
        <button
          className={`aba ${tela === 'ajustes' || tela === 'lerqr' ? 'aba-ativa' : ''}`}
          onClick={() => setTela('ajustes')}
          aria-current={tela === 'ajustes' || tela === 'lerqr'}
        >
          <IconeAjustes />
          Ajustes
        </button>
      </nav>
    </>
  )
}
