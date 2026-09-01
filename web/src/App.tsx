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
        <button className={tela === 'hoje' ? 'ativo' : ''} onClick={() => setTela('hoje')}>
          Hoje
        </button>
        <button
          className={tela === 'agenda' || tela === 'compromisso' ? 'ativo' : ''}
          onClick={() => setTela('agenda')}
        >
          Chegando
        </button>
        <button className={tela === 'ajustes' ? 'ativo' : ''} onClick={() => setTela('ajustes')}>
          Ajustes
        </button>
      </nav>
    </>
  )
}
