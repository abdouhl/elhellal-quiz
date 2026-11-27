import type { Lang, Strings } from "../i18n";
import { letters, mathPuzzle, randomLetters, wordLetters, wordSearch } from "./kinds";

export type Category = "geo" | "sci" | "hist" | "gen" | "lang" | "lit" | "quote" | "flag" | "face" | "place" | "tf" | "first" | "more" | "year" | "order" | "typed"
    | "tiles" | "missing" | "odd" | "match" | "blur" | "zoom" | "pics4" | "rank" | "sort" | "tapall" | "math" | "search";
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
    /** put-in-order questions (no options): the items as shown, and their indexes from first to last */
    order?: { items: string[]; solution: number[]; labels: string[]; /** the instruction, when not the events' oldest-first */ hint?: string };
    /** type-the-answer questions (no options): the answer as shown, and the spellings accepted (before fuzzy matching) */
    typed?: { answer: string; accepted: string[] };
    /** letter tiles (no options): the answer's letters, its word lengths, and the tiles to spell it with (answer and decoys) */
    tiles?: { answer: string[]; words: number[]; letters: string[] };
    /** missing letters: the answer word, a null for each blank the options fill */
    masked?: (string | null)[];
    /** a number puzzle's lines (equations, a sequence), shown under the question */
    puzzle?: string[];
    /** answered on a number pad (no options): the number */
    numpad?: { answer: number };
    /** picture questions shown blurred or zoomed in, clearing up over time; x and y are the zoom's centre (%) */
    effect?: { kind: "blur" | "zoom"; x: number; y: number };
    /** pick the picture: each option's image (the option's text is only revealed once answered) */
    optionImages?: string[];
    /** match pairs (no options): items on one side (text or picture), the other side, and each item's partner index */
    match?: { left: { text: string; image?: string }[]; right: string[]; solution: number[] };
    /** sort into two groups (no options): the items, the groups' names, each item's group, and facts shown afterwards */
    sort?: { items: string[]; bins: [string, string]; solution: number[]; labels?: string[]; images?: string[] };
    /** tap all that apply (no options): the pictures, their names (shown afterwards), and which ones belong */
    tapall?: { images: string[]; names: string[]; solution: boolean[] };
    /** word search (no options): a size×size grid of letters (row-major), and the words to find, each with its picture and cells */
    search?: { size: number; grid: string[]; words: { name: string; image: string; cells: number[] }[] };
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
    order: "🔢",
    typed: "⌨️",
    tiles: "🔤",
    missing: "🧩",
    odd: "🕵️",
    match: "🔗",
    blur: "🌫️",
    zoom: "🔍",
    pics4: "🖼️",
    rank: "📊",
    sort: "🗂️",
    tapall: "✅",
    math: "🧮",
    search: "🔎",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_ICONS) as Category[];

/** [category, question, correct answer, wrong answers] */
export type BankRow = [Category, string, string, string[]];
type PicKind = "flag" | "face" | "place";
/** A picture question (built by scripts/build-pictures.ts): kind, slug, answer, distractor group, image, credit. */
export type Pic = { k: PicKind; s: string; a: string; g: string; img: string; c: string; u: string };
/** A comparable quantity: its two prompts, unit, and [name, value] items. */
export type Metric = { more: string; less: string; unit: string; items: [string, number][]; /** "rank these, largest first" */ rank?: string };

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
    | { kind: "more"; m: number; a: number; b: number }
    | { kind: "order"; i: number }
    | { kind: "typed"; i: number }
    | { kind: "tiles"; i: number; pic: boolean }
    | { kind: "missing"; i: number }
    | { kind: "odd"; i: number }
    | { kind: "match"; i: number }
    | { kind: "blur"; i: number }
    | { kind: "zoom"; i: number }
    | { kind: "pics4"; i: number }
    | { kind: "rank"; i: number }
    | { kind: "sort"; i: number }
    | { kind: "tapall"; i: number }
    | { kind: "math"; i: number }
    | { kind: "search"; i: number };

