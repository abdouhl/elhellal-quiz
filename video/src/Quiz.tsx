import React from "react";
import { AbsoluteFill, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from "remotion";

export type Format = "vertical" | "square" | "landscape";

export const SIZES: Record<Format, [number, number]> = {
    vertical: [1080, 1920], // TikTok, Shorts, Reels
    square: [1080, 1080], // X / Twitter feed
    landscape: [1920, 1080], // YouTube
};

export interface Timeline { qIn: number; optsIn: number[]; cdStart: number; cdLen: number; reveal: number; fact: number; cta: number; end: number }

export interface QuizQ {
    text: string;
    /** start time (s) of each displayed word, for the karaoke highlight */
    words: number[];
    isQuote: boolean;
    options: string[];
    answer: number;
    claim?: string;
    label: string;
    icon: string;
    kind: string;
    /** path under public/ */
    image?: string;
    credit?: string;
}

export type QuizProps = {
    format: Format;
    q: QuizQ;
    tint: string;
    fact: [string, string];
    T: Timeline;
    /** single videos: episode chip, opening hook and end card */
    episode?: number;
    hook?: [string, string];
    /** marathon segments: "question i of n" instead of the hook, no end card */
    counter?: { i: number; n: number };
};

export const ACCENT = "#ff8c00";
const GREEN = "#22c55e";
const RED = "#ff3b30";
const DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const ar = (n: number) => String(n).replace(/\d/g, (d) => DIGITS[+d]);
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

// ---------- fonts ----------

const fontHandle = delayRender("fonts");
Promise.all([
    new FontFace("ROM", `url(${staticFile("woffs/ROM-Regular.woff2")})`, { weight: "400" }).load(),
    new FontFace("ROM", `url(${staticFile("woffs/ROM-Bold.woff2")})`, { weight: "700" }).load(),
]).then((faces) => {
    faces.forEach((f) => document.fonts.add(f));
    continueRender(fontHandle);
});

// ---------- layout: fixed boxes per format, so the camera and effects know where things are ----------

interface Box { x: number; y: number; w: number; h: number }
interface Layout {
    w: number; h: number;
    /** font scale */
    s: number;
    /** header: stacked and centered (vertical) or one row across the top */
    row: boolean;
    q: Box;
    picH: number;
    opts: (i: number, n: number) => Box;
    timer: Box;
    ring: number;
    fact: Box;
    /** where the sunburst is centered */
    cy: number;
}

function grid(w: number, top: number, tileW: number, tileH: number, gap: number, twoInRow: boolean) {
    const side = (w - 2 * tileW - gap) / 2;
    return (i: number, n: number): Box => {
        if (n === 2 && !twoInRow) return { x: side, y: top + 10 + i * (tileH + gap), w: w - 2 * side, h: tileH - 10 };
        const col = i % 2, row = n === 2 ? 0.5 : Math.floor(i / 2);
        // RTL: the first option sits on the right.
        return { x: col === 0 ? w - side - tileW : side, y: top + row * (tileH + gap), w: tileW, h: tileH };
    };
}

export function layout(format: Format): Layout {
    const [w, h] = SIZES[format];
    if (format === "vertical") {
        const side = (w - 2 * 440 - 26) / 2;
        return { w, h, s: 1, row: false, q: { x: 60, y: 345, w: 960, h: 540 }, picH: 400, opts: grid(w, 905, 440, 196, 26, false), timer: { x: 0, y: 1372, w, h: 250 }, ring: 250, fact: { x: side, y: 1380, w: w - 2 * side, h: 210 }, cy: 820 };
    }
    if (format === "square") {
        return { w, h, s: 0.74, row: true, q: { x: 50, y: 100, w: 980, h: 385 }, picH: 245, opts: grid(w, 490, 470, 150, 20, false), timer: { x: 0, y: 830, w, h: 220 }, ring: 190, fact: { x: 50, y: 840, w: 980, h: 190 }, cy: 520 };
    }
    return { w, h, s: 0.86, row: true, q: { x: 140, y: 115, w: 1640, h: 370 }, picH: 240, opts: grid(w, 510, 780, 150, 28, true), timer: { x: 0, y: 835, w, h: 225 }, ring: 215, fact: { x: 170, y: 850, w: 1580, h: 190 }, cy: 520 };
}

const useT = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const t = frame / fps;
    const sp = (at: number, config: { damping?: number; stiffness?: number; mass?: number } = { damping: 11, stiffness: 180 }) =>
        spring({ frame: frame - Math.round(at * fps), fps, config });
    return { t, fps, frame, sp };
};

