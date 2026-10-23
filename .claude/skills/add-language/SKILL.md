---
name: add-language
description: Add a new language to quiz.elhellal.com end to end (UI strings, pages under /<lang>/, translated question set, manifest, service worker, share images), the way Spanish was added in commit 3b9e52d. Use when the user asks to add a quiz language ("add French to the quiz", "Turkish version").
argument-hint: "<lang code> [language name]"
---

# Add a quiz language

Arabic is the default and lives at the root. Every other language lives under `/<lang>/` and plays a translation of the Arabic data. Spanish was the last language added: **run `git show 3b9e52d --stat` and read the diffs of the files below.** That commit is the template. English (`en`) is the best source to translate from, because its strings and data are complete.

The argument is an ISO 639-1 code (2 letters, lowercase), optionally with the language's name. If the code already exists in `LANGS` (`src/i18n.ts`), stop and say so. For a right-to-left language (fa, ur, he), set `dir: "rtl"` and check the layout in the browser at the end.

## 1. Code

| File | Change |
|---|---|
| `src/i18n.ts` | add the code to the `Lang` type and `LANGS`; write a full `const <lang>: Strings = { … }` (translate `en` key by key; every function and regex has to work for the language: `n`, `qty`, `year`, `quoted`, `listQuestion`, plural forms); add it to `STRINGS` |
| `src/game/<lang>.ts` | copy `src/game/es.ts`, change the import and the code |
| `src/game/engines.ts` | import and register the engine |
| `src/game/client.ts` | add it to `ENGINES` |
| `src/pages/<lang>/` | copy `src/pages/es/` (index, daily, `c/index`, `c/[category]`, `q/[id]`), replacing `"es"` and `engines.es` |
| `src/layouts/Layout.astro` | in the language-suggestion script, add a `COUNTRIES` list for the language (where it's the main language) and fit it into the `want` order |
| `public/sw.js` | add the code to `LANGS` and bump `VERSION` |
| `public/<lang>/manifest.webmanifest` | copy `public/es/manifest.webmanifest`; translate name, short_name, description, shortcuts; set `id`/`start_url`/`scope` to `/<lang>/` and `lang`, `dir` |
| `scripts/build-og.ts` | add the language's share-image strings (the object is `satisfies Record<Lang, …>`, so TypeScript reports a missing entry) |

Grep for any other place that lists languages, so nothing is missed: `grep -rn '"es"' src scripts public --include=*.ts --include=*.astro --include=*.js --include=*.mjs`.

## 2. Data: `src/data/<lang>.json`

Same shape as `src/data/en.json`, translated:

- `pics`: one answer per picture in `src/data/pictures.json` (country names for flags, people's names, landmark names), using the language's standard names. Same length and order as `en.json`'s `pics`.
- `events`: one per event in `src/data/numbers.json` (`events[i][0]`). Same order.
- `metrics`: per metric, `more` / `less` (question pairs), `unit`, and `items` (country names), same order.
- `bank`: build this with the helper so it stays aligned. Create the file with `"bank": []` plus the three sections above, then fill the bank the same way the `translate-quiz` skill does: `node scripts/quiz-data.mjs untranslated <lang> 100`, translate, `node scripts/quiz-data.mjs translate <lang> <file>`, and repeat. Use `skip` for Arabic-only rows (nearly all `lang` rows). Translate **every** translatable row; the site needs a full set to be worth launching. If a single session can't finish all of them, stop at a clean point and report how many are left. The user can carry on with the `translate-quiz` skill.

Write all data through Node (`JSON.parse`/`JSON.stringify`) or the helper script, never with `sed`. The language files are minified, single-line JSON with a trailing newline.

## 3. Verify

```bash
node scripts/quiz-data.mjs check <lang>
bun run build-questions
bun run build          # astro build + share images; it must pass with no type errors
```

Then open `bun run preview` (or check `dist/`) for `/<lang>/`, `/<lang>/daily/`, `/<lang>/c/` and one `/<lang>/q/b0/`. Check the strings, the direction, and that a picture question shows its options.

## 4. Report

List the files changed, the translated / skipped / remaining counts (`node scripts/quiz-data.mjs stats`), and these follow-ups for the user:

- The admin panel reads the quiz's languages from `src/i18n.ts`, so restarting it picks up the language for the bank editor, the Pinterest pins (`quiz-<lang>`) and the stats.
- Store screenshots (`public/screens/<lang>-*.png`) are optional and made by hand.

Don't commit, push or deploy.
