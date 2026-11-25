// GA4 events (the gtag.js tag in Layout.astro, same property as elhellal.com), for seeing what earns:
// how often ad breaks are asked for and what Google answers, and how far visitors get into a game.
// Event parameters show up in GA4 reports once registered as custom dimensions/metrics
// (Admin › Custom definitions): ad_type, ad_name, ad_status, mode, category, entry, n, result, life.

declare global {
    interface Window {
        gtag?: (...args: unknown[]) => void;
    }
}

export function track(name: string, params: Record<string, string | number | boolean> = {}) {
    try {
        window.gtag?.("event", name, { lang: document.documentElement.lang, ...params });
    } catch {}
}
