import { createRoot } from 'react-dom/client'
import { App } from './App'
import { guardadoDoNavegador } from './guardado'
import { lerTema, aplicarTema } from './tema'

/*
 * O tema entra ANTES do primeiro quadro.
 *
 * Dentro de um efeito do React, o app pintaria claro por um instante e
 * trocaria para escuro logo depois — o clarão que todo site com tema escuro
 * dá quando erra este ponto. Aqui a escolha já está no `<html>` quando a
 * primeira regra de CSS é aplicada.
 */
aplicarTema(lerTema(guardadoDoNavegador))

createRoot(document.getElementById('raiz') as HTMLElement).render(<App />)
