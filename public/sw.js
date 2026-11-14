// Service worker minimal : rend le site installable (Android : « OLYCITY Strats »
// apparaît alors dans Partager de TikTok). Pas de cache : tout vient du serveur,
// avec une page de secours si le réseau est coupé.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Hors ligne</title>'
    + '<body style="background:#0a0c10;color:#e2e5ee;font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center">'
    + '<p>Pas de connexion.<br>Réessaie dans un instant.</p>',
    { headers:{ 'Content-Type':'text/html; charset=utf-8' } },
  )));
});
