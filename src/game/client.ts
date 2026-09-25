// Browser-only helpers shared by the endless quiz and the daily challenge.

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
