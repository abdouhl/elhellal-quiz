// H5 Games Ads (AdSense's Ad Placement API): the quiz decides when an ad may show, Google decides
// whether one does. The same rules as the iOS app (Hellal/Services/Ads.swift):
// - rewarded ads only when the player chooses to watch one (winning back a lost streak);
// - a full-screen ad now and then between questions, only after a tap on "next", never by itself
//   and never during the daily challenge.
// window.adBreak is defined by AdsLoader.astro; it is missing in the elhellal.com app frame.

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
            adBreakDone: finish,
        });
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
            onReady(
                () =>
                    new Promise<boolean>((resolve) => {
                        settle = resolve;
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
            if (!offered && info.breakStatus === "notReady" && tries < RETRIES)
                setTimeout(() => mine === generation && adsOn() && ask(mine, name, onReady, tries + 1), RETRY_MS);
        },
    });
}

/** Drops a reward offer that no longer applies (the player moved on). */
export function withdrawReward() {
    generation++;
}