const SRC_PREFIX = {
    bank: "b",
    quote: "q",
    "book-author": "ba",
    "author-book": "ab",
    tf: "t",
    year: "y",
    order: "o",
    typed: "k",
    missing: "n",
    odd: "d",
    match: "h",
    rank: "r",
    sort: "s",
    tapall: "a",
    math: "x",
    search: "w",
} as const;
/** Kinds made from a picture, by id prefix. */
const PIC_PREFIX = { pic: "p", blur: "bl", zoom: "z", pics4: "pp" } as const;

/** Categories no longer played or published; their ids stay registered so earlier daily sets still rebuild. */
const RETIRED: ReadonlySet<Category> = new Set(["quote"]);
/**
 * Interactive kinds that are played but not published: no /q/ pages (they reuse published facts), no daily
 * sets, no app feed. They are registered after everything else and left out of every id listing, so adding
 * them changes no existing id, page or daily set.
 */
const PLAY_ONLY: ReadonlySet<Category> = new Set([
    "order", "typed", "tiles", "missing", "odd", "match", "blur", "zoom", "pics4", "rank", "sort", "tapall", "math", "search",
]);
/** The generated question kinds, for the lobby's list of question types (each also plays inside the mix). */
export const QUESTION_TYPES: readonly Category[] = ["tiles", "missing", "odd", "match", "blur", "zoom", "pics4", "rank", "sort", "tapall", "math", "search"];
/** Left out of the mixed endless deck: they open the keyboard, so they are played on purpose (?cat=typed). */
const NOT_IN_MIX: ReadonlySet<Category> = new Set(["typed"]);

/** How many events a put-in-order question lines up, at least how many years apart, and how many such sets. */
const ORDER_SIZE = 4;
const ORDER_GAP = 10;
const ORDER_SETS = 240;
/** Bank answers short enough to type: characters and words. */
const TYPED_MAX_CHARS = 20;
const TYPED_MAX_WORDS = 3;
/** Bank categories whose answers make sense typed (word meanings and grammar do not). */
const TYPED_FROM: ReadonlySet<Category> = new Set(["geo", "hist", "sci", "gen", "lit"]);
/** How many of each generated kind: odd one out (per source), match pairs (per source), sort, tap all, rank (per metric), number puzzles, word searches. */
const ODD_SETS = 120;
const MATCH_SETS = 100;
const SORT_SETS = 100;
const TAPALL_SETS = 120;
const RANK_SETS = 40;
const MATH_COUNT = 500;
const SEARCH_SETS = 150;
const SEARCH_SIZE = 7;

/**
 * Whether flags from these two picture groups can be told apart by region without an argument: the Arab
 * countries are also in Africa or Asia, and the line between Europe and Asia is disputed (Turkey, Russia…).
 */
function regionsApart(a: string, b: string): boolean {
    if (a === b) return false;
    if (a === "arab" || b === "arab") return ["europe", "americas", "oceania"].includes(a === "arab" ? b : a);
    return !(a === "europe" && b === "asia") && !(a === "asia" && b === "europe");
}

/** Flags that are near copies of each other (by slug): never shown side by side, where only the picture tells them apart. */
const LOOKALIKES = [["mc", "id"], ["td", "ro"], ["mc", "pl"], ["id", "pl"], ["au", "nz"], ["ie", "ci"], ["ml", "gn"], ["sn", "ml"], ["sn", "cm"]];

/** Index lists by key, keeping only the keys with at least `min` items. */
function groupBy<T>(items: readonly T[], key: (x: T) => string | null, min: number): Map<string, number[]> {
    const map = new Map<string, number[]>();
    items.forEach((x, i) => {
        const k = key(x);
        if (k !== null) map.set(k, [...(map.get(k) ?? []), i]);
    });
    for (const [k, v] of map) if (v.length < min) map.delete(k);
    return map;
}

