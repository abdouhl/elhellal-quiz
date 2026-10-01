// Build-time helpers for the indexable pages: /q/<id> question pages and /c/<category> hubs, per language.
import { base, t } from "../i18n";
import type { Lang } from "../i18n";
import { engines } from "./engines";
import type { Category, Question } from "./engine";

export const SITE = "https://quiz.elhellal.com";

/** Question page path, with the trailing slash the static host serves it under (no redirect). */
export const qPath = (lang: Lang, id: string) => `${base(lang)}/q/${id}/`;
export const hubUrl = (lang: Lang, c: Category) => `${base(lang)}/c/${c}/`;
export const homeUrl = (lang: Lang) => `${base(lang)}/`;
/** Share image for a question, rendered by scripts/build-og.ts. */
export const ogUrl = (lang: Lang, name: string) => `${SITE}/og/${lang === "ar" ? "" : `${lang}/`}${name}.png`;
export const hubTitle = (lang: Lang, c: Category) => t(lang).hubTitles[c];

/** Picture questions share one prompt per kind, and "which book is by X?" one per author. */
const sharedPrompt = (q: Question) => !!q.image || q.id.startsWith("ab");
const stripQ = (s: string) => s.replace(/[؟?]$/, "");

/**
 * A unique, answer-free page title. Where many questions share the same prompt, their options are
 * spelled out to tell them apart — which is also what people search for. True-or-false leads with
 * the claim so it survives the title being cut short.
 */
export function seoTitle(lang: Lang, q: Question): string {
    const s = t(lang);
    if (sharedPrompt(q)) return `${stripQ(q.text)}: ${q.options.join(s.or)}${s.qMark}`;
    if (q.claim) return s.tfSeoTitle(q.claim, q.text);
    return engines[lang].questionTitle(q);
}

/** `text` cut on a word boundary to at most `max` characters. */
export function clip(text: string, max: number): string {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).trim()}…`;
}

/** The correct answer as plain text. */
export function answerText(lang: Lang, q: Question): string {
    if (q.year) return t(lang).year(q.year.answer);
    return q.options[q.answer];
}

export function seoDescription(lang: Lang, q: Question): string {
    const s = t(lang);
    // The title already lists the options for shared prompts and either-or questions.
    const listed = sharedPrompt(q) || q.options.length === 2;
    const choices = q.year ? s.pickYear(q.year.min, q.year.max) : listed ? "" : s.optionsList(q.options);
    return clip(`${clip(seoTitle(lang, q), 110)} ${choices}${choices ? " " : ""}${s.descTail}`, 300);
}

/** Question ids per category, in their stable engine order. */
const byCategory = new Map<Lang, Map<Category, string[]>>();
function idsByCategory(lang: Lang): Map<Category, string[]> {
    let map = byCategory.get(lang);
    if (!map) {
        map = new Map();
        for (const [id, c] of engines[lang].allQuestionIds()) {
            if (!map.has(c)) map.set(c, []);
            map.get(c)!.push(id);
        }
        byCategory.set(lang, map);
    }
    return map;
}

export function categoryIds(lang: Lang, c: Category): string[] {
    return idsByCategory(lang).get(c) ?? [];
}

export function categories(lang: Lang): Category[] {
    return [...idsByCategory(lang).keys()];
}

/**
 * The `n` questions after this one in its category (wrapping around). Every page links forward to
 * its neighbours, so crawlers reach each question from several others, not only from the hub.
 */
export function related(lang: Lang, q: Question, n = 8): Question[] {
    const ids = categoryIds(lang, q.category);
    const at = ids.indexOf(q.id);
    const out: Question[] = [];
    for (let k = 1; k <= Math.min(n, ids.length - 1); k++) out.push(engines[lang].questionById(ids[(at + k) % ids.length])!);
    return out;
}

/** The same page in every language that has it, for hreflang links and the language switch. */
export type Alternates = Partial<Record<Lang, string>>;
export const pageAlternates = (path: (lang: Lang) => string | null): Alternates =>
    Object.fromEntries((Object.keys(engines) as Lang[]).flatMap((l) => (path(l) === null ? [] : [[l, path(l)!]])));
export const questionAlternates = (id: string) => pageAlternates((l) => (engines[l].questionById(id) ? qPath(l, id) : null));
export const hubAlternates = (c: Category) => pageAlternates((l) => (categories(l).includes(c) ? hubUrl(l, c) : null));

/** schema.org Quiz (one question) plus its breadcrumb trail. */
export function questionJsonLd(lang: Lang, q: Question): object[] {
    const s = t(lang);
    const url = `${SITE}${qPath(lang, q.id)}`;
    const wrong = q.year ? [] : q.options.filter((_, i) => i !== q.answer);
    return [
        {
            "@context": "https://schema.org",
            "@type": "Quiz",
            name: seoTitle(lang, q),
            url,
            inLanguage: lang,
            about: { "@type": "Thing", name: s.labels[q.category] },
            ...(q.image ? { image: `${SITE}${q.image}` } : {}),
            hasPart: {
                "@type": "Question",
                eduQuestionType: q.year ? "Short answer" : "Multiple choice",
                text: q.claim ? `${q.text} ${s.quoted(q.claim)}` : q.text,
                ...(wrong.length ? { suggestedAnswer: wrong.map((text) => ({ "@type": "Answer", text })) } : {}),
                acceptedAnswer: { "@type": "Answer", text: answerText(lang, q), ...(q.reveal ? { comment: { "@type": "Comment", text: q.reveal } } : {}) },
            },
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: s.siteName, item: `${SITE}${homeUrl(lang)}` },
                { "@type": "ListItem", position: 2, name: hubTitle(lang, q.category), item: `${SITE}${hubUrl(lang, q.category)}` },
                { "@type": "ListItem", position: 3, name: clip(seoTitle(lang, q), 110), item: url },
            ],
        },
    ];
}
