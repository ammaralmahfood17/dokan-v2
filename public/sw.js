// Dokan Service Worker v5 — Push notifications + Offline-first + Image caching
const CACHE_SHELL = 'dokan-shell-v1';
const CACHE_IMAGES = 'dokan-images-v1';
const CACHE_STATIC = 'dokan-static-v1';

const SHELL_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

/* ========== INSTALL ========== */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  // Don't skipWaiting — let the user control the update
  // self.skipWaiting();
});

/* ========== ACTIVATE ========== */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k === CACHE_SHELL || k === CACHE_IMAGES || k === CACHE_STATIC) return;
          return caches.delete(k);
        })
      )
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
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        if (client.url.indexOf(self.location.host) !== -1 && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

/* ========== MESSAGE HANDLER ========== */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ========== FETCH — CACHING STRATEGIES ========== */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Skip non-GET and API/Supabase requests
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase')
  ) {
    // But cache API responses that aren't supabase-bound
    if (event.request.method === 'GET' && url.pathname.startsWith('/api/')) {
      event.respondWith(networkFirst(event.request, CACHE_SHELL));
    }
    return;
  }

  // 2. Image caching (icons, storage images, etc.)
  if (
    url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|avif|ico)(\?.*)?$/i)
  ) {
    event.respondWith(cacheFirst(event.request, CACHE_IMAGES));
    return;
  }

  // 3. Next.js static chunks (_next/static/)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(event.request, CACHE_STATIC));
    return;
  }

  // 4. Navigation requests — network first with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, CACHE_SHELL));
    return;
  }

  // 5. Everything else — stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_SHELL).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

/** Cache-first: serve from cache, fall back to network, store response */
function cacheFirst(request, cacheName) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const clone = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, clone));
      }
      return response;
    }).catch(() => {
      if (cacheName === CACHE_IMAGES) {
        return new Response('', { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      return caches.match('/offline.html');
    });
  });
}

/** Network-first: try network, fall back to cache, then offline page */
function networkFirst(request, cacheName) {
  return fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      const clone = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, clone));
    }
    return response;
  }).catch(() => {
    return caches.match(request).then((cached) => {
      if (cached) return cached;
      return caches.match('/offline.html');
    });
  });
}
