// Service Worker — 1小時決策法 PWA
// 更新策略：HTML 走 network-first（線上必拿最新版，離線退回快取）；
//          字型 / 靜態資源走 cache-first（離線可用）。
// 換新版時，只要把 VERSION 改大，舊快取會自動清除。

var VERSION    = 'v2.0';
var APP_CACHE  = 'decision-app-' + VERSION;
var FONT_CACHE = 'decision-fonts-v1';

var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── 安裝：預先快取 App Shell（單檔失敗不影響整體）──────────────
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(APP_CACHE).then(function (cache) {
      return Promise.allSettled(
        APP_SHELL.map(function (u) { return cache.add(u).catch(function () {}); })
      );
    })
  );
  self.skipWaiting();
});

// ── 啟用：清除舊版本快取 ──────────────────────────────────────
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== APP_CACHE && k !== FONT_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// ── 攔截 ──────────────────────────────────────────────────────
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Google Fonts → cache-first，背景更新（離線也能用）
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          var network = fetch(req).then(function (res) {
            if (res) cache.put(req, res.clone());
            return res;
          }).catch(function () { return cached; });
          return cached || network;
        });
      })
    );
    return;
  }

  // HTML 導覽 → network-first（更新即時生效），離線退回快取
  var accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || accept.indexOf('text/html') !== -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(APP_CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // 其他同源資源 → cache-first
  e.respondWith(
    caches.match(req).then(function (r) {
      return r || fetch(req).then(function (res) {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(APP_CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
