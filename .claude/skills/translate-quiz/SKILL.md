---
name: translate-quiz
description: Translate untranslated quiz.elhellal.com bank questions into one of the quiz's languages (src/data/<lang>.json), in batches. Use when the user asks to translate quiz questions, fill missing English/Spanish/… questions, or catch a language up with the Arabic bank.
argument-hint: "<lang> [N rows, default 100]"
---

# Translate bank rows into a quiz language

`src/data/<lang>.json` holds a `bank` array that translates `src/data/bank.json` index by index: each entry is `[question, answer, [3 wrong answers]]`, or `null` when untranslated. Only fill entries through `scripts/quiz-data.mjs`. It validates every row and keeps the minified layout.

Arguments: a language code (required; it must already have a file in `src/data/`, otherwise use the `add-language` skill), and how many rows to do (default 100).

## Workflow

1. `node scripts/quiz-data.mjs stats` shows what's left per language and category.
2. `node scripts/quiz-data.mjs untranslated <lang> <N>` prints `{ i, row, en }` per line. `en` is the English translation when there is one. It's a useful second reference, but the Arabic row is the source of truth.
3. Translate in chunks of about 50. Write `{ "<i>": [question, answer, [w1, w2, w3]], ... }` to a scratch file (in the scratchpad or `/tmp`, never in `src/`), then run `node scripts/quiz-data.mjs translate <lang> <file>`. On error nothing is written. Fix the file and rerun.
4. Some rows can't be translated: Arabic grammar or morphology (`lang` rows are almost all like this), wordplay, or a question whose answer depends on Arabic spelling. Don't force those. Collect their indexes and run `node scripts/quiz-data.mjs skip <lang> <i> <i> …` so they stop showing up as to-do. `lit` rows about Arabic authors and books usually *can* be translated: the facts carry over, so translate them.
5. At the end, `node scripts/quiz-data.mjs check <lang>`, then report how many rows you translated and skipped, and the `stats` line for the language.

## Translation rules

- Natural, native-sounding trivia questions, not a word-for-word rendering. Keep them short, about the same length as the Arabic.
- The meaning of the answer and of each wrong option stays the same, so the same option is correct. Keep the 4 options distinct after translation. If two collapse into one word, rephrase one of them.
- Use the language's standard names for places, people and works ("La Meca", "Ibn Jaldún", «Cien años de soledad»). For an Arabic book title with no published translation, transliterate it and add a short gloss only when it's needed to make sense.
- Use the language's own question punctuation (¿…?, «…» where the language uses it). Years stay as digits.
- If the Arabic row looks factually wrong, don't translate it. Skip it and list it in your report so the Arabic can be fixed first.

Don't commit, push, build or deploy.
