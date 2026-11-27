// Generators for the play-only question kinds that are made rather than written: letters of an answer for
// the letter tiles and word search, word search grids, and number puzzles (answered on a number pad). Pure and seeded: the same seed
// gives the same puzzle on the server and in the browser.
import type { Strings } from "../i18n";

/** Arabic short vowels, shadda, sukun, superscript alef and tatweel: dropped from letters. */
const ARABIC_MARKS = /[ً-ٰٟـ]/g;

/**
 * The letters of one word as tiles show them: Arabic as written (hamza forms kept, vowel marks dropped),
 * Latin uppercased without accents (except Ñ).
 */
export function letters(word: string): string[] {
    return [...word.normalize("NFC").replace(ARABIC_MARKS, "")]
        .map((c) => (/[؀-ۿ]/.test(c) ? c : /ñ/i.test(c) ? "Ñ" : c.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase()))
        .filter((c) => /\p{L}/u.test(c));
}

/** The answer's words as letters, or null when it has anything but letters and spaces (digits, brackets…). */
export function wordLetters(answer: string, minLetters: number, maxLetters: number, maxWords: number): string[][] | null {
    const text = answer.trim();
    if (!/^[\p{L}\p{M}\s]+$/u.test(text)) return null;
    const words = text.split(/\s+/).map(letters);
    const n = words.reduce((a, w) => a + w.length, 0);
    return words.length <= maxWords && n >= minLetters && n <= maxLetters && words.every((w) => w.length > 0) ? words : null;
}

/** `n` random letters from `alphabet`. */
export const randomLetters = (alphabet: string, n: number, rand: () => number) => {
    const all = [...alphabet];
    return Array.from({ length: n }, () => all[Math.floor(rand() * all.length)]);
};

/**
 * A `size`×`size` word search holding every word (as letters) on a straight line in a reading direction,
 * the rest filled with random letters. Cells are row-major indexes; null when the words don't fit.
 */
export function wordSearch(words: string[][], size: number, rtl: boolean, alphabet: string, rand: () => number): { grid: string[]; cells: number[][] } | null {
    // Across in reading order, down, and the two diagonals going down.
    const dirs: [number, number][] = rtl ? [[0, -1], [1, 0], [1, -1], [1, 1]] : [[0, 1], [1, 0], [1, 1], [1, -1]];
    const grid: (string | null)[] = Array(size * size).fill(null);
    const cells: number[][] = [];
    // Longest first, so the short ones fill in around them.
    const order = words.map((_, i) => i).sort((a, b) => words[b].length - words[a].length);
    const placed: number[][] = [];
    for (const wi of order) {
        const word = words[wi];
        let spot: number[] | null = null;
        for (let tries = 0; tries < 200 && !spot; tries++) {
            const [dr, dc] = dirs[Math.floor(rand() * dirs.length)];
            const r = Math.floor(rand() * size);
            const c = Math.floor(rand() * size);
            const endR = r + dr * (word.length - 1);
            const endC = c + dc * (word.length - 1);
            if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
            const line = word.map((_, k) => (r + dr * k) * size + (c + dc * k));
            if (line.every((cell, k) => grid[cell] === null || grid[cell] === word[k])) spot = line;
        }
        if (!spot) return null;
        spot.forEach((cell, k) => (grid[cell] = word[k]));
        placed[wi] = spot;
    }
    for (let i = 0; i < words.length; i++) cells.push(placed[i]);
    const fill = randomLetters(alphabet, size * size, rand);
    return { grid: grid.map((x, i) => x ?? fill[i]), cells };
}

export type MathKind = "calc" | "seq" | "missing" | "symbols";
export interface MathPuzzle {
    kind: MathKind;
    lines: string[];
    answer: number;
}

