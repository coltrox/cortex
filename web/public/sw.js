/*
 * O service worker guarda o APP. Nunca dados.
 *
 * Cache de dado aqui seria um desastre silencioso: o cardápio viria velho sem
 * ninguém pedir, e uma resposta de `registrar_evento` guardada faria o app
 * achar que mandou algo que nunca saiu. Quem cuida de funcionar sem rede é a
 * fila em localStorage, que sabe a diferença entre "não saiu" e "saiu".
 *
 * Estratégia: rede primeiro, para uma versão nova aparecer sem truque; o cache
 * é o socorro de quando não há sinal.
 */
const CACHE = 'cortex-v1'

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys().then(nomes =>
      Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', evento => {
  const req = evento.request

  // Só GET do mesmo domínio entra no cache. As chamadas ao Supabase são POST
  // para outro domínio e nem chegam aqui — mas a guarda fica explícita, para
  // uma mudança futura não transformar isto em cache de dados por acidente.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  /*
   * Arquivo com hash no nome é imutável: vem do cache primeiro.
   *
   * O Vite assina cada bundle com um hash do conteúdo
   * (`index-W-WYSM4o.js`), então aquele endereço nunca muda de conteúdo — uma
   * versão nova tem nome novo. Pedir à rede algo que não pode ter mudado
   * atrasa a abertura do app, e no celular do dono isso aparecia como o app
   * "pensando" na fila do ônibus antes de mostrar uma fórmula que já estava
   * no aparelho.
   *
   * O HTML continua rede-primeiro, logo abaixo: é ele que aponta para os
   * bundles novos, e servi-lo do cache prenderia o app numa versão velha.
   */
  const imutavel = /\/assets\/.*-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|svg|jpe?g)$/
    .test(new URL(req.url).pathname)

  if (imutavel) {
    evento.respondWith(
      caches.match(req).then(guardado => {
        if (guardado) return guardado
        return fetch(req).then(resposta => {
          const copia = resposta.clone()
          caches.open(CACHE).then(c => c.put(req, copia))
          return resposta
        })
      })
    )
    return
  }

  evento.respondWith(
    fetch(req)
      .then(resposta => {
        const copia = resposta.clone()
        caches.open(CACHE).then(c => c.put(req, copia))
        return resposta
      })
      .catch(() => caches.match(req).then(r => r || caches.match('/')))
  )
})