/** Decaying camera shake from a list of [time, strength] impulses. */
function shake(t: number, hits: [number, number][]) {
    let x = 0, y = 0, r = 0;
    for (const [at, s] of hits) {
        const d = t - at;
        if (d < 0 || d > 0.6) continue;
        const e = s * Math.exp(-d * 9);
        x += Math.sin(d * 95) * e * 18;
        y += Math.cos(d * 77) * e * 14;
        r += Math.sin(d * 60) * e * 0.8;
    }
    return { x, y, r };
}

// ---------- background ----------

/** Sunburst, glow and drifting specks. `tense`/`won` are 0…1 moods set by the caller. */
export const Background: React.FC<{ L: Layout; tint: string; tense?: number; won?: number; spinBoost?: number }> = ({ L, tint, tense = 0, won = 0, spinBoost = 0 }) => {
    const { t } = useT();
    const beat = Math.pow(Math.max(0, Math.cos((t * Math.PI * 2 * 110) / 60)), 12);
    const R = Math.max(L.w, L.h) * 1.3;
    return (
        <AbsoluteFill style={{ background: "#07070a", overflow: "hidden" }}>
            <AbsoluteFill style={{ background: `radial-gradient(${L.w * 1.1}px ${L.h * 0.75}px at 50% ${(L.cy / L.h) * 100}%, ${tint}55, transparent 60%)`, opacity: 0.7 + 0.3 * beat }} />
            <svg width={R * 2} height={R * 2} viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`} style={{ position: "absolute", left: L.w / 2 - R, top: L.cy - R, transform: `rotate(${t * 8 + spinBoost}deg)`, opacity: 0.09 + 0.08 * tense }}>
                {Array.from({ length: 20 }, (_, i) => (
                    <path key={i} d={`M0 0 L${-R * 0.07} ${-R} L${R * 0.07} ${-R} Z`} fill={i % 2 ? ACCENT : tint} transform={`rotate(${i * 18})`} />
                ))}
            </svg>
            <AbsoluteFill style={{ background: `radial-gradient(${L.w * 0.85}px ${L.h * 0.6}px at 50% 45%, ${GREEN}66, transparent 70%)`, opacity: won }} />
            {Array.from({ length: 40 }, (_, i) => {
                const x = random(`px${i}`) * L.w, v = 20 + random(`pv${i}`) * 60, sz = 2 + random(`ps${i}`) * 5;
                const y = (((random(`py${i}`) * L.h - t * v) % L.h) + L.h) % L.h;
                return <div key={i} style={{ position: "absolute", left: x + Math.sin(t + i) * 20, top: y, width: sz, height: sz, borderRadius: 9, background: "#ffc26b", opacity: 0.25 + random(`pa${i}`) * 0.4, boxShadow: "0 0 12px #ff9d2b" }} />;
            })}
            <AbsoluteFill style={{ boxShadow: `inset 0 0 ${(200 + 120 * beat) * L.s}px ${RED}`, opacity: tense * (0.5 + 0.5 * Math.pow(Math.max(0, Math.cos(t * Math.PI * 2)), 6)) }} />
            <AbsoluteFill style={{ background: "radial-gradient(closest-corner at 50% 45%, transparent 60%, rgba(0,0,0,.75))" }} />
        </AbsoluteFill>
    );
};

// ---------- openers ----------

const Hook: React.FC<{ L: Layout; lines: [string, string]; end: number }> = ({ L, lines, end }) => {
    const { t, sp } = useT();
    const words = lines[0].split(" ");
    const out = prog(t, end - 0.3, end);
    const badge = sp(0.25 + words.length * 0.16 + 0.1, { damping: 9, stiffness: 160 });
    return (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `0 ${80 * L.s}px ${L.row ? 0 : 160}px`, opacity: 1 - out, transform: `scale(${1 + out * 0.4})` }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${28 * L.s}px`, direction: "rtl", maxWidth: L.row ? L.w * 0.8 : undefined }}>
                {words.map((w, i) => {
                    const s = sp(0.15 + i * 0.16, { damping: 10, stiffness: 220 });
                    const accent = i >= Math.ceil(words.length / 2);
                    return (
                        <span key={i} style={{ fontSize: 138 * L.s, fontWeight: 700, lineHeight: 1.35, color: accent ? ACCENT : "#fff", opacity: clamp(s * 3), transform: `scale(${interpolate(s, [0, 1], [3.2, 1])}) rotate(${interpolate(s, [0, 1], [i % 2 ? 12 : -12, 0])}deg)`, textShadow: accent ? `0 0 60px ${ACCENT}aa, 0 8px 0 #7a3a00` : "0 8px 0 #333", display: "inline-block" }}>
                            {w}
                        </span>
                    );
                })}
            </div>
            <Pill L={L} s={badge}>{lines[1]}</Pill>
        </AbsoluteFill>
    );
};