const int = (rand: () => number, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const SYMBOLS = ["🍎", "🍌", "🍇", "🍊", "🍓", "🍉", "🥝", "🍒", "⭐", "🌙", "☀️", "🔺"];

/** Number puzzle `i`: the five kinds take turns, the numbers come from the seed. */
export function mathPuzzle(i: number, s: Strings, rand: () => number): MathPuzzle {
    const n = s.n;
    const q = s.qMark;
    switch (i % 5) {
        case 0: {
            // Two unknowns from their sum and difference.
            const [x, y] = s.mathVars;
            const b = int(rand, 2, 9);
            const k = int(rand, 2, 9);
            const a = b * k;
            const times = rand() < 0.5;
            return {
                kind: "symbols",
                lines: [`${x} + ${y} = ${n(a + b)}`, `${x} − ${y} = ${n(a - b)}`, times ? `${x} × ${y} = ${q}` : `${x} ÷ ${y} = ${q}`],
                answer: times ? a * b : k,
            };
        }
        case 1: {
            const kind = int(rand, 0, 4);
            let terms: number[];
            if (kind === 0) {
                const start = int(rand, 1, 30);
                const step = int(rand, 2, 15);
                terms = Array.from({ length: 6 }, (_, k) => start + step * k);
            } else if (kind === 1) {
                const start = int(rand, 1, 5);
                const ratio = int(rand, 2, 3);
                terms = Array.from({ length: 6 }, (_, k) => start * ratio ** k);
            } else if (kind === 2) {
                const from = int(rand, 1, 8);
                terms = Array.from({ length: 6 }, (_, k) => (from + k) ** 2);
            } else if (kind === 3) {
                // Growing steps: +1, +2, +3…
                const start = int(rand, 1, 20);
                const first = int(rand, 1, 4);
                terms = [start];
                for (let k = 0; k < 5; k++) terms.push(terms[k] + first + k);
            } else {
                // Each the sum of the two before.
                terms = [int(rand, 1, 5), int(rand, 2, 7)];
                while (terms.length < 6) terms.push(terms.at(-1)! + terms.at(-2)!);
            }
            return { kind: "seq", lines: [[...terms.slice(0, 5).map(n), q].join(s.listSep)], answer: terms[5] };
        }
        case 2: {
            // One number missing from an operation.
            const op = int(rand, 0, 3);
            if (op === 0) {
                const a = int(rand, 3, 12);
                const b = int(rand, 3, 12);
                return { kind: "missing", lines: [`${n(a)} × ${q} = ${n(a * b)}`], answer: b };
            }
            if (op === 1) {
                const a = int(rand, 11, 60);
                const b = int(rand, 11, 60);
                return { kind: "missing", lines: [`${q} + ${n(a)} = ${n(a + b)}`], answer: b };
            }
            if (op === 2) {
                const b = int(rand, 3, 12);
                const k = int(rand, 3, 12);
                return { kind: "missing", lines: [`${n(b * k)} ÷ ${q} = ${n(k)}`], answer: b };
            }
            const a = int(rand, 11, 60);
            const b = int(rand, 11, 60);
            return { kind: "missing", lines: [`${q} − ${n(a)} = ${n(b)}`], answer: a + b };
        }
        case 3: {
            // Picture equations: two symbols, then a combination of them.
            const [e1, e2] = [...SYMBOLS].sort(() => rand() - 0.5).slice(0, 2);
            const x = int(rand, 2, 9);
            let y = int(rand, 1, 9);
            if (y === x) y = x + 1;
            const last = int(rand, 0, 2);
            const lines = [`${e1} + ${e1} = ${n(2 * x)}`, `${e1} + ${e2} = ${n(x + y)}`];
            if (last === 0) return { kind: "symbols", lines: [...lines, `${e2} × ${e1} = ${q}`], answer: x * y };
            if (last === 1 && x * x > y) return { kind: "symbols", lines: [...lines, `${e1} × ${e1} − ${e2} = ${q}`], answer: x * x - y };
            return { kind: "symbols", lines: [...lines, `${e2} + ${e2} × ${e1} = ${q}`], answer: y + y * x };
        }
        default: {
            // Order of operations, with the left-to-right reading as the trap.
            const a = int(rand, 2, 20);
            const b = int(rand, 2, 9);
            const c = int(rand, 2, 9);
            if (rand() < 0.5) return { kind: "calc", lines: [`${n(a)} + ${n(b)} × ${n(c)} = ${q}`], answer: a + b * c };
            const d = int(rand, 2, 5);
            return { kind: "calc", lines: [`${n(a * d)} ÷ ${n(d)} + ${n(b)} × ${n(c)} = ${q}`], answer: a + b * c };
        }
    }
}
