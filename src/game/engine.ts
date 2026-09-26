import bank from "../data/bank.json";
import generated from "../data/generated.json";
import pictures from "../data/pictures.json";
import numbers from "../data/numbers.json";

export type Category = "geo" | "sci" | "hist" | "gen" | "lang" | "lit" | "quote" | "flag" | "face" | "place" | "tf" | "first" | "more" | "year";
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
    /** true-or-false questions: the proposed answer to judge */
    claim?: string;
    /** shown once answered: the facts behind the answer (dates, sizes…) */
    reveal?: string;
    /** guess-the-year questions (no options): the answer, the picker's range, and the accepted error */
    year?: { answer: number; min: number; max: number; tolerance: number };
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
    tf: "صح أم خطأ؟",
    first: "أيهما أسبق؟",
    more: "أكبر أم أصغر؟",
    year: "في أي عام؟",
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
    tf: "⚖️",
    first: "⏳",
    more: "📏",
    year: "📅",
};

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

type PicKind = "flag" | "face" | "place";
/** Picture questions (built by scripts/build-pictures.ts): kind, slug, answer, distractor group, image, credit. */
const pics = pictures as { k: PicKind; s: string; a: string; g: string; img: string; c: string; u: string }[];
const PIC_PROMPTS: Record<PicKind, string> = {
    flag: "علم أي دولة هذا؟",
    face: "من هذه الشخصية؟",
    place: "ما اسم هذا المعلم؟",
};
const picId = (i: number) => `p-${pics[i].k}-${pics[i].s}`;

const { authors, quotes, books } = generated as {
    authors: string[];
    quotes: [string, number][];
    books: [string, number][];
};

type BankRow = [Category, string, string, string[]];
const bankRows = bank as BankRow[];
const { events, metrics } = numbers as {
    /** [what happened, year CE] */
    events: [string, number][];
    /** a comparable quantity: its two prompts, unit, and [name, value] items */
    metrics: { more: string; less: string; unit: string; items: [string, number][] }[];
};

/** `limit` seeded-random pairs of indexes into `values`, among those that `ok` accepts. */
function pairs(seed: string, values: number[], ok: (x: number, y: number) => boolean, limit: number): [number, number][] {
    const all: [number, number][] = [];
    for (let a = 0; a < values.length; a++) for (let b = a + 1; b < values.length; b++) if (ok(values[a], values[b])) all.push([a, b]);
    return shuffle(all, seeded(seed)).slice(0, limit);
}

const SRC_PREFIX = { bank: "b", quote: "q", "book-author": "ba", "author-book": "ab", tf: "t", year: "y" } as const;

// Every category → the items it can draw from, and every question id → its source.
const pools = Object.fromEntries(Object.keys(CATEGORY_LABELS).map((c) => [c, []])) as unknown as Record<Category, Source[]>;
const registry = new Map<string, [Category, Source]>();
function add(category: Category, src: Source) {
    pools[category].push(src);
    registry.set(srcId(src), [category, src]);
}
bankRows.forEach(([c], i) => add(c, { kind: "bank", i }));
quotes.forEach((_, i) => add("quote", { kind: "quote", i }));
books.forEach((_, i) => {
    add("lit", { kind: "book-author", i });
    add("lit", { kind: "author-book", i });
});
pics.forEach((p, i) => add(p.k, { kind: "pic", i }));
/** Ids that existed before the number-based types; the daily challenge drew only from these until DAILY_V2. */
const LEGACY_COUNT = registry.size;
// "Which of the following…" makes no sense without the list, so those stay out of true-or-false.
bankRows.forEach(([, q], i) => /مما يلي|أي من/.test(q) || add("tf", { kind: "tf", i }));
// At least 5 years apart, so approximate dates can't make the answer arguable.
for (const [a, b] of pairs("first", events.map(([, y]) => y), (x, y) => Math.abs(x - y) >= 5, 250)) add("first", { kind: "first", a, b });
// At least 30% apart, so rounding and newer estimates can't flip the answer.
metrics.forEach((m, mi) => {
    for (const [a, b] of pairs(`more${mi}`, m.items.map(([, v]) => v), (x, y) => Math.max(x, y) >= 1.3 * Math.min(x, y), 60))
        add("more", { kind: "more", m: mi, a, b });
});
events.forEach((_, i) => add("year", { kind: "year", i }));

/** Arabic-Indic digits; years are written without thousands separators. */
const num = (n: number, group = true) => n.toLocaleString("ar-EG", { useGrouping: group, maximumFractionDigits: 1 });
const yearText = (y: number) => `${num(y, false)}م`;

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
    const id = srcId(src);
    switch (src.kind) {
        case "bank": {
            const [c, q, a, w] = bankRows[src.i];
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
        case "tf": {
            const [, q, a, w] = bankRows[src.i];
            const truth = rand() < 0.5;
            const claim = truth ? a : w[Math.floor(rand() * w.length)];
            return { category, id, text: q, isQuote: false, claim, options: ["صح", "خطأ"], answer: truth ? 0 : 1, reveal: `الإجابة: ${a}` };
        }
        case "first": {
            const [[ta, ya], [tb, yb]] = [events[src.a], events[src.b]];
            const q = finish(category, id, "أيهما حدث أولًا؟", false, ya < yb ? ta : tb, [ya < yb ? tb : ta], rand);
            return { ...q, reveal: `${ta}: ${yearText(ya)} · ${tb}: ${yearText(yb)}` };
        }
        case "more": {
            const m = metrics[src.m];
            const [[na, va], [nb, vb]] = [m.items[src.a], m.items[src.b]];
            const more = rand() < 0.5;
            const right = more === va > vb ? na : nb;
            const q = finish(category, id, more ? m.more : m.less, false, right, [right === na ? nb : na], rand);
            return { ...q, reveal: `${na}: ${num(va)} ${m.unit} · ${nb}: ${num(vb)} ${m.unit}` };
        }
        case "year": {
            const [label, y] = events[src.i];
            // A 150-year window around the answer, at a random offset so its middle gives nothing away.
            const span = 150;
            let min = Math.floor((y - 10 - Math.floor(rand() * (span - 20))) / 10) * 10;
            const max = Math.min(min + span, 2030);
            min = max - span;
            const tolerance = y >= 1900 ? 3 : y >= 1500 ? 10 : 25;
            return { category, id, text: label, isQuote: false, options: [], answer: -1, year: { answer: y, min, max, tolerance }, reveal: `${label}: ${yearText(y)}` };
        }
    }
}

