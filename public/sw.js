// Dokan Service Worker v3 — Performance optimized
// Caches:
//   1. App shell (/, /offline.html, /manifest.json, icons)
//   2. Next.js static JS/CSS chunks (/_next/static/*) — cache-first for instant navigation
// Never caches API/RPC responses or realtime data — orders and menu must be fresh.
// When offline, serves a dedicated /offline.html page instead of inline HTML.

const CACHE_NAME = 'dokan-shell-v' + new Date().toISOString().slice(0, 10).replace(/-/g, '');

// App shell + all Next.js static chunks for instant repeat navigation
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls, Supabase requests, or non-GET requests.
  const isDynamic =
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase');

  if (isDynamic) return;

  // Cache-first for Next.js static assets (instant navigation on repeat visits)
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

  // Network-first with cache fallback for everything else (pages, fonts, images)
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
          // Offline fallback
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