const Pill: React.FC<{ L: Layout; s: number; children: React.ReactNode }> = ({ L, s, children }) => (
    <div style={{ marginTop: 60 * L.s, padding: `${18 * L.s}px ${44 * L.s}px`, borderRadius: 999, background: "#fff", color: "#000", fontWeight: 700, fontSize: 60 * L.s, direction: "rtl", transform: `scale(${s}) rotate(${interpolate(s, [0, 1], [-15, -3])}deg)`, boxShadow: "0 12px 0 #000, 0 0 50px rgba(255,255,255,.35)" }}>{children}</div>
);

/** Marathon opener for each question: a slammed "سؤال ٣" over a colored wipe. */
const CounterSlam: React.FC<{ L: Layout; i: number; n: number; end: number }> = ({ L, i, n, end }) => {
    const { t, sp } = useT();
    const s = sp(0.12, { damping: 9, stiffness: 200 });
    const out = prog(t, end - 0.25, end);
    const wipe = prog(t, 0, 0.45);
    return (
        <>
            <div style={{ position: "absolute", top: -200, bottom: -200, width: L.w * 0.6, left: interpolate(wipe, [0, 1], [-L.w * 0.8, L.w * 1.2]), background: `linear-gradient(90deg, transparent, ${ACCENT}, #ffd24a, transparent)`, transform: "skewX(-18deg)", opacity: 0.9 }} />
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", direction: "rtl", opacity: 1 - out, transform: `scale(${1 + out * 0.5})` }}>
                <div style={{ fontSize: 70 * L.s, fontWeight: 700, color: "#fff", opacity: clamp(s * 2) }}>سؤال</div>
                <div style={{ fontSize: 300 * L.s, fontWeight: 700, lineHeight: 1, color: ACCENT, textShadow: `0 0 80px ${ACCENT}, 0 14px 0 #7a3a00`, transform: `scale(${interpolate(s, [0, 1], [3, 1])}) rotate(${interpolate(s, [0, 1], [-20, 0])}deg)` }}>{ar(i)}</div>
                <div style={{ marginTop: 10, fontSize: 50 * L.s, color: "#bbb", opacity: clamp(s * 2) }}>من {ar(n)}</div>
            </AbsoluteFill>
        </>
    );
};

// ---------- HUD ----------

const Hud: React.FC<{ L: Layout; p: QuizProps }> = ({ L, p }) => {
    const { t, sp } = useT();
    const a = sp(0);
    const chips = sp(p.T.qIn, { damping: 12, stiffness: 200 });
    const brand = (
        <div style={{ display: "flex", alignItems: "center", gap: 14 * L.s, fontWeight: 700, fontSize: 44 * L.s, opacity: a }}>
            <Img src={staticFile("favicon.svg")} style={{ width: 62 * L.s, height: 62 * L.s }} />
            <span>اختبار الهلال</span>
        </div>
    );
    const chipRow = (
        <div style={{ display: "flex", gap: 16 * L.s, transform: `translateY(${interpolate(chips, [0, 1], [-200, 0])}px)`, opacity: clamp(chips * 2) }}>
            <Chip L={L}>{`${p.q.icon} ${p.q.label}`}</Chip>
            {p.counter ? <Chip L={L} accent>{`سؤال ${ar(p.counter.i)} / ${ar(p.counter.n)}`}</Chip> : p.episode ? <Chip L={L} accent>{`سؤال #${ar(p.episode)}`}</Chip> : null}
        </div>
    );
    return (
        <>
            {!p.counter && <div style={{ position: "absolute", top: 0, right: 0, height: 12 * L.s, width: `${(t / p.T.end) * 100}%`, background: `linear-gradient(to left, ${ACCENT}, #ffd24a)`, boxShadow: `0 0 20px ${ACCENT}` }} />}
            {L.row ? (
                <div style={{ position: "absolute", top: 30 * L.s, left: 44 * L.s, right: 44 * L.s, display: "flex", justifyContent: "space-between", alignItems: "center", direction: "rtl" }}>
                    {brand}
                    {chipRow}
                </div>
            ) : (
                <>
                    <div style={{ position: "absolute", top: 165, left: 0, right: 0, display: "flex", justifyContent: "center", direction: "rtl" }}>{brand}</div>
                    <div style={{ position: "absolute", top: 258, left: 0, right: 0, display: "flex", justifyContent: "center", direction: "rtl" }}>{chipRow}</div>
                </>
            )}
        </>
    );
};

