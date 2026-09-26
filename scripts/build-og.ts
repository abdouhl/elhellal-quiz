// Renders a 1200×630 share image for every question (dist/og/<id>.png) plus home.png and daily.png,
// so a link shared on WhatsApp/X/Facebook previews the actual question. Runs after `astro build`.
// Run: bun scripts/build-og.ts
import { Resvg } from "@resvg/resvg-js";
import { decompress } from "wawoff2";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORY_LABELS, allQuestionIds, questionById } from "../src/game/engine";
import type { Question } from "../src/game/engine";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist/og");
mkdirSync(out, { recursive: true });

// The site's ROM font has no Arabic glyphs (browsers fall back to a system font), so images use IBM Plex Sans Arabic.
// resvg needs TTF, and loads fonts from files far faster than from buffers (~0.3ms vs ~600ms per render).
const FAMILY = "IBM Plex Sans Arabic";
const fontDir = path.join(root, "node_modules/.cache/og-fonts");
mkdirSync(fontDir, { recursive: true });
const fonts = {
    "plex-400": "node_modules/@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-Regular.woff2",
    "plex-700": "node_modules/@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-Bold.woff2",
};
// One at a time: decompress() returns a view into WASM memory that the next call overwrites.
const fontFiles: string[] = [];
for (const [name, woff2] of Object.entries(fonts)) {
    const file = path.join(fontDir, `${name}.ttf`);
    writeFileSync(file, Buffer.from(await decompress(readFileSync(path.join(root, woff2)))));
    fontFiles.push(file);
}
const fontOptions = { fontFiles, loadSystemFonts: false, defaultFontFamily: FAMILY };

const W = 1200;
const H = 630;
const PAD = 64;
const COLORS = { page: "#000", tile: "#1a1a1a", border: "#333", ink: "#f2f2f2", muted: "#9a9a9a", accent: "#FF8C00" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const widthCache = new Map<string, number>();
function measure(text: string, size: number, weight = 400): number {
    const key = `${size}|${weight}|${text}`;
    let w = widthCache.get(key);
    if (w === undefined) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${size * 2}"><text x="0" y="${size}" font-size="${size}" font-weight="${weight}">${esc(text)}</text></svg>`;
        w = new Resvg(svg, { font: fontOptions }).getBBox()?.width ?? 0;
        widthCache.set(key, w);
    }
    return w;
}

/** Greedy word wrap; the last allowed line is cut with "…" if the text doesn't fit. */
function wrap(text: string, size: number, maxWidth: number, maxLines: number, weight = 400): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || measure(candidate, size, weight) <= maxWidth) line = candidate;
        else {
            lines.push(line);
            line = word;
        }
    }
    lines.push(line);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.includes(" ") && measure(`${last}…`, size, weight) > maxWidth) last = last.slice(0, last.lastIndexOf(" "));
    kept[maxLines - 1] = `${last}…`;
    return kept;
}

/** Block of RTL lines whose first baseline is at `y`. Each line starts with an RLM so leading punctuation stays on the right. */
function textBlock(lines: string[], x: number, y: number, size: number, lineHeight: number, fill: string, anchor = "end", weight = 400): string {
    return lines
        .map((l, i) => `<text x="${x}" y="${y + i * lineHeight}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" direction="rtl">\u200F${esc(l)}</text>`)
        .join("");
}

const crescent = (x: number, y: number, s: number) => `
    <g transform="translate(${x} ${y}) scale(${s / 32})">
        <defs>
            <mask id="c"><rect width="32" height="32" fill="white"/><circle cx="20" cy="12" r="9.5" fill="black"/></mask>
            <linearGradient id="m" x1="4" y1="6" x2="22" y2="26" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#FFB347"/><stop offset="100%" stop-color="#FF8C00"/>
            </linearGradient>
        </defs>
        <circle cx="14" cy="16" r="11" fill="url(#m)" mask="url(#c)"/>
    </g>`;