/** The question as one line of plain text, for page titles and share messages. */
export function questionTitle(q: Question): string {
    if (q.isQuote) return `من قال: «${q.text}»؟`;
    if (q.claim) return `${q.text} «${q.claim}» — صح أم خطأ؟`;
    if (q.year) return `في أي عام: ${q.text}؟`;
    if (q.options.length === 2) return `${q.text.replace(/؟$/, "")}: ${q.options[0]} أم ${q.options[1]}؟`;
    return q.text;
}

/** Every fixed question, as `[id, category]`. Ids are stable: `b3`, `q12`, `ba7`, `ab7`, `p-flag-dz`, `t3`, `f4-9`, `m1-2-7`, `y5`. */
export function allQuestionIds(): [string, Category][] {
    return [...registry].map(([id, [c]]) => [id, c]);
}

/** Rebuilds a question from its id with seeded distractors/order — identical on every call, server or client. */
export function questionById(id: string): Question | null {
    const entry = registry.get(id);
    return entry ? build(entry[0], entry[1], seeded(id)) : null;
}

function srcId(s: Source): string {
    switch (s.kind) {
        case "pic":
            return picId(s.i);
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

/**
 * Endless question stream. Picks a random enabled category (never the previous one), then a
 * question in it that hasn't been shown yet, preferring ones whose difficulty is near `level()`;
 * once a category is exhausted it starts over.
 * Ids in `solved` (answered correctly before, possibly on another visit) are skipped for as long as
 * any unsolved question is left; the caller may keep adding to the set.
 */
export function createDeck(
    filter: CategoryFilter,
    rand: () => number = Math.random,
    solved: ReadonlySet<string> = new Set(),
    { correctRate = () => null, level = () => 0.5 }: DeckTuning = {},
) {
    const enabled: Category[] = filter === "all" ? CATEGORIES : [filter];
    const seen = new Set<string>();
    /** Missed questions waiting to come back once `drawn` reaches `due`. */
    const retries: { category: Category; src: Source; due: number }[] = [];
    let drawn = 0;
    let last = "";
    let lastCategory: Category | null = null;

    /** Unseen, unsolved sources in `category`; starts the category over once they have all been seen. */
    function candidates(category: Category, allowSolved: boolean): Source[] {
        const pool = pools[category].filter((s) => allowSolved || !solved.has(srcId(s)));
        const fresh = pool.filter((s) => !seen.has(`${category}:${srcId(s)}`));
        if (fresh.length) return fresh;
        for (const s of pool) seen.delete(`${category}:${srcId(s)}`);
        return pool;
    }

    /** The source among a few random ones whose difficulty is closest to the target. */
    function closest(fresh: Source[]): Source {
        const target = level();
        const cost = (s: Source) => {
            const rate = correctRate(srcId(s));
            return Math.abs((rate === null ? 0.5 : 1 - rate / 100) - target);
        };
        let best = fresh[Math.floor(rand() * fresh.length)];
        for (let k = 1; k < Math.min(SAMPLE, fresh.length); k++) {
            const s = fresh[Math.floor(rand() * fresh.length)];
            if (cost(s) < cost(best)) best = s;
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
                const open = choices.filter((c) => pools[c].some((s) => !solved.has(srcId(s))));
                if (open.length) category = open[Math.floor(rand() * open.length)];
                fresh = candidates(category, open.length === 0);
            }
            // never show the exact same question twice in a row (tiny pools)
            if (fresh.length > 1) fresh = fresh.filter((s) => srcId(s) !== last);
            const src = closest(fresh);
            seen.add(`${category}:${srcId(src)}`);
            return emit(category, src);
        },
        /** Brings a missed question back 10–20 questions from now, with its options reshuffled. */
        retry(id: string) {
            const entry = registry.get(id);
            if (entry && !retries.some((x) => srcId(x.src) === id)) retries.push({ category: entry[0], src: entry[1], due: drawn + 10 + Math.floor(rand() * 11) });
        },
    };
}

/** The daily challenge's first day; day numbers (`#1`, `#2`, …) count from here. */
const DAILY_EPOCH = Date.UTC(2026, 8, 25);
/** From this day on the daily set also draws from the true-or-false, timeline, comparison and year questions. */
const DAILY_V2 = "2026-09-26";
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
    const all = allQuestionIds();
    for (const [id, c] of shuffle(key < DAILY_V2 ? all.slice(0, LEGACY_COUNT) : all, seeded(`daily:${key}`))) {
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
