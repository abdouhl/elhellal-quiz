// Browser-only helpers shared by the endless quiz and the daily challenge.
import { DEFAULT_LANG, base, t } from "../i18n";
import type { Lang } from "../i18n";
import { dayKey } from "./engine";
import type { Question } from "./engine";
import { matchBox, numpadBox, searchBox, showExtra, sortBox, tapAllBox, tilesBox } from "./widgets";
import type { Done } from "./widgets";

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
    delete fig.dataset.effect;
    if (!q.image) return;
    fig.dataset.kind = q.image.includes("/flag/") ? "flag" : q.image.includes("/face/") ? "face" : q.category;
    credit.textContent = q.credit ? `📷 ${q.credit}` : "";
    credit.href = q.creditUrl || "#";
    credit.hidden = !q.credit;
    let shown = false;
    const show = () => {
        if (shown) return;
        shown = true;
        // A blurred or zoomed picture starts clearing up only once it is on screen.
        if (q.effect) {
            fig.style.setProperty("--fx-x", `${q.effect.x}%`);
            fig.style.setProperty("--fx-y", `${q.effect.y}%`);
            fig.dataset.effect = q.effect.kind;
        }
        onShown();
    };
    img.onload = img.onerror = show;
    img.src = q.image;
    if (img.complete) show();
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

export type { Done } from "./widgets";

/**
 * Fills `opts` with the question's option buttons; for a guess-the-year question with a year picker that
 * calls `onYear` with the guess once confirmed; for put-in-order and type-the-answer questions with their
 * own controls, which call `onDone` with the result.
 */
export function renderAnswers(q: Question, opts: HTMLElement, onYear: (guess: number) => void, onDone: Done = () => {}) {
    showExtra(q);
    opts.classList.toggle("opts-year", !!q.year);
    opts.classList.toggle("opts-box", !q.year && !q.options.length);
    opts.classList.toggle("opts-pics", !!q.optionImages);
    if (q.year) return opts.replaceChildren(yearPicker(q.year, onYear));
    if (q.order) return opts.replaceChildren(orderPicker(q.order, onDone));
    if (q.typed) return opts.replaceChildren(typedBox(q.typed, onDone));
    if (q.tiles) return opts.replaceChildren(tilesBox(q.tiles, onDone));
    if (q.numpad) return opts.replaceChildren(numpadBox(q.numpad, onDone));
    if (q.match) return opts.replaceChildren(matchBox(q.match, onDone));
    if (q.sort) return opts.replaceChildren(sortBox(q.sort, onDone));
    if (q.tapall) return opts.replaceChildren(tapAllBox(q.tapall, onDone));
    if (q.search) return opts.replaceChildren(searchBox(q.search, onDone));
    opts.replaceChildren(
        ...q.options.map((text, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "opt";
            b.dataset.i = String(i);
            if (q.optionImages) {
                // The name would give the answer away: only the picture, labelled by its number.
                const img = document.createElement("img");
                img.src = q.optionImages[i];
                img.alt = "";
                img.decoding = "async";
                b.append(img);
                b.setAttribute("aria-label", s.n(i + 1));
            } else b.textContent = text;
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

/**
 * Put in order: the player taps the items first to last (each tap numbers one; tapping a numbered one takes it
 * and those after it back), the last one places itself, and "confirm" checks. The items then line up in the
 * right order, each marked by whether the player had it there, with its year.
 */
function orderPicker({ items, solution, labels, hint }: NonNullable<Question["order"]>, onDone: Done): HTMLElement {
    const box = document.createElement("div");
    box.className = "ord";
    box.innerHTML = `
        <p class="ord-hint"></p>
        <div class="ord-list"></div>
        <div class="ord-row">
            <button type="button" class="brag ord-reset" disabled></button>
            <button type="button" class="next ord-go" disabled>${s.confirm}</button>
        </div>`;
    box.querySelector(".ord-hint")!.textContent = hint ?? s.orderHint;
    const list = box.querySelector<HTMLElement>(".ord-list")!;
    const reset = box.querySelector<HTMLButtonElement>(".ord-reset")!;
    const go = box.querySelector<HTMLButtonElement>(".ord-go")!;
    reset.textContent = s.orderReset;
    const picked: number[] = [];
    let done = false;
    const buttons = items.map((text, k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ord-item";
        b.innerHTML = `<span class="ord-n" aria-hidden="true"></span><span class="ord-t"></span><small class="ord-y"></small>`;
        b.querySelector(".ord-t")!.textContent = text;
        b.addEventListener("click", () => {
            if (done) return;
            const at = picked.indexOf(k);
            if (at >= 0) picked.splice(at);
            else {
                picked.push(k);
                // One left: it can only go last.
                if (picked.length === items.length - 1) picked.push(items.findIndex((_, j) => !picked.includes(j)));
            }
            paint();
        });
        return b;
    });
    function paint() {
        buttons.forEach((b, k) => {
            const at = picked.indexOf(k);
            b.classList.toggle("picked", at >= 0);
            b.querySelector(".ord-n")!.textContent = at >= 0 ? s.n(at + 1) : "";
            b.setAttribute("aria-pressed", String(at >= 0));
        });
        go.disabled = picked.length !== items.length;
        reset.disabled = picked.length === 0;
        if (!go.disabled) go.focus();
    }
    list.replaceChildren(...buttons);
    reset.addEventListener("click", () => {
        picked.length = 0;
        paint();
    });
    go.addEventListener("click", () => {
        if (done || picked.length !== items.length) return;
        done = true;
        const right = picked.filter((k, pos) => k === solution[pos]).length;
        // The right order, each item marked by whether the player put it in its place.
        list.replaceChildren(
            ...solution.map((k, pos) => {
                const b = buttons[k];
                b.disabled = true;
                b.classList.remove("picked");
                b.classList.add(picked[pos] === k ? "right" : "wrong");
                b.querySelector(".ord-n")!.textContent = s.n(pos + 1);
                b.querySelector(".ord-y")!.textContent = labels[k];
                return b;
            }),
        );
        reset.hidden = go.hidden = true;
        box.querySelector(".ord-hint")!.textContent = "";
        onDone(right === items.length, right === items.length ? "" : s.orderDone(right, items.length));
    });
    return box;
}

/** Lowercase letters and digits only: no marks or hamzas, one alef/ya/ha, no articles ("ال", the, el…). */
export function normalizeAnswer(text: string): string {
    return text
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/[ىئ]/g, "ي")
        .replace(/ؤ/g, "و")
        .replace(/ـ/g, "")
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w && !ARTICLES.has(w))
        .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w))
        .join("");
}
const ARTICLES = new Set(["the", "a", "an", "el", "la", "los", "las", "of", "de", "del"]);