const Chip: React.FC<{ L: Layout; children: React.ReactNode; accent?: boolean }> = ({ L, children, accent }) => (
    <span style={{ padding: `${10 * L.s}px ${30 * L.s}px`, borderRadius: 999, fontWeight: 700, fontSize: 40 * L.s, background: accent ? ACCENT : "rgba(255,255,255,.1)", color: accent ? "#000" : "#fff", border: accent ? "none" : "2px solid rgba(255,255,255,.2)", boxShadow: accent ? `0 6px 0 #8a4600` : "none" }}>{children}</span>
);

// ---------- question ----------

const Question: React.FC<{ L: Layout; p: QuizProps }> = ({ L, p }) => {
    const { t, sp } = useT();
    const { q, T } = p;
    const words = q.text.split(" ");
    const len = q.text.length;
    const hasPic = !!q.image;
    const base = hasPic ? (len > 30 ? 52 : 62) : q.isQuote ? Math.max(46, 74 - (len - 40) * 0.35) : Math.max(58, Math.min(96, 110 - len * 0.9));
    const size = base * L.s * (L.row && !hasPic ? (q.isQuote ? 1.3 : 1.12) : 1);
    const pic = sp(T.qIn + 0.1, { damping: 10, stiffness: 140 });
    const claim = sp((q.words.at(-1) ?? T.qIn) + 0.2, { damping: 9, stiffness: 200 });
    const ph = L.picH;
    const picStyle: React.CSSProperties =
        q.kind === "flag"
            ? { height: ph, maxWidth: ph * 1.8, objectFit: "contain", borderRadius: 12 * L.s, boxShadow: "0 20px 60px rgba(0,0,0,.6), 0 0 0 4px rgba(255,255,255,.15)" }
            : { width: q.kind === "face" ? ph : ph * 1.5, height: ph, objectFit: "cover", objectPosition: "50% 25%", borderRadius: 18 * L.s, border: `${8 * L.s}px solid #fff`, boxShadow: "0 20px 60px rgba(0,0,0,.7)" };
    return (
        <div style={{ position: "absolute", left: L.q.x, top: L.q.y, width: L.q.w, height: L.q.h, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 24 * L.s, direction: "rtl" }}>
            {hasPic && (
                <div style={{ position: "relative", transform: `scale(${pic}) rotate(${interpolate(pic, [0, 1], [-10, q.kind === "flag" ? 0 : -2])}deg)`, opacity: clamp(pic * 2) }}>
                    <Img src={staticFile(q.image!)} style={{ display: "block", ...picStyle, transform: `scale(${1 + 0.04 * prog(t, T.qIn, T.reveal)})` }} />
                    {q.credit && <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, fontSize: 18 * Math.max(L.s, 0.9), color: "#ddd", background: "rgba(0,0,0,.55)", padding: "3px 10px", direction: "ltr", borderRadius: 6 }}>📷 {q.credit}</div>}
                </div>
            )}
            <div style={{ textAlign: "center", fontSize: size, lineHeight: 1.45, fontWeight: q.isQuote ? 400 : 700, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.26}px`, maxWidth: L.row ? L.q.w * 0.9 : undefined }}>
                {q.isQuote && <span style={{ color: ACCENT, fontSize: size * 1.6, lineHeight: 0.8, fontFamily: "Georgia" }}>“</span>}
                {words.map((w, i) => {
                    const at = q.words[i] ?? T.qIn + 0.3 + i * 0.12;
                    const s = sp(at - 0.08, { damping: 13, stiffness: 240 });
                    const next = q.words[i + 1] ?? at + 0.35;
                    const speaking = t >= at && t < next + 0.1;
                    return (
                        <span key={i} style={{ display: "inline-block", opacity: clamp(s * 2), transform: `translateY(${interpolate(s, [0, 1], [50, 0])}px) scale(${speaking ? 1.08 : 1})`, filter: `blur(${(1 - clamp(s)) * 8}px)`, color: speaking ? ACCENT : "#fff", textShadow: speaking ? `0 0 30px ${ACCENT}99` : "0 4px 0 rgba(0,0,0,.6)" }}>
                            {w}
                        </span>
                    );
                })}
            </div>
            {q.claim && (
                <div style={{ fontSize: 82 * L.s, fontWeight: 700, color: "#000", background: ACCENT, padding: `${8 * L.s}px ${44 * L.s}px`, borderRadius: 16, transform: `scale(${claim}) rotate(-2deg)`, boxShadow: "0 10px 0 #8a4600" }}>«{q.claim}»</div>
            )}
        </div>
    );
};

// ---------- options ----------

const KEYS = ["أ", "ب", "ج", "د"];

const Options: React.FC<{ L: Layout; p: QuizProps }> = ({ L, p }) => {
    const { t, sp } = useT();
    const { q, T } = p;
    const n = q.options.length;
    const revealed = t >= T.reveal;
    const urgent = t >= T.cdStart + T.cdLen - 2 && !revealed;
    const k = L.s;
    return (
        <>
            {q.options.map((o, i) => {
                const b = L.opts(i, n);
                const s = sp(T.optsIn[i], { damping: 12, stiffness: 170 });
                const fromRight = b.x + b.w / 2 >= L.w / 2;
                const right = i === q.answer;
                const r = sp(T.reveal, { damping: 9, stiffness: 200 });
                const scale = revealed ? (right ? interpolate(r, [0, 1], [1.14, 1.03]) : interpolate(r, [0, 1], [1, 0.9])) : 1;
                const float = revealed ? 0 : Math.sin(t * 2.4 + i * 1.3) * 5;
                const jitter = urgent ? Math.sin(t * 70 + i * 3) * 6 : 0;
                const fs = (o.length <= 8 ? 66 : o.length <= 14 ? 56 : o.length <= 22 ? 46 : 38) * (L.row ? (b.w >= 700 ? 1.05 : 0.9) : 1);
                const bg = revealed ? (right ? `linear-gradient(180deg, #34d27a, ${GREEN} 55%, #15803d)` : "linear-gradient(180deg, #1a1a1d, #111113)") : "linear-gradient(180deg, #2a2a30, #17171b 60%)";
                const depth = revealed ? (right ? "#0d5c2b" : "#050505") : "#000";
                const stamp = sp(T.reveal + 0.12, { damping: 8, stiffness: 260 });
                const badge = 72 * Math.max(k, 0.8);
                return (
                    <div key={i} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, transform: `translate(${interpolate(s, [0, 1], [fromRight ? L.w * 0.85 : -L.w * 0.85, 0]) + jitter}px, ${float}px) rotate(${interpolate(s, [0, 1], [fromRight ? 14 : -14, 0])}deg) scale(${scale})`, opacity: revealed && !right ? 0.45 : 1 }}>
                        <div style={{ position: "absolute", inset: 0, borderRadius: 26 * k, background: bg, border: `4px solid ${revealed && right ? "#86efac" : "rgba(255,255,255,.14)"}`, boxShadow: `0 ${14 * k}px 0 ${depth}, 0 24px 50px rgba(0,0,0,.55)${revealed && right ? `, 0 0 90px ${GREEN}` : ""}`, display: "flex", alignItems: "center", justifyContent: "center", padding: `0 ${90 * k}px`, textAlign: "center", fontSize: fs, fontWeight: 700, lineHeight: 1.25, color: revealed && !right ? "#777" : "#fff", direction: "rtl", filter: revealed && !right ? "grayscale(1)" : "none" }}>
                            {o}
                        </div>
                        <div style={{ position: "absolute", top: -badge * 0.25, right: -badge * 0.2, width: badge, height: badge, borderRadius: badge / 2, background: revealed && right ? "#fff" : `linear-gradient(180deg, #ffb347, ${ACCENT})`, color: revealed && right ? GREEN : "#000", fontSize: badge * 0.55, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 0 rgba(0,0,0,.6)", transform: `scale(${clamp(s * 1.3)})` }}>
                            {revealed && right ? "✓" : KEYS[i]}
                        </div>
                        {revealed && !right && (
                            <div style={{ position: "absolute", top: "50%", left: 30 * k, marginTop: -40 * k, fontSize: 70 * k, color: RED, fontWeight: 700, transform: `scale(${stamp})` }}>✗</div>
                        )}
                    </div>
                );
            })}
        </>
    );
};

