// Safe edits to the question bank and its translations, for the quiz skills (.claude/skills/).
// Question ids are bank indexes (b<i>), so rows are only ever appended, never removed or reordered,
// and src/data/<lang>.json translates bank.json index by index.
//
//   node scripts/quiz-data.mjs stats                      rows per category, translations per language
//   node scripts/quiz-data.mjs find <text>                existing rows whose question/answer contains <text>
//   node scripts/quiz-data.mjs append <file.json>         append new rows (see below), padding every language file
//   node scripts/quiz-data.mjs untranslated <lang> [N]    next N rows (default 50) with no <lang> translation, JSON per line
//   node scripts/quiz-data.mjs translate <lang> <file>    set translations from {"<i>": [question, answer, [3 wrong]], ...}
//   node scripts/quiz-data.mjs skip <lang> <i>...         mark rows as untranslatable into <lang> (too tied to Arabic)
//   node scripts/quiz-data.mjs check [lang]               validate bank.json and every (or one) language file
//
// append file: [{ "cat": "geo", "q": "...", "a": "...", "w": ["...", "...", "..."], "tr": { "en": ["q", "a", ["w1", "w2", "w3"]] } }, ...]
// "tr" is optional per language; languages left out stay untranslated (null).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "src/data");
const skipFile = path.join(root, ".claude/skills/translate-quiz/skipped.json");
const CATS = ["geo", "sci", "hist", "gen", "lit", "lang"];

