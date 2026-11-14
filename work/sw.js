// YPS Dashboard Service Worker
// STRATEGY:
//   • HTML / navigations  → NETWORK FIRST  (a Firebase Hosting deploy is visible on the very
//     next page load; the cache is only used when the user is offline)
//   • Static assets       → CACHE FIRST with background refresh (stale-while-revalidate)
//   • skipWaiting + clients.claim → a new deploy takes control immediately, and the page's
//     'controllerchange' handler reloads once so users never sit on a stale dashboard.
//
// Bump CACHE_VERSION on every deploy (any change to this file triggers the browser to
// install the new worker, purge old caches, and take over).

const CACHE_VERSION = 'yps-dashboard-v5';
const OFFLINE_URLS = ['./', './syfa3.html'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(OFFLINE_URLS).catch(() => {}))
            .then(() => self.skipWaiting()) // don't wait for old tabs to close
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim()) // control open tabs immediately
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Never intercept Firebase RTDB / Google APIs — let the SDK talk to the network directly.
    if (url.origin !== self.location.origin) return;

    const isHTML = req.mode === 'navigate' ||
                   (req.headers.get('accept') || '').includes('text/html');

    if (isHTML) {
        // NETWORK FIRST: always try the server so deploys appear instantly; cache is offline fallback.
        event.respondWith(
            fetch(req)
                .then(res => {
                    const copy = res.clone();
                    caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
                    return res;
                })
                .catch(() => caches.match(req).then(hit => hit || caches.match('./syfa3.html')))
        );
        return;
    }

    // STATIC ASSETS: cache first, refresh in the background.
    event.respondWith(
        caches.match(req).then(hit => {
            const network = fetch(req)
                .then(res => {
                    if (res && res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => hit);
            return hit || network;
        })
    );
});
