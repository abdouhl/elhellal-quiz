// The English question set: src/data/en.json translates the Arabic data index by index, so ids match.
import bank from "../data/bank.json";
import pictures from "../data/pictures.json";
import numbers from "../data/numbers.json";
import en from "../data/en.json";
import { STRINGS } from "../i18n";
import { createEngine } from "./engine";
import type { BankRow, Content, Pic } from "./engine";

const t = en as {
    bank: ([string, string, string[]] | null)[];
    pics: string[];
    events: string[];
    metrics: { more: string; less: string; unit: string; items: string[] }[];
};
const { events, metrics } = numbers as Pick<Content, "events" | "metrics">;

export const engine = createEngine(
    {
        lang: "en",
        bank: (bank as BankRow[]).map(([c], i) => (t.bank[i] ? [c, ...t.bank[i]!] : null)),
        pics: (pictures as Pic[]).map((p, i) => ({ ...p, a: t.pics[i] })),
        events: events.map(([, y], i) => [t.events[i], y]),
        metrics: metrics.map((m, mi) => ({ ...t.metrics[mi], items: m.items.map(([, v], i) => [t.metrics[mi].items[i], v]) })),
    },
    STRINGS.en,
);
