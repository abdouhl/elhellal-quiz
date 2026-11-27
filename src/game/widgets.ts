// The controls of the interactive play-only kinds (letter tiles, match pairs, sort, tap all, word search) and
// the extra lines some questions show under their text (missing letters, number puzzles). Each control calls
// `onDone` once with the result, as the put-in-order and type-the-answer controls in client.ts do.
import { DEFAULT_LANG, t } from "../i18n";
import type { Lang } from "../i18n";
import type { Question } from "./engine";

const s = t((document.documentElement.lang || DEFAULT_LANG) as Lang);

/** Called once an interactive question is answered; `note` adds to the feedback. */
export type Done = (ok: boolean, note?: string) => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ""): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = cls;
    if (text) node.textContent = text;
    return node;
}

function button(cls: string, text = ""): HTMLButtonElement {
    const b = el("button", cls, text);
    b.type = "button";
    return b;
}

function img(src: string): HTMLImageElement {
    const i = el("img", "");
    i.src = src;
    i.alt = "";
    i.decoding = "async";
    i.draggable = false;
    return i;
}

/** Restarts a CSS animation class on `node`. */
function replay(node: HTMLElement, cls: string) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
}

/** The line under the question: the word with its missing letters, or a number puzzle (or nothing). */
export function showExtra(q: Question) {
    const box = document.getElementById("q-extra");
    if (!box) return;
    box.hidden = !q.masked && !q.puzzle;
    box.className = q.puzzle ? "q-extra q-puzzle" : "q-extra q-masked";
    if (q.puzzle) {
        box.dir = "ltr";
        box.replaceChildren(...q.puzzle.map((line) => el("span", "", line)));
    } else if (q.masked) {
        box.dir = "";
        box.replaceChildren(...q.masked.map((c) => el("i", c === null ? "blank" : "", c ?? "?")));
    } else box.replaceChildren();
}

/**
 * Letter tiles: tap tiles to fill the answer's slots in reading order, tap a filled slot to give its tile back.
 * Once every slot is filled the word is checked; a first wrong spelling gets a second try.
 */
export function tilesBox({ answer, words, letters }: NonNullable<Question["tiles"]>, onDone: Done): HTMLElement {
    const box = el("div", "tl");
    const slotsRow = el("div", "tl-slots");
    const tray = el("div", "tl-tray");
    const giveUp = button("brag tl-skip", s.typedGiveUp);
    box.append(slotsRow, tray, giveUp);
    /** Which tile fills each slot. */
    const filled: (number | null)[] = answer.map(() => null);
    const slots: HTMLButtonElement[] = [];
    let at = 0;
    for (const n of words) {
        const word = el("span", "tl-word");
        for (let k = 0; k < n; k++, at++) {
            const slot = button("tl-slot");
            const pos = at;
            slot.addEventListener("click", () => {
                if (done || filled[pos] === null) return;
                tiles[filled[pos]!].classList.remove("used");
                filled[pos] = null;
                paint();
            });
            slots.push(slot);
            word.append(slot);
        }
        slotsRow.append(word);
    }
    const tiles = letters.map((c, k) => {
        const b = button("tl-tile", c);
        b.addEventListener("click", () => {
            const free = filled.indexOf(null);
            if (done || free < 0 || b.classList.contains("used")) return;
            filled[free] = k;
            b.classList.add("used");
            paint();
            if (!filled.includes(null)) check();
        });
        return b;
    });
    tray.append(...tiles);
    let done = false;
    let tries = 0;
    function paint() {
        slots.forEach((slot, i) => {
            slot.textContent = filled[i] === null ? "" : letters[filled[i]!];
            slot.classList.toggle("on", filled[i] !== null);
            slot.classList.remove("wrong");
        });
    }
    function finish(ok: boolean) {
        done = true;
        slots.forEach((slot, i) => {
            slot.textContent = answer[i];
            slot.classList.add(ok ? "right" : "wrong");
            slot.disabled = true;
        });
        tiles.forEach((b) => (b.disabled = true));
        giveUp.hidden = true;
        onDone(ok);
    }
    function check() {
        const ok = filled.every((k, i) => letters[k!] === answer[i]);
        if (ok || ++tries >= 2) return finish(ok);
        // One more try: the misplaced letters shake and stay, to be swapped.
        slots.forEach((slot, i) => letters[filled[i]!] !== answer[i] && replay(slot, "wrong"));
        replay(slotsRow, "shake");
    }
    giveUp.addEventListener("click", () => !done && finish(false));
    return box;
}

