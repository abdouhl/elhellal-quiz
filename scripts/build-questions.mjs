// Builds src/data/generated.json (quote + book questions) from the sibling elhellal repos,
// and validates src/data/bank.json. Run: bun run build-questions
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const quotesPath = process.env.QUOTES_JSON ?? path.join(root, "../elhellal/src/data/quotes.json");
const booksPath = process.env.BOOKS_JSON ?? path.join(root, "../elhellal-books/src/data/books.json");

const norm = (s) => s.replace(/\s+/g, " ").trim();

// --- validate the hand-written bank ---
const bank = JSON.parse(readFileSync(path.join(root, "src/data/bank.json"), "utf8"));
const cats = new Set(["geo", "sci", "hist", "gen", "lit", "lang"]);
const seenQ = new Set();
for (const [i, row] of bank.entries()) {
    const [c, q, a, w] = row;
    const problems = [];
    if (!cats.has(c)) problems.push(`unknown category ${c}`);
    if (!Array.isArray(w) || w.length !== 3) problems.push("needs exactly 3 wrong answers");
    else if (new Set([a, ...w]).size !== 4) problems.push("answers must be 4 distinct values");
    if (seenQ.has(q)) problems.push("duplicate question");
    seenQ.add(q);
    if (problems.length) throw new Error(`bank.json[${i}] "${q}": ${problems.join(", ")}`);
}

// --- authors (shared pool for distractors) ---
const quotesData = JSON.parse(readFileSync(quotesPath, "utf8")).authors;
const booksData = JSON.parse(readFileSync(booksPath, "utf8"));

const authors = [];
const authorIdx = new Map();
const idxOf = (name) => {
    const n = norm(name);
    if (!authorIdx.has(n)) {
        authorIdx.set(n, authors.length);
        authors.push(n);
    }
    return authorIdx.get(n);
};

// --- quotes: top liked, quiz-sized, that don't give the author away ---
const quotes = [];
for (const a of quotesData) {
    const name = norm(a.name);
    idxOf(name);
    const usable = a.quotes
        .map((q) => ({ text: norm(q.text), likes: q.likes ?? 0 }))
        .filter((q) => q.text.length >= 35 && q.text.length <= 200 && !q.text.includes(name))
        .sort((x, y) => y.likes - x.likes)
        .slice(0, 25);
    if (usable.length < 3) continue;
    for (const q of usable) quotes.push([q.text, idxOf(name)]);
}

// --- books ---
const books = [];
const seenTitles = new Set();
for (const b of booksData) {
    const title = norm(b.title);
    if (seenTitles.has(title)) continue;
    seenTitles.add(title);
    books.push([title, idxOf(b.author)]);
}

const out = { authors, quotes, books };
writeFileSync(path.join(root, "src/data/generated.json"), JSON.stringify(out));
console.log(
    `bank: ${bank.length} questions | quotes: ${quotes.length} | books: ${books.length} | authors: ${authors.length}`,
);
