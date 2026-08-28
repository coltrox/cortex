import { useState } from 'react'
import './estilo.css'
import { guardadoDoNavegador } from './guardado'
import { lerVaultId } from './ajustes'
import { useEnvio, useCardapio, faltaCredencial } from './envio'
import { Aviso } from './componentes'
import { Hoje } from './telas/Hoje'
import { Treino } from './telas/Treino'
import { Cardio } from './telas/Cardio'
import { Medidas } from './telas/Medidas'
import { Gasto } from './telas/Gasto'
import { Anotacao } from './telas/Anotacao'
import { Ajustes } from './telas/Ajustes'

export type Tela = 'hoje' | 'treino' | 'cardio' | 'medidas' | 'gasto' | 'anotacao' | 'ajustes'

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
      {tela === 'treino' && <Treino envio={envio} cardapio={cardapio} irPara={setTela} />}
      {tela === 'cardio' && <Cardio envio={envio} irPara={setTela} />}
      {tela === 'medidas' && <Medidas envio={envio} irPara={setTela} />}
      {tela === 'gasto' && <Gasto envio={envio} irPara={setTela} />}
      {tela === 'anotacao' && <Anotacao envio={envio} irPara={setTela} />}
      {tela === 'ajustes' && <Ajustes cardapio={cardapio} irPara={setTela} />}

      <nav className="rodape">
        <button className={tela === 'hoje' ? 'ativo' : ''} onClick={() => setTela('hoje')}>
          Hoje
        </button>
        <button className={tela === 'ajustes' ? 'ativo' : ''} onClick={() => setTela('ajustes')}>
          Ajustes
        </button>
      </nav>
    </>
  )
}
