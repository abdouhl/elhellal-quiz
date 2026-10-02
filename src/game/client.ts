// Browser-only helpers shared by the endless quiz and the daily challenge.
import { DEFAULT_LANG, base, t } from "../i18n";
import type { Lang } from "../i18n";
import { dayKey } from "./engine";
import type { Question } from "./engine";

export const SITE = "https://quiz.elhellal.com";

/** The page's language, from `<html lang>`, and its strings. */
export const lang = (document.documentElement.lang || DEFAULT_LANG) as Lang;
export const s = t(lang);
/** Path of this language's home page ("/", "/en/", …). */
export const home = `${base(lang)}/`;

/** Loads this language's engine; only that language's questions are downloaded. */
const ENGINES: Record<Lang, () => Promise<typeof import("./ar")>> = { ar: () => import("./ar"), en: () => import("./en"), es: () => import("./es") };
export const loadEngine = () => ENGINES[lang]().then((m) => m.engine);

/**
 * The id answers are counted under: languages other than Arabic get their own counts, since the
 * same question can be harder or easier for a different audience.
 */
const statId = (id: string) => (lang === DEFAULT_LANG ? id : `${lang}:${id}`);

// localStorage can throw (private windows, blocked storage) — the quiz must work without it.
export const store = {
    get(key: string): string | null {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key: string, value: string) {
        try {
            localStorage.setItem(key, value);
        } catch {}
    },
};

/**
 * Shows the question's picture in the card's `#q-fig` (or hides it for text questions).
 * `onShown` runs once the image is on screen, so answer timing doesn't count the download.
 */
export function showPicture(q: Question, onShown: () => void = () => {}) {
    const fig = document.getElementById("q-fig")!;
    const img = fig.querySelector("img")!;
    const credit = fig.querySelector("a")!;
    document.getElementById("q-text")!.classList.toggle("has-pic", !!q.image);
    fig.hidden = !q.image;
    if (!q.image) return;
    fig.dataset.kind = q.category;
    credit.textContent = q.credit ? `📷 ${q.credit}` : "";
    credit.href = q.creditUrl || "#";
    credit.hidden = !q.credit;
    img.onload = img.onerror = () => onShown();
    img.src = q.image;
    if (img.complete) onShown();
}

/**
 * Paths of the question pictures the service worker has saved (see public/sw.js), for skipping
 * picture questions that couldn't be shown offline; empty when nothing can be checked.
 */
export async function savedPictures(): Promise<Set<string>> {
    try {
        const c = await caches.open("pics-v1");
        return new Set((await c.keys()).map((r) => new URL(r.url).pathname));
    } catch {
        return new Set();
    }
}

/** Shows a true-or-false question's claim under the question (or hides the line). */
export function showClaim(q: Question) {
    const claim = document.getElementById("q-claim")!;
    claim.textContent = q.claim ? s.quoted(q.claim) : "";
    claim.hidden = !q.claim;
}

/**
 * Fills `opts` with the question's option buttons, or for a guess-the-year question with a year
 * picker that calls `onYear` with the guess once confirmed.
 */
export function renderAnswers(q: Question, opts: HTMLElement, onYear: (guess: number) => void) {
    opts.classList.toggle("opts-year", !!q.year);
    if (q.year) return opts.replaceChildren(yearPicker(q.year, onYear));
    opts.replaceChildren(
        ...q.options.map((text, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "opt";
            b.dataset.i = String(i);
            b.textContent = text;
            return b;
        }),
    );
}

function yearPicker({ min, max, tolerance }: NonNullable<Question["year"]>, onYear: (guess: number) => void): HTMLElement {
    const box = document.createElement("div");
    box.className = "yp";
    box.innerHTML = `
        <output class="yp-val"></output>
        <div class="yp-row" dir="ltr">
            <button type="button" class="yp-step" data-d="-10">−${s.n(10)}</button>
            <button type="button" class="yp-step" data-d="-1">−${s.n(1)}</button>
            <input type="range" class="yp-range" aria-label="${s.yearLabel}" />
            <button type="button" class="yp-step" data-d="1">+${s.n(1)}</button>
            <button type="button" class="yp-step" data-d="10">+${s.n(10)}</button>
        </div>
        <button type="button" class="next yp-go">${s.confirm}</button>
        <p class="yp-note"></p>`;
    const val = box.querySelector("output")!;
    const range = box.querySelector("input")!;
    const go = box.querySelector<HTMLButtonElement>(".yp-go")!;
    box.querySelector(".yp-note")!.textContent = s.tolerance(tolerance);
    range.min = String(min);
    range.max = String(max);
    range.value = String(Math.round((min + max) / 20) * 10);
    const show = () => (val.textContent = s.year(Number(range.value)));
    show();
    const submit = () => {
        if (go.disabled) return;
        box.querySelectorAll("button, input").forEach((c) => ((c as HTMLButtonElement).disabled = true));
        onYear(Number(range.value));
    };
    range.addEventListener("input", show);
    box.addEventListener("click", (e) => {
        const step = (e.target as HTMLElement).closest<HTMLButtonElement>(".yp-step");
        if (step) {
            range.value = String(Number(range.value) + Number(step.dataset.d));
            show();
        } else if ((e.target as HTMLElement).closest(".yp-go")) submit();
    });
    // Enter confirms; kept from the page's own Enter handler, which would jump straight past the result.
    box.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        e.stopPropagation();
        submit();
    });
    return box;
}