// ---------- countdown ----------

const Timer: React.FC<{ L: Layout; T: Timeline }> = ({ L, T }) => {
    const { t, sp, fps } = useT();
    const inn = sp(T.cdStart - 0.35, { damping: 11, stiffness: 180 });
    const out = prog(t, T.reveal - 0.05, T.reveal + 0.15);
    if (t < T.cdStart - 0.4 || out >= 1) return null;
    const el = clamp((t - T.cdStart) / T.cdLen);
    const left = Math.max(1, Math.ceil(T.cdLen - (t - T.cdStart) - 1e-6));
    const tick = Math.floor(Math.max(0, t - T.cdStart));
    const slam = spring({ frame: Math.round((t - T.cdStart - tick) * fps), fps, config: { damping: 8, stiffness: 300 } });
    const hot = left <= 2;
    const col = hot ? RED : ACCENT;
    const D = L.ring, sw = D * 0.08, R = D / 2 - sw, C = 2 * Math.PI * R;
    return (
        <div style={{ position: "absolute", left: L.timer.x, top: L.timer.y, width: L.timer.w, height: L.timer.h, display: "flex", justifyContent: "center", alignItems: "center", gap: 44 * L.s, direction: "rtl", opacity: 1 - out, transform: `scale(${inn * (1 - out * 0.3)})` }}>
            <div style={{ position: "relative", width: D, height: D, transform: `scale(${hot ? 1 + 0.06 * Math.abs(Math.sin(t * Math.PI * 2)) : 1})` }}>
                <svg width={D} height={D} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", filter: `drop-shadow(0 0 18px ${col})` }}>
                    <circle cx={D / 2} cy={D / 2} r={R} fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.12)" strokeWidth={sw} />
                    <circle cx={D / 2} cy={D / 2} r={R} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * el} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: D * 0.56, fontWeight: 700, color: "#fff", textShadow: `0 0 40px ${col}`, transform: `scale(${t >= T.cdStart ? interpolate(slam, [0, 1], [1.9, 1]) : 1})` }}>{ar(left)}</div>
            </div>
            <div style={{ fontSize: 50 * Math.max(L.s, 0.85), fontWeight: 700, lineHeight: 1.45, color: "#fff" }}>
                اكتب إجابتك
                <br />
                <span style={{ color: ACCENT }}>في التعليقات 👇</span>
            </div>
        </div>
    );
};