function frame(body: string, tag: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <rect width="${W}" height="${H}" fill="${COLORS.page}"/>
        <rect x="0" y="0" width="${W}" height="6" fill="${COLORS.accent}"/>
        ${crescent(W - PAD - 44, 34, 44)}
        <text x="${W - PAD - 56}" y="68" font-size="30" font-weight="700" fill="${COLORS.ink}" text-anchor="end" direction="rtl">اختبار الهلال</text>
        <text x="${PAD}" y="68" font-size="26" fill="${COLORS.muted}" text-anchor="start" direction="rtl">${esc(tag)}</text>
        ${body}
        <text x="${PAD}" y="${H - 34}" font-size="24" fill="${COLORS.muted}" text-anchor="start">quiz.elhellal.com</text>
    </svg>`;
}

/** The question's picture, embedded, fitted into the box (portraits fill it, cropped toward the face). */
function pictureSvg(q: Question, x: number, y: number, w: number, h: number): string {
    const file = path.join(root, "public", q.image!);
    const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
    const href = `data:${mime};base64,${readFileSync(file).toString("base64")}`;
    const fit = q.category === "face" ? "xMidYMin slice" : "xMidYMid meet";
    if (q.category === "face") {
        // A square, centred in the box, so the crop keeps the whole face.
        x += (w - h) / 2;
        w = h;
    }
    return `<clipPath id="pic"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>
        <image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${fit}" clip-path="url(#pic)" href="${href}"/>`;
}

function questionSvg(q: Question): string {
    let question: string;
    if (q.image) {
        // Picture on the left, the prompt beside it on the right.
        const size = 54;
        const lines = wrap(q.text, size, 520, 2, 700);
        const lh = Math.round(size * 1.45);
        question = pictureSvg(q, PAD, 104, 540, 240) + textBlock(lines, W - PAD, 240 - ((lines.length - 1) * lh) / 2, size, lh, COLORS.ink, "end", 700);
    } else {
        const text = q.isQuote ? `«${q.text}»` : q.text;
        // A true-or-false claim gets its own accent line under the question.
        const claim = q.claim ? [`«${q.claim}»\u200F`] : [];
        const size = text.length <= 50 ? 54 : text.length <= 100 ? 42 : 32;
        const lines = wrap(text, size, W - 2 * PAD, 3 - claim.length, 700);
        const lh = Math.round(size * 1.45);
        const qTop = 150 + Math.round(((3 - lines.length - claim.length) * lh) / 2);
        question =
            textBlock(lines, W / 2, qTop, size, lh, COLORS.ink, "middle", 700) +
            textBlock(claim, W / 2, qTop + lines.length * lh, size, lh, COLORS.accent, "middle", 700);
    }

    // 2×2 option tiles, first option top-right to match the RTL page; a guess-the-year question gets one wide tile.
    const options = q.year ? ["في أي عام؟"] : q.options;
    const gap = 20;
    const cols = options.length === 1 ? 1 : 2;
    const tileW = (W - 2 * PAD - (cols - 1) * gap) / cols;
    const tileH = 84;
    const top = 368;
    const tiles = options
        .map((o, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = W - PAD - (col + 1) * tileW - col * gap;
            const y = top + row * (tileH + gap);
            const oSize = 26;
            const oLines = wrap(o, oSize, tileW - 32, 2);
            const oLh = 34;
            const baseline = y + tileH / 2 + oSize / 3 - ((oLines.length - 1) * oLh) / 2;
            return `<rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" fill="${COLORS.tile}" stroke="${COLORS.border}"/>` + textBlock(oLines, x + tileW / 2, baseline, oSize, oLh, COLORS.ink, "middle");
        })
        .join("");

    const cta = `<text x="${W - PAD}" y="${H - 34}" font-size="28" font-weight="700" fill="${COLORS.accent}" text-anchor="end" direction="rtl">هل تعرف الإجابة؟</text>`;
    return frame(question + tiles + cta, q.isQuote ? "من قال؟" : CATEGORY_LABELS[q.category]);
}

function posterSvg(title: string, subtitle: string, tag: string): string {
    const body =
        `<text x="${W / 2}" y="290" font-size="84" font-weight="700" fill="${COLORS.accent}" text-anchor="middle" direction="rtl">${esc(title)}</text>` +
        textBlock(wrap(subtitle, 38, W - 2 * PAD, 2), W / 2, 390, 38, 56, COLORS.ink, "middle");
    return frame(body, tag);
}

const render = (svg: string, name: string) =>
    writeFileSync(path.join(out, `${name}.png`), new Resvg(svg, { font: fontOptions, fitTo: { mode: "width", value: W } }).render().asPng());

const started = Date.now();
const ids = allQuestionIds();
for (const [id] of ids) render(questionSvg(questionById(id)!), id);
render(posterSvg("اختبار لا ينتهي", "جغرافيا، علوم، تاريخ، أدب، أعلام، مشاهير، و«من قال؟». كم نقطة تستطيع أن تجمع؟", "أسئلة بالعربية"), "home");
render(posterSvg("تحدي اليوم", "١٠ أسئلة جديدة كل يوم، نفس الأسئلة للجميع. هل تتفوق على أصدقائك؟", "كل يوم"), "daily");
console.log(`og: ${ids.length + 2} images in ${((Date.now() - started) / 1000).toFixed(1)}s`);