/** Marks the year picker with how the guess went. */
export function settleYear(opts: HTMLElement, ok: boolean) {
    opts.querySelector(".yp-val")?.classList.add(ok ? "right" : "wrong");
}

/** Answers before the install banner may show (see Layout.astro), so it never greets a first-time visitor. */
export function countAnswer() {
    store.set("quiz.answered", String((Number(store.get("quiz.answered")) || 0) + 1));
    dispatchEvent(new Event("quiz:answered"));
}

/** Digits as this language writes them. */
export const num = s.n;

/** Crowd numbers are hidden until a question has enough answers to mean something. */
const MIN_ANSWERS = 10;

export interface Crowd {
    n: number;
    ok: number;
}

/** Records the answer and resolves to the question's totals, or null when stats are unavailable. */
export async function recordAnswer(id: string, ok: boolean): Promise<Crowd | null> {
    try {
        const res = await fetch("/api/answer", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: statId(id), ok }),
        });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

/** Percent correct for every question with enough answers, for the deck's difficulty; empty when unavailable. */
export async function fetchRates(): Promise<Map<string, number>> {
    try {
        const res = await fetch("/api/answer");
        if (!res.ok) return new Map();
        // Keep this language's counts, keyed by plain question id.
        const own = Object.entries((await res.json()) as Record<string, number>).flatMap(([id, pct]) => {
            const sep = id.indexOf(":");
            const idLang = sep < 0 ? DEFAULT_LANG : id.slice(0, sep);
            return idLang === lang ? [[id.slice(sep + 1), pct] as const] : [];
        });
        return new Map(own);
    } catch {
        return new Map();
    }
}

