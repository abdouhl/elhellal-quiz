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

/** Points for a correct answer: base 10 plus a streak bonus that caps at +10. */
export function pointsFor(streakAfter: number): number {
    return 10 + Math.min(streakAfter - 1, 10);
}