// ---------- reveal ----------

const RevealFx: React.FC<{ L: Layout; p: QuizProps }> = ({ L, p }) => {
    const { t } = useT();
    const { T, q } = p;
    const d = t - T.reveal;
    if (d < 0 || d > 3) return null;
    const b = L.opts(q.answer, q.options.length);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const colors = [ACCENT, "#ffd24a", GREEN, "#fff", "#86efac", "#ff5e8a"];
    const k = Math.max(L.s, 0.8);
    return (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
            <AbsoluteFill style={{ background: "#fff", opacity: 0.75 * (1 - prog(d, 0, 0.28)) }} />
            {[0, 0.12].map((lag, j) => {
                const p2 = prog(d, lag, lag + 0.7);
                const r = 60 + p2 * 900 * k;
                return <div key={j} style={{ position: "absolute", left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: "50%", border: `${22 * (1 - p2)}px solid ${j ? "#fff" : GREEN}`, opacity: 1 - p2 }} />;
            })}
            {Array.from({ length: 170 }, (_, i) => {
                const ang = -Math.PI / 2 + (random(`ca${i}`) - 0.5) * 2.8;
                const v = (1100 + random(`cv${i}`) * 1500) * k, kk = 1.5 + random(`ck${i}`) * 1.2;
                const e = (1 - Math.exp(-kk * d)) / kk;
                const x = cx + (random(`cx${i}`) - 0.5) * b.w * 0.8 + Math.cos(ang) * v * e;
                const y = cy + Math.sin(ang) * v * e + 1500 * k * d * d * 0.5;
                const w = (14 + random(`cw${i}`) * 16) * k;
                return <div key={i} style={{ position: "absolute", left: x, top: y, width: w, height: w * 0.6, background: colors[i % colors.length], borderRadius: i % 3 ? 3 : 20, opacity: 1 - prog(d, 1.8, 3), transform: `rotate(${random(`cr${i}`) * 360 + d * 700 * (random(`cs${i}`) - 0.5)}deg) scaleY(${Math.cos(d * 10 + i)})` }} />;
            })}
        </AbsoluteFill>
    );
};

