// PainLess Service Worker
// - Offline app-shell (network-first navigation, cache-first hashed assets)
// - Notification actions ("Log Headache" / "No Headache")
// - Bridges Background Sync events to open tabs

const VERSION = 'painless-v5';
// Precache only PUBLIC URLs. Protected routes redirect to /auth when fetched
// without a session and would poison the cache.
const SHELL = ['/', '/auth', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map((u) => cache.add(u).catch(() => null)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/~oauth') || url.pathname.startsWith('/_serverFn') || url.pathname.startsWith('/_server')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        // Only cache successful, non-redirected responses
        if (fresh.ok && !fresh.redirected) cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cache = await caches.open(VERSION);
        return (await cache.match(req)) || (await cache.match('/')) || (await cache.match('/auth')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/_build/') || /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return hit || Response.error();
      }
    })());
  }
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'show-reminder') {
    self.registration.showNotification('PainLess check-in', {
      body: 'Did you have a headache today?',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'painless-daily',
      requireInteraction: false,
      actions: [
        { action: 'nopain', title: 'No Headache' },
        { action: 'headache', title: 'Log Headache' },
      ],
      data: { url: '/today' },
    });
  } else if (data.type === 'skip-waiting') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action || 'open';
  const target = action === 'headache' ? '/today?action=headache'
              : action === 'nopain' ? '/today?action=nopain'
              : '/today';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        await c.focus();
        try { await c.navigate(new URL(target, self.location.origin).href); } catch {}
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'painless-outbox') {
    event.waitUntil((async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) c.postMessage({ type: 'drain-outbox' });
    })());
  }
});
