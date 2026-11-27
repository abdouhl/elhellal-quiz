// Compares the daily sets of the local build (dist/app/<lang>.json) with the live site's,
// so a deploy can't change a daily challenge players have already seen.
//   bun scripts/check-daily.ts           fails (exit 1) when a set on or before today differs
//   bun scripts/check-daily.ts --json    one JSON line instead of the report (the admin reads it)
// Sets after today may change (nobody has played them yet); they're counted as a note.
// Also reports the live and local bank sizes and the last BANK_Vn / DAILY_Vn gate in engine.ts.
import fs from "node:fs";
import path from "node:path";
import { LANGS } from "../src/i18n";
import { dayKey } from "../src/game/engine";

const ROOT = path.join(import.meta.dir, "..");
const SITE = "https://quiz.elhellal.com";
const json = process.argv.includes("--json");
const today = dayKey();

type AppFile = { generated: string; bank: unknown[]; daily: Record<string, string[]> };

/** The last gate in engine.ts: rows at or past BANK_Vn join the daily pool from DAILY_V(n+3). */
function lastGate() {
    const src = fs.readFileSync(path.join(ROOT, "src/game/engine.ts"), "utf-8");
    const last = (re: RegExp) => [...src.matchAll(re)].map((m) => ({ n: +m[1]!, v: m[2]! })).sort((a, b) => a.n - b.n).at(-1);
    return { bank: last(/const BANK_V(\d+) = (\d+);/g), daily: last(/const DAILY_V(\d+) = "([\d-]+)";/g) };
}

const langs = [];
for (const lang of LANGS) {
    const file = path.join(ROOT, "dist/app", `${lang}.json`);
    if (!fs.existsSync(file)) throw new Error(`No ${path.relative(ROOT, file)} — build first`);
    const local = JSON.parse(fs.readFileSync(file, "utf-8")) as AppFile;
    const res = await fetch(`${SITE}/app/${lang}.json`, { headers: { "cache-control": "no-cache" } });
    if (!res.ok) throw new Error(`${SITE}/app/${lang}.json: HTTP ${res.status}`);
    const live = (await res.json()) as AppFile;
    const changed: string[] = [];
    const future: string[] = [];
    for (const [key, ids] of Object.entries(live.daily)) {
        const mine = local.daily[key];
        if (!mine || mine.join() === ids.join()) continue;
        (key <= today ? changed : future).push(key);
    }
    langs.push({ lang, liveBank: live.bank.length, localBank: local.bank.length, liveGenerated: live.generated, changed, future });
}

const gate = lastGate();
const report = { ok: langs.every((l) => !l.changed.length), today, gate: { bank: gate.bank, daily: gate.daily }, langs };
if (json) {
    console.log(JSON.stringify(report));
} else {
    console.log(`Last gate: BANK_V${gate.bank?.n} = ${gate.bank?.v}, DAILY_V${gate.daily?.n} = ${gate.daily?.v} · today ${today}`);
    for (const l of langs) {
        const rows = l.localBank - l.liveBank;
        console.log(`${l.lang}: bank ${l.liveBank} live → ${l.localBank} local${rows > 0 ? ` (+${rows} not live yet)` : ""}`);
        if (l.changed.length) console.log(`  ✗ ${l.changed.length} past/today set(s) would change: ${l.changed.join(", ")}`);
        if (l.future.length) console.log(`  · ${l.future.length} future set(s) change (fine): ${l.future[0]} → ${l.future.at(-1)}`);
    }
    console.log(report.ok ? "✓ Daily sets up to today are unchanged — safe to deploy." : "✗ Gate the change with a new BANK_Vn / DAILY_Vn cutover before deploying.");
}
process.exit(report.ok ? 0 : 1);
