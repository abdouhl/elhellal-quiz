// Browser-only helpers shared by the endless quiz and the daily challenge.
import type { Question } from "./engine";

export const SITE = "https://quiz.elhellal.com";

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

/** Shows a true-or-false question's claim under the question (or hides the line). */
export function showClaim(q: Question) {
    const claim = document.getElementById("q-claim")!;
    claim.textContent = q.claim ? `«${q.claim}»` : "";
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
            <button type="button" class="yp-step" data-d="-10">−١٠</button>
            <button type="button" class="yp-step" data-d="-1">−١</button>
            <input type="range" class="yp-range" aria-label="السنة" />
            <button type="button" class="yp-step" data-d="1">+١</button>
            <button type="button" class="yp-step" data-d="10">+١٠</button>
        </div>
        <button type="button" class="next yp-go">تأكيد</button>
        <p class="yp-note"></p>`;
    const val = box.querySelector("output")!;
    const range = box.querySelector("input")!;
    const go = box.querySelector<HTMLButtonElement>(".yp-go")!;
    box.querySelector(".yp-note")!.textContent = `يُقبل فرق حتى ${ar(tolerance)} سنوات`;
    range.min = String(min);
    range.max = String(max);
    range.value = String(Math.round((min + max) / 20) * 10);
    const show = () => (val.textContent = `${ar(Number(range.value))}م`);
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

export const ar = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

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
            body: JSON.stringify({ id, ok }),
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
        return res.ok ? new Map(Object.entries((await res.json()) as Record<string, number>)) : new Map();
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
            body: JSON.stringify({ id }),
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
    return pct === null ? "" : `${ar(pct)}٪ من اللاعبين أجابوا بشكل صحيح`;
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
    if ((await share(text, url)) === "copied") toast("تم نسخ الرابط — الصقه لأصدقائك");
}
