// The iOS app's question data (../elhellal-quiz-ios): one self-contained file per language, in the
// shape the app's Swift port of the engine reads, plus the daily challenge ids for the days around now.
// Served at /app/<lang>.json so the app picks up new questions without an App Store release, and
// bundled into the app by its scripts/sync-content.ts so it also plays offline on first launch.
import bankJson from "../data/bank.json";
import picturesJson from "../data/pictures.json";
import numbersJson from "../data/numbers.json";
import generatedJson from "../data/generated.json";
import enJson from "../data/en.json";
import esJson from "../data/es.json";
import type { Lang } from "../i18n";
import { dayKey } from "./engine";
import type { BankRow, Content, Engine, Metric, Pic } from "./engine";
import type { Translation } from "./translated";

/** Days of daily challenge ids before and after the export date. */
const DAILY_BACK = 3;
const DAILY_AHEAD = 60;

const bank = bankJson as BankRow[];
const pics = picturesJson as Pic[];
const { events, metrics } = numbersJson as Pick<Content, "events" | "metrics">;
const { authors, books } = generatedJson as { authors: string[]; books: [string, number][] };
const translations: Partial<Record<Lang, Translation>> = { en: enJson as Translation, es: esJson as Translation };

/** One language's raw data: the Arabic files, or the translation laid over them index by index. */
function content(lang: Lang) {
    const t = translations[lang];
    if (!t) return { bank, pics, events, metrics, books };
    return {
        bank: bank.map(([c], i) => (t.bank[i] ? ([c, ...t.bank[i]!] as BankRow) : null)),
        pics: pics.map((p, i) => ({ ...p, a: t.pics[i] })),
        events: events.map(([, y], i) => [t.events[i], y] as [string, number]),
        metrics: metrics.map((m, mi): Metric => ({ ...t.metrics[mi], items: m.items.map(([, v], i) => [t.metrics[mi].items[i], v]) })),
        books: undefined,
    };
}

export function appData(lang: Lang, engine: Engine, now = new Date()) {
    const c = content(lang);
    const daily: Record<string, string[]> = {};
    for (let d = -DAILY_BACK; d <= DAILY_AHEAD; d++) {
        const day = new Date(now);
        day.setDate(day.getDate() + d);
        const key = dayKey(day);
        daily[key] = engine.dailyIds(key);
    }
    // Plain objects, so the app can decode them with Codable.
    return {
        lang,
        generated: now.toISOString(),
        bank: c.bank.map((r) => (r ? { c: r[0], q: r[1], a: r[2], w: r[3] } : null)),
        pics: c.pics,
        events: c.events.map(([t, y]) => ({ t, y })),
        metrics: c.metrics.map((m) => ({ ...m, items: m.items.map(([n, v]) => ({ n, v })) })),
        // Quotes are retired on the web, so only the books ride along with Arabic.
        authors: c.books ? authors : [],
        books: (c.books ?? []).map(([t, a]) => ({ t, a })),
        daily,
    };
}
