// Dokan Service Worker v4 — Push notifications + Performance optimized
const CACHE_NAME = 'dokan-shell-v' + new Date().toISOString().slice(0, 10).replace(/-/g, '');

const SHELL_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ========== PUSH NOTIFICATIONS ========== */
self.addEventListener('push', (event) => {
  const data = event.data?.json();
  if (!data) return;

  const { title, body, url, tag } = data;

  const options = {
    body: body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag: tag || 'dokan-order',
    renotify: true,
    data: { url: url || '/' },
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(title || 'دكان', options)
  );
});

/* Open the app when user clicks the notification */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/dashboard/kitchen';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      // Focus existing tab if open
      for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        if (client.url.indexOf(self.location.host) !== -1 && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Otherwise open new tab
      return self.clients.openWindow(urlToOpen);
    })
  );
});

/* ========== FETCH CACHING ========== */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  const isDynamic =
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase');

  if (isDynamic) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (cached) return cached;
          return caches.match('/offline.html').then((offline) => {
            if (offline) return offline;
            return new Response(
              '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دكان — غير متصل</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#FAF7F2;color:#1C1A17;text-align:center;padding:24px}h1{font-size:1.25rem;margin-bottom:8px}p{color:#7A7268;font-size:.875rem}</style></head><body><div><h1>أنت غير متصل</h1><p>تحقق من اتصال الإنترنت ثم أعد المحاولة.</p></div></body></html>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        });
      return cached || network;
    })
  );
});
