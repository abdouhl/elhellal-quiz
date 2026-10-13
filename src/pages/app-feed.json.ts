// The elhellal.com app's Explore tab (src/pages/explore.astro there) reads
// this: a pool of plain four-option questions it plays one a day from.
// CORS in public/_headers.
import { engines } from "../game/engines";
import { SITE, qPath } from "../game/seo";
import type { Category } from "../game/engine";

const POOL = 60;
const PLAIN: Category[] = ["geo", "sci", "hist", "gen", "lit", "lang"];

export function GET() {
    const ar = engines.ar;
    const questions = ar
        .allQuestionIds()
        .filter(([, c]) => PLAIN.includes(c))
        .map(([id]) => ar.questionById(id))
        .filter((q) => q && !q.image && !q.isQuote && q.options.length === 4 && q.text.length <= 120);
    // An even spread over the bank, so the pool mixes categories and stays the same between builds.
    const step = Math.max(1, Math.floor(questions.length / POOL));
    const items = questions
        .filter((_, i) => i % step === 0)
        .slice(0, POOL)
        .map((q) => ({ title: q!.text, options: q!.options, answer: q!.answer, url: `${SITE}${qPath("ar", q!.id)}` }));
    return Response.json({ v: 1, site: "quiz", title: "اختبر معلوماتك", url: `${SITE}/`, items });
}
