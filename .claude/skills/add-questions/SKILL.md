---
name: add-questions
description: Write new Arabic trivia questions for quiz.elhellal.com and append them to the question bank (src/data/bank.json), with translations into every quiz language. Use when the user asks to add, generate or write quiz questions ("أسئلة جديدة", "more geography questions", "add 30 questions about science").
argument-hint: "[N] [category: geo|sci|hist|gen|lit|lang|any] [topic…]"
---

# Add questions to the bank

The bank is `src/data/bank.json`: rows `[category, question, answer, [3 wrong answers]]`, in Arabic. A row's index is its id (`b<i>`, page `/q/b<i>/`), and `src/data/<lang>.json` translates it at the same index. So **rows are only appended**. Never edit, reorder or delete rows in this task. Make every edit through `scripts/quiz-data.mjs`. It keeps the language files aligned and the file layouts unchanged.

Arguments: a count (default 20), a category (default: the categories with the fewest rows), and an optional topic. Categories:

| cat | Arabic label | covers |
|---|---|---|
| geo | جغرافيا | countries, capitals, rivers, mountains, seas, cities, borders |
| sci | علوم | physics, chemistry, biology, medicine, astronomy, the human body, inventions |
| hist | تاريخ | world and Arab/Islamic history, dynasties, battles, discoveries, dates |
| gen | ثقافة عامة | sport, art, food, records, everyday knowledge, famous people |
| lit | أدب وكتب | Arab and world authors, poets, novels, literary terms |
| lang | لغة عربية | grammar, morphology, vocabulary, rhetoric, proverbs (Arabic-only: no translations) |

## Workflow

1. `node scripts/quiz-data.mjs stats` to see category sizes and which languages exist.
2. Read 30–40 existing rows of the target category (`grep '^\["geo"' src/data/bank.json | awk 'NR%5==0' | head -40`; macOS has no `shuf`) to match tone and difficulty. Before writing a question, check it isn't there already: `node scripts/quiz-data.mjs find <key word>`.
3. Write the questions into a scratch file (in the scratchpad or `/tmp`, never in `src/`) as the `append` format:
   ```json
   [{ "cat": "geo", "q": "ما عاصمة كازاخستان؟", "a": "أستانا", "w": ["ألماتي", "طشقند", "بيشكك"],
      "tr": { "en": ["What is the capital of Kazakhstan?", "Astana", ["Almaty", "Tashkent", "Bishkek"]],
              "es": ["¿Cuál es la capital de Kazajistán?", "Astaná", ["Almaty", "Taskent", "Biskek"]] } }]
   ```
   Give `tr` an entry for **every** language file in `src/data/` except Arabic. Leave a language out (it stays `null`) only for `lang` rows or a question that makes no sense outside Arabic.
4. `node scripts/quiz-data.mjs append <file>`. It refuses the whole batch on any problem (duplicate, bad category, answers not distinct). Fix the file and run it again.
5. `node scripts/quiz-data.mjs check` and `bun run build-questions` (validates the bank again and rebuilds `generated.json`). `QUOTES_JSON` defaults to `../elhellal-quotes/src/data/quotes.json`.
6. Report: how many rows went in, their id range (`b<first>–b<last>`), a few examples, and anything you left untranslated.

## Writing good rows

- **Facts must be true and stable.** Use only facts you are sure of, or check them with WebSearch. Skip anything that changes often (current leaders, records likely to fall, populations, "the newest…"). When unsure, drop the question.
- **One unambiguous answer.** Ask for "the largest", "the first", "the capital". Don't ask for "a famous …" when several options fit. If a question needs "مما يلي" or "أي من" to work, that's allowed, but those rows never become true-or-false questions.
- **Plausible wrong answers.** Same type and scale as the answer: cities for a city, years in the same century, authors of the same era. Never joke options, never "all of the above". All 4 must be distinct.
- **Short.** Questions under about 90 characters, answers 1–4 words. These appear on phone screens and in 30-second videos.
- **Mixed difficulty.** About 40% easy, 40% medium, 20% hard. Lean toward topics Arab readers know (the Arab world, Islamic history, Arabic literature), plus a healthy share of world knowledge.
- **Arabic style:** Modern Standard Arabic, ending in «؟», titles and quotes in «guillemets», Western digits for years (1962) as the existing rows do. Add diacritics only where they change the meaning.
- **Translations** are natural, native-sounding questions, not word-for-word renderings. Use each language's usual names for places and people ("Astana", "La Meca"). Keep the answer's meaning identical so the translated row has the same correct option.

Don't commit, push, build or deploy. The admin panel (or the user) does that.
