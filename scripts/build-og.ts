// Renders a 1200×630 share image for every question (dist/og/<id>.png, and dist/og/<lang>/<id>.png for
// languages other than Arabic) plus home.png and daily.png, so a link shared on WhatsApp/X/Facebook
// previews the actual question. Runs after `astro build`.
// Run: bun scripts/build-og.ts
import { Resvg } from "@resvg/resvg-js";
import { decompress } from "wawoff2";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { engines } from "../src/game/engines";
import type { Question } from "../src/game/engine";
import { LANGS, t } from "../src/i18n";
import type { Lang } from "../src/i18n";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = (lang: Lang) => path.join(root, "dist/og", lang === "ar" ? "" : lang);
for (const lang of LANGS) mkdirSync(outDir(lang), { recursive: true });

/** Text only the share images use. */
const OG = {
    ar: {
        cta: "هل تعرف الإجابة؟",
        home: ["اختبار لا ينتهي", "جغرافيا، علوم، تاريخ، أدب، أعلام، مشاهير، ومعالم. كم نقطة تستطيع أن تجمع؟", "أسئلة بالعربية"],
        daily: ["تحدي اليوم", "١٠ أسئلة جديدة كل يوم، نفس الأسئلة للجميع. هل تتفوق على أصدقائك؟", "كل يوم"],
    },
    en: {
        cta: "Do you know the answer?",
        home: ["An endless quiz", "Geography, science, history, books, flags, famous faces and landmarks. How far can you go?", "Trivia"],
        daily: ["Daily challenge", "10 new questions every day, the same for everyone. Can you beat your friends?", "Every day"],
    },
    es: {
        cta: "¿Sabes la respuesta?",
        home: ["Un quiz sin fin", "Geografía, ciencia, historia, libros, banderas, personajes famosos y monumentos. ¿Hasta dónde llegarás?", "Cultura general"],
        daily: ["Reto diario", "10 preguntas nuevas cada día, las mismas para todos. ¿Superarás a tus amigos?", "Cada día"],
    },
} as const satisfies Record<Lang, unknown>;

// The site's ROM font has no Arabic glyphs (browsers fall back to a system font), so images use IBM Plex Sans Arabic.
// resvg needs TTF, and loads fonts from files far faster than from buffers (~0.3ms vs ~600ms per render).
const FAMILY = "IBM Plex Sans Arabic";
const fontDir = path.join(root, "node_modules/.cache/og-fonts");
mkdirSync(fontDir, { recursive: true });
const fonts = {
    "plex-400": "node_modules/@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-Regular.woff2",
    "plex-700": "node_modules/@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-Bold.woff2",
};
// Batch workers (see the bottom of the file) reuse the TTFs the parent already wrote.
const batch = process.env.OG_BATCH;
// One at a time: decompress() returns a view into WASM memory that the next call overwrites.
const fontFiles: string[] = [];
for (const [name, woff2] of Object.entries(fonts)) {
    const file = path.join(fontDir, `${name}.ttf`);
    if (!batch) writeFileSync(file, Buffer.from(await decompress(readFileSync(path.join(root, woff2)))));
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

/** The language being rendered; a worker renders one language, the parent sets it per poster. */
let lang: Lang = "ar";
const rtl = () => t(lang).dir === "rtl";
/** x for the reading side's start (right in Arabic) and end, `inset` in from the edge. */
const startX = (inset: number) => (rtl() ? W - inset : inset);
const endX = (inset: number) => (rtl() ? inset : W - inset);
/** text-anchor that lines text up against the reading side's start / end. */
const startAnchor = () => (rtl() ? "end" : "start");
const endAnchor = () => (rtl() ? "start" : "end");

/**
 * Block of lines whose first baseline is at `y`. In RTL each line starts with an RLM so leading
 * punctuation stays on the right.
 */
function textBlock(lines: string[], x: number, y: number, size: number, lineHeight: number, fill: string, anchor = startAnchor(), weight = 400): string {
    const mark = rtl() ? "\u200F" : "";
    return lines
        .map((l, i) => `<text x="${x}" y="${y + i * lineHeight}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" direction="${t(lang).dir}">${mark}${esc(l)}</text>`)
        .join("");
}

const logo = (x: number, y: number, s: number) => `
    <g transform="translate(${x} ${y}) scale(${s / 32})">
        <defs>
            <linearGradient id="m" x1="4" y1="6" x2="22" y2="26" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#FFB347"/><stop offset="100%" stop-color="#FF8C00"/>
            </linearGradient>
        </defs>
        <path d="M9.5 11.5a6.5 6.5 0 1 1 9.4 5.8c-1.9 1-2.9 2.3-2.9 4.4v.6" fill="none" stroke="url(#m)" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="16" cy="27.4" r="2.6" fill="url(#m)"/>
    </g>`;

function frame(body: string, tag: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <rect width="${W}" height="${H}" fill="${COLORS.page}"/>
        <rect x="0" y="0" width="${W}" height="6" fill="${COLORS.accent}"/>
        ${logo(rtl() ? W - PAD - 44 : PAD, 34, 44)}
        <text x="${startX(PAD + 56)}" y="68" font-size="30" font-weight="700" fill="${COLORS.ink}" text-anchor="${startAnchor()}" direction="${t(lang).dir}">${esc(t(lang).siteName)}</text>
        <text x="${endX(PAD)}" y="68" font-size="26" fill="${COLORS.muted}" text-anchor="${endAnchor()}" direction="${t(lang).dir}">${esc(tag)}</text>
        ${body}
        <text x="${endX(PAD)}" y="${H - 34}" font-size="24" fill="${COLORS.muted}" text-anchor="${endAnchor()}">quiz.elhellal.com</text>
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
        // The picture on the reading side's end, the prompt beside it where reading starts.
        const size = 54;
        const lines = wrap(q.text, size, 520, 2, 700);
        const lh = Math.round(size * 1.45);
        question = pictureSvg(q, rtl() ? PAD : W - PAD - 540, 104, 540, 240) + textBlock(lines, startX(PAD), 240 - ((lines.length - 1) * lh) / 2, size, lh, COLORS.ink, startAnchor(), 700);
    } else {
        const text = q.isQuote ? t(lang).quoted(q.text) : q.text;
        // A true-or-false claim gets its own accent line under the question.
        const claim = q.claim ? [t(lang).quoted(q.claim) + (rtl() ? "\u200F" : "")] : [];
        const size = text.length <= 50 ? 54 : text.length <= 100 ? 42 : 32;
        const lines = wrap(text, size, W - 2 * PAD, 3 - claim.length, 700);
        const lh = Math.round(size * 1.45);
        const qTop = 150 + Math.round(((3 - lines.length - claim.length) * lh) / 2);
        question =
            textBlock(lines, W / 2, qTop, size, lh, COLORS.ink, "middle", 700) +
            textBlock(claim, W / 2, qTop + lines.length * lh, size, lh, COLORS.accent, "middle", 700);
    }

    // 2×2 option tiles, first option where reading starts (top-right in Arabic); a guess-the-year question gets one wide tile.
    const options = q.year ? [t(lang).labels.year] : q.options;
    const gap = 20;
    const cols = options.length === 1 ? 1 : 2;
    const tileW = (W - 2 * PAD - (cols - 1) * gap) / cols;
    const tileH = 84;
    const top = 368;
    const tiles = options
        .map((o, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = rtl() ? W - PAD - (col + 1) * tileW - col * gap : PAD + col * (tileW + gap);
            const y = top + row * (tileH + gap);
            const oSize = 26;
            const oLines = wrap(o, oSize, tileW - 32, 2);
            const oLh = 34;
            const baseline = y + tileH / 2 + oSize / 3 - ((oLines.length - 1) * oLh) / 2;
            return `<rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" fill="${COLORS.tile}" stroke="${COLORS.border}"/>` + textBlock(oLines, x + tileW / 2, baseline, oSize, oLh, COLORS.ink, "middle");
        })
        .join("");

    const cta = `<text x="${startX(PAD)}" y="${H - 34}" font-size="28" font-weight="700" fill="${COLORS.accent}" text-anchor="${startAnchor()}" direction="${t(lang).dir}">${esc(OG[lang].cta)}</text>`;
    return frame(question + tiles + cta, t(lang).labels[q.category]);
}