/**
 * Match pairs: tap an item on one side, then its partner on the other. A right pair locks in green, a wrong one
 * shakes and counts as a mistake. It is right if every pair was found without a mistake.
 */
export function matchBox({ left, right, solution }: NonNullable<Question["match"]>, onDone: Done): HTMLElement {
    const box = el("div", "mt");
    const hint = el("p", "ord-hint", s.matchHint);
    const cols = el("div", "mt-cols");
    const lcol = el("div", "mt-col");
    const rcol = el("div", "mt-col");
    cols.append(lcol, rcol);
    box.append(hint, cols);
    const ls = left.map(({ text, image }) => {
        const b = button(`mt-item${image ? " mt-pic" : ""}`, text);
        if (image) b.append(img(image));
        return b;
    });
    const rs = right.map((text) => button("mt-item", text));
    lcol.append(...ls);
    rcol.append(...rs);
    let pickedL: number | null = null;
    let pickedR: number | null = null;
    let mistakes = 0;
    let matched = 0;
    const select = () => {
        ls.forEach((b, k) => b.classList.toggle("picked", k === pickedL));
        rs.forEach((b, k) => b.classList.toggle("picked", k === pickedR));
    };
    const tryPair = () => {
        if (pickedL === null || pickedR === null) return select();
        const [l, r] = [ls[pickedL], rs[pickedR]];
        if (solution[pickedL] === pickedR) {
            for (const b of [l, r]) {
                b.disabled = true;
                b.classList.add("right");
            }
            matched++;
        } else {
            mistakes++;
            for (const b of [l, r]) replay(b, "wrong");
        }
        pickedL = pickedR = null;
        select();
        if (matched === left.length) {
            hint.textContent = "";
            onDone(mistakes === 0, mistakes ? s.mistakes(mistakes) : "");
        }
    };
    ls.forEach((b, k) => b.addEventListener("click", () => ((pickedL = pickedL === k ? null : k), tryPair())));
    rs.forEach((b, k) => b.addEventListener("click", () => ((pickedR = pickedR === k ? null : k), tryPair())));
    // A wrong pair's shake ends on its own.
    box.addEventListener("animationend", (e) => (e.target as HTMLElement).classList.remove("wrong"));
    return box;
}

/**
 * Sort into two groups, as a card game: one card at a time (a flag, or an event), dropped into one of the two
 * bins by a tap on the bin, a swipe toward it, or ← → / 1 2 on a keyboard. Each card is marked at once: a right
 * one flies into its bin, a wrong one shakes and flies into the right bin, marked red. The bins keep what they
 * got (with the event's year), and the question counts as right only if every card went to its group.
 */