/** `count` distinct seeded sets drawn by `make` (null when a draw doesn't work out). */
function sets<T>(seed: string, count: number, make: (rand: () => number) => T | null, key: (x: T) => string): T[] {
    const rand = seeded(seed);
    const out: T[] = [];
    const seen = new Set<string>();
    for (let tries = 0; out.length < count && tries < count * 30; tries++) {
        const x = make(rand);
        if (x === null || seen.has(key(x))) continue;
        seen.add(key(x));
        out.push(x);
    }
    return out;
}
const sortedKey = (items: number[]) => [...items].sort((a, b) => a - b).join(",");
const century = (y: number) => Math.floor((y - 1) / 100) + 1;

/**
 * `count` seeded sets of `size` indexes into `years`, each at least `gap` years apart, so the order is never
 * arguable. The same in every language (years are shared), so a set keeps its id.
 */
function orderSets(years: number[], size: number, gap: number, count: number, seed = "order"): number[][] {
    const rand = seeded(seed);
    const sets: number[][] = [];
    const seen = new Set<string>();
    for (let tries = 0; sets.length < count && tries < count * 50; tries++) {
        const set: number[] = [];
        for (const i of shuffle(years.map((_, k) => k), rand)) {
            if (set.every((j) => Math.abs(years[i] - years[j]) >= gap)) set.push(i);
            if (set.length === size) break;
        }
        const key = [...set].sort((a, b) => a - b).join(",");
        if (set.length === size && !seen.has(key)) {
            seen.add(key);
            sets.push(set);
        }
    }
    return sets;
}

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
        case "blur":
        case "zoom":
        case "pics4":
            return `${PIC_PREFIX[s.kind]}-${pics[s.i].k}-${pics[s.i].s}`;
        case "tiles":
            return s.pic ? `lp-${pics[s.i].k}-${pics[s.i].s}` : `l${s.i}`;
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
/** From this day on the daily sets (every language) also draw from the bank rows added after BANK_V2. */
const DAILY_V5 = "2026-10-03";
/** From this day on the daily sets (every language) also draw from the bank rows added after BANK_V3. */
const DAILY_V6 = "2026-10-22";
/** From this day on the daily sets (every language) also draw from the bank rows added after BANK_V4. */
const DAILY_V7 = "2026-11-01";
/** From this day on the daily sets (every language) also draw from the bank rows added after BANK_V5. */
const DAILY_V8 = "2026-11-12";
/** From this day on the daily sets (every language) also draw from the bank rows added after BANK_V6. */
const DAILY_V9 = "2026-11-19";
/** From this day on the daily sets (every language) also draw from the bank rows added after BANK_V7. */
const DAILY_V10 = "2026-11-21";
/** Bank rows at or past this index were added after DAILY_V2 went live; Arabic dailies before DAILY_V3 leave them out. */
const BANK_V1 = 701;
/** Bank rows at or past this index were added on 2026-10-01; dailies before DAILY_V5 leave them out. */
const BANK_V2 = 883;
/** Bank rows at or past this index were added on 2026-10-14, 2026-10-19, 2026-10-20 (two batches) and 2026-10-21 (two batches); dailies before DAILY_V6 leave them out. */
const BANK_V3 = 1169;
/** Bank rows at or past this index were added on 2026-10-31; dailies before DAILY_V7 leave them out. */
const BANK_V4 = 2269;
/** Bank rows at or past this index were added on 2026-11-10 (two batches) and 2026-11-11 (b2319–b2558); dailies before DAILY_V8 leave them out. */
const BANK_V5 = 2319;
/** Bank rows at or past this index were added on 2026-11-18 (b2559–b2758); dailies before DAILY_V9 leave them out. */
const BANK_V6 = 2559;
/** Bank rows at or past this index were added on 2026-11-20 (b2759–b2778); dailies before DAILY_V10 leave them out. */
const BANK_V7 = 2759;
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
    const bankIndex = (qid: string) => {
        const m = /^[bt](\d+)$/.exec(qid);
        return m ? +m[1] : -1;
    };
    const isBankV2 = (qid: string) => bankIndex(qid) >= BANK_V1;
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
    // Play-only kinds last (see PLAY_ONLY).
    const orders = events.length >= ORDER_SIZE ? orderSets(events.map(([, y]) => y), ORDER_SIZE, ORDER_GAP, ORDER_SETS) : [];
    orders.forEach((_, i) => add("order", { kind: "order", i }));
    bank.forEach((row, i) => {
        if (!row || !TYPED_FROM.has(row[0]) || s.listQuestion.test(row[1])) return;
        const a = row[2].trim();
        if (a.length <= TYPED_MAX_CHARS && a.split(/\s+/).length <= TYPED_MAX_WORDS && !/[«»"]/.test(a)) add("typed", { kind: "typed", i });
    });

    // The generated kinds (all play-only), in the order they were added.
    const spellable = (i: number) => {
        const row = bank[i];
        return !!row && TYPED_FROM.has(row[0]) && !s.listQuestion.test(row[1]);
    };
    bank.forEach((row, i) => spellable(i) && wordLetters(row![2], 3, 10, 2) && add("tiles", { kind: "tiles", i, pic: false }));
    pics.forEach((p, i) => (p.k === "flag" || p.k === "place") && wordLetters(p.a, 3, 10, 2) && add("tiles", { kind: "tiles", i, pic: true }));
    bank.forEach((row, i) => spellable(i) && wordLetters(row![2], 4, 10, 1) && add("missing", { kind: "missing", i }));

    const flagGroups = groupBy(pics, (p) => (p.k === "flag" ? p.g : null), 3);
    const faceGroups = groupBy(pics, (p) => (p.k === "face" ? p.g : null), 3);
    const flags = pics.flatMap((p, i) => (p.k === "flag" ? [i] : []));
    /** Whether these pictures can be shown together and still be told apart. */
    const distinct = (items: number[]) => {
        const slugs = new Set(items.map((i) => (pics[i].k === "flag" ? pics[i].s : "")));
        return !LOOKALIKES.some(([a, b]) => slugs.has(a) && slugs.has(b));
    };
    const any = <T,>(xs: readonly T[], rand: () => number) => xs[Math.floor(rand() * xs.length)];

    type OddSet = { by: "region" | "field"; items: number[] } | { by: "century"; c: number; items: number[] };
    /** Three from one group and, last, the odd one from a group `apart` accepts. */
    const oddFrom = (groups: Map<string, number[]>, by: "region" | "field", apart: (a: string, b: string) => boolean) => (rand: () => number): OddSet | null => {
        const keys = [...groups.keys()];
        const g = any(keys, rand);
        const others = keys.filter((o) => apart(g, o));
        if (!others.length) return null;
        return { by, items: [...pick(groups.get(g)!, 3, [], rand), any(groups.get(any(others, rand))!, rand)] };
    };
    // Events well inside a century (not within 3 years of its ends), so approximate dates can't move them out.
    const inCentury = groupBy(events, ([, y]) => (y > 0 && (y - 1) % 100 >= 3 && (y - 1) % 100 <= 96 ? String(century(y)) : null), 3);
    const oddSets: OddSet[] = [
        ...sets("odd-flag", ODD_SETS, oddFrom(flagGroups, "region", regionsApart), (x) => `${sortedKey(x.items.slice(0, 3))}|${x.items[3]}`),
        ...sets("odd-face", ODD_SETS / 2, oddFrom(faceGroups, "field", (a, b) => a !== b), (x) => `${sortedKey(x.items.slice(0, 3))}|${x.items[3]}`),
        ...sets(
            "odd-century",
            ODD_SETS / 2,
            (rand): OddSet | null => {
                if (!inCentury.size) return null;
                const c = Number(any([...inCentury.keys()], rand));
                // The odd one at least 15 years outside that century.
                const far = events.flatMap(([, y], i) => (y <= (c - 1) * 100 - 15 || y > c * 100 + 15 ? [i] : []));
                return far.length ? { by: "century", c, items: [...pick(inCentury.get(String(c))!, 3, [], rand), any(far, rand)] } : null;
            },
            (x) => `${sortedKey(x.items.slice(0, 3))}|${x.items[3]}`,
        ),
    ];
    oddSets.forEach((_, i) => add("odd", { kind: "odd", i }));

    type MatchSet = { by: "flag" | "event" | "book"; items: number[] };
    const authored = groupBy(books, ([, a]) => String(a), 1);
    const matchSets: MatchSet[] = [
        ...sets("match-flag", MATCH_SETS, (rand): MatchSet | null => {
            const items = pick(flags, 4, [], rand);
            return distinct(items) ? { by: "flag", items } : null;
        }, (x) => sortedKey(x.items)),
        ...orderSets(events.map(([, y]) => y), 4, 10, MATCH_SETS, "match-event").map((items): MatchSet => ({ by: "event", items })),
        ...(authored.size >= 4
            ? sets("match-book", MATCH_SETS / 2, (rand): MatchSet => ({ by: "book", items: pick([...authored.values()], 4, [], rand).map((b) => any(b, rand)) }), (x) => sortedKey(x.items))
            : []),
    ];
    matchSets.forEach((_, i) => add("match", { kind: "match", i }));

    pics.forEach((p, i) => (p.k === "place" || p.k === "face") && add("blur", { kind: "blur", i }));
    pics.forEach((p, i) => (p.k === "place" || p.k === "flag") && add("zoom", { kind: "zoom", i }));
    // Only pictures that need no credit line (the flags): four of them can't each carry one.
    pics.forEach((p, i) => !p.c && add("pics4", { kind: "pics4", i }));

    type RankSet = { m: number; items: number[] };
    const rankSets: RankSet[] = metrics.flatMap((m, mi) =>
        m.rank && m.items.length >= 4
            ? sets(
                  `rank${mi}`,
                  RANK_SETS,
                  (rand): RankSet | null => {
                      // At least 30% apart from one to the next, as in "which is more".
                      const items = pick(m.items.map((_, k) => k), 4, [], rand).sort((a, b) => m.items[b][1] - m.items[a][1]);
                      return items.every((k, j) => j === 0 || m.items[items[j - 1]][1] >= 1.3 * m.items[k][1]) ? { m: mi, items } : null;
                  },
                  (x) => sortedKey(x.items),
              )
            : [],
    );
    rankSets.forEach((_, i) => add("rank", { kind: "rank", i }));

    type SortSet = { by: "years"; pivot: number; items: number[] } | { by: "region"; groups: [string, string]; items: number[] };
    const sortSets: SortSet[] = [
        ...sets(
            "sort-years",
            SORT_SETS,
            (rand): SortSet | null => {
                const pivot = 50 * Math.floor(13 + rand() * 28);
                // At least 15 years either side, so approximate dates can't change sides.
                const before = events.flatMap(([, y], i) => (y <= pivot - 15 ? [i] : []));
                const after = events.flatMap(([, y], i) => (y >= pivot + 15 ? [i] : []));
                const k = 2 + Math.floor(rand() * 3);
                return before.length >= k && after.length >= 6 - k ? { by: "years", pivot, items: [...pick(before, k, [], rand), ...pick(after, 6 - k, [], rand)] } : null;
            },
            (x) => `${x.by === "years" ? x.pivot : ""}|${sortedKey(x.items)}`,
        ),
        ...sets(
            "sort-region",
            SORT_SETS,
            (rand): SortSet | null => {
                const keys = [...flagGroups.keys()];
                const a = any(keys, rand);
                const b = any(keys.filter((o) => regionsApart(a, o)), rand);
                const k = 2 + Math.floor(rand() * 3);
                return b ? { by: "region", groups: [a, b], items: [...pick(flagGroups.get(a)!, k, [], rand), ...pick(flagGroups.get(b)!, 6 - k, [], rand)] } : null;
            },
            (x) => sortedKey(x.items),
        ),
    ];
    sortSets.forEach((_, i) => add("sort", { kind: "sort", i }));

    type TapSet = { g: string; items: number[] };
    const tapSets = sets(
        "tapall",
        TAPALL_SETS,
        (rand): TapSet | null => {
            const keys = [...flagGroups.keys()];
            const g = any(keys, rand);
            const others = keys.filter((o) => regionsApart(g, o)).flatMap((o) => flagGroups.get(o)!);
            const k = 3 + Math.floor(rand() * 3);
            const items = others.length >= 9 - k ? [...pick(flagGroups.get(g)!, k, [], rand), ...pick(others, 9 - k, [], rand)] : [];
            return items.length && distinct(items) ? { g, items } : null;
        },
        (x) => sortedKey(x.items),
    );
    tapSets.forEach((_, i) => add("tapall", { kind: "tapall", i }));

    for (let i = 0; i < MATH_COUNT; i++) add("math", { kind: "math", i });

    // Country names of one word that fit the grid.
    const searchable = flags.filter((i) => wordLetters(pics[i].a, 4, SEARCH_SIZE, 1));
    if (searchable.length >= 8) for (let i = 0; i < SEARCH_SETS; i++) add("search", { kind: "search", i });

    /** Playable categories: retired ones and ones this language has no questions in are left out. */
    const categories = CATEGORY_ORDER.filter((c) => !RETIRED.has(c) && pools[c].length > 0);

    /** Three other pictures of the same kind for `p`, look-alikes first (as in picture questions). */
    function picWrong(p: Pic, rand: () => number): Pic[] {
        const near = new Set(LOOKALIKES.flatMap(([a, b]) => (p.s === a ? [b] : p.s === b ? [a] : [])));
        const kind = pics.filter((o) => o.k === p.k && o.a !== p.a && !(p.k === "flag" && near.has(o.s)));
        const wrong = pick(kind.filter((o) => o.g === p.g), 3, [], rand);
        wrong.push(...pick(kind, 3 - wrong.length, wrong, rand));
        return wrong;
    }
    const picUrl = (i: number) => `/pics/${pics[i].img}`;

    function build(category: Category, src: Source, rand: () => number): Question {
        const qid = id(src);
        const base = { category, id: qid, isQuote: false, options: [] as string[], answer: -1 };
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
            case "order": {
                const set = orders[src.i];
                const shown = shuffle(set, rand);
                const solution = [...shown.keys()].sort((x, y) => events[shown[x]][1] - events[shown[y]][1]);
                const items = shown.map((e) => events[e][0]);
                const labels = shown.map((e) => s.year(events[e][1]));
                const reveal = solution.map((k) => `${items[k]} (${labels[k]})`).join(" ← ");
                return { category, id: qid, text: s.orderPrompt, isQuote: false, options: [], answer: -1, order: { items, solution, labels }, reveal };
            }
            case "typed": {
                const [, q, a] = bank[src.i]!;
                return { category, id: qid, text: q, isQuote: false, options: [], answer: -1, typed: { answer: a, accepted: s.typedVariants(a) }, reveal: s.answerIs(a) };
            }
            case "tiles": {
                const p = pics[src.i];
                const [text, word] = src.pic ? [s.picPrompts[p.k as PicKind], p.a] : [bank[src.i]![1], bank[src.i]![2]];
                const words = wordLetters(word, 3, 10, 2)!;
                const answer = words.flat();
                const decoys = randomLetters(s.alphabet, Math.min(6, Math.max(2, 12 - answer.length)), rand);
                const q: Question = { ...base, text, tiles: { answer, words: words.map((w) => w.length), letters: shuffle([...answer, ...decoys], rand) }, reveal: s.answerIs(word) };
                return src.pic ? { ...q, image: picUrl(src.i), credit: p.c, creditUrl: p.u } : q;
            }
            case "missing": {
                const [, text, word] = bank[src.i]!;
                const ls = wordLetters(word, 4, 10, 1)![0];
                const at = shuffle(ls.map((_, k) => k), rand)
                    .slice(0, ls.length >= 6 ? 2 : 1)
                    .sort((a, b) => a - b);
                const label = (xs: string[]) => xs.join(s.listSep);
                const right = at.map((k) => ls[k]);
                const wrong = new Set<string>();
                // The right letters the other way round are the best trap, when they differ.
                if (right.length === 2 && right[0] !== right[1]) wrong.add(label([right[1], right[0]]));
                for (let tries = 0; wrong.size < 3 && tries < 50; tries++) {
                    const guess = right.map((c) => (rand() < 0.5 ? c : randomLetters(s.alphabet, 1, rand)[0]));
                    if (guess.join("") !== right.join("")) wrong.add(label(guess));
                }
                const q = finish(category, qid, text, false, label(right), [...wrong].slice(0, 3), rand);
                return { ...q, masked: ls.map((c, k) => (at.includes(k) ? null : c)), reveal: s.answerIs(word) };
            }
            case "odd": {
                const set = oddSets[src.i];
                const odd = set.items[3];
                if (set.by === "century") {
                    const [label, y] = events[odd];
                    const q = finish(category, qid, s.oddCentury(set.c), false, label, set.items.slice(0, 3).map((e) => events[e][0]), rand);
                    return { ...q, reveal: `${label}: ${s.year(y)}` };
                }
                const names = set.by === "region" ? s.regions : s.fields;
                const prompt = set.by === "region" ? s.oddRegion : s.oddField;
                const q = finish(category, qid, prompt(names[pics[set.items[0]].g]), false, pics[odd].a, set.items.slice(0, 3).map((i) => pics[i].a), rand);
                return { ...q, reveal: `${pics[odd].a}: ${names[pics[odd].g]}` };
            }
            case "match": {
                const set = matchSets[src.i];
                const left = shuffle(set.items, rand);
                const right = shuffle(set.items, rand);
                const side = (k: number): [{ text: string; image?: string }, string] =>
                    set.by === "flag" ? [{ text: "", image: picUrl(k) }, pics[k].a] : set.by === "event" ? [{ text: events[k][0] }, s.year(events[k][1])] : [{ text: books[k][0] }, authors[books[k][1]]];
                return {
                    ...base,
                    text: s.matchPrompts[set.by],
                    match: { left: left.map((k) => side(k)[0]), right: right.map((k) => side(k)[1]), solution: left.map((k) => right.indexOf(k)) },
                };
            }
            case "blur":
            case "zoom": {
                const q = build(category, { kind: "pic", i: src.i }, rand);
                return { ...q, category, id: qid, effect: { kind: src.kind, x: 25 + Math.round(rand() * 50), y: 25 + Math.round(rand() * 50) } };
            }
            case "pics4": {
                const p = pics[src.i];
                const all = shuffle([p, ...picWrong(p, rand)], rand);
                return { ...base, text: s.pickFlag(p.a), options: all.map((o) => o.a), optionImages: all.map((o) => `/pics/${o.img}`), answer: all.indexOf(p) };
            }
            case "rank": {
                const { m, items } = rankSets[src.i];
                const metric = metrics[m];
                const shown = shuffle(items, rand);
                const solution = items.map((k) => shown.indexOf(k));
                const names = shown.map((k) => metric.items[k][0]);
                const labels = shown.map((k) => `${s.qty(metric.items[k][1])} ${metric.unit}`);
                const reveal = solution.map((k) => `${names[k]} (${labels[k]})`).join(" ← ");
                return { ...base, text: metric.rank!, order: { items: names, solution, labels, hint: s.rankHint }, reveal };
            }
            case "sort": {
                const set = sortSets[src.i];
                const shown = shuffle(set.items, rand);
                if (set.by === "years") {
                    const sort = { items: shown.map((e) => events[e][0]), bins: [s.beforeYear(set.pivot), s.afterYear(set.pivot)] as [string, string], solution: shown.map((e) => (events[e][1] < set.pivot ? 0 : 1)), labels: shown.map((e) => s.year(events[e][1])) };
                    return { ...base, text: s.sortYears(set.pivot), sort };
                }
                const sort = { items: shown.map((i) => pics[i].a), images: shown.map(picUrl), bins: set.groups.map((g) => s.regions[g]) as [string, string], solution: shown.map((i) => (pics[i].g === set.groups[0] ? 0 : 1)) };
                return { ...base, text: s.sortRegions, sort };
            }
            case "tapall": {
                const { g, items } = tapSets[src.i];
                const shown = shuffle(items, rand);
                return { ...base, text: s.tapAll(s.regions[g]), tapall: { images: shown.map(picUrl), names: shown.map((i) => pics[i].a), solution: shown.map((i) => pics[i].g === g) } };
            }
            case "math": {
                // The puzzle comes from its number alone, answered on a number pad.
                const p = mathPuzzle(src.i, s, seeded(`math${src.i}`));
                return { ...base, text: s.mathPrompts[p.kind], puzzle: p.lines, numpad: { answer: p.answer }, reveal: s.answerIs(s.n(p.answer)) };
            }
            case "search": {
                const r = seeded(`search${src.i}`);
                for (let tries = 0; ; tries++) {
                    // Four words nearly always fit; settle for three if a draw keeps failing.
                    const chosen = pick(searchable, tries < 100 ? 4 : 3, [], r);
                    if (!distinct(chosen)) continue;
                    const grid = wordSearch(chosen.map((i) => letters(pics[i].a)), SEARCH_SIZE, s.dir === "rtl", s.alphabet, r);
                    if (grid) {
                        const words = chosen.map((i, k) => ({ name: pics[i].a, image: picUrl(i), cells: grid.cells[k] }));
                        return { ...base, text: s.searchPrompt, search: { size: SEARCH_SIZE, grid: grid.grid, words } };
                    }
                }
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
        return [...registry].filter(([, [c]]) => !PLAY_ONLY.has(c)).map(([qid, [c]]) => [qid, c]);
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
        const enabled: Category[] = filter === "all" ? categories.filter((c) => !NOT_IN_MIX.has(c)) : [filter];
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
            else if (key < DAILY_V5) all = all.filter(([qid]) => bankIndex(qid) < BANK_V2);
            else if (key < DAILY_V6) all = all.filter(([qid]) => bankIndex(qid) < BANK_V3);
            else if (key < DAILY_V7) all = all.filter(([qid]) => bankIndex(qid) < BANK_V4);
            else if (key < DAILY_V8) all = all.filter(([qid]) => bankIndex(qid) < BANK_V5);
            else if (key < DAILY_V9) all = all.filter(([qid]) => bankIndex(qid) < BANK_V6);
            else if (key < DAILY_V10) all = all.filter(([qid]) => bankIndex(qid) < BANK_V7);
        } else {
            all = allQuestionIds();
            if (key < DAILY_V5) all = all.filter(([qid]) => bankIndex(qid) < BANK_V2);
            else if (key < DAILY_V6) all = all.filter(([qid]) => bankIndex(qid) < BANK_V3);
            else if (key < DAILY_V7) all = all.filter(([qid]) => bankIndex(qid) < BANK_V4);
            else if (key < DAILY_V8) all = all.filter(([qid]) => bankIndex(qid) < BANK_V5);
            else if (key < DAILY_V9) all = all.filter(([qid]) => bankIndex(qid) < BANK_V6);
            else if (key < DAILY_V10) all = all.filter(([qid]) => bankIndex(qid) < BANK_V7);
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
