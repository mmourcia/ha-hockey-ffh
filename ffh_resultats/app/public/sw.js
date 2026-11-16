const V = 'ffh-v18';
const SHELL = ['/', '/index.html', '/app.js', '/style.css', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // réseau d'abord (toujours à jour), repli sur le cache hors-ligne
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/'))));
});
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    const sub = await self.registration.pushManager.getSubscription();
    let list = [];
    try { list = await (await fetch('/api/push/pending', { method: 'POST', body: JSON.stringify({ endpoint: sub?.endpoint }) })).json(); } catch {}
    if (!list.length) list = [{ id: 'x', title: 'Hockey FFH', body: 'Nouveau résultat', url: '/' }];
    await Promise.all(list.map((n) => self.registration.showNotification(n.title, { body: n.body, icon: '/icon.svg', badge: '/icon.svg', tag: n.id, data: { url: n.url } })));
  })());
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(clients.openWindow(e.notification.data?.url || '/')); });