const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const bankPath = path.join(dataDir, "bank.json");
const langPath = (l) => path.join(dataDir, `${l}.json`);
/** Translation files: src/data/<two-letter code>.json. */
const langs = () => readdirSync(dataDir).filter((f) => /^[a-z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2));
// Same layouts as the files already use: bank.json one row per line, translations minified.
const writeBank = (bank) => writeFileSync(bankPath, `[\n${bank.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
const writeLang = (l, data) => writeFileSync(langPath(l), JSON.stringify(data) + "\n");
const skipped = () => (existsSync(skipFile) ? read(skipFile) : {});

/** For spotting the same question twice: ignores diacritics, tatweel, punctuation and case. */
const norm = (s) => String(s).replace(/[ً-ْـ]/g, "").replace(/[؟?!.,«»"]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Problems with one [question, answer, [3 wrong]] triple. */
function problems(q, a, w) {
    const out = [];
    const s = (v) => (typeof v === "string" ? v.trim() : "");
    if (!s(q)) out.push("empty question");
    if (!s(a)) out.push("empty answer");
    if (!Array.isArray(w) || w.length !== 3 || w.some((x) => !s(x))) out.push("needs exactly 3 non-empty wrong answers");
    // Diacritics count here: «مُستخرِج» and «مُستخرَج» are different answers.
    else if (new Set([s(a), ...w.map(s)].map((x) => x.replace(/\s+/g, " ").toLowerCase())).size !== 4) out.push("the 4 answers must be distinct");
    return out;
}

const fail = (msg) => {
    console.error(msg);
    process.exit(1);
};

const [cmd, ...args] = process.argv.slice(2);
const bank = read(bankPath);

if (cmd === "stats") {
    const cats = {};
    for (const r of bank) if (r) cats[r[0]] = (cats[r[0]] ?? 0) + 1;
    console.log(`bank: ${bank.filter(Boolean).length} rows`, cats);
    const skip = skipped();
    for (const l of langs()) {
        const t = read(langPath(l)).bank;
        const done = bank.filter((r, i) => r && t[i]).length;
        const skips = (skip[l] ?? []).length;
        const byCat = {};
        bank.forEach((r, i) => { if (r && !t[i] && !(skip[l] ?? []).includes(i)) byCat[r[0]] = (byCat[r[0]] ?? 0) + 1; });
        console.log(`${l}: ${done} translated, ${skips} skipped, ${bank.filter(Boolean).length - done - skips} to do`, byCat);
    }
} else if (cmd === "find") {
    const needle = norm(args.join(" "));
    if (!needle) fail("find what?");
    bank.forEach((r, i) => { if (r && (norm(r[1]).includes(needle) || norm(r[2]).includes(needle))) console.log(JSON.stringify({ i, row: r })); });
} else if (cmd === "append") {
    const rows = read(path.resolve(args[0] ?? fail("append <file.json>")));
    if (!Array.isArray(rows) || !rows.length) fail("the file must hold a non-empty array");
    const seen = new Map(bank.map((r, i) => [r && norm(r[1]), i]));
    const files = Object.fromEntries(langs().map((l) => [l, read(langPath(l))]));
    const errors = [];
    rows.forEach((r, n) => {
        const where = `row ${n} "${r.q}"`;
        if (!CATS.includes(r.cat)) errors.push(`${where}: category must be one of ${CATS.join(", ")}`);
        for (const p of problems(r.q, r.a, r.w)) errors.push(`${where}: ${p}`);
        if (seen.has(norm(r.q))) errors.push(`${where}: duplicate of b${seen.get(norm(r.q))}`);
        seen.set(norm(r.q), `new row ${n}`);
        for (const [l, t] of Object.entries(r.tr ?? {})) {
            if (!files[l]) errors.push(`${where}: no src/data/${l}.json`);
            else if (t) for (const p of problems(...t)) errors.push(`${where} (${l}): ${p}`);
        }
    });
    if (errors.length) fail(`Nothing written:\n${errors.join("\n")}`);
    const start = bank.length;
    for (const r of rows) bank.push([r.cat, r.q.trim(), r.a.trim(), r.w.map((x) => x.trim())]);
    writeBank(bank);
    for (const [l, file] of Object.entries(files)) {
        while (file.bank.length < start) file.bank.push(null);
        file.bank.length = start;
        for (const r of rows) file.bank.push(r.tr?.[l] ? [r.tr[l][0].trim(), r.tr[l][1].trim(), r.tr[l][2].map((x) => x.trim())] : null);
        writeLang(l, file);
    }
    console.log(`appended b${start}–b${bank.length - 1} (${rows.length} rows)`);
} else if (cmd === "untranslated") {
    const [l, n = "50"] = args;
    if (!l || !existsSync(langPath(l))) fail(`no src/data/${l}.json`);
    const t = read(langPath(l)).bank;
    const skip = new Set(skipped()[l] ?? []);
    let left = Number(n);
    for (const [i, r] of bank.entries()) {
        if (left <= 0) break;
        if (!r || t[i] || skip.has(i)) continue;
        console.log(JSON.stringify({ i, row: r, en: l === "en" ? undefined : read(langPath("en")).bank[i] ?? undefined }));
        left--;
    }
} else if (cmd === "translate") {
    const [l, f] = args;
    if (!l || !existsSync(langPath(l))) fail(`no src/data/${l}.json`);
    const input = read(path.resolve(f ?? fail("translate <lang> <file.json>")));
    const file = read(langPath(l));
    const errors = [];
    for (const [k, t] of Object.entries(input)) {
        const i = Number(k);
        if (!Number.isInteger(i) || !bank[i]) errors.push(`${k}: no such bank row`);
        else if (t !== null) for (const p of problems(...(Array.isArray(t) ? t : []))) errors.push(`${k}: ${p}`);
    }
    if (errors.length) fail(`Nothing written:\n${errors.join("\n")}`);
    while (file.bank.length < bank.length) file.bank.push(null);
    for (const [k, t] of Object.entries(input)) file.bank[Number(k)] = t && [t[0].trim(), t[1].trim(), t[2].map((x) => x.trim())];
    writeLang(l, file);
    console.log(`${l}: set ${Object.keys(input).length} translations`);
} else if (cmd === "skip") {
    const [l, ...is] = args;
    if (!l || !existsSync(langPath(l))) fail(`no src/data/${l}.json`);
    const all = skipped();
    all[l] = [...new Set([...(all[l] ?? []), ...is.map(Number).filter((i) => bank[i])])].sort((a, b) => a - b);
    writeFileSync(skipFile, JSON.stringify(all, null, 2) + "\n");
    console.log(`${l}: ${all[l].length} rows skipped`);
} else if (cmd === "check") {
    const errors = [];
    const seen = new Map();
    bank.forEach((r, i) => {
        if (!r) return;
        if (!CATS.includes(r[0])) errors.push(`b${i}: unknown category ${r[0]}`);
        for (const p of problems(r[1], r[2], r[3])) errors.push(`b${i}: ${p}`);
        if (seen.has(norm(r[1]))) errors.push(`b${i}: duplicate of b${seen.get(norm(r[1]))}`);
        seen.set(norm(r[1]), i);
    });
    const pictures = read(path.join(dataDir, "pictures.json"));
    const numbers = read(path.join(dataDir, "numbers.json"));
    for (const l of args[0] ? [args[0]] : langs()) {
        if (!existsSync(langPath(l))) { errors.push(`no src/data/${l}.json`); continue; }
        const t = read(langPath(l));
        if (!Array.isArray(t.bank)) errors.push(`${l}: bank must be an array`);
        else {
            if (t.bank.length > bank.length) errors.push(`${l}: bank has ${t.bank.length} rows, bank.json ${bank.length}`);
            t.bank.forEach((x, i) => { if (x) for (const p of problems(...(Array.isArray(x) ? x : []))) errors.push(`${l} b${i}: ${p}`); });
        }
        // Pictures, years and metrics have no fallback: every one needs its translation.
        const list = (key, want) => {
            if (!Array.isArray(t[key]) || t[key].length !== want || t[key].some((x) => typeof x !== "string" || !x.trim())) errors.push(`${l}: ${key} needs ${want} non-empty strings (has ${t[key]?.length ?? 0})`);
        };
        list("pics", pictures.length);
        list("events", numbers.events.length);
        if (!Array.isArray(t.metrics) || t.metrics.length !== numbers.metrics.length) errors.push(`${l}: metrics needs ${numbers.metrics.length} entries`);
        else numbers.metrics.forEach((m, mi) => {
            const x = t.metrics[mi];
            if (!x?.more || !x?.less || !x?.unit) errors.push(`${l}: metrics[${mi}] needs more, less and unit`);
            if (!Array.isArray(x?.items) || x.items.length !== m.items.length) errors.push(`${l}: metrics[${mi}].items needs ${m.items.length} names`);
        });
    }
    if (errors.length) fail(errors.join("\n"));
    console.log("ok");
} else {
    fail("usage: node scripts/quiz-data.mjs stats | find <text> | append <file> | untranslated <lang> [N] | translate <lang> <file> | skip <lang> <i>... | check [lang]");
}
