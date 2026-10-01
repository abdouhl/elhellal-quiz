import type { Lang, Strings } from "../i18n";

export type Category = "geo" | "sci" | "hist" | "gen" | "lang" | "lit" | "quote" | "flag" | "face" | "place" | "tf" | "first" | "more" | "year";
export type CategoryFilter = Category | "all";

export interface Question {
    category: Category;
    /** stable id, used to avoid repeating questions in a session; the same question has the same id in every language */
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
    /** true-or-false questions: the proposed answer to judge */
    claim?: string;
    /** shown once answered: the facts behind the answer (dates, sizes…) */
    reveal?: string;
    /** guess-the-year questions (no options): the answer, the picker's range, and the accepted error */
    year?: { answer: number; min: number; max: number; tolerance: number };
}

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
    tf: "⚖️",
    first: "⏳",
    more: "📏",
    year: "📅",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_ICONS) as Category[];

/** [category, question, correct answer, wrong answers] */
export type BankRow = [Category, string, string, string[]];
type PicKind = "flag" | "face" | "place";
/** A picture question (built by scripts/build-pictures.ts): kind, slug, answer, distractor group, image, credit. */
export type Pic = { k: PicKind; s: string; a: string; g: string; img: string; c: string; u: string };
/** A comparable quantity: its two prompts, unit, and [name, value] items. */
export type Metric = { more: string; less: string; unit: string; items: [string, number][] };

/**
 * One language's questions. Every list is index-aligned with the Arabic data, so a question keeps its id
 * across languages; a `null` bank row has no translation and is left out.
 */
export interface Content {
    lang: Lang;
    bank: (BankRow | null)[];
    pics: Pic[];
    /** [what happened, year CE] */
    events: [string, number][];
    metrics: Metric[];
    /** Arabic only: quotes and books by Arab authors */
    authors?: string[];
    quotes?: [string, number][];
    books?: [string, number][];
}

type Source =
    | { kind: "bank"; i: number }
    | { kind: "quote"; i: number }
    | { kind: "book-author"; i: number }
    | { kind: "author-book"; i: number }
    | { kind: "pic"; i: number }
    | { kind: "tf"; i: number }
    | { kind: "year"; i: number }
    | { kind: "first"; a: number; b: number }
    | { kind: "more"; m: number; a: number; b: number };

const SRC_PREFIX = { bank: "b", quote: "q", "book-author": "ba", "author-book": "ab", tf: "t", year: "y" } as const;

/** Categories no longer played or published; their ids stay registered so earlier daily sets still rebuild. */
const RETIRED: ReadonlySet<Category> = new Set(["quote"]);

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

/** `limit` seeded-random pairs of indexes into `values`, among those that `ok` accepts. */
function pairs(seed: string, values: number[], ok: (x: number, y: number) => boolean, limit: number): [number, number][] {
    const all: [number, number][] = [];
    for (let a = 0; a < values.length; a++) for (let b = a + 1; b < values.length; b++) if (ok(values[a], values[b])) all.push([a, b]);
    return shuffle(all, seeded(seed)).slice(0, limit);
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

function srcId(s: Source, pics: Pic[]): string {
    switch (s.kind) {
        case "pic":
            return `p-${pics[s.i].k}-${pics[s.i].s}`;
        case "first":
            return `f${s.a}-${s.b}`;
        case "more":
            return `m${s.m}-${s.a}-${s.b}`;
        default:
            return `${SRC_PREFIX[s.kind]}${s.i}`;
    }
}

/** How many random candidates the deck weighs against the target difficulty on each pick. */
const SAMPLE = 6;

export interface DeckTuning {
    /** Share of players (0–100) who answered the question correctly, or null while unknown. */
    correctRate?: (id: string) => number | null;
    /** Difficulty to aim for on the next pick, 0 (easy) to 1 (hard). */
    level?: () => number;
}

/** The daily challenge's first day; day numbers (`#1`, `#2`, …) count from here. */
const DAILY_EPOCH = Date.UTC(2026, 8, 25);
/** From this day on the Arabic daily set also draws from the true-or-false, timeline, comparison and year questions. */
const DAILY_V2 = "2026-09-26";
/** From this day on the Arabic daily set also draws from the bank rows added after BANK_V1. */
const DAILY_V3 = "2026-09-27";
/** From this day on the Arabic daily set leaves out the retired categories. */
const DAILY_V4 = "2026-10-02";
/** Bank rows at or past this index were added after DAILY_V2 went live; Arabic dailies before DAILY_V3 leave them out. */
const BANK_V1 = 701;
export const DAILY_SIZE = 10;

/** `YYYY-MM-DD` for the player's local calendar day. */
export function dayKey(d = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayNumber(key: string): number {
    const [y, m, d] = key.split("-").map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - DAILY_EPOCH) / 86_400_000) + 1;
}

