import { createRoot } from 'react-dom/client'
import { App } from './App'
import { lerTema, aplicarTema, acompanharSistema } from './tema'
import './styles.css'

// Antes de montar o React, e não dentro de um efeito: um efeito roda depois
// do primeiro quadro, e a janela abriria branca por um instante antes de
// virar escura — o piscão que todo app com tema mal costurado tem.
aplicarTema(lerTema())

// Enquanto a preferência for "seguir o sistema", acompanha de verdade: trocar
// o Windows para o escuro à noite muda o app na hora, sem reabrir.
acompanharSistema()

createRoot(document.getElementById('root')!).render(<App />)