export function sortBox({ items, bins, solution, labels, images }: NonNullable<Question["sort"]>, onDone: Done): HTMLElement {
    const box = el("div", "sg");
    const dots = el("div", "sg-dots");
    dots.setAttribute("aria-hidden", "true");
    const dotEls = items.map(() => dots.appendChild(el("span", "")));
    const stage = el("div", "sg-stage");
    const live = el("p", "sg-live");
    live.setAttribute("aria-live", "polite");
    const binRow = el("div", "sg-bins");
    const tip = el("p", "sg-tip", s.sortTip);
    box.append(dots, stage, binRow, tip, live);

    const counts = [0, 0];
    const binEls = bins.map((label, b) => {
        const bin = button(`sg-bin sg-bin${b}`);
        const head = el("span", "sg-head");
        head.append(el("span", "sg-label", label), el("b", "sg-count", s.n(0)));
        bin.append(head, el("span", "sg-pile"));
        bin.addEventListener("click", () => place(b));
        return bin;
    });
    binRow.append(...binEls);

    let at = 0;
    let right = 0;
    let busy = false;
    let card: HTMLElement | null = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    /** The bin on the left or the right of the screen (bin 0 comes first in reading order). */
    const binOnSide = (side: "left" | "right") => {
        const [a, b] = binEls.map((x) => x.getBoundingClientRect().left);
        return (side === "left") === a < b ? 0 : 1;
    };

    function deal() {
        stage.dataset.left = String(Math.min(items.length - at, 3));
        card = el("div", `sg-card${images ? " sg-flag" : ""}`);
        if (images) card.append(img(images[at]));
        card.append(el("span", "sg-name", items[at]));
        stage.replaceChildren(card);
        dotEls[at].classList.add("now");
        live.textContent = `${s.n(at + 1)}/${s.n(items.length)}: ${items[at]}`;
        drag(card);
    }

    /** Swipe the card toward a bin: past a third of its width it goes there, otherwise it springs back. */
    function drag(c: HTMLElement) {
        let x0 = 0;
        let dx = 0;
        let id: number | null = null;
        const hot = (b: number | null) => binEls.forEach((x, j) => x.classList.toggle("hot", j === b));
        c.addEventListener("pointerdown", (e) => {
            if (busy) return;
            id = e.pointerId;
            x0 = e.clientX;
            dx = 0;
            c.setPointerCapture(id);
            c.classList.add("held");
        });
        c.addEventListener("pointermove", (e) => {
            if (e.pointerId !== id) return;
            dx = e.clientX - x0;
            c.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
            hot(Math.abs(dx) > c.offsetWidth / 3 ? binOnSide(dx < 0 ? "left" : "right") : null);
        });
        const end = (e: PointerEvent) => {
            if (e.pointerId !== id) return;
            id = null;
            c.classList.remove("held");
            hot(null);
            if (Math.abs(dx) > c.offsetWidth / 3) place(binOnSide(dx < 0 ? "left" : "right"));
            else c.style.transform = "";
        };
        c.addEventListener("pointerup", end);
        c.addEventListener("pointercancel", end);
    }

    function flash(node: HTMLElement, cls: string) {
        node.classList.remove(cls);
        void node.offsetWidth;
        node.classList.add(cls);
    }

    /** Sends the card flying into `bin`, shrinking as it goes. */
    function fly(c: HTMLElement, bin: HTMLElement): Promise<unknown> {
        const from = c.getBoundingClientRect();
        const to = bin.getBoundingClientRect();
        const x = to.left + to.width / 2 - (from.left + from.width / 2);
        const y = to.top + to.height / 2 - (from.top + from.height / 2);
        const start = c.style.transform || "none";
        return c.animate([{ transform: start, opacity: 1 }, { transform: `translate(${x}px, ${y}px) scale(0.2) rotate(${x > 0 ? 12 : -12}deg)`, opacity: 0 }], {
            duration: reduced ? 1 : 380,
            easing: "cubic-bezier(0.5, 0, 0.75, 0)",
            fill: "forwards",
        }).finished;
    }

    async function place(b: number) {
        if (busy || at >= items.length || !card) return;
        busy = true;
        const k = at;
        const goal = solution[k];
        const ok = b === goal;
        const c = card;
        if (ok) right++;
        else {
            c.classList.add("bad");
            flash(binEls[b], "nope");
            navigator.vibrate?.(60);
            await new Promise((r) => setTimeout(r, reduced ? 1 : 420));
        }
        await fly(c, binEls[goal]);
        flash(binEls[goal], ok ? "yes" : "took");
        counts[goal]++;
        binEls[goal].querySelector(".sg-count")!.textContent = s.n(counts[goal]);
        const chip = el("span", `sg-chip ${ok ? "ok" : "miss"}`);
        if (images) {
            chip.append(img(images[k]));
            chip.title = items[k];
        } else chip.append(el("span", "sg-chip-t", items[k]));
        if (labels) chip.append(el("small", "", labels[k]));
        binEls[goal].querySelector(".sg-pile")!.append(chip);
        dotEls[k].classList.replace("now", ok ? "hit" : "miss");
        at++;
        busy = false;
        if (at < items.length) return deal();
        stage.dataset.left = "0";
        stage.replaceChildren(el("p", `sg-score ${right === items.length ? "ok" : ""}`, `${s.n(right)}/${s.n(items.length)}`));
        binEls.forEach((x) => (x.disabled = true));
        tip.hidden = true;
        document.removeEventListener("keydown", onKey);
        onDone(right === items.length, right === items.length ? "" : s.orderDone(right, items.length));
    }

    function onKey(e: KeyboardEvent) {
        if (!box.isConnected) return document.removeEventListener("keydown", onKey);
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const b = e.key === "ArrowLeft" ? binOnSide("left") : e.key === "ArrowRight" ? binOnSide("right") : ["1", "١"].includes(e.key) ? 0 : ["2", "٢"].includes(e.key) ? 1 : -1;
        if (b < 0) return;
        e.preventDefault();
        place(b);
    }
    document.addEventListener("keydown", onKey);

    deal();
    return box;
}