const Fact: React.FC<{ L: Layout; p: QuizProps }> = ({ L, p }) => {
    const { sp } = useT();
    const s = sp(p.T.fact, { damping: 12, stiffness: 170 });
    const [h, body] = p.fact;
    const k = Math.max(L.s, 0.8);
    return (
        <div style={{ position: "absolute", left: L.fact.x, top: L.fact.y, width: L.fact.w, minHeight: L.fact.h * 0.8, padding: `${22 * k}px ${40 * k}px`, borderRadius: 26 * k, background: "linear-gradient(180deg, rgba(20,60,38,.96), rgba(10,34,22,.96))", border: `3px solid ${GREEN}`, boxShadow: `0 12px 0 #062313, 0 0 60px ${GREEN}55`, direction: "rtl", transform: `translateY(${interpolate(s, [0, 1], [500, 0])}px) scale(${interpolate(s, [0, 1], [0.8, 1])})`, opacity: clamp(s * 2) }}>
            <div style={{ fontSize: 56 * k, fontWeight: 700, color: "#86efac" }}>{h}</div>
            {body && <div style={{ marginTop: 8 * k, fontSize: (body.length > 90 ? 34 : 40) * k, lineHeight: 1.5, color: "#eafff1" }}>{body}</div>}
        </div>
    );
};

// ---------- end card (single videos) ----------

