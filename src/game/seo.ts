// Build-time helpers for the indexable pages: /q/<id> question pages and /c/<category> hubs.
import { CATEGORY_LABELS, allQuestionIds, questionById, questionTitle } from "./engine";
import type { Category, Question } from "./engine";

export const SITE = "https://quiz.elhellal.com";

/** Question page path, with the trailing slash the static host serves it under (no redirect). */
export const qPath = (id: string) => `/q/${id}/`;

/** Picture questions share one prompt per kind, and "which book is by X?" one per author. */
const sharedPrompt = (q: Question) => !!q.image || q.id.startsWith("ab");

/**
 * A unique, answer-free page title. Where many questions share the same prompt, their options are
 * spelled out to tell them apart — which is also what people search for. True-or-false leads with
 * the claim so it survives the title being cut short.
 */
export function seoTitle(q: Question): string {
    if (sharedPrompt(q)) return `${q.text.replace(/؟$/, "")}: ${q.options.join(" أم ")}؟`;
    if (q.claim) return `صح أم خطأ: «${q.claim}» — ${q.text}`;
    return questionTitle(q);
}

/** `text` cut on a word boundary to at most `max` characters. */
export function clip(text: string, max: number): string {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).trim()}…`;
}

const ar = (n: number) => n.toLocaleString("ar-EG", { useGrouping: false });

/** The correct answer as plain text. */
export function answerText(q: Question): string {
    if (q.year) return `${ar(q.year.answer)}م`;
    return q.options[q.answer];
}

export function seoDescription(q: Question): string {
    // The title already lists the options for shared prompts and either-or questions.
    const listed = sharedPrompt(q) || q.options.length === 2;
    const choices = q.year ? `اختر العام بين ${ar(q.year.min)} و${ar(q.year.max)}.` : listed ? "" : `الخيارات: ${q.options.join("، ")}.`;
    return clip(`${clip(seoTitle(q), 110)} ${choices}${choices ? " " : ""}جرّب الإجابة ثم اعرف الحل الصحيح في اختبار الهلال.`, 300);
}

/** Question ids per category, in their stable engine order. */
const byCategory = new Map<Category, string[]>();
for (const [id, c] of allQuestionIds()) {
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c)!.push(id);
}

export function categoryIds(c: Category): string[] {
    return byCategory.get(c) ?? [];
}

export function categories(): Category[] {
    return [...byCategory.keys()];
}

/**
 * The `n` questions after this one in its category (wrapping around). Every page links forward to
 * its neighbours, so crawlers reach each question from several others, not only from the hub.
 */
export function related(q: Question, n = 8): Question[] {
    const ids = categoryIds(q.category);
    const at = ids.indexOf(q.id);
    const out: Question[] = [];
    for (let k = 1; k <= Math.min(n, ids.length - 1); k++) out.push(questionById(ids[(at + k) % ids.length])!);
    return out;
}

export const hubUrl = (c: Category) => `/c/${c}/`;
/** Hub page names, phrased the way people search (the game's short labels read badly inside a sentence). */
const HUB_TITLES: Record<Category, string> = {
    geo: "أسئلة جغرافيا مع الإجابات",
    sci: "أسئلة علمية مع الإجابات",
    hist: "أسئلة تاريخية مع الإجابات",
    gen: "أسئلة ثقافة عامة مع الإجابات",
    lang: "أسئلة في اللغة العربية مع الإجابات",
    lit: "أسئلة عن الأدب والكتب مع الإجابات",
    quote: "من قائل هذه العبارة؟ أسئلة اقتباسات مع الإجابات",
    flag: "أسئلة أعلام الدول مع الإجابات",
    face: "أسئلة المشاهير بالصور مع الإجابات",
    place: "أسئلة المعالم السياحية بالصور مع الإجابات",
    tf: "أسئلة صح أم خطأ مع الإجابات",
    first: "أسئلة أيهما حدث أولًا مع الإجابات",
    more: "أسئلة أيهما أكبر مع الإجابات",
    year: "أسئلة تواريخ وأحداث مع الإجابات",
};
export const hubTitle = (c: Category) => HUB_TITLES[c];

/** schema.org Quiz (one question) plus its breadcrumb trail. */
export function questionJsonLd(q: Question): object[] {
    const url = `${SITE}${qPath(q.id)}`;
    const wrong = q.year ? [] : q.options.filter((_, i) => i !== q.answer);
    return [
        {
            "@context": "https://schema.org",
            "@type": "Quiz",
            name: seoTitle(q),
            url,
            inLanguage: "ar",
            about: { "@type": "Thing", name: CATEGORY_LABELS[q.category] },
            ...(q.image ? { image: `${SITE}${q.image}` } : {}),
            hasPart: {
                "@type": "Question",
                eduQuestionType: q.year ? "Short answer" : "Multiple choice",
                text: q.claim ? `${q.text} «${q.claim}»` : q.text,
                ...(wrong.length ? { suggestedAnswer: wrong.map((text) => ({ "@type": "Answer", text })) } : {}),
                acceptedAnswer: { "@type": "Answer", text: answerText(q), ...(q.reveal ? { comment: { "@type": "Comment", text: q.reveal } } : {}) },
            },
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "اختبار الهلال", item: `${SITE}/` },
                { "@type": "ListItem", position: 2, name: hubTitle(q.category), item: `${SITE}${hubUrl(q.category)}` },
                { "@type": "ListItem", position: 3, name: clip(seoTitle(q), 110), item: url },
            ],
        },
    ];
}
