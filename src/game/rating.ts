// The player's rating: an Elo number as in the iOS app (Hellal/Services/Progress.swift, Player.swift).
// Questions have a rating too, from their share of right answers among all players; the endless quiz
// picks questions near the player's rating and every answer there moves it. One rating for every language.
import { store } from "./client";

export const START_RATING = 1000;

const KEY = "quiz.rating";
const PEAK_KEY = "quiz.peakRating";
const COUNT_KEY = "quiz.ratedCount";

export function rating(): number {
    const r = Number(store.get(KEY));
    return Number.isFinite(r) && r > 0 ? r : START_RATING;
}

export function peakRating(): number {
    return Math.max(Number(store.get(PEAK_KEY)) || START_RATING, rating());
}

/** A question's rating from its percent of right answers (50% → 1000); unknown questions count as 1000. */
function questionRating(correctPct: number | null): number {
    if (correctPct == null) return START_RATING;
    const p = Math.min(0.95, Math.max(0.05, correctPct / 100));
    return START_RATING + 400 * Math.log10((1 - p) / p);
}

/** The deck's 0 (easy) … 1 (hard) target for a rating: questions the player gets right about 65% of the time. */
export function difficulty(r = rating()): number {
    const p = 1 / (1 + 10 ** ((r - 100 - START_RATING) / 400));
    return Math.min(0.9, Math.max(0.1, 1 - p));
}

/** Big moves while the rating is still finding its level, smaller ones later. */
const k = (n: number) => (n < 30 ? 40 : n < 150 ? 24 : 16);

/** Scores one answer against the question's rating, saves the new rating and returns the change. */
export function rate(ok: boolean, correctPct: number | null): number {
    const r = rating();
    const n = Number(store.get(COUNT_KEY)) || 0;
    const expected = 1 / (1 + 10 ** ((questionRating(correctPct) - r) / 400));
    const next = Math.max(100, r + k(n) * ((ok ? 1 : 0) - expected));
    store.set(KEY, next.toFixed(2));
    store.set(PEAK_KEY, Math.max(peakRating(), next).toFixed(2));
    store.set(COUNT_KEY, String(n + 1));
    return next - r;
}

/** Bronze … Master, by rating floor. */
export const RANK_FLOORS = [0, 1100, 1250, 1400, 1550, 1700];
/** Each rank's light and dark colour (GameUI.swift's Rank.colors). */
export const RANK_COLORS = [
    ["#ed9e61", "#9e5729"],
    ["#ebf0fa", "#8c99b3"],
    ["#ffe066", "#e08c0d"],
    ["#99fff2", "#1a99a6"],
    ["#99ccff", "#4059f2"],
    ["#ff99f2", "#8c26d9"],
];

export function rankOf(r: number): number {
    let i = 0;
    while (i + 1 < RANK_FLOORS.length && r >= RANK_FLOORS[i + 1]) i++;
    return i;
}

/** Best scores of the timed and survival modes. */
export const bestOf = (mode: "blitz" | "survival") => Number(store.get(`quiz.best.${mode}`)) || 0;
/** Saves a run's score; true when it beat the previous best. */
export function recordBest(mode: "blitz" | "survival", score: number): boolean {
    if (score <= bestOf(mode)) return false;
    store.set(`quiz.best.${mode}`, String(score));
    return true;
}
