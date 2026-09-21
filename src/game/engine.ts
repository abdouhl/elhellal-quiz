import bank from "../data/bank.json";
import generated from "../data/generated.json";

export type Category = "geo" | "sci" | "hist" | "gen" | "lang" | "lit" | "quote";
export type CategoryFilter = Category | "all";

export interface Question {
    category: Category;
    /** stable id, used to avoid repeating questions in a session */
    id: string;
    text: string;
    /** render `text` as a quotation (for "who said this?") */
    isQuote: boolean;
    options: string[];
    answer: number;
}

export const CATEGORY_LABELS: Record<Category, string> = {
    geo: "جغرافيا",
    sci: "علوم",
    hist: "تاريخ",
    gen: "ثقافة عامة",
    lang: "لغة عربية",
    lit: "أدب وكتب",
    quote: "من قال؟",
};

export const CATEGORY_ICONS: Record<Category, string> = {
    geo: "🌍",
    sci: "🔬",
    hist: "🏛️",
    gen: "💡",
    lang: "✍️",
    lit: "📚",
    quote: "💬",
};

type Source =
    | { kind: "bank"; i: number }
    | { kind: "quote"; i: number }
    | { kind: "book-author"; i: number }
    | { kind: "author-book"; i: number };

const { authors, quotes, books } = generated as {
    authors: string[];
    quotes: [string, number][];
    books: [string, number][];
};

// Every category → the items it can draw from.
const pools: Record<Category, Source[]> = { geo: [], sci: [], hist: [], gen: [], lang: [], lit: [], quote: [] };
(bank as [Category, string, string, string[]][]).forEach(([c], i) => pools[c].push({ kind: "bank", i }));
quotes.forEach((_, i) => pools.quote.push({ kind: "quote", i }));
books.forEach((_, i) => {
    pools.lit.push({ kind: "book-author", i });
    pools.lit.push({ kind: "author-book", i });
});

export const CATEGORIES = Object.keys(pools) as Category[];

/** Deterministic PRNG (mulberry32) seeded from a string, so a question id always yields the same options. */
function seeded(seed: string): () => number {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function shuffle<T>(arr: readonly T[], rand = Math.random): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** `n` distinct picks from `items`, none equal to anything in `exclude`. */
function pick<T>(items: readonly T[], n: number, exclude: readonly T[], rand: () => number): T[] {
    return shuffle(
        items.filter((x) => !exclude.includes(x)),
        rand,
    ).slice(0, n);
}

function finish(
    category: Category,
    id: string,
    text: string,
    isQuote: boolean,
    correct: string,
    wrong: string[],
    rand: () => number,
): Question {
    const options = shuffle([correct, ...wrong], rand);
    return { category, id, text, isQuote, options, answer: options.indexOf(correct) };
}

function build(category: Category, src: Source, rand: () => number): Question {
    switch (src.kind) {
        case "bank": {
            const [c, q, a, w] = (bank as [Category, string, string, string[]][])[src.i];
            return finish(c, `b${src.i}`, q, false, a, w, rand);
        }
        case "quote": {
            const [text, ai] = quotes[src.i];
            const wrong = pick(authors, 3, [authors[ai]], rand);
            return finish(category, `q${src.i}`, text, true, authors[ai], wrong, rand);
        }
        case "book-author": {
            const [title, ai] = books[src.i];
            const wrong = pick(authors, 3, [authors[ai]], rand);
            return finish(category, `ba${src.i}`, `من مؤلف كتاب «${title}»؟`, false, authors[ai], wrong, rand);
        }
        case "author-book": {
            const [title, ai] = books[src.i];
            // distractors: books by other authors
            const others = books.filter(([, a]) => a !== ai).map(([t]) => t);
            const wrong = pick(others, 3, [title], rand);
            return finish(category, `ab${src.i}`, `أي كتاب من هذه الكتب من تأليف ${authors[ai]}؟`, false, title, wrong, rand);
        }
    }
}

/** Every fixed question, as `[id, category]`. Ids are stable: `b3`, `q12`, `ba7`, `ab7`. */
export function allQuestionIds(): [string, Category][] {
    const ids: [string, Category][] = [];
    (bank as [Category, string, string, string[]][]).forEach(([c], i) => ids.push([`b${i}`, c]));
    quotes.forEach((_, i) => ids.push([`q${i}`, "quote"]));
    books.forEach((_, i) => {
        ids.push([`ba${i}`, "lit"]);
        ids.push([`ab${i}`, "lit"]);
    });
    return ids;
}

/** Rebuilds a question from its id with seeded distractors/order — identical on every call, server or client. */
export function questionById(id: string): Question | null {
    const m = /^(b|q|ba|ab)(\d+)$/.exec(id);
    if (!m) return null;
    const i = Number(m[2]);
    const kind = ({ b: "bank", q: "quote", ba: "book-author", ab: "author-book" } as const)[m[1] as "b" | "q" | "ba" | "ab"];
    const size = kind === "bank" ? bank.length : kind === "quote" ? quotes.length : books.length;
    if (i >= size) return null;
    const category: Category = kind === "quote" ? "quote" : kind === "bank" ? (bank as [Category, ...unknown[]][])[i][0] : "lit";
    return build(category, { kind, i }, seeded(id));
}

/**
 * Endless question stream. Picks a random enabled category, then a random question in it
 * that hasn't been shown yet; once a category is exhausted it starts over.
 */
export function createDeck(filter: CategoryFilter, rand: () => number = Math.random) {
    const enabled: Category[] = filter === "all" ? CATEGORIES : [filter];
    const seen = new Set<string>();
    let last = "";

    return {
        next(): Question {
            const category = enabled[Math.floor(rand() * enabled.length)];
            const pool = pools[category];
            let fresh = pool.filter((s) => !seen.has(`${category}:${s.kind}:${s.i}`));
            if (fresh.length === 0) {
                for (const s of pool) seen.delete(`${category}:${s.kind}:${s.i}`);
                fresh = pool;
            }
            const src = fresh[Math.floor(rand() * fresh.length)];
            seen.add(`${category}:${src.kind}:${src.i}`);
            const q = build(category, src, rand);
            // never show the exact same question twice in a row (tiny pools)
            if (q.id === last && fresh.length > 1) return this.next();
            last = q.id;
            return q;
        },
    };
}

/** Seconds allowed to answer: long questions and quotes get more time. */
export function timeLimitFor(q: Question): number {
    return q.isQuote || q.text.length > 80 ? 20 : 15;
}

/** Points for a correct answer: base 10, a streak bonus that caps at +10, and up to +5 for speed. */
export function pointsFor(streakAfter: number, timeFraction = 0): number {
    return 10 + Math.min(streakAfter - 1, 10) + Math.round(5 * Math.max(0, Math.min(1, timeFraction)));
}
