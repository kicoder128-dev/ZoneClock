/* ═══════════════════════════════════════
   ZoneClock Service Worker
   Caches the app shell for offline use.
   Update CACHE_VERSION when you deploy
   a new version of the app.
═══════════════════════════════════════ */

const CACHE_VERSION = 'zoneclock-v1';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-180.png',
  '/icon-32.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap',
];

/* ── Install: cache all assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // Cache local assets reliably; best-effort for external fonts
      const local  = ASSETS_TO_CACHE.filter(u => !u.startsWith('http'));
      const remote = ASSETS_TO_CACHE.filter(u =>  u.startsWith('http'));
      return cache.addAll(local).then(() =>
        Promise.allSettled(remote.map(u => cache.add(u)))
      );
    })
  );
  self.skipWaiting();
});

/* ── Activate: delete old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: cache-first for local, network-first for external ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for non-GET or chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // For Google Fonts and other CDN assets — stale-while-revalidate
  if (url.hostname.includes('fonts.g') || url.hostname.includes('gstatic')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        cache.match(event.request).then(cached => {
          const fresh = fetch(event.request).then(res => {
            cache.put(event.request, res.clone());
            return res;
          });
          return cached || fresh;
        })
      )
    );
    return;
  }

  // For everything else (app shell) — cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        // Cache successful same-origin responses
        if (res.ok && url.origin === self.location.origin) {
          caches.open(CACHE_VERSION).then(c => c.put(event.request, res.clone()));
        }
        return res;
      }).catch(() => {
        // Offline fallback — return cached index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* ── Push notifications (for future native push support) ── */
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '⏰ ZoneClock Alarm';
  const options = {
    body: data.body || 'Your alarm is firing!',
    icon: '/icon-192.png',
    badge: '/icon-32.png',
    tag: 'zoneclock-alarm',
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 400],
    actions: [
      { action: 'dismiss', title: 'Dismiss' },
      { action: 'snooze',  title: 'Snooze 5 min' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification click handler ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'snooze') {
    // Post message to app to snooze
    self.clients.matchAll({ type: 'window' }).then(clients => {
      clients.forEach(c => c.postMessage({ action: 'snooze' }));
    });
  } else {
    // Open/focus the app
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        const existing = clients.find(c => c.url.includes('zoneclock') || c.url.includes(self.location.origin));
        if (existing) return existing.focus();
        return self.clients.openWindow('/');
      })
    );
  }
});
