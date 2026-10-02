// Offline support: pages are network-first (fresh content, cached fallback),
// hashed build assets and fonts are cache-first. Cross-origin (ads) is untouched.
// Question pictures live in their own cache, filled in the background (see "cache-pics"), and kept
// across VERSION bumps so an update doesn't download them all again; bump PICS when a picture changes.
const VERSION = "v5";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PICS = "pics-v1";
/** Small bits of state pages hand over for background work (the last daily challenge played). */
const META = "meta-v1";
const LANGS = ["en", "es"];
const PRECACHE = ["/", "/manifest.webmanifest", ...LANGS.flatMap((l) => [`/${l}/`, `/${l}/manifest.webmanifest`]), "/favicon.svg", "/icon-192.png"];
/** The offline fallback: the home page of the language the request is in. */
const homeOf = (path) => {
    const lang = LANGS.find((l) => path.startsWith(`/${l}/`));
    return lang ? `/${lang}/` : "/";
};

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(PAGES).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => ![PAGES, ASSETS, PICS, META].includes(k)).map((k) => caches.delete(k))))
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
                .catch(async () => (await caches.match(req)) || (await caches.match(homeOf(url.pathname)))),
        );
        return;
    }

    if (url.pathname.startsWith("/pics/")) {
        event.respondWith(
            caches.open(PICS).then(async (c) => {
                const hit = await c.match(req);
                if (hit) return hit;
                try {
                    const res = await fetch(req);
                    if (res.ok) c.put(req, res.clone());
                    return res;
                } catch {
                    return offlinePicture();
                }
            }),
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

/** Stands in for a picture that isn't saved yet while offline. */
const offlinePicture = () =>
    new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#8882"/><text x="160" y="112" font-size="48" text-anchor="middle">📷</text></svg>`,
        { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } },
    );

/** Saves every question picture not saved yet; a page asks for this once the site has loaded. */
async function cachePictures() {
    const list = await fetch("/pics.json").then((r) => r.json());
    const c = await caches.open(PICS);
    const have = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
    const wanted = new Set(list);
    // drop pictures that are no longer used
    await Promise.all((await c.keys()).filter((r) => !wanted.has(new URL(r.url).pathname)).map((r) => c.delete(r)));
    const missing = list.filter((p) => !have.has(p));
    // a few at a time, so the quiz's own requests aren't starved
    for (let i = 0; i < missing.length; i += 6) {
        await Promise.all(missing.slice(i, i + 6).map((p) => c.add(p).catch(() => {})));
    }
}

let caching = null;
const cachePicturesOnce = () =>
    (caching ??= cachePictures()
        .catch(() => {})
        .finally(() => (caching = null)));

/** `YYYY-MM-DD` for the local calendar day, as the pages write it (src/game/engine.ts dayKey). */
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The day the daily challenge was last finished in the language last played, as pages report it. */
const readDaily = () =>
    caches
        .open(META)
        .then((c) => c.match("/__meta/daily"))
        .then((r) => (r ? r.json() : null))
        .catch(() => null);

self.addEventListener("message", (event) => {
    if (event.data === "cache-pics") event.waitUntil(cachePicturesOnce());
    else if (event.data?.type === "daily") {
        const { lang, done } = event.data;
        event.waitUntil(caches.open(META).then((c) => c.put("/__meta/daily", new Response(JSON.stringify({ lang, done })))));
    }
});

// Installed app, woken up in the background now and then: on a new day with the challenge unplayed,
// put the dot on the icon, and top up the saved pictures.
self.addEventListener("periodicsync", (event) => {
    if (event.tag !== "daily") return;
    event.waitUntil(
        Promise.all([
            readDaily().then((d) => {
                if (d && d.done !== dayKey()) return self.navigator.setAppBadge?.(1);
            }),
            cachePicturesOnce(),
        ]).catch(() => {}),
    );
});