function posterSvg(title: string, subtitle: string, tag: string): string {
    const body =
        `<text x="${W / 2}" y="290" font-size="84" font-weight="700" fill="${COLORS.accent}" text-anchor="middle" direction="${t(lang).dir}">${esc(title)}</text>` +
        textBlock(wrap(subtitle, 38, W - 2 * PAD, 2), W / 2, 390, 38, 56, COLORS.ink, "middle");
    return frame(body, tag);
}

const render = (svg: string, name: string) =>
    writeFileSync(path.join(outDir(lang), `${name}.png`), new Resvg(svg, { font: fontOptions, fitTo: { mode: "width", value: W } }).render().asPng());

const ids = Object.fromEntries(LANGS.map((l) => [l, engines[l].allQuestionIds().map(([id]) => id)])) as Record<Lang, string[]>;

if (batch) {
    // Worker: render one language's ids[start, end) and exit.
    const [l, start, end] = batch.split(":");
    lang = l as Lang;
    for (const id of ids[lang].slice(+start, +end)) render(questionSvg(engines[lang].questionById(id)!), id);
    process.exit(0);
}

// resvg's native image buffers (~3.5MB each) are never freed under Bun, so rendering every question in one
// process runs the build machine out of memory. Render in short-lived child processes instead; each one's
// memory goes back to the OS when it exits, and they run in parallel.
const BATCH_SIZE = 150;
const started = Date.now();
const batches: string[] = [];
for (const l of LANGS) for (let i = 0; i < ids[l].length; i += BATCH_SIZE) batches.push(`${l}:${i}:${Math.min(i + BATCH_SIZE, ids[l].length)}`);
const total = LANGS.reduce((n, l) => n + ids[l].length, 0);
let done = 0;
async function runWorker() {
    for (let b = batches.shift(); b; b = batches.shift()) {
        const proc = Bun.spawn([process.execPath, fileURLToPath(import.meta.url)], { env: { ...process.env, OG_BATCH: b }, stdout: "inherit", stderr: "inherit" });
        if ((await proc.exited) !== 0) throw new Error(`og: batch ${b} failed with exit code ${proc.exitCode}`);
        const [, start, end] = b.split(":").map(Number);
        done += end - start;
        console.log(`og: ${done}/${total}`);
    }
}
await Promise.all(Array.from({ length: Math.min(4, availableParallelism()) }, runWorker));
for (const l of LANGS) {
    lang = l;
    const [homeTitle, homeText, homeTag] = OG[l].home;
    const [dailyTitle, dailyText, dailyTag] = OG[l].daily;
    render(posterSvg(homeTitle, homeText, homeTag), "home");
    render(posterSvg(dailyTitle, dailyText, dailyTag), "daily");
}
console.log(`og: ${total + 2 * LANGS.length} images in ${((Date.now() - started) / 1000).toFixed(1)}s`);
