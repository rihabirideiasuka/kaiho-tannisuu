// sw.js
const CACHE = 'kaiho-tannisuu-v3';
const ASSETS = [
  './',
  './index.html',
  './install.html',
  './offline.html',          // ← 追加（簡易ページを用意）
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 旧キャッシュを削除
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    // Navigation Preload 有効化
    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

const sameOrigin = url => new URL(url).origin === self.location.origin;

self.addEventListener('fetch', e => {
  const req = e.request;

  // 非GETは触らない
  if (req.method !== 'GET') return;

  // ページ遷移（ナビゲーション）はネット優先＋フォールバック
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const preloaded = await e.preloadResponse;
        if (preloaded) return preloaded;

        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, net.clone());
        return net;
      } catch (err) {
        // 失敗したらキャッシュ or オフラインページへ
        const cached = await caches.match(req);
        return cached || caches.match('./offline.html');
      }
    })());
    return;
  }

  // クロスオリジン（例：GAS）には触らない＝素通し
  if (!sameOrigin(req.url)) return;

  // 同一オリジンの静的リソースは SWR 風
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const fetchPromise = fetch(req).then(res => {
      caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => cached);
    return cached || fetchPromise;
  })());
});