/** Edit distance, stopping early once it passes `max`. */
function distance(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        let low = i;
        for (let j = 1; j <= b.length; j++) {
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            low = Math.min(low, row[j]);
        }
        if (low > max) return max + 1;
        prev = row;
    }
    return prev[b.length];
}

/** Whether a typed answer matches one of the accepted spellings, allowing a typo or two in longer words. */
export function answerMatches(input: string, accepted: string[]): boolean {
    const got = normalizeAnswer(input);
    if (!got) return false;
    return accepted.some((a) => {
        const want = normalizeAnswer(a);
        const slack = want.length >= 9 ? 2 : want.length >= 4 ? 1 : 0;
        return distance(got, want, slack) <= slack;
    });
}

/**
 * Type the answer: one box per letter of the answer as a hint (words spaced apart), a text field, "confirm"
 * (or Enter), and "I don't know". Spelling is forgiving: see answerMatches.
 */
function typedBox({ answer, accepted }: NonNullable<Question["typed"]>, onDone: Done): HTMLElement {
    const box = document.createElement("div");
    box.className = "ty";
    box.innerHTML = `
        <div class="ty-slots" role="img"></div>
        <form class="ty-form">
            <input class="ty-in" type="text" dir="auto" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" />
            <button type="submit" class="next ty-go">${s.confirm}</button>
        </form>
        <button type="button" class="brag ty-skip"></button>`;
    const slots = box.querySelector<HTMLElement>(".ty-slots")!;
    const input = box.querySelector<HTMLInputElement>(".ty-in")!;
    const skip = box.querySelector<HTMLButtonElement>(".ty-skip")!;
    input.placeholder = s.typedPlaceholder;
    input.setAttribute("aria-label", s.typedPlaceholder);
    skip.textContent = s.typedGiveUp;
    // The hint counts the letters of the shortest accepted spelling (without "river", parentheses…).
    const hint = accepted.reduce((a, b) => (b.length < a.length ? b : a), answer);
    const words = hint.split(/\s+/).map((w) => [...w.normalize("NFKD").replace(/\p{M}/gu, "")].filter((c) => /[\p{L}\p{N}]/u.test(c)).length).filter(Boolean);
    const total = words.reduce((a, b) => a + b, 0);
    slots.setAttribute("aria-label", `${s.typedLetters}: ${s.n(total)}`);
    slots.replaceChildren(
        ...words.map((n) => {
            const w = document.createElement("span");
            w.className = "ty-word";
            w.append(...Array.from({ length: n }, () => document.createElement("i")));
            return w;
        }),
    );
    const cells = [...slots.querySelectorAll("i")];
    input.addEventListener("input", () => {
        const n = [...input.value.replace(/\s+/g, "")].length;
        cells.forEach((c, i) => c.classList.toggle("on", i < n));
    });
    let done = false;
    const finish = (ok: boolean) => {
        done = true;
        input.disabled = true;
        box.querySelectorAll("button").forEach((b) => (b.disabled = true));
        box.classList.add(ok ? "right" : "wrong");
        input.blur();
        onDone(ok);
    };
    box.querySelector("form")!.addEventListener("submit", (e) => {
        e.preventDefault();
        if (done) return;
        if (!input.value.trim()) return void input.focus();
        finish(answerMatches(input.value, accepted));
    });
    skip.addEventListener("click", () => !done && finish(false));
    // Keys typed here are the answer, not the page's shortcuts (1–4 to answer, Enter or space to go on).
    input.addEventListener("keydown", (e) => e.stopPropagation());
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    return box;
}

/** Shows a blurred or zoomed picture in full, once its question is answered. */
export function clearEffect() {
    delete document.getElementById("q-fig")?.dataset.effect;
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

/** A day key `n` days before today. */
const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return dayKey(d);
};

/**
 * A daily streak of 3+ broken by exactly one missed day (last played the day before yesterday) can be
 * won back by watching a rewarded ad, as in the iOS app. Its length, or 0 when there is none.
 */
export function restorableDailyStreak(): number {
    const old = Number(store.get(`${DAILY_KEY}.streak`)) || 0;
    return store.get(`${DAILY_KEY}.last`) === daysAgo(2) && old >= 3 ? old : 0;
}

/** Covers the missed day, so today's challenge carries the streak on. */
export function restoreDailyStreak() {
    if (!restorableDailyStreak()) return;
    store.set(`${DAILY_KEY}.last`, daysAgo(1));
    syncBadge();
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
