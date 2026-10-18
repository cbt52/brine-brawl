/**
 * Minimal service worker (T33) so the browser offers "add to home screen".
 * It never caches: the game is server-authoritative and a stale bundle would break the protocol,
 * so every request goes straight to the network (the fetch handler itself is the installability bit).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request));
});
