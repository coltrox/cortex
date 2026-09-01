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
import { Compromisso } from './telas/Compromisso'
import { Ajustes } from './telas/Ajustes'
import { LerQr } from './telas/LerQr'

export type Tela =
  | 'hoje' | 'agenda' | 'compromisso' | 'treino' | 'cardio'
  | 'medidas' | 'gasto' | 'anotacao' | 'ajustes' | 'lerqr'

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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5h13V10" />
      <path d="M9.5 19.5V14h5v5.5" />
    </svg>
  )
}

function IconeChegando() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      <path d="M8.5 14.5l2 2 4.5-4.5" />
    </svg>
  )
}

function IconeAjustes() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" />
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

  if (faltaCredencial()) {
    return (
      <Aviso grave>
        Este site foi publicado sem as variáveis VITE_SUPABASE_URL e
        VITE_SUPABASE_CHAVE. Configure as duas no painel do host e publique de
        novo — elas entram no pacote em tempo de build.
      </Aviso>
    )
  }

  return (
    <>
      {tela === 'hoje' && <Hoje envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'agenda' && <Agenda envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'compromisso' && <Compromisso envio={envio} irPara={setTela} />}
      {tela === 'treino' && <Treino envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'cardio' && <Cardio envio={envio} irPara={setTela} />}
      {tela === 'medidas' && <Medidas envio={envio} irPara={setTela} />}
      {tela === 'gasto' && <Gasto envio={envio} irPara={setTela} />}
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

      <nav className="rodape">
        <button
          className={tela === 'hoje' ? 'ativo' : ''}
          onClick={() => setTela('hoje')}
          aria-current={tela === 'hoje'}
        >
          <IconeHoje />
          Hoje
        </button>
        <button
          className={tela === 'agenda' || tela === 'compromisso' ? 'ativo' : ''}
          onClick={() => setTela('agenda')}
          aria-current={tela === 'agenda' || tela === 'compromisso'}
        >
          <IconeChegando />
          Chegando
        </button>
        <button
          className={tela === 'ajustes' || tela === 'lerqr' ? 'ativo' : ''}
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
