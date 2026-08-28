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
