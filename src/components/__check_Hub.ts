    import { DAILY_SIZE, dayKey, dayNumber } from "../game/engine";
    import { breakBefore, offerReward } from "../game/ads";
    import { track } from "../game/track";
    import { DAILY_KEY, dailyStatus, home, missedIds, num, restorableDailyStreak, restoreDailyStreak, s, store, syncBadge, toast } from "../game/client";
    import { RANK_COLORS, RANK_FLOORS, bestOf, rankOf, rating } from "../game/rating";

    const $ = (id: string) => document.getElementById(id)!;

    // Old links to the endless quiz's mistake practice (/?review, the app shortcut) now go to the play page.
    if (new URLSearchParams(location.search).has("review")) location.replace(`${home}play/?review`);

    function renderRank() {
        const r = rating();
        const i = rankOf(r);
        const rank = $("rank");
        rank.style.setProperty("--r1", RANK_COLORS[i][0]);
        rank.style.setProperty("--r2", RANK_COLORS[i][1]);
        $("r-name").textContent = s.ranks[i];
        $("r-num").textContent = num(Math.round(r));
        const next = RANK_FLOORS[i + 1];
        const floor = RANK_FLOORS[i];
        // Bronze starts at 0, but its bar runs from the starting rating so a new player's isn't nearly full.
        const from = i === 0 ? 900 : floor;
        $("r-bar").style.width = `${next ? Math.max(4, Math.min(100, ((r - from) / (next - from)) * 100)) : 100}%`;
        $("r-next").textContent = next ? s.toNext(Math.ceil(next - r), s.ranks[i + 1]) : s.topRank;
    }

    function renderDaily() {
        const today = dayKey();
        $("d-title").textContent = s.dailyTitle(dayNumber(today));
        const { streak, doneToday } = dailyStatus();
        $("h-days").querySelector("b")!.textContent = num(streak);
        let hits: boolean[] = [];
        try {
            const st = JSON.parse(store.get(`${DAILY_KEY}.state`) ?? "");
            if (st.day === today && Array.isArray(st.hits)) hits = st.hits;
        } catch {}
        const done = doneToday || hits.length >= DAILY_SIZE;
        if (done) {
            $("d-sub").textContent = s.dailyDone;
            $("d-sub").classList.add("ok");
            const grid = $("d-grid");
            grid.textContent = hits.map((h) => (h ? "🟩" : "🟥")).join("");
            grid.hidden = !hits.length;
        }
        $("d-go").hidden = done;

        // The last seven days, today last: a day is lit when it falls inside the current streak.
        // The streak's days count back from the last day played (today, or yesterday while today is still to play).
        const played = new Set<string>();
        const last = store.get(`${DAILY_KEY}.last`);
        if (streak > 0 && last) {
            const [y, m, d] = last.split("-").map(Number);
            for (let i = 0; i < Math.min(streak, 7); i++) played.add(dayKey(new Date(y, m - 1, d - i)));
        }
        const fmt = new Intl.DateTimeFormat(document.documentElement.lang, { weekday: "narrow" });
        const days: HTMLLIElement[] = [];
        for (let back = 6; back >= 0; back--) {
            const d = new Date();
            d.setDate(d.getDate() - back);
            const li = document.createElement("li");
            li.classList.toggle("on", played.has(dayKey(d)));
            li.classList.toggle("today", back === 0);
            li.innerHTML = `<span></span><small>${fmt.format(d)}</small>`;
            days.push(li);
        }
        $("week").replaceChildren(...days);

        // A streak broken by one missed day can be won back with a rewarded ad, as on the daily page.
        const lost = restorableDailyStreak();
        if (lost) {
            offerReward("daily-streak", (watch) => {
                $("rescue-text").textContent = s.streakLost(lost);
                $("rescue").hidden = false;
                const go = $("rescue-go") as HTMLButtonElement;
                go.onclick = async () => {
                    go.disabled = true;
                    if (await watch()) {
                        restoreDailyStreak();
                        $("rescue").hidden = true;
                        toast(s.dailyBack(lost));
                        renderDaily();
                    } else go.disabled = false;
                };
            });
        }
    }

    function render() {
        renderRank();
        renderDaily();
        $("h-best").querySelector("b")!.textContent = num(Number(store.get("quiz.bestStreak")) || 0);
        $("t-blitz").textContent = s.bestN(bestOf("blitz"));
        $("t-survival").textContent = s.bestN(bestOf("survival"));
        const missed = missedIds().length;
        const badge = $("t-missed");
        badge.hidden = missed < 1;
        badge.textContent = num(missed);
        $("t-review").title = missed ? s.reviewTitle(missed) : s.reviewDone;
    }

    // Starting a game is a natural break: when one is due, the tap may show an interstitial first ("start").
    for (const a of document.querySelectorAll<HTMLAnchorElement>('.lobby a[href*="/play/"]')) {
        a.addEventListener("click", () => track("lobby_play", { target: new URL(a.href).search || "endless" }));
        breakBefore(a, "start-game");
    }

    render();
    syncBadge();
    // Back from a game (bfcache) or another tab: show what changed.
    addEventListener("pageshow", (e) => e.persisted && render());
export {};
