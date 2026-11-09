/* Service worker: pré-cache total (offline completo após a 1ª carga). Gerado/preenchido por scripts/gen-sw.mjs.
 * Atualização: a nova versão instala em segundo plano e ESPERA; o app mostra "Nova versão disponível" e, ao toque,
 * envia SKIP_WAITING. Assim uma aba aberta nunca perde os arquivos da versão com que foi carregada. */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = 'rusapp-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // addAll falharia por inteiro com 1 erro; aqui cada arquivo é independente
      await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => undefined)));
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('rusapp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API do Worker: sempre rede (o app trata offline)
  // navegação e payloads RSC do Next (?_rsc=…) ignoram a query: o arquivo estático é o mesmo
  const ignoreSearch = req.mode === 'navigate' || url.searchParams.has('_rsc');
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        if (req.mode === 'navigate') {
          const home = await cache.match('/');
          if (home) return home;
        }
        throw e;
      }
    })(),
  );
});