/** Builds one language's question set: its categories, deck, daily sets and question lookup. */
export function createEngine(content: Content, s: Strings) {
    const { bank, pics, events, metrics, authors = [], quotes = [], books = [] } = content;
    const id = (src: Source) => srcId(src, pics);

    // Every category → the items it can draw from, and every question id → its source.
    const pools = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, []])) as unknown as Record<Category, Source[]>;
    const registry = new Map<string, [Category, Source]>();
    function add(category: Category, src: Source) {
        pools[category].push(src);
        registry.set(id(src), [category, src]);
    }
    bank.forEach((row, i) => row && add(row[0], { kind: "bank", i }));
    quotes.forEach((_, i) => add("quote", { kind: "quote", i }));
    books.forEach((_, i) => {
        add("lit", { kind: "book-author", i });
        add("lit", { kind: "author-book", i });
    });
    pics.forEach((p, i) => add(p.k, { kind: "pic", i }));
    const isBankV2 = (qid: string) => {
        const m = /^[bt](\d+)$/.exec(qid);
        return !!m && +m[1] >= BANK_V1;
    };
    /** Ids that existed before the number-based types; the Arabic daily drew only from these until DAILY_V2. */
    const legacyCount = registry.size - (bank.length - BANK_V1);
    // "Which of the following…" makes no sense without the list, so those stay out of true-or-false.
    bank.forEach((row, i) => row && !s.listQuestion.test(row[1]) && add("tf", { kind: "tf", i }));
    // At least 5 years apart, so approximate dates can't make the answer arguable.
    for (const [a, b] of pairs("first", events.map(([, y]) => y), (x, y) => Math.abs(x - y) >= 5, 250)) add("first", { kind: "first", a, b });
    // At least 30% apart, so rounding and newer estimates can't flip the answer.
    metrics.forEach((m, mi) => {
        for (const [a, b] of pairs(`more${mi}`, m.items.map(([, v]) => v), (x, y) => Math.max(x, y) >= 1.3 * Math.min(x, y), 60))
            add("more", { kind: "more", m: mi, a, b });
    });
    events.forEach((_, i) => add("year", { kind: "year", i }));

    /** Playable categories: retired ones and ones this language has no questions in are left out. */
    const categories = CATEGORY_ORDER.filter((c) => !RETIRED.has(c) && pools[c].length > 0);

    function build(category: Category, src: Source, rand: () => number): Question {
        const qid = id(src);
        switch (src.kind) {
            case "bank": {
                const [c, q, a, w] = bank[src.i]!;
                return finish(c, qid, q, false, a, w, rand);
            }
            case "quote": {
                const [text, ai] = quotes[src.i];
                const wrong = pick(authors, 3, [authors[ai]], rand);
                return finish(category, qid, text, true, authors[ai], wrong, rand);
            }
            // Book questions exist only in Arabic (Arab authors' books).
            case "book-author": {
                const [title, ai] = books[src.i];
                const wrong = pick(authors, 3, [authors[ai]], rand);
                return finish(category, qid, `من مؤلف كتاب «${title}»؟`, false, authors[ai], wrong, rand);
            }
            case "author-book": {
                const [title, ai] = books[src.i];
                // distractors: books by other authors
                const others = books.filter(([, a]) => a !== ai).map(([t]) => t);
                const wrong = pick(others, 3, [title], rand);
                return finish(category, qid, `أي كتاب من هذه الكتب من تأليف ${authors[ai]}؟`, false, title, wrong, rand);
            }
            case "pic": {
                const p = pics[src.i];
                // Look-alikes first (same region's flags, same field's people), then anything of the same kind.
                const kind = pics.filter((o) => o.k === p.k && o.a !== p.a);
                const wrong = pick(kind.filter((o) => o.g === p.g).map((o) => o.a), 3, [], rand);
                wrong.push(...pick(kind.map((o) => o.a), 3 - wrong.length, wrong, rand));
                const q = finish(p.k, qid, s.picPrompts[p.k], false, p.a, wrong, rand);
                return { ...q, image: `/pics/${p.img}`, credit: p.c, creditUrl: p.u };
            }
            case "tf": {
                const [, q, a, w] = bank[src.i]!;
                const truth = rand() < 0.5;
                const claim = truth ? a : w[Math.floor(rand() * w.length)];
                return { category, id: qid, text: q, isQuote: false, claim, options: [...s.trueFalse], answer: truth ? 0 : 1, reveal: s.answerIs(a) };
            }
            case "first": {
                const [[ta, ya], [tb, yb]] = [events[src.a], events[src.b]];
                const q = finish(category, qid, s.firstPrompt, false, ya < yb ? ta : tb, [ya < yb ? tb : ta], rand);
                return { ...q, reveal: `${ta}: ${s.year(ya)} · ${tb}: ${s.year(yb)}` };
            }
            case "more": {
                const m = metrics[src.m];
                const [[na, va], [nb, vb]] = [m.items[src.a], m.items[src.b]];
                const more = rand() < 0.5;
                const right = more === va > vb ? na : nb;
                const q = finish(category, qid, more ? m.more : m.less, false, right, [right === na ? nb : na], rand);
                return { ...q, reveal: `${na}: ${s.qty(va)} ${m.unit} · ${nb}: ${s.qty(vb)} ${m.unit}` };
            }
            case "year": {
                const [label, y] = events[src.i];
                // A 150-year window around the answer, at a random offset so its middle gives nothing away.
                const span = 150;
                let min = Math.floor((y - 10 - Math.floor(rand() * (span - 20))) / 10) * 10;
                const max = Math.min(min + span, 2030);
                min = max - span;
                const tolerance = y >= 1900 ? 3 : y >= 1500 ? 10 : 25;
                return { category, id: qid, text: label, isQuote: false, options: [], answer: -1, year: { answer: y, min, max, tolerance }, reveal: `${label}: ${s.year(y)}` };
            }
        }
    }

    /** The question as one line of plain text, for page titles and share messages. */
    function questionTitle(q: Question): string {
        if (q.isQuote) return s.quoteTitle(q.text);
        if (q.claim) return s.claimTitle(q.text, q.claim);
        if (q.year) return s.yearTitle(q.text);
        if (q.options.length === 2) return `${q.text.replace(/[؟?]$/, "")}: ${q.options[0]}${s.or}${q.options[1]}${s.qMark}`;
        return q.text;
    }

    function registeredIds(): [string, Category][] {
        return [...registry].map(([qid, [c]]) => [qid, c]);
    }

    /** Every published question, as `[id, category]`. Ids are stable: `b3`, `ba7`, `ab7`, `p-flag-dz`, `t3`, `f4-9`, `m1-2-7`, `y5`. */
    function allQuestionIds(): [string, Category][] {
        return registeredIds().filter(([, c]) => !RETIRED.has(c));
    }

    /** Rebuilds a question from its id with seeded distractors/order — identical on every call, server or client. */
    function questionById(qid: string): Question | null {
        const entry = registry.get(qid);
        return entry ? build(entry[0], entry[1], seeded(qid)) : null;
    }

    /**
     * Endless question stream. Picks a random enabled category (never the previous one), then a
     * question in it that hasn't been shown yet, preferring ones whose difficulty is near `level()`;
     * once a category is exhausted it starts over.
     * Ids in `solved` (answered correctly before, possibly on another visit) are skipped for as long as
     * any unsolved question is left; the caller may keep adding to the set.
     */
    function createDeck(
        filter: CategoryFilter,
        rand: () => number = Math.random,
        solved: ReadonlySet<string> = new Set(),
        { correctRate = () => null, level = () => 0.5 }: DeckTuning = {},
    ) {
        const enabled: Category[] = filter === "all" ? categories : [filter];
        const seen = new Set<string>();
        /** Missed questions waiting to come back once `drawn` reaches `due`. */
        const retries: { category: Category; src: Source; due: number }[] = [];
        let drawn = 0;
        let last = "";
        let lastCategory: Category | null = null;

        /** Unseen, unsolved sources in `category`; starts the category over once they have all been seen. */
        function candidates(category: Category, allowSolved: boolean): Source[] {
            const pool = pools[category].filter((src) => allowSolved || !solved.has(id(src)));
            const fresh = pool.filter((src) => !seen.has(`${category}:${id(src)}`));
            if (fresh.length) return fresh;
            for (const src of pool) seen.delete(`${category}:${id(src)}`);
            return pool;
        }

        /** The source among a few random ones whose difficulty is closest to the target. */
        function closest(fresh: Source[]): Source {
            const target = level();
            const cost = (src: Source) => {
                const rate = correctRate(id(src));
                return Math.abs((rate === null ? 0.5 : 1 - rate / 100) - target);
            };
            let best = fresh[Math.floor(rand() * fresh.length)];
            for (let k = 1; k < Math.min(SAMPLE, fresh.length); k++) {
                const src = fresh[Math.floor(rand() * fresh.length)];
                if (cost(src) < cost(best)) best = src;
            }
            return best;
        }

        function emit(category: Category, src: Source): Question {
            const q = build(category, src, rand);
            last = q.id;
            lastCategory = category;
            return q;
        }

        return {
            next(): Question {
                drawn++;
                const r = retries.findIndex((x) => x.due <= drawn && x.category !== lastCategory);
                if (r >= 0) return emit(retries[r].category, retries.splice(r, 1)[0].src);

                const choices = enabled.length > 1 ? enabled.filter((c) => c !== lastCategory) : enabled;
                let category = choices[Math.floor(rand() * choices.length)];
                let fresh = candidates(category, false);
                if (fresh.length === 0) {
                    // This category is fully solved: move to one that isn't, or replay once everything is.
                    const open = choices.filter((c) => pools[c].some((src) => !solved.has(id(src))));
                    if (open.length) category = open[Math.floor(rand() * open.length)];
                    fresh = candidates(category, open.length === 0);
                }
                // never show the exact same question twice in a row (tiny pools)
                if (fresh.length > 1) fresh = fresh.filter((src) => id(src) !== last);
                const src = closest(fresh);
                seen.add(`${category}:${id(src)}`);
                return emit(category, src);
            },
            /** Brings a missed question back 10–20 questions from now, with its options reshuffled. */
            retry(qid: string) {
                const entry = registry.get(qid);
                if (entry && !retries.some((x) => id(x.src) === qid)) retries.push({ category: entry[0], src: entry[1], due: drawn + 10 + Math.floor(rand() * 11) });
            },
        };
    }

    /**
     * The day's shared question set: the same ids for everyone playing in this language on that date,
     * at most two per category, and never both questions about the same book.
     */
    function dailyIds(key: string): string[] {
        let all: [string, Category][];
        let seed = `daily:${key}`;
        if (content.lang === "ar") {
            // Arabic sets from before each change are rebuilt exactly as they were first drawn.
            const pool = key < DAILY_V4 ? registeredIds() : allQuestionIds();
            all = key < DAILY_V3 ? pool.filter(([qid]) => !isBankV2(qid)) : pool;
            if (key < DAILY_V2) all = all.slice(0, legacyCount);
        } else {
            all = allQuestionIds();
            seed = `daily:${content.lang}:${key}`;
        }
        const perCategory = new Map<Category, number>();
        const seenBooks = new Set<string>();
        const ids: string[] = [];
        for (const [qid, c] of shuffle(all, seeded(seed))) {
            if ((perCategory.get(c) ?? 0) >= 2) continue;
            const book = /^(?:ba|ab)(\d+)$/.exec(qid)?.[1];
            if (book && seenBooks.has(book)) continue;
            if (book) seenBooks.add(book);
            perCategory.set(c, (perCategory.get(c) ?? 0) + 1);
            ids.push(qid);
            if (ids.length === DAILY_SIZE) break;
        }
        return ids;
    }

    return {
        lang: content.lang,
        s,
        CATEGORIES: categories,
        CATEGORY_LABELS: s.labels,
        questionTitle,
        allQuestionIds,
        questionById,
        createDeck,
        dailyIds,
    };
}

export type Engine = ReturnType<typeof createEngine>;
