import bank from "../data/bank.json";
import generated from "../data/generated.json";
import pictures from "../data/pictures.json";

export type Category = "geo" | "sci" | "hist" | "gen" | "lang" | "lit" | "quote" | "flag" | "face" | "place";
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
    /** picture questions: the image under /pics/, and its attribution (empty for public-domain flags) */
    image?: string;
    credit?: string;
    creditUrl?: string;
}

export const CATEGORY_LABELS: Record<Category, string> = {
    geo: "جغرافيا",
    sci: "علوم",
    hist: "تاريخ",
    gen: "ثقافة عامة",
    lang: "لغة عربية",
    lit: "أدب وكتب",
    quote: "من قال؟",
    flag: "أعلام",
    face: "مشاهير",
    place: "معالم",
};

export const CATEGORY_ICONS: Record<Category, string> = {
    geo: "🌍",
    sci: "🔬",
    hist: "🏛️",
    gen: "💡",
    lang: "✍️",
    lit: "📚",
    quote: "💬",
    flag: "🚩",
    face: "🧑",
    place: "🗺️",
};

type Source =
    | { kind: "bank"; i: number }
    | { kind: "quote"; i: number }
    | { kind: "book-author"; i: number }
    | { kind: "author-book"; i: number }
    | { kind: "pic"; i: number };

type PicKind = "flag" | "face" | "place";
/** Picture questions (built by scripts/build-pictures.ts): kind, slug, answer, distractor group, image, credit. */
const pics = pictures as { k: PicKind; s: string; a: string; g: string; img: string; c: string; u: string }[];
const PIC_PROMPTS: Record<PicKind, string> = {
    flag: "علم أي دولة هذا؟",
    face: "من هذه الشخصية؟",
    place: "ما اسم هذا المعلم؟",
};
const picId = (i: number) => `p-${pics[i].k}-${pics[i].s}`;
const picIndex = new Map(pics.map((_, i) => [picId(i), i]));

const { authors, quotes, books } = generated as {
    authors: string[];
    quotes: [string, number][];
    books: [string, number][];
};

// Every category → the items it can draw from.
const pools: Record<Category, Source[]> = { geo: [], sci: [], hist: [], gen: [], lang: [], lit: [], quote: [], flag: [], face: [], place: [] };
(bank as [Category, string, string, string[]][]).forEach(([c], i) => pools[c].push({ kind: "bank", i }));
quotes.forEach((_, i) => pools.quote.push({ kind: "quote", i }));
books.forEach((_, i) => {
    pools.lit.push({ kind: "book-author", i });
    pools.lit.push({ kind: "author-book", i });
});

pics.forEach((p, i) => pools[p.k].push({ kind: "pic", i }));

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
        case "pic": {
            const p = pics[src.i];
            // Look-alikes first (same region's flags, same field's people), then anything of the same kind.
            const kind = pics.filter((o) => o.k === p.k && o.a !== p.a);
            const wrong = pick(kind.filter((o) => o.g === p.g).map((o) => o.a), 3, [], rand);
            wrong.push(...pick(kind.map((o) => o.a), 3 - wrong.length, wrong, rand));
            const q = finish(p.k, picId(src.i), PIC_PROMPTS[p.k], false, p.a, wrong, rand);
            return { ...q, image: `/pics/${p.img}`, credit: p.c, creditUrl: p.u };
        }
    }
}

/** Every fixed question, as `[id, category]`. Ids are stable: `b3`, `q12`, `ba7`, `ab7`, `p-flag-dz`. */
export function allQuestionIds(): [string, Category][] {
    const ids: [string, Category][] = [];
    (bank as [Category, string, string, string[]][]).forEach(([c], i) => ids.push([`b${i}`, c]));
    quotes.forEach((_, i) => ids.push([`q${i}`, "quote"]));
    books.forEach((_, i) => {
        ids.push([`ba${i}`, "lit"]);
        ids.push([`ab${i}`, "lit"]);
    });
    pics.forEach((p, i) => ids.push([picId(i), p.k]));
    return ids;
}

/** Rebuilds a question from its id with seeded distractors/order — identical on every call, server or client. */
export function questionById(id: string): Question | null {
    const pic = picIndex.get(id);
    if (pic !== undefined) return build(pics[pic].k, { kind: "pic", i: pic }, seeded(id));
    const m = /^(b|q|ba|ab)(\d+)$/.exec(id);
    if (!m) return null;
    const i = Number(m[2]);
    const kind = ({ b: "bank", q: "quote", ba: "book-author", ab: "author-book" } as const)[m[1] as "b" | "q" | "ba" | "ab"];
    const size = kind === "bank" ? bank.length : kind === "quote" ? quotes.length : books.length;
    if (i >= size) return null;
    const category: Category = kind === "quote" ? "quote" : kind === "bank" ? (bank as [Category, ...unknown[]][])[i][0] : "lit";
    return build(category, { kind, i }, seeded(id));
}