/** Tap all that apply: toggle the pictures that belong, then "confirm" marks them and names every one. */
export function tapAllBox({ images, names, solution }: NonNullable<Question["tapall"]>, onDone: Done): HTMLElement {
    const box = el("div", "ta");
    const grid = el("div", "ta-grid");
    const go = button("next ta-go", s.confirm);
    go.disabled = true;
    box.append(grid, go);
    const picked = images.map(() => false);
    const cells = images.map((src, k) => {
        const b = button("ta-cell");
        b.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-label", s.n(k + 1));
        b.append(img(src));
        b.addEventListener("click", () => {
            picked[k] = !picked[k];
            b.classList.toggle("picked", picked[k]);
            b.setAttribute("aria-pressed", String(picked[k]));
            go.disabled = !picked.includes(true);
        });
        return b;
    });
    grid.append(...cells);
    go.addEventListener("click", () => {
        go.hidden = true;
        const wrong = picked.filter((p, k) => p !== solution[k]).length;
        cells.forEach((b, k) => {
            b.disabled = true;
            b.classList.add(picked[k] === solution[k] ? (solution[k] ? "right" : "ok") : solution[k] ? "missed" : "wrong");
            b.append(el("small", "ta-name", names[k]));
        });
        onDone(wrong === 0, wrong ? s.mistakes(wrong) : "");
    });
    return box;
}

/**
 * Word search: the words' pictures on top, the grid below. Drag across a word (or tap its first letter, then its
 * last); a found word stays coloured and its picture is ticked. "I don't know" shows the rest.
 */
export function searchBox({ size, grid, words }: NonNullable<Question["search"]>, onDone: Done): HTMLElement {
    const box = el("div", "ws");
    const clues = el("div", "ws-clues");
    const board = el("div", "ws-grid");
    board.dir = "ltr";
    board.style.setProperty("--n", String(size));
    const hint = el("p", "ord-hint", s.searchHint);
    const giveUp = button("brag ws-skip", s.typedGiveUp);
    box.append(clues, board, hint, giveUp);
    const clueEls = words.map(({ image }) => {
        const c = el("span", "ws-clue");
        c.append(img(image));
        return c;
    });
    clues.append(...clueEls);
    const cells = grid.map((c) => {
        const b = button("ws-cell", c);
        b.tabIndex = -1;
        return b;
    });
    board.append(...cells);
    const found = new Set<number>();
    let start: number | null = null;
    let pressing = false;
    let done = false;

    /** The cells on the straight line from `a` to `b`, or null when they aren't on one. */
    function line(a: number, b: number): number[] | null {
        const [r1, c1, r2, c2] = [Math.floor(a / size), a % size, Math.floor(b / size), b % size];
        const dr = Math.sign(r2 - r1);
        const dc = Math.sign(c2 - c1);
        const len = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
        if ((r1 !== r2 && c1 !== c2 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) || len === 0) return null;
        return Array.from({ length: len + 1 }, (_, k) => (r1 + dr * k) * size + (c1 + dc * k));
    }
    function mark(w: number) {
        found.add(w);
        for (const c of words[w].cells) cells[c].classList.add("found", `ws-c${w}`);
        clueEls[w].classList.add("found");
    }
    function clear() {
        if (start !== null) cells[start].classList.remove("sel");
        start = null;
    }
    function attempt(a: number, b: number) {
        clear();
        const path = line(a, b);
        const key = path?.join(",");
        const back = path && [...path].reverse().join(",");
        const w = words.findIndex((x, k) => !found.has(k) && (x.cells.join(",") === key || x.cells.join(",") === back));
        if (w < 0) return replay(board, "shake");
        mark(w);
        if (found.size === words.length) finish(true);
    }
    function finish(ok: boolean) {
        done = true;
        clear();
        const n = found.size;
        words.forEach((_, w) => !found.has(w) && mark(w));
        cells.forEach((c) => (c.disabled = true));
        giveUp.hidden = true;
        hint.textContent = "";
        onDone(ok, ok ? "" : s.searchFound(n, words.length));
    }
    const cellAt = (x: number, y: number) => {
        const target = document.elementFromPoint(x, y)?.closest<HTMLElement>(".ws-cell");
        return target ? cells.indexOf(target as HTMLButtonElement) : -1;
    };
    board.addEventListener("pointerdown", (e) => {
        if (done) return;
        const k = cellAt(e.clientX, e.clientY);
        if (k < 0) return;
        e.preventDefault();
        if (start === null) {
            start = k;
            cells[k].classList.add("sel");
            pressing = true;
        } else if (k === start) clear();
        else attempt(start, k);
    });
    // Touch captures the pointer to the first cell, so the release still lands on the board.
    board.addEventListener("pointerup", (e) => {
        if (!pressing || done) return;
        pressing = false;
        const k = cellAt(e.clientX, e.clientY);
        if (start !== null && k >= 0 && k !== start) attempt(start, k);
    });
    giveUp.addEventListener("click", () => !done && finish(false));
    return box;
}