/** Flags the question as wrong or unclear; resolves to whether the flag was stored. */
export async function reportQuestion(id: string): Promise<boolean> {
    try {
        const res = await fetch("/api/report", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: statId(id) }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Percentage of players who got it right, once enough people have answered. */
export function crowdPercent(c: Crowd | null): number | null {
    return c && c.n >= MIN_ANSWERS ? Math.round((100 * c.ok) / c.n) : null;
}

export function crowdLine(c: Crowd | null): string {
    const pct = crowdPercent(c);
    return pct === null ? "" : s.crowd(pct);
}

/** Opens the native share sheet (WhatsApp etc. on phones), else copies the text. Resolves to what happened. */
export async function share(text: string, url: string): Promise<"shared" | "copied" | "failed"> {
    if (navigator.share) {
        try {
            await navigator.share({ text, url });
            return "shared";
        } catch (e) {
            if ((e as DOMException).name === "AbortError") return "failed";
        }
    }
    try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        return "copied";
    } catch {
        return "failed";
    }
}

/** Brief confirmation bubble, e.g. after copying a share link. */
export function toast(message: string) {
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = message;
    document.body.append(t);
    setTimeout(() => t.remove(), 2200);
}

export async function shareWithFeedback(text: string, url: string) {
    if ((await share(text, url)) === "copied") toast(s.copied);
}

/** A short buzz for a right answer, a double one for a wrong one (phones that support it). */
export function haptic(ok: boolean) {
    navigator.vibrate?.(ok ? 15 : [40, 60, 40]);
}

let wakeLock: WakeLockSentinel | null = null;
let wakeTimer: number | undefined;
/** Keeps the screen on while someone is playing; lets it sleep after 90 s without an answer. */
export function keepAwake() {
    clearTimeout(wakeTimer);
    wakeTimer = window.setTimeout(() => wakeLock?.release().catch(() => {}), 90_000);
    if (wakeLock && !wakeLock.released) return;
    navigator.wakeLock
        ?.request("screen")
        .then((l) => (wakeLock = l))
        .catch(() => {});
}

/** Questions answered wrong and not answered right since, newest last, for "practice mistakes". */
const MISSED_KEY = "quiz.missed";
const MISSED_MAX = 200;
export function missedIds(): string[] {
    try {
        const ids = JSON.parse(store.get(MISSED_KEY) ?? "[]");
        return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
    } catch {
        return [];
    }
}
/** Adds a question to the missed list on a wrong answer, or takes it off on a right one. */
export function markMissed(id: string, ok: boolean) {
    const ids = missedIds().filter((x) => x !== id);
    if (!ok) ids.push(id);
    store.set(MISSED_KEY, JSON.stringify(ids.slice(-MISSED_MAX)));
}

/** Where this language's daily challenge progress is saved (Arabic keeps the original key). */
export const DAILY_KEY = lang === DEFAULT_LANG ? "daily" : `daily.${lang}`;

/** The daily challenge streak: its length, and whether today's challenge is done yet. */
export function dailyStatus(): { streak: number; doneToday: boolean } {
    const today = dayKey();
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const last = store.get(`${DAILY_KEY}.last`);
    const doneToday = last === today;
    const alive = doneToday || last === dayKey(d);
    return { streak: alive ? Number(store.get(`${DAILY_KEY}.streak`)) || 0 : 0, doneToday };
}

/**
 * A dot on the installed app's icon while today's challenge is unplayed, and the same for the service
 * worker, which re-checks in the background (see public/sw.js) so the dot appears on a new day too.
 */
export function syncBadge() {
    const { doneToday } = dailyStatus();
    if (doneToday) navigator.clearAppBadge?.().catch(() => {});
    else navigator.setAppBadge?.(1).catch(() => {});
    navigator.serviceWorker?.controller?.postMessage({ type: "daily", lang, done: doneToday ? dayKey() : store.get(`${DAILY_KEY}.last`) });
}

/** Lets the install banner pick a good moment (a streak, a finished challenge); see Layout.astro. */
export function proudMoment() {
    dispatchEvent(new Event("quiz:moment"));
}

export interface Card {
    /** small line on top, e.g. the challenge's name */
    kicker: string;
    /** the score or streak, very large */
    big: string;
    /** what the big number means */
    sub: string;
    /** an emoji grid or a dare, under it */
    foot?: string;
}

/** Draws a 1080×1350 score card in the site's colours; null when the browser can't. */
async function drawCard(card: Card): Promise<File | null> {
    try {
        await Promise.all([document.fonts.load("120px ROM-Bold"), document.fonts.load("40px ROM-Regular")]);
        const W = 1080, H = 1350;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const g = c.getContext("2d")!;
        g.fillStyle = "#000";
        g.fillRect(0, 0, W, H);
        const glow = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.7);
        glow.addColorStop(0, "rgba(255,140,0,0.22)");
        glow.addColorStop(1, "rgba(255,140,0,0)");
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
        g.direction = s.dir as CanvasDirection;
        g.textAlign = "center";
        g.textBaseline = "middle";
        const fit = (text: string, font: (px: number) => string, px: number, max = W - 140) => {
            g.font = font(px);
            while (px > 20 && g.measureText(text).width > max) g.font = font((px -= 4));
        };
        g.fillStyle = "#bbb";
        fit(card.kicker, (px) => `${px}px ROM-Regular`, 52);
        g.fillText(card.kicker, W / 2, 230);
        const orange = g.createLinearGradient(0, 380, 0, 700);
        orange.addColorStop(0, "#FFB347");
        orange.addColorStop(1, "#FF8C00");
        g.fillStyle = orange;
        fit(card.big, (px) => `${px}px ROM-Bold`, 300);
        g.fillText(card.big, W / 2, 540);
        g.fillStyle = "#fff";
        fit(card.sub, (px) => `${px}px ROM-Bold`, 60);
        g.fillText(card.sub, W / 2, 770);
        if (card.foot) {
            fit(card.foot, (px) => `${px}px ROM-Regular`, 64);
            g.fillText(card.foot, W / 2, 900);
        }
        g.fillStyle = "#FF8C00";
        g.fillRect(W / 2 - 60, 1110, 120, 6);
        g.fillStyle = "#fff";
        fit(s.siteName, (px) => `${px}px ROM-Bold`, 56);
        g.fillText(s.siteName, W / 2, 1190);
        g.fillStyle = "#888";
        g.font = "36px ROM-Regular";
        g.direction = "ltr";
        g.fillText(SITE.replace("https://", ""), W / 2, 1250);
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
        return blob && new File([blob], "elhellal-quiz.png", { type: "image/png" });
    } catch {
        return null;
    }
}

/** Shares a score card picture with the text (phones that can share files), else falls back to sharing text. */
export async function shareCard(card: Card, text: string, url: string) {
    const file = "canShare" in navigator ? await drawCard(card) : null;
    if (file && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], text: `${text}\n${url}` });
            return;
        } catch (e) {
            if ((e as DOMException).name === "AbortError") return;
        }
    }
    await shareWithFeedback(text, url);
}