const SRC_PREFIX = { bank: "b", quote: "q", "book-author": "ba", "author-book": "ab" } as const;
const srcId = (s: Source) => (s.kind === "pic" ? picId(s.i) : `${SRC_PREFIX[s.kind]}${s.i}`);

/**
 * Endless question stream. Picks a random enabled category, then a random question in it
 * that hasn't been shown yet; once a category is exhausted it starts over.
 * Ids in `solved` (answered correctly before, possibly on another visit) are skipped for as long as
 * any unsolved question is left; the caller may keep adding to the set.
 */
export function createDeck(filter: CategoryFilter, rand: () => number = Math.random, solved: ReadonlySet<string> = new Set()) {
    const enabled: Category[] = filter === "all" ? CATEGORIES : [filter];
    const seen = new Set<string>();
    let last = "";

    /** Unseen, unsolved sources in `category`; starts the category over once they have all been seen. */
    function candidates(category: Category, allowSolved: boolean): Source[] {
        const pool = pools[category].filter((s) => allowSolved || !solved.has(srcId(s)));
        const fresh = pool.filter((s) => !seen.has(`${category}:${srcId(s)}`));
        if (fresh.length) return fresh;
        for (const s of pool) seen.delete(`${category}:${srcId(s)}`);
        return pool;
    }

    return {
        next(): Question {
            let category = enabled[Math.floor(rand() * enabled.length)];
            let fresh = candidates(category, false);
            if (fresh.length === 0) {
                // This category is fully solved: move to one that isn't, or replay once everything is.
                const open = enabled.filter((c) => pools[c].some((s) => !solved.has(srcId(s))));
                if (open.length) category = open[Math.floor(rand() * open.length)];
                fresh = candidates(category, open.length === 0);
            }
            const src = fresh[Math.floor(rand() * fresh.length)];
            seen.add(`${category}:${srcId(src)}`);
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

/**
 * How hard a question is, 0 (everyone gets it) to 1 (nobody does), from the share of players who
 * answered it correctly; 0.5 until there is enough data.
 */
export function difficultyFor(correctPercent: number | null): number {
    return correctPercent === null ? 0.5 : 1 - correctPercent / 100;
}

/**
 * Points for a correct answer: 5–20 by difficulty, a streak bonus that caps at +10, and up to +5
 * for speed (`timeFraction` is the share of the time limit still left).
 */
export function pointsFor(streakAfter: number, timeFraction = 0, difficulty = 0.5): number {
    const base = 5 + Math.round(15 * difficulty);
    return base + Math.min(streakAfter - 1, 10) + Math.round(5 * Math.max(0, Math.min(1, timeFraction)));
}

/** Points lost for a wrong answer: 4–16, more for questions most players get right, +3 for a rushed guess. */
export function penaltyFor(timeFraction = 0, difficulty = 0.5): number {
    return 4 + Math.round(12 * (1 - difficulty)) + (timeFraction > 0.8 ? 3 : 0);
}

/** The daily challenge's first day; day numbers (`#1`, `#2`, …) count from here. */
const DAILY_EPOCH = Date.UTC(2026, 8, 25);
export const DAILY_SIZE = 10;

/** `YYYY-MM-DD` for the player's local calendar day. */
export function dayKey(d = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayNumber(key: string): number {
    const [y, m, d] = key.split("-").map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - DAILY_EPOCH) / 86_400_000) + 1;
}

/**
 * The day's shared question set: the same ids for everyone on that date, at most two per
 * category, and never both questions about the same book.
 */
export function dailyIds(key: string): string[] {
    const perCategory = new Map<Category, number>();
    const books = new Set<string>();
    const ids: string[] = [];
    for (const [id, c] of shuffle(allQuestionIds(), seeded(`daily:${key}`))) {
        if ((perCategory.get(c) ?? 0) >= 2) continue;
        const book = /^(?:ba|ab)(\d+)$/.exec(id)?.[1];
        if (book && books.has(book)) continue;
        if (book) books.add(book);
        perCategory.set(c, (perCategory.get(c) ?? 0) + 1);
        ids.push(id);
        if (ids.length === DAILY_SIZE) break;
    }
    return ids;
}
