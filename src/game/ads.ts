// H5 Games Ads (AdSense's Ad Placement API): the quiz decides when an ad may show, Google decides
// whether one does. The same rules as the iOS app (Hellal/Services/Ads.swift):
// - rewarded ads only when the player chooses to watch one (winning back a lost streak);
// - a full-screen ad now and then between questions, only after a tap on "next", never by itself
//   and never during the daily challenge.
// window.adBreak is defined by AdsLoader.astro; it is missing in the elhellal.com app frame.
// Every break's outcome is sent to GA4 (src/game/track.ts) as "ad_break".

import { track } from "./track";

interface Placement {
    type: "start" | "pause" | "next" | "browse" | "reward";
    name: string;
    beforeAd?: () => void;
    afterAd?: () => void;
    beforeReward?: (showAdFn: () => void) => void;
    adDismissed?: () => void;
    adViewed?: () => void;
    adBreakDone?: (info: { breakStatus: string }) => void;
}

declare global {
    interface Window {
        adBreak?: (p: Placement) => void;
    }
}

const root = document.documentElement;

/** Whether this page can show game ads at all right now. */
export function adsOn(): boolean {
    return (
        typeof window.adBreak === "function" &&
        navigator.onLine &&
        !root.hasAttribute("data-embedded") &&
        !root.hasAttribute("data-no-ads") &&
        !root.hasAttribute("data-ads-blocked")
    );
}

/** At most one full-screen ad break a minute, counted across pages (rewarded ads count too). */
export const AD_INTERVAL_MS = 60_000;
const AD_AT = "quiz.adAt";
/** Kept in memory as well, for browsers that block storage. */
let lastAt = 0;
const lastBreak = () => {
    try {
        return Number(localStorage.getItem(AD_AT)) || 0;
    } catch {
        return lastAt;
    }
};
/** Notes that an ad break was just asked for (or a rewarded ad played), restarting the minute. */
export function noteBreak() {
    lastAt = Date.now();
    try {
        localStorage.setItem(AD_AT, String(lastAt));
    } catch {}
}
// A first visit gets its first minute without an interstitial.
if (!lastBreak()) noteBreak();
/** Whether an interstitial may be asked for now. */
export const breakDue = () => adsOn() && Date.now() - lastBreak() >= AD_INTERVAL_MS;

/** Set while an ad covers the page, so the game can hold its timers and ignore keys. */
export let adShowing = false;
const covering = (on: boolean) => {
    adShowing = on;
    root.toggleAttribute("data-ad-showing", on);
    dispatchEvent(new CustomEvent("quiz:ad", { detail: on }));
};

/** Each new placement replaces an unused reward offer (the API keeps only the latest one). */
let generation = 0;

/**
 * Asks for a full-screen ad at a break (the player tapped "next"); resolves once the game may go on,
 * straight away when no ad shows. Google's frequency hint (60s) caps how often one actually does.
 */
export function interstitial(name: string): Promise<void> {
    if (!adsOn()) return Promise.resolve();
    generation++;
    return new Promise((resolve) => {
        let started = false;
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            if (adShowing) covering(false);
            resolve();
        };
        // If the ad script never answers (slow network, late blocker), don't hold the game up.
        setTimeout(() => started || finish(), 1500);
        window.adBreak!({
            type: "next",
            name,
            beforeAd: () => {
                started = true;
                covering(true);
            },
            afterAd: () => covering(false),
            adBreakDone: (info) => {
                track("ad_break", { ad_type: "next", ad_name: name, ad_status: info?.breakStatus ?? "unknown" });
                finish();
            },
        });
    });
}

/**
 * Makes `link` a natural break: when an interstitial is due, a tap on it asks for one first, then follows
 * the link. Otherwise the link works as usual (and always does with a modifier key, for a new tab).
 */
export function breakBefore(link: HTMLAnchorElement, name: string, when: () => boolean = () => true) {
    link.addEventListener("click", async (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (adShowing) return e.preventDefault();
        if (!when() || !breakDue()) return;
        e.preventDefault();
        noteBreak();
        await interstitial(name);
        location.href = link.href;
    });
}

/**
 * Asks whether a rewarded ad is available for `name`. When one is, `onReady` gets a `watch` function
 * to call from the player's tap; it resolves true once the ad was watched through (the reward is due),
 * false when it was skipped. `onReady` never runs when no ad is available, so nothing is offered.
 */
export function offerReward(name: string, onReady: (watch: () => Promise<boolean>) => void) {
    if (!adsOn()) return;
    ask(++generation, name, onReady, 0);
}

/** A reward asked for before Google has one preloaded (just after the page opens) comes back "notReady": ask again a few times. */
const RETRIES = 6;
const RETRY_MS = 5000;

function ask(mine: number, name: string, onReady: (watch: () => Promise<boolean>) => void, tries: number) {
    let settle: (viewed: boolean) => void = () => {};
    let viewed = false;
    let offered = false;
    window.adBreak!({
        type: "reward",
        name,
        beforeReward: (showAdFn) => {
            if (mine !== generation) return;
            offered = true;
            track("reward_offered", { ad_name: name });
            onReady(
                () =>
                    new Promise<boolean>((resolve) => {
                        settle = resolve;
                        track("reward_clicked", { ad_name: name });
                        showAdFn();
                    }),
            );
        },
        beforeAd: () => covering(true),
        afterAd: () => covering(false),
        adViewed: () => (viewed = true),
        adDismissed: () => (viewed = false),
        adBreakDone: (info) => {
            if (adShowing) covering(false);
            settle(viewed);
            const retry = !offered && info.breakStatus === "notReady" && tries < RETRIES;
            // One event per offer: the retries' "notReady" answers aren't counted, only the last one.
            if (!retry && (offered || mine === generation))
                track("ad_break", { ad_type: "reward", ad_name: name, ad_status: offered ? (viewed ? "viewed" : "dismissed") : info.breakStatus });
            if (retry) setTimeout(() => mine === generation && adsOn() && ask(mine, name, onReady, tries + 1), RETRY_MS);
        },
    });
}

/** Drops a reward offer that no longer applies (the player moved on). */
export function withdrawReward() {
    generation++;
}
