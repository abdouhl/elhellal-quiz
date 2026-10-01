// The Arabic question set (the site's default language).
import bank from "../data/bank.json";
import generated from "../data/generated.json";
import pictures from "../data/pictures.json";
import numbers from "../data/numbers.json";
import { STRINGS } from "../i18n";
import { createEngine } from "./engine";
import type { BankRow, Content, Pic } from "./engine";

const { authors, quotes, books } = generated as { authors: string[]; quotes: [string, number][]; books: [string, number][] };

export const engine = createEngine(
    { lang: "ar", bank: bank as BankRow[], pics: pictures as Pic[], ...(numbers as Pick<Content, "events" | "metrics">), authors, quotes, books },
    STRINGS.ar,
);