/**
 * A calculator-style number pad: the answer's display with a delete key, a hint (the first digit, once), ENTER,
 * and the digits in two rows. The keyboard's digits, Backspace and Enter work too. A first wrong answer gets a
 * second try.
 */
export function numpadBox({ answer }: NonNullable<Question["numpad"]>, onDone: Done): HTMLElement {
    const MAX_DIGITS = 6;
    const box = el("div", "np");
    box.dir = "ltr";
    const top = el("div", "np-top");
    const screen = el("div", "np-screen");
    const value = el("output", "np-val");
    const del = button("np-del", "✕");
    del.setAttribute("aria-label", s.numDelete);
    screen.append(value, del);
    const hint = button("np-hint", "💡");
    hint.setAttribute("aria-label", s.numHint);
    hint.title = s.numHint;
    const enter = button("np-enter", s.numEnter);
    top.append(screen, hint, enter);
    const keys = el("div", "np-keys");
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => {
        const b = button("np-key", s.n(d));
        b.addEventListener("click", () => type(d));
        return b;
    });
    keys.append(...digits);
    box.append(top, keys);

    let typed = "";
    let tries = 0;
    let done = false;
    const paint = () => {
        value.textContent = typed ? s.n(Number(typed)) : s.numAnswer;
        value.classList.toggle("empty", !typed);
    };
    paint();
    function type(d: number) {
        if (done || typed.length >= MAX_DIGITS || (typed === "0")) return;
        typed += String(d);
        paint();
    }
    function back() {
        if (done) return;
        typed = typed.slice(0, -1);
        paint();
    }
    function submit() {
        if (done) return;
        if (!typed) return replay(screen, "shake");
        const ok = Number(typed) === answer;
        if (!ok && ++tries < 2) {
            // One more try: the wrong number shakes away.
            replay(screen, "shake");
            typed = "";
            paint();
            return;
        }
        done = true;
        typed = String(answer);
        paint();
        screen.classList.add(ok ? "right" : "wrong");
        box.querySelectorAll("button").forEach((b) => (b.disabled = true));
        document.removeEventListener("keydown", onKey);
        onDone(ok);
    }
    del.addEventListener("click", back);
    enter.addEventListener("click", submit);
    hint.addEventListener("click", () => {
        if (done) return;
        hint.disabled = true;
        typed = String(answer)[0];
        paint();
    });
    // The keyboard: digits (Western or Arabic-Indic), Backspace and Enter, while this pad is on screen.
    function onKey(e: KeyboardEvent) {
        if (!box.isConnected) return document.removeEventListener("keydown", onKey);
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const d = "0123456789".indexOf(e.key) >= 0 ? Number(e.key) : "٠١٢٣٤٥٦٧٨٩".indexOf(e.key);
        if (d >= 0) type(d);
        else if (e.key === "Backspace") back();
        else if (e.key === "Enter") submit();
        else return;
        e.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return box;
}
