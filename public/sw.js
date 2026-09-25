// Offline support: pages are network-first (fresh content, cached fallback),
// hashed build assets and fonts are cache-first. Cross-origin (ads) is untouched.
const VERSION = "v2";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PRECACHE = ["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(PAGES).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);
    if (req.method !== "GET" || url.origin !== location.origin) return;

    if (req.mode === "navigate") {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(PAGES).then((c) => c.put(req, copy));
                    }
                    return res;
                })
                .catch(async () => (await caches.match(req)) || (await caches.match("/"))),
        );
        return;
    }

    if (url.pathname.startsWith("/_astro/") || url.pathname.startsWith("/woffs/") || /\.(png|jpe?g|svg|woff2)$/.test(url.pathname)) {
        event.respondWith(
            caches.match(req).then(
                (hit) =>
                    hit ||
                    fetch(req).then((res) => {
                        if (res.ok) {
                            const copy = res.clone();
                            caches.open(ASSETS).then((c) => c.put(req, copy));
                        }
                        return res;
                    }),
            ),
        );
    }
});