export const EndCard: React.FC<{ L: Layout; at: number; headline: string; sub?: string; follow: string }> = ({ L, at, headline, sub, follow }) => {
    const { t, sp } = useT();
    if (t < at - 0.05) return null;
    const bg = prog(t, at, at + 0.25);
    const logo = sp(at + 0.05, { damping: 9, stiffness: 120 });
    const words = headline.split(" ");
    const url = sp(at + 0.9, { damping: 8, stiffness: 180 });
    const fol = sp(at + 1.3);
    const shine = (((t - at - 1.2) % 1.6) + 1.6) % 1.6 / 1.6;
    const k = L.s;
    return (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `0 ${70 * k}px ${L.row ? 0 : 180}px`, background: `rgba(7,7,10,${0.94 * bg})`, direction: "rtl" }}>
            <Img src={staticFile("favicon.svg")} style={{ width: 170 * k, height: 170 * k, transform: `scale(${logo}) rotate(${interpolate(logo, [0, 1], [-200, 0])}deg)`, filter: `drop-shadow(0 0 40px ${ACCENT})` }} />
            <div style={{ marginTop: 36 * k, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${22 * k}px`, maxWidth: L.row ? L.w * 0.75 : 900 }}>
                {words.map((w, i) => {
                    const s = sp(at + 0.25 + i * 0.07, { damping: 11, stiffness: 220 });
                    return <span key={i} style={{ display: "inline-block", fontSize: 88 * k, fontWeight: 700, lineHeight: 1.35, color: i >= Math.ceil(words.length / 2) - 1 ? ACCENT : "#fff", opacity: clamp(s * 2), transform: `translateY(${interpolate(s, [0, 1], [80, 0])}px) scale(${interpolate(s, [0, 1], [1.6, 1])})` }}>{w}</span>;
                })}
            </div>
            {sub && <div style={{ marginTop: 20 * k, fontSize: 46 * k, color: "#bbb", opacity: clamp(sp(at + 0.7) * 2) }}>{sub}</div>}
            <div style={{ position: "relative", overflow: "hidden", marginTop: 50 * k, padding: `${26 * k}px ${60 * k}px`, borderRadius: 24 * k, background: ACCENT, color: "#000", fontWeight: 700, fontSize: 72 * k, direction: "ltr", boxShadow: "0 12px 0 #8a4600", transform: `scale(${url * (1 + 0.03 * Math.sin(t * 6))})` }}>
                quiz.elhellal.com
                <div style={{ position: "absolute", top: 0, bottom: 0, width: 120 * k, left: `${-20 + shine * 140}%`, background: "linear-gradient(90deg, transparent, rgba(255,255,255,.7), transparent)", transform: "skewX(-20deg)" }} />
            </div>
            <div style={{ marginTop: 40 * k, fontSize: 48 * k, fontWeight: 700, opacity: clamp(fol * 2), transform: `translateY(${interpolate(fol, [0, 1], [40, 0])}px)` }}>
                {follow} <span style={{ display: "inline-block", transform: `rotate(${Math.sin(t * 14) * 18 * clamp(fol)}deg)` }}>🔔</span>
            </div>
        </AbsoluteFill>
    );
};

// ---------- one question ----------

export const Quiz: React.FC<QuizProps> = (p) => {
    const { t } = useT();
    const { T } = p;
    const L = layout(p.format);
    const hits: [number, number][] = [
        ...(p.counter ? [[0.12, 0.8]] : [[0.15, 0.5], [0.31, 0.5], [0.47, 0.5]]) as [number, number][],
        ...T.optsIn.map((a) => [a + 0.12, 0.35] as [number, number]),
        ...Array.from({ length: T.cdLen }, (_, i) => [T.cdStart + i, i >= T.cdLen - 2 ? 0.45 : 0.2] as [number, number]),
        [T.reveal, 1.4], [T.cta, 0.6],
    ];
    const sh = shake(t, hits);
    // Slow push-in during the countdown, a punch on the reveal, then settle.
    const push = t < T.reveal ? 1 + 0.045 * Math.pow(prog(t, T.cdStart, T.reveal), 1.5) : 1.045 - 0.045 * prog(t, T.reveal, T.reveal + 0.5) + 0.03 * Math.exp(-(t - T.reveal) * 10);
    const inGame = t >= T.qIn - 0.2 && t < T.cta + 0.4;
    const tense = t >= T.cdStart && t < T.reveal ? prog(t, T.cdStart + T.cdLen * 0.55, T.reveal) : 0;
    const won = t >= T.reveal && t < T.cta ? 1 - prog(t, T.reveal + 1.5, T.end) : 0;
    const spin = t > T.cdStart ? (Math.min(t, T.reveal) - T.cdStart) * 30 : 0;
    return (
        <AbsoluteFill style={{ fontFamily: "ROM, 'Geeza Pro', sans-serif", color: "#fff", overflow: "hidden" }}>
            <Background L={L} tint={p.tint} tense={tense} won={won} spinBoost={spin} />
            <AbsoluteFill style={{ transform: `translate(${sh.x * L.s}px, ${sh.y * L.s}px) rotate(${sh.r}deg) scale(${push})`, transformOrigin: "50% 50%" }}>
                {t < T.qIn + 0.1 && (p.counter ? <CounterSlam L={L} i={p.counter.i} n={p.counter.n} end={T.qIn} /> : p.hook ? <Hook L={L} lines={p.hook} end={T.qIn} /> : null)}
                {inGame && (
                    <>
                        <Question L={L} p={p} />
                        <Options L={L} p={p} />
                        <Timer L={L} T={T} />
                        {t >= T.fact - 0.05 && <Fact L={L} p={p} />}
                        <RevealFx L={L} p={p} />
                    </>
                )}
            </AbsoluteFill>
            <Hud L={L} p={p} />
            {!p.counter && <EndCard L={L} at={T.cta} headline="كم سؤالاً متتالياً تستطيع أن تجيب عليه؟" follow="تابعنا ليصلك سؤال كل يوم" />}
        </AbsoluteFill>
    );
};
